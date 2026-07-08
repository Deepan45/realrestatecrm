import { z } from "zod";
import { LeadSource, LeadStatus, PipelineStage, Priority, PropertyType } from "@prisma/client";

export const createLeadSchema = z.object({
  fullName: z.string().min(2),
  mobile: z.string().min(5),
  whatsappNumber: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  country: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  preferredArea: z.string().optional().nullable(),
  budgetMin: z.coerce.number().nonnegative().optional().nullable(),
  budgetMax: z.coerce.number().nonnegative().optional().nullable(),
  currency: z.string().default("INR"),
  propertyType: z.nativeEnum(PropertyType).optional().nullable(),
  bedrooms: z.coerce.number().int().min(0).optional().nullable(),
  visaType: z.string().optional().nullable(),
  visaRequired: z.boolean().default(false),
  source: z.nativeEnum(LeadSource).default(LeadSource.MANUAL),
  priority: z.nativeEnum(Priority).default(Priority.MEDIUM),
  requirementNotes: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  followUpAt: z.coerce.date().optional().nullable(),
});

export const updateLeadSchema = createLeadSchema.partial().extend({
  status: z.nativeEnum(LeadStatus).optional(),
});

export const changeStageSchema = z.object({
  stage: z.nativeEnum(PipelineStage),
});

export const assignSchema = z.object({
  assignedToId: z.string().min(1),
});

export const noteSchema = z.object({
  body: z.string().min(1),
});

export const followUpSchema = z.object({
  followUpAt: z.coerce.date(),
});

export const sendWhatsAppSchema = z.object({
  propertyIds: z.array(z.string()).default([]),
  templateKey: z.string().optional(),
  customMessage: z.string().optional(),
});

export const sharePartnerSchema = z.object({
  partnerId: z.string().min(1),
  notesShared: z.string().optional(),
  sendWhatsApp: z.boolean().default(true),
});

export const shortlistSchema = z.object({
  propertyIds: z.array(z.string()).min(1),
});

// Public website lead capture — no auth
export const captureLeadSchema = createLeadSchema
  .omit({ assignedToId: true, priority: true })
  .extend({ source: z.nativeEnum(LeadSource).default(LeadSource.WEBSITE_FORM) });

/** Map a lead status to the pipeline stage it implies (kept in sync automatically). */
export const statusToStage: Partial<Record<LeadStatus, PipelineStage>> = {
  NEW: PipelineStage.NEW_LEAD,
  CONTACTED: PipelineStage.INITIAL_CONTACT,
  PROPERTY_SHARED: PipelineStage.PROPERTY_SHARED,
  FOLLOW_UP: PipelineStage.FOLLOW_UP_PENDING,
  INTERESTED: PipelineStage.SITE_VISIT_SCHEDULED,
  NEGOTIATION: PipelineStage.NEGOTIATION,
  SHARED_TO_PARTNER: PipelineStage.SHARED_TO_PARTNER,
  CONVERTED: PipelineStage.REGISTRATION,
  CLOSED_LOST: PipelineStage.LOST_CLOSED,
  INVALID: PipelineStage.LOST_CLOSED,
};

export const stageToStatus: Partial<Record<PipelineStage, LeadStatus>> = {
  NEW_LEAD: LeadStatus.NEW,
  INITIAL_CONTACT: LeadStatus.CONTACTED,
  PROPERTY_SHARED: LeadStatus.PROPERTY_SHARED,
  FOLLOW_UP_PENDING: LeadStatus.FOLLOW_UP,
  SITE_VISIT_SCHEDULED: LeadStatus.INTERESTED,
  NEGOTIATION: LeadStatus.NEGOTIATION,
  SHARED_TO_PARTNER: LeadStatus.SHARED_TO_PARTNER,
  REGISTRATION: LeadStatus.CONVERTED,
  LOST_CLOSED: LeadStatus.CLOSED_LOST,
};
