import { Router } from "express";
import { LeadStatus, PipelineStage, Prisma, Role } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);

// The frontend sends bare YYYY-MM-DD dates from a plain <input type="date">, which parse
// to midnight — an inclusive "to" filter using lte against that would only match records
// created at exactly 00:00:00 and silently drop the entire end day. Push "to" to the
// start of the following day and use an exclusive upper bound instead.
// Returned as a plain (un-branded) filter object so it can be spread into a "createdAt"
// clause on any model's where-input, not just Lead's.
function dateRangeFilter(req: { query: Record<string, unknown> }): { gte?: Date; lt?: Date } | undefined {
  const { from, to } = req.query as Record<string, string>;
  if (!from && !to) return undefined;
  const toExclusive = to ? new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000) : undefined;
  return {
    ...(from ? { gte: new Date(from) } : {}),
    ...(toExclusive ? { lt: toExclusive } : {}),
  };
}

function dateRange(req: { query: Record<string, unknown> }): Prisma.LeadWhereInput {
  const filter = dateRangeFilter(req);
  return filter ? { createdAt: filter } : {};
}

// ── Dashboard widgets ────────────────────────────────────────────────
router.get("/dashboard", async (req, res, next) => {
  try {
    const user = req.user!;
    const isManager = user.role === Role.SUPER_ADMIN || user.role === Role.SALES_MANAGER;
    const mine: Prisma.LeadWhereInput = isManager
      ? {}
      : user.role === Role.PARTNER_USER
        ? { partnerShares: { some: { partnerId: user.partnerCompanyId ?? "__none__" } } }
        : { assignedToId: user.id };

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [
      totalLeads, newToday, bySource, byStage, byStaff, propertiesAvailable,
      sharedToday, waSentToday, partnerSharedCount, converted, followUpsDue,
    ] = await Promise.all([
      prisma.lead.count({ where: mine }),
      prisma.lead.count({ where: { ...mine, createdAt: { gte: startOfDay } } }),
      prisma.lead.groupBy({ by: ["source"], where: mine, _count: true }),
      prisma.lead.groupBy({ by: ["stage"], where: mine, _count: true }),
      isManager
        ? prisma.lead.groupBy({ by: ["assignedToId"], where: { assignedToId: { not: null } }, _count: true })
        : Promise.resolve([]),
      prisma.property.count({ where: { status: "AVAILABLE" } }),
      prisma.whatsAppLog.count({
        where: { createdAt: { gte: startOfDay }, propertyIds: { isEmpty: false } },
      }),
      prisma.whatsAppLog.count({ where: { createdAt: { gte: startOfDay } } }),
      prisma.partnerLeadShare.count(),
      prisma.lead.count({ where: { ...mine, status: LeadStatus.CONVERTED } }),
      prisma.lead.count({
        where: {
          ...mine,
          followUpAt: { lte: new Date(new Date().setHours(23, 59, 59, 999)) },
          status: { notIn: ["CONVERTED", "CLOSED_LOST", "INVALID"] },
        },
      }),
    ]);

    const staffIds = byStaff.map((s) => s.assignedToId).filter(Boolean) as string[];
    const staff = staffIds.length
      ? await prisma.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true } })
      : [];
    const staffNames = new Map(staff.map((s) => [s.id, s.name]));

    res.json({
      data: {
        totalLeads,
        newToday,
        propertiesAvailable,
        propertiesSharedToday: sharedToday,
        whatsappSentToday: waSentToday,
        partnerSharedLeads: partnerSharedCount,
        conversionRate: totalLeads ? Math.round((converted / totalLeads) * 1000) / 10 : 0,
        followUpsDueToday: followUpsDue,
        leadsBySource: bySource.map((s) => ({ source: s.source, count: s._count })),
        leadsByStage: byStage.map((s) => ({ stage: s.stage, count: s._count })),
        leadsByStaff: byStaff.map((s) => ({
          staffId: s.assignedToId,
          name: staffNames.get(s.assignedToId!) ?? "Unknown",
          count: s._count,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── Lead source / status / visa report ───────────────────────────────
router.get("/leads", requireRole(Role.SALES_MANAGER), async (req, res, next) => {
  try {
    const where = dateRange(req as never);
    const [bySource, byStatus, visaLeads, lost] = await Promise.all([
      prisma.lead.groupBy({ by: ["source"], where, _count: true }),
      prisma.lead.groupBy({ by: ["status"], where, _count: true }),
      prisma.lead.count({ where: { ...where, OR: [{ source: "VISA_FORM" }, { visaRequired: true }] } }),
      prisma.lead.findMany({
        where: { ...where, status: "CLOSED_LOST" },
        select: { id: true, fullName: true, source: true, assignedTo: { select: { name: true } }, updatedAt: true },
        take: 100,
        orderBy: { updatedAt: "desc" },
      }),
    ]);
    res.json({ data: { bySource, byStatus, visaLeadCount: visaLeads, lostLeads: lost } });
  } catch (err) {
    next(err);
  }
});

// ── Staff performance ────────────────────────────────────────────────
router.get("/staff", requireRole(Role.SALES_MANAGER), async (req, res, next) => {
  try {
    const where = dateRange(req as never);
    const staff = await prisma.user.findMany({
      where: { role: { in: ["SALES_EXECUTIVE", "SALES_MANAGER"] }, isActive: true },
      select: { id: true, name: true },
    });
    const rows = await Promise.all(
      staff.map(async (s) => {
        const [assigned, converted, waSent, shared, siteVisitsCompleted] = await Promise.all([
          prisma.lead.count({ where: { ...where, assignedToId: s.id } }),
          prisma.lead.count({ where: { ...where, assignedToId: s.id, status: "CONVERTED" } }),
          prisma.whatsAppLog.count({ where: { sentById: s.id, ...(where.createdAt ? { createdAt: where.createdAt as never } : {}) } }),
          prisma.partnerLeadShare.count({ where: { sharedById: s.id } }),
          prisma.pipelineHistory.count({
            where: { changedById: s.id, toStage: PipelineStage.SITE_VISIT_COMPLETED, ...(where.createdAt ? { createdAt: where.createdAt as never } : {}) },
          }),
        ]);
        return {
          staffId: s.id,
          name: s.name,
          leadsAssigned: assigned,
          converted,
          conversionRate: assigned ? Math.round((converted / assigned) * 1000) / 10 : 0,
          whatsappSent: waSent,
          partnerShares: shared,
          siteVisitsCompleted,
        };
      })
    );
    res.json({ data: rows.sort((a, b) => b.converted - a.converted) });
  } catch (err) {
    next(err);
  }
});

// ── Partner performance ──────────────────────────────────────────────
router.get("/partners", requireRole(Role.SALES_MANAGER), async (_req, res, next) => {
  try {
    const partners = await prisma.partnerCompany.findMany({ select: { id: true, name: true } });
    const rows = await Promise.all(
      partners.map(async (p) => {
        const [total, byStatus] = await Promise.all([
          prisma.partnerLeadShare.count({ where: { partnerId: p.id } }),
          prisma.partnerLeadShare.groupBy({ by: ["status"], where: { partnerId: p.id }, _count: true }),
        ]);
        const converted = byStatus.find((s) => s.status === "CONVERTED")?._count ?? 0;
        return {
          partnerId: p.id,
          name: p.name,
          leadsReceived: total,
          converted,
          conversionRate: total ? Math.round((converted / total) * 1000) / 10 : 0,
          byStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
        };
      })
    );
    res.json({ data: rows.sort((a, b) => b.leadsReceived - a.leadsReceived) });
  } catch (err) {
    next(err);
  }
});

// ── Monthly lead trend (last 12 months) ──────────────────────────────
router.get("/monthly", requireRole(Role.SALES_MANAGER), async (_req, res, next) => {
  try {
    const rows = await prisma.$queryRaw<{ month: string; total: bigint; converted: bigint; pipelinevalue: string | null }[]>`
      SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month,
             COUNT(*)::bigint AS total,
             COUNT(*) FILTER (WHERE status = 'CONVERTED')::bigint AS converted,
             SUM("budgetMax") AS pipelinevalue
      FROM "Lead"
      WHERE "createdAt" >= now() - interval '12 months'
      GROUP BY 1 ORDER BY 1`;
    res.json({
      data: rows.map((r) => ({
        month: r.month, total: Number(r.total), converted: Number(r.converted),
        pipelineValue: r.pipelinevalue ? Number(r.pipelinevalue) : 0,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ── Property engagement (which listings get traction) ────────────────
router.get("/property-engagement", requireRole(Role.SALES_MANAGER), async (req, res, next) => {
  try {
    const filter = dateRangeFilter(req as never);
    const dateFilter = filter ? { createdAt: filter } : {};
    const [viewCounts, shortlistCounts, properties] = await Promise.all([
      prisma.propertyViewEvent.groupBy({ by: ["propertyId"], where: dateFilter, _count: true }),
      prisma.propertyMatch.groupBy({ by: ["propertyId"], _count: true }),
      prisma.property.findMany({ select: { id: true, title: true, location: true, status: true } }),
    ]);
    const viewsByProperty = new Map(viewCounts.map((v) => [v.propertyId, v._count]));
    const shortlistsByProperty = new Map(shortlistCounts.map((s) => [s.propertyId, s._count]));
    const rows = properties.map((p) => ({
      propertyId: p.id,
      title: p.title,
      location: p.location,
      status: p.status,
      views: viewsByProperty.get(p.id) ?? 0,
      shortlists: shortlistsByProperty.get(p.id) ?? 0,
    }));
    res.json({ data: rows.sort((a, b) => b.views - a.views) });
  } catch (err) {
    next(err);
  }
});

// ── Buyer behavior (repeat inquirers, match ratio, decision timelines) ──
router.get("/buyer-behavior", requireRole(Role.SALES_MANAGER), async (req, res, next) => {
  try {
    const where = dateRange(req as never);
    const [byMobile, converted] = await Promise.all([
      prisma.lead.groupBy({ by: ["mobile"], where, _count: true, having: { mobile: { _count: { gt: 1 } } } }),
      prisma.lead.findMany({
        where: { ...where, status: LeadStatus.CONVERTED, convertedAt: { not: null } },
        select: { id: true, createdAt: true, convertedAt: true, matches: { select: { id: true } } },
      }),
    ]);
    const avgDecisionDays = converted.length
      ? Math.round(
          converted.reduce((sum, l) => sum + (l.convertedAt!.getTime() - l.createdAt.getTime()) / (1000 * 60 * 60 * 24), 0) / converted.length
        )
      : 0;
    const avgShortlistSize = converted.length
      ? Math.round((converted.reduce((sum, l) => sum + l.matches.length, 0) / converted.length) * 10) / 10
      : 0;
    res.json({
      data: {
        repeatInquirers: byMobile.length,
        convertedLeadCount: converted.length,
        avgDecisionDays,
        avgShortlistSize,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
