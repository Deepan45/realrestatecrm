import { ActivityType } from "@prisma/client";
import { prisma } from "../lib/prisma";

export async function logActivity(
  leadId: string,
  actorId: string | null,
  type: ActivityType,
  message: string,
  meta?: Record<string, unknown>
) {
  await prisma.leadActivity.create({
    data: { leadId, actorId, type, message, meta: meta as object | undefined },
  });
}
