/**
 * stripeBootConfig.ts -- pure decision for the boot-time STRIPE_SECRET_KEY check (2026-09-29).
 *
 * The platform payment rail is Square and the Stripe platform account is closed
 * (STRIPE_PLATFORM_CLOSED defaults to true; only the literal string 'false' reopens Stripe, the same
 * rule controllers/billingController.ts uses). A missing STRIPE_SECRET_KEY is therefore fatal at boot
 * only when Stripe is NOT closed. While Stripe is closed the server must still start, so the check
 * logs one clear warning and continues; the legacy Stripe code paths stay in place and fail with a
 * 503 STRIPE_NOT_CONFIGURED (see utils/stripe.ts) only if something actually calls them.
 *
 * Kept free of imports and side effects so index.ts can call it before anything else loads and so it
 * can be unit tested with a plain env object.
 */

export type StripeBootAction = 'ok' | 'warn' | 'exit';

export interface StripeBootDecision {
  action: StripeBootAction;
  /** True unless STRIPE_PLATFORM_CLOSED is explicitly 'false'. */
  stripeClosed: boolean;
  /** Line to log for 'warn' and 'exit'; null for 'ok'. */
  message: string | null;
}

type EnvLike = Record<string, string | undefined>;

export function isStripePlatformClosed(env: EnvLike): boolean {
  return env.STRIPE_PLATFORM_CLOSED !== 'false';
}

export function evaluateStripeBootConfig(env: EnvLike): StripeBootDecision {
  const stripeClosed = isStripePlatformClosed(env);
  const hasKey = typeof env.STRIPE_SECRET_KEY === 'string' && env.STRIPE_SECRET_KEY.trim().length > 0;

  if (hasKey) return { action: 'ok', stripeClosed, message: null };

  if (stripeClosed) {
    return {
      action: 'warn',
      stripeClosed,
      message:
        'STRIPE_SECRET_KEY is not set. Stripe is closed (STRIPE_PLATFORM_CLOSED is not "false") and payments run on Square, so the server is starting anyway. Any legacy Stripe endpoint that is called will answer 503 STRIPE_NOT_CONFIGURED.',
    };
  }

  return {
    action: 'exit',
    stripeClosed,
    message: 'FATAL: STRIPE_SECRET_KEY not set while STRIPE_PLATFORM_CLOSED is "false" (Stripe is enabled). Server will not start.',
  };
}
