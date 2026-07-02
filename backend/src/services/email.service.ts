import nodemailer from "nodemailer";
import { env } from "../config/env";

const transporter = env.smtp.host
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    })
  : null;

export async function sendEmail(to: string, subject: string, html: string) {
  if (!transporter) {
    // No SMTP configured — log so the flow is still observable in development
    console.log(`[email:dev] to=${to} subject="${subject}"`);
    return;
  }
  try {
    await transporter.sendMail({ from: env.smtp.from, to, subject, html });
  } catch (err) {
    console.error("[email] send failed:", err);
  }
}
