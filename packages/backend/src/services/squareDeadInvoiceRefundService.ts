import * as Sentry from '@sentry/node';
import { SquareError } from 'square';
import { prisma } from '../lib/prisma';
import { getSquareClientForMerchant } from '../utils/square';
import { buildSquareIdempotencyKey, resolveOrganizerSquareAccessToken } from './squarePaymentService';

/**
 * squareDeadInvoiceRefundService.ts -- money review P0-2 (2026-09-29): refund a Square payment
 * that was captured against a hold invoice that was already released or expired, when the sale
 * cannot be recorded because an item on it is no longer available.
 *
 * WHY THIS IS NOT executeVerifiedSquareRefund: that function is keyed off a Purchase row
 * (`executeVerifiedSquareRefund(purchaseId, ...)`), and the whole defect here is that there is no
 * Purchase row -- holdInvoicePaymentRecorder deliberately records nothing for a dead invoice.
 * Fabricating a Purchase to satisfy it would be a database workaround (a fake fulfillment record
 * feeding payouts, refund history and reporting). This file goes straight to Square's
 * RefundPayment API with the same token seam, idempotency helper and reason-text convention the
 * Purchase-keyed service uses, and does no other bookkeeping (there is nothing else to reverse:
 * no Purchase, no stock movement, no cash-fee accrual for a sale that was never recorded).
 * Square refunds the application fee proportionally by default, so no fee handling is needed.
 *
 * SAFETY (every one must hold or NOTHING is refunded and the caller keeps its alert):
 *   - kill switch: SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED=1 disables the refund entirely
 *   - Square itself reports the payment COMPLETED, in USD, with nothing refunded yet
 *   - the captured amount is at least the invoice's card-leg total (never refund a smaller,
 *     unexplained payment automatically)
 *   - the refund is a FULL refund of the captured amount, UNLESS the caller passes refundAmountCents
 *     (2026-09-30, oversold items): then it is exactly that partial amount, never more than captured
 *   - deterministic idempotency key per invoice (per payment id + kind when the caller passes `kind`),
 *     so a retried webhook or a second pass returns the same refund from Square instead of creating
 *     another
 *
 * 2026-09-30 (payment review finding 2): also used by services/oversoldPaymentRefundService.ts for a
 * captured payment where some or all items could not be fulfilled. Those callers pass `kind` and, for
 * a partial refund, `refundAmountCents` (the oversold items' card share).
 */

export const squareDeadInvoiceAutoRefundDisabled = (): boolean =>
  process.env.SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED === '1';

export interface SquareDeadInvoiceRefundInput {
  invoiceId: string;
  /** Organizer PROFILE id (Sale.organizerId), used to resolve the organizer's Square token. */
  organizerId: string;
  paymentId: string;
  /** The invoice's card-leg total in cents (cardAmountCents, falling back to totalAmount). */
  expectedAmountCents: number;
  /**
   * Partial refund amount in cents (oversold items' card share). Omit for a full refund of the
   * captured amount. Must be a positive integer no larger than the captured amount.
   */
  refundAmountCents?: number;
  /**
   * Idempotency kind. When set, the Square idempotency key is derived from (payment id, kind) so the
   * same payment can only ever produce one refund for that kind. Omitted: the legacy per-invoice key.
   */
  kind?: string;
  /** Reason text shown to the buyer on the refund (Square caps it at 192 characters). */
  reasonText?: string;
}

export interface SquareDeadInvoiceRefundOutcome {
  attempted: boolean;
  refunded: boolean;
  /** Always populated: why it did or did not refund. */
  reason: string;
  refundId?: string;
  refundedCents?: number;
  /** True when a partial amount was refunded rather than the whole captured payment. */
  partial?: boolean;
}

const toCents = (v: unknown): number => {
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return 0;
};

export async function refundSquarePaymentForDeadInvoice(
  input: SquareDeadInvoiceRefundInput
): Promise<SquareDeadInvoiceRefundOutcome> {
  const fail = (reason: string, level: 'warning' | 'error' = 'warning'): SquareDeadInvoiceRefundOutcome => {
    console[level === 'error' ? 'error' : 'warn'](
      `[squareDeadInvoiceRefund] REFUND-NOT-ISSUED invoice=${input.invoiceId} payment=${input.paymentId} reason=${reason}`
    );
    return { attempted: true, refunded: false, reason };
  };

  if (squareDeadInvoiceAutoRefundDisabled()) {
    return { attempted: false, refunded: false, reason: 'DISABLED (SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED=1)' };
  }
  if (!input.paymentId) return fail('NO_PAYMENT_ID');

  let client;
  try {
    const organizer = await prisma.organizer.findUnique({
      where: { id: input.organizerId },
      select: { id: true, squareMerchantId: true, squareOnboarded: true },
    });
    if (!organizer) return fail('ORGANIZER_NOT_FOUND', 'error');
    const accessToken = await resolveOrganizerSquareAccessToken(organizer);
    client = getSquareClientForMerchant(accessToken);
  } catch (err: any) {
    return fail(`TOKEN_UNAVAILABLE (${err?.name || 'error'})`, 'error');
  }

  let payment: any;
  try {
    const response = await client.payments.get({ paymentId: input.paymentId });
    payment = (response as any)?.payment;
  } catch (err: any) {
    return fail(`PAYMENT_READ_FAILED (${err?.message ?? err})`, 'error');
  }
  if (!payment?.id) return fail('PAYMENT_NOT_FOUND', 'error');
  if (payment.status !== 'COMPLETED') return fail(`PAYMENT_NOT_COMPLETED (status=${payment.status})`);

  const amountMoney = payment.amountMoney ?? payment.amount_money;
  const capturedCents = toCents(amountMoney?.amount);
  const currency = amountMoney?.currency;
  if (currency && currency !== 'USD') return fail(`UNEXPECTED_CURRENCY (${currency})`);
  if (capturedCents <= 0) return fail('NO_AMOUNT_CAPTURED');
  const refundedMoney = payment.refundedMoney ?? payment.refunded_money;
  if (toCents(refundedMoney?.amount) > 0) return fail(`ALREADY_REFUNDED (refunded ${toCents(refundedMoney?.amount)} cents)`);
  if (input.expectedAmountCents > 0 && capturedCents < input.expectedAmountCents) {
    return fail(`AMOUNT_BELOW_INVOICE (captured ${capturedCents} < invoice card leg ${input.expectedAmountCents}); needs a human`);
  }

  let refundCents = capturedCents;
  if (input.refundAmountCents !== undefined) {
    const wanted = input.refundAmountCents;
    if (!Number.isInteger(wanted) || wanted <= 0) return fail(`INVALID_REFUND_AMOUNT (${wanted})`);
    if (wanted > capturedCents) return fail(`REFUND_EXCEEDS_CAPTURED (${wanted} > ${capturedCents})`);
    refundCents = wanted;
  }
  const isPartial = refundCents < capturedCents;

  try {
    const refundResponse = await client.refunds.refundPayment({
      idempotencyKey: input.kind
        ? buildSquareIdempotencyKey(['sq-refund', input.paymentId, input.kind])
        : buildSquareIdempotencyKey(['dead-inv-refund', input.invoiceId]),
      paymentId: input.paymentId,
      amountMoney: { amount: BigInt(refundCents), currency: 'USD' },
      reason: (input.reasonText || 'Payment received after the payment window closed').slice(0, 190),
    } as any);
    const refund = (refundResponse as any)?.refund;
    const outcome: SquareDeadInvoiceRefundOutcome = {
      attempted: true,
      refunded: true,
      reason: isPartial
        ? 'REFUNDED_PARTIAL (an item on the payment is no longer available)'
        : 'REFUNDED (invoice dead and an item on it is no longer available)',
      refundId: refund?.id,
      refundedCents: refundCents,
      partial: isPartial,
    };
    console.error(`[squareDeadInvoiceRefund] REFUND-ISSUED invoice=${input.invoiceId} payment=${input.paymentId} cents=${refundCents}${isPartial ? ` (partial of ${capturedCents})` : ''} refund=${refund?.id ?? '(unknown)'}`);
    return outcome;
  } catch (err: any) {
    const code = err instanceof SquareError ? (err.errors?.[0]?.code ?? 'SQUARE_ERROR') : 'ERROR';
    try {
      Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
        tags: { area: 'square-dead-invoice-refund' },
        extra: { invoiceId: input.invoiceId, paymentId: input.paymentId, capturedCents, refundCents, code },
      } as any);
    } catch {
      // Sentry may not be initialized
    }
    return fail(`REFUND_FAILED (${code}: ${err?.message ?? err})`, 'error');
  }
}
