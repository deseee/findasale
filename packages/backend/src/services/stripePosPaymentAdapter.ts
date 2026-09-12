import Stripe from 'stripe';
import { getStripe } from '../utils/stripe';

const stripe = () => getStripe();

/**
 * Stripe POS Payment Adapter -- Square migration Wave 1 #3, Phone-based POS (2026-09-07).
 *
 * Stripe removal (2026-09-12): preflightAccountStatus and createPayment (the
 * request-time preflight + PaymentIntent-creation pair this file originally held)
 * were deleted here -- posPaymentController.ts's createPaymentRequest now forces
 * `processor` to always be SQUARE (Stripe's platform account is permanently
 * closed), so neither function has any real caller left anywhere in the backend
 * (confirmed via a repo-wide grep before deleting). retrieveAndVerifyPayment below
 * is KEPT: it is still called from posPaymentController.ts's confirmPaymentRequest
 * to service POSPaymentRequest rows created before this shutdown whose stored
 * `processor` is still 'STRIPE' (a genuinely historical/legacy-row case, not a new
 * charge attempt) -- see that call site's own comments for the full distinction.
 */

export interface RetrieveAndVerifyParams {
  paymentIntentId: string;
  stripeConnectId: string;
  posRequestId: string;
}
export interface RetrieveAndVerifySuccess {
  ok: true;
  externalPaymentId: string;
}
export interface RetrieveAndVerifyFailure {
  ok: false;
  status: number;
  message: string;
}
export type RetrieveAndVerifyResult = RetrieveAndVerifySuccess | RetrieveAndVerifyFailure;

/**
 * Retrieve/confirm + status check -- unchanged. Verifies the PaymentIntent actually
 * succeeded and belongs to this exact request before the controller proceeds to
 * fulfillment (Purchase creation, stock decrement, etc).
 */
export async function retrieveAndVerifyPayment(
  params: RetrieveAndVerifyParams
): Promise<RetrieveAndVerifyResult> {
  let paymentIntent: Stripe.PaymentIntent;
  try {
    paymentIntent = await stripe().paymentIntents.retrieve(
      params.paymentIntentId,
      {},
      { stripeAccount: params.stripeConnectId }
    );
  } catch (err: any) {
    console.error('[stripePosPaymentAdapter] Failed to retrieve PaymentIntent:', err);
    return { ok: false, status: 400, message: 'Could not verify payment with Stripe' };
  }

  if (paymentIntent.status !== 'succeeded') {
    return {
      ok: false,
      status: 400,
      message: `Payment intent status is ${paymentIntent.status}, expected succeeded`,
    };
  }

  if (
    paymentIntent.metadata?.source !== 'pos_payment_request' ||
    paymentIntent.metadata?.requestId !== params.posRequestId
  ) {
    return { ok: false, status: 400, message: 'Payment intent does not match this payment request' };
  }

  return { ok: true, externalPaymentId: paymentIntent.id };
}
