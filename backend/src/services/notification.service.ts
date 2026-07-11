import { NotificationType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { sendEmail } from "./email.service";

/** Titles/bodies often embed values a user typed in elsewhere (e.g. a lead's name from a
 * public, unauthenticated webhook) — escape before splicing into HTML email so that can't
 * inject markup into a notification email sent to staff. */
function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

interface NotifyOptions {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  meta?: Record<string, unknown>;
  email?: boolean;
}

/** Create an in-app notification and optionally mirror it to email. */
export async function notify(opts: NotifyOptions) {
  const notification = await prisma.notification.create({
    data: {
      userId: opts.userId,
      type: opts.type,
      title: opts.title,
      body: opts.body,
      meta: opts.meta as object | undefined,
    },
  });
  if (opts.email) {
    const user = await prisma.user.findUnique({ where: { id: opts.userId } });
    if (user?.email) {
      await sendEmail(user.email, opts.title, `<p>${escapeHtml(opts.body ?? opts.title)}</p>`);
    }
  }
  return notification;
}
