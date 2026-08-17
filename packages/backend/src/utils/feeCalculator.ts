/**
 * Platform fee calculation utilities.
 *
 * ── THE FEE MODEL (Patrick ruling, 2026-08-17 — AUTHORITATIVE) ───────────────────────────
 *
 * There are TWO SEPARATE fees, and on an auction BOTH apply. Both are platform revenue.
 *
 *   1. Buyer premium — a percentage of the hammer price, charged ON TOP of the winning bid to
 *      the WINNING BIDDER. Auctions only. Comes out of the BUYER's pocket. The rate is 5% BY
 *      DEFAULT and per-sale configurable via `Sale.buyersPremiumPct` (0–50). Every worked
 *      example below uses the 5% default; substitute the sale's own rate when one is set, and
 *      always resolve it with `resolveBuyerPremiumRate(sale)` rather than assuming 5%.
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
 * DEFAULT auction buyer premium rate — 5% of the hammer price, paid by the WINNING BIDDER on
 * top of their bid. This is IN ADDITION TO the organizer's commission, not instead of it.
 *
 * This is the rate that applies when the organizer has NOT configured one on the sale. An
 * organizer may set `Sale.buyersPremiumPct` (0–50) and that configured value wins — resolve it
 * with `resolveBuyerPremiumRate(sale)` below, never by reading this constant directly on a
 * charge path.
 */
export const DEFAULT_AUCTION_BUYER_PREMIUM_RATE = 0.05;

/**
 * Legacy alias kept so nothing that imported the old name breaks. It is the DEFAULT rate, not
 * "the" rate — a sale with `buyersPremiumPct` set does not use this value. Prefer
 * `DEFAULT_AUCTION_BUYER_PREMIUM_RATE` in new code and `resolveBuyerPremiumRate` on any path
 * that charges, discloses or records a premium.
 */
export const AUCTION_BUYER_PREMIUM_RATE = DEFAULT_AUCTION_BUYER_PREMIUM_RATE;

/** Inclusive bounds on `Sale.buyersPremiumPct`, in PERCENT (not a decimal rate). */
export const MIN_BUYER_PREMIUM_PCT = 0;
export const MAX_BUYER_PREMIUM_PCT = 50;

/**
 * `Sale.buyersPremiumPct` is `Decimal? @db.Decimal(5, 2)` (schema.prisma:970). Prisma hands it
 * back as a Decimal instance on a normal read, as a plain `number` once it has been through
 * `convertDecimalsToNumbers` (saleController) or a JSON round-trip, and as a `string` from a
 * raw query. All four shapes — plus null and undefined — are accepted here.
 */
export interface BuyerPremiumConfigurableSale {
  buyersPremiumPct?: number | string | { toNumber(): number } | null;
}

/**
 * THE single source of truth for "what buyer premium applies to this sale".
 *
 * Every charge path (controllers/stripeController.createPaymentIntent, jobs/auctionJob.ts,
 * services/auctionService.closeAuction), every disclosure and every consent record must call
 * this. Do not re-derive the rule anywhere else.
 *
 *   · `buyersPremiumPct` null / undefined  -> DEFAULT_AUCTION_BUYER_PREMIUM_RATE (5%).
 *     Sales created before the field existed, and every sale where the organizer never touched
 *     the input, keep behaving exactly as they do today.
 *   · `buyersPremiumPct` 0                 -> 0. ZERO PREMIUM, NOT the default.
 *   · anything else                        -> that percentage, clamped to [0, 50].
 *
 * THE ZERO TRAP — do not "simplify" this to `pct || DEFAULT`. `0` is falsy, so that form
 * silently charges 5% on a sale the organizer deliberately set to 0%, and the shopper is shown
 * "0%" while their card is run for 5% more. The null/undefined check is explicit and separate
 * from the numeric path for exactly that reason. There is a test for it
 * (`__tests__/stripe.e2e.test.ts`, "0 means zero premium, not the 5% default").
 *
 * CLAMPING vs REJECTING — both, at different layers, deliberately:
 *   · The API boundary REJECTS out-of-range input. `saleCreateSchema.buyersPremiumPct` is
 *     `z.number().min(0).max(50)`, so an organizer sending 500 gets a 400 with a validation
 *     error rather than a silently different sale. Rejecting is right there because the value
 *     is the organizer's stated intent and quietly rewriting intent is worse than refusing it.
 *   · This resolver CLAMPS. It is read on the money path, where there is no user to show an
 *     error to and refusing would mean either charging the 5% default (wrong — it ignores a
 *     configured value) or throwing mid-checkout (worse — it strands a paying buyer). Clamping
 *     guarantees that whatever ends up in the column — a direct DB write, a seed script, an
 *     admin tool, a future endpoint that forgets the zod schema — can never multiply a real
 *     charge beyond 50%. Defense in depth, not a substitute for the boundary check.
 *
 * A non-finite value (NaN, a malformed string) falls back to the default rather than to 0, so a
 * corrupt row cannot silently zero out the platform's premium revenue.
 */
export const resolveBuyerPremiumRate = (
  sale: BuyerPremiumConfigurableSale | null | undefined
): number => {
  const raw = sale?.buyersPremiumPct;

  // Explicit null/undefined check — NOT a truthiness check. See THE ZERO TRAP above.
  if (raw === null || raw === undefined) return DEFAULT_AUCTION_BUYER_PREMIUM_RATE;

  let pct: number;
  if (typeof raw === 'number') {
    pct = raw;
  } else if (typeof raw === 'string') {
    pct = parseFloat(raw);
  } else if (typeof (raw as { toNumber?: unknown }).toNumber === 'function') {
    pct = (raw as { toNumber(): number }).toNumber();
  } else {
    pct = Number(raw);
  }

  if (!Number.isFinite(pct)) return DEFAULT_AUCTION_BUYER_PREMIUM_RATE;

  const clamped = Math.min(MAX_BUYER_PREMIUM_PCT, Math.max(MIN_BUYER_PREMIUM_PCT, pct));
  return clamped / 100;
};

/**
 * Render a resolved rate for display/consent copy: "5%", "12.5%", "0%". Trailing zeros are
 * dropped so a whole-number percentage never reads "15.00%". Used by the CheckoutEvidence
 * acknowledgment string and the buyer-facing API responses so the number a buyer consents to is
 * always the number their card is run for.
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
  /** The premium rate actually applied, as a decimal (0.05 = 5%). Echoed back so callers
   *  disclose and record the SAME number they charged, without re-deriving it. */
  buyerPremiumRate: number;
}

/**
 * Compose the two fees into the single number Stripe wants.
 *
 * @param basePriceCents    Hammer price (auction) or list price + shipping (regular), in cents.
 *                          NOT the buyer-facing total — the premium is added on top of this.
 * @param commissionRate    The organizer commission rate actually in force for this charge
 *                          (tier rate, or a FeeStructure override, or 0 under a referral
 *                          discount). Callers pass the rate they already resolved.
 * @param isAuction         Whether the buyer premium applies.
 * @param buyerPremiumRate  The premium rate for THIS sale, from `resolveBuyerPremiumRate(sale)`.
 *                          Defaults to 5% so the two non-auction callers and any legacy call
 *                          keep their existing behaviour, but every auction charge path passes
 *                          the resolved value — a sale configured at 15% must be charged 15%,
 *                          and a sale configured at 0% must be charged nothing.
 *
 * Cents are rounded ONCE, here, off the exact product — never off an already-rounded
 * intermediate — so a fractional percentage (e.g. 12.5% of $199.99) lands on a single
 * deterministic cent value that the disclosure, the charge and the consent record all share.
 */
export const calculateApplicationFee = (
  basePriceCents: number,
  commissionRate: number,
  isAuction: boolean,
  buyerPremiumRate: number = DEFAULT_AUCTION_BUYER_PREMIUM_RATE
): ApplicationFeeBreakdown => {
  const effectivePremiumRate = isAuction ? buyerPremiumRate : 0;
  const buyerPremiumCents = Math.round(basePriceCents * effectivePremiumRate);
  const organizerCommissionCents = Math.round(basePriceCents * commissionRate);
  return {
    buyerPremiumCents,
    organizerCommissionCents,
    applicationFeeCents: buyerPremiumCents + organizerCommissionCents,
    buyerPremiumRate: effectivePremiumRate,
  };
};

/** Minimal shape needed to report one PAID purchase back to the organizer. */
export interface ReportablePurchase {
  /** What the buyer was actually charged (Purchase.amount) — on an auction this INCLUDES
   *  the 5% premium, unless the sale has coversFee on. */
  amount: number;
  item?: AuctionListingShape | null;
  /** `buyersPremiumPct` is required to strip the premium back out at the rate that was
   *  actually charged — see the drift note on `resolveOrganizerFeeReport`. Callers that do not
   *  select it get the 5% default, which is wrong for a sale configured at any other rate. */
  sale?: ({ coversFee?: boolean | null } & BuyerPremiumConfigurableSale) | null;
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
 *
 * CONFIGURED-RATE DRIFT (documented, not fixed here): the premium is stripped back out at the
 * sale's CURRENT `buyersPremiumPct`, because no per-purchase premium rate is stored. If an
 * organizer changes the percentage after a lot has already been paid for, this recomputes the
 * historical hammer price at the new rate. That is the same class of drift this function
 * already has on the commission side — `tierRate` is the organizer's CURRENT tier, so an
 * upgrade from SIMPLE to PRO likewise restates past fees — and it is inherent to recomputing
 * reports from live config rather than from a stored snapshot. Closing it properly means a
 * `Purchase.buyerPremiumRate` column written at charge time (schema change + migration);
 * flagged, deliberately not done in this pass. Every caller must select `buyersPremiumPct`
 * alongside `coversFee` so the recomputation at least matches current config.
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
  const premiumRate = resolveBuyerPremiumRate(purchase.sale);
  const hammerPrice = organizerAbsorbsPremium
    ? amount
    : amount / (1 + premiumRate);
  const commission = hammerPrice * tierRate;
  const absorbedPremium = organizerAbsorbsPremium ? hammerPrice * premiumRate : 0;

  return {
    grossSalePrice: round2(hammerPrice),
    platformFee: round2(commission + absorbedPremium),
  };
};
