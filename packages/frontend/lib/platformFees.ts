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

/** 5% auction buyer premium — buyer-paid, auctions only. */
export const AUCTION_BUYER_PREMIUM_RATE = 0.05;

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
