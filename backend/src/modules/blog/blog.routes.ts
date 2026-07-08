import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { badRequest, notFound } from "../../lib/errors";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { audit } from "../../services/audit.service";

const router = Router();

const postSchema = z.object({
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and hyphens only"),
  title: z.string().min(3),
  excerpt: z.string().optional().nullable(),
  coverImageUrl: z.string().optional().nullable(),
  body: z.string().min(10),
  isPublished: z.boolean().default(false),
});

// ── Public read routes — no auth ─────────────────────────────────────
router.get("/", async (req, res, next) => {
  try {
    const { page = "1", pageSize = "10" } = req.query as Record<string, string>;
    const take = Math.min(Number(pageSize) || 10, 50);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const where = { isPublished: true };
    const [total, data] = await Promise.all([
      prisma.blogPost.count({ where }),
      prisma.blogPost.findMany({
        where,
        select: { id: true, slug: true, title: true, excerpt: true, coverImageUrl: true, publishedAt: true },
        orderBy: { publishedAt: "desc" },
        skip,
        take,
      }),
    ]);
    res.json({ data, total, page: Number(page), pageSize: take });
  } catch (err) {
    next(err);
  }
});

router.get("/:slug", async (req, res, next) => {
  try {
    const post = await prisma.blogPost.findUnique({
      where: { slug: req.params.slug },
      include: { author: { select: { name: true } } },
    });
    if (!post || !post.isPublished) throw notFound("Post");
    res.json({ data: post });
  } catch (err) {
    next(err);
  }
});

// ── Manager CRUD ──────────────────────────────────────────────────────
router.use(requireAuth, requireRole(Role.SALES_MANAGER));

router.get("/admin/all", async (_req, res, next) => {
  try {
    const posts = await prisma.blogPost.findMany({ orderBy: { createdAt: "desc" } });
    res.json({ data: posts });
  } catch (err) {
    next(err);
  }
});

router.post("/", validate(postSchema), async (req, res, next) => {
  try {
    const existing = await prisma.blogPost.findUnique({ where: { slug: req.body.slug } });
    if (existing) throw badRequest("A post with this slug already exists");
    const post = await prisma.blogPost.create({
      data: { ...req.body, authorId: req.user!.id, publishedAt: req.body.isPublished ? new Date() : null },
    });
    await audit(req.user!.id, "blog_post_created", "blog_post", post.id, { title: post.title });
    res.status(201).json({ data: post });
  } catch (err) {
    next(err);
  }
});

router.put("/:id", validate(postSchema.partial()), async (req, res, next) => {
  try {
    const before = await prisma.blogPost.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound("Post");
    const post = await prisma.blogPost.update({
      where: { id: req.params.id },
      data: {
        ...req.body,
        ...(req.body.isPublished && !before.isPublished ? { publishedAt: new Date() } : {}),
      },
    });
    await audit(req.user!.id, "blog_post_updated", "blog_post", post.id);
    res.json({ data: post });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    await prisma.blogPost.delete({ where: { id: req.params.id } });
    await audit(req.user!.id, "blog_post_deleted", "blog_post", req.params.id);
    res.json({ message: "Post deleted" });
  } catch (err) {
    next(err);
  }
});

export default router;
