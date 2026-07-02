import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { badRequest, unauthorized } from "../../lib/errors";
import { requireAuth, signToken } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { sendEmail } from "../../services/email.service";
import { audit } from "../../services/audit.service";
import { env } from "../../config/env";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw unauthorized("Invalid email or password");
    }
    if (!user.isActive) throw unauthorized("Your account has been deactivated");
    await audit(user.id, "login", "user", user.id);
    res.json({
      token: signToken(user),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        partnerCompanyId: user.partnerCompanyId,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/forgot-password",
  validate(z.object({ email: z.string().email() })),
  async (req, res, next) => {
    try {
      const user = await prisma.user.findUnique({ where: { email: req.body.email.toLowerCase() } });
      if (user) {
        const token = crypto.randomBytes(32).toString("hex");
        await prisma.user.update({
          where: { id: user.id },
          data: { resetToken: token, resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000) },
        });
        await sendEmail(
          user.email,
          "Reset your RealRest CRM password",
          `<p>Click <a href="${env.appUrl}/reset-password?token=${token}">here</a> to reset your password. The link expires in 1 hour.</p>`
        );
      }
      // Always respond the same way to avoid leaking which emails exist
      res.json({ message: "If that email exists, a reset link has been sent" });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/reset-password",
  validate(z.object({ token: z.string().min(10), password: z.string().min(8) })),
  async (req, res, next) => {
    try {
      const user = await prisma.user.findFirst({
        where: { resetToken: req.body.token, resetTokenExpiry: { gt: new Date() } },
      });
      if (!user) throw badRequest("Invalid or expired reset token");
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await bcrypt.hash(req.body.password, 10),
          resetToken: null,
          resetTokenExpiry: null,
        },
      });
      await audit(user.id, "password_reset", "user", user.id);
      res.json({ message: "Password updated. You can now log in." });
    } catch (err) {
      next(err);
    }
  }
);

router.get("/me", requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

export default router;
