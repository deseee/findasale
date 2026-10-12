/**
 * Organizer-recruitment cold-send channel: provider adapter, daily cap, health
 * gate and the single-lead send.
 *
 * Deliberately separate from everything else that sends mail:
 *  - never imports transactionalEmailService or the Gmail OUTREACH_* pipeline;
 *  - the provider lives behind sendRecruitEmail() so it can be swapped without
 *    touching the job, the webhook or the admin endpoints (provider choice is
 *    still pending Patrick's approval; the current adapter is Resend keyed on
 *    RECRUIT_RESEND_API_KEY, a separate account from the transactional one);
 *  - its own daily stats (RecruitDailyStat), its own pause flag (FeatureFlag key
 *    'recruit_send_paused'), and EmailSuppression rows tagged source='recruit'.
 *
 * Nothing sends unless RECRUIT_SEND_ENABLED is exactly "true",
 * RECRUIT_WARMUP_START_DATE is set, a physical address is configured and the
 * provider key is present. Those gates live in getRecruitSendBlockers() and are
 * checked by the job before every run.
 */

import jwt from 'jsonwebtoken';
import { Resend } from 'resend';
import { prisma } from '../lib/prisma';
import { recordApiUsage } from '../lib/aiCostTracker';
import { suppressionService } from './suppressionService';
import { renderRecruitEmail, RECRUIT_MAX_TOUCHES } from './recruitTemplates';

export const RECRUIT_PAUSE_FLAG_KEY = 'recruit_send_paused';
export const RECRUIT_TOUCH2_MIN_DAYS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const HARD_CEILING = 100;
const MIN_SENDS_FOR_RATE = 20;
const MAX_HARD_BOUNCES_PER_DAY = 3;

// ── Config ────────────────────────────────────────────────────────────────────

export function recruitSendEnabled(): boolean {
  return process.env.RECRUIT_SEND_ENABLED === 'true';
}

export function recruitPhysicalAddress(): string {
  return (process.env.RECRUIT_PHYSICAL_ADDRESS || process.env.OUTREACH_PHYSICAL_ADDRESS || '').trim();
}

function numEnv(name: string, fallback: number): number {
  const v = parseFloat(process.env[name] || '');
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

export function recruitThresholds(): { maxBounceRate: number; maxComplaintRate: number } {
  return {
    maxBounceRate: numEnv('RECRUIT_MAX_BOUNCE_RATE', 0.02),
    maxComplaintRate: numEnv('RECRUIT_MAX_COMPLAINT_RATE', 0.0008),
  };
}

export function recruitBackendUrl(): string | null {
  const url =
    process.env.RAILWAY_BACKEND_URL ||
    process.env.BACKEND_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined);
  return url ? url.replace(/\/+$/, '') : null;
}

/** Every reason the channel may not send right now. Empty array = config allows sending. */
export function getRecruitSendBlockers(): string[] {
  const blockers: string[] = [];
  if (!recruitSendEnabled()) blockers.push('RECRUIT_SEND_ENABLED is not "true"');
  if (!process.env.RECRUIT_RESEND_API_KEY) blockers.push('RECRUIT_RESEND_API_KEY is not set');
  if (!process.env.RECRUIT_UNSUB_SECRET) blockers.push('RECRUIT_UNSUB_SECRET is not set');
  if (!process.env.RECRUIT_WARMUP_START_DATE || !parseWarmupStart()) {
    blockers.push('RECRUIT_WARMUP_START_DATE is not set (or not a valid YYYY-MM-DD date)');
  }
  if (!recruitPhysicalAddress()) blockers.push('no physical address (RECRUIT_PHYSICAL_ADDRESS / OUTREACH_PHYSICAL_ADDRESS)');
  if (!recruitBackendUrl()) blockers.push('no backend URL for unsubscribe links (RAILWAY_BACKEND_URL / BACKEND_URL / RAILWAY_PUBLIC_DOMAIN)');
  return blockers;
}

// ── Provider adapter (swap here if the provider changes) ─────────────────────

export interface RecruitEmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  unsubscribeUrl: string;
}

export interface RecruitEmailResult {
  providerMessageId: string | null;
}

/**
 * The only function that talks to the email provider. Adds the RFC 8058
 * one-click unsubscribe headers, the Reply-To and the channel tag on every send.
 * Throws on any provider error so the caller never records a send that did not happen.
 */
export async function sendRecruitEmail(msg: RecruitEmailMessage): Promise<RecruitEmailResult> {
  const apiKey = process.env.RECRUIT_RESEND_API_KEY;
  if (!apiKey) throw new Error('RECRUIT_RESEND_API_KEY is not set');
  const resend = new Resend(apiKey);
  const from = process.env.RECRUIT_FROM_EMAIL || 'FindA.Sale <hello@join.finda.sale>';
  const replyTo = process.env.RECRUIT_REPLY_TO || 'support@finda.sale';

  const { data, error } = await resend.emails.send({
    from,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
    reply_to: replyTo,
    headers: {
      'List-Unsubscribe': `<${msg.unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    tags: [{ name: 'channel', value: 'recruit' }],
  });
  if (error) {
    throw new Error(`Recruit provider send failed: ${(error as any).name || ''} ${(error as any).message || String(error)}`.trim());
  }
  return { providerMessageId: data?.id ?? null };
}

// ── Daily stats + cap ─────────────────────────────────────────────────────────

export function recruitDateKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

type StatField = 'attempted' | 'sent' | 'hardBounced' | 'softBounced' | 'complained';

export async function bumpRecruitDailyStat(field: StatField, by = 1, d: Date = new Date()): Promise<void> {
  const date = recruitDateKey(d);
  const create = { date, attempted: 0, sent: 0, hardBounced: 0, softBounced: 0, complained: 0 };
  create[field] = by;
  const inc = { increment: by };
  const update =
    field === 'attempted' ? { attempted: inc }
    : field === 'sent' ? { sent: inc }
    : field === 'hardBounced' ? { hardBounced: inc }
    : field === 'softBounced' ? { softBounced: inc }
    : { complained: inc };
  await prisma.recruitDailyStat.upsert({ where: { date }, update, create });
}

function parseWarmupStart(): Date | null {
  const raw = (process.env.RECRUIT_WARMUP_START_DATE || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Today's send cap. 0 when the warmup start date is unset or in the future.
 * Ramp: 20/day week 1, 30 week 2, 50 week 3, 75 week 4, then 100.
 * Result = min(ramp, RECRUIT_DAILY_CAP, 100).
 */
export function computeDailyCap(now: Date = new Date()): number {
  const start = parseWarmupStart();
  if (!start) return 0;
  const elapsedMs = now.getTime() - start.getTime();
  if (elapsedMs < 0) return 0;
  const week = Math.floor(elapsedMs / (7 * DAY_MS)); // 0-based
  const ramp = week === 0 ? 20 : week === 1 ? 30 : week === 2 ? 50 : week === 3 ? 75 : 100;
  const configured = Math.floor(numEnv('RECRUIT_DAILY_CAP', 20));
  return Math.max(0, Math.min(ramp, configured, HARD_CEILING));
}

export async function getTodayAttempted(): Promise<number> {
  const row = await prisma.recruitDailyStat.findUnique({ where: { date: recruitDateKey() } });
  return row?.attempted ?? 0;
}

// ── Pause flag ────────────────────────────────────────────────────────────────

export interface RecruitPauseState {
  paused: boolean;
  reason: string | null;
  updatedBy: string | null;
  updatedAt: Date | null;
}

export async function getPauseState(): Promise<RecruitPauseState> {
  const flag = await prisma.featureFlag.findUnique({ where: { key: RECRUIT_PAUSE_FLAG_KEY } });
  if (!flag) return { paused: false, reason: null, updatedBy: null, updatedAt: null };
  return { paused: flag.enabled, reason: flag.description || null, updatedBy: flag.updatedBy, updatedAt: flag.updatedAt };
}

export async function setPaused(paused: boolean, reason: string, updatedBy: string | null): Promise<void> {
  await prisma.featureFlag.upsert({
    where: { key: RECRUIT_PAUSE_FLAG_KEY },
    update: { enabled: paused, description: reason.slice(0, 500), updatedBy },
    create: { key: RECRUIT_PAUSE_FLAG_KEY, enabled: paused, description: reason.slice(0, 500), updatedBy },
  });
}

/** Out-of-band alert to QUOTA_ALERT_EMAIL via the existing alert rail (main RESEND_API_KEY, same as gmailHealthCron). */
async function sendPauseAlert(reason: string, metrics: RecruitHealthMetrics): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.QUOTA_ALERT_EMAIL;
  if (!apiKey || !to) {
    console.error('[Recruit] Cannot send pause alert: RESEND_API_KEY or QUOTA_ALERT_EMAIL not set');
    return;
  }
  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'FindA.Sale Alerts <alerts@finda.sale>',
      to,
      subject: 'Recruit cold-send channel auto-paused',
      text:
        `The organizer-recruitment send channel paused itself.\n\nReason: ${reason}\n\n` +
        `Last 7 days: ${metrics.sent7d} sent, ${metrics.hardBounces7d} hard bounces, ${metrics.complaints7d} complaints.\n` +
        `Today: ${metrics.hardBouncesToday} hard bounces.\n\n` +
        'Sending stays off until an admin resumes it (POST /api/admin/recruit/resume), which is refused while health is still failing.',
    });
  } catch (err: any) {
    console.error('[Recruit] Pause alert failed:', err?.message || err);
  }
}

// ── Health ────────────────────────────────────────────────────────────────────

export interface RecruitHealthMetrics {
  sent7d: number;
  hardBounces7d: number;
  complaints7d: number;
  hardBouncesToday: number;
  hardBounceRate7d: number;
  complaintRate7d: number;
}

export interface RecruitHealth {
  ok: boolean;
  reason: string | null;
  metrics: RecruitHealthMetrics;
}

export async function computeHealth(now: Date = new Date()): Promise<RecruitHealth> {
  const since = new Date(now.getTime() - 7 * DAY_MS);
  const startOfToday = new Date(`${recruitDateKey(now)}T00:00:00Z`);
  const [sent7d, hardBounces7d, complaints7d, hardBouncesToday] = await Promise.all([
    prisma.recruitSend.count({ where: { sentAt: { gte: since } } }),
    prisma.recruitSend.count({ where: { bouncedAt: { gte: since }, bounceType: 'Permanent' } }),
    prisma.recruitSend.count({ where: { complainedAt: { gte: since } } }),
    prisma.recruitSend.count({ where: { bouncedAt: { gte: startOfToday }, bounceType: 'Permanent' } }),
  ]);
  const hardBounceRate7d = sent7d > 0 ? hardBounces7d / sent7d : 0;
  const complaintRate7d = sent7d > 0 ? complaints7d / sent7d : 0;
  const metrics = { sent7d, hardBounces7d, complaints7d, hardBouncesToday, hardBounceRate7d, complaintRate7d };
  const { maxBounceRate, maxComplaintRate } = recruitThresholds();

  let reason: string | null = null;
  if (hardBouncesToday >= MAX_HARD_BOUNCES_PER_DAY) {
    reason = `${hardBouncesToday} hard bounces today (limit ${MAX_HARD_BOUNCES_PER_DAY - 1})`;
  } else if (sent7d >= MIN_SENDS_FOR_RATE && hardBounceRate7d > maxBounceRate) {
    reason = `7-day hard-bounce rate ${(hardBounceRate7d * 100).toFixed(2)}% exceeds ${(maxBounceRate * 100).toFixed(2)}%`;
  } else if (sent7d >= MIN_SENDS_FOR_RATE && complaintRate7d >= maxComplaintRate) {
    reason = `7-day complaint rate ${(complaintRate7d * 100).toFixed(3)}% is at or above ${(maxComplaintRate * 100).toFixed(3)}%`;
  } else if (sent7d < MIN_SENDS_FOR_RATE && complaints7d > 0) {
    reason = `${complaints7d} complaint(s) with only ${sent7d} sends in the last 7 days`;
  }
  return { ok: reason === null, reason, metrics };
}

/**
 * Compute health and, if it fails, set the pause flag and alert (once: an
 * already-paused channel is not re-alerted). Called before every send and after
 * every bounce or complaint webhook.
 */
export async function evaluateHealth(): Promise<RecruitHealth> {
  const health = await computeHealth();
  if (!health.ok && health.reason) {
    const state = await getPauseState();
    if (!state.paused) {
      const reason = `auto: ${health.reason}`;
      await setPaused(true, reason, null);
      console.warn(`[Recruit] Channel auto-paused: ${health.reason}`);
      await sendPauseAlert(health.reason, health.metrics);
    }
  }
  return health;
}

// ── Unsubscribe token ─────────────────────────────────────────────────────────

export function buildRecruitUnsubscribeUrl(email: string, leadId: string): string {
  const secret = process.env.RECRUIT_UNSUB_SECRET;
  const base = recruitBackendUrl();
  if (!secret || !base) throw new Error('RECRUIT_UNSUB_SECRET or backend URL missing');
  const token = jwt.sign({ email: email.toLowerCase(), leadId, ch: 'recruit' }, secret, {
    algorithm: 'HS256',
    expiresIn: '365d',
  });
  return `${base}/api/recruit/unsubscribe?token=${encodeURIComponent(token)}`;
}

// ── Single send ───────────────────────────────────────────────────────────────

export interface RecruitLeadForSend {
  id: string;
  email: string;
  businessName: string;
  contactName: string | null;
  city: string | null;
  touchCount: number;
  status: string;
}

export type SendOneOutcome =
  | { ok: true; touchNumber: number; providerMessageId: string | null }
  | { ok: false; skipped: string };

/**
 * Send the next touch to one lead. Re-checks suppression immediately before
 * sending, claims the lead (status -> QUEUED) so an overlapping caller cannot
 * double-send, and only records the RecruitSend row after the provider
 * accepted the message.
 */
export async function sendOne(lead: RecruitLeadForSend): Promise<SendOneOutcome> {
  const businessName = (lead.businessName || '').trim();
  if (!businessName) return { ok: false, skipped: 'missing businessName' };
  const touchNumber = lead.touchCount + 1;
  if (touchNumber > RECRUIT_MAX_TOUCHES) return { ok: false, skipped: 'max touches reached' };

  const email = lead.email.toLowerCase();
  if (await suppressionService.isSuppressed(email)) {
    await prisma.recruitLead.update({ where: { id: lead.id }, data: { status: 'SUPPRESSED', nextSendAt: null } });
    return { ok: false, skipped: 'suppressed' };
  }

  const unsubscribeUrl = buildRecruitUnsubscribeUrl(email, lead.id);
  const rendered = renderRecruitEmail(
    touchNumber,
    { businessName, city: lead.city, contactName: lead.contactName },
    { unsubscribeUrl, physicalAddress: recruitPhysicalAddress(), siteUrl: process.env.FRONTEND_URL || 'https://finda.sale' }
  );

  // Claim: only one caller can move this lead out of its sendable status.
  const previousStatus = lead.status as 'VERIFIED' | 'SENT';
  const claim = await prisma.recruitLead.updateMany({
    where: { id: lead.id, status: previousStatus, touchCount: lead.touchCount },
    data: { status: 'QUEUED' },
  });
  if (claim.count === 0) return { ok: false, skipped: 'claimed by another run' };

  await bumpRecruitDailyStat('attempted');
  let result: RecruitEmailResult;
  try {
    result = await sendRecruitEmail({ to: email, subject: rendered.subject, text: rendered.text, html: rendered.html, unsubscribeUrl });
  } catch (err) {
    await prisma.recruitLead.update({ where: { id: lead.id }, data: { status: previousStatus } });
    throw err;
  }

  const now = new Date();
  const isLast = touchNumber >= RECRUIT_MAX_TOUCHES;
  await prisma.$transaction([
    prisma.recruitSend.create({
      data: { leadId: lead.id, touchNumber, resendEmailId: result.providerMessageId, subject: rendered.subject, sentAt: now },
    }),
    prisma.recruitLead.update({
      where: { id: lead.id },
      data: {
        status: isLast ? 'DONE' : 'SENT',
        touchCount: touchNumber,
        lastSentAt: now,
        nextSendAt: isLast ? null : new Date(now.getTime() + RECRUIT_TOUCH2_MIN_DAYS * DAY_MS),
      },
    }),
  ]);
  await bumpRecruitDailyStat('sent');
  try {
    await recordApiUsage('resend:recruit', 0, 1);
  } catch {
    /* cost tracking must never block a send */
  }
  return { ok: true, touchNumber, providerMessageId: result.providerMessageId };
}

/** Tag a suppression row as written by this channel (only if no other channel claimed it first). */
export async function tagSuppressionSource(email: string): Promise<void> {
  await prisma.emailSuppression.updateMany({
    where: { emailAddress: email.toLowerCase(), source: null },
    data: { source: 'recruit' },
  });
}
