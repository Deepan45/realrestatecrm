import { Router } from "express";
import fs from "fs";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import {
  AvailabilityStatus,
  FurnishingStatus,
  NotificationType,
  Prisma,
  PropertyCategory,
  PropertyType,
  Role,
} from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { badRequest, notFound } from "../../lib/errors";
import { propertyEditors, requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { UPLOAD_DIR, fileUpload, imageUpload, videoUpload } from "../../middleware/upload";
import path from "path";
import { audit } from "../../services/audit.service";
import { notify } from "../../services/notification.service";

const router = Router();
router.use(requireAuth);

const propertySchema = z.object({
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
  currency: z.string().default("AED"),
  description: z.string().optional().nullable(),
  videoUrl: z.string().optional().nullable().or(z.literal("")),
  status: z.nativeEnum(AvailabilityStatus).default(AvailabilityStatus.AVAILABLE),
  ownerName: z.string().optional().nullable(),
  contactName: z.string().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
});

const includeImages = { images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] } } satisfies Prisma.PropertyInclude;

const SORTABLE_FIELDS = new Set(["createdAt", "updatedAt", "price", "title", "bedrooms", "areaSqft"]);

/** Return the value only if it is a member of the enum; invalid values are ignored instead of crashing the query. */
function asEnum<T extends Record<string, string>>(enumObj: T, value?: string): T[keyof T] | undefined {
  return value && Object.values(enumObj).includes(value) ? (value as T[keyof T]) : undefined;
}

// ── Search / list ────────────────────────────────────────────────────
router.get("/", async (req, res, next) => {
  try {
    const {
      q, type, category, status, location, bedrooms, priceMin, priceMax, amenity,
      page = "1", pageSize = "20", sort = "createdAt:desc",
    } = req.query as Record<string, string>;

    const where: Prisma.PropertyWhereInput = {
      AND: [
        q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { location: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
        { type: asEnum(PropertyType, type) },
        { category: asEnum(PropertyCategory, category) },
        { status: asEnum(AvailabilityStatus, status) },
        location ? { location: { contains: location, mode: "insensitive" } } : {},
        bedrooms ? { bedrooms: Number(bedrooms) } : {},
        priceMin ? { price: { gte: Number(priceMin) } } : {},
        priceMax ? { price: { lte: Number(priceMax) } } : {},
        amenity ? { amenities: { has: amenity } } : {},
      ],
    };

    const [rawField, dir] = sort.split(":");
    const field = SORTABLE_FIELDS.has(rawField) ? rawField : "createdAt";
    const take = Math.min(Number(pageSize) || 20, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const [total, data] = await Promise.all([
      prisma.property.count({ where }),
      prisma.property.findMany({
        where,
        include: { ...includeImages, assignedTo: { select: { id: true, name: true } } },
        orderBy: { [field || "createdAt"]: dir === "asc" ? "asc" : "desc" },
        skip,
        take,
      }),
    ]);
    res.json({ data, total, page: Number(page), pageSize: take });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const property = await prisma.property.findUnique({
      where: { id: req.params.id },
      include: { ...includeImages, assignedTo: { select: { id: true, name: true } } },
    });
    if (!property) throw notFound("Property");
    res.json({ data: property });
  } catch (err) {
    next(err);
  }
});

// ── Create / update / delete (property staff + managers) ─────────────
router.post("/", requireRole(...propertyEditors), validate(propertySchema), async (req, res, next) => {
  try {
    const property = await prisma.property.create({
      data: { ...req.body, videoUrl: req.body.videoUrl || null, assignedToId: req.user!.id },
      include: { ...includeImages, assignedTo: { select: { id: true, name: true } } },
    });
    await audit(req.user!.id, "property_created", "property", property.id, { title: property.title });
    res.status(201).json({ data: property });
  } catch (err) {
    next(err);
  }
});

router.put("/:id", requireRole(...propertyEditors), validate(propertySchema.partial()), async (req, res, next) => {
  try {
    const before = await prisma.property.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound("Property");
    const property = await prisma.property.update({
      where: { id: req.params.id },
      data: { ...req.body, ...(req.body.videoUrl !== undefined ? { videoUrl: req.body.videoUrl || null } : {}) },
      include: { ...includeImages, assignedTo: { select: { id: true, name: true } } },
    });
    await audit(req.user!.id, "property_updated", "property", property.id);

    // Notify staff with this property shortlisted when availability changes
    if (req.body.status && req.body.status !== before.status) {
      const interested = await prisma.propertyMatch.findMany({
        where: { propertyId: property.id },
        include: { lead: { select: { assignedToId: true, fullName: true } } },
      });
      const staffIds = [...new Set(interested.map((m) => m.lead.assignedToId).filter(Boolean))] as string[];
      await Promise.all(
        staffIds.map((userId) =>
          notify({
            userId,
            type: NotificationType.PROPERTY_AVAILABILITY_CHANGED,
            title: `Property "${property.title}" is now ${property.status}`,
            meta: { propertyId: property.id },
          })
        )
      );
    }
    res.json({ data: property });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", requireRole(...propertyEditors), async (req, res, next) => {
  try {
    await prisma.property.delete({ where: { id: req.params.id } });
    await audit(req.user!.id, "property_deleted", "property", req.params.id);
    res.json({ message: "Property deleted" });
  } catch (err) {
    next(err);
  }
});

// ── Images ───────────────────────────────────────────────────────────
router.post(
  "/:id/images",
  requireRole(...propertyEditors),
  imageUpload.array("images", 12),
  async (req, res, next) => {
    try {
      const property = await prisma.property.findUnique({
        where: { id: req.params.id },
        include: { images: true },
      });
      if (!property) throw notFound("Property");
      const files = (req.files as Express.Multer.File[]) ?? [];
      if (!files.length) throw badRequest("No images uploaded (field name: images)");
      const startOrder = property.images.length;
      const created = await Promise.all(
        files.map((f, i) =>
          prisma.propertyImage.create({
            data: {
              propertyId: property.id,
              url: `/uploads/${f.filename}`,
              isPrimary: startOrder === 0 && i === 0,
              sortOrder: startOrder + i,
            },
          })
        )
      );
      res.status(201).json({ data: created });
    } catch (err) {
      next(err);
    }
  }
);

router.delete("/:id/images/:imageId", requireRole(...propertyEditors), async (req, res, next) => {
  try {
    await prisma.propertyImage.delete({ where: { id: req.params.imageId } });
    res.json({ message: "Image removed" });
  } catch (err) {
    next(err);
  }
});

// ── Video tour ───────────────────────────────────────────────────────
function deleteLocalUpload(url?: string | null) {
  if (!url || !url.startsWith("/uploads/")) return;
  const file = path.join(UPLOAD_DIR, path.basename(url));
  fs.unlink(file, () => {});
}

router.post(
  "/:id/video",
  requireRole(...propertyEditors),
  videoUpload.single("video"),
  async (req, res, next) => {
    try {
      const property = await prisma.property.findUnique({ where: { id: req.params.id } });
      if (!property) throw notFound("Property");
      if (!req.file) throw badRequest("No video uploaded (field name: video)");
      deleteLocalUpload(property.videoUrl);
      const updated = await prisma.property.update({
        where: { id: property.id },
        data: { videoUrl: `/uploads/${req.file.filename}` },
      });
      await audit(req.user!.id, "property_video_uploaded", "property", property.id);
      res.status(201).json({ data: { videoUrl: updated.videoUrl } });
    } catch (err) {
      next(err);
    }
  }
);

router.delete("/:id/video", requireRole(...propertyEditors), async (req, res, next) => {
  try {
    const property = await prisma.property.findUnique({ where: { id: req.params.id } });
    if (!property) throw notFound("Property");
    deleteLocalUpload(property.videoUrl);
    await prisma.property.update({ where: { id: property.id }, data: { videoUrl: null } });
    await audit(req.user!.id, "property_video_removed", "property", property.id);
    res.json({ message: "Video removed" });
  } catch (err) {
    next(err);
  }
});

// ── Bulk CSV import ──────────────────────────────────────────────────
router.post(
  "/import",
  requireRole(...propertyEditors),
  fileUpload.single("file"),
  async (req, res, next) => {
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
          const data = propertySchema.parse({
            ...row,
            amenities: row.amenities ? row.amenities.split("|").map((a) => a.trim()) : [],
          });
          await prisma.property.create({
            data: { ...data, videoUrl: data.videoUrl || null, assignedToId: req.user!.id },
          });
          created++;
        } catch (e) {
          errors.push({ row: i + 2, message: e instanceof Error ? e.message.slice(0, 200) : "Invalid row" });
        }
      }
      await audit(req.user!.id, "properties_imported", "property", undefined, { created, failed: errors.length });
      res.json({ created, failed: errors.length, errors: errors.slice(0, 20) });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
