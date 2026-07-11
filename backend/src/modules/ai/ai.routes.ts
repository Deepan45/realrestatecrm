import { Router } from "express";
import { z } from "zod";
import { Prisma, PropertyType, Role } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { badRequest, forbidden, notFound } from "../../lib/errors";
import { AuthUser, requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { askAI } from "../../services/openai.service";

const router = Router();
router.use(requireAuth);
// AI tooling exposes internal client/pricing context — keep it staff-only
router.use((req, _res, next) => (req.user!.role === Role.PARTNER_USER ? next(forbidden()) : next()));

const money = (v: unknown, currency: string) => `${currency} ${Number(v).toLocaleString("en-IN")}`;

async function getProperty(id: string) {
  const property = await prisma.property.findUnique({ where: { id } });
  if (!property) throw notFound("Property");
  return property;
}

/** Lead PII (phone, budget, notes) is scoped the same way it is everywhere else in the
 * app — executives only their own, property staff not at all — so the AI drafting tools
 * can't be used as a side door around the scoping enforced on /leads/:id. */
async function getLead(id: string, user: AuthUser) {
  if (user.role === Role.PROPERTY_STAFF) throw forbidden();
  const where = user.role === Role.SALES_EXECUTIVE ? { id, assignedToId: user.id } : { id };
  const lead = await prisma.lead.findFirst({ where });
  if (!lead) throw notFound("Lead");
  return lead;
}

function propertyBlock(p: Awaited<ReturnType<typeof getProperty>>) {
  return [
    `Title: ${p.title}`,
    `Type: ${p.type} (${p.category})`,
    `Location: ${p.location}${p.address ? `, ${p.address}` : ""}`,
    `Area: ${p.areaSqft ? `${p.areaSqft} sqft` : "n/a"}, Bedrooms: ${p.bedrooms ?? "n/a"}, Bathrooms: ${p.bathrooms ?? "n/a"}`,
    `Furnishing: ${p.furnishing ?? "n/a"}`,
    `Price: ${money(p.price, p.currency)}`,
    `Amenities: ${p.amenities.join(", ") || "none listed"}`,
    p.description ? `Description: ${p.description}` : null,
  ].filter(Boolean).join("\n");
}

function leadBlock(l: Awaited<ReturnType<typeof getLead>>) {
  return [
    `Name: ${l.fullName}`,
    `Looking for: ${l.propertyType ?? "any type"}${l.bedrooms != null ? `, ${l.bedrooms} BR` : ""}`,
    `Preferred area: ${l.preferredArea || l.city || "not specified"}`,
    l.budgetMin || l.budgetMax
      ? `Budget: ${[l.budgetMin, l.budgetMax].filter(Boolean).map((v) => money(v, l.currency)).join(" – ")}`
      : null,
    l.requirementNotes ? `Notes: ${l.requirementNotes}` : null,
  ].filter(Boolean).join("\n");
}

const SYSTEM_PROMPT =
  "You are an AI assistant embedded in RealRest, a real estate CRM used by sales staff in Tamil Nadu, India. " +
  "Write in clear, professional English. Prices are in Indian Rupees (INR) using lakh/crore-friendly phrasing where natural. " +
  "Never invent property or client facts beyond what is given in the context — if information is missing, note that plainly. " +
  "Respect any length limit given exactly — do not run over it. Do not use markdown headers (#, ##, ###), horizontal " +
  "rules (---), tables, or a letter-style greeting/signature (no 'Dear...', no 'Best regards' block) unless the task " +
  "explicitly asks for a formal document — plain paragraphs and simple emoji are enough. This text is often sent " +
  "directly as a WhatsApp message: for emphasis use WhatsApp's own formatting — a single asterisk *like this* for " +
  "bold and a single underscore _like this_ for italic. Never use double asterisks **like this**, double underscores, " +
  "or any other markdown syntax — WhatsApp does not render it and it would show up as literal stray punctuation.";

// Languages relevant to the CRM's Tamil Nadu / South India market — sent as a plain
// instruction rather than a locale code since the model handles that better than we'd
// gain from formal i18n machinery here.
const AI_LANGUAGES = ["English", "Tamil", "Hindi", "Telugu", "Kannada", "Malayalam"] as const;
const languageSchema = z.enum(AI_LANGUAGES).optional();

/** Runs the AI call and records token usage + estimated cost against the requesting user,
 * so the cost-tracking screen reflects every feature from one place instead of five. */
async function runAi(user: AuthUser, feature: string, prompt: string, language?: string) {
  const fullPrompt =
    language && language !== "English"
      ? `${prompt}\n\nRespond entirely in ${language} (native script, not transliterated English) — every part of the reply, not just a summary line.`
      : prompt;
  const { text, usage, model } = await askAI([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: fullPrompt },
  ]);
  prisma.aiUsageLog
    .create({
      data: {
        userId: user.id,
        feature,
        model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        estimatedCostUsd: usage.estimatedCostUsd,
      },
    })
    .catch((err) => console.error("[ai] failed to log usage:", err));
  return { text, usage };
}

router.post(
  "/sales-pitch",
  validate(z.object({ propertyId: z.string().min(1), leadId: z.string().optional(), language: languageSchema })),
  async (req, res, next) => {
    try {
      const property = await getProperty(req.body.propertyId);
      const lead = req.body.leadId ? await getLead(req.body.leadId, req.user!) : null;
      const prompt = [
        "Write a short, persuasive sales pitch for this property that will be sent AS-IS as a single WhatsApp message.",
        "Hard limit: 120-180 words total, no exceptions. Plain chat message only — no greeting line, no markdown headers, " +
          "no closing signature block. A few emoji and *bold* words are fine, nothing more.",
        propertyBlock(property),
        lead ? `\nTailor it for this specific client:\n${leadBlock(lead)}` : "\nNo specific client — write a general pitch.",
      ].join("\n\n");
      const { text, usage } = await runAi(req.user!, "sales-pitch", prompt, req.body.language);
      res.json({ data: { text, usage } });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/investment-proposal",
  validate(z.object({ propertyId: z.string().min(1), language: languageSchema })),
  async (req, res, next) => {
    try {
      const property = await getProperty(req.body.propertyId);
      const prompt = [
        "Write a one-page investment proposal for this property aimed at a prospective investor.",
        "Cover: opportunity summary, location highlights, expected rental/appreciation angle (state assumptions clearly since no market data is provided), and a call to action.",
        "Use short headed sections, not a wall of text.",
        propertyBlock(property),
      ].join("\n\n");
      const { text, usage } = await runAi(req.user!, "investment-proposal", prompt, req.body.language);
      res.json({ data: { text, usage } });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/price-predictor",
  validate(
    z.object({
      location: z.string().min(1),
      propertyType: z.nativeEnum(PropertyType),
      bedrooms: z.coerce.number().optional(),
      areaSqft: z.coerce.number().optional(),
      language: languageSchema,
    })
  ),
  async (req, res, next) => {
    try {
      const { location, propertyType, bedrooms, areaSqft } = req.body;
      // Ground the estimate in real comparable listings from inventory instead of a blind guess
      const comparables = await prisma.property.findMany({
        where: {
          location: { contains: location, mode: "insensitive" },
          ...(propertyType ? { type: propertyType } : {}),
        },
        take: 10,
        orderBy: { createdAt: "desc" },
      });
      const compBlock = comparables.length
        ? comparables.map((p) => `- ${p.title}: ${money(p.price, p.currency)}${p.areaSqft ? ` (${p.areaSqft} sqft)` : ""}`).join("\n")
        : "No comparable listings found in inventory for this location/type.";
      const prompt = [
        `Estimate a fair market price range (in INR) for a ${propertyType} in ${location}` +
          `${bedrooms ? `, ${bedrooms} BR` : ""}${areaSqft ? `, ~${areaSqft} sqft` : ""}.`,
        "Base your estimate primarily on these comparable listings from our inventory:",
        compBlock,
        "State the estimated range clearly, list the assumptions/adjustments you made, and flag if the comparable data is too thin to be confident.",
        "Keep it under 150 words total — a short paragraph plus a couple of one-line bullets, not a full report with sections.",
      ].join("\n\n");
      const { text, usage } = await runAi(req.user!, "price-predictor", prompt, req.body.language);
      res.json({ data: { text, usage, comparablesUsed: comparables.length } });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/agreement-draft",
  validate(z.object({ propertyId: z.string().min(1), leadId: z.string().min(1), language: languageSchema })),
  async (req, res, next) => {
    try {
      const property = await getProperty(req.body.propertyId);
      const lead = await getLead(req.body.leadId, req.user!);
      const prompt = [
        "Draft a preliminary Agreement to Sell / Booking Agreement for an Indian real estate transaction, using the details below.",
        "Include standard sections: parties, property schedule, agreed price, token/advance amount (leave blank if not given), payment schedule (leave placeholders), possession, and a note that this draft must be reviewed by a lawyer before signing.",
        "Mark every placeholder clearly with [brackets] where information is not supplied.",
        `\nProperty:\n${propertyBlock(property)}`,
        `\nBuyer (client):\n${leadBlock(lead)}\nMobile: ${lead.mobile}`,
      ].join("\n\n");
      const { text, usage } = await runAi(req.user!, "agreement-draft", prompt, req.body.language);
      res.json({ data: { text, usage } });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/ask",
  validate(z.object({ query: z.string().min(1).max(2000), language: languageSchema })),
  async (req, res, next) => {
    try {
      if (!req.body.query.trim()) throw badRequest("Query is required");
      const { text, usage } = await runAi(req.user!, "ask", req.body.query, req.body.language);
      res.json({ data: { text, usage } });
    } catch (err) {
      next(err);
    }
  }
);

// ── Cost tracking (managers only — usage cost is a budget metric) ────
router.get("/usage", requireRole(Role.SALES_MANAGER), async (req, res, next) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const where: Prisma.AiUsageLogWhereInput =
      from || to
        ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
        : {};

    const [totals, byFeature, byUser, recent] = await Promise.all([
      prisma.aiUsageLog.aggregate({ where, _sum: { estimatedCostUsd: true, totalTokens: true }, _count: true }),
      prisma.aiUsageLog.groupBy({ by: ["feature"], where, _sum: { estimatedCostUsd: true, totalTokens: true }, _count: true }),
      prisma.aiUsageLog.groupBy({ by: ["userId"], where, _sum: { estimatedCostUsd: true, totalTokens: true }, _count: true }),
      prisma.aiUsageLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { user: { select: { name: true } } },
      }),
    ]);

    const users = await prisma.user.findMany({
      where: { id: { in: byUser.map((u) => u.userId) } },
      select: { id: true, name: true },
    });
    const userNames = new Map(users.map((u) => [u.id, u.name]));

    res.json({
      data: {
        totalRequests: totals._count,
        totalCostUsd: Number(totals._sum.estimatedCostUsd ?? 0),
        totalTokens: totals._sum.totalTokens ?? 0,
        byFeature: byFeature
          .map((f) => ({
            feature: f.feature,
            requests: f._count,
            costUsd: Number(f._sum.estimatedCostUsd ?? 0),
            tokens: f._sum.totalTokens ?? 0,
          }))
          .sort((a, b) => b.costUsd - a.costUsd),
        byStaff: byUser
          .map((u) => ({
            userId: u.userId,
            name: userNames.get(u.userId) ?? "Unknown",
            requests: u._count,
            costUsd: Number(u._sum.estimatedCostUsd ?? 0),
            tokens: u._sum.totalTokens ?? 0,
          }))
          .sort((a, b) => b.costUsd - a.costUsd),
        recent: recent.map((r) => ({
          id: r.id,
          feature: r.feature,
          model: r.model,
          tokens: r.totalTokens,
          costUsd: Number(r.estimatedCostUsd),
          user: r.user.name,
          createdAt: r.createdAt,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
