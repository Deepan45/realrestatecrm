import { NotificationType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { notify } from "../services/notification.service";

const CHECK_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Every 15 minutes, notify assignees about follow-ups that are now due.
 * A notification is only created once per lead per due date (tracked via meta).
 */
export function startFollowUpReminderJob() {
  const run = async () => {
    try {
      const due = await prisma.lead.findMany({
        where: {
          followUpAt: { lte: new Date() },
          assignedToId: { not: null },
          status: { notIn: ["CONVERTED", "CLOSED_LOST", "INVALID"] },
        },
        select: { id: true, fullName: true, followUpAt: true, assignedToId: true },
        take: 200,
      });
      for (const lead of due) {
        const already = await prisma.notification.findFirst({
          where: {
            userId: lead.assignedToId!,
            type: NotificationType.FOLLOW_UP_DUE,
            meta: { path: ["leadId"], equals: lead.id },
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        });
        if (already) continue;
        await notify({
          userId: lead.assignedToId!,
          type: NotificationType.FOLLOW_UP_DUE,
          title: `Follow-up due: ${lead.fullName}`,
          meta: { leadId: lead.id, dueAt: lead.followUpAt?.toISOString() },
          email: true,
        });
      }
    } catch (err) {
      console.error("[follow-up job] failed:", err);
    }
  };
  run();
  setInterval(run, CHECK_INTERVAL_MS);
}
