import { Router } from "express";
import { z } from "zod";
import { ActivityType, NotificationType, PartnerCompanyStatus, PartnerShareStatus, Role } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { forbidden, notFound } from "../../lib/errors";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { audit } from "../../services/audit.service";
import { logActivity } from "../../services/activity.service";
import { notify } from "../../services/notification.service";

const router = Router();
router.use(requireAuth);

const partnerSchema = z.object({
  name: z.string().min(2),
  contactPerson: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  city: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  status: z.nativeEnum(PartnerCompanyStatus).default(PartnerCompanyStatus.ACTIVE),
  notes: z.string().optional().nullable(),
});

router.get("/", async (req, res, next) => {
  try {
    // Partner users only see their own company
    const where =
      req.user!.role === Role.PARTNER_USER ? { id: req.user!.partnerCompanyId ?? "__none__" } : {};
    const partners = await prisma.partnerCompany.findMany({
      where,
      include: { _count: { select: { shares: true, users: true } } },
      orderBy: { name: "asc" },
    });
    res.json({ data: partners });
  } catch (err) {
    next(err);
  }
});

router.post("/", requireRole(Role.SALES_MANAGER), validate(partnerSchema), async (req, res, next) => {
  try {
    const partner = await prisma.partnerCompany.create({
      data: { ...req.body, email: req.body.email || null },
    });
    await audit(req.user!.id, "partner_created", "partner", partner.id, { name: partner.name });
    res.status(201).json({ data: partner });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    if (req.user!.role === Role.PARTNER_USER && req.user!.partnerCompanyId !== req.params.id) {
      throw forbidden();
    }
    const partner = await prisma.partnerCompany.findUnique({
      where: { id: req.params.id },
      include: { users: { select: { id: true, name: true, email: true, isActive: true } } },
    });
    if (!partner) throw notFound("Partner company");
    res.json({ data: partner });
  } catch (err) {
    next(err);
  }
});

router.put("/:id", requireRole(Role.SALES_MANAGER), validate(partnerSchema.partial()), async (req, res, next) => {
  try {
    const partner = await prisma.partnerCompany.update({
      where: { id: req.params.id },
      data: { ...req.body, ...(req.body.email !== undefined ? { email: req.body.email || null } : {}) },
    });
    await audit(req.user!.id, "partner_updated", "partner", partner.id);
    res.json({ data: partner });
  } catch (err) {
    next(err);
  }
});

// Leads shared with a partner (partner portal + manager tracking view)
router.get("/:id/leads", async (req, res, next) => {
  try {
    if (req.user!.role === Role.PARTNER_USER && req.user!.partnerCompanyId !== req.params.id) {
      throw forbidden();
    }
    const shares = await prisma.partnerLeadShare.findMany({
      where: { partnerId: req.params.id },
      include: {
        lead: {
          select: {
            id: true, fullName: true, mobile: true, whatsappNumber: true, email: true,
            city: true, budgetMin: true, budgetMax: true, currency: true,
            propertyType: true, bedrooms: true, visaType: true, status: true,
          },
        },
        sharedBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ data: shares });
  } catch (err) {
    next(err);
  }
});

// Partner-side status update on a shared lead
const shareStatusSchema = z.object({
  status: z.nativeEnum(PartnerShareStatus),
  conversionNote: z.string().optional().nullable(),
  commissionNote: z.string().optional().nullable(),
});

router.put("/shares/:shareId", validate(shareStatusSchema), async (req, res, next) => {
  try {
    const share = await prisma.partnerLeadShare.findUnique({
      where: { id: req.params.shareId },
      include: { lead: true, partner: true },
    });
    if (!share) throw notFound("Shared lead");
    const user = req.user!;
    const isPartnerOwner = user.role === Role.PARTNER_USER && user.partnerCompanyId === share.partnerId;
    const isInternal = user.role !== Role.PARTNER_USER;
    if (!isPartnerOwner && !isInternal) throw forbidden();

    const updated = await prisma.partnerLeadShare.update({
      where: { id: share.id },
      data: req.body,
      include: { partner: { select: { id: true, name: true } } },
    });
    await logActivity(share.leadId, user.id, ActivityType.PARTNER_STATUS_UPDATED,
      `${share.partner.name} updated status to ${req.body.status}`);

    // Notify the internal staff who shared the lead
    if (isPartnerOwner) {
      await notify({
        userId: share.sharedById,
        type: NotificationType.PARTNER_STATUS_UPDATED,
        title: `${share.partner.name} updated "${share.lead.fullName}" to ${req.body.status}`,
        meta: { leadId: share.leadId, shareId: share.id },
      });
    }
    if (req.body.status === PartnerShareStatus.CONVERTED && share.status !== PartnerShareStatus.CONVERTED) {
      await prisma.lead.update({
        where: { id: share.leadId },
        data: { status: "CONVERTED", stage: "CONVERTED", convertedAt: new Date() },
      });
    }
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
