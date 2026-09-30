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
 */
import { prisma } from '../lib/prisma';

export type BillingChargeKind = 'RENEWAL' | 'SUBSCRIBE' | 'UPGRADE';

export const PENDING_STALE_MS = 10 * 60 * 1000;

export type BillingChargeClaim =
  | { state: 'claimed'; id: string }
  | { state: 'already_completed'; id: string; paymentId: string | null }
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
    select: { id: true, status: true, squarePaymentId: true, updatedAt: true },
  });
  if (!row) return { state: 'in_progress' };

  if (row.status === 'COMPLETED') {
    return { state: 'already_completed', id: row.id, paymentId: row.squarePaymentId ?? null };
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
