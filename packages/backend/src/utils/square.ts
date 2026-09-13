import { SquareClient, SquareEnvironment, SquareError } from 'square';

/**
 * Square migration Wave 1 #1 (Checkout, 2026-09-07) -- lazy Square client, mirrors the
 * existing utils/stripe.ts getStripe() lazy-init pattern (throw a clear error if the env
 * var is missing, cache a singleton per process).
 *
 * TWO DIFFERENT CLIENT SHAPES -- Square's auth model is NOT like Stripe Connect's
 * `{ stripeAccount }` per-request option:
 *   - getSquarePlatformClient() -- FindA.Sale's OWN Square developer account access token
 *     (SQUARE_ACCESS_TOKEN). Platform-level calls only (OAuth token exchange, webhook
 *     signature verification key lookups). NEVER used to create a payment on an
 *     organizer's behalf -- see getSquareClientForMerchant below for why.
 *   - getSquareClientForMerchant(accessToken) -- a FRESH client scoped to the connected
 *     ORGANIZER's own OAuth access token. Confirmed via Square's own docs (Collect
 *     Application Fees guide, "Your Square account" section, read live 2026-09-07):
 *     "Square identifies the seller's Square account by reading the access token obtained
 *     in the OAuth code flow and used in the CreatePayment request." Unlike Stripe's
 *     Destination-charge model (one platform-token client + a per-call `stripeAccount`
 *     request option), a Square app_fee_money charge on behalf of a connected merchant
 *     requires the ENTIRE client to be authorized as that merchant -- there is no
 *     cheaper way to scope a single call the way Stripe does.
 *
 * WHERE THE ORGANIZER'S ACCESS TOKEN COMES FROM: see squarePaymentService.ts's
 * resolveOrganizerSquareAccessToken() -- THAT is the real gap (no token-storage schema
 * field exists yet), not this file. This file just turns a token string into a client.
 */

let platformClient: SquareClient | null = null;

// SECURITY FIX (findasale-hacker fix-and-reverify pass, 2026-09-08): this used to default to
// PRODUCTION whenever SQUARE_ENVIRONMENT was unset/blank/mistyped -- the opposite default from
// squareConnectService.ts's getSquareEnvironment() (which safely defaults to SANDBOX unless
// SQUARE_ENVIRONMENT is exactly 'production'). Since THIS file is what checkout/POS/vendor-booth-
// cart's actual charge calls route through (getSquareClientForMerchant, below), the old default
// meant a missing/misconfigured env var would silently attempt PRODUCTION charges using tokens
// that were issued (via the Sandbox-defaulting OAuth flow) against Square's SANDBOX -- an
// inconsistency across files, and the riskier of the two possible defaults. Flipped to match
// squareConnectService.ts's own convention: explicit opt-IN to production, fail toward the
// non-money-moving environment otherwise.
const resolveEnvironment = (): SquareEnvironment => {
  const raw = (process.env.SQUARE_ENVIRONMENT || '').trim().toLowerCase();
  return raw === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox;
};

export const getSquarePlatformClient = (): SquareClient => {
  if (!platformClient) {
    const token = process.env.SQUARE_ACCESS_TOKEN;
    if (!token) {
      throw new Error(
        'SQUARE_ACCESS_TOKEN is not defined in environment variables. Set it in your .env file before initializing Square.'
      );
    }
    platformClient = new SquareClient({
      token,
      environment: resolveEnvironment(),
    });
  }
  return platformClient;
};

/**
 * Per-request client scoped to a connected ORGANIZER's OWN OAuth access token -- every
 * checkout/POS/refund call site that charges on an organizer's behalf must use this, not
 * getSquarePlatformClient(). Deliberately NOT cached/singleton (unlike the platform
 * client above): a merchant's token can rotate/refresh between requests once the
 * Connect-onboarding dispatch implements real token storage + refresh, and caching a
 * stale one here would silently keep charging against a revoked/expired token instead of
 * surfacing the failure immediately.
 */
export const getSquareClientForMerchant = (organizerAccessToken: string): SquareClient => {
  if (!organizerAccessToken) {
    throw new Error(
      'getSquareClientForMerchant: organizerAccessToken is required (empty/undefined) -- this is a caller bug, not a runtime condition to handle silently.'
    );
  }
  return new SquareClient({
    token: organizerAccessToken,
    environment: resolveEnvironment(),
  });
};

/**
 * FindA.Sale's own platform Square location id (Developer Console -> Locations) --
 * used for charges that belong to the PLATFORM itself, not any connected organizer/
 * booth (e.g. boostService.ts's SQUARE cash rail, and the hub-owner-share portion of
 * a booth-cart leg's app fee allocation in squareVendorBoothCartService.ts, ADR-123).
 * Same env var (SQUARE_PLATFORM_LOCATION_ID) squareVendorBoothCartService.ts already
 * reads for that ADR -- Patrick set this once, so no new Railway env var is needed
 * for the boost Square rail to use it too.
 */
export const getPlatformSquareLocationId = (): string => {
  const locationId = process.env.SQUARE_PLATFORM_LOCATION_ID;
  if (!locationId) {
    throw new Error(
      'SQUARE_PLATFORM_LOCATION_ID is not set. Patrick must look up ' +
        "FindA.Sale's platform Square location id (Developer Console -> Locations) and set it as " +
        'an env var on the Railway backend service before any platform-level Square charge ' +
        '(boost purchases, hub-owner-share allocations) can go through.'
    );
  }
  return locationId;
};

export { SquareError };
export default getSquarePlatformClient;
