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
  // Pre-filter in SQL to keep the candidate set small, then score in memory.
  const where: Prisma.PropertyWhereInput = { status: AvailabilityStatus.AVAILABLE };
  if (lead.propertyType) {
    // Keep other types as low-scoring candidates only when the lead has no budget/location signal
    where.OR = [
      { type: lead.propertyType },
      ...(lead.city || lead.preferredArea
        ? [{ location: { contains: (lead.preferredArea || lead.city)!, mode: "insensitive" as const } }]
        : []),
    ];
  }

  const candidates = await prisma.property.findMany({
    where,
    include: { images: { select: { url: true, isPrimary: true }, orderBy: { sortOrder: "asc" } } },
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
      } else if (max !== Number.MAX_SAFE_INTEGER && price <= max * 1.15 && price >= min * 0.85) {
        score += 18;
        reasons.push("Close to budget (±15%)");
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
