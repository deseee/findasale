/**
 * Subscription credit ledger (roadmap #661, 2026-10-23).
 *
 * The organizer-to-organizer referral reward is a credit on the referrer's own PRO/TEAMS subscription (roadmap #621
 * decision), held in SubscriptionCreditEntry. Rows are append-only in amount; only `status` ever changes
 * (ACTIVE <-> HELD by admin review, -> VOID). The balance is always a SUM, never a stored number, so there is no counter
 * that can drift from the rows.
 *
 *   available = SUM(amountCents) of ACTIVE rows whose availableAt has passed (can be negative after a clawback of credit
 *               that was already spent: later earnings pay that down first)
 *   pending   = SUM(amountCents) of ACTIVE rows still inside their hold
 *   held      = SUM(amountCents) of HELD rows (parked for fraud review, never usable until an admin approves)
 *
 * Every write that reads the balance first runs under a per-user Postgres advisory lock (lockKeyForUser), shared with
 * the referral earn / clawback path in affiliateService.ts, so two writers can never both spend the same credit.
 */
import { prisma } from '../lib/prisma';
import { MIN_CARD_SALE_CENTS } from '../utils/feeCalculator';
import { isReferralCreditEnabled } from '../config/affiliateConfig';

export type CreditEntryStatus = 'ACTIVE' | 'HELD' | 'VOID';
export type CreditEntryKind = 'REFERRAL_EARNED' | 'REFERRAL_ADJUSTMENT' | 'RENEWAL_APPLIED' | 'ADMIN_ADJUSTMENT';

export interface CreditBalance {
  availableCents: number;
  pendingCents: number;
  heldCents: number;
}

/** One advisory-lock key per credit owner. Every balance-reading writer takes it. */
export function lockKeyForUser(userId: string): string {
  return `subscription-credit:${userId}`;
}

/**
 * Runs `fn` inside a transaction holding the user's advisory lock. Fails CLOSED: if the lock cannot be taken the error
 * propagates, the caller treats it as "no credit this time", and nothing is written (credit is never time-critical:
 * the sweep job retries, and a renewal simply charges the card in full).
 */
export async function withCreditLock<T>(userId: string, fn: (tx: any) => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx: any) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKeyForUser(userId)}))`;
      return fn(tx);
    },
    { timeout: 30000, maxWait: 10000 }
  );
}

function sumCents(rows: Array<{ amountCents: number | null }>): number {
  return rows.reduce((s, r) => s + (Number(r.amountCents) || 0), 0);
}

export async function getCreditBalance(userId: string, now: Date = new Date(), client: any = prisma): Promise<CreditBalance> {
  const rows: Array<{ amountCents: number; status: string; availableAt: Date }> = await client.subscriptionCreditEntry.findMany({
    where: { userId, status: { in: ['ACTIVE', 'HELD'] } },
    select: { amountCents: true, status: true, availableAt: true },
  });
  const t = now.getTime();
  return {
    availableCents: sumCents(rows.filter((r) => r.status === 'ACTIVE' && new Date(r.availableAt).getTime() <= t)),
    pendingCents: sumCents(rows.filter((r) => r.status === 'ACTIVE' && new Date(r.availableAt).getTime() > t)),
    heldCents: sumCents(rows.filter((r) => r.status === 'HELD')),
  };
}

/**
 * How much credit to apply to a bill of `amountCents` given `availableCents`, never leaving a card charge smaller than
 * the platform's minimum card charge (a sub-minimum remainder is left on the card by applying slightly less credit).
 * Pure; exported for tests.
 */
export function creditToApplyCents(amountCents: number, availableCents: number, minChargeCents: number = MIN_CARD_SALE_CENTS): number {
  const bill = Math.max(0, Math.floor(Number(amountCents) || 0));
  const avail = Math.max(0, Math.floor(Number(availableCents) || 0));
  if (bill <= 0 || avail <= 0) return 0;
  let applied = Math.min(avail, bill);
  const remaining = bill - applied;
  if (remaining > 0 && remaining < minChargeCents) applied = bill - minChargeCents;
  return Math.max(0, applied);
}

export function renewalCreditKey(organizerId: string, periodKey: string, attempt: number): string {
  return `renewal-apply:${organizerId}:${periodKey}:try${Math.max(0, Math.floor(attempt || 0))}`;
}

export interface RenewalCreditReservation {
  appliedCents: number;
  entryId: string | null;
}

/**
 * Reserves (writes a negative RENEWAL_APPLIED row for) the credit applied to one renewal attempt, BEFORE the card is
 * charged. Idempotent per (organizer, period, dunning attempt): a crash-retry of the same attempt finds the same row and
 * returns the same amount, so the reduced card charge (and its Square idempotency key) is identical. If the card charge
 * then fails the caller must call voidRenewalCredit so the credit comes back. Never throws: any error means no credit
 * is applied and the card is charged in full (the credit stays on the account).
 */
export async function reserveRenewalCredit(params: {
  userId: string;
  organizerId: string;
  periodKey: string;
  attempt: number;
  amountCents: number;
  billingChargeId?: string | null;
  now?: Date;
}): Promise<RenewalCreditReservation> {
  const none: RenewalCreditReservation = { appliedCents: 0, entryId: null };
  // Feature flag OFF (default): renewals are charged in full and no ledger row is written.
  if (!isReferralCreditEnabled()) return none;
  if (!params.userId || !(params.amountCents > 0)) return none;
  const key = renewalCreditKey(params.organizerId, params.periodKey, params.attempt);
  const now = params.now ?? new Date();
  try {
    return await withCreditLock(params.userId, async (tx) => {
      const existing = await tx.subscriptionCreditEntry.findUnique({
        where: { idempotencyKey: key },
        select: { id: true, amountCents: true, status: true, userId: true },
      });
      if (existing) {
        if (existing.status !== 'ACTIVE' || existing.userId !== params.userId) return none;
        return { appliedCents: Math.max(0, -existing.amountCents), entryId: existing.id };
      }
      const balance = await getCreditBalance(params.userId, now, tx);
      const applied = creditToApplyCents(params.amountCents, balance.availableCents);
      if (applied <= 0) return none;
      const row = await tx.subscriptionCreditEntry.create({
        data: {
          userId: params.userId,
          amountCents: -applied,
          kind: 'RENEWAL_APPLIED',
          status: 'ACTIVE',
          availableAt: now,
          idempotencyKey: key,
          billingChargeId: params.billingChargeId ?? null,
          note: `Applied to subscription renewal ${params.periodKey}`,
        },
        select: { id: true },
      });
      return { appliedCents: applied, entryId: row.id };
    });
  } catch (err) {
    console.warn(`[subscriptionCredit] could not reserve renewal credit for user ${params.userId} (charging in full):`, err);
    return none;
  }
}

/** Gives a renewal reservation back (its card charge failed). Idempotent; only an ACTIVE RENEWAL_APPLIED row is voided. */
export async function voidRenewalCredit(entryId: string | null | undefined, reason: string): Promise<void> {
  if (!entryId) return;
  try {
    await prisma.subscriptionCreditEntry.updateMany({
      where: { id: entryId, kind: 'RENEWAL_APPLIED', status: 'ACTIVE' },
      data: { status: 'VOID', note: `Renewal charge failed, credit returned: ${reason}`.slice(0, 500) },
    });
  } catch (err) {
    // The row stays ACTIVE (credit stays spent) only if this write itself fails; logged loudly so it can be voided by hand.
    console.error(`[subscriptionCredit] CRITICAL: could not void renewal credit entry ${entryId} after a failed charge:`, err);
  }
}
