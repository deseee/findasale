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
 * ── THE PREMIUM IS A PLATFORM RATE, NOT AN ORGANIZER SETTING (locked 2026-08-17) ──────────
 * `Sale.buyersPremiumPct` was briefly an organizer-settable 0–50% control (#363, same day) and
 * this file briefly carried a `resolveBuyerPremiumPct` resolver to display it. Both are RETIRED.
 * The premium is FindA.Sale's own revenue, so an organizer-settable rate let an organizer set
 * the platform's income. Every shopper-facing surface now states 5% flat, from the constant
 * below. Do not reintroduce a per-sale premium lookup, and do not hardcode "5%" as a literal in
 * a component — import from here so there is exactly one number to change.
 *
 * `Sale.coversFee` is UNAFFECTED and still works: an organizer may absorb the 5% so their
 * winner pays exactly the bid. In that case the buyer's premium is genuinely 0 and the surfaces
 * that show a buyer-facing figure say so.
 *
 * ANY new fee display must import from here. Do not re-hardcode 0.10 / 0.08 / 0.05.
 */

export type OrganizerTier = 'SIMPLE' | 'PRO' | 'TEAMS' | null | undefined;

/** THE auction buyer premium — buyer-paid, auctions only, as a decimal rate. Platform-set. */
export const AUCTION_BUYER_PREMIUM_RATE = 0.05;

/** The same rate in PERCENT, for arithmetic against a price. */
export const AUCTION_BUYER_PREMIUM_PCT = 5;

/** The rate as display copy: "5%". Use this rather than typing the literal into JSX. */
export const AUCTION_BUYER_PREMIUM_LABEL = '5%';

/** "5%", "12.5%", "0%" — no fake precision, no trailing zeros. Kept because a buyer-facing
 *  figure is legitimately 0% under Sale.coversFee, and because CheckoutModal renders whatever
 *  premium rate the SERVER says was charged rather than assuming. */
export const formatBuyerPremiumPct = (pct: number): string => `${parseFloat(pct.toFixed(2))}%`;

/** What a winning bid actually costs the buyer, at the platform premium rate. */
export const buyerTotalWithPremium = (bid: number): number =>
  parseFloat((bid + bid * AUCTION_BUYER_PREMIUM_RATE).toFixed(2));

/** The premium in dollars on a given bid, at the platform rate. */
export const buyerPremiumOn = (bid: number): number =>
  parseFloat((bid * AUCTION_BUYER_PREMIUM_RATE).toFixed(2));

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
