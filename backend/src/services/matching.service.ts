import { AvailabilityStatus, Lead, Prisma, Property } from "@prisma/client";
import { prisma } from "../lib/prisma";

export interface ScoredProperty {
  property: Property & { images: { url: string; isPrimary: boolean }[] };
  score: number;
  reasons: string[];
}

/**
 * Score available properties against a lead's requirements.
 * Weights: budget 35, location 25, type 20, bedrooms 15, currency 5.
 * Properties matching nothing at all are dropped.
 */
export async function matchPropertiesForLead(lead: Lead, limit = 20): Promise<ScoredProperty[]> {
  // Pre-filter in SQL to just status — everything else (type, location, budget, bedrooms)
  // is a weighted point contribution below, not a hard requirement, so filtering the
  // candidate pool by type here would exclude properties that could still clear the
  // score >= 30 cutoff on budget/bedrooms/currency alone.
  const where: Prisma.PropertyWhereInput = { status: AvailabilityStatus.AVAILABLE };

  const candidates = await prisma.property.findMany({
    where,
    include: { images: { select: { url: true, isPrimary: true }, orderBy: { sortOrder: "asc" } } },
    orderBy: { updatedAt: "desc" },
    take: 300,
  });

  const budgetMin = lead.budgetMin ? Number(lead.budgetMin) : null;
  const budgetMax = lead.budgetMax ? Number(lead.budgetMax) : null;
  const wanted = (lead.preferredArea || lead.city || "").toLowerCase();

  const scored: ScoredProperty[] = candidates.map((property) => {
    let score = 0;
    const reasons: string[] = [];
    const price = Number(property.price);

    // Budget (35)
    if (budgetMin !== null || budgetMax !== null) {
      const min = budgetMin ?? 0;
      const max = budgetMax ?? Number.MAX_SAFE_INTEGER;
      if (price >= min && price <= max) {
        score += 35;
        reasons.push("Within budget");
      } else {
        // ±15% tolerance on whichever bounds are actually set — a lead with only a
        // minimum (no max) should still get credit for a price just under that minimum.
        const nearMax = max === Number.MAX_SAFE_INTEGER ? max : max * 1.15;
        const nearMin = min * 0.85;
        if (price >= nearMin && price <= nearMax) {
          score += 18;
          reasons.push("Close to budget (±15%)");
        }
      }
    } else {
      score += 15; // no budget given — neutral credit
    }

    // Location (25)
    if (wanted) {
      const loc = `${property.location} ${property.address ?? ""}`.toLowerCase();
      if (loc.includes(wanted)) {
        score += 25;
        reasons.push(`Located in ${property.location}`);
      }
    } else {
      score += 10;
    }

    // Property type (20)
    if (lead.propertyType) {
      if (property.type === lead.propertyType) {
        score += 20;
        reasons.push("Matches property type");
      }
    } else {
      score += 10;
    }

    // Bedrooms (15)
    if (lead.bedrooms != null && property.bedrooms != null) {
      if (property.bedrooms === lead.bedrooms) {
        score += 15;
        reasons.push(`${property.bedrooms} bedrooms as requested`);
      } else if (Math.abs(property.bedrooms - lead.bedrooms) === 1) {
        score += 8;
        reasons.push("Bedroom count within ±1");
      }
    } else {
      score += 7;
    }

    // Currency (5)
    if (property.currency === lead.currency) score += 5;

    return { property, score, reasons };
  });

  return scored
    .filter((s) => s.score >= 30)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
