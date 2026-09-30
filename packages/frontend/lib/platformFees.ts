/**
 * Platform fee constants for the frontend — the SINGLE source of truth on this side of the
 * wire. Mirrors packages/backend/src/utils/feeCalculator.ts.
 *
 * ── STATUS (2026-09-29): THE FLAT 10% / 8% ORGANIZER COMMISSION IS RETIRED FOR DISPLAY ────
 * This file used to hardcode the flat 10% (SIMPLE) / 8% (PRO, TEAMS) commission. That model is
 * superseded by the INCLUSIVE fee model (Patrick ruling, 2026-09-24): one blended rate that
 * includes card processing, chosen by CHANNEL (in person vs online), floored at $0.75 per
 * transaction. The real source of truth is the backend, packages/backend/src/utils/feeCalculator.ts
 * (INCLUSIVE_FEE_RATES, getInclusivePlatformFeeRate, calculateInclusiveCommissionCents,
 * MINIMUM_TRANSACTION_FEE_CENTS); this file mirrors those numbers because the frontend must not
 * import from @findasale/shared (see below). Keep the two in step. Real tier and channel rates:
 *
 *   | Tier         | In person | Online |
 *   | SIMPLE       | 8%        | 9.5%   |
 *   | PRO / TEAMS  | 6%        | 7.5%   |
 *
 * The register (pos.tsx) does NOT use this file: it reads the organizer's real fee data from the
 * backend /pos/context. Importers today: HoldToPayModal (getPlatformFeeRate, formatFeeRate,
 * calculateOrganizerCommission, ONLINE channel) and SplitPaymentInput (getPlatformFeeRate; not
 * mounted anywhere), plus the auction buyer-premium exports below (BidModal, CheckoutModal,
 * items/[id]). The three legacy commission helpers are DEPRECATED but kept, and now delegate to
 * the ONLINE inclusive rate so existing callers stop showing the retired 10% / 8%. New code
 * should call the inclusive helpers below with an explicit channel, or take the rate from the
 * server response. Card-leg-only fees on a cash + card split are computed on the card amount.
 *
 * WHY THIS IS A COPY AND NOT AN IMPORT: packages/frontend must never import from
 * `@findasale/shared` — it breaks the Vercel build (CLAUDE.md §8, "Forbidden patterns"). So the
 * rates are restated here, in ONE place, instead of being hardcoded at each call site.
 *
 * ── THE FEE MODEL (Patrick ruling, 2026-08-17 — AUTHORITATIVE) ───────────────────────────
 * Two separate fees, and on an auction BOTH apply:
 *   1. Buyer premium — 5% of the hammer price, paid by the WINNING BIDDER on top of the bid.
 *   2. Organizer commission — the INCLUSIVE tier rate (card processing included), paid by the
 *      ORGANIZER out of their payout, on EVERY sale including auctions. Current rates (Patrick
 *      ruling 2026-09-24; the retired 10% SIMPLE / 8% PRO commission no longer applies):
 *        SIMPLE         8% in person / 9.5% online
 *        PRO and TEAMS  6% in person / 7.5% online
 *        $0.75 minimum per transaction
 *      Source of truth: INCLUSIVE_FEE_RATES (mirrored below from the backend's utils/feeCalculator.ts).
 * Stripe's application_fee_amount is the sum. The worked example that follows uses the retired
 * 10% / 8% rates to illustrate the structure only; recompute with the rates above.
 * A $200 auction win at SIMPLE: buyer charged
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

/** Payment channel, mirrors the backend's PaymentChannel. IN_PERSON = staff-operated POS surfaces
 *  used while the buyer is at the sale; ONLINE = every buyer self-serve endpoint (Buy Now, holds,
 *  auctions, guest invoices, QR payment links). The server decides the channel per endpoint. */
export type PaymentChannel = 'IN_PERSON' | 'ONLINE';

/** Mirrors backend INCLUSIVE_FEE_RATES. Rates are decimals of the sale subtotal. */
const INCLUSIVE_FEE_RATES: Record<'SIMPLE' | 'PRO' | 'TEAMS', Record<PaymentChannel, number>> = {
  SIMPLE: { IN_PERSON: 0.08, ONLINE: 0.095 },
  PRO: { IN_PERSON: 0.06, ONLINE: 0.075 },
  TEAMS: { IN_PERSON: 0.06, ONLINE: 0.075 },
};

/** Flat per-transaction minimum fee in cents. Mirrors backend MINIMUM_TRANSACTION_FEE_CENTS. */
export const MINIMUM_TRANSACTION_FEE_CENTS = 75;

const normalizeTier = (tier: OrganizerTier): 'SIMPLE' | 'PRO' | 'TEAMS' =>
  !tier || tier === 'SIMPLE' ? 'SIMPLE' : tier === 'TEAMS' ? 'TEAMS' : 'PRO';

/** The inclusive commission rate for a (tier, channel) pair, as a decimal. */
export const getInclusivePlatformFeeRate = (tier: OrganizerTier, channel: PaymentChannel): number =>
  INCLUSIVE_FEE_RATES[normalizeTier(tier)][channel];

/** e.g. "8%" / "9.5%" / "7.5%": one decimal at most, no trailing zeros (0.075 must not render as 8%). */
export const formatInclusiveFeeRate = (tier: OrganizerTier, channel: PaymentChannel): string =>
  `${parseFloat((getInclusivePlatformFeeRate(tier, channel) * 100).toFixed(1))}%`;

/** The minimum fee as display copy: "$0.75". Derived from MINIMUM_TRANSACTION_FEE_CENTS. */
export const MINIMUM_TRANSACTION_FEE_LABEL = `$${(MINIMUM_TRANSACTION_FEE_CENTS / 100).toFixed(2)}`;

/** Both channel rates for a tier as plain copy, e.g. "8% in person and 9.5% online". */
export const describeInclusiveRates = (tier: OrganizerTier): string =>
  `${formatInclusiveFeeRate(tier, 'IN_PERSON')} in person and ${formatInclusiveFeeRate(tier, 'ONLINE')} online`;

/** The inclusive commission in dollars on `amount` dollars, floored at the $0.75 minimum (0 for a
 *  0-or-negative amount). Display estimate only: the server computes the real fee. */
export const calculateInclusiveCommission = (amount: number, tier: OrganizerTier, channel: PaymentChannel): number => {
  const baseCents = Math.round((Number(amount) || 0) * 100);
  if (!(baseCents > 0)) return 0;
  const cents = Math.max(Math.round(baseCents * getInclusivePlatformFeeRate(tier, channel)), MINIMUM_TRANSACTION_FEE_CENTS);
  return cents / 100;
};

/**
 * @deprecated The flat 10% / 8% commission is retired (see the STATUS note at the top of this file).
 * Delegates to the ONLINE inclusive rate (9.5% SIMPLE, 7.5% PRO/TEAMS) so existing callers show the
 * real number. Prefer getInclusivePlatformFeeRate with an explicit channel.
 */
export const getPlatformFeeRate = (tier: OrganizerTier): number => getInclusivePlatformFeeRate(tier, 'ONLINE');

/** @deprecated Use formatInclusiveFeeRate with an explicit channel. Delegates to the ONLINE rate. */
export const formatFeeRate = (tier: OrganizerTier): string => formatInclusiveFeeRate(tier, 'ONLINE');

/** @deprecated Use calculateInclusiveCommission with an explicit channel. Delegates to the ONLINE
 *  rate, including the $0.75 minimum. */
export const calculateOrganizerCommission = (amount: number, tier: OrganizerTier): number =>
  calculateInclusiveCommission(amount, tier, 'ONLINE');

/**
 * Worked auction example for copy (FAQ, guide, pricing, terms): a winning bid at a tier's ONLINE
 * rate. Display only: the server computes the real amounts. `netIfCovered` is what the organizer
 * receives when Sale.coversFee is on (the buyer pays exactly the bid and the premium comes out of
 * the organizer's payout). Amounts are in dollars.
 */
export const auctionWorkedExample = (bid = 200, tier: OrganizerTier = 'SIMPLE') => {
  const premium = buyerPremiumOn(bid);
  const fee = calculateInclusiveCommission(bid, tier, 'ONLINE');
  return {
    bid,
    premium,
    buyerTotal: parseFloat((bid + premium).toFixed(2)),
    fee,
    net: parseFloat((bid - fee).toFixed(2)),
    netIfCovered: parseFloat((bid - fee - premium).toFixed(2)),
  };
};
