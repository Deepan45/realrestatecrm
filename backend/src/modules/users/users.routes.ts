import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { audit } from "../../services/audit.service";
import { notFound } from "../../lib/errors";

const router = Router();
router.use(requireAuth);

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  phone: true,
  isActive: true,
  partnerCompanyId: true,
  partnerCompany: { select: { id: true, name: true } },
  createdAt: true,
} as const;

// Internal roles can list assignable staff (for dropdowns);
// partner users only see members of their own company.
router.get("/", async (req, res, next) => {
  try {
    const { role, active } = req.query;
    const requester = req.user!;
    const scope =
      requester.role === Role.PARTNER_USER
        ? { partnerCompanyId: requester.partnerCompanyId ?? "__none__" }
        : {};
    const users = await prisma.user.findMany({
      where: {
        ...scope,
        ...(role && Object.values(Role).includes(role as Role) ? { role: role as Role } : {}),
        ...(active !== undefined ? { isActive: active === "true" } : {}),
      },
      select: userSelect,
      orderBy: { name: "asc" },
    });
    res.json({ data: users });
  } catch (err) {
    next(err);
  }
});

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.nativeEnum(Role),
  phone: z.string().optional(),
  partnerCompanyId: z.string().optional().nullable(),
});

router.post("/", requireRole(), validate(createUserSchema), async (req, res, next) => {
  try {
    const { password, ...data } = req.body;
    const user = await prisma.user.create({
      data: { ...data, email: data.email.toLowerCase(), passwordHash: await bcrypt.hash(password, 10) },
      select: userSelect,
    });
    await audit(req.user!.id, "user_created", "user", user.id, { role: user.role });
    res.status(201).json({ data: user });
  } catch (err) {
    next(err);
  }
});

const updateUserSchema = createUserSchema.partial().extend({ isActive: z.boolean().optional() });

router.put("/:id", requireRole(), validate(updateUserSchema), async (req, res, next) => {
  try {
    const { password, ...rest } = req.body;
    const data: Record<string, unknown> = { ...rest };
    if (rest.email) data.email = rest.email.toLowerCase();
    if (password) data.passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.update({ where: { id: req.params.id }, data, select: userSelect });
    await audit(req.user!.id, "user_updated", "user", user.id);
    res.json({ data: user });
  } catch (err) {
    next(err);
  }
});

router.get("/audit-logs", requireRole(), async (req, res, next) => {
  try {
    const logs = await prisma.auditLog.findMany({
      take: 200,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
    });
    res.json({ data: logs });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", requireRole(Role.SALES_MANAGER), async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: userSelect });
    if (!user) throw notFound("User");
    res.json({ data: user });
  } catch (err) {
    next(err);
  }
});

export default router;
