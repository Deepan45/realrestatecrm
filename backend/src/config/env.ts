import dotenv from "dotenv";

// .env is authoritative: values there win over inherited shell variables
dotenv.config({ override: true });

export const env = {
  port: Number(process.env.PORT || 4000),
  appUrl: process.env.APP_URL || "http://localhost:3000",
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  whatsapp: {
    provider: process.env.WHATSAPP_PROVIDER || "mock",
    apiUrl: process.env.WHATSAPP_CLOUD_API_URL || "https://graph.facebook.com/v19.0",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
  },
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.MAIL_FROM || "RealRest CRM <noreply@realrest.example>",
  },
};
