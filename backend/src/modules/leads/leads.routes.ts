import { Router } from "express";
import fs from "fs";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import {
  ActivityType,
  LeadSource,
  LeadStatus,
  NotificationType,
  PipelineStage,
  Priority,
  Prisma,
  PropertyType,
  Role,
} from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { badRequest, forbidden, HttpError, notFound } from "../../lib/errors";
import { resolveMediaUrl } from "../../lib/media";
import { maskPhone } from "../../lib/mask";
import { toCsv } from "../../lib/csv";
import { requireWebhookSecret, verifyMetaSignature } from "../../lib/webhookAuth";
import { env } from "../../config/env";
import { AuthUser, requireAuth, requireRole, salesTeam } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { fileUpload } from "../../middleware/upload";
import { logActivity } from "../../services/activity.service";
import { notify } from "../../services/notification.service";
import { audit } from "../../services/audit.service";
import { matchPropertiesForLead } from "../../services/matching.service";
import { renderTemplate, whatsappProvider } from "../../services/whatsapp.service";
import { runStageAutomation } from "../../services/pipelineAutomation.service";
import {
  assignSchema,
  captureLeadSchema,
  changeStageSchema,
  createLeadSchema,
  followUpSchema,
  noteSchema,
  sendWhatsAppSchema,
  sharePartnerSchema,
  shortlistSchema,
  stageToStatus,
  statusToStage,
  updateLeadSchema,
} from "./leads.schemas";

const router = Router();

const leadInclude = {
  assignedTo: { select: { id: true, name: true, email: true } },
  partnerCompany: { select: { id: true, name: true } },
} satisfies Prisma.LeadInclude;

const SORTABLE_FIELDS = new Set(["createdAt", "updatedAt", "followUpAt", "fullName", "budgetMax", "priority", "status", "stage"]);

/** Return the value only if it is a member of the enum; invalid values are ignored instead of crashing the query. */
function asEnum<T extends Record<string, string>>(enumObj: T, value?: string): T[keyof T] | undefined {
  return value && Object.values(enumObj).includes(value) ? (value as T[keyof T]) : undefined;
}

/** Visibility scope: executives see their own leads, partners see leads shared with them. */
function scopeFor(user: AuthUser): Prisma.LeadWhereInput {
  if (user.role === Role.SUPER_ADMIN || user.role === Role.SALES_MANAGER) return {};
  if (user.role === Role.PARTNER_USER) {
    return { partnerShares: { some: { partnerId: user.partnerCompanyId ?? "__none__" } } };
  }
  return { assignedToId: user.id };
}

async function getLeadScoped(id: string, user: AuthUser) {
  const lead = await prisma.lead.findFirst({
    where: { AND: [{ id }, scopeFor(user)] },
    include: leadInclude,
  });
  if (!lead) throw notFound("Lead");
  return lead;
}

/** Partner users get masked client numbers everywhere; the audited reveal endpoint
 * (POST /partners/shares/:id/reveal-phone) is the only way to see the real digits. */
function maskForPartner<T extends { mobile: string; whatsappNumber: string | null }>(lead: T, user: AuthUser): T {
  if (user.role !== Role.PARTNER_USER) return lead;
  return {
    ...lead,
    mobile: maskPhone(lead.mobile),
    whatsappNumber: lead.whatsappNumber ? maskPhone(lead.whatsappNumber) : null,
  };
}

// ── Public capture endpoint (visa form / website form) — no auth ────
// Simple in-memory rate limit: 20 submissions per IP per 10 minutes.
const captureHits = new Map<string, { count: number; resetAt: number }>();
function captureRateLimit(req: { ip?: string }, _res: unknown, next: (err?: unknown) => void) {
  const now = Date.now();
  const key = req.ip ?? "unknown";
  const entry = captureHits.get(key);
  if (!entry || entry.resetAt < now) {
    captureHits.set(key, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return next();
  }
  entry.count++;
  if (entry.count > 20) return next(new HttpError(429, "Too many submissions, please try again later"));
  next();
}

router.post("/capture", captureRateLimit, validate(captureLeadSchema), async (req, res, next) => {
  try {
    const { email, ...rest } = req.body;
    const lead = await prisma.lead.create({
      data: { ...rest, email: email || null, whatsappNumber: rest.whatsappNumber || rest.mobile },
    });
    await logActivity(lead.id, null, ActivityType.LEAD_CREATED, `Lead captured from ${lead.source}`);
    // Alert all managers so the lead gets assigned quickly
    const managers = await prisma.user.findMany({
      where: { role: { in: [Role.SALES_MANAGER, Role.SUPER_ADMIN] }, isActive: true },
    });
    await Promise.all(
      managers.map((m) =>
        notify({
          userId: m.id,
          type: NotificationType.GENERAL,
          title: `New ${lead.source.replace("_", " ").toLowerCase()} lead: ${lead.fullName}`,
          meta: { leadId: lead.id },
        })
      )
    );
    res.status(201).json({ data: { id: lead.id }, message: "Lead received" });
  } catch (err) {
    next(err);
  }
});

// ── Omnichannel inbound webhooks — no auth, secret/signature-verified ────────
// Shared creation path so every channel gets the same manager-alert + activity-log treatment.
async function createWebhookLead(data: {
  fullName: string; mobile: string; email?: string | null; source: keyof typeof LeadSource;
  requirementNotes?: string | null; whatsappNumber?: string | null;
}) {
  const lead = await prisma.lead.create({
    data: {
      fullName: data.fullName,
      mobile: data.mobile,
      whatsappNumber: data.whatsappNumber || data.mobile,
      email: data.email || null,
      requirementNotes: data.requirementNotes || null,
      source: LeadSource[data.source],
    },
  });
  await logActivity(lead.id, null, ActivityType.LEAD_CREATED, `Lead captured from ${lead.source}`);
  const managers = await prisma.user.findMany({
    where: { role: { in: [Role.SALES_MANAGER, Role.SUPER_ADMIN] }, isActive: true },
  });
  await Promise.all(
    managers.map((m) =>
      notify({
        userId: m.id,
        type: NotificationType.GENERAL,
        title: `New ${lead.source.replace("_", " ").toLowerCase()} lead: ${lead.fullName}`,
        meta: { leadId: lead.id },
      })
    )
  );
  return lead;
}

// Generic website form webhook: contact forms, CTA pop-ups, co-founder profile sections, etc.
// The exact JSON shape varies by widget, so field names are matched loosely.
const websiteWebhookSchema = z.object({
  name: z.string().optional(),
  fullName: z.string().optional(),
  phone: z.string().optional(),
  mobile: z.string().optional(),
  email: z.string().optional(),
  message: z.string().optional(),
  formName: z.string().optional(),
}).refine((d) => !!(d.name || d.fullName), { message: "name (or fullName) is required" })
  .refine((d) => !!(d.phone || d.mobile), { message: "phone (or mobile) is required" });

router.post(
  "/webhook/website",
  requireWebhookSecret(() => env.leadWebhookSecret),
  validate(websiteWebhookSchema),
  async (req, res, next) => {
    try {
      const b = req.body as z.infer<typeof websiteWebhookSchema>;
      const lead = await createWebhookLead({
        fullName: (b.name || b.fullName)!,
        mobile: (b.phone || b.mobile)!,
        email: b.email,
        source: "WEBSITE_FORM",
        requirementNotes: [b.formName ? `Form: ${b.formName}` : null, b.message || null].filter(Boolean).join(" — ") || null,
      });
      res.status(201).json({ data: { id: lead.id }, message: "Lead received" });
    } catch (err) {
      next(err);
    }
  }
);

// WhatsApp click-to-chat: the website's "Chat on WhatsApp" button relays the click here.
const whatsappClickSchema = z.object({
  phone: z.string().min(5),
  sourcePage: z.string().optional(),
});

router.post(
  "/webhook/whatsapp-click",
  requireWebhookSecret(() => env.leadWebhookSecret),
  validate(whatsappClickSchema),
  async (req, res, next) => {
    try {
      const { phone, sourcePage } = req.body as z.infer<typeof whatsappClickSchema>;
      const lead = await createWebhookLead({
        fullName: `WhatsApp enquiry (${phone})`,
        mobile: phone,
        source: "WHATSAPP",
        requirementNotes: sourcePage ? `Click-to-chat from: ${sourcePage}` : "Click-to-chat",
      });
      res.status(201).json({ data: { id: lead.id }, message: "Lead received" });
    } catch (err) {
      next(err);
    }
  }
);

// Meta Lead Ads (Facebook/Instagram). GET = webhook verification handshake; POST = lead event.
router.get("/webhook/meta", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && env.meta.verifyToken && token === env.meta.verifyToken) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

router.post("/webhook/meta", async (req, res, next) => {
  try {
    if (!env.meta.appSecret || !env.meta.pageAccessToken) return res.sendStatus(503);
    const signature = req.header("x-hub-signature-256");
    if (!verifyMetaSignature(req.rawBody, signature, env.meta.appSecret)) return res.sendStatus(401);

    const entries = (req.body?.entry ?? []) as { changes?: { value?: { leadgen_id?: string } }[] }[];
    const leadgenIds = entries.flatMap((e) => e.changes ?? []).map((c) => c.value?.leadgen_id).filter(Boolean) as string[];

    for (const leadgenId of leadgenIds) {
      try {
        const fdRes = await fetch(`${env.meta.graphApiUrl}/${leadgenId}?access_token=${env.meta.pageAccessToken}`);
        const fd = (await fdRes.json()) as { field_data?: { name: string; values: string[] }[] };
        const get = (key: string) => fd.field_data?.find((f) => f.name === key)?.values?.[0];
        const fullName = get("full_name") || [get("first_name"), get("last_name")].filter(Boolean).join(" ");
        const phone = get("phone_number");
        if (!fullName || !phone) continue;
        await createWebhookLead({ fullName, mobile: phone, email: get("email"), source: "META_ADS" });
      } catch (err) {
        console.error(`[leads:webhook:meta] failed to fetch/create lead for ${leadgenId}:`, err instanceof Error ? err.message : err);
      }
    }
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
});

router.use(requireAuth);

// ── CSV export (Super Admin only — bulk data export is a governance control) ──
router.get("/export", requireRole(), async (req, res, next) => {
  try {
    const leads = await prisma.lead.findMany({ where: scopeFor(req.user!), orderBy: { createdAt: "desc" } });
    const csv = toCsv(leads, [
      "id", "fullName", "mobile", "whatsappNumber", "email", "country", "city", "preferredArea",
      "budgetMin", "budgetMax", "currency", "propertyType", "bedrooms", "source", "status", "stage",
      "priority", "followUpAt", "createdAt",
    ]);
    await audit(req.user!.id, "leads_exported", "lead", undefined, { count: leads.length });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

// ── List with filters + pagination ──────────────────────────────────
router.get("/", async (req, res, next) => {
  try {
    const {
      q, status, stage, source, assignedToId, partnerId, propertyType,
      priority, budgetMin, budgetMax, from, to, followUpDue, hasFollowUp,
      page = "1", pageSize = "20", sort = "createdAt:desc",
    } = req.query as Record<string, string>;

    // Follow-up "due" means due by end of today — matches the dashboard widget
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const where: Prisma.LeadWhereInput = {
      AND: [
        scopeFor(req.user!),
        q
          ? {
              OR: [
                { fullName: { contains: q, mode: "insensitive" } },
                { mobile: { contains: q } },
                { email: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
        { status: asEnum(LeadStatus, status) },
        { stage: asEnum(PipelineStage, stage) },
        { source: asEnum(LeadSource, source) },
        assignedToId ? { assignedToId } : {},
        partnerId ? { partnerShares: { some: { partnerId } } } : {},
        { propertyType: asEnum(PropertyType, propertyType) },
        { priority: asEnum(Priority, priority) },
        budgetMin ? { budgetMax: { gte: Number(budgetMin) } } : {},
        budgetMax ? { budgetMin: { lte: Number(budgetMax) } } : {},
        from ? { createdAt: { gte: new Date(from) } } : {},
        to ? { createdAt: { lte: new Date(to) } } : {},
        followUpDue === "true" ? { followUpAt: { lte: endOfToday }, status: { notIn: ["CONVERTED", "CLOSED_LOST", "INVALID"] } } : {},
        // Site Visits & Appts view: any lead with a scheduled follow-up/visit, past or future
        hasFollowUp === "true" ? { followUpAt: { not: null }, status: { notIn: ["CONVERTED", "CLOSED_LOST", "INVALID"] } } : {},
      ],
    };

    const [rawField, dir] = sort.split(":");
    const field = SORTABLE_FIELDS.has(rawField) ? rawField : "createdAt";
    const take = Math.min(Number(pageSize) || 20, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const [total, data] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        include: leadInclude,
        orderBy: { [field || "createdAt"]: dir === "asc" ? "asc" : "desc" },
        skip,
        take,
      }),
    ]);
    res.json({ data: data.map((l) => maskForPartner(l, req.user!)), total, page: Number(page), pageSize: take });
  } catch (err) {
    next(err);
  }
});

// Kanban board: leads grouped by stage
router.get("/board", async (req, res, next) => {
  try {
    const leads = await prisma.lead.findMany({
      where: scopeFor(req.user!),
      include: leadInclude,
      orderBy: { updatedAt: "desc" },
      take: 500,
    });
    const board: Record<string, typeof leads> = {};
    for (const stage of Object.values(PipelineStage)) board[stage] = [];
    for (const lead of leads) board[lead.stage].push(maskForPartner(lead, req.user!));
    res.json({ data: board });
  } catch (err) {
    next(err);
  }
});

// ── Create ───────────────────────────────────────────────────────────
router.post("/", requireRole(...salesTeam), validate(createLeadSchema), async (req, res, next) => {
  try {
    const { email, ...rest } = req.body;
    const lead = await prisma.lead.create({
      data: { ...rest, email: email || null, createdById: req.user!.id },
      include: leadInclude,
    });
    await logActivity(lead.id, req.user!.id, ActivityType.LEAD_CREATED, "Lead created manually");
    if (lead.assignedToId && lead.assignedToId !== req.user!.id) {
      await notify({
        userId: lead.assignedToId,
        type: NotificationType.LEAD_ASSIGNED,
        title: `New lead assigned: ${lead.fullName}`,
        meta: { leadId: lead.id },
        email: true,
      });
    }
    res.status(201).json({ data: lead });
  } catch (err) {
    next(err);
  }
});

// ── CSV import (columns: fullName,mobile,email,country,city,budgetMin,budgetMax,propertyType,bedrooms,visaType) ──
router.post("/import", requireRole(...salesTeam), fileUpload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) throw badRequest("CSV file is required (field name: file)");
    const rows: Record<string, string>[] = parse(fs.readFileSync(req.file.path), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
    let created = 0;
    const errors: { row: number; message: string }[] = [];
    for (const [i, row] of rows.entries()) {
      try {
        if (!row.fullName || !row.mobile) throw new Error("fullName and mobile are required");
        await prisma.lead.create({
          data: {
            fullName: row.fullName,
            mobile: row.mobile,
            whatsappNumber: row.whatsappNumber || row.mobile,
            email: row.email || null,
            country: row.country || null,
            city: row.city || null,
            preferredArea: row.preferredArea || null,
            budgetMin: row.budgetMin ? Number(row.budgetMin) : null,
            budgetMax: row.budgetMax ? Number(row.budgetMax) : null,
            currency: row.currency || "INR",
            propertyType: (row.propertyType as never) || null,
            bedrooms: row.bedrooms ? Number(row.bedrooms) : null,
            visaType: row.visaType || null,
            source: LeadSource.IMPORT,
            createdById: req.user!.id,
          },
        });
        created++;
      } catch (e) {
        errors.push({ row: i + 2, message: e instanceof Error ? e.message : "Invalid row" });
      }
    }
    await audit(req.user!.id, "leads_imported", "lead", undefined, { created, failed: errors.length });
    res.json({ created, failed: errors.length, errors: errors.slice(0, 20) });
  } catch (err) {
    next(err);
  }
});

// ── Bulk offline-campaign import (columns: Name,Phone,Address only) ──────────
router.post("/import-basic", requireRole(...salesTeam), fileUpload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) throw badRequest("CSV file is required (field name: file)");
    const rows: Record<string, string>[] = parse(fs.readFileSync(req.file.path), {
      columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
    });
    let created = 0;
    const errors: { row: number; message: string }[] = [];
    for (const [i, row] of rows.entries()) {
      try {
        if (!row.name || !row.phone) throw new Error("Name and Phone are required");
        await prisma.lead.create({
          data: {
            fullName: row.name,
            mobile: row.phone,
            whatsappNumber: row.phone,
            requirementNotes: row.address ? `Address: ${row.address}` : null,
            source: LeadSource.IMPORT,
            createdById: req.user!.id,
          },
        });
        created++;
      } catch (e) {
        errors.push({ row: i + 2, message: e instanceof Error ? e.message : "Invalid row" });
      }
    }
    await audit(req.user!.id, "leads_imported_basic", "lead", undefined, { created, failed: errors.length });
    res.json({ created, failed: errors.length, errors: errors.slice(0, 20) });
  } catch (err) {
    next(err);
  }
});

// ── Detail ───────────────────────────────────────────────────────────
router.get("/:id", async (req, res, next) => {
  try {
    const lead = await getLeadScoped(req.params.id, req.user!);

    // Partner users get a redacted view: no internal notes, WhatsApp logs,
    // pipeline history, or shares belonging to other partner companies.
    if (req.user!.role === Role.PARTNER_USER) {
      const partnerShares = await prisma.partnerLeadShare.findMany({
        where: { leadId: lead.id, partnerId: req.user!.partnerCompanyId ?? "__none__" },
        include: { partner: { select: { id: true, name: true } }, sharedBy: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      });
      return res.json({
        data: {
          ...maskForPartner(lead, req.user!),
          notes: [],
          activities: [],
          pipelineHistory: [],
          whatsappLogs: [],
          partnerShares,
          shortlist: [],
        },
      });
    }

    const [notes, activities, pipelineHistory, whatsappLogs, partnerShares, matches] = await Promise.all([
      prisma.leadNote.findMany({
        where: { leadId: lead.id },
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.leadActivity.findMany({
        where: { leadId: lead.id },
        include: { actor: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.pipelineHistory.findMany({
        where: { leadId: lead.id },
        include: { changedBy: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.whatsAppLog.findMany({
        where: { leadId: lead.id },
        include: { sentBy: { select: { name: true } }, template: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.partnerLeadShare.findMany({
        where: { leadId: lead.id },
        include: { partner: { select: { id: true, name: true } }, sharedBy: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.propertyMatch.findMany({
        where: { leadId: lead.id },
        include: { property: { include: { images: true } } },
        orderBy: { score: "desc" },
      }),
    ]);
    res.json({ data: { ...lead, notes, activities, pipelineHistory, whatsappLogs, partnerShares, shortlist: matches } });
  } catch (err) {
    next(err);
  }
});

// ── Update ───────────────────────────────────────────────────────────
router.put("/:id", validate(updateLeadSchema), async (req, res, next) => {
  try {
    const existing = await getLeadScoped(req.params.id, req.user!);
    if (req.user!.role === Role.PARTNER_USER) throw forbidden("Partners cannot edit lead details");
    const { email, status, ...rest } = req.body;
    const data: Prisma.LeadUpdateInput = { ...rest };
    if (email !== undefined) data.email = email || null;
    if (status && status !== existing.status) {
      data.status = status;
      const impliedStage = statusToStage[status as LeadStatus];
      if (impliedStage && impliedStage !== existing.stage) {
        data.stage = impliedStage;
        await prisma.pipelineHistory.create({
          data: { leadId: existing.id, fromStage: existing.stage, toStage: impliedStage, changedById: req.user!.id },
        });
      }
      if (status === LeadStatus.CONVERTED) data.convertedAt = new Date();
      await logActivity(existing.id, req.user!.id, ActivityType.STATUS_CHANGED, `Status changed to ${status}`);
    }
    const lead = await prisma.lead.update({ where: { id: existing.id }, data, include: leadInclude });
    await logActivity(lead.id, req.user!.id, ActivityType.LEAD_UPDATED, "Lead details updated");
    if (data.stage && data.stage !== existing.stage) {
      await runStageAutomation(lead, data.stage as PipelineStage, { id: req.user!.id, name: req.user!.name });
    }
    res.json({ data: lead });
  } catch (err) {
    next(err);
  }
});

// ── Assign / cross-assign ─────────────────────────────────────────────
// Managers can assign any lead to any staff member. Executives can transfer a lead
// they currently hold to a peer (or back to a manager) — but not touch a colleague's lead.
router.post("/:id/assign", requireRole(...salesTeam), validate(assignSchema), async (req, res, next) => {
  try {
    if (req.user!.role === Role.SALES_EXECUTIVE) {
      const existing = await getLeadScoped(req.params.id, req.user!);
      if (existing.assignedToId !== req.user!.id) throw forbidden("You can only transfer leads currently assigned to you");
    }
    const staff = await prisma.user.findUnique({ where: { id: req.body.assignedToId } });
    if (!staff || !staff.isActive) throw badRequest("Selected staff member is not available");
    if (!salesTeam.includes(staff.role)) throw badRequest("Leads can only be assigned to sales staff");
    const lead = await prisma.lead.update({
      where: { id: req.params.id },
      data: { assignedToId: staff.id },
      include: leadInclude,
    });
    await logActivity(lead.id, req.user!.id, ActivityType.ASSIGNED,
      req.user!.id === staff.id ? `Assigned to ${staff.name}` : `Transferred to ${staff.name} by ${req.user!.name}`);
    await notify({
      userId: staff.id,
      type: NotificationType.LEAD_ASSIGNED,
      title: `New lead assigned: ${lead.fullName}`,
      body: `${lead.fullName} (${lead.mobile}) — ${lead.city ?? "location n/a"}`,
      meta: { leadId: lead.id },
      email: true,
    });
    res.json({ data: lead });
  } catch (err) {
    next(err);
  }
});

// ── Change pipeline stage (Kanban drag & drop) ───────────────────────
router.post("/:id/change-stage", validate(changeStageSchema), async (req, res, next) => {
  try {
    const existing = await getLeadScoped(req.params.id, req.user!);
    if (req.user!.role === Role.PARTNER_USER) throw forbidden();
    const stage: PipelineStage = req.body.stage;
    if (stage === existing.stage) return res.json({ data: existing });
    const impliedStatus = stageToStatus[stage];
    const lead = await prisma.lead.update({
      where: { id: existing.id },
      data: {
        stage,
        ...(impliedStatus ? { status: impliedStatus } : {}),
        ...(stage === PipelineStage.REGISTRATION ? { convertedAt: new Date() } : {}),
      },
      include: leadInclude,
    });
    await prisma.pipelineHistory.create({
      data: { leadId: lead.id, fromStage: existing.stage, toStage: stage, changedById: req.user!.id },
    });
    await logActivity(lead.id, req.user!.id, ActivityType.STAGE_CHANGED, `Moved from ${existing.stage} to ${stage}`);
    await runStageAutomation(lead, stage, { id: req.user!.id, name: req.user!.name });
    res.json({ data: lead });
  } catch (err) {
    next(err);
  }
});

// ── Notes & follow-ups ───────────────────────────────────────────────
router.post("/:id/add-note", validate(noteSchema), async (req, res, next) => {
  try {
    if (req.user!.role === Role.PARTNER_USER) throw forbidden("Partners update leads via the share status");
    const lead = await getLeadScoped(req.params.id, req.user!);
    const note = await prisma.leadNote.create({
      data: { leadId: lead.id, authorId: req.user!.id, body: req.body.body },
      include: { author: { select: { name: true } } },
    });
    await logActivity(lead.id, req.user!.id, ActivityType.NOTE_ADDED, "Note added");
    res.status(201).json({ data: note });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/follow-up", validate(followUpSchema), async (req, res, next) => {
  try {
    if (req.user!.role === Role.PARTNER_USER) throw forbidden();
    const lead = await getLeadScoped(req.params.id, req.user!);
    const updated = await prisma.lead.update({
      where: { id: lead.id },
      data: { followUpAt: req.body.followUpAt },
      include: leadInclude,
    });
    await logActivity(lead.id, req.user!.id, ActivityType.FOLLOW_UP_SET,
      `Follow-up scheduled for ${req.body.followUpAt.toISOString().slice(0, 16).replace("T", " ")}`);
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// ── Property matching ────────────────────────────────────────────────
router.post("/:id/match-properties", async (req, res, next) => {
  try {
    if (req.user!.role === Role.PARTNER_USER) throw forbidden();
    const lead = await getLeadScoped(req.params.id, req.user!);
    const matches = await matchPropertiesForLead(lead);
    res.json({
      data: matches.map((m) => ({ property: m.property, score: m.score, reasons: m.reasons })),
    });
  } catch (err) {
    next(err);
  }
});

// Save a shortlist of properties against the lead
router.post("/:id/shortlist", validate(shortlistSchema), async (req, res, next) => {
  try {
    if (req.user!.role === Role.PARTNER_USER) throw forbidden();
    const lead = await getLeadScoped(req.params.id, req.user!);
    const matches = await matchPropertiesForLead(lead, 100);
    const scoreByProperty = new Map(matches.map((m) => [m.property.id, m.score]));
    await Promise.all(
      (req.body.propertyIds as string[]).map((propertyId) =>
        prisma.propertyMatch.upsert({
          where: { leadId_propertyId: { leadId: lead.id, propertyId } },
          create: { leadId: lead.id, propertyId, score: scoreByProperty.get(propertyId) ?? 0, savedById: req.user!.id },
          update: { score: scoreByProperty.get(propertyId) ?? 0 },
        })
      )
    );
    await logActivity(lead.id, req.user!.id, ActivityType.PROPERTY_MATCHED,
      `${req.body.propertyIds.length} properties shortlisted`);
    res.json({ message: "Shortlist saved" });
  } catch (err) {
    next(err);
  }
});

// ── WhatsApp property sharing ────────────────────────────────────────
router.post("/:id/send-whatsapp", validate(sendWhatsAppSchema), async (req, res, next) => {
  try {
    const lead = await getLeadScoped(req.params.id, req.user!);
    if (req.user!.role === Role.PARTNER_USER) throw forbidden();
    const toNumber = lead.whatsappNumber || lead.mobile;
    if (!toNumber) throw badRequest("Lead has no WhatsApp number");

    const { propertyIds, templateKey, customMessage } = req.body as {
      propertyIds: string[]; templateKey?: string; customMessage?: string;
    };

    const properties = propertyIds.length
      ? await prisma.property.findMany({
          where: { id: { in: propertyIds } },
          include: { images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1 } },
        })
      : [];

    const propertyBlock = properties
      .map((p) => {
        const img = resolveMediaUrl(p.images[0]?.url);
        return [
          `🏠 *${p.title}*`,
          `💰 ${p.currency} ${Number(p.price).toLocaleString("en-US")}`,
          `📍 ${p.location}`,
          p.description ? p.description.slice(0, 160) : null,
          img ? `🖼 ${img}` : null,
        ].filter(Boolean).join("\n");
      })
      .join("\n\n");

    let body: string;
    const template = templateKey
      ? await prisma.whatsAppTemplate.findFirst({ where: { key: templateKey, isActive: true } })
      : null;
    if (template) {
      body = renderTemplate(template.body, {
        name: lead.fullName,
        agent: req.user!.name,
        properties: propertyBlock,
      });
    } else if (customMessage) {
      body = propertyBlock ? `${customMessage}\n\n${propertyBlock}` : customMessage;
    } else if (propertyBlock) {
      body = `Hi ${lead.fullName}, here are some properties matching your requirements:\n\n${propertyBlock}\n\nContact: ${req.user!.name}`;
    } else {
      throw badRequest("Provide propertyIds, a templateKey, or a customMessage");
    }

    const result = await whatsappProvider.sendText(toNumber, body);

    const log = await prisma.whatsAppLog.create({
      data: {
        leadId: lead.id,
        toNumber,
        templateId: template?.id,
        body,
        propertyIds,
        sentById: req.user!.id,
        status: result.status,
        providerMessageId: result.providerMessageId,
        error: result.error,
      },
    });

    if (result.status !== "FAILED" && properties.length) {
      // Workflow 1: mark shared, move stage, auto-create follow-up in 2 days
      const followUpAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          status: LeadStatus.PROPERTY_SHARED,
          stage: PipelineStage.PROPERTY_SHARED,
          followUpAt: lead.followUpAt ?? followUpAt,
        },
      });
      if (lead.stage !== PipelineStage.PROPERTY_SHARED) {
        await prisma.pipelineHistory.create({
          data: { leadId: lead.id, fromStage: lead.stage, toStage: PipelineStage.PROPERTY_SHARED, changedById: req.user!.id },
        });
      }
      await prisma.propertyMatch.updateMany({
        where: { leadId: lead.id, propertyId: { in: propertyIds } },
        data: { sharedViaWhatsApp: true },
      });
      if (lead.assignedToId) {
        await notify({
          userId: lead.assignedToId,
          type: NotificationType.PROPERTY_SENT,
          title: `${properties.length} propert${properties.length === 1 ? "y" : "ies"} sent to ${lead.fullName}`,
          meta: { leadId: lead.id },
        });
      }
    }

    await logActivity(lead.id, req.user!.id, ActivityType.WHATSAPP_SENT,
      properties.length
        ? `WhatsApp sent with ${properties.length} propert${properties.length === 1 ? "y" : "ies"}`
        : "WhatsApp message sent",
      { propertyIds, status: result.status });

    if (result.status === "FAILED") {
      return res.status(502).json({ data: log, message: `WhatsApp send failed: ${result.error ?? "provider error"}` });
    }
    res.status(201).json({ data: log });
  } catch (err) {
    next(err);
  }
});

// ── Level 2 partner distribution ─────────────────────────────────────
router.post("/:id/share-partner", validate(sharePartnerSchema), async (req, res, next) => {
  try {
    const lead = await getLeadScoped(req.params.id, req.user!);
    if (req.user!.role === Role.PARTNER_USER) throw forbidden();
    const partner = await prisma.partnerCompany.findUnique({ where: { id: req.body.partnerId } });
    if (!partner || partner.status !== "ACTIVE") throw badRequest("Partner company not found or inactive");
    const existing = await prisma.partnerLeadShare.findFirst({
      where: { leadId: lead.id, partnerId: partner.id, status: { notIn: ["REJECTED", "CLOSED"] } },
    });
    if (existing) throw badRequest(`This lead is already shared with ${partner.name}`);

    const share = await prisma.partnerLeadShare.create({
      data: {
        leadId: lead.id,
        partnerId: partner.id,
        sharedById: req.user!.id,
        notesShared: req.body.notesShared,
      },
      include: { partner: { select: { id: true, name: true } } },
    });
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        partnerCompanyId: partner.id,
        status: LeadStatus.SHARED_TO_PARTNER,
        stage: PipelineStage.SHARED_TO_PARTNER,
      },
    });
    await prisma.pipelineHistory.create({
      data: { leadId: lead.id, fromStage: lead.stage, toStage: PipelineStage.SHARED_TO_PARTNER, changedById: req.user!.id },
    });
    await logActivity(lead.id, req.user!.id, ActivityType.SHARED_TO_PARTNER, `Shared with ${partner.name}`);

    // Send the lead's requirement + shortlisted properties to the partner on WhatsApp
    const partnerNumber = partner.whatsapp || partner.phone;
    if (req.body.sendWhatsApp && partnerNumber) {
      const shortlist = await prisma.propertyMatch.findMany({
        where: { leadId: lead.id },
        include: {
          property: { include: { images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1 } } },
        },
        orderBy: { score: "desc" },
        take: 5,
      });
      const clientUrl = env.clientUrl;
      const money = (v: unknown) => Number(v).toLocaleString("en-IN");
      // Requirement only — client contact details stay inside the CRM
      const lines: string[] = [
        `🤝 *New lead referral from RealRest*`,
        `👤 ${lead.fullName}`,
        `📍 ${[lead.preferredArea, lead.city].filter(Boolean).join(", ") || "Location not specified"}`,
        `🏠 ${lead.propertyType ?? "Any type"}${lead.bedrooms != null ? ` · ${lead.bedrooms}BR` : ""}`,
        ...(lead.budgetMin || lead.budgetMax
          ? [`💰 ${lead.currency} ${[lead.budgetMin && money(lead.budgetMin), lead.budgetMax && money(lead.budgetMax)].filter(Boolean).join(" – ")}`]
          : []),
        ...(req.body.notesShared || lead.requirementNotes ? [`📝 ${req.body.notesShared || lead.requirementNotes}`] : []),
      ];
      if (shortlist.length) {
        lines.push("", "*Suggested properties:*");
        for (const m of shortlist) {
          const p = m.property;
          lines.push(
            [
              `🏠 ${p.title}`,
              `💰 ${p.currency} ${money(p.price)} · 📍 ${p.location}`,
              p.images[0] ? `🖼 ${resolveMediaUrl(p.images[0].url)}` : null,
              clientUrl ? `🔗 ${clientUrl}/properties/${p.id}` : null,
            ].filter(Boolean).join("\n")
          );
        }
      }
      const waResult = await whatsappProvider.sendText(partnerNumber, lines.join("\n"));
      await prisma.whatsAppLog.create({
        data: {
          leadId: lead.id,
          toNumber: partnerNumber,
          body: lines.join("\n"),
          propertyIds: shortlist.map((m) => m.propertyId),
          sentById: req.user!.id,
          status: waResult.status,
          providerMessageId: waResult.providerMessageId,
          error: waResult.error,
        },
      });
      await logActivity(lead.id, req.user!.id, ActivityType.WHATSAPP_SENT,
        `Lead requirement sent to ${partner.name} on WhatsApp${shortlist.length ? ` with ${shortlist.length} propert${shortlist.length === 1 ? "y" : "ies"}` : ""}`);
    }

    // Notify all users of the partner company
    const partnerUsers = await prisma.user.findMany({ where: { partnerCompanyId: partner.id, isActive: true } });
    await Promise.all(
      partnerUsers.map((u) =>
        notify({
          userId: u.id,
          type: NotificationType.LEAD_SHARED_TO_PARTNER,
          title: `New lead shared with your company: ${lead.fullName}`,
          meta: { leadId: lead.id, shareId: share.id },
          email: true,
        })
      )
    );
    res.status(201).json({ data: share });
  } catch (err) {
    next(err);
  }
});

export default router;
