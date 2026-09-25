/**
 * Platform fee calculation utilities.
 *
 * ── THE FEE MODEL (Patrick ruling, 2026-08-17 — AUTHORITATIVE) ───────────────────────────
 *
 * There are TWO SEPARATE fees, and on an auction BOTH apply. Both are platform revenue.
 *
 *   1. Buyer premium — 5% of the hammer price, charged ON TOP of the winning bid to the
 *      WINNING BIDDER. Auctions only. Comes out of the BUYER's pocket. The rate is a PLATFORM
 *      constant (`AUCTION_BUYER_PREMIUM_RATE` below) and is not configurable per sale.
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
 * `resolveOrganizerFeeReport` below.
 *
 * THE ONE EXCEPTION — `Sale.coversFee` on an auction: the buyer is charged the bid only and
 * the ORGANIZER absorbs the 5% premium on top of their own commission. A $200 win then
 * charges the buyer $200, the platform still collects $30, and the organizer nets $170. There
 * the premium genuinely did come out of the organizer's pocket, so it DOES belong on their fee
 * line. `resolveOrganizerFeeReport` handles this.
 *
 * ── WHY THE PREMIUM IS NOT ORGANIZER-CONFIGURABLE (locked 2026-08-17) ─────────────────────
 * `Sale.buyersPremiumPct` was briefly an organizer-settable 0–50% control (#363, same day).
 * It is RETIRED. The premium flows into `application_fee_amount` — it is FindA.Sale's revenue,
 * not the organizer's — so letting an organizer set it let them set the platform's own income:
 * 0% earned FindA.Sale nothing on that auction, 50% gouged shoppers in FindA.Sale's name.
 * The column still exists in the database (dropping a column is destructive and is queued with
 * the other destructive-drift decisions) but it is DEAD: nothing reads it, the API rejects it,
 * and there is no UI for it. Do not reintroduce `resolveBuyerPremiumRate` or any per-sale rate
 * lookup. `Sale.coversFee` is unaffected and still works — an organizer absorbing the platform
 * rate costs the platform nothing.
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
 * THE auction buyer premium rate — 5% of the hammer price, paid by the WINNING BIDDER on top
 * of their bid, IN ADDITION TO the organizer's commission.
 *
 * This is a PLATFORM rate. It is the single source of truth for every charge path
 * (`stripeController.createPaymentIntent`, `jobs/auctionJob.ts`, `auctionService.closeAuction`),
 * every buyer disclosure and every consent record. There is no per-sale override and no
 * resolver — `calculateApplicationFee` reads this constant itself so a caller cannot pass a
 * different number. Do not hardcode `0.05` anywhere else.
 */
export const AUCTION_BUYER_PREMIUM_RATE = 0.05;

/**
 * Render a rate for display/consent copy: "5%". Trailing zeros are dropped so a whole-number
 * percentage never reads "5.00%". Used by the CheckoutEvidence acknowledgment string and the
 * buyer-facing API responses so the number a buyer consents to is the number their card is run
 * for. Kept as a function (rather than a frozen "5%" string) because the premium the BUYER pays
 * is 0 under `Sale.coversFee`, and that case needs rendering too.
 */
export const formatBuyerPremiumRate = (rate: number): string => {
  const pct = parseFloat((rate * 100).toFixed(2));
  return `${pct}%`;
};

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
  /** The buyer premium on the hammer price on an auction; 0 otherwise. Funded by the buyer (or
   *  by the organizer when Sale.coversFee is on). */
  buyerPremiumCents: number;
  /** Tier commission on the hammer/list price. Always funded by the organizer. */
  organizerCommissionCents: number;
  /** What to hand Stripe as application_fee_amount — the sum of the two above. */
  applicationFeeCents: number;
  /** The premium rate actually applied, as a decimal (0.05 = 5%, or 0 on a non-auction).
   *  Echoed back so callers disclose and record the SAME number they charged. */
  buyerPremiumRate: number;
}

/**
 * Compose the two fees into the single number Stripe wants.
 *
 * @param basePriceCents  Hammer price (auction) or list price + shipping (regular), in cents.
 *                        NOT the buyer-facing total — the premium is added on top of this.
 * @param commissionRate  The organizer commission rate actually in force for this charge
 *                        (tier rate, or a FeeStructure override, or 0 under a referral
 *                        discount). Callers pass the rate they already resolved.
 * @param isAuction       Whether the buyer premium applies.
 *
 * The premium rate is NOT a parameter — it is the platform constant, read here. That is
 * deliberate: it was briefly caller-supplied (from an organizer-settable column) and there is
 * now no legitimate way for a caller to want a different number, so the parameter is removed
 * rather than defaulted, and no call site can get it wrong.
 *
 * Cents are rounded ONCE, here, off the exact product — never off an already-rounded
 * intermediate — so the disclosure, the charge and the consent record all share a single
 * deterministic cent value.
 */
export const calculateApplicationFee = (
  basePriceCents: number,
  commissionRate: number,
  isAuction: boolean
): ApplicationFeeBreakdown => {
  const effectivePremiumRate = isAuction ? AUCTION_BUYER_PREMIUM_RATE : 0;
  const buyerPremiumCents = Math.round(basePriceCents * effectivePremiumRate);
  const organizerCommissionCents = Math.round(basePriceCents * commissionRate);
  return {
    buyerPremiumCents,
    organizerCommissionCents,
    applicationFeeCents: buyerPremiumCents + organizerCommissionCents,
    buyerPremiumRate: effectivePremiumRate,
  };
};

/**
 * ── PURCHASE FEE SNAPSHOT ────────────────────────────────────────────────────────────────
 * The columns written on `Purchase` at charge time so a report never has to recompute a
 * historical fee from today's config. See schema.prisma's Purchase model for the full why.
 *
 * INVARIANT on a populated snapshot: `buyerPremiumAmount + commissionAmount` equals the
 * `platformFeeAmount` written alongside it.
 */
export interface PurchaseFeeSnapshot {
  /** Dollars of the application fee that were the buyer premium. 0 on a non-auction. */
  buyerPremiumAmount: number;
  /** The premium rate applied, as a decimal. 0 on a non-auction. */
  buyerPremiumRate: number;
  /** Dollars of the application fee that were the organizer's commission. */
  commissionAmount: number;
  /** The commission rate applied, as a decimal. NULL where a path charges a cart-level fee
   *  with no meaningful per-row rate (POS payment requests, prorated hold invoices). */
  commissionRate: number | null;
  /** Whether Sale.coversFee was ON at charge time — the organizer absorbed the premium and the
   *  buyer was charged the hammer price only. */
  organizerAbsorbedPremium: boolean;
}

/**
 * Snapshot for a charge that went through `calculateApplicationFee` — the three auction/online
 * checkout paths. Converts the breakdown's cents to the dollars the Purchase columns store.
 */
export const snapshotFromBreakdown = (
  breakdown: ApplicationFeeBreakdown,
  commissionRate: number,
  organizerAbsorbedPremium: boolean
): PurchaseFeeSnapshot => ({
  buyerPremiumAmount: round2(breakdown.buyerPremiumCents / 100),
  buyerPremiumRate: breakdown.buyerPremiumRate,
  commissionAmount: round2(breakdown.organizerCommissionCents / 100),
  commissionRate,
  organizerAbsorbedPremium,
});

/**
 * Snapshot for a commission-only charge — every non-auction path (POS, Terminal, cash, cart
 * checkout, hold invoices, bounties). No buyer premium exists on any of these, so the premium
 * fields are a hard 0 rather than null: "this charge carried no premium" is a fact worth
 * recording, not an unknown.
 *
 * @param commissionAmount Dollars of commission actually charged.
 * @param commissionRate   The rate it was computed at, or null where the path applies a
 *                         cart-level fee with no per-row rate.
 */
export const snapshotForCommissionOnly = (
  commissionAmount: number,
  commissionRate: number | null
): PurchaseFeeSnapshot => ({
  buyerPremiumAmount: 0,
  buyerPremiumRate: 0,
  commissionAmount: round2(commissionAmount),
  commissionRate,
  organizerAbsorbedPremium: false,
});

/** Minimal shape needed to report one PAID purchase back to the organizer. */
export interface ReportablePurchase {
  /** What the buyer was actually charged (Purchase.amount) — on an auction this INCLUDES
   *  the 5% premium, unless the sale has coversFee on. */
  amount: number;
  item?: AuctionListingShape | null;
  sale?: { coversFee?: boolean | null } | null;
  // ── Fee snapshot columns (see PurchaseFeeSnapshot). Present => authoritative. ──
  buyerPremiumAmount?: number | null;
  commissionAmount?: number | null;
  organizerAbsorbedPremium?: boolean | null;
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
 * ── PREFERRED PATH: the snapshot ─────────────────────────────────────────────────────────
 * When `commissionAmount` is present on the row, the numbers below are what the platform
 * ACTUALLY took at charge time and nothing is recomputed. This is the whole point of the
 * snapshot columns: an organizer upgrading SIMPLE -> PRO must not retroactively change the fee
 * reported on sales they already made, and it did exactly that for as long as this function
 * multiplied `amount` by their CURRENT tier rate.
 *
 * ── FALLBACK: recompute from current config ──────────────────────────────────────────────
 * Every row written before 2026-08-17, plus the handful of paths that record no fee engine
 * output at all, has a NULL snapshot. Those fall through to the original behaviour, unchanged:
 *
 *   Regular sale: gross is `amount`, fee is `amount * tierRate`.
 *   Auction: the buyer's charge contains the 5% premium the organizer never paid, so it is
 *     stripped back out to recover the hammer price, and the fee is the tier commission on that
 *     hammer price. $200 win / SIMPLE => gross $200.00, fee $20.00.
 *   Auction + `Sale.coversFee`: the buyer was charged the bid only, so `amount` IS the hammer
 *     price, and the organizer absorbed the premium — it belongs on their fee line.
 *
 * Known imprecision on the fallback path (pre-existing, unchanged in kind): coupon and organizer
 * discounts reduce `Purchase.amount` after the fact, so on a discounted sale the recomputed fee
 * is the fee on the discounted total rather than on the original price. The snapshot path does
 * not have this problem — it stores what was charged.
 */
export const resolveOrganizerFeeReport = (
  purchase: ReportablePurchase,
  tierRate: number
): OrganizerFeeReport => {
  const amount = Number(purchase.amount) || 0;

  // ── Snapshot path. `commissionAmount` is the sentinel: it is written by every path that
  // writes any of the snapshot columns, and a legitimate zero-commission charge (referral
  // discount) stores 0, not null. Explicit null/undefined check, never truthiness. ──
  if (purchase.commissionAmount !== null && purchase.commissionAmount !== undefined) {
    const commission = Number(purchase.commissionAmount) || 0;
    const premium = Number(purchase.buyerPremiumAmount) || 0;
    const absorbed = purchase.organizerAbsorbedPremium === true;
    // When the organizer absorbed the premium the buyer was charged the hammer price only, so
    // `amount` already IS the gross. Otherwise the premium rode on top and comes back out.
    const grossSalePrice = absorbed ? amount : amount - premium;
    return {
      grossSalePrice: round2(grossSalePrice),
      platformFee: round2(commission + (absorbed ? premium : 0)),
    };
  }

  // ── Fallback: recompute from current config (pre-snapshot rows). ──
  if (!isAuctionListing(purchase.item)) {
    return { grossSalePrice: round2(amount), platformFee: round2(amount * tierRate) };
  }

  const organizerAbsorbsPremium = purchase.sale?.coversFee === true;
  const hammerPrice = organizerAbsorbsPremium
    ? amount
    : amount / (1 + AUCTION_BUYER_PREMIUM_RATE);
  const commission = hammerPrice * tierRate;
  const absorbedPremium = organizerAbsorbsPremium ? hammerPrice * AUCTION_BUYER_PREMIUM_RATE : 0;

  return {
    grossSalePrice: round2(hammerPrice),
    platformFee: round2(commission + absorbedPremium),
  };
};

/**
 * ── INCLUSIVE PLATFORM FEE MODEL (Patrick ruling, 2026-09-24) ────────────────────────────
 *
 * ADDITIVE to the model above -- getPlatformFeeRate/calculateApplicationFee and every one of
 * their existing call sites are UNCHANGED and continue to charge the flat 10%/8% commission
 * with the processor's own cost billed to the organizer as a SEPARATE line (see
 * payoutController.getEarningsBreakdown). This is deliberate: this fee model touches ~20 call
 * sites across auctions, bounties, guest invoices, reservations, POS, vendor-booth-cart and the
 * Stripe fallback, plus 4 regression-guarded test suites, and is being rolled out path-by-path
 * rather than in one cutover. Only a call site that has been explicitly migrated (see each
 * call site's own comment) uses the functions below -- do not assume platform-wide effect from
 * this file alone.
 *
 * WHAT CHANGES: the platform's commission becomes INCLUSIVE of card-processing cost -- one
 * blended rate, no separate processorFee line for a migrated purchase. This is a genuine
 * reversal of the "TWO SEPARATE fees" ruling at the top of this file for whichever paths adopt
 * it; the old model remains correct and unchanged for every path that has not been migrated.
 *
 * CHANNEL, not entry-method: the rate depends on whether the CHECKOUT ENDPOINT is an in-person
 * one (POS, vendor-booth-cart -- the organizer/staff-operated surfaces used while a buyer is
 * physically at the sale) or every other, buyer-self-serve endpoint (online cart, Buy Now,
 * auctions, guest invoices, reservations/holds). This is NOT a Square entryMethod lookup:
 * confirmed this session that no call site in this codebase integrates Square's Terminal API or
 * Reader SDK -- every charge, POS included, goes through the Web Payments SDK's typed-card
 * `payments.card()` component (components/SquarePaymentRequestForm.tsx). There is no physical
 * card-present hardware anywhere in this stack today, so Square's own real processing cost is
 * roughly the same manually-keyed-equivalent rate whether the endpoint is "in-person" or
 * "online" -- the distinction below is a business/context one (was the buyer standing at the
 * sale) that Patrick is deliberately pricing differently, not a cost-recovery one. Do not wire
 * this to any Square API response field; pass the channel as a hardcoded constant per call site
 * based on which endpoint is charging.
 *
 * MINIMUM FEE: floors the percentage calc so a very small sale can never net the platform less
 * than MINIMUM_TRANSACTION_FEE_CENTS, protecting the ONLINE bucket in particular -- verified
 * this session that below ~$7 (PRO/TEAMS online) a pure-percentage fee no longer even covers
 * Square's own real per-transaction cost.
 *
 * DOES NOT REPLACE the existing CNP (card-not-present) surcharge in posPaymentController.ts's
 * manual-card-entry walk-up flow (`CNP_FEE_RATE_PLACEHOLDER`, added 2026-09-18) -- that is a
 * BUYER-facing surcharge recovering the organizer's higher Square processing cost for a
 * manually-keyed card, structurally unrelated to the platform's own commission computed here.
 * The two coexist on the same charge without conflict: this file's rate is the platform's own
 * cut of the sale subtotal; the CNP surcharge is an amount added on top of that same subtotal
 * before the buyer's total is computed. Do not fold one into the other.
 */

export type PaymentChannel = 'IN_PERSON' | 'ONLINE';

const INCLUSIVE_FEE_RATES: Record<'SIMPLE' | 'PRO' | 'TEAMS', Record<PaymentChannel, number>> = {
  SIMPLE: { IN_PERSON: 0.08, ONLINE: 0.095 },
  PRO: { IN_PERSON: 0.06, ONLINE: 0.075 },
  TEAMS: { IN_PERSON: 0.06, ONLINE: 0.075 },
};

/** Flat per-transaction minimum, in cents -- overrides the percentage calc on small-ticket
 *  sales. $0.75, sized against Square's real online/card-not-present cost (2.9-3.3% + 30c on
 *  the Free/Plus/Premium plans, verified live 2026-09-24) so the platform's take never goes
 *  negative once Square's own cost is netted out, with real margin above the crossover price
 *  rather than a bare break-even. */
export const MINIMUM_TRANSACTION_FEE_CENTS = 75;

const normalizeInclusiveTier = (tier: SubscriptionTier): 'SIMPLE' | 'PRO' | 'TEAMS' =>
  !tier || tier === 'SIMPLE' ? 'SIMPLE' : tier === 'TEAMS' ? 'TEAMS' : 'PRO';

/** The inclusive commission rate for one (tier, channel) pair. See file-header note above --
 *  `channel` must come from which endpoint is charging, never from client input or a Square
 *  API field. */
export const getInclusivePlatformFeeRate = (tier: SubscriptionTier, channel: PaymentChannel): number =>
  INCLUSIVE_FEE_RATES[normalizeInclusiveTier(tier)][channel];

/** Inclusive commission in cents on `baseCents`, floored at MINIMUM_TRANSACTION_FEE_CENTS.
 *  `baseCents` is the sale subtotal actually charged -- never a client-supplied amount.
 *  Zero-guarded (2026-09-24 hardening): a 0-or-negative baseCents returns 0, never the
 *  floor -- some callers pass the CARD-only portion of a split sale (e.g. posController.ts's
 *  sendHoldInvoice, cardAmountCents = grandTotal - cashAlreadyCollected), which is a
 *  legitimate 0 when an invoice is fully settled in cash. There is never a case where a $0
 *  charge should carry a $0.75 minimum fee. */
export const calculateInclusiveCommissionCents = (
  baseCents: number,
  tier: SubscriptionTier,
  channel: PaymentChannel
): number =>
  baseCents > 0 ? Math.max(Math.round(baseCents * getInclusivePlatformFeeRate(tier, channel)), MINIMUM_TRANSACTION_FEE_CENTS) : 0;

/**
 * Applies the inclusive-model per-transaction minimum floor to an EXISTING
 * ApplicationFeeBreakdown (calculateApplicationFee's return shape), for callers that build
 * their fee breakdown through that older auction/buyer-premium-aware path (Square/Stripe
 * checkout controllers) rather than calling calculateInclusiveCommissionCents directly.
 *
 * Floors ONLY organizerCommissionCents -- never buyerPremiumCents, which is a separate
 * buyer-paid auction surcharge unrelated to the platform's own per-transaction minimum.
 * Skips the floor entirely when commissionRate is 0 (an active referral discount): a
 * referral-discounted charge must still cost the organizer $0, not $0.75.
 */
export const applyInclusiveFloor = (
  breakdown: ApplicationFeeBreakdown,
  commissionRate: number
): ApplicationFeeBreakdown => {
  if (!(commissionRate > 0)) return breakdown;
  const flooredCommissionCents = Math.max(breakdown.organizerCommissionCents, MINIMUM_TRANSACTION_FEE_CENTS);
  return {
    ...breakdown,
    organizerCommissionCents: flooredCommissionCents,
    applicationFeeCents: breakdown.buyerPremiumCents + flooredCommissionCents,
  };
};
