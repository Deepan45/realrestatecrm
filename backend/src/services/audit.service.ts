import { prisma } from "../lib/prisma";

export async function audit(
  userId: string | null,
  action: string,
  entity: string,
  entityId?: string,
  meta?: Record<string, unknown>
) {
  await prisma.auditLog.create({
    data: { userId, action, entity, entityId, meta: meta as object | undefined },
  });
}
