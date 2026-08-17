/**
 * Platform fee constants for the frontend — the SINGLE source of truth on this side of the
 * wire. Mirrors packages/backend/src/utils/feeCalculator.ts.
 *
 * WHY THIS IS A COPY AND NOT AN IMPORT: packages/frontend must never import from
 * `@findasale/shared` — it breaks the Vercel build (CLAUDE.md §8, "Forbidden patterns"). So the
 * rates are restated here, in ONE place, instead of being hardcoded at each call site.
 *
 * ── THE FEE MODEL (Patrick ruling, 2026-08-17 — AUTHORITATIVE) ───────────────────────────
 * Two separate fees, and on an auction BOTH apply:
 *   1. Buyer premium — 5% of the hammer price, paid by the WINNING BIDDER on top of the bid.
 *   2. Organizer commission — 10% SIMPLE / 8% PRO + TEAMS, paid by the ORGANIZER out of their
 *      payout, on EVERY sale including auctions.
 * Stripe's application_fee_amount is the sum. A $200 auction win at SIMPLE: buyer charged
 * $210.00, application fee $30.00, organizer nets $180.00 and their fee line reads $20.00 —
 * the commission only, because the premium came out of the buyer's pocket.
 *
 * ANY new fee display must import from here. Do not re-hardcode 0.10 / 0.08 / 0.05.
 */

export type OrganizerTier = 'SIMPLE' | 'PRO' | 'TEAMS' | null | undefined;

/**
 * DEFAULT auction buyer premium — buyer-paid, auctions only, expressed as a decimal rate.
 * The organizer may override it per sale via `Sale.buyersPremiumPct`; resolve the number to
 * DISPLAY with `resolveBuyerPremiumPct` below rather than assuming 5% anywhere.
 */
export const DEFAULT_AUCTION_BUYER_PREMIUM_RATE = 0.05;

/** Legacy alias. It is the DEFAULT rate, not "the" rate. */
export const AUCTION_BUYER_PREMIUM_RATE = DEFAULT_AUCTION_BUYER_PREMIUM_RATE;

/** The same default, in PERCENT — the unit `Sale.buyersPremiumPct` is expressed in. */
export const DEFAULT_BUYER_PREMIUM_PCT = 5;

/**
 * Resolve the buyer premium PERCENTAGE to show a shopper for a given sale.
 *
 * Mirrors `resolveBuyerPremiumRate` in packages/backend/src/utils/feeCalculator.ts, which is
 * what the charge actually uses. The two must agree — the whole #363 bug was a sale page
 * advertising one number while the card was run for another.
 *
 *   · null / undefined -> 5 (the default). Sales that predate the field, and every sale where
 *     the organizer left the box blank, keep showing 5%.
 *   · 0                -> 0. No premium at all.
 *   · anything else     -> that percentage, clamped to [0, 50].
 *
 * DO NOT write `pct || 5`. `0` is falsy, so that form displays 5% on a sale the organizer set
 * to zero — a shopper would be quoted a premium that is never charged. The null/undefined check
 * here is deliberately explicit and separate from the numeric path.
 */
export const resolveBuyerPremiumPct = (
  buyersPremiumPct?: number | string | null
): number => {
  if (buyersPremiumPct === null || buyersPremiumPct === undefined) return DEFAULT_BUYER_PREMIUM_PCT;
  const pct = typeof buyersPremiumPct === 'number' ? buyersPremiumPct : parseFloat(buyersPremiumPct);
  if (!Number.isFinite(pct)) return DEFAULT_BUYER_PREMIUM_PCT;
  return Math.min(50, Math.max(0, pct));
};

/** "5%", "12.5%", "0%" — no fake precision, no trailing zeros. */
export const formatBuyerPremiumPct = (pct: number): string => `${parseFloat(pct.toFixed(2))}%`;

/** What a winning bid of `bid` actually costs the buyer at the given premium percentage. */
export const buyerTotalWithPremium = (bid: number, pct: number): number =>
  parseFloat((bid + bid * (pct / 100)).toFixed(2));

/**
 * Organizer commission rate by tier. PRO and TEAMS are both 8% — a `tier === 'PRO' ? 0.08 :
 * 0.10` check silently over-charges TEAMS organizers by 2 points, which is exactly the bug
 * this helper exists to prevent.
 */
export const getPlatformFeeRate = (tier: OrganizerTier): number =>
  tier === 'PRO' || tier === 'TEAMS' ? 0.08 : 0.10;

/** e.g. "10%" / "8%" — for labels next to a fee amount. */
export const formatFeeRate = (tier: OrganizerTier): string =>
  `${Math.round(getPlatformFeeRate(tier) * 100)}%`;

/** The organizer's commission on a given sale price, rounded to cents. */
export const calculateOrganizerCommission = (amount: number, tier: OrganizerTier): number =>
  parseFloat((amount * getPlatformFeeRate(tier)).toFixed(2));
