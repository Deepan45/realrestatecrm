import dotenv from "dotenv";

// .env is authoritative: values there win over inherited shell variables
dotenv.config({ override: true });

export const env = {
  port: Number(process.env.PORT || 4000),
  appUrl: process.env.APP_URL || "http://localhost:3000",
  // This server's own public origin — needed to turn "/uploads/xxx.jpg" into a real
  // link when embedding property media in outbound WhatsApp/email messages.
  publicUrl: (process.env.PUBLIC_API_URL || `http://localhost:${Number(process.env.PORT || 4000)}`).replace(/\/$/, ""),
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  whatsapp: {
    provider: process.env.WHATSAPP_PROVIDER || "mock",
    apiUrl: process.env.WHATSAPP_CLOUD_API_URL || "https://graph.facebook.com/v19.0",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
  },
  msg91: {
    authKey: process.env.MSG91_AUTH_KEY || "",
    integratedNumber: process.env.MSG91_INTEGRATED_NUMBER || "",
    whatsappUrl: process.env.MSG91_WHATSAPP_URL || "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/",
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    apiUrl: process.env.OPENAI_API_URL || "https://api.openai.com/v1/chat/completions",
  },
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.MAIL_FROM || "RealRest CRM <noreply@realrest.example>",
  },
};
