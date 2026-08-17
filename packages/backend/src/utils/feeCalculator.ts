/**
 * Platform fee calculation utilities
 * Tier-aware fee rates (as of S388):
 * - SIMPLE: 10%
 * - PRO: 8%
 * - TEAMS: 8%
 *
 * AUCTION CARVE-OUT (Patrick ruling, 2026-08-17 — authoritative, settles the
 * STACK.md-vs-decisions-log conflict): the tier rates above are the ORGANIZER commission
 * and they apply to NON-auction sales only. On an auction sale the entire platform take is
 * the 5% buyer premium, paid by the WINNING BIDDER; the organizer pays NO separate
 * commission. A $200 winning bid => buyer pays $210.00, Stripe application_fee_amount is
 * $10.00, organizer nets $200.00 (pre-Stripe-processing).
 * Use `resolveReportedPlatformFee` (below) for ANY organizer-facing fee reporting so this
 * carve-out is applied consistently. Do NOT call getPlatformFeeRate directly in a report.
 */

export type SubscriptionTier = 'SIMPLE' | 'PRO' | 'TEAMS' | null;

/**
 * Get platform fee rate based on subscription tier
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
 * Auction buyer premium — the winning bidder pays this, and it is the ENTIRE platform take
 * on an auction sale. Mirrors BUYER_PREMIUM_RATE in controllers/stripeController.ts, which is
 * what actually gets sent to Stripe as `application_fee_amount` on the auction path.
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

/**
 * The platform fee to REPORT to an organizer for one PAID purchase.
 *
 * Non-auction: unchanged — `amount * tierRate`, rounded to cents, exactly as every earnings
 * surface computed it before. Byte-identical to the previous behaviour.
 *
 * Auction: the platform's take is the 5% buyer premium the winner paid, NOT a tier
 * commission on the hammer price. Prefer the stored actual (`Purchase.platformFeeAmount`,
 * written from the same value handed to Stripe as `application_fee_amount`) so the report
 * shows the money that actually moved rather than a re-derivation. That stored value is also
 * correct for the "organizer covers the fee" auction variant (Sale.coversFee), where the
 * buyer is charged the bid only and the organizer absorbs the premium — a recomputation
 * could not distinguish that case.
 *
 * Fallback (stored value NULL — no such row exists in production as of 2026-08-17, all 9 PAID
 * purchases have a non-null platformFeeAmount): extract the premium that is already baked
 * into `amount`, since the auction charge total is bid * (1 + rate).
 */
export const resolveReportedPlatformFee = (
  purchase: {
    amount: number;
    platformFeeAmount?: number | null;
    item?: AuctionListingShape | null;
  },
  tierRate: number
): number => {
  if (!isAuctionListing(purchase.item)) {
    return parseFloat((purchase.amount * tierRate).toFixed(2));
  }
  if (purchase.platformFeeAmount != null) {
    return parseFloat(Number(purchase.platformFeeAmount).toFixed(2));
  }
  const premiumShare = AUCTION_BUYER_PREMIUM_RATE / (1 + AUCTION_BUYER_PREMIUM_RATE);
  return parseFloat((purchase.amount * premiumShare).toFixed(2));
};
