import { z } from "zod";
import { LeadSource, LeadStatus, PipelineStage, Priority, PropertyType } from "@prisma/client";

// Letters, digits, spaces, and the handful of punctuation marks real names use (O'Brien, St. Anne's, campaign suffixes).
const personNamePattern = /^[a-zA-Z0-9\s'.-]+$/;
const placeNamePattern = /^[a-zA-Z\s'.-]+$/;
// Digits plus the punctuation a phone number is actually written with.
const phonePattern = /^[\d+\s().-]{5,}$/;

export const createLeadSchema = z.object({
  fullName: z.string().min(2).regex(personNamePattern, "Name cannot contain unsupported special characters"),
  mobile: z.string().min(5).regex(phonePattern, "Enter a valid phone number"),
  whatsappNumber: z.string().regex(phonePattern, "Enter a valid phone number").optional().nullable().or(z.literal("")),
  email: z.string().email().optional().nullable().or(z.literal("")),
  country: z.string().regex(placeNamePattern, "Country cannot contain numbers").optional().nullable().or(z.literal("")),
  city: z.string().regex(placeNamePattern, "City cannot contain numbers").optional().nullable().or(z.literal("")),
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
  // The updatedAt the client fetched before opening the edit form — lets the server
  // detect that someone else saved a change in between and reject a stale overwrite
  // instead of silently discarding it.
  expectedUpdatedAt: z.coerce.date().optional(),
});

export const changeStageSchema = z.object({
  stage: z.nativeEnum(PipelineStage),
});

export const assignSchema = z.object({
  assignedToId: z.string().min(1),
  // What the client saw as the current assignee when it loaded — lets the server detect
  // two people assigning the same lead at nearly the same moment (only one should win,
  // with a clear conflict instead of both silently succeeding and double-notifying staff).
  expectedAssignedToId: z.string().nullable().optional(),
});

export const noteSchema = z.object({
  body: z.string().min(1),
});

export const followUpSchema = z.object({
  followUpAt: z.coerce.date(),
});

export const AI_LANGUAGES = ["English", "Tamil", "Hindi", "Telugu", "Kannada", "Malayalam"] as const;

export const sendWhatsAppSchema = z.object({
  propertyIds: z.array(z.string()).default([]),
  templateKey: z.string().optional(),
  customMessage: z.string().optional(),
  language: z.enum(AI_LANGUAGES).optional(),
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

// PipelineStage has finer granularity than LeadStatus (13 stages vs 10 statuses), so a
// few stages share the nearest sensible status rather than getting one each. Every
// stage MUST have an entry here — a missing one previously meant moving a lead to that
// stage left its status badge showing a stale, contradictory value (e.g. a lead moved to
// Site Visit Completed kept showing status "New" indefinitely).
export const stageToStatus: Partial<Record<PipelineStage, LeadStatus>> = {
  NEW_LEAD: LeadStatus.NEW,
  INITIAL_CONTACT: LeadStatus.CONTACTED,
  REQUIREMENT_ANALYSIS: LeadStatus.CONTACTED,
  PROPERTY_MATCHING: LeadStatus.CONTACTED,
  PROPERTY_SHARED: LeadStatus.PROPERTY_SHARED,
  FOLLOW_UP_PENDING: LeadStatus.FOLLOW_UP,
  SITE_VISIT_SCHEDULED: LeadStatus.INTERESTED,
  SITE_VISIT_COMPLETED: LeadStatus.INTERESTED,
  NEGOTIATION: LeadStatus.NEGOTIATION,
  BANK_LOAN: LeadStatus.NEGOTIATION,
  SHARED_TO_PARTNER: LeadStatus.SHARED_TO_PARTNER,
  REGISTRATION: LeadStatus.CONVERTED,
  LOST_CLOSED: LeadStatus.CLOSED_LOST,
};
