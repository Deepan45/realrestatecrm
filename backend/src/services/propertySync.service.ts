import { Property } from "@prisma/client";
import { env } from "../config/env";

export type SyncAction = "created" | "updated" | "deleted";

/**
 * Push a property change back to the public website's API so listings created or
 * edited in the CRM appear live without a separate manual re-entry step.
 *
 * Best-effort and fire-and-forget by design: a slow or failing website endpoint must
 * never block or fail the CRM's own create/update/delete request. Logs to the console
 * (rather than calling out) when WEBSITE_API_URL isn't configured, so this is safe to
 * leave wired up in every environment including local dev.
 */
export async function pushPropertyToWebsite(property: Property, action: SyncAction): Promise<void> {
  if (!env.websiteSync.apiUrl) {
    console.log(`[propertySync:mock] ${action} → ${property.id} (${property.title}) — WEBSITE_API_URL not configured`);
    return;
  }
  try {
    const res = await fetch(`${env.websiteSync.apiUrl}/properties/${property.externalId ?? property.id}`, {
      method: action === "deleted" ? "DELETE" : "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(env.websiteSync.apiKey ? { Authorization: `Bearer ${env.websiteSync.apiKey}` } : {}),
      },
      body: action === "deleted" ? undefined : JSON.stringify(toWebsitePayload(property)),
    });
    if (!res.ok) {
      console.error(`[propertySync] website API responded ${res.status} for property ${property.id}`);
    }
  } catch (err) {
    console.error(`[propertySync] failed to push property ${property.id}:`, err instanceof Error ? err.message : err);
  }
}

function toWebsitePayload(p: Property) {
  return {
    crmId: p.id,
    title: p.title,
    type: p.type,
    category: p.category,
    location: p.location,
    address: p.address,
    areaSqft: p.areaSqft,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    price: p.price,
    currency: p.currency,
    description: p.description,
    status: p.status,
    latitude: p.latitude,
    longitude: p.longitude,
    youtubeUrl: p.youtubeUrl,
  };
}
