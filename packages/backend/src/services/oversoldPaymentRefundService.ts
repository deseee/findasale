import * as Sentry from '@sentry/node';
import { prisma } from '../lib/prisma';
import { allocateCentsProportionally } from './cashFeeService';
import { escapeHtml } from '../utils/htmlEscape';

/**
 * oversoldPaymentRefundService.ts (2026-09-30, payment review finding 2)
 *
 * Shared settlement for a captured payment where SOME or ALL of the paid items could not be
 * fulfilled because the stock was already gone when the payment was recorded (InsufficientStockError
 * in posPaymentLinkRecorder / holdInvoicePaymentRecorder). Before this, the fulfilled items were
 * recorded, the link/invoice was marked done, and the money for the unfulfilled items stayed
 * captured with only an alert (and, for the POS link, a notice that pointed at a Stripe dashboard
 * that no longer applies).
 *
 * What it does:
 *   1. computeOversoldSettlement: the card share of the oversold items (whole cents, largest
 *      remainder allocation across ALL paid rows, exact) or the full card amount when every item is
 *      oversold; the cash share the organizer must hand back for a split-tender sale.
 *   2. settleOversoldPayment: refunds that card share by Square payment id through
 *      squareDeadInvoiceRefundService (kill switch SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED,
 *      deterministic idempotency key per (payment id, kind), Sentry on failure). Never throws.
 *   3. notifyOversoldSettlement: organizer (always) and shopper (when reachable) get accurate copy.
 *      No processor is hard-coded: it says Square, or "your payment processor dashboard".
 *
 * Not handled here (by design): the cash leg is never refunded through the processor. The organizer
 * collected it at the register, so the message tells them to return it.
 */

export interface OversoldSettlementInput {
  /** The card amount the processor actually captured for the paid rows, in cents. */
  cardCents: number;
  /** The cash the cashier collected at the register for the same sale (split tender), in cents. */
  cashCents: number;
  /** One weight per paid row (item price in cents, or the invoice's scaled row amount). */
  weightsCents: number[];
  /** Indexes into weightsCents of the rows that could not be fulfilled. */
  oversoldIdx: number[];
}

export interface OversoldSettlement {
  /** Card cents to refund for the unfulfilled rows. */
  refundCardCents: number;
  /** Cash cents the organizer owes back to the shopper for the unfulfilled rows. */
  cashToReturnCents: number;
  /** True when every paid row is oversold: the refund is the whole captured card amount. */
  fullRefund: boolean;
  /** Per-row card shares (same length as weightsCents), for callers that need the fee basis. */
  cardShares: number[];
}

export function computeOversoldSettlement(input: OversoldSettlementInput): OversoldSettlement {
  const cardCents = Math.max(0, Math.round(input.cardCents || 0));
  const cashCents = Math.max(0, Math.round(input.cashCents || 0));
  const oversold = new Set(input.oversoldIdx.filter((i) => i >= 0 && i < input.weightsCents.length));
  const rows = input.weightsCents.length;
  const fullRefund = rows > 0 && oversold.size === rows;
  const cardShares = allocateCentsProportionally(cardCents, input.weightsCents);
  const cashShares = allocateCentsProportionally(cashCents, input.weightsCents);
  if (fullRefund) {
    return { refundCardCents: cardCents, cashToReturnCents: cashCents, fullRefund: true, cardShares };
  }
  let refundCardCents = 0;
  let cashToReturnCents = 0;
  oversold.forEach((i) => {
    refundCardCents += cardShares[i] ?? 0;
    cashToReturnCents += cashShares[i] ?? 0;
  });
  return { refundCardCents: Math.min(refundCardCents, cardCents), cashToReturnCents: Math.min(cashToReturnCents, cashCents), fullRefund: false, cardShares };
}

export type OversoldSettleStatus = 'REFUNDED' | 'MANUAL' | 'NOTHING_TO_REFUND';

export interface OversoldSettleResult {
  status: OversoldSettleStatus;
  refundCents: number;
  refundId?: string;
  reason: string;
  autoRefundDisabled: boolean;
}

export interface SettleOversoldParams {
  /** Which recorder called: keeps logs and the idempotency kind readable. ('manual-card' added by ADR-136 Addendum A, 2026-10-05; 'online-pack' by Addendum E, 2026-10-06.) */
  kind: 'pos-link' | 'hold-invoice' | 'manual-card' | 'online-pack';
  /** POSPaymentLink.id or HoldInvoice.id, or the Square payment id for 'manual-card' and 'online-pack' (those flows have no row of their own). */
  refId: string;
  /** Organizer PROFILE id (Sale.organizerId), used to resolve the Square token. */
  organizerProfileId: string | null | undefined;
  processor: 'STRIPE' | 'SQUARE';
  /** Square payment id, or null when nothing went through the processor (all-cash sale). */
  paymentId: string | null | undefined;
  /** The card amount the payment link/invoice asked the processor to capture, in cents. */
  cardPaidCents: number;
  settlement: OversoldSettlement;
}

/** Deterministic per (payment id, kind): the same payment can never produce two different refunds. */
export const oversoldRefundKind = (kind: SettleOversoldParams['kind'], refId: string): string => `oversold:${kind}:${refId}`;

export async function settleOversoldPayment(params: SettleOversoldParams): Promise<OversoldSettleResult> {
  const { kind, refId, settlement } = params;
  const refundCents = settlement.refundCardCents;
  const disabledEnv = process.env.SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED === '1';

  if (refundCents <= 0) {
    return { status: 'NOTHING_TO_REFUND', refundCents: 0, reason: 'NO_CARD_AMOUNT_TO_REFUND', autoRefundDisabled: disabledEnv };
  }

  let outcome: { refunded: boolean; reason: string; refundId?: string } = { refunded: false, reason: 'NOT_ATTEMPTED' };
  let autoRefundDisabled = disabledEnv;

  if (params.processor !== 'SQUARE') {
    outcome = { refunded: false, reason: 'PROCESSOR_NOT_SQUARE (no automatic refund path)' };
  } else if (!params.paymentId) {
    outcome = { refunded: false, reason: 'NO_PAYMENT_ID' };
  } else if (!params.organizerProfileId) {
    outcome = { refunded: false, reason: 'NO_ORGANIZER' };
  } else {
    try {
      const refundService = await import('./squareDeadInvoiceRefundService');
      autoRefundDisabled = refundService.squareDeadInvoiceAutoRefundDisabled();
      outcome = await refundService.refundSquarePaymentForDeadInvoice({
        invoiceId: refId,
        organizerId: params.organizerProfileId,
        paymentId: params.paymentId,
        expectedAmountCents: Math.max(0, params.cardPaidCents),
        // A full refund omits the amount so the whole captured payment goes back; a partial one is exact.
        ...(settlement.fullRefund ? {} : { refundAmountCents: refundCents }),
        kind: oversoldRefundKind(kind, refId),
        reasonText: 'An item on your order was no longer available',
      });
    } catch (err: any) {
      outcome = { refunded: false, reason: `THREW: ${String(err?.message ?? err)}` };
    }
  }

  if (outcome.refunded) {
    console.error(`[oversold-refund] ${kind} ${refId} payment=${params.paymentId} REFUNDED cents=${refundCents} full=${settlement.fullRefund} refund=${outcome.refundId ?? 'n/a'}`);
    return { status: 'REFUNDED', refundCents, refundId: outcome.refundId, reason: outcome.reason, autoRefundDisabled };
  }

  console.error(`[oversold-refund] ${kind} ${refId} payment=${params.paymentId ?? 'none'} NOT REFUNDED cents=${refundCents} (${outcome.reason}); manual refund needed`);
  try {
    Sentry.captureMessage('[oversold-refund] payment for an unfulfillable item could not be refunded automatically', {
      level: autoRefundDisabled ? 'warning' : 'error',
      tags: { area: 'oversold-refund', kind, resolution: 'manual-refund-needed' },
      extra: { refId, paymentId: params.paymentId ?? null, refundCents, fullRefund: settlement.fullRefund, reason: outcome.reason, autoRefundDisabled },
    } as any);
  } catch {
    // Sentry may not be initialized. The console.error above is the fallback record.
  }
  return { status: 'MANUAL', refundCents, reason: outcome.reason, autoRefundDisabled };
}

// --- Notification copy (pure, exported for tests) ---------------------------------------------

const dollars = (cents: number): string => (Math.max(0, Number(cents) || 0) / 100).toFixed(2);

export function describeItems(titles: string[]): string {
  const clean = titles.map((t) => String(t ?? '').trim()).filter(Boolean);
  if (clean.length === 0) return 'an item';
  if (clean.length <= 3) return clean.map((t) => `"${t}"`).join(', ');
  return `${clean.length} items`;
}

export interface OversoldCopyInput {
  result: OversoldSettleResult;
  settlement: OversoldSettlement;
  titles: string[];
  processor: 'STRIPE' | 'SQUARE';
  /** Short reference (link or invoice id) so support can find it. */
  ref: string;
  /** True when part of the sale still went through (some items were fulfilled). */
  partiallyFulfilled: boolean;
}

export interface OversoldCopy {
  organizerTitle: string;
  organizerBody: string;
  /** null when the shopper needs no message. */
  shopperTitle: string | null;
  shopperBody: string | null;
}

export function buildOversoldCopy(input: OversoldCopyInput): OversoldCopy {
  const { result, settlement, titles, processor, ref, partiallyFulfilled } = input;
  const what = describeItems(titles);
  const refund = dollars(result.refundCents);
  const cash = dollars(settlement.cashToReturnCents);
  const dashboard = processor === 'SQUARE' ? 'your Square dashboard' : 'your payment processor dashboard';
  const rest = partiallyFulfilled ? ' The rest of the sale was recorded.' : '';
  const cashOrg = settlement.cashToReturnCents > 0 ? ` The shopper also paid $${cash} in cash for that part, so please return that cash to them.` : '';
  const cashShopper = settlement.cashToReturnCents > 0 ? ` Ask the organizer to return the $${cash} you paid in cash for it.` : '';

  if (result.status === 'NOTHING_TO_REFUND') {
    // All-cash sale (or a zero-dollar row): only cash can be owed back.
    return {
      organizerTitle: 'Cash needs to be returned: item no longer available',
      organizerBody: `${what} was no longer available by the time the sale was recorded.${settlement.cashToReturnCents > 0 ? ` Please return the $${cash} the shopper paid in cash for it.` : ''}${rest} Ref ${ref}.`,
      shopperTitle: settlement.cashToReturnCents > 0 ? 'An item is no longer available' : null,
      shopperBody: settlement.cashToReturnCents > 0 ? `${what} was no longer available.${cashShopper}` : null,
    };
  }
  if (result.status === 'REFUNDED') {
    const how = settlement.fullRefund ? `$${refund} was refunded to the shopper's card in full` : `$${refund}, the share for ${what}, was refunded to the shopper's card`;
    return {
      organizerTitle: settlement.fullRefund ? 'Payment refunded: item no longer available' : 'Payment partly refunded: item no longer available',
      organizerBody: `A shopper paid, but ${what} was no longer available by the time the payment was recorded. ${how} automatically.${rest}${cashOrg} Ref ${ref}.`,
      shopperTitle: 'Part of your payment was refunded',
      shopperBody: `${what} was no longer available, so $${refund} was refunded to your card. It can take a few days to appear.${cashShopper}`,
    };
  }
  // MANUAL
  const why = result.autoRefundDisabled ? ' (automatic refunds are turned off)' : '';
  return {
    organizerTitle: 'Payment needs a refund: item no longer available',
    organizerBody: `A shopper paid, but ${what} was no longer available by the time the payment was recorded, and the refund could not be issued automatically${why}. Please refund $${refund} to the shopper from ${dashboard}.${rest}${cashOrg} Ref ${ref}.`,
    shopperTitle: 'An item on your order is no longer available',
    shopperBody: `${what} was no longer available. The organizer has been asked to refund $${refund} to your card. If you do not see it in a few days, contact the organizer.${cashShopper}`,
  };
}

export interface NotifyOversoldParams extends OversoldCopyInput {
  organizerUserId: string | null | undefined;
  organizerLink: string;
  shopper?: { userId?: string | null; email?: string | null; name?: string | null; link?: string | null } | null;
  /** Notification type for the organizer message when a manual refund is needed. */
  manualType?: string;
}

/** Best effort and never throws: a notification failure must not undo a recorded sale. */
export async function notifyOversoldSettlement(params: NotifyOversoldParams): Promise<void> {
  const copy = buildOversoldCopy(params);
  const manual = params.result.status === 'MANUAL';
  try {
    if (params.organizerUserId) {
      await prisma.notification.create({
        data: {
          userId: params.organizerUserId,
          type: manual ? (params.manualType ?? 'payment_reconciliation') : 'payment_reconciliation',
          title: copy.organizerTitle,
          body: copy.organizerBody,
          link: params.organizerLink,
          channel: 'OPERATIONAL',
        },
      });
    } else {
      console.error(`[oversold-refund] no organizer user to notify for ${params.ref}`);
    }
  } catch (err) {
    console.warn(`[oversold-refund] organizer notification failed for ${params.ref}:`, err);
  }

  const shopper = params.shopper;
  if (!shopper || !copy.shopperTitle || !copy.shopperBody) return;
  if (shopper.userId) {
    try {
      await prisma.notification.create({
        data: {
          userId: shopper.userId,
          type: 'payment_refunded',
          title: copy.shopperTitle,
          body: copy.shopperBody,
          link: shopper.link ?? null,
          channel: 'OPERATIONAL',
        },
      });
    } catch (err) {
      console.warn(`[oversold-refund] shopper notification failed for ${params.ref}:`, err);
    }
  }
  if (shopper.email) {
    try {
      const { transactionalEmailService } = await import('../lib/transactionalEmailService');
      const fromEmail = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';
      await transactionalEmailService.emails.send({
        from: fromEmail,
        to: shopper.email,
        subject: copy.shopperTitle,
        html: `<p>Hi ${escapeHtml(shopper.name || 'there')},</p><p>${escapeHtml(copy.shopperBody)}</p>`,
      });
    } catch (err) {
      console.warn(`[oversold-refund] shopper email failed for ${params.ref}:`, err);
    }
  }
}
