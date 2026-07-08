import { Lead, NotificationType, PipelineStage } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { renderTemplate, whatsappProvider } from "./whatsapp.service";
import { notify } from "./notification.service";

type Agent = { id: string; name: string } | null;

const TEMPLATE_BY_STAGE: Partial<Record<PipelineStage, string>> = {
  SITE_VISIT_SCHEDULED: "site_visit_before",
  SITE_VISIT_COMPLETED: "site_visit_feedback",
  REGISTRATION: "registration_testimonial",
};

/**
 * Fire the automated WhatsApp message (if any) tied to a pipeline stage transition:
 * a confirmation before the site visit, a feedback request after it, and a
 * testimonial/referral ask on registration (deal closed). Best-effort — a failed
 * send here must never break the stage-change request that triggered it.
 */
export async function runStageAutomation(lead: Lead, toStage: PipelineStage, agent: Agent): Promise<void> {
  const templateKey = TEMPLATE_BY_STAGE[toStage];
  if (!templateKey) return;
  try {
    const template = await prisma.whatsAppTemplate.findFirst({ where: { key: templateKey, isActive: true } });
    if (!template) return;
    const toNumber = lead.whatsappNumber || lead.mobile;
    if (!toNumber) return;

    const scheduledTime = lead.followUpAt
      ? lead.followUpAt.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
      : "a time to be confirmed with your agent";

    const body = renderTemplate(template.body, {
      name: lead.fullName,
      agent: agent?.name ?? "our team",
      time: scheduledTime,
    });

    const result = await whatsappProvider.sendText(toNumber, body);
    await prisma.whatsAppLog.create({
      data: {
        leadId: lead.id,
        toNumber,
        templateId: template.id,
        body,
        sentById: agent?.id ?? lead.assignedToId ?? lead.createdById!,
        status: result.status,
        providerMessageId: result.providerMessageId,
        error: result.error,
      },
    });

    if (agent?.id) {
      await notify({
        userId: agent.id,
        type: NotificationType.GENERAL,
        title: `Automated "${template.name}" message sent to ${lead.fullName}`,
        meta: { leadId: lead.id },
      });
    }
  } catch (err) {
    console.error(`[pipelineAutomation] stage trigger failed for lead ${lead.id} → ${toStage}:`, err instanceof Error ? err.message : err);
  }
}
