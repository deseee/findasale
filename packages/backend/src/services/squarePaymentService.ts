import crypto from 'crypto';
import { SquareError } from 'square';
import { getSquareClientForMerchant } from '../utils/square';
import { prisma } from '../lib/prisma';
import { decryptToken, encryptToken } from '../utils/tokenCrypto';
import { refreshSquareAccessToken } from './squareConnectService';

/**
 * Square Payment Service -- Wave 1 #1 (Checkout, 2026-09-07)
 * Mirrors the split already established by services/paymentEligibilityService.ts +
 * services/refundService.ts's "single shared choke point" shape, Square-flavored.
 *
 * ================================================================================
 * RESOLVED (2026-09-07, Wave 0.5): the gap described below is CLOSED. Organizer now has
 * squareAccessTokenEncrypted/squareRefreshTokenEncrypted/squareTokenExpiresAt columns
 * (schema.prisma, migration 20260907020000_square_oauth_token_storage_and_boothcartleg_processor).
 * resolveOrganizerSquareAccessToken() below now reads/decrypts/refreshes a real persisted
 * token instead of always throwing. The historical gap description immediately below is kept
 * for context (why the seam was designed the way it was) -- do not read it as still-current.
 * ================================================================================
 * OPEN GAP #1 (HISTORICAL -- see RESOLVED note above) -- ORGANIZER
 * SQUARE OAUTH ACCESS TOKEN STORAGE DOES NOT EXIST YET.
 * ================================================================================
 * Square's `app_fee_money` revenue-split model requires the CreatePayment call to be
 * authorized with the CONNECTED ORGANIZER's OWN OAuth access token (confirmed via
 * Square's own docs, "Collect Application Fees" guide, "Your Square account" section,
 * read live 2026-09-07: "Square identifies the seller's Square account by reading the
 * access token obtained in the OAuth code flow and used in the CreatePayment request").
 * This is NOT like Stripe's `{ stripeAccount: id }` per-request option against one
 * platform-token client -- see utils/square.ts's header comment for the full contrast.
 *
 * Wave 0 (schema prereq, deployed 2026-09-07) added `Organizer.squareMerchantId`,
 * `Organizer.squareOnboarded`, `Organizer.squareLocationId` -- but NO field to store the
 * organizer's own OAuth access/refresh token. That token only exists once the
 * Connect-equivalent onboarding dispatch (Wave 1 #2, squareConnectService.ts /
 * squareConnectController.ts) implements the OAuth authorize -> callback -> token
 * exchange flow AND a schema field to persist the result -- this checkout dispatch was
 * explicitly told NOT to touch schema.prisma or add a migration, so it cannot add that
 * field itself.
 *
 * resolveOrganizerSquareAccessToken() below is the SINGLE integration seam every
 * checkout/POS/refund call site should route through -- wiring the real implementation
 * later (once onboarding lands) is a one-function change, not a call-site hunt. Today it
 * always throws SquareOnboardingIncompleteError so a real charge can NEVER be silently
 * misattributed or accidentally routed through the platform's own account -- fail
 * closed, not fabricate a token.
 */

export class SquareOnboardingIncompleteError extends Error {
  constructor(organizerId: string) {
    super(
      `Square payments aren't available for this organizer yet (organizerId=${organizerId}) -- ` +
        'either Square onboarding was never completed, or the stored OAuth token is missing/' +
        'expired with no usable refresh token on file. See resolveOrganizerSquareAccessToken().'
    );
    this.name = 'SquareOnboardingIncompleteError';
  }
}

// Refresh a bit before the real expiry, not exactly at it -- avoids a race where a token
// that reads as "still valid" by a few seconds expires mid-flight during the actual Square
// API call this token is about to be used for.
const SQUARE_TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * THE INTEGRATION SEAM -- see the file-header note above (RESOLVED, Wave 0.5). Signature is
 * kept exactly as originally shaped (reads organizer id + onboarding flags) so every existing
 * caller (squarePaymentController.ts x2, squarePosPaymentAdapter.ts's preflightAccountStatus,
 * squareRefundService.ts's resolveSquareAccessToken) needed ZERO changes -- this function does
 * its own DB lookup by organizer.id for the fields callers don't have (the encrypted token
 * columns), decrypts, refreshes if within SQUARE_TOKEN_REFRESH_SKEW_MS of expiry (or already
 * expired), persists the refreshed token, and returns a usable plaintext access token.
 *
 * Never fabricates or falls back to a platform-wide token -- any failure to resolve a real,
 * usable per-organizer token throws SquareOnboardingIncompleteError, exactly the same failure
 * mode every caller already handles (fail closed, never silently charge the wrong account).
 */
export async function resolveOrganizerSquareAccessToken(organizer: {
  id: string;
  squareMerchantId: string | null;
  squareOnboarded: boolean;
}): Promise<string> {
  if (!organizer.squareOnboarded || !organizer.squareMerchantId) {
    throw new SquareOnboardingIncompleteError(organizer.id);
  }

  const row = await prisma.organizer.findUnique({
    where: { id: organizer.id },
    select: {
      squareAccessTokenEncrypted: true,
      squareRefreshTokenEncrypted: true,
      squareTokenExpiresAt: true,
    },
  });

  if (!row?.squareAccessTokenEncrypted) {
    // Onboarded per the cached flag, but no token was ever persisted (e.g. a row from before
    // Wave 0.5 shipped, or the callback's token-persist step somehow failed). Same fail-closed
    // posture as the original stub -- never fabricate a token.
    throw new SquareOnboardingIncompleteError(organizer.id);
  }

  const expiresAt = row.squareTokenExpiresAt;
  const needsRefresh = !!expiresAt && expiresAt.getTime() <= Date.now() + SQUARE_TOKEN_REFRESH_SKEW_MS;

  if (!needsRefresh) {
    return decryptToken(row.squareAccessTokenEncrypted);
  }

  if (!row.squareRefreshTokenEncrypted) {
    // Access token is expired/expiring and there is no refresh token on file -- cannot
    // recover without the organizer re-running onboarding. Fail closed rather than attempt
    // a charge with a token Square will reject.
    console.error(
      `[squarePaymentService] Organizer ${organizer.id}'s Square access token is expired/expiring ` +
        'with no refresh token on file -- re-onboarding required.'
    );
    throw new SquareOnboardingIncompleteError(organizer.id);
  }

  try {
    const refreshToken = decryptToken(row.squareRefreshTokenEncrypted);
    const refreshed = await refreshSquareAccessToken(refreshToken);
    await prisma.organizer.update({
      where: { id: organizer.id },
      data: {
        squareAccessTokenEncrypted: encryptToken(refreshed.accessToken),
        // Square's refresh response may or may not include a new refresh token -- only
        // overwrite the stored one if a new one actually came back; never null it out.
        ...(refreshed.refreshToken ? { squareRefreshTokenEncrypted: encryptToken(refreshed.refreshToken) } : {}),
        squareTokenExpiresAt: refreshed.expiresAt ? new Date(refreshed.expiresAt) : null,
      },
    });
    return refreshed.accessToken;
  } catch (err) {
    console.error(`[squarePaymentService] Failed to refresh Square access token for organizer ${organizer.id}:`, err);
    throw new SquareOnboardingIncompleteError(organizer.id);
  }
}

/** Square requires integer smallest-currency-unit amounts as bigint. */
export const toSquareMoney = (amountCents: number): { amount: bigint; currency: 'USD' } => ({
  amount: BigInt(Math.round(amountCents)),
  currency: 'USD',
});

/**
 * Square's idempotency_key is capped at 45 characters (confirmed via the live API
 * reference, 2026-09-07: "Min Length 1 / Max Length 45"). The existing Stripe-style
 * pattern used elsewhere in this codebase (literal cuid concatenation, e.g.
 * `pi-${itemId}-${userId}`) regularly exceeds that on this surface -- a real cuid alone
 * is ~25 chars, and this surface concatenates itemId + userId/guest-token + a coupon
 * suffix. Hash the parts instead: sha256 -> base64url is a fixed 43 chars, well under the
 * 45-char cap, and remains a STABLE function of the same inputs (so a genuine client
 * retry with the same clientToken still dedupes to the same Square idempotency key, the
 * same property the Stripe-side idempotencyKey relies on for its own retry-safety).
 */
export const buildSquareIdempotencyKey = (parts: Array<string | null | undefined>): string => {
  const raw = parts.filter((p): p is string => !!p && p.length > 0).join('|');
  return crypto.createHash('sha256').update(raw).digest('base64url').slice(0, 45);
};

/**
 * Per-ATTEMPT idempotency key (2026-09-29, money review P1-11). The checkout callers seed their key
 * from the item/cart/user (or the POS request id) only, so after a declined first attempt a retry
 * with a DIFFERENT card sent the same key with a different source_id and Square answered
 * IDEMPOTENCY_KEY_REUSED: the buyer could never pay. Folding a hash of the card token (sourceId)
 * into the key fixes that without giving up dedupe:
 *   - the SAME attempt retried after a network timeout carries the SAME sourceId (a Web Payments
 *     SDK token is one tokenization), so it maps to the SAME key and Square returns the original
 *     result instead of charging twice;
 *   - a NEW card (new tokenization, new sourceId) maps to a NEW key, so it is a fresh attempt.
 * A reusable stored-card id ("ccof:...") deliberately dedupes to the prior result for the same
 * seed, which is the safe direction. Falls back to the base key when there is no sourceId.
 * Stays within Square's 45 character cap because it goes through buildSquareIdempotencyKey.
 */
export const buildSquareAttemptIdempotencyKey = (baseKey: string, sourceId: string | null | undefined): string =>
  sourceId ? buildSquareIdempotencyKey([baseKey, 'src', sourceId]) : baseKey;

export interface SquareChargeParams {
  organizerAccessToken: string;
  idempotencyKey: string;
  sourceId: string;
  amountCents: number;
  appFeeCents: number;
  locationId?: string | null;
  referenceId?: string;
  note?: string;
  buyerEmailAddress?: string;
  verificationToken?: string;
}

export interface SquareChargeSuccess {
  ok: true;
  paymentId: string;
  status: string;
  cardFingerprint: string | null;
  riskLevel: string | null;
}

export interface SquareChargeFailure {
  ok: false;
  /** Square error code, e.g. GENERIC_DECLINE, CVV_FAILURE, CARD_EXPIRED -- logged, never
   *  shown verbatim to the buyer (same "don't leak processor internals" posture the
   *  Stripe paths already follow). */
  code: string;
  /** Buyer-facing, deliberately generic. */
  message: string;
}

export type SquareChargeResult = SquareChargeSuccess | SquareChargeFailure;

const DECLINE_MESSAGE = "Your card was declined. Please check your card details or try a different card.";

/**
 * Single choke point for every synchronous Square CreatePayment call this checkout
 * surface makes (single-item and cart both route through here). Square returns declines
 * SYNCHRONOUSLY (thrown SquareError with a structured `.errors` array) -- unlike Stripe's
 * webhook-driven payment_intent.payment_failed pattern, so callers handle the failure
 * result inline in the same request/response cycle, not in a separate async handler.
 */
export async function createSquareCharge(params: SquareChargeParams): Promise<SquareChargeResult> {
  const client = getSquareClientForMerchant(params.organizerAccessToken);

  try {
    const response = await client.payments.create({
      // Per-attempt key: see buildSquareAttemptIdempotencyKey. Applied HERE, at the one choke point
      // every checkout surface routes through, so no caller can forget the card discriminator.
      idempotencyKey: buildSquareAttemptIdempotencyKey(params.idempotencyKey, params.sourceId),
      sourceId: params.sourceId,
      amountMoney: toSquareMoney(params.amountCents),
      ...(params.appFeeCents > 0 ? { appFeeMoney: toSquareMoney(params.appFeeCents) } : {}),
      ...(params.locationId ? { locationId: params.locationId } : {}),
      autocomplete: true,
      ...(params.referenceId ? { referenceId: params.referenceId.slice(0, 40) } : {}),
      ...(params.note ? { note: params.note.slice(0, 500) } : {}),
      ...(params.buyerEmailAddress ? { buyerEmailAddress: params.buyerEmailAddress.slice(0, 255) } : {}),
      ...(params.verificationToken ? { verificationToken: params.verificationToken } : {}),
    } as any);

    const payment = (response as any)?.payment;
    if (!payment?.id) {
      return { ok: false, code: 'NO_PAYMENT_IN_RESPONSE', message: DECLINE_MESSAGE };
    }

    return {
      ok: true,
      paymentId: payment.id,
      status: payment.status ?? 'UNKNOWN',
      cardFingerprint: payment.cardDetails?.card?.fingerprint ?? null,
      riskLevel: payment.riskEvaluation?.riskLevel ?? null,
    };
  } catch (err) {
    if (err instanceof SquareError) {
      const first = err.errors?.[0];
      const code = first?.code || 'SQUARE_ERROR';
      console.warn(`[squarePaymentService] Square decline/error: ${code} -- ${first?.detail || err.message}`);
      return { ok: false, code, message: DECLINE_MESSAGE };
    }
    throw err;
  }
}
