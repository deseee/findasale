import { SquareClient, SquareEnvironment } from 'square';
import { createHmac, timingSafeEqual } from 'crypto';
import * as Sentry from '@sentry/node';
import { prisma } from '../lib/prisma';
import { createNotification } from './notificationService';
import { isPayoutFlaggedForReview, type ConnectOwnerType } from './connectAccountGuard'; // S1198-equivalent guard (2026-09-07 Square migration, Wave 1 #2): re-exported type so ownerType strings never drift between the Stripe and Square guards -- isPayoutFlaggedForReview itself is already processor-agnostic (reads Organizer/Consignor/VendorBooth.payoutsFlaggedForReview directly, no Stripe-specific lookup), so it is reused as-is rather than re-implemented.

/**
 * Square Connect-Equivalent Onboarding Service
 * (2026-09-07, Square-replaces-Stripe migration, Wave 1 dispatch #2)
 *
 * Mirrors stripeConnectService.ts's SHAPE (one service handling organizer/consignor/
 * hub-owner/vendor-booth-operator onboarding) but NOT its OAuth mechanics -- Square's
 * OAuth model is fundamentally different from Stripe Connect's:
 *
 *   Stripe: platform calls stripe().accounts.create() to CREATE the connected account
 *   server-side, then stripe().accountLinks.create() to get a hosted-onboarding URL.
 *   The platform's OWN secret key can act on any connected account afterward via the
 *   `Stripe-Account` header / `stripeAccount` option -- no per-account token is ever
 *   stored.
 *
 *   Square: the seller already has (or creates) their OWN Square account entirely on
 *   Square's side. FindA.Sale never "creates" anything server-side before redirecting --
 *   it builds an authorize URL (Stage 1), Square redirects back with a `code` (Stage 2),
 *   and FindA.Sale exchanges that `code` for a genuinely distinct per-merchant OAuth
 *   access token + refresh token (Stage 3, ObtainToken) that must be used for every
 *   subsequent API call made on that merchant's behalf. There is no platform-wide
 *   impersonation mechanism the way Stripe's Connect header provides.
 *
 * ============================================================================
 * RESOLVED (2026-09-07, Wave 0.5): the schema gap described in the "TOP FINDING" section
 * immediately below is CLOSED. Organizer/Consignor/VendorBooth all now have
 * squareAccessTokenEncrypted/squareRefreshTokenEncrypted/squareTokenExpiresAt columns
 * (migration 20260907020000_square_oauth_token_storage_and_boothcartleg_processor). Option 1
 * from the "two real options" list below was the one implemented (parallel encrypted columns
 * per owner model, continuing Wave 0's own convention) -- NOT Option (a)/(b), which proposed
 * reusing/generalizing MarketplaceAccount; that table's organizerId-only FK shape was judged
 * a worse fit than extending the pattern Wave 0 already established on all three models.
 * handleSquareConnectCallback (squareConnectController.ts) now persists the token for all
 * three owner types; squarePaymentService.ts's resolveOrganizerSquareAccessToken,
 * squareRefundService.ts's resolveSquareAccessToken, and squarePosPaymentAdapter.ts's
 * preflightAccountStatus all read/decrypt/refresh a real token instead of always throwing.
 * The TOP FINDING section below is kept for historical context -- do not read it as
 * still-current; it predates this resolution.
 * ============================================================================
 * TOP FINDING -- SCHEMA GAP (HISTORICAL, see RESOLVED note above):
 * ============================================================================
 * Wave 0's schema additions (Organizer.squareMerchantId/squareOnboarded/squareLocationId,
 * Consignor.squareAccountId/squareOnboarded, VendorBooth.squareAccountId/squareOnboarded)
 * give us somewhere to persist the merchant's IDENTITY, but nowhere to persist the OAuth
 * ACCESS TOKEN / REFRESH TOKEN / EXPIRY that Square's model requires for every future API
 * call on that merchant's behalf (payments, refunds, bank-account reads, status checks).
 * This is NOT a gap specific to this dispatch -- it blocks every other Square
 * money-movement dispatch too (checkout #1, POS #3, refunds #4 all need a durable
 * per-merchant token to actually charge/refund anyone after onboarding completes).
 *
 * This was NOT silently patched around with an unsafe workaround (e.g. stuffing a token
 * into an unrelated free-text column). Instead:
 *   - Every function below that NEEDS an access token takes it as an explicit parameter
 *     (exchangeSquareAuthorizationCode returns one; getSquareAccountStatus/
 *     fetchAndCheckSquareBankFingerprints consume one) -- the code is correct and complete
 *     up to the persistence boundary.
 *   - handleSquareConnectCallback (squareConnectController.ts) persists everything the
 *     CURRENT schema supports (squareMerchantId/squareLocationId/squareOnboarded) and
 *     performs one immediate, synchronous bank-fingerprint check using the token before
 *     it would otherwise be discarded -- but the token itself is NOT persisted anywhere,
 *     so a later status re-check (e.g. re-loading the settings page after the callback)
 *     cannot live-verify Square's side again the way Stripe's getAccountStatus can.
 *   - RECOMMENDED FOLLOW-UP MIGRATION (not made here -- Wave 0 is deployed/locked and this
 *     dispatch is barred from schema.prisma/migrations): the codebase already has exactly
 *     the right precedent table for this -- `MarketplaceAccount` (schema.prisma ~6657),
 *     a GENERALIZED per-organizer OAuth token store built explicitly for "more platforms
 *     added later via ALTER TYPE ... ADD VALUE IF NOT EXISTS" on its
 *     `MarketplaceConnectionPlatform` enum, with `accessToken`/`refreshToken` ENCRYPTED at
 *     rest via utils/tokenCrypto.ts (the SocialAccount/ADR-077a precedent). Two real
 *     options for a follow-up migration:
 *       (a) Add a `SQUARE` value to `MarketplaceConnectionPlatform` and reuse
 *           MarketplaceAccount as-is for the ORGANIZER-level Square token (it is already
 *           organizerId-scoped) -- cheapest, but does not cover Consignor/VendorBooth,
 *           which need their OWN independent Square identity the same way they have their
 *           own independent Stripe Connect identity today.
 *       (b) Generalize MarketplaceAccount's owner reference from organizerId-only to an
 *           ownerType/ownerId pair (mirroring ConnectBankFingerprint's own existing
 *           pattern) so Consignor and VendorBooth rows can store their own Square tokens
 *           too -- more work, but the architecturally correct fix and consistent with how
 *           this dispatch already treats Consignor/VendorBooth as independent Square
 *           identities everywhere else.
 *     Either way, the new/reused columns need `accessToken`/`refreshToken` encrypted via
 *     tokenCrypto.ts (`encryptToken`/`decryptToken`), plus a `tokenExpiresAt` (Square
 *     access tokens expire in 30 days; the code flow's refresh token does not expire, so a
 *     refresh-before-use pattern is viable once storage exists -- refreshSquareAccessToken
 *     below already implements that half).
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// Client construction
// ---------------------------------------------------------------------------

const getSquareEnvironment = (): SquareEnvironment =>
  process.env.SQUARE_ENVIRONMENT === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox;

const squareOAuthBaseUrl = (): string =>
  getSquareEnvironment() === SquareEnvironment.Production
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';

let oauthClientSingleton: SquareClient | null = null;
/**
 * Platform-level client -- no per-merchant token, used only for the OAuth token exchange
 * (client.oAuth.obtainToken/revokeToken). FIXED 2026-09-07 (CI syntax/type errors, this
 * session): the original `import { OAuthClient } from 'square/oAuth'` subpath import does
 * not type-resolve under this project's tsconfig (`module: commonjs`, no explicit
 * moduleResolution -- Square's own README notes subpath exports need node16/nodenext/bundler
 * resolution). Verified against the actual SDK source + reference.md this session: OAuth is
 * exposed as a namespace on a normally-constructed SquareClient (`client.oAuth.obtainToken`),
 * not a separately-instantiated OAuthClient -- same pattern as every other resource
 * (client.payments, client.refunds, etc).
 */
const getSquareOAuthClient = (): SquareClient => {
  if (!oauthClientSingleton) {
    oauthClientSingleton = new SquareClient({ environment: getSquareEnvironment() });
  }
  return oauthClientSingleton;
};

/**
 * Per-merchant API client. Deliberately NOT cached/singleton -- unlike utils/stripe.ts's
 * single-platform-key pattern (one Stripe secret key acts on every connected account via a
 * header), Square hands back a genuinely distinct bearer token per connected merchant, so
 * every call needs its own client instance built from that merchant's own token.
 */
const getSquareClientForMerchant = (merchantAccessToken: string): SquareClient =>
  new SquareClient({ token: merchantAccessToken, environment: getSquareEnvironment() });

// ---------------------------------------------------------------------------
// OAuth authorize URL + state encoding
// ---------------------------------------------------------------------------

export type SquareOnboardingOwnerType = ConnectOwnerType; // 'ORGANIZER' | 'CONSIGNOR' | 'VENDOR_BOOTH'

export interface SquareOAuthState {
  ownerType: SquareOnboardingOwnerType;
  ownerId: string;
  // SECURITY FIX (findasale-hacker fix-and-reverify pass, 2026-09-07): the user who
  // INITIATED this OAuth flow, embedded in the SIGNED payload. handleSquareConnectCallback
  // requires this to equal the CURRENTLY authenticated caller (req.user.id) -- this is the
  // real CSRF/state-fixation defense. The old ownerId-belongs-to-userId check alone was NOT
  // sufficient: state was unsigned, so an attacker could forge a state blob naming a REAL
  // victim's ownerId, complete Square's OAuth consent with their OWN Square account, then
  // trick the victim (already logged into FindA.Sale) into visiting
  // /square-oauth-callback?code=<attacker's code>&state=<forged state>. The victim's own
  // authenticated session would have passed the old ownerId-ownership check and silently
  // bound the ATTACKER's Square account (and all its future charges/app_fee_allocations)
  // onto the VICTIM's organizer/consignor/booth row -- a full account-linkage hijack via
  // classic OAuth login-CSRF. See encodeSquareOAuthState/decodeSquareOAuthState below and
  // handleSquareConnectCallback's userId-match check for the fix.
  userId: string;
  nonce: string;
  ts: number;
}

/**
 * SECURITY FIX (2026-09-07, findasale-hacker fix-and-reverify pass): `state` IS now a real
 * security boundary -- HMAC-signed with a key derived from JWT_SECRET (domain-separated via
 * HMAC-of-a-constant, so a leak of this derived key can never be replayed to forge a login
 * JWT) and bound to the initiating user's id. The comment this replaced claimed `state` was
 * "deliberately NOT HMAC-signed" because "the security boundary is
 * handleSquareConnectCallback's own ownership check" -- that reasoning was WRONG (see
 * SquareOAuthState.userId's doc comment for the exact attack it missed). Signing + binding
 * to userId closes it: a forged state fails signature verification, and even a
 * validly-signed state replayed under a DIFFERENT user's session fails the userId-match
 * check in handleSquareConnectCallback.
 */
const SQUARE_OAUTH_STATE_MAX_AGE_MS = 15 * 60 * 1000; // 15 min -- generous for a real onboarding flow, bounds a stolen-URL replay window

function getSquareStateSigningKey(): Buffer {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('[squareConnectService] JWT_SECRET is not set -- required to sign/verify Square OAuth state.');
  }
  // Derived, domain-separated key -- never sign/verify Square OAuth state with the raw JWT
  // secret directly, so a compromise of this derived key alone can't be used to forge a login JWT.
  return createHmac('sha256', jwtSecret).update('square-oauth-state-v1').digest();
}

function signSquareStatePayload(payloadJson: string): string {
  return createHmac('sha256', getSquareStateSigningKey()).update(payloadJson).digest('base64url');
}

export const encodeSquareOAuthState = (
  ownerType: SquareOnboardingOwnerType,
  ownerId: string,
  userId: string
): string => {
  const payload: SquareOAuthState = {
    ownerType,
    ownerId,
    userId,
    nonce: Math.random().toString(36).slice(2) + Date.now().toString(36),
    ts: Date.now(),
  };
  const payloadJson = JSON.stringify(payload);
  const signature = signSquareStatePayload(payloadJson);
  return Buffer.from(JSON.stringify({ p: payloadJson, s: signature }), 'utf8').toString('base64url');
};

export const decodeSquareOAuthState = (state: string): SquareOAuthState | null => {
  try {
    const envelope = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    if (!envelope || typeof envelope.p !== 'string' || typeof envelope.s !== 'string') return null;

    const expectedSignature = signSquareStatePayload(envelope.p);
    const provided = Buffer.from(envelope.s, 'utf8');
    const expected = Buffer.from(expectedSignature, 'utf8');
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return null; // tampered or forged -- never trust an unsigned/mis-signed state
    }

    const parsed = JSON.parse(envelope.p);
    if (
      !parsed ||
      typeof parsed.ownerType !== 'string' ||
      typeof parsed.ownerId !== 'string' ||
      typeof parsed.userId !== 'string' ||
      typeof parsed.nonce !== 'string' ||
      typeof parsed.ts !== 'number'
    ) {
      return null;
    }
    if (!['ORGANIZER', 'CONSIGNOR', 'VENDOR_BOOTH'].includes(parsed.ownerType)) return null;
    if (Date.now() - parsed.ts > SQUARE_OAUTH_STATE_MAX_AGE_MS) return null; // expired -- bounds a stolen-URL replay window
    return parsed as SquareOAuthState;
  } catch {
    return null;
  }
};

/**
 * Scope list is deliberately a little broader than THIS dispatch strictly needs
 * (MERCHANT_PROFILE_READ + BANK_ACCOUNTS_READ cover onboarding/fraud-guard; ORDERS_* and PAYMENTS_* are for the checkout dispatch, #1) -- Square requires re-authorization to
 * ADD scope later, and forcing every onboarded merchant through a second OAuth grant once
 * checkout ships would be a real UX regression. Judgment call, flagged for revisit if the
 * checkout dispatch's actual scope needs differ from this guess.
 */
const SQUARE_OAUTH_SCOPES = [
  'MERCHANT_PROFILE_READ',
  'PAYMENTS_WRITE',
  'PAYMENTS_READ',
  'BANK_ACCOUNTS_READ',
  'ORDERS_WRITE',
  'ORDERS_READ',
  // Added 2026-09-07 (vendor-booth-cart-checkout dispatch): required for the researched
  // Shared Card on File mechanism (squareVendorBoothCartService.ts's file-header comment) --
  // PAYMENTS_WRITE_SHARED_ONFILE lets a booth's own CreatePayment call accept a card id that
  // was created in FindA.Sale's OWN platform Square account as source_id; CUSTOMERS_WRITE
  // lets this dispatch create the per-booth Customer record CreatePayment requires alongside
  // a shared card. FLAGGED, not silently assumed safe: whether PAYMENTS_WRITE_SHARED_ONFILE
  // requires a separate Square App Marketplace review beyond the OAuth grant itself was NOT
  // confirmed this session (see Square's "Cards on File Requirements" doc) -- a booth that
  // onboarded BEFORE this scope was added will need to re-run OAuth consent to pick it up;
  // existing squareOnboarded=true rows are not retroactively re-scoped by this change alone.
  'PAYMENTS_WRITE_SHARED_ONFILE',
  'CUSTOMERS_WRITE',
  'CUSTOMERS_READ',
  // Added 2026-09-07 (ADR-123, hub-owner-share settlement dispatch, same day as the
  // SHARED_ONFILE addition immediately above -- same caveat applies): required so a
  // Square CreatePayment call can carry `app_fee_allocations` naming the hub owner's
  // OWN connected location as a second recipient alongside the platform's own cut
  // (Square's "Distribute fees to multiple parties" mechanism -- see
  // squareVendorBoothCartService.ts's authorizeSquareBoothCartLeg for the call site).
  // Square's own docs: "Your application must hold the PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS
  // permission for every location in the allocations list -- not only for the seller
  // whose payment is being taken. If any allocation's location is owned by a separate
  // Square account, that account must grant the permission via the OAuth flow." This
  // means BOTH the booth (seller) AND the hub owner (additional recipient) need this
  // scope on their own OAuth grant. FLAGGED, not silently assumed safe (ADR-123 §9):
  // whether this requires a separate Square App Marketplace review beyond the OAuth
  // scope grant itself was NOT confirmed -- same open question already flagged for
  // PAYMENTS_WRITE_SHARED_ONFILE above.
  // RE-CONSENT CAVEAT: a booth or hub owner who completed Square onboarding BEFORE this
  // scope was added will NOT have granted PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS and must
  // re-run OAuth consent before their squareLocationId is a legal allocation target --
  // existing squareOnboarded=true rows are NOT retroactively re-scoped by this change
  // alone (same caveat, same reason, as the SHARED_ONFILE addition immediately above).
  // vendorBoothCartController.ts's computeLegFeeSplit SQUARE readiness gate only checks
  // squareOnboarded/squareLocationId (the schema has no per-scope tracking column) -- it
  // CANNOT distinguish a hub owner who onboarded pre- vs post-this-scope. This gap is
  // flagged, not silently assumed away: see computeLegFeeSplit's own comment.
  'PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS',
].join(' ');

export const buildSquareAuthorizeUrl = (
  ownerType: SquareOnboardingOwnerType,
  ownerId: string,
  userId: string
): { url: string; state: string } => {
  const clientId = process.env.SQUARE_APPLICATION_ID;
  if (!clientId) {
    throw new Error(
      '[squareConnectService] SQUARE_APPLICATION_ID is not set. Patrick must create a Square ' +
        'application in the Developer Dashboard and set SQUARE_APPLICATION_ID/' +
        'SQUARE_APPLICATION_SECRET/SQUARE_ENVIRONMENT on the Railway backend service, and ' +
        'register the OAuth redirect URL there (Square does not accept a per-request ' +
        'redirect_uri the way some OAuth providers do -- it is fixed per application).'
    );
  }
  // SECURITY FIX (2026-09-07, findasale-hacker pass): state is now bound to the initiating
  // user (see SquareOAuthState.userId's doc comment) -- every caller of this function must
  // pass the CURRENTLY authenticated req.user.id, never a different/omitted value.
  const state = encodeSquareOAuthState(ownerType, ownerId, userId);
  const params = new URLSearchParams({
    client_id: clientId,
    scope: SQUARE_OAUTH_SCOPES,
    state,
    session: 'false',
  });
  return { url: `${squareOAuthBaseUrl()}/oauth2/authorize?${params.toString()}`, state };
};

// ---------------------------------------------------------------------------
// Token exchange (Stage 3: ObtainToken) + refresh
// ---------------------------------------------------------------------------

export interface SquareTokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string | undefined; // ISO 8601, per Square's ObtainTokenResponse
  merchantId: string | undefined;
}

/**
 * Exchanges the `code` Square appended to the redirect (Stage 2) for a real access token
 * (Stage 3). Uses the code flow (client_id + client_secret), matching stripeConnectService's
 * own confidential-client posture -- this is a server-to-server call, never exposed to the
 * browser. Caller (handleSquareConnectCallback) is responsible for persisting whatever the
 * current schema supports and for immediately using the returned accessToken for a status
 * check + bank-fingerprint check before it would otherwise be discarded (see the schema-gap
 * note at the top of this file).
 */
export const exchangeSquareAuthorizationCode = async (code: string): Promise<SquareTokenResult> => {
  const clientId = process.env.SQUARE_APPLICATION_ID;
  const clientSecret = process.env.SQUARE_APPLICATION_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('[squareConnectService] SQUARE_APPLICATION_ID/SQUARE_APPLICATION_SECRET not set.');
  }
  const response = await getSquareOAuthClient().oAuth.obtainToken({
    clientId,
    clientSecret,
    code,
    grantType: 'authorization_code',
  });
  if (!response.accessToken) {
    throw new Error('[squareConnectService] Square ObtainToken response had no accessToken.');
  }
  return {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    expiresAt: response.expiresAt,
    merchantId: response.merchantId,
  };
};

/**
 * Refresh-token exchange -- NOT yet called anywhere (nothing persists a refresh token to
 * refresh, per the schema-gap note above). Implemented now so the follow-up migration only
 * needs to wire persistence, not also write this function under time pressure later.
 */
export const refreshSquareAccessToken = async (refreshToken: string): Promise<SquareTokenResult> => {
  const clientId = process.env.SQUARE_APPLICATION_ID;
  const clientSecret = process.env.SQUARE_APPLICATION_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('[squareConnectService] SQUARE_APPLICATION_ID/SQUARE_APPLICATION_SECRET not set.');
  }
  const response = await getSquareOAuthClient().oAuth.obtainToken({
    clientId,
    clientSecret,
    refreshToken,
    grantType: 'refresh_token',
  });
  if (!response.accessToken) {
    throw new Error('[squareConnectService] Square refresh-token ObtainToken response had no accessToken.');
  }
  return {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    expiresAt: response.expiresAt,
    merchantId: response.merchantId,
  };
};

// ---------------------------------------------------------------------------
// Account status (mirrors stripeConnectService.getAccountStatus's SHAPE, not its mechanics --
// Square has no charges_enabled/payouts_enabled/requirements concept; a Square merchant is
// either ACTIVE or it isn't, determined entirely on Square's own side during OAuth consent)
// ---------------------------------------------------------------------------

export interface SquareAccountStatus {
  merchantId: string;
  locationId: string | null;
  status: string; // Square's Merchant.status: 'ACTIVE' | ...
  active: boolean;
  businessName: string | null;
  country: string | null;
  currency: string | null;
}

/**
 * GET /v2/merchants (ListMerchants) with the connected merchant's OWN access token returns
 * exactly one Merchant -- "the merchant associated with the access token" (confirmed via
 * Square's own docs this session, MERCHANT_PROFILE_READ permission). This is the Square
 * analog of stripeConnectService.getAccountStatus, but takes an explicit access token
 * (there is no platform-wide client the way Stripe's getStripe() singleton is) -- see the
 * schema-gap note: every caller of this function today only has a token available
 * momentarily, right after exchangeSquareAuthorizationCode, not on a later page load.
 */
export const getSquareAccountStatus = async (merchantAccessToken: string): Promise<SquareAccountStatus> => {
  const client = getSquareClientForMerchant(merchantAccessToken);
  // client.merchants.list() returns a core.Page<Square.Merchant, ...> wrapper, NOT the raw
  // ListMerchantsResponse -- the current page's items live on `.data`, not `.merchant`
  // (that field only exists on the raw `.response`). Confirmed against the SDK's own
  // Page class source (src/core/pagination/Page.ts) this session.
  const page = await client.merchants.list({});
  const merchant = page.data?.[0];
  if (!merchant || !merchant.id) {
    throw new Error('[squareConnectService] ListMerchants returned no merchant for this access token.');
  }
  return {
    merchantId: merchant.id,
    locationId: merchant.mainLocationId ?? null,
    status: merchant.status ?? 'UNKNOWN',
    active: merchant.status === 'ACTIVE',
    businessName: merchant.businessName ?? null,
    country: merchant.country ?? null,
    currency: merchant.currency ?? null,
  };
};

export const isSquareAccountActive = (status: SquareAccountStatus): boolean => status.active;

/**
 * ADR-123 §5 item 1 / §9 fix (2026-09-16, findasale-architect + findasale-dev): calls
 * Square's real RetrieveTokenStatus endpoint (POST /oauth2/token/status -- confirmed live
 * via Square's own API reference this session, not assumed) to read the scopes ACTUALLY
 * granted on an existing access token, rather than trusting the single cached
 * squareOnboarded boolean. Needed because PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS was only
 * added to SQUARE_OAUTH_SCOPES on 2026-09-07 (ADR-123) -- any merchant who completed Square
 * OAuth consent before that date has squareOnboarded=true but never actually granted this
 * scope, and the schema has no per-scope tracking column to detect that from cached state
 * alone. Uses the SDK's own oAuth client is not available for this endpoint (not exposed by
 * the installed `square` SDK version at the time of this fix, confirmed via package
 * inspection this session) -- calls the documented REST endpoint directly instead, the same
 * pattern already used elsewhere in this backend for third-party calls the SDK doesn't wrap
 * (see ebayCalculatedPolicyService.ts's raw `fetch` calls).
 *
 * Fails CLOSED: any network/parse error or non-200 response returns an empty scopes array
 * (never throws), so a caller checking `.includes(SOME_SCOPE)` correctly treats an
 * unreachable/errored introspection call the same as "scope not granted" -- never silently
 * treats an error as "must be fine."
 */
export const getSquareGrantedScopes = async (accessToken: string): Promise<string[]> => {
  try {
    const response = await fetch(`${squareOAuthBaseUrl()}/oauth2/token/status`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Square-Version': '2026-08-19', // pinned to match the installed square SDK's own default (square@45.1.0 BaseClient.js) -- not an arbitrary date
      },
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      console.warn(`[squareConnectService] getSquareGrantedScopes: token/status returned HTTP ${response.status} -- treating as no scopes granted (fail closed).`);
      return [];
    }
    const data: any = await response.json();
    return Array.isArray(data?.scopes) ? data.scopes : [];
  } catch (err) {
    console.error('[squareConnectService] getSquareGrantedScopes: token/status call failed -- treating as no scopes granted (fail closed):', err);
    return [];
  }
};

/** Scope required for a CreatePayment call's app_fee_allocations to name a second (hub-owner) recipient location -- see squareConnectService's SQUARE_OAUTH_SCOPES comment (ADR-123) for the full rationale. */
export const SQUARE_ADDITIONAL_RECIPIENTS_SCOPE = 'PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS';

// ---------------------------------------------------------------------------
// Reuse-resolution (Square-side design for vendorBoothController.ts's existing
// "does the claiming user already have a working Stripe identity" logic,
// vendorBoothController.ts:757-785) + hub-owner identity reuse (ADR-090 SS1: hub-owner
// payouts reuse the ORGANIZER's own account, never a second Connect-equivalent identity)
// ---------------------------------------------------------------------------

export interface ExistingSquareIdentity {
  squareMerchantId: string;
  squareLocationId: string | null;
  squareOnboarded: boolean;
}

/**
 * Square-side design decision (explicit, not a silent port of the Stripe logic):
 *
 * Stripe's vendorBoothController.ts reuse check (:757-785) calls getAccountStatus() LIVE
 * against Stripe every time it runs, because Stripe's platform key can check ANY connected
 * account's status on demand with no per-account token required. Square has no such
 * mechanism -- checking a Square merchant's live status requires THAT merchant's own
 * access token, which (per the schema-gap note at the top of this file) is not persisted
 * anywhere today. This function therefore can ONLY return the last-known CACHED
 * squareOnboarded flag from the Organizer row, not a live re-verification -- a real,
 * intentional limitation flowing directly from the token-persistence gap, not an oversight.
 * Once a follow-up migration adds durable token storage, this function's body can be
 * upgraded to call getSquareAccountStatus() live, exactly mirroring the Stripe version.
 */
export const resolveExistingSquareIdentityForUser = async (
  userId: string
): Promise<ExistingSquareIdentity | null> => {
  const organizer = await prisma.organizer.findUnique({ where: { userId } });
  if (!organizer?.squareMerchantId) return null;
  return {
    squareMerchantId: organizer.squareMerchantId,
    squareLocationId: organizer.squareLocationId,
    squareOnboarded: organizer.squareOnboarded,
  };
};

// ---------------------------------------------------------------------------
// Bank-account fingerprint fraud guard -- Square-side extension of S1198's
// connectAccountGuard.ts. A NEW function, deliberately NOT a shared call site with the
// Stripe version (recordAndCheckBankFingerprints in connectAccountGuard.ts): Stripe and
// Square each compute their OWN fingerprint hash from the real account+routing number
// using their own undisclosed algorithm/salt -- a Stripe fingerprint and a Square
// fingerprint for the IDENTICAL real-world bank account will NOT be equal as strings.
// This is a real, load-bearing limitation, not a simplification:
//
//   * Square-onboarded-account <-> Square-onboarded-account collisions: caught exactly
//     (exact fingerprint match, same posture as the Stripe guard).
//   * Stripe-onboarded-account <-> Square-onboarded-account collisions (the literal
//     "Stripe+Square collusion pair" scenario Wave 0's schema comment flags as the reason
//     `processor`/`squareAccountId` were added to ConnectBankFingerprint): NOT caught by
//     fingerprint equality, because the two processors' fingerprints for the same real
//     bank account are different opaque strings. Wave 0's schema change alone does not
//     close this gap -- it only makes it POSSIBLE to store Square rows in the same table,
//     which is a prerequisite for the secondary heuristic below, not a full fix by itself.
//   * Secondary, weaker, cross-processor heuristic: `accountNumberSuffix` (Square) /
//     `last4` (Stripe) + a truncated bank-identification-number, compared across BOTH
//     processors regardless of exact fingerprint. This is NOT cryptographically unique
//     (a handful of decimal digits) -- it is a corroborating signal only, flagged with an
//     explicitly weaker flagReason wording so an admin reviewing it knows to treat it with
//     more skepticism than an exact-fingerprint match. This keeps the existing
//     flag-not-block posture (a false positive here costs a human a few seconds of review,
//     never blocks a legitimate payout) while still surfacing the actual collusion pattern
//     Wave 0 was trying to catch.
// ---------------------------------------------------------------------------

interface ResolvedSquareOwner {
  ownerType: ConnectOwnerType;
  ownerId: string;
}

async function resolveSquareOwners(squareAccountId: string): Promise<ResolvedSquareOwner[]> {
  const [organizers, consignors, booths] = await Promise.all([
    prisma.organizer.findMany({ where: { squareMerchantId: squareAccountId }, select: { id: true } }),
    prisma.consignor.findMany({ where: { squareAccountId }, select: { id: true } }),
    prisma.vendorBooth.findMany({ where: { squareAccountId }, select: { id: true } }),
  ]);
  const owners: ResolvedSquareOwner[] = [];
  for (const o of organizers) owners.push({ ownerType: 'ORGANIZER', ownerId: o.id });
  for (const c of consignors) owners.push({ ownerType: 'CONSIGNOR', ownerId: c.id });
  for (const b of booths) owners.push({ ownerType: 'VENDOR_BOOTH', ownerId: b.id });
  return owners;
}

async function setSquareOwnerFlag(owner: ResolvedSquareOwner, reason: string): Promise<void> {
  try {
    if (owner.ownerType === 'ORGANIZER') {
      await prisma.organizer.update({
        where: { id: owner.ownerId },
        data: { payoutsFlaggedForReview: true, payoutsFlaggedReason: reason },
      });
    } else if (owner.ownerType === 'CONSIGNOR') {
      await prisma.consignor.update({
        where: { id: owner.ownerId },
        data: { payoutsFlaggedForReview: true, payoutsFlaggedReason: reason },
      });
    } else {
      await prisma.vendorBooth.update({
        where: { id: owner.ownerId },
        data: { payoutsFlaggedForReview: true, payoutsFlaggedReason: reason },
      });
    }
  } catch (err) {
    console.error(
      `[squareConnectService] Failed to set payoutsFlaggedForReview on ${owner.ownerType} ${owner.ownerId} (non-fatal):`,
      err
    );
  }
}

async function notifyAdminsOfSquareBankFingerprintFlag(
  ownerType: ConnectOwnerType,
  ownerId: string,
  squareAccountId: string,
  reason: string
): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: { OR: [{ roles: { has: 'ADMIN' } }, { role: 'ADMIN' }] },
      select: { id: true },
    });
    if (admins.length === 0) {
      console.warn('[squareConnectService] No ADMIN users found -- Square bank fingerprint flag has no one to notify');
      return;
    }
    const title = 'Payout flagged: shared bank account detected (Square)';
    const body = `${ownerType} ${ownerId} (Square acct ${squareAccountId}) was flagged for review: ${reason}`;
    const link = '/admin/connect-bank-fingerprints';
    await Promise.all(
      admins.map((a) =>
        createNotification(
          a.id,
          'connect_bank_fingerprint_flag',
          title,
          body,
          link,
          'OPERATIONAL',
          true,
          'FindA.Sale: payout flagged for review'
        )
      )
    );
  } catch (err) {
    console.warn('[squareConnectService] Failed to notify admins of Square bank fingerprint flag:', err);
  }
}

export interface SquareBankAccountSignal {
  fingerprint: string;
  last4: string | null; // Square's accountNumberSuffix
  bankName: string | null;
  routingLast4: string | null; // last 4 of primaryBankIdentificationNumber -- never store the full identifier
}

/**
 * Main entry point -- never throws (same non-fatal posture as connectAccountGuard.ts's
 * recordAndCheckBankFingerprints; a failure here must never break the onboarding flow or a
 * future webhook delivery that calls it). Called from squareConnectController.ts's OAuth
 * callback handler today (one-shot, using the access token before it is discarded per the
 * schema-gap note); ALSO the intended call site for dispatch #5's
 * bank_account.created/bank_account.verified webhook handlers once that file exists --
 * left as a standalone, independently callable function exactly for that reason (comment
 * left at the export below).
 */
export async function recordAndCheckSquareBankFingerprints(
  squareAccountId: string,
  bankAccounts: SquareBankAccountSignal[]
): Promise<void> {
  try {
    if (!squareAccountId || bankAccounts.length === 0) return;

    const owners = await resolveSquareOwners(squareAccountId);
    if (owners.length === 0) return; // not yet persisted to a FindA.Sale owner row -- no-op, same posture as the Stripe guard

    // Placeholder for the required (non-nullable) ConnectBankFingerprint.stripeAccountId
    // column -- see the OPEN DESIGN QUESTION resolution in this dispatch's handoff for why
    // this exists instead of a migration. Deterministic per Square merchant so the existing
    // @@unique([stripeAccountId, fingerprint, ownerType, ownerId]) constraint still behaves
    // as "one row per owner per fingerprint" without requiring stripeAccountId to become
    // nullable. Never collides with a real Stripe id (those are always `acct_...`).
    const placeholderStripeAccountId = `square:${squareAccountId}`;

    for (const bankAccount of bankAccounts) {
      const { fingerprint, last4, bankName, routingLast4 } = bankAccount;
      if (!fingerprint) continue;

      for (const owner of owners) {
        // Primary check: exact fingerprint match against another SQUARE-onboarded account.
        // See the module header for why this cannot also catch a Stripe+Square pair.
        const exactMatches = await prisma.connectBankFingerprint.findMany({
          where: { fingerprint, processor: 'SQUARE', squareAccountId: { not: squareAccountId } },
        });

        // Secondary, weaker heuristic: last4 + routingLast4 match across BOTH processors --
        // the only signal that can surface a Stripe+Square collusion pair with today's data,
        // at the cost of a non-trivial false-positive rate (a handful of decimal digits).
        // Excludes rows already caught by the exact-match query above.
        const looseMatches =
          last4 && routingLast4
            ? await prisma.connectBankFingerprint.findMany({
                where: {
                  last4,
                  routingLast4,
                  NOT: { id: { in: exactMatches.map((m) => m.id) } },
                  OR: [
                    { processor: { not: 'SQUARE' } },
                    { squareAccountId: { not: squareAccountId } },
                  ],
                },
              })
            : [];

        const isNewExactMatch = exactMatches.length > 0;
        const isNewLooseMatch = looseMatches.length > 0;
        if (!isNewExactMatch && !isNewLooseMatch) {
          // Still record this owner's row (bookkeeping) even with no match, mirroring the
          // Stripe guard's own upsert-always behavior -- future deliveries need something to
          // compare against.
          await prisma.connectBankFingerprint.upsert({
            where: {
              stripeAccountId_fingerprint_ownerType_ownerId: {
                stripeAccountId: placeholderStripeAccountId,
                fingerprint,
                ownerType: owner.ownerType,
                ownerId: owner.ownerId,
              },
            },
            update: { last4: last4 ?? undefined, bankName: bankName ?? undefined, routingLast4: routingLast4 ?? undefined },
            create: {
              stripeAccountId: placeholderStripeAccountId,
              processor: 'SQUARE',
              squareAccountId,
              fingerprint,
              last4,
              bankName,
              routingLast4,
              ownerType: owner.ownerType,
              ownerId: owner.ownerId,
              flagged: false,
            },
          });
          continue;
        }

        const flagReason = isNewExactMatch
          ? `Bank account fingerprint matches ${exactMatches.length} other Square-onboarded account(s): ${exactMatches
              .map((m) => `${m.ownerType} ${m.ownerId}`)
              .join(', ')}`
          : `Possible cross-processor match (last4+bank-id only, NOT an exact fingerprint match -- weaker signal, review carefully) against ${looseMatches.length} other connected account(s): ${looseMatches
              .map((m) => `${m.ownerType} ${m.ownerId} (${m.processor})`)
              .join(', ')}`;

        await prisma.connectBankFingerprint.upsert({
          where: {
            stripeAccountId_fingerprint_ownerType_ownerId: {
              stripeAccountId: placeholderStripeAccountId,
              fingerprint,
              ownerType: owner.ownerType,
              ownerId: owner.ownerId,
            },
          },
          update: {
            last4: last4 ?? undefined,
            bankName: bankName ?? undefined,
            routingLast4: routingLast4 ?? undefined,
            flagged: true,
            flagReason,
          },
          create: {
            stripeAccountId: placeholderStripeAccountId,
            processor: 'SQUARE',
            squareAccountId,
            fingerprint,
            last4,
            bankName,
            routingLast4,
            ownerType: owner.ownerType,
            ownerId: owner.ownerId,
            flagged: true,
            flagReason,
          },
        });

        await setSquareOwnerFlag(owner, flagReason);
        const allMatches = [...exactMatches, ...looseMatches];
        for (const match of allMatches) {
          await setSquareOwnerFlag(
            { ownerType: match.ownerType as ConnectOwnerType, ownerId: match.ownerId },
            `Bank account fingerprint matches ${owner.ownerType} ${owner.ownerId} (Square acct ${squareAccountId}).`
          );
        }

        const msg = `[squareConnectService] Bank-account fingerprint collision (${isNewExactMatch ? 'exact' : 'weak/cross-processor'}): ${owner.ownerType} ${owner.ownerId} (Square acct ${squareAccountId}) shares a bank account with ${allMatches.length} other connected account(s). Flagged for admin review -- payouts NOT auto-blocked.`;
        console.warn(msg);
        try {
          Sentry.captureMessage(msg, 'warning');
        } catch {
          // Sentry may not be initialized -- never let alerting break onboarding
        }
        await notifyAdminsOfSquareBankFingerprintFlag(owner.ownerType, owner.ownerId, squareAccountId, flagReason);
      }
    }
  } catch (error) {
    console.error('[squareConnectService] recordAndCheckSquareBankFingerprints failed (non-fatal):', error);
  }
}

/**
 * Convenience wrapper: fetch a merchant's bank accounts via the Bank Accounts API
 * (GET /v2/bank-accounts, BANK_ACCOUNTS_READ scope -- confirmed reachable for a connected
 * merchant's own OAuth access token this session, see the research-spike note in this
 * dispatch's handoff) and run the fingerprint check in one call. This is the function
 * squareConnectController.ts's OAuth callback calls immediately after token exchange (the
 * "immediately after OAuth callback" half of the original polling-fallback design); the
 * "periodically after" half (a recurring cron re-check) is NOT wired up here -- no jobs/
 * cron file was in this dispatch's scope, and doing so would require the persisted-token
 * follow-up migration anyway (a cron has no access token to poll with once this function
 * returns). Flagged as explicit follow-up work, not silently skipped.
 *
 * Never throws -- mirrors recordAndCheckSquareBankFingerprints's own non-fatal posture, so
 * a Bank Accounts API hiccup can never fail the onboarding callback itself.
 */
export async function fetchAndCheckSquareBankFingerprints(
  merchantAccessToken: string,
  squareAccountId: string
): Promise<void> {
  try {
    const client = getSquareClientForMerchant(merchantAccessToken);
    const pageableResponse = await client.bankAccounts.list({});
    const signals: SquareBankAccountSignal[] = [];
    for await (const bankAccount of pageableResponse) {
      if (!bankAccount.fingerprint) continue; // nothing to record yet -- common mid-onboarding, not an error
      signals.push({
        fingerprint: bankAccount.fingerprint,
        last4: bankAccount.accountNumberSuffix ?? null,
        bankName: bankAccount.bankName ?? null,
        routingLast4:
          typeof bankAccount.primaryBankIdentificationNumber === 'string'
            ? bankAccount.primaryBankIdentificationNumber.slice(-4)
            : null,
      });
    }
    if (signals.length > 0) {
      await recordAndCheckSquareBankFingerprints(squareAccountId, signals);
    }
  } catch (error) {
    console.error('[squareConnectService] fetchAndCheckSquareBankFingerprints failed (non-fatal):', error);
  }
}

// Re-export for money-movement call sites (same read-only, fail-open posture as Stripe's
// isPayoutFlaggedForReview -- it is already processor-agnostic, so no Square-specific
// version is needed; re-exported here purely so callers can `import { ... } from
// './squareConnectService'` without also reaching into connectAccountGuard.ts directly).
export { isPayoutFlaggedForReview };
