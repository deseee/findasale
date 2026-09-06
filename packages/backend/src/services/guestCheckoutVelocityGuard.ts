import crypto from 'crypto';
import { redisIncrWithWindow, redisSetBlock, redisIsBlocked } from '../middleware/rateLimitShared';

/**
 * Guest Checkout Velocity Guard — Cross-Sale Carding Burst Prevention
 *
 * Incident (2026-09-06): FindA.Sale's Stripe platform account (acct_1T3kXhLIWHQCHu75) was
 * permanently closed for "unacceptable risk." Root cause (direct Stripe API read this
 * session): between 2026-08-27 and 2026-09-04 an external actor ran a rapid sequence of
 * small ($5-$20) guest checkouts against many different stolen credit cards through the
 * public checkout flow (`guestCheckout: 'true'` in PaymentIntent metadata every time).
 * Several attempts auto-declined (`decline_code: "fraudulent"` — the cards were already
 * known-compromised); several succeeded and were later refunded as fraudulent.
 *
 * Two existing guards did NOT catch this pattern:
 *   1. paymentLimiter (middleware/rateLimiter.ts) is a blunt 5-req/min cap keyed on
 *      IP/userId. An attacker spacing attempts out (which is exactly what an 8-day-long
 *      burst implies) never gets close to it, and it has no concept of "this attempt
 *      failed" — it treats a run of declines identically to a run of successful, distinct
 *      legitimate buyers.
 *   2. assertSaleCanAcceptPayment's velocity circuit breaker (services/
 *      paymentEligibilityService.ts) is PER-SALE: it holds one sale after >=3 FAILED
 *      purchases AND a >=30% failure rate within 30 minutes on THAT sale. An attack spread
 *      across multiple sales/organizer accounts — or one that mostly succeeds and gets
 *      refunded rather than declining outright — never crosses that sale-scoped threshold
 *      on any single sale.
 *
 * This guard closes the gap those two leave open: it is CROSS-SALE (keyed on the buyer's
 * IP and, when available, a client-collected device fingerprint — never on saleId or
 * organizerId), and it reacts specifically to DECLINE velocity (via
 * recordGuestCheckoutFailure, fed by the payment_intent.payment_failed webhook) as well as
 * raw attempt volume (via checkGuestCheckoutVelocity, called before any Stripe/DB work in
 * createPaymentIntent's guest branch) — so a run of failures OR an unusually high number of
 * attempts from the same device/IP throttles further guest checkout from that device/IP,
 * even when every individual sale involved looks fine on its own.
 *
 * Scope is deliberately GUEST-ONLY. An authenticated buyer has a persistent User row,
 * their own paymentLimiter budget, and is already covered by assertCheckoutAllowed's
 * identity-grade collusion checks — this guard only ever reads req.body fields that exist
 * on the unauthenticated checkout path. Getting throttled here still leaves a real path
 * forward for a genuine shopper: sign in (or create an account — registration has its own
 * rate limiter in routes/auth.ts) and check out authenticated instead of as a guest. That
 * escape hatch is also why the thresholds below can be conservative (tight) without fully
 * locking anyone out.
 *
 * FAIL-OPEN BY DESIGN: every Redis call underneath (redisIncrWithWindow / redisSetBlock /
 * redisIsBlocked, in middleware/rateLimitShared.ts) returns a "not blocked / do nothing"
 * result if Redis is unavailable. A Redis outage must never block real buyers from
 * checking out — see the same posture already established for every rate limiter in this
 * codebase (rateLimitShared.ts's resilientLimiter).
 *
 * ANTI-GRIEFING NOTE (Security-QA self-check, see findasale-hacker session report):
 * True IP spoofing to impersonate a specific victim's source address is not practically
 * exploitable over HTTPS (the TLS/HTTP handshake requires receiving the response, which
 * goes to the real address, not the spoofed one) — so a third party cannot cheaply make
 * THIS guard block an arbitrary victim purely by forging their IP in request headers.
 * The one real fairness risk is a SHARED IP (an estate sale's public wifi with several
 * real shoppers checking out as guests at once, or a NAT'd/campus network) — the IP-keyed
 * thresholds below are set deliberately loose (20/hour volume, 6/20min failures) to tolerate
 * that legitimate pattern, while the device-fingerprint-keyed thresholds are tighter
 * (8/hour volume, 3/20min failures) since a fingerprint is per-browser, not per-network,
 * and different real shoppers on the same wifi will not share one. A scripted attacker
 * bypassing the real frontend entirely can omit or randomize deviceFingerprint (it is a
 * client-supplied, unauthenticated signal) — the IP-keyed thresholds are the backstop for
 * that case, coarser but still a real cap where today there is effectively none.
 */

const VOLUME_WINDOW_SECONDS = 60 * 60; // 1 hour — counts every guest attempt, success or fail
const FAILURE_WINDOW_SECONDS = 20 * 60; // 20 minutes — counts DECLINED attempts only
const BLOCK_TTL_SECONDS = 30 * 60; // 30 minutes — how long a tripped guard stays tripped

// IP thresholds are looser than device-fingerprint thresholds on purpose — see the
// ANTI-GRIEFING NOTE above (shared wifi at a real, in-person sale is a legitimate pattern
// this must not punish).
const IP_VOLUME_MAX = 20;
const FP_VOLUME_MAX = 8;
const IP_FAILURE_MAX = 6;
const FP_FAILURE_MAX = 3; // matches the "3 fat-fingered retries is normal, 3 declines from 3 different cards is not" judgment call already used elsewhere in this codebase (paymentEligibilityService.ts's own FAILED-count threshold)

const keyBlockIp = (h: string) => `guestcheckout:block:ip:${h}`;
const keyBlockFp = (h: string) => `guestcheckout:block:fp:${h}`;
const keyVolIp = (h: string) => `guestcheckout:vol:ip:${h}`;
const keyVolFp = (h: string) => `guestcheckout:vol:fp:${h}`;
const keyFailIp = (h: string) => `guestcheckout:fail:ip:${h}`;
const keyFailFp = (h: string) => `guestcheckout:fail:fp:${h}`;

/**
 * SHA-256 hex digest — same algorithm already used elsewhere in this codebase for
 * fingerprint/identity hashing (checkoutGuard.ts, authController.ts). Callers hash the raw
 * IP / device fingerprint themselves so the SAME hash can be stamped into PaymentIntent
 * metadata at creation time and read back by the webhook later (Stripe metadata values
 * must be strings — see createPaymentIntent's basePaymentIntentData.metadata).
 */
export const hashForVelocity = (value: string): string =>
  crypto.createHash('sha256').update(value).digest('hex');

export interface GuestVelocityCheckParams {
  // Nullable, not just optional: the caller (createPaymentIntent) passes null when
  // getClientIp() couldn't resolve a real address (returns the literal 'unknown'
  // sentinel) rather than hashing that sentinel — hashing it would put every guest with
  // an unresolvable IP into ONE shared bucket, and a single such request tripping the
  // volume/failure threshold would then block every other unrelated guest sharing that
  // bucket. trust proxy is correctly set in index.ts so this should not occur in
  // production, but failing safe (skip IP-keyed checks entirely) costs nothing — the
  // device-fingerprint-keyed checks below are unaffected either way.
  hashedIp: string | null;
  hashedDeviceFingerprint?: string | null;
}

export interface GuestVelocityCheckResult {
  blocked: boolean;
}

/**
 * Call at the TOP of createPaymentIntent's guest branch, before any item/sale lookup or
 * Stripe call. Two responsibilities:
 *   1. Fast-path reject if this IP or device fingerprint is already under an active block
 *      (tripped by a prior call here OR by recordGuestCheckoutFailure below).
 *   2. Increment the rolling attempt-volume counters and trip a NEW block if this request
 *      pushes either counter over its threshold — the request that trips the threshold is
 *      blocked too, not just the next one (same posture as paymentEligibilityService's
 *      per-sale circuit breaker).
 */
export async function checkGuestCheckoutVelocity(
  params: GuestVelocityCheckParams
): Promise<GuestVelocityCheckResult> {
  const { hashedIp, hashedDeviceFingerprint } = params;

  if (hashedIp && (await redisIsBlocked(keyBlockIp(hashedIp)))) return { blocked: true };
  if (hashedDeviceFingerprint && (await redisIsBlocked(keyBlockFp(hashedDeviceFingerprint)))) {
    return { blocked: true };
  }

  if (hashedIp) {
    const ipVolume = await redisIncrWithWindow(keyVolIp(hashedIp), VOLUME_WINDOW_SECONDS);
    if (ipVolume !== null && ipVolume >= IP_VOLUME_MAX) {
      await redisSetBlock(keyBlockIp(hashedIp), BLOCK_TTL_SECONDS);
      return { blocked: true };
    }
  }

  if (hashedDeviceFingerprint) {
    const fpVolume = await redisIncrWithWindow(keyVolFp(hashedDeviceFingerprint), VOLUME_WINDOW_SECONDS);
    if (fpVolume !== null && fpVolume >= FP_VOLUME_MAX) {
      await redisSetBlock(keyBlockFp(hashedDeviceFingerprint), BLOCK_TTL_SECONDS);
      return { blocked: true };
    }
  }

  return { blocked: false };
}

/**
 * Call from the payment_intent.payment_failed webhook branch for guest PaymentIntents
 * (metadata.guestCheckout === 'true' — see stripeController.ts). Increments the
 * decline-specific failure counters and trips the SAME block flags
 * checkGuestCheckoutVelocity reads, so "this device just failed N cards" becomes "stop
 * letting this device try another" on its very next attempt. Never throws — a broken
 * counter must never take down real webhook processing (same non-fatal posture as every
 * other best-effort write in checkoutGuard.ts).
 */
export async function recordGuestCheckoutFailure(params: {
  hashedIp?: string | null;
  hashedDeviceFingerprint?: string | null;
}): Promise<void> {
  const { hashedIp, hashedDeviceFingerprint } = params;

  try {
    if (hashedIp) {
      const count = await redisIncrWithWindow(keyFailIp(hashedIp), FAILURE_WINDOW_SECONDS);
      if (count !== null && count >= IP_FAILURE_MAX) {
        await redisSetBlock(keyBlockIp(hashedIp), BLOCK_TTL_SECONDS);
      }
    }
    if (hashedDeviceFingerprint) {
      const count = await redisIncrWithWindow(keyFailFp(hashedDeviceFingerprint), FAILURE_WINDOW_SECONDS);
      if (count !== null && count >= FP_FAILURE_MAX) {
        await redisSetBlock(keyBlockFp(hashedDeviceFingerprint), BLOCK_TTL_SECONDS);
      }
    }
  } catch (err) {
    console.error('[guestCheckoutVelocityGuard] recordGuestCheckoutFailure failed (non-fatal):', err);
  }
}
