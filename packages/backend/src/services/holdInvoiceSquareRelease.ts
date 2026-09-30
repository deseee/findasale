import * as Sentry from '@sentry/node';
// squareCheckoutLinkService is imported LAZILY inside the two functions that call Square: it pulls in the Square token/crypto chain (tokenCrypto throws at import without its env key), which must not load for callers that never reach Square (the expiry job's Stripe branch and its tests).
import { markHoldInvoicePaid } from './holdInvoicePaymentRecorder';

/**
 * holdInvoiceSquareRelease.ts -- money review P0-2 (2026-09-29).
 *
 * THE BUG: a Square hold invoice is a hosted Payment Link the shopper can pay at any time. Every
 * path that ends an unpaid invoice (releaseInvoice, releaseInvoiceById, invoiceExpiryJob) used to
 * flip the invoice CANCELLED/EXPIRED and hand the items back to inventory WITHOUT asking Square
 * whether the link had been paid and WITHOUT cancelling the link. The Stripe branch of the same
 * paths closes the Checkout Session first (expireCheckoutSessionSafely) and refuses to release a
 * paid one; the Square branch had nothing, and invoiceExpiryJob even carried a comment claiming a
 * Square invoice "can never have been paid". Result: the shopper pays the still-live link after
 * the release, Square captures real money, and the recorder's dead-invoice guard has nothing to
 * record it against.
 *
 * THE FIX (this file): one shared gate, run BEFORE any status flip, by every release path.
 *   1. Ask Square for the invoice's Order state (RetrieveOrder). Paid -> PAID (the caller must
 *      RECORD the sale, never release).
 *   2. Otherwise DELETE the Payment Link (Square cancels the underlying Order). Then re-read the
 *      Order: a payment that landed between step 1 and the delete is still caught (PAID), and a
 *      link whose delete "succeeded" but whose Order is somehow still open is not trusted.
 *   3. Anything ambiguous (Square unreachable, token cannot be resolved, delete failed with a code
 *      other than "already gone", Order still open after the delete) -> RETRY. The caller must
 *      ABORT the release and leave the invoice PENDING; the expiry job re-runs every 10 minutes.
 *
 * Only CLEAR means "nothing at Square can be paid any more": callers may then flip the status.
 *
 * Never throws for a Square/API failure (those are RETRY). It is a pure decision helper plus the
 * one shared "record it now" wrapper below; it writes nothing to the database itself.
 */

export type SquareReleaseGate =
  | { outcome: 'CLEAR'; detail: string }
  | { outcome: 'PAID'; paymentId: string | null; detail: string }
  | { outcome: 'RETRY'; detail: string };

export interface SquareReleaseInvoiceRef {
  id: string;
  processor?: string | null;
  squareOrderId?: string | null;
  squarePaymentLinkId?: string | null;
  squarePaymentId?: string | null;
}

/** Square error codes that mean "that link/order no longer exists", i.e. it was already deleted. */
const ALREADY_GONE_CODES = new Set(['NOT_FOUND', 'RESOURCE_NOT_FOUND']);

async function readOrder(organizerId: string, orderId: string) {
  try {
    const { getSquareOrderPaymentStatus } = await import('./squareCheckoutLinkService');
    return await getSquareOrderPaymentStatus({ organizerId, orderId });
  } catch (err: any) {
    // SquareOnboardingIncompleteError or any unexpected throw: cannot verify, so ambiguous.
    return { ok: false as const, code: err?.name || 'THROWN', message: String(err?.message ?? err) };
  }
}

/**
 * Decide whether an unpaid Square hold invoice can safely be released, cancelling its Square
 * Payment Link as part of the decision. See the file header for the contract.
 *
 * @param organizerId the ORGANIZER PROFILE id (Sale.organizerId), NOT the organizer's user id --
 *                    squareCheckoutLinkService resolves the organizer's Square token from it.
 */
export async function prepareSquareInvoiceForRelease(params: {
  invoice: SquareReleaseInvoiceRef;
  organizerId: string | null | undefined;
  context: string;
}): Promise<SquareReleaseGate> {
  const { invoice, organizerId, context } = params;

  if (invoice.processor !== 'SQUARE') {
    return { outcome: 'CLEAR', detail: 'not a Square invoice' };
  }
  // A Square payment id already on a still-PENDING invoice means a payment was seen but never
  // recorded. That is money captured: record it, do not release.
  if (invoice.squarePaymentId) {
    return { outcome: 'PAID', paymentId: invoice.squarePaymentId, detail: 'invoice already carries a Square payment id' };
  }
  const orderId = invoice.squareOrderId ?? null;
  const linkId = invoice.squarePaymentLinkId ?? null;

  if (!orderId && !linkId) {
    // Pre-migration Square rows (created before HoldInvoice persisted the link/order ids) have
    // nothing we can ask Square about. Releasing is the only way to un-stick the items; a late
    // payment on such a link is caught by the dead-invoice guard's reconciliation path.
    console.warn(`[hold-invoice-release] ${context} invoice=${invoice.id}: Square invoice has no order id or payment link id on file -- cannot verify or cancel at Square; releasing without a processor check.`);
    return { outcome: 'CLEAR', detail: 'legacy Square invoice with no link/order ids' };
  }
  if (!organizerId) {
    return { outcome: 'RETRY', detail: 'no organizer id to resolve the Square account from' };
  }

  // Step 1: is it already paid?
  if (orderId) {
    const first = await readOrder(organizerId, orderId);
    if (!first.ok) {
      return { outcome: 'RETRY', detail: `could not read Square order ${orderId}: ${first.code}` };
    }
    if (first.paid) {
      return { outcome: 'PAID', paymentId: first.paymentId, detail: `Square order ${orderId} is COMPLETED` };
    }
    if (first.state === 'CANCELED') {
      return { outcome: 'CLEAR', detail: `Square order ${orderId} is already CANCELED` };
    }
  }

  // Step 2: cancel the link (Square cancels the underlying Order with it).
  if (!linkId) {
    // An open order with no link id to delete: nothing we can cancel. Never release blind.
    return { outcome: 'RETRY', detail: `Square order ${orderId} is open but no payment link id is on file to cancel` };
  }
  let del;
  try {
    const { deleteSquareCheckoutLink } = await import('./squareCheckoutLinkService');
    del = await deleteSquareCheckoutLink({ organizerId, paymentLinkId: linkId });
  } catch (err: any) {
    return { outcome: 'RETRY', detail: `could not cancel Square payment link ${linkId}: ${err?.name || 'THROWN'}` };
  }
  const alreadyGone = !del.ok && ALREADY_GONE_CODES.has(del.code);
  if (!del.ok && !alreadyGone) {
    return { outcome: 'RETRY', detail: `Square refused to cancel payment link ${linkId}: ${del.code}` };
  }
  const cancelledOrderId = del.ok ? del.cancelledOrderId : null;

  // Step 3: re-verify. A payment that completed between step 1 and the delete must not be lost.
  if (orderId) {
    const second = await readOrder(organizerId, orderId);
    if (!second.ok) {
      // Delete succeeded (or link already gone) but we cannot double-check. Trust the delete only
      // when Square itself reported cancelling the order.
      if (cancelledOrderId) return { outcome: 'CLEAR', detail: `link ${linkId} deleted, Square cancelled order ${cancelledOrderId}` };
      return { outcome: 'RETRY', detail: `link ${linkId} deleted but order ${orderId} could not be re-read: ${second.code}` };
    }
    if (second.paid) {
      return { outcome: 'PAID', paymentId: second.paymentId, detail: `Square order ${orderId} completed while the link was being cancelled` };
    }
    if (second.state === 'CANCELED' || cancelledOrderId) {
      return { outcome: 'CLEAR', detail: `link ${linkId} deleted, order ${orderId} is ${second.state}` };
    }
    return { outcome: 'RETRY', detail: `link ${linkId} deleted but order ${orderId} is still ${second.state}` };
  }

  // Link id only (no order id to verify against).
  if (del.ok && !cancelledOrderId) {
    console.warn(`[hold-invoice-release] ${context} invoice=${invoice.id}: link ${linkId} deleted but Square did not report a cancelled order and no order id is on file to verify.`);
  }
  return { outcome: 'CLEAR', detail: `link ${linkId} deleted (no order id on file to re-verify)` };
}

/**
 * Record a Square-paid invoice the release gate found instead of releasing it. Never throws: the
 * caller is about to tell the organizer/job "this was paid, not released", and a recorder failure
 * must not turn that into a 500. On failure the invoice simply stays PENDING and the expiry job
 * (which runs the same gate) retries the recording on its next pass. Returns whether the
 * recorder reports the invoice as paid now.
 */
export async function recordSquarePaidInvoiceFromGate(
  invoiceId: string,
  gate: Extract<SquareReleaseGate, { outcome: 'PAID' }>,
  context: string
): Promise<boolean> {
  try {
    const result = await markHoldInvoicePaid(
      invoiceId,
      { processor: 'SQUARE', externalPaymentId: gate.paymentId },
      { source: 'reconcile' }
    );
    if (!gate.paymentId) {
      console.error(`[hold-invoice-release] ${context} invoice=${invoiceId}: Square order is paid but no payment id was returned, so the Purchase rows carry no payment id and cannot be refunded through the app until it is filled in.`);
      try {
        Sentry.captureMessage(`[hold-invoice-release] paid Square invoice recorded without a payment id (${context})`, {
          level: 'error',
          tags: { area: 'hold-invoice-square-release' },
          extra: { invoiceId, detail: gate.detail },
        } as any);
      } catch {
        // Sentry may not be initialized
      }
    }
    return !!(result.recorded || result.alreadyPaid);
  } catch (err) {
    console.error(`[hold-invoice-release] ${context} invoice=${invoiceId}: failed to record the Square payment found at release time (will retry via the expiry job):`, err);
    try {
      Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
        tags: { area: 'hold-invoice-square-release' },
        extra: { invoiceId, context, paymentId: gate.paymentId },
      } as any);
    } catch {
      // Sentry may not be initialized
    }
    return false;
  }
}
