/**
 * organizerBillingLedger.ts -- durable "was this period already charged?" record for organizer
 * PRO/TEAMS subscription charges (2026-09-29).
 *
 * One OrganizerBillingCharge row per (organizerId, periodKey). The row is CLAIMED as PENDING
 * before Square is called and then set to COMPLETED (with the Square payment id) or FAILED.
 * Guarantees, used by both jobs/squareBillingChargeJob.ts (renewals) and
 * controllers/billingController.ts createSquareBillingSubscription (first charge / upgrade):
 *   - the UNIQUE (organizerId, periodKey) means one period can only ever be charged once;
 *   - COMPLETED is terminal: failBillingCharge never overwrites it, and a retry that finds a
 *     COMPLETED row is told so (state 'already_completed') so the caller re-applies its grant
 *     WITHOUT charging again;
 *   - a PENDING row younger than PENDING_STALE_MS belongs to a live attempt (state 'in_progress');
 *     an older one is a crashed attempt and may be re-claimed (the Square idempotency key is the
 *     same, so Square itself dedupes if the first attempt actually went through).
 *
 * ONE ROW PER ORGANIZER PERIOD, ACROSS BOTH CALLERS (2026-09-30): the renewal job keys a due period as
 * `renewal:<periodEndISO>`. When an organizer whose period already ended (dunning, or a lapsed trial)
 * subscribes, createSquareBillingSubscription claims that SAME `renewal:<periodEndISO>` key (see
 * renewalPeriodKey in utils/billingPeriod.ts), so the job and a manual subscribe are mutually exclusive by this table's unique
 * index: whichever claims first charges, the other gets 'in_progress' or 'already_completed' and never
 * calls Square. No advisory lock is needed (a lock would have to span a network call to Square).
 */
import { prisma } from '../lib/prisma';

export type BillingChargeKind = 'RENEWAL' | 'SUBSCRIBE' | 'UPGRADE' | 'HUNT_PASS_RENEWAL';

/**
 * Hunt Pass renewals (2026-09-29) reuse this ledger without a schema change: the `organizerId`
 * column is a plain string (no foreign key), so a Hunt Pass row stores the shopper's USER id there,
 * and the periodKey carries a `huntpass:` discriminator plus the period start, so it can never
 * collide with an organizer row (`renewal:`, `subscribe:`, `upgrade:`).
 */
export function huntPassPeriodKey(userId: string, periodStart: Date): string {
  return `huntpass:${userId}:${periodStart.toISOString()}`;
}

export const PENDING_STALE_MS = 10 * 60 * 1000;

export type BillingChargeClaim =
  | { state: 'claimed'; id: string }
  | {
      state: 'already_completed';
      id: string;
      paymentId: string | null;
      /** 2026-09-30: what the COMPLETED row actually charged, so a caller that finds an already-paid
       *  period grants the tier that was PAID (a paid PRO must never be silently re-charged as TEAMS). */
      tier: string;
      amountCents: number;
      kind: string;
    }
  | { state: 'in_progress' };

export interface ClaimBillingChargeParams {
  organizerId: string;
  periodKey: string;
  kind: BillingChargeKind;
  tier: string;
  amountCents: number;
}

function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: unknown }).code === 'P2002';
}

export async function claimBillingCharge(params: ClaimBillingChargeParams): Promise<BillingChargeClaim> {
  const { organizerId, periodKey, kind, tier, amountCents } = params;

  try {
    const created = await prisma.organizerBillingCharge.create({
      data: { organizerId, periodKey, kind, tier, amountCents, status: 'PENDING', attempts: 1 },
      select: { id: true },
    });
    return { state: 'claimed', id: created.id };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }

  const row = await prisma.organizerBillingCharge.findUnique({
    where: { organizerId_periodKey: { organizerId, periodKey } },
    select: { id: true, status: true, squarePaymentId: true, updatedAt: true, tier: true, amountCents: true, kind: true },
  });
  if (!row) return { state: 'in_progress' };

  if (row.status === 'COMPLETED') {
    return {
      state: 'already_completed',
      id: row.id,
      paymentId: row.squarePaymentId ?? null,
      tier: row.tier,
      amountCents: row.amountCents,
      kind: row.kind,
    };
  }

  if (row.status === 'FAILED') {
    const reclaimed = await prisma.organizerBillingCharge.updateMany({
      where: { id: row.id, status: 'FAILED' },
      data: { status: 'PENDING', tier, amountCents, failureReason: null, attempts: { increment: 1 } },
    });
    return reclaimed.count === 1 ? { state: 'claimed', id: row.id } : { state: 'in_progress' };
  }

  // PENDING: a live attempt, or a crashed one.
  const ageMs = Date.now() - new Date(row.updatedAt).getTime();
  if (ageMs > PENDING_STALE_MS) {
    const reclaimed = await prisma.organizerBillingCharge.updateMany({
      where: { id: row.id, status: 'PENDING', updatedAt: row.updatedAt },
      data: { tier, amountCents, attempts: { increment: 1 } },
    });
    return reclaimed.count === 1 ? { state: 'claimed', id: row.id } : { state: 'in_progress' };
  }
  return { state: 'in_progress' };
}

/** How far back a COMPLETED-but-unactivated subscribe charge is still re-applied instead of re-charged. */
export const SUBSCRIBE_REAPPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * UTC-day edge for controllers/billingController.ts createSquareBillingSubscription (2026-09-29).
 * A first-paid-period subscribe whose period end is NOT already past uses periodKey
 * `subscribe:<period end or none>:<UTC day>` (no tier in the key since 2026-09-30, so a PRO and a TEAMS
 * attempt for the same period share one row and cannot both charge). If the charge went through (row
 * COMPLETED) but activating the plan failed, the organizer's period end is still the same, so a retry on
 * the SAME UTC day finds the same key and re-applies the grant. A retry after UTC midnight builds a NEW
 * key and would charge again. This looks up a COMPLETED SUBSCRIBE row for the same organizer + period-end
 * created within the last SUBSCRIBE_REAPPLY_WINDOW_MS (any UTC day, ANY tier) and returns its exact
 * periodKey and the tier that was PAID, so the caller claims it (state 'already_completed') and grants
 * that paid tier instead of charging a new period. Because the period end is part of the key, a plan
 * that WAS activated (its period end moved) never matches. Matching is by `contains ':<periodEnd>:'` so
 * rows written before the tier was dropped from the key (`subscribe:<TIER>:<periodEnd>:<day>`) still match.
 */
export async function findRecentCompletedSubscribeCharge(params: {
  organizerId: string;
  periodEndKey: string; // ISO string of the organizer's current billingCurrentPeriodEnd, or 'none'
  now?: Date;
}): Promise<{ id: string; periodKey: string; paymentId: string | null; tier: string; amountCents: number } | null> {
  const { organizerId, periodEndKey } = params;
  const since = new Date((params.now ?? new Date()).getTime() - SUBSCRIBE_REAPPLY_WINDOW_MS);
  const row = await prisma.organizerBillingCharge.findFirst({
    where: {
      organizerId,
      kind: 'SUBSCRIBE',
      status: 'COMPLETED',
      periodKey: { startsWith: 'subscribe:', contains: `:${periodEndKey}:` },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, periodKey: true, squarePaymentId: true, tier: true, amountCents: true },
  });
  return row
    ? { id: row.id, periodKey: row.periodKey, paymentId: row.squarePaymentId ?? null, tier: row.tier, amountCents: row.amountCents }
    : null;
}

/** Record a COMPLETED Square payment. COMPLETED always wins over PENDING/FAILED. */
export async function completeBillingCharge(id: string, paymentId: string): Promise<void> {
  await prisma.organizerBillingCharge.updateMany({
    where: { id },
    data: { status: 'COMPLETED', squarePaymentId: paymentId, failureReason: null, completedAt: new Date() },
  });
}

/**
 * Record a failed attempt. Returns false (and writes nothing) when the row is already COMPLETED:
 * a FAILED status must never overwrite a paid period, so the caller must then treat the period as
 * paid instead of running its failure / dunning handling.
 */
export async function failBillingCharge(id: string, reason: string): Promise<boolean> {
  const res = await prisma.organizerBillingCharge.updateMany({
    where: { id, status: { not: 'COMPLETED' } },
    data: { status: 'FAILED', failureReason: reason.slice(0, 500) },
  });
  return res.count === 1;
}
