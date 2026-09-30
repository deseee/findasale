import Stripe from 'stripe';
import type { Request, Response, NextFunction } from 'express';

/**
 * Thrown by getStripe() when STRIPE_SECRET_KEY is missing (2026-09-29). Stripe is closed and the
 * server boots without a key, so a legacy Stripe path that is really called must fail cleanly:
 * status/statusCode 503 and a stable code, which the global error handler in index.ts turns into a
 * clear 503 JSON body instead of a generic 500. The message keeps its original wording.
 */
export class StripeNotConfiguredError extends Error {
  readonly status = 503;
  readonly statusCode = 503;
  readonly code = 'STRIPE_NOT_CONFIGURED';
  constructor(
    message = 'STRIPE_SECRET_KEY is not defined in environment variables. Set it in your .env file before initializing Stripe.'
  ) {
    super(message);
    this.name = 'StripeNotConfiguredError';
  }
}

export const isStripeNotConfiguredError = (err: unknown): err is StripeNotConfiguredError =>
  !!err && typeof err === 'object' && (err as { code?: unknown }).code === 'STRIPE_NOT_CONFIGURED';

export const isStripeConfigured = (): boolean => !!process.env.STRIPE_SECRET_KEY;

/**
 * Express guard for Stripe-only endpoints (the Stripe webhooks): answers 503 STRIPE_NOT_CONFIGURED
 * when no key is set, otherwise passes through untouched.
 */
export const stripeUnavailableGuard = (_req: Request, res: Response, next: NextFunction): void => {
  if (isStripeConfigured()) {
    next();
    return;
  }
  res.status(503).json({
    code: 'STRIPE_NOT_CONFIGURED',
    message: 'Stripe is not configured on this server. Payments run on Square.',
  });
};

let stripe: Stripe | null = null;
let testStripeInstance: Stripe | null = null;

// Stripe Partners program app info
// When Stripe provides partner_id after acceptance, Patrick adds STRIPE_PARTNER_ID=pp_partner_XXXXX to Railway env
const APP_INFO: Stripe.AppInfo = {
  name: 'FindA.Sale',
  version: '1.0.1',
  url: 'https://finda.sale',
  partner_id: process.env.STRIPE_PARTNER_ID,
};

export const getStripe = (): Stripe => {
  if (!stripe) {
    const stripeKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeKey) {
      throw new StripeNotConfiguredError();
    }

    stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
      appInfo: APP_INFO,
      timeout: 20000, // 20s network timeout — don't hang a request thread on a stalled Stripe call
      maxNetworkRetries: 2, // retry idempotent Stripe calls twice on network failure
    });
  }
  return stripe;
};

export const getTestStripe = (): Stripe => {
  const testKey = process.env.STRIPE_TEST_SECRET_KEY;
  if (!testKey) {
    return getStripe(); // pre-go-live fallback
  }
  if (!testStripeInstance) {
    testStripeInstance = new Stripe(testKey, {
      apiVersion: '2023-10-16',
      appInfo: APP_INFO,
      timeout: 20000,
      maxNetworkRetries: 2,
    });
  }
  return testStripeInstance;
};

export default getStripe;
