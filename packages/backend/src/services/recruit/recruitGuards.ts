/**
 * recruitGuards.ts -- ADR-139 §5 guards for the recruit channel.
 *
 *  - Kill switch: env RECRUIT_SEND_ENABLED + FeatureFlag recruit_send_enabled + transport != none.
 *  - Daily cap: atomic raw-SQL increment on RecruitQuotaLog (never the outreach quota tables).
 *  - Health / auto-pause (sales-ops review changes 1 and 8): pause on any complaint, on
 *    RECRUIT_BOUNCE_PAUSE_ABSOLUTE (2) hard bounces in the window with no minimum sample, or on
 *    hard/sent > RECRUIT_BOUNCE_PAUSE_PCT once sent >= RECRUIT_BOUNCE_MIN_SAMPLE. Confirmation
 *    emails are counted (every send lives in RecruitSend). Pausing flips the flag off, writes an
 *    AUTO_PAUSED event and notifies every admin in-app and by email. Only a human can resume.
 *  - Per-lead guards, including already_organizer (sales-ops review change 3).
 */
import { prisma } from '../../lib/prisma';
import { suppressionService } from '../suppressionService';
import { createNotification } from '../notificationService';
import { domainCanReceiveMail } from '../../lib/mxValidator';
import { RecruitConfig, RECRUIT_FLAG_KEY } from './recruitConfig';
import { checkTransportReady } from './recruitTransport';

// ---------------------------------------------------------------------------
// Kill switch
// ---------------------------------------------------------------------------

export interface KillSwitchState {
  env: boolean;
  flag: boolean;
  transport: string;
  transportOk: boolean;
  open: boolean;
}

export async function readFlagEnabled(): Promise<boolean> {
  const row = await prisma.featureFlag.findUnique({ where: { key: RECRUIT_FLAG_KEY }, select: { enabled: true } });
  return row?.enabled === true; // missing row = OFF
}

export async function getKillSwitchState(cfg: RecruitConfig): Promise<KillSwitchState> {
  const flag = await readFlagEnabled();
  return {
    env: cfg.sendEnabledEnv,
    flag,
    transport: cfg.transport,
    transportOk: cfg.transport !== 'none',
    open: cfg.sendEnabledEnv && flag && cfg.transport !== 'none',
  };
}

// ---------------------------------------------------------------------------
// Daily cap
// ---------------------------------------------------------------------------

export function utcDateKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Atomically takes one slot of today's cap. Returns false when the cap is reached. */
export async function reserveQuotaSlot(cap: number, now: Date = new Date()): Promise<boolean> {
  const date = utcDateKey(now);
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "RecruitQuotaLog" ("date", "count", "updatedAt")
    VALUES (${date}, 1, now())
    ON CONFLICT ("date") DO UPDATE
      SET "count" = "RecruitQuotaLog"."count" + 1, "updatedAt" = now()
      WHERE "RecruitQuotaLog"."count" < ${cap}
    RETURNING "count"`;
  return Array.isArray(rows) && rows.length > 0;
}

export async function quotaUsedToday(now: Date = new Date()): Promise<number> {
  const row = await prisma.recruitQuotaLog.findUnique({ where: { date: utcDateKey(now) } });
  return row?.count ?? 0;
}

/** Writes one CAP_REACHED event per UTC day. */
export async function recordCapReachedOnce(now: Date = new Date()): Promise<void> {
  const startOfDay = new Date(`${utcDateKey(now)}T00:00:00.000Z`);
  const existing = await prisma.recruitChannelEvent.findFirst({
    where: { type: 'CAP_REACHED', createdAt: { gte: startOfDay } },
    select: { id: true },
  });
  if (!existing) {
    await prisma.recruitChannelEvent.create({ data: { type: 'CAP_REACHED', reason: 'Daily cap reached', actorId: 'system:cron' } });
  }
}

// ---------------------------------------------------------------------------
// Health / auto-pause
// ---------------------------------------------------------------------------

export interface HealthMetrics {
  windowDays: number;
  sent: number;
  hardBounces: number;
  complaints: number;
  bouncePct: number;
}

export interface HealthResult {
  shouldPause: boolean;
  reason: string | null;
  metrics: HealthMetrics;
}

/** Pure decision on already-counted metrics (unit-testable). */
export function decideHealth(
  m: { sent: number; hardBounces: number; complaints: number },
  cfg: Pick<RecruitConfig, 'bouncePausePct' | 'bounceMinSample' | 'bouncePauseAbsolute' | 'bounceWindowDays'>
): HealthResult {
  const bouncePct = m.sent > 0 ? (m.hardBounces / m.sent) * 100 : 0;
  const metrics: HealthMetrics = { windowDays: cfg.bounceWindowDays, ...m, bouncePct: Math.round(bouncePct * 100) / 100 };
  if (m.complaints > 0) {
    return { shouldPause: true, reason: `${m.complaints} spam complaint(s) in the last ${cfg.bounceWindowDays} days`, metrics };
  }
  if (m.hardBounces >= cfg.bouncePauseAbsolute) {
    return { shouldPause: true, reason: `${m.hardBounces} hard bounces in the last ${cfg.bounceWindowDays} days`, metrics };
  }
  if (m.sent >= cfg.bounceMinSample && bouncePct > cfg.bouncePausePct) {
    return {
      shouldPause: true,
      reason: `Hard-bounce rate ${metrics.bouncePct}% is above ${cfg.bouncePausePct}% over ${m.sent} sends`,
      metrics,
    };
  }
  return { shouldPause: false, reason: null, metrics };
}

export async function evaluateHealth(cfg: RecruitConfig, now: Date = new Date()): Promise<HealthResult> {
  const since = new Date(now.getTime() - cfg.bounceWindowDays * 24 * 60 * 60 * 1000);
  const [sent, hardBounces, complaints] = await Promise.all([
    // Confirmation emails count here; admin test sends to the admin's own inbox do not.
    prisma.recruitSend.count({ where: { sentAt: { gte: since }, kind: { not: 'TEST' } } }),
    prisma.recruitSend.count({ where: { bouncedAt: { gte: since } } }),
    prisma.recruitSend.count({ where: { complainedAt: { gte: since } } }),
  ]);
  return decideHealth({ sent, hardBounces, complaints }, cfg);
}

async function notifyAdminsAutoPaused(reason: string): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: { OR: [{ roles: { has: 'ADMIN' } }, { role: 'ADMIN' }] },
      select: { id: true },
    });
    if (admins.length === 0) {
      console.warn('[recruit] auto-paused but no ADMIN users found to notify');
      return;
    }
    const title = 'Recruit emails paused automatically';
    const body = `The organizer recruit channel stopped sending: ${reason}. It stays paused until an admin resumes it from the recruit page.`;
    await Promise.all(
      admins.map((a) =>
        createNotification(a.id, 'recruit_auto_paused', title, body, '/admin/recruit', 'OPERATIONAL', true, '[FindA.Sale] Recruit emails paused automatically')
      )
    );
  } catch (err: any) {
    console.warn('[recruit] failed to notify admins of auto-pause:', err?.message ?? err);
  }
}

/** Flips the flag off, records AUTO_PAUSED with a metrics snapshot, notifies admins. */
export async function autoPause(health: HealthResult): Promise<void> {
  const reason = health.reason || 'Health check failed';
  const updated = await prisma.featureFlag.updateMany({
    where: { key: RECRUIT_FLAG_KEY, enabled: true },
    data: { enabled: false, updatedBy: 'system:auto-pause' },
  });
  // Only the transition writes an event and notifies (no repeat alerts every tick).
  if (updated.count > 0) {
    await prisma.recruitChannelEvent.create({
      data: { type: 'AUTO_PAUSED', reason, metrics: health.metrics as any, actorId: 'system:auto-pause' },
    });
    await notifyAdminsAutoPaused(reason);
  }
}

/**
 * Single gate for anything that is about to send to a lead (sequence or confirmation):
 * kill switch open, transport passes isolation checks, health OK (auto-pausing if not).
 */
export async function channelOpenForSend(cfg: RecruitConfig): Promise<{ open: true } | { open: false; reason: string }> {
  const ks = await getKillSwitchState(cfg);
  if (!ks.env) return { open: false, reason: 'env_off' };
  if (!ks.transportOk) return { open: false, reason: 'transport_none' };
  if (!ks.flag) return { open: false, reason: 'flag_off' };
  const ready = checkTransportReady(cfg);
  if (!ready.ok) return { open: false, reason: ready.reason };
  const health = await evaluateHealth(cfg);
  if (health.shouldPause) {
    await autoPause(health);
    return { open: false, reason: 'auto_paused' };
  }
  return { open: true };
}

// ---------------------------------------------------------------------------
// Per-lead guards
// ---------------------------------------------------------------------------

export interface GuardLead {
  id: string;
  email: string;
  consentAt: Date | null;
  organizerId: string | null;
}

export type LeadGuardResult =
  | { ok: true }
  | { ok: false; skipReason: string; convertedUserId?: string };

/** Returns the User id when this address belongs to an organizer account. */
export async function findOrganizerUserId(email: string): Promise<string | null> {
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, role: true, roles: true },
  });
  if (!user) return null;
  const isOrganizer = user.role === 'ORGANIZER' || (Array.isArray(user.roles) && user.roles.includes('ORGANIZER'));
  return isOrganizer ? user.id : null;
}

export async function evaluateLeadGuards(lead: GuardLead, cfg: RecruitConfig): Promise<LeadGuardResult> {
  if (cfg.transport === 'gmail_dedicated') return { ok: false, skipReason: 'transport_not_approved' };
  if (cfg.transport === 'resend_optin' && !lead.consentAt) return { ok: false, skipReason: 'no_consent' };

  const organizerUserId = await findOrganizerUserId(lead.email);
  if (organizerUserId) return { ok: false, skipReason: 'already_organizer', convertedUserId: organizerUserId };

  if (await suppressionService.isSuppressed(lead.email)) return { ok: false, skipReason: 'suppressed' };

  if (lead.organizerId) {
    const org = await prisma.organizer.findUnique({
      where: { id: lead.organizerId },
      select: { isClaimed: true, suppressOutreach: true, claimStatus: true },
    });
    if (!org || org.isClaimed || org.suppressOutreach || org.claimStatus === 'OPTED_OUT' || org.claimStatus === 'CLAIMED') {
      return { ok: false, skipReason: 'organizer_state' };
    }
  }

  // Never a second channel for an address the cold cron already contacted -- unless the
  // person has since given their own consent (e.g. through the interest-form link).
  if (!lead.consentAt) {
    const contacted = await prisma.directoryClaimEmail.findFirst({
      where: { emailAddress: { equals: lead.email, mode: 'insensitive' }, sentAt: { not: null } },
      select: { id: true },
    });
    if (contacted) return { ok: false, skipReason: 'contacted_by_other_channel' };
  }

  const mx = await domainCanReceiveMail(lead.email);
  if (!mx.ok) return { ok: false, skipReason: 'no_mx' };

  return { ok: true };
}

/** Send window for sequence steps 2 and 3: 14:00-22:00 UTC, Monday to Friday. */
export function inSendWindow(now: Date = new Date()): boolean {
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  return day >= 1 && day <= 5 && hour >= 14 && hour < 22;
}
