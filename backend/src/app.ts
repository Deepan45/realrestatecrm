import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { errorHandler } from "./middleware/errorHandler";
import { UPLOAD_DIR } from "./middleware/upload";
import { openApiSpec } from "./docs/openapi";
import authRoutes from "./modules/auth/auth.routes";
import usersRoutes from "./modules/users/users.routes";
import leadsRoutes from "./modules/leads/leads.routes";
import propertiesRoutes from "./modules/properties/properties.routes";
import partnersRoutes from "./modules/partners/partners.routes";
import whatsappRoutes from "./modules/whatsapp/whatsapp.routes";
import notificationsRoutes from "./modules/notifications/notifications.routes";
import reportsRoutes from "./modules/reports/reports.routes";
import settingsRoutes from "./modules/settings/settings.routes";
import aiRoutes from "./modules/ai/ai.routes";
import blogRoutes from "./modules/blog/blog.routes";
import integrationsRoutes from "./modules/integrations/integrations.routes";

export function createApp() {
  const app = express();

  app.use(cors());
  // `verify` stashes the raw bytes on req.rawBody, needed to check the Meta
  // webhook's HMAC signature over the exact payload sent (not our re-serialized copy).
  app.use(express.json({ limit: "2mb", verify: (req, _res, buf) => { (req as express.Request).rawBody = buf; } }));
  app.use("/uploads", express.static(UPLOAD_DIR));

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

  app.use("/api/auth", authRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/leads", leadsRoutes);
  app.use("/api/properties", propertiesRoutes);
  app.use("/api/partners", partnersRoutes);
  app.use("/api/whatsapp", whatsappRoutes);
  app.use("/api/notifications", notificationsRoutes);
  app.use("/api/reports", reportsRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/ai", aiRoutes);
  app.use("/api/blog", blogRoutes);
  app.use("/api/integrations", integrationsRoutes);

  app.use(errorHandler);
  return app;
}
