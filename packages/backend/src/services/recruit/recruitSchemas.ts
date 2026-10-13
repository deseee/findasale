/**
 * recruitSchemas.ts -- ADR-139 request schemas for the recruit channel (public + admin).
 * All .strict(): an unknown key (status, consentAt, transport, recipient, ...) is a 400.
 */
import { z } from 'zod';
import { RecruitLeadSource, RecruitLeadStatus } from '@prisma/client';

const US_STATE = /^[A-Za-z]{2}$/;
export const LeadId = z.string().min(1).max(64);

// ---- public ----
export const interestSchema = z
  .object({
    email: z.string().trim().email().max(254),
    businessName: z.string().trim().min(1).max(120),
    state: z.string().trim().regex(US_STATE).optional().nullable(),
    consent: z.literal(true),
    // Honeypot: real visitors never see or fill this field.
    website: z.string().max(200).optional(),
    src: z.string().regex(/^[a-z_]{1,32}$/).optional().nullable(),
    org: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/).optional().nullable(),
  })
  .strict();

export const confirmSchema = z.object({ leadId: LeadId, sig: z.string().min(1).max(128) }).strict();

// ---- admin ----
const STATUSES = Object.values(RecruitLeadStatus) as [string, ...string[]];
const SOURCES = Object.values(RecruitLeadSource) as [string, ...string[]];

export const listQuerySchema = z
  .object({
    status: z.enum(STATUSES).optional(),
    source: z.enum(SOURCES).optional(),
    cursor: LeadId.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();
export const buildSchema = z.object({ limit: z.number().int().min(1).max(200).default(50) }).strict();
export const manualSchema = z
  .object({
    email: z.string().trim().email().max(254),
    businessName: z.string().trim().min(1).max(120),
    state: z.string().trim().regex(US_STATE).optional().nullable(),
    consentNote: z.string().trim().min(1).max(300),
  })
  .strict();
export const batchSchema = z.object({ leadIds: z.array(LeadId).min(1).max(100), note: z.string().trim().max(300).optional() }).strict();
export const skipSchema = z.object({ reason: z.string().trim().min(1).max(200) }).strict();
export const testSendSchema = z.object({ leadId: LeadId }).strict();
export const pauseSchema = z.object({ reason: z.string().trim().min(1).max(300) }).strict();
export const resumeSchema = z.object({ confirm: z.literal('RESUME') }).strict();
