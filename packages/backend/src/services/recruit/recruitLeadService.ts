/**
 * recruitLeadService.ts -- ADR-139 recruit channel lead lifecycle.
 *
 * Intake (interest form, manual, directory), double opt-in confirm, unsubscribe, batch
 * approval, the per-lead send step used by the cron, admin test send, conversion sweep and
 * provider (webhook) events. Every status / consent / transport field is set here, never
 * taken from a request body.
 */
import { Prisma, RecruitLeadSource, RecruitLeadStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { suppressionService } from '../suppressionService';
import { domainCanReceiveMail } from '../../lib/mxValidator';
import {
  CONFIRM_MAX_EVER,
  CONFIRM_MIN_INTERVAL_MS,
  CONSENT_WORDING_VERSION,
  RecruitConfig,
  SEQUENCE_DAY_OFFSETS,
  SEQUENCE_LAST_STEP,
  getRecruitConfig,
} from './recruitConfig';
import { hashConsentIp, signRecruitToken, verifyRecruitToken } from './recruitTokens';
import { renderConfirmEmail, renderSequenceEmail, RenderedEmail } from './recruitTemplates';
import { checkTransportReady, sendRecruitEmail } from './recruitTransport';
import {
  channelOpenForSend,
  evaluateLeadGuards,
  findOrganizerUserId,
  recordCapReachedOnce,
  reserveQuotaSlot,
} from './recruitGuards';

const DAY_MS = 24 * 60 * 60 * 1000;
const TERMINAL_STATUSES: RecruitLeadStatus[] = ['UNSUBSCRIBED', 'BOUNCED', 'COMPLAINED'];
const DIRECTORY_METHODS = ['website_scrape', 'whois_rdap', 'smtp_pattern', 'sale_description'];

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function unsubscribeUrl(cfg: RecruitConfig, leadId: string): string {
  return `${cfg.backendUrl}/api/recruit/unsubscribe/${encodeURIComponent(leadId)}/${signRecruitToken(leadId, 'unsub', cfg.unsubSecret)}`;
}

export function confirmUrl(cfg: RecruitConfig, leadId: string): string {
  const sig = signRecruitToken(leadId, 'confirm', cfg.unsubSecret);
  return `${cfg.frontendUrl}/recruit/confirm?lead=${encodeURIComponent(leadId)}&sig=${encodeURIComponent(sig)}`;
}

function unsubscribeHeaders(url: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${url}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

/** Next due date for the step AFTER `stepJustSent`, measured from the consent/approval time. */
export function nextSendAtFor(base: Date, stepJustSent: number): Date | null {
  const next = stepJustSent + 1;
  if (next > SEQUENCE_LAST_STEP) return null;
  return new Date(base.getTime() + SEQUENCE_DAY_OFFSETS[next] * DAY_MS);
}

// ---------------------------------------------------------------------------
// Public: interest form, confirm, unsubscribe
// ---------------------------------------------------------------------------

export interface InterestInput {
  email: string;
  businessName: string;
  state?: string | null;
  src?: string | null;
  org?: string | null;
  ip?: string;
}

export type InterestOutcome = 'closed' | 'accepted';

/**
 * Always resolves to the same 'accepted' outcome for any address (suppressed, existing,
 * organizer, new) so the form cannot be used to learn which addresses exist. Returns
 * 'closed' only when the channel itself is off (same answer for every address).
 */
export async function submitInterest(input: InterestInput): Promise<InterestOutcome> {
  const cfg = getRecruitConfig();
  const gate = await channelOpenForSend(cfg);
  if (!gate.open) return 'closed';

  const email = normalizeEmail(input.email);
  if (await suppressionService.isSuppressed(email)) return 'accepted';
  if (await findOrganizerUserId(email)) return 'accepted';

  // Only link an organizer profile that exists and is still unclaimed.
  let organizerId: string | null = null;
  if (input.org) {
    const org = await prisma.organizer.findUnique({ where: { id: input.org }, select: { id: true, isClaimed: true } });
    if (org && !org.isClaimed) organizerId = org.id;
  }

  const existing = await prisma.recruitLead.findUnique({ where: { email } });
  let leadId: string;
  if (existing) {
    if (TERMINAL_STATUSES.includes(existing.status) || existing.consentAt) return 'accepted';
    leadId = existing.id;
    await prisma.recruitLead.update({
      where: { id: existing.id },
      data: {
        source: 'OPT_IN_FORM',
        status: 'PENDING_CONFIRM',
        sourceDetail: input.src ?? existing.sourceDetail,
        businessName: input.businessName,
        state: input.state ?? existing.state,
        organizerId: existing.organizerId ?? organizerId,
        skipReason: null,
      },
    });
  } else {
    try {
      const created = await prisma.recruitLead.create({
        data: {
          email,
          businessName: input.businessName,
          state: input.state ?? null,
          source: 'OPT_IN_FORM',
          sourceDetail: input.src ?? null,
          organizerId,
          status: 'PENDING_CONFIRM',
          createdBy: 'public:form',
        },
      });
      leadId = created.id;
    } catch (err) {
      // Concurrent submit for the same address: the unique index wins, answer generically.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return 'accepted';
      throw err;
    }
  }

  await sendConfirmation(leadId, email, cfg);
  return 'accepted';
}

/** One confirmation per address per 24h, three ever (claimed atomically). Counts toward the cap. */
async function sendConfirmation(leadId: string, email: string, cfg: RecruitConfig): Promise<void> {
  const now = new Date();
  const claim = await prisma.recruitLead.updateMany({
    where: {
      id: leadId,
      status: 'PENDING_CONFIRM',
      confirmSentCount: { lt: CONFIRM_MAX_EVER },
      OR: [{ lastConfirmSentAt: null }, { lastConfirmSentAt: { lt: new Date(now.getTime() - CONFIRM_MIN_INTERVAL_MS) } }],
    },
    data: { confirmSentCount: { increment: 1 }, lastConfirmSentAt: now },
  });
  if (claim.count === 0) return;

  const mx = await domainCanReceiveMail(email);
  if (!mx.ok) {
    await prisma.recruitLead.update({ where: { id: leadId }, data: { status: 'SKIPPED', skipReason: 'no_mx' } });
    return;
  }

  if (!(await reserveQuotaSlot(cfg.dailyCap))) {
    await recordCapReachedOnce();
    // Give the attempt back so the visitor can retry tomorrow.
    await prisma.recruitLead.update({
      where: { id: leadId },
      data: { confirmSentCount: { decrement: 1 }, lastConfirmSentAt: null, lastError: 'cap_reached_on_confirm' },
    });
    return;
  }

  const rendered = renderConfirmEmail({ confirmUrl: confirmUrl(cfg, leadId), mailingAddress: cfg.mailingAddress });
  const result = await sendRecruitEmail(cfg, { to: email, ...rendered }, { hasConsent: false, purpose: 'confirm' });
  await recordSendResult(leadId, email, 'CONFIRM', cfg, result, { isSequence: false });
}

export async function confirmLead(leadId: string, sig: string, ip?: string): Promise<boolean> {
  if (!verifyRecruitToken(leadId, sig, 'confirm')) return false;
  const lead = await prisma.recruitLead.findUnique({ where: { id: leadId } });
  if (!lead) return true; // valid signature, nothing to do (never reveal more)
  if (lead.status !== 'PENDING_CONFIRM' || lead.consentAt) return true; // idempotent

  const now = new Date();
  const autoApprove = lead.source === 'OPT_IN_FORM';
  await prisma.recruitLead.updateMany({
    where: { id: leadId, status: 'PENDING_CONFIRM' },
    data: {
      consentAt: now,
      consentSource: CONSENT_WORDING_VERSION,
      consentIpHash: hashConsentIp(ip),
      ...(autoApprove
        ? { status: 'APPROVED', approvedAt: now, approvedBy: 'system:auto-approve', nextSendAt: now, sequenceStep: 0 }
        : { status: 'QUEUED' }),
    },
  });
  return true;
}

export async function unsubscribeLead(leadId: string, sig: string): Promise<boolean> {
  if (!verifyRecruitToken(leadId, sig, 'unsub')) return false;
  const lead = await prisma.recruitLead.findUnique({ where: { id: leadId }, select: { id: true, email: true } });
  if (!lead) return true; // e.g. a test-send link; valid signature, no-op
  await suppressionService.processOptOut(lead.email); // global: the cold cron honors it too
  await prisma.recruitLead.update({
    where: { id: lead.id },
    data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date(), nextSendAt: null },
  });
  return true;
}

// ---------------------------------------------------------------------------
// Recording a provider result
// ---------------------------------------------------------------------------

type SendKind = 'CONFIRM' | 'STEP_1' | 'STEP_2' | 'STEP_3' | 'TEST';

async function recordSendResult(
  leadId: string,
  email: string,
  kind: SendKind,
  cfg: RecruitConfig,
  result: Awaited<ReturnType<typeof sendRecruitEmail>>,
  opts: { isSequence: boolean }
): Promise<'sent' | 'bounced' | 'failed' | 'refused'> {
  const now = new Date();
  if (result.ok) {
    await prisma.recruitSend.create({
      data: { leadId, kind, transport: cfg.transport, providerMessageId: result.providerMessageId, sentAt: now },
    });
    if (result.providerMessageId && kind !== 'TEST') {
      await prisma.recruitLead
        .update({ where: { id: leadId }, data: { providerMessageId: result.providerMessageId, transport: cfg.transport } })
        .catch(() => undefined);
    }
    return 'sent';
  }
  if (result.kind === 'invalid_recipient') {
    if (kind !== 'TEST') {
      await prisma.recruitSend.create({ data: { leadId, kind, transport: cfg.transport, sentAt: now, bouncedAt: now } });
      await suppressionService.addSuppression(email, 'hard_bounce');
      await prisma.recruitLead.update({
        where: { id: leadId },
        data: { status: 'BOUNCED', bouncedAt: now, nextSendAt: null, lastError: result.message },
      });
    }
    return 'bounced';
  }
  if (result.kind === 'refused') return 'refused';
  if (kind !== 'TEST') {
    await prisma.recruitLead.update({
      where: { id: leadId },
      data: { ...(opts.isSequence ? { status: 'FAILED', nextSendAt: null } : {}), lastError: result.message },
    });
  }
  return 'failed';
}

// ---------------------------------------------------------------------------
// Sequence send (cron)
// ---------------------------------------------------------------------------

export type SendOneOutcome = 'sent' | 'skipped' | 'bounced' | 'failed' | 'cap_reached' | 'refused' | 'not_claimed';

/** Claim -> guards -> cap -> render -> send -> record. Caller has already checked channelOpenForSend. */
export async function sendNextStepForLead(leadId: string, cfg: RecruitConfig): Promise<SendOneOutcome> {
  const claim = await prisma.recruitLead.updateMany({
    where: { id: leadId, status: 'APPROVED' },
    data: { status: 'SENDING' },
  });
  if (claim.count === 0) return 'not_claimed';

  const lead = await prisma.recruitLead.findUnique({ where: { id: leadId } });
  if (!lead) return 'not_claimed';

  const guard = await evaluateLeadGuards(lead, cfg);
  if (!guard.ok) {
    await prisma.recruitLead.update({
      where: { id: lead.id },
      data: {
        status: 'SKIPPED',
        skipReason: guard.skipReason,
        nextSendAt: null,
        ...(guard.convertedUserId ? { convertedAt: lead.convertedAt ?? new Date(), convertedUserId: guard.convertedUserId } : {}),
      },
    });
    return 'skipped';
  }

  if (!(await reserveQuotaSlot(cfg.dailyCap))) {
    await prisma.recruitLead.update({ where: { id: lead.id }, data: { status: 'APPROVED' } });
    await recordCapReachedOnce();
    return 'cap_reached';
  }

  const step = Math.min(lead.sequenceStep + 1, SEQUENCE_LAST_STEP) as 1 | 2 | 3;
  const rendered = renderSequenceEmail({
    step,
    source: lead.source,
    unsubscribeUrl: unsubscribeUrl(cfg, lead.id),
    mailingAddress: cfg.mailingAddress,
    frontendUrl: cfg.frontendUrl,
  });
  const result = await sendRecruitEmail(
    cfg,
    { to: lead.email, ...rendered, headers: unsubscribeHeaders(unsubscribeUrl(cfg, lead.id)) },
    { hasConsent: lead.consentAt !== null, purpose: 'sequence' }
  );

  const kind = `STEP_${step}` as SendKind;
  const recorded = await recordSendResult(lead.id, lead.email, kind, cfg, result, { isSequence: true });
  if (recorded === 'refused') {
    // Configuration problem, not the lead's fault: put it back and let the caller stop.
    await prisma.recruitLead.update({
      where: { id: lead.id },
      data: { status: 'APPROVED', lastError: result.ok ? null : (result as any).reason ?? null },
    });
    return 'refused';
  }
  if (recorded !== 'sent') return recorded;

  const base = lead.consentAt ?? lead.approvedAt ?? new Date();
  const next = nextSendAtFor(base, step);
  await prisma.recruitLead.update({
    where: { id: lead.id },
    data: {
      sequenceStep: step,
      sentAt: new Date(),
      transport: cfg.transport,
      lastError: null,
      status: next ? 'APPROVED' : 'SENT',
      nextSendAt: next,
    },
  });
  return 'sent';
}

/** Marks consented leads whose address now belongs to an organizer account as converted and stops them. */
export async function sweepConversions(limit = 500): Promise<number> {
  const candidates = await prisma.recruitLead.findMany({
    where: { convertedAt: null, status: { in: ['PENDING_CONFIRM', 'QUEUED', 'APPROVED', 'SENT'] } },
    select: { id: true, email: true, status: true },
    take: limit,
    orderBy: { updatedAt: 'desc' },
  });
  if (candidates.length === 0) return 0;
  const users = await prisma.user.findMany({
    where: {
      email: { in: candidates.map((c) => c.email) }, // lead emails are stored lowercased; the per-send guard re-checks case-insensitively
      OR: [{ roles: { has: 'ORGANIZER' } }, { role: 'ORGANIZER' }],
    },
    select: { id: true, email: true },
  });
  const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));
  let n = 0;
  for (const c of candidates) {
    const userId = byEmail.get(c.email);
    if (!userId) continue;
    const stop = c.status === 'SENT' ? {} : { status: 'SKIPPED' as const, skipReason: 'already_organizer', nextSendAt: null };
    await prisma.recruitLead.update({ where: { id: c.id }, data: { convertedAt: new Date(), convertedUserId: userId, ...stop } });
    n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Provider events (Resend webhook)
// ---------------------------------------------------------------------------

/** Called from the existing Resend webhook after its own processing. Never throws. */
export async function applyProviderEvent(emailId: string | undefined, type: string, bounceType?: string): Promise<void> {
  if (!emailId) return;
  try {
    const send = await prisma.recruitSend.findUnique({ where: { providerMessageId: emailId }, select: { id: true, leadId: true, kind: true } });
    if (!send) return;
    const now = new Date();
    const hard = (type === 'email.bounced' && bounceType === 'Permanent') || type === 'email.suppressed';
    if (hard) {
      await prisma.recruitSend.update({ where: { id: send.id }, data: { bouncedAt: now } });
      if (send.kind !== 'TEST') {
        await prisma.recruitLead.update({ where: { id: send.leadId }, data: { status: 'BOUNCED', bouncedAt: now, nextSendAt: null } });
      }
    } else if (type === 'email.complained') {
      await prisma.recruitSend.update({ where: { id: send.id }, data: { complainedAt: now } });
      if (send.kind !== 'TEST') {
        await prisma.recruitLead.update({ where: { id: send.leadId }, data: { status: 'COMPLAINED', complainedAt: now, nextSendAt: null } });
      }
    }
  } catch (err: any) {
    console.error('[recruit] applyProviderEvent failed:', err?.message ?? err);
  }
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export function sendabilityUnderTransport(
  lead: { source: RecruitLeadSource; consentAt: Date | null; status: RecruitLeadStatus },
  cfg: RecruitConfig
): { sendable: boolean; reason: string | null } {
  if (cfg.transport === 'none') return { sendable: false, reason: 'transport_none' };
  if (cfg.transport === 'gmail_dedicated') return { sendable: false, reason: 'transport_not_approved' };
  if (!lead.consentAt) return { sendable: false, reason: 'no_consent' };
  if (TERMINAL_STATUSES.includes(lead.status)) return { sendable: false, reason: lead.status.toLowerCase() };
  return { sendable: true, reason: null };
}

export async function buildFromDirectory(limit: number, adminId: string): Promise<{ created: number; examined: number }> {
  const candidates = await prisma.organizer.findMany({
    where: {
      isClaimed: false,
      claimStatus: 'UNCLAIMED',
      suppressOutreach: false,
      contactEmail: { not: null },
      emailDiscoveryMethod: { in: DIRECTORY_METHODS },
      emailDiscoveryConfidence: { gte: 0.7 },
      OR: [{ country: null }, { country: 'US' }],
      province: null,
      recruitLeads: { none: {} },
    },
    select: { id: true, businessName: true, contactEmail: true, licenseState: true },
    orderBy: { emailDiscoveryConfidence: 'desc' },
    take: Math.min(limit * 3, 600),
  });

  let created = 0;
  for (const org of candidates) {
    if (created >= limit) break;
    const email = normalizeEmail(org.contactEmail || '');
    if (!email.includes('@')) continue;
    const [lead, contacted, suppressed] = await Promise.all([
      prisma.recruitLead.findUnique({ where: { email }, select: { id: true } }),
      prisma.directoryClaimEmail.findFirst({
        where: { emailAddress: { equals: email, mode: 'insensitive' }, sentAt: { not: null } },
        select: { id: true },
      }),
      suppressionService.isSuppressed(email),
    ]);
    if (lead || contacted || suppressed) continue;
    try {
      await prisma.recruitLead.create({
        data: {
          email,
          businessName: org.businessName,
          state: org.licenseState ?? null,
          source: 'DIRECTORY',
          organizerId: org.id,
          status: 'QUEUED',
          createdBy: 'system:directory',
        },
      });
      created++;
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    }
  }
  console.log(`[recruit] admin ${adminId} built ${created} directory leads (examined ${candidates.length})`);
  return { created, examined: candidates.length };
}

export async function createManualLead(
  input: { email: string; businessName: string; state?: string | null; consentNote: string },
  adminId: string
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const email = normalizeEmail(input.email);
  if (await suppressionService.isSuppressed(email)) return { ok: false, error: 'This address is suppressed and cannot be added.' };
  const existing = await prisma.recruitLead.findUnique({ where: { email }, select: { id: true } });
  if (existing) return { ok: false, error: 'A lead with this email already exists.' };
  const lead = await prisma.recruitLead.create({
    data: {
      email,
      businessName: input.businessName,
      state: input.state ?? null,
      source: 'MANUAL',
      status: 'QUEUED',
      consentAt: new Date(),
      consentSource: `manual:${input.consentNote}`,
      createdBy: adminId,
    },
  });
  return { ok: true, id: lead.id };
}

export async function approveBatch(
  leadIds: string[],
  note: string | undefined,
  adminId: string,
  cfg: RecruitConfig
): Promise<{ batchId: string | null; approved: string[]; rejected: Array<{ id: string; reason: string }> }> {
  const unique = Array.from(new Set(leadIds));
  const leads = await prisma.recruitLead.findMany({ where: { id: { in: unique } } });
  const byId = new Map(leads.map((l) => [l.id, l]));
  const approvable: string[] = [];
  const rejected: Array<{ id: string; reason: string }> = [];
  for (const id of unique) {
    const lead = byId.get(id);
    if (!lead) { rejected.push({ id, reason: 'not_found' }); continue; }
    if (lead.status !== 'QUEUED') { rejected.push({ id, reason: `status_${lead.status.toLowerCase()}` }); continue; }
    const s = sendabilityUnderTransport(lead, cfg);
    if (!s.sendable) { rejected.push({ id, reason: s.reason || 'not_sendable' }); continue; }
    approvable.push(id);
  }
  if (approvable.length === 0) return { batchId: null, approved: [], rejected };

  const now = new Date();
  const batch = await prisma.$transaction(async (tx) => {
    const b = await tx.recruitBatch.create({ data: { approvedBy: adminId, leadCount: 0, note: note ?? null } });
    const res = await tx.recruitLead.updateMany({
      where: { id: { in: approvable }, status: 'QUEUED' },
      data: { status: 'APPROVED', batchId: b.id, approvedAt: now, approvedBy: adminId, nextSendAt: now, sequenceStep: 0 },
    });
    await tx.recruitBatch.update({ where: { id: b.id }, data: { leadCount: res.count } });
    await tx.recruitChannelEvent.create({
      data: { type: 'BATCH_APPROVED', reason: note ?? null, actorId: adminId, metrics: { leadCount: res.count } },
    });
    return b;
  });
  return { batchId: batch.id, approved: approvable, rejected };
}

export async function skipLead(leadId: string, reason: string): Promise<boolean> {
  const res = await prisma.recruitLead.updateMany({
    where: { id: leadId, status: { notIn: ['SENDING', 'UNSUBSCRIBED', 'BOUNCED', 'COMPLAINED'] } },
    data: { status: 'SKIPPED', skipReason: `admin:${reason}`, nextSendAt: null },
  });
  return res.count > 0;
}

const PREVIEW_UNSUB = '/recruit/unsubscribe?preview=1';

export async function previewLead(leadId: string, cfg: RecruitConfig): Promise<(RenderedEmail & { step: number }) | null> {
  const lead = await prisma.recruitLead.findUnique({ where: { id: leadId } });
  if (!lead) return null;
  const step = Math.min(lead.sequenceStep + 1, SEQUENCE_LAST_STEP) as 1 | 2 | 3;
  const rendered = renderSequenceEmail({
    step,
    source: lead.source,
    unsubscribeUrl: `${cfg.frontendUrl}${PREVIEW_UNSUB}`,
    mailingAddress: cfg.mailingAddress || '[mailing address not set: RECRUIT_MAILING_ADDRESS]',
    frontendUrl: cfg.frontendUrl,
  });
  return { ...rendered, step };
}

/** Sends the lead's next email to the ADMIN's own address only. Needs a ready transport, not the flag. */
export async function testSend(
  leadId: string,
  admin: { id: string; email: string },
  cfg: RecruitConfig
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ready = checkTransportReady(cfg);
  if (!ready.ok) return { ok: false, error: `Transport not ready: ${ready.reason}` };
  const lead = await prisma.recruitLead.findUnique({ where: { id: leadId } });
  if (!lead) return { ok: false, error: 'Lead not found' };
  if (!(await reserveQuotaSlot(cfg.dailyCap))) {
    await recordCapReachedOnce();
    return { ok: false, error: 'Daily cap reached' };
  }
  const step = Math.min(lead.sequenceStep + 1, SEQUENCE_LAST_STEP) as 1 | 2 | 3;
  // Unsubscribe link signed for a synthetic id, so clicking it in the test copy never touches the real lead.
  const unsub = unsubscribeUrl(cfg, `test_${admin.id}`);
  const rendered = renderSequenceEmail({
    step,
    source: lead.source,
    unsubscribeUrl: unsub,
    mailingAddress: cfg.mailingAddress,
    frontendUrl: cfg.frontendUrl,
  });
  const result = await sendRecruitEmail(
    cfg,
    { to: admin.email, ...rendered, subject: `[TEST] ${rendered.subject}`, headers: unsubscribeHeaders(unsub) },
    { hasConsent: true, purpose: 'test' }
  );
  await recordSendResult(lead.id, admin.email, 'TEST', cfg, result, { isSequence: false });
  if (!result.ok) return { ok: false, error: result.kind === 'refused' ? `Refused: ${result.reason}` : result.message };
  await prisma.recruitChannelEvent.create({ data: { type: 'TEST_SENT', reason: `lead ${lead.id}`, actorId: admin.id } });
  return { ok: true };
}
