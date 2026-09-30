import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { CashFeeClient } from './cashFeeService';

/**
 * cashFeeRefundReversalService.ts (2026-09-29)
 *
 * RULING (findasale payments-wiring pass, industry-standard marketplace practice): when a split-tender
 * (cash + card) sale is refunded, the platform keeps no commission on money that was handed back.
 * The CARD leg's fee is already returned by Square, which refunds `app_fee_money` proportionally
 * on every refund (see squareRefundService.ts header). The CASH leg's commission never touched
 * Square: it sits on `Organizer.cashFeeBalance` (accrued by cashFeeService.accrueSplitCashLegOnce),
 * so it has to be reversed here, in proportion to the cash value actually returned.
 *
 * WHAT IS REVERSED. Only the cash portion the organizer hands back by hand
 * (resolveSplitRefund().cashPortionToRefundByHand). Refunds are card-first: a partial refund that
 * fits inside the card leg returns no cash, so it reverses no cash commission (that commission is
 * earned on cash value that was not returned). A full refund reverses the whole cash commission.
 *
 * NO SCHEMA CHANGE. The reversal is a NEGATIVE row in the existing CashFeeAccrual ledger:
 *     sourceType      = 'REFUND_REVERSAL'
 *     sourceId        = '<accrual sourceType>:<accrual sourceId>:<purchase id>'
 *     cashAmountCents = -(cash value refunded, capped at the accrual's cash)
 *     commissionCents = -(commission reversed)
 * The (sourceType, sourceId) unique index makes it idempotent per purchase: a replayed refund
 * call, a retry after a partial failure, or a heal script inserts nothing the second time and
 * never decrements the balance twice. Nothing else reads CashFeeAccrual by a sourceType that
 * would match, so the exposure-cap query (getPendingSplitCashCommission) is unaffected.
 *
 * PROPORTIONAL AND CUMULATIVE. One accrual covers a whole split sale (all of its Purchase rows).
 * Each row's refund reverses commission * (cumulative cash refunded / accrual cash), minus what
 * earlier reversals of the same accrual already took (found by the sourceId prefix). Cumulative,
 * not per-row, so rounding never drifts and the rows together can never reverse more than the
 * accrual, and refunding every row reverses it to the cent.
 *
 * NEVER BELOW ZERO. The balance decrement is guarded (cashFeeBalance >= amount). If the organizer
 * has already paid part of that commission down (recouped from a later card sale) the balance is
 * clamped at 0 instead of going negative: the ledger row still records the full entitlement, the
 * result reports the shortfall (`shortfallCents`), and the caller logs it for manual credit.
 * Deliberately no negative balances: cashFeeBalance is "amount owed" everywhere else (payouts,
 * the exposure cap), and a negative would silently offset future accruals.
 *
 * INERT UNTIL MIGRATED. Needs the CashFeeAccrual table (migration 20260929120000_pos_split_
 * tender_ledger). The only caller (squareRefundService) runs it non-fatally and only for a split
 * purchase with cash to hand back, which cannot exist before that migration, so nothing changes
 * for any pre-migration or non-split refund.
 */

export const CASH_FEE_REVERSAL_SOURCE_TYPE = 'REFUND_REVERSAL';

export type CashCommissionReversalStatus = 'REVERSED' | 'DUPLICATE' | 'NO_ACCRUAL' | 'NOTHING_TO_REVERSE';

export interface CashCommissionReversalResult {
  status: CashCommissionReversalStatus;
  /** Cents written to the ledger as the reversal (the organizer's entitlement). */
  reversedCents: number;
  /** Cents actually taken off cashFeeBalance (less than reversedCents when the balance was already lower). */
  appliedCents: number;
  /** reversedCents - appliedCents: commission already paid down, owed back to the organizer as a manual credit. */
  shortfallCents: number;
}

const none = (status: CashCommissionReversalStatus): CashCommissionReversalResult => ({
  status,
  reversedCents: 0,
  appliedCents: 0,
  shortfallCents: 0,
});

/**
 * Pure math. Cumulative-proportional commission to reverse for THIS refund, in cents.
 * target(total cash refunded so far) = round(commission * cash refunded / accrual cash), then this
 * refund's share is target minus what earlier reversals already took. Never negative, never more
 * than the accrual's commission in total.
 */
export function computeCumulativeCommissionReversalCents(p: {
  accrualCommissionCents: number;
  accrualCashAmountCents: number;
  cashRefundedCents: number;
  priorCashRefundedCents: number;
  priorReversedCents: number;
}): number {
  if (!(p.accrualCommissionCents > 0) || !(p.accrualCashAmountCents > 0) || !(p.cashRefundedCents > 0)) return 0;
  const totalCash = Math.min(p.accrualCashAmountCents, Math.max(0, p.priorCashRefundedCents) + p.cashRefundedCents);
  const target = Math.min(
    p.accrualCommissionCents,
    Math.round((p.accrualCommissionCents * totalCash) / p.accrualCashAmountCents)
  );
  return Math.max(0, target - Math.max(0, p.priorReversedCents));
}

/**
 * Idempotently reverse the cash-leg commission for one refunded split purchase.
 * `cashPortionRefundedCents` is resolveSplitRefund().cashPortionToRefundByHand in cents.
 * Runs in the caller's transaction when `tx` is passed, otherwise in its own. Throws only on a
 * real DB failure; the caller decides whether that is fatal (squareRefundService: alert, not fatal).
 */
export async function reverseSplitCashCommissionForRefund(params: {
  organizerId: string;
  purchase: { id: string; squarePaymentId?: string | null };
  cashPortionRefundedCents: number;
  /**
   * Distinguishes successive partial refunds of the SAME purchase (2026-09-29: a partial refund now
   * leaves the purchase PAID, so it can be refunded again). The ledger key is per purchase, so
   * without this a second refund's reversal would be skipped as a DUPLICATE. Pass a value that is
   * stable for one logical refund and different for the next (the cumulative cents refunded BEFORE
   * this refund works: a replay of the same refund reuses it, the next refund has a larger one).
   * Omit it for a purchase's first (or only) refund: the key is then exactly what it always was,
   * so existing ledger rows and replays are unaffected.
   */
  refundSequenceKey?: string | number | null;
  tx?: CashFeeClient;
}): Promise<CashCommissionReversalResult> {
  const cashRefundedCents = Math.round(Number(params.cashPortionRefundedCents) || 0);
  if (!(cashRefundedCents > 0)) return none('NOTHING_TO_REVERSE');

  const run = async (client: Prisma.TransactionClient): Promise<CashCommissionReversalResult> => {
    // 1. Find the accrual this purchase's cash leg was booked under. Three writers exist:
    //    manual card (sourceId = the Square payment id), phone request (the request id, whose
    //    squarePaymentId is the purchase's), QR link (the link id, whose purchaseIds hold the row),
    //    hold invoice with a cash leg (2026-09-29; sourceId = the HoldInvoice id, whose
    //    squarePaymentId is the purchase's). A fully-cash invoice has no payment id and no
    //    processor refund, so it has no lookup key here (its refund is entirely by hand).
    const candidates: { sourceType: string; sourceId: string }[] = [];
    const squarePaymentId = params.purchase.squarePaymentId || null;
    if (squarePaymentId) {
      candidates.push({ sourceType: 'MANUAL_CARD', sourceId: squarePaymentId });
      const request = await client.pOSPaymentRequest.findFirst({
        where: { squarePaymentId },
        select: { id: true },
      });
      if (request) candidates.push({ sourceType: 'POS_PAYMENT_REQUEST', sourceId: request.id });
      const holdInvoice = await client.holdInvoice.findFirst({
        where: { squarePaymentId, cashAmountCents: { gt: 0 } },
        select: { id: true },
      });
      if (holdInvoice) candidates.push({ sourceType: 'HOLD_INVOICE', sourceId: holdInvoice.id });
    }
    const link = await client.pOSPaymentLink.findFirst({
      where: { purchaseIds: { has: params.purchase.id } },
      select: { id: true },
    });
    if (link) candidates.push({ sourceType: 'POS_PAYMENT_LINK', sourceId: link.id });
    if (candidates.length === 0) return none('NO_ACCRUAL');

    const accrual = await client.cashFeeAccrual.findFirst({
      where: { organizerId: params.organizerId, OR: candidates },
    });
    if (!accrual) return none('NO_ACCRUAL'); // never accrued (test sale, referral discount, or accrual still pending)

    // 2. Idempotency + cumulative baseline from earlier reversals of the same accrual.
    const prefix = `${accrual.sourceType}:${accrual.sourceId}:`;
    const sequenceKey =
      params.refundSequenceKey !== undefined && params.refundSequenceKey !== null && String(params.refundSequenceKey) !== '' && String(params.refundSequenceKey) !== '0'
        ? `:${String(params.refundSequenceKey)}`
        : '';
    const reversalSourceId = `${prefix}${params.purchase.id}${sequenceKey}`;
    const priorRows = await client.cashFeeAccrual.findMany({
      where: { sourceType: CASH_FEE_REVERSAL_SOURCE_TYPE, sourceId: { startsWith: prefix } },
      select: { sourceId: true, cashAmountCents: true, commissionCents: true },
    });
    if (priorRows.some((r) => r.sourceId === reversalSourceId)) return none('DUPLICATE');
    const priorCashRefundedCents = priorRows.reduce((sum, r) => sum + -r.cashAmountCents, 0);
    const priorReversedCents = priorRows.reduce((sum, r) => sum + -r.commissionCents, 0);

    const reversedCents = computeCumulativeCommissionReversalCents({
      accrualCommissionCents: accrual.commissionCents,
      accrualCashAmountCents: accrual.cashAmountCents,
      cashRefundedCents,
      priorCashRefundedCents,
      priorReversedCents,
    });
    if (reversedCents <= 0) return none('NOTHING_TO_REVERSE');

    // 3. Ledger row first (ON CONFLICT DO NOTHING, no P2002 catch: a failed statement would poison
    //    the surrounding Postgres transaction). Only the call that actually inserted it moves the balance.
    const created = await client.cashFeeAccrual.createMany({
      data: [
        {
          organizerId: params.organizerId,
          sourceType: CASH_FEE_REVERSAL_SOURCE_TYPE,
          sourceId: reversalSourceId,
          cashAmountCents: -Math.min(cashRefundedCents, accrual.cashAmountCents),
          commissionCents: -reversedCents,
        },
      ],
      skipDuplicates: true,
    });
    if (created.count === 0) return none('DUPLICATE');

    // 4. Guarded decrement, clamped at zero (see header: never a negative balance).
    const amount = reversedCents / 100;
    const decremented = await client.organizer.updateMany({
      where: { id: params.organizerId, cashFeeBalance: { gte: amount } },
      data: { cashFeeBalance: { decrement: amount }, cashFeeBalanceUpdatedAt: new Date() },
    });
    let appliedCents = reversedCents;
    if (decremented.count === 0) {
      const organizer = await client.organizer.findUnique({
        where: { id: params.organizerId },
        select: { cashFeeBalance: true },
      });
      const balanceCents = Math.max(0, Math.round((organizer?.cashFeeBalance ?? 0) * 100));
      appliedCents = Math.min(balanceCents, reversedCents);
      if (appliedCents > 0) {
        await client.organizer.updateMany({
          where: { id: params.organizerId },
          data: { cashFeeBalance: 0, cashFeeBalanceUpdatedAt: new Date() },
        });
      }
    }
    return { status: 'REVERSED', reversedCents, appliedCents, shortfallCents: reversedCents - appliedCents };
  };

  if (params.tx) return run(params.tx as Prisma.TransactionClient);
  return prisma.$transaction(async (tx) => run(tx as unknown as Prisma.TransactionClient));
}
