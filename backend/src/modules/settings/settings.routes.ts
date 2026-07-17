import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { badRequest } from "../../lib/errors";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { audit } from "../../services/audit.service";
import { imageUpload, verifyImageContent } from "../../middleware/upload";
import {
  DB_KEY_PREFIX,
  INTEGRATION_SECTIONS,
  SECTION_SCHEMAS,
  IntegrationSettings,
  getIntegrationSettings,
  maskAll,
  maskSection,
  stripUnchangedSecrets,
  updateIntegrationSection,
} from "../../services/integrationSettings.service";

const router = Router();

// Branding (app name/tagline/logo/color) needs to render on the login screen too, before
// anyone has a token — registered ahead of requireAuth below so it's the one settings
// route that's reachable unauthenticated. Nothing sensitive lives under this key.
router.get("/branding/public", async (_req, res, next) => {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: "branding" } });
    res.json({ data: setting?.value ?? {} });
  } catch (err) {
    next(err);
  }
});

router.use(requireAuth);

// Key-value settings store (currencies, branding, notification prefs, etc.) — for any
// authenticated user regardless of role. Rows under the "integration_" prefix hold live
// third-party secrets (API keys, webhook secrets) and must never appear here unmasked;
// those are only ever readable through the masked, Super-Admin-only /integrations
// endpoints below. This previously leaked every configured secret in plaintext to any
// logged-in user, including partner-company accounts.
router.get("/", async (_req, res, next) => {
  try {
    const settings = await prisma.setting.findMany();
    const safe = settings.filter((s) => !s.key.startsWith(DB_KEY_PREFIX));
    res.json({ data: Object.fromEntries(safe.map((s) => [s.key, s.value])) });
  } catch (err) {
    next(err);
  }
});

// Logo upload for the "branding" setting key — a plain file, not JSON, so it needs its
// own multipart endpoint; the frontend then PUTs the returned URL into branding.logoUrl
// via the generic /settings/:key route below.
router.post(
  "/branding/logo",
  requireRole(),
  imageUpload.single("logo"),
  verifyImageContent,
  async (req, res, next) => {
    try {
      if (!req.file) throw badRequest("No logo uploaded (field name: logo)");
      res.status(201).json({ url: `/uploads/${req.file.filename}` });
    } catch (err) {
      next(err);
    }
  }
);

// ── Integrations (WhatsApp, OpenAI, Meta Lead Ads, website sync, lead webhooks) ──
// Super Admin only — these are third-party credentials, not general workspace prefs.
// Secrets are masked on read; a PUT that echoes a masked value back leaves it unchanged.

router.get("/integrations", requireRole(), async (_req, res, next) => {
  try {
    const settings = await getIntegrationSettings();
    res.json({ data: maskAll(settings) });
  } catch (err) {
    next(err);
  }
});

router.put(
  "/integrations/:section",
  requireRole(),
  validate(z.object({ value: z.record(z.unknown()) })),
  async (req, res, next) => {
    try {
      const section = req.params.section as keyof IntegrationSettings;
      if (!INTEGRATION_SECTIONS.includes(section)) {
        throw badRequest(`Unknown integration section "${req.params.section}"`);
      }
      const parsed = SECTION_SCHEMAS[section].safeParse(req.body.value);
      if (!parsed.success) {
        throw badRequest(`Invalid ${section} settings: ${parsed.error.errors.map((e) => `${e.path.join(".")} ${e.message}`).join("; ")}`);
      }
      const patch = stripUnchangedSecrets(section, parsed.data as Record<string, unknown>);
      const updated = await updateIntegrationSection(section, patch);
      await audit(req.user!.id, "integration_settings_updated", "setting", section);
      res.json({ data: maskSection(section, updated) });
    } catch (err) {
      next(err);
    }
  }
);

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
