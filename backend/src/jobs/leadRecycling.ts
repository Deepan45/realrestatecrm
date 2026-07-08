import { PipelineStage, Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { audit } from "../services/audit.service";
import { logActivity } from "../services/activity.service";
import { notify } from "../services/notification.service";
import { NotificationType, ActivityType } from "@prisma/client";

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // once a day
const LEASE_DAYS = 30;

/**
 * 30-day lead validity rule: if an assigned lead hasn't moved to a new pipeline
 * stage in 30 days (and hasn't reached a closing stage), it's unassigned and
 * returned to the central pool for a manager to re-allocate.
 */
export function startLeadRecyclingJob() {
  const run = async () => {
    try {
      const cutoff = new Date(Date.now() - LEASE_DAYS * 24 * 60 * 60 * 1000);
      const stale = await prisma.lead.findMany({
        where: {
          assignedToId: { not: null },
          stage: { notIn: [PipelineStage.REGISTRATION, PipelineStage.LOST_CLOSED] },
          // updatedAt (not createdAt) so a freshly re-assigned or edited lead restarts
          // its 30-day lease instead of being recycled again the next morning
          updatedAt: { lte: cutoff },
          pipelineHistory: { none: { createdAt: { gte: cutoff } } },
        },
        select: { id: true, fullName: true, assignedToId: true, assignedTo: { select: { name: true } } },
        take: 200,
      });
      if (!stale.length) return;

      for (const lead of stale) {
        await prisma.lead.update({ where: { id: lead.id }, data: { assignedToId: null } });
        await logActivity(lead.id, null, ActivityType.LEAD_UPDATED,
          `Recycled to the unassigned pool — no stage progress in ${LEASE_DAYS} days (was assigned to ${lead.assignedTo?.name ?? "unknown"})`);
        await audit(null, "lead_recycled", "lead", lead.id, { previousAssignee: lead.assignedToId });
      }

      const managers = await prisma.user.findMany({
        where: { role: { in: [Role.SALES_MANAGER, Role.SUPER_ADMIN] }, isActive: true },
      });
      await Promise.all(
        managers.map((m) =>
          notify({
            userId: m.id,
            type: NotificationType.GENERAL,
            title: `${stale.length} lead${stale.length === 1 ? "" : "s"} recycled to the unassigned pool (30-day inactivity)`,
          })
        )
      );
    } catch (err) {
      console.error("[lead-recycling job] failed:", err);
    }
  };
  run();
  setInterval(run, CHECK_INTERVAL_MS);
}
