import type { Request, Response, NextFunction } from 'express';

/**
 * Stripe is retired on FindA.Sale (owner decision 2026-11-04: "Nobody should be using Stripe anymore
 * for anything, period. The keys have been turned off."). Payments run on Square.
 *
 * This module no longer builds a Stripe client and the backend no longer imports the `stripe` SDK.
 * What is left is the answer old clients get when they call a retired Stripe endpoint:
 * 410 STRIPE_RETIRED, plus a typed error for any code path that used to call Stripe and must now
 * refuse cleanly instead.
 *
 * Historical Stripe data (Purchase.stripePaymentIntentId, Organizer.stripeCustomerId and the like)
 * is still read for history, refund bookkeeping and reports; only the live Stripe API is gone.
 */

export const STRIPE_RETIRED_CODE = 'STRIPE_RETIRED';
export const STRIPE_RETIRED_MESSAGE = 'Stripe is retired on FindA.Sale. Payments run on Square.';

/** Thrown by a code path that used to call Stripe. The global error handler turns it into a 410. */
export class StripeRetiredError extends Error {
  readonly status = 410;
  readonly statusCode = 410;
  readonly code = STRIPE_RETIRED_CODE;
  constructor(message = STRIPE_RETIRED_MESSAGE) {
    super(message);
    this.name = 'StripeRetiredError';
  }
}

export const isStripeRetiredError = (err: unknown): err is StripeRetiredError =>
  !!err && typeof err === 'object' && (err as { code?: unknown }).code === STRIPE_RETIRED_CODE;

/**
 * Express handler for every retired Stripe endpoint (the Stripe webhooks, the old Stripe payment,
 * Connect onboarding and subscription routes). Always answers 410 STRIPE_RETIRED and never calls
 * next(), so nothing behind it can run.
 */
export const stripeUnavailableGuard = (_req: Request, res: Response, _next?: NextFunction): void => {
  res.status(410).json({ code: STRIPE_RETIRED_CODE, message: STRIPE_RETIRED_MESSAGE });
};
