import { Router } from "express";
import { z } from "zod";
import { AvailabilityStatus, FurnishingStatus, PropertyCategory, PropertyType } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { validate } from "../../middleware/validate";
import { requireWebhookSecret } from "../../lib/webhookAuth";

const router = Router();

/**
 * Inbound sync from the public real-estate website: whenever a property is created,
 * edited, or unpublished on that site, it POSTs the current property state here so it
 * appears in the CRM without anyone re-typing it. Upserts on `externalId` so repeat
 * syncs update the same CRM row instead of duplicating it.
 */
const inboundPropertySchema = z.object({
  externalId: z.string().min(1),
  title: z.string().min(3),
  type: z.nativeEnum(PropertyType),
  category: z.nativeEnum(PropertyCategory),
  location: z.string().min(2),
  address: z.string().optional().nullable(),
  areaSqft: z.coerce.number().int().positive().optional().nullable(),
  bedrooms: z.coerce.number().int().min(0).optional().nullable(),
  bathrooms: z.coerce.number().int().min(0).optional().nullable(),
  furnishing: z.nativeEnum(FurnishingStatus).optional().nullable(),
  amenities: z.array(z.string()).default([]),
  price: z.coerce.number().positive(),
  currency: z.string().default("INR"),
  description: z.string().optional().nullable(),
  status: z.nativeEnum(AvailabilityStatus).default(AvailabilityStatus.AVAILABLE),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  youtubeUrl: z.string().optional().nullable(),
  images: z.array(z.string().url()).default([]),
});

router.post(
  "/website/properties",
  requireWebhookSecret(() => env.websiteSync.webhookSecret),
  validate(inboundPropertySchema),
  async (req, res, next) => {
    try {
      const { images, ...data } = req.body as z.infer<typeof inboundPropertySchema>;
      const property = await prisma.property.upsert({
        where: { externalId: data.externalId },
        create: { ...data, externalSource: "website", lastSyncedAt: new Date() },
        update: { ...data, externalSource: "website", lastSyncedAt: new Date() },
      });

      if (images.length) {
        const existing = await prisma.propertyImage.findMany({ where: { propertyId: property.id } });
        const existingUrls = new Set(existing.map((i) => i.url));
        const startOrder = existing.length;
        const newUrls = images.filter((url) => !existingUrls.has(url));
        if (newUrls.length) {
          await prisma.propertyImage.createMany({
            data: newUrls.map((url, i) => ({
              propertyId: property.id,
              url,
              isPrimary: existing.length === 0 && i === 0,
              sortOrder: startOrder + i,
            })),
          });
        }
      }

      res.status(201).json({ data: { id: property.id, externalId: property.externalId } });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
