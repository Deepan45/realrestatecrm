import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { audit } from "../../services/audit.service";

const router = Router();
router.use(requireAuth);

// Key-value settings store (currencies, notification prefs, etc.)
router.get("/", async (_req, res, next) => {
  try {
    const settings = await prisma.setting.findMany();
    res.json({ data: Object.fromEntries(settings.map((s) => [s.key, s.value])) });
  } catch (err) {
    next(err);
  }
});

router.put(
  "/:key",
  requireRole(),
  validate(z.object({ value: z.unknown() })),
  async (req, res, next) => {
    try {
      const setting = await prisma.setting.upsert({
        where: { key: req.params.key },
        create: { key: req.params.key, value: req.body.value as object },
        update: { value: req.body.value as object },
      });
      await audit(req.user!.id, "setting_updated", "setting", setting.key);
      res.json({ data: setting });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
