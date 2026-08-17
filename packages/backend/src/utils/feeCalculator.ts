/**
 * Platform fee calculation utilities.
 *
 * ── THE FEE MODEL (Patrick ruling, 2026-08-17 — AUTHORITATIVE) ───────────────────────────
 *
 * There are TWO SEPARATE fees, and on an auction BOTH apply. Both are platform revenue.
 *
 *   1. Buyer premium — 5% of the hammer price, charged ON TOP of the winning bid to the
 *      WINNING BIDDER. Auctions only. Comes out of the BUYER's pocket.
 *   2. Organizer commission — the tier rate (10% SIMPLE / 8% PRO + TEAMS) of the hammer or
 *      list price, charged to the ORGANIZER out of their payout. Charged on EVERY sale,
 *      including auctions. An auction is NOT exempt from commission.
 *
 * Stripe's `application_fee_amount` is the SUM of whichever apply:
 *
 *   | Scenario                     | Buyer charged | application_fee_amount | Organizer nets | Organizer's fee line |
 *   |------------------------------|---------------|------------------------|----------------|----------------------|
 *   | $200 regular sale, SIMPLE    | $200.00       | $20.00                 | $180.00        | $20.00               |
 *   | $200 regular sale, PRO       | $200.00       | $16.00                 | $184.00        | $16.00               |
 *   | $200 auction win, SIMPLE     | $210.00       | $30.00 ($10 + $20)     | $180.00        | $20.00               |
 *   | $200 auction win, PRO        | $210.00       | $26.00 ($10 + $16)     | $184.00        | $16.00               |
 *
 * Organizer-facing fee reporting shows the COMMISSION ONLY. The 5% premium came out of the
 * buyer's pocket, not the organizer's, so it must never appear in what the organizer is told
 * they paid — which also means reading the stored `Purchase.platformFeeAmount` is WRONG for
 * organizer reporting on auctions (that column holds the combined $30). Use
 * `resolveOrganizerFeeReport` below, which recomputes the commission from the hammer price.
 *
 * THE ONE EXCEPTION — `Sale.coversFee` on an auction: the buyer is charged the bid only and
 * the ORGANIZER absorbs the 5% premium on top of their own commission. A $200 win then
 * charges the buyer $200, the platform still collects $30, and the organizer nets $170. There
 * the premium genuinely did come out of the organizer's pocket, so it DOES belong on their fee
 * line. `resolveOrganizerFeeReport` handles this via the `sale.coversFee` flag.
 *
 * ── CORRECTION NOTICE ────────────────────────────────────────────────────────────────────
 * An earlier pass on 2026-08-17 recorded an "AUCTION CARVE-OUT" in this file claiming the 5%
 * premium was the ENTIRE platform take on an auction and that the organizer paid no
 * commission. That was wrong and was reversed the same day. Do not reintroduce it, and treat
 * any surviving code comment or doc line asserting it as stale.
 */

export type SubscriptionTier = 'SIMPLE' | 'PRO' | 'TEAMS' | null;

/**
 * Get the ORGANIZER COMMISSION rate based on subscription tier.
 * This applies to every sale type, auctions included.
 * @param tier The organizer's subscription tier (or null defaults to SIMPLE)
 * @returns Fee rate as decimal (0.10 for SIMPLE, 0.08 for PRO/TEAMS)
 */
export const getPlatformFeeRate = (tier: SubscriptionTier): number => {
  if (!tier || tier === 'SIMPLE') {
    return 0.10; // 10% for SIMPLE and null (defaults)
  }
  if (tier === 'PRO' || tier === 'TEAMS') {
    return 0.08; // 8% for PRO and TEAMS
  }
  return 0.10; // Safe default
};

/**
 * Format fee rate as percentage string for display
 * @param tier The organizer's subscription tier
 * @returns Percentage string (e.g., "10%" or "8%")
 */
export const formatFeeRate = (tier: SubscriptionTier): string => {
  const rate = getPlatformFeeRate(tier);
  return `${Math.round(rate * 100)}%`;
};

/**
 * Auction buyer premium rate — 5% of the hammer price, paid by the WINNING BIDDER on top of
 * their bid. This is IN ADDITION TO the organizer's commission, not instead of it.
 * Single source of truth for the charge path (controllers/stripeController.ts,
 * jobs/auctionJob.ts, services/auctionService.ts) and the reporting paths.
 */
export const AUCTION_BUYER_PREMIUM_RATE = 0.05;

/** Minimal shape needed to decide whether a purchased item was an auction lot. */
export interface AuctionListingShape {
  listingType?: string | null;
  auctionStartPrice?: number | null;
}

/**
 * Auction detection, matching controllers/stripeController.ts createPaymentIntent exactly
 * (`item.listingType === 'AUCTION' || !!item.auctionStartPrice`). Kept in one place so the
 * charge path and the reporting paths can never drift apart on what counts as an auction.
 */
export const isAuctionListing = (item: AuctionListingShape | null | undefined): boolean =>
  !!item && (item.listingType === 'AUCTION' || item.auctionStartPrice != null);

const round2 = (n: number): number => parseFloat(n.toFixed(2));

/** Breakdown of the Stripe `application_fee_amount`, in integer cents. */
export interface ApplicationFeeBreakdown {
  /** 5% of the hammer price on an auction; 0 otherwise. Funded by the buyer (or by the
   *  organizer when Sale.coversFee is on). */
  buyerPremiumCents: number;
  /** Tier commission on the hammer/list price. Always funded by the organizer. */
  organizerCommissionCents: number;
  /** What to hand Stripe as application_fee_amount — the sum of the two above. */
  applicationFeeCents: number;
}

/**
 * Compose the two fees into the single number Stripe wants.
 *
 * @param basePriceCents  Hammer price (auction) or list price + shipping (regular), in cents.
 *                        NOT the buyer-facing total — the premium is added on top of this.
 * @param commissionRate  The organizer commission rate actually in force for this charge
 *                        (tier rate, or a FeeStructure override, or 0 under a referral
 *                        discount). Callers pass the rate they already resolved.
 * @param isAuction       Whether the 5% buyer premium applies.
 */
export const calculateApplicationFee = (
  basePriceCents: number,
  commissionRate: number,
  isAuction: boolean
): ApplicationFeeBreakdown => {
  const buyerPremiumCents = isAuction
    ? Math.round(basePriceCents * AUCTION_BUYER_PREMIUM_RATE)
    : 0;
  const organizerCommissionCents = Math.round(basePriceCents * commissionRate);
  return {
    buyerPremiumCents,
    organizerCommissionCents,
    applicationFeeCents: buyerPremiumCents + organizerCommissionCents,
  };
};

/** Minimal shape needed to report one PAID purchase back to the organizer. */
export interface ReportablePurchase {
  /** What the buyer was actually charged (Purchase.amount) — on an auction this INCLUDES
   *  the 5% premium, unless the sale has coversFee on. */
  amount: number;
  item?: AuctionListingShape | null;
  sale?: { coversFee?: boolean | null } | null;
}

export interface OrganizerFeeReport {
  /** The sale price to show the organizer — the hammer/list price, premium stripped out. */
  grossSalePrice: number;
  /** What the organizer actually pays out of that gross: commission, plus the premium only
   *  in the coversFee case where they absorbed it. */
  platformFee: number;
}

/**
 * Organizer-facing fee reporting for ONE paid purchase.
 *
 * Regular sale: unchanged from the long-standing behaviour — gross is `amount`, fee is
 * `amount * tierRate`.
 *
 * Auction: the buyer's charge contains the 5% premium the organizer never paid, so it is
 * stripped back out to recover the hammer price, and the fee is the tier commission on that
 * hammer price. $200 win / SIMPLE => gross $200.00, fee $20.00, and gross − fee − Stripe
 * processing is exactly what lands in the organizer's account. Deliberately NOT read from
 * `Purchase.platformFeeAmount`, which stores the COMBINED premium + commission.
 *
 * Auction + `Sale.coversFee`: the buyer was charged the bid only, so `amount` IS the hammer
 * price, and the organizer absorbed the premium — it belongs on their fee line.
 *
 * Known imprecision (pre-existing, unchanged in kind): coupon and organizer discounts reduce
 * `Purchase.amount` after the fact, so on a discounted sale the recomputed fee is the fee on
 * the discounted total rather than on the original price. Every earnings surface has always
 * behaved this way for regular sales; the auction path inherits it rather than adding it.
 */
export const resolveOrganizerFeeReport = (
  purchase: ReportablePurchase,
  tierRate: number
): OrganizerFeeReport => {
  const amount = Number(purchase.amount) || 0;

  if (!isAuctionListing(purchase.item)) {
    return { grossSalePrice: round2(amount), platformFee: round2(amount * tierRate) };
  }

  const organizerAbsorbsPremium = purchase.sale?.coversFee === true;
  const hammerPrice = organizerAbsorbsPremium
    ? amount
    : amount / (1 + AUCTION_BUYER_PREMIUM_RATE);
  const commission = hammerPrice * tierRate;
  const absorbedPremium = organizerAbsorbsPremium
    ? hammerPrice * AUCTION_BUYER_PREMIUM_RATE
    : 0;

  return {
    grossSalePrice: round2(hammerPrice),
    platformFee: round2(commission + absorbedPremium),
  };
};
