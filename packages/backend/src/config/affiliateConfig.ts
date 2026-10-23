/**
 * Affiliate Program Configuration
 *
 * Feature #72: Affiliate Program foundation (Batch 1)
 * Contains payout amounts, fraud prevention gates, and referral rules.
 *
 * These are exported as constants so one-line changes are easy.
 */

/**
 * Organizer-to-organizer referral credit (roadmap #661, wired 2026-10-23).
 *
 * Replaces the never-called 2%-of-GMV / $50-floor / per-tier-dollar payout constants, which were superseded by:
 *   - roadmap #621 (2026-08-09): the reward is a SUBSCRIPTION CREDIT on the referrer's own PRO/TEAMS plan, triggered by real
 *     Purchase rows on the referred organizer's sales (not cash, not guildXp);
 *   - Patrick, 2026-10-12: affiliate/creator commission is calculated on the NET platform fee (FindA.Sale's fee minus
 *     Square's processing cost, which the platform bears);
 *   - ADR-119 section 11 (Patrick "go with the reccs", 2026-09-04): identity-grade fraud hard-blocks, composite signals
 *     hold for review, 7-day hold, per-referrer cap of 20 qualified referrals or $1,000 per rolling 90 days.
 *
 * Why the math pencils out: every credit cent is a share (< 100%) of fee cents FindA.Sale actually collected on that same
 * purchase, so the program can never pay out more than it earned, and a self-dealing ring (an organizer buying from
 * their own referred account to farm credit) always loses money: it pays the full fee to earn a fraction of the net fee
 * back. The old $50 floor on a first sale was the opposite: a $1 self-purchase minted $50.
 *
 * Every value below is a one-line change. Rate and earning window are proposed launch values for Patrick to confirm.
 */
export const ORGANIZER_REFERRAL_CREDIT = {
  /** Credit = this many basis points of the net platform fee on each qualifying purchase (1000 = 10%, same rate as the
   *  creator program's CREATOR_PROGRAM.COMMISSION_RATE_BPS). */
  COMMISSION_RATE_BPS: 1000,
  /** A referred organizer's purchases earn credit for the referrer only within this many days of the referral. */
  EARNING_WINDOW_DAYS: 365,
  /** ADR-119 decision 2: credit becomes usable this many days after the purchase that earned it. */
  HOLD_DAYS: 7,
  /** ADR-119 decision 3 (placeholder pending real volume): per referrer, per rolling window. Anything past either limit is
   *  HELD for admin review, never silently dropped. */
  CAP_WINDOW_DAYS: 90,
  CAP_MAX_QUALIFIED_REFERRALS: 20,
  CAP_MAX_CREDIT_CENTS: 100000, // $1,000
  /** Composite (flag-for-review) scoring, mirrors referralFraudService.ts. Score at or above the threshold holds the referral. */
  REVIEW_SCORE_THRESHOLD: 50,
  VELOCITY_WINDOW_DAYS: 7,
  VELOCITY_MEDIUM_COUNT: 5, // qualifications by one referrer in the window -> +50
  VELOCITY_HIGH_COUNT: 10, // -> +90
  ROUND_TRIP_SCORE: 30, // B referred A and A referred B: weak alone, never holds by itself
} as const;

/**
 * FEATURE FLAG (advisory board, 2026-10-23): the referral credit program ships to a safe checkpoint, OFF by default.
 * This is the ONLY place REFERRAL_PAYOUTS_ENABLED is read; it is read on every call, so flipping the Railway variable
 * takes effect on the next request / cron tick without a deploy. Only the exact string "true" turns it on.
 * While OFF: no referral is qualified, no fraud signal or credit row is written (earn, clawback or renewal), the sweep
 * job and the payment hook do nothing, renewals charge the full price, and the organizer page promises no reward.
 */
export function isReferralCreditEnabled(): boolean {
  return process.env.REFERRAL_PAYOUTS_ENABLED === 'true';
}

/**
 * Referral credit (cents) on one purchase, rounded DOWN so we never over-credit.
 * @param netFeeCents FindA.Sale's fee on the purchase net of Square's processing cost and of any cash-debt recoupment.
 */
export function calculateReferralCreditCents(
  netFeeCents: number,
  rateBps: number = ORGANIZER_REFERRAL_CREDIT.COMMISSION_RATE_BPS
): number {
  if (!Number.isFinite(netFeeCents) || netFeeCents <= 0) return 0;
  if (!Number.isFinite(rateBps) || rateBps <= 0) return 0;
  return Math.floor((netFeeCents * Math.min(rateBps, 10000)) / 10000);
}

/**
 * Fraud prevention gates
 */
export const AFFILIATE_FRAUD_GATES = {
  // Minimum account age before affiliate code can be generated
  MIN_ACCOUNT_AGE_DAYS: 7,
} as const;

/**
 * Referral code generation
 */
export const AFFILIATE_CODE = {
  // Format: "ORG_" + 6 random alphanumeric chars
  PREFIX: "ORG_",
  CODE_LENGTH: 6, // total length after prefix is 10
} as const;

/**
 * Check if organizer is eligible to generate affiliate code
 * Requirements:
 * - Account age ≥ 7 days
 * - ORGANIZER role
 * - Has completed ≥1 PAID sale
 */
export interface AffiliateEligibility {
  eligible: boolean;
  reason?: string;
}

/**
 * Creator program (per-sale affiliate links), finished 2026-09-29.
 *
 * Distinct from the organizer-to-organizer referral program above (AffiliateReferral, 2% / $50
 * floor). A creator is any signed-in account that opted in and accepted the program terms; they
 * share links to a public sale and earn a share of FindA.Sale's own fee (net of Square's processing cost) on purchases that came
 * through the link. Nothing here pays anyone automatically: commissions accrue in the
 * AffiliateConversion ledger and an admin settles them manually.
 *
 * Every number the dashboard and terms page show is read from this object (via the API), so a
 * rate change is a one-line edit here and can never drift from the copy. Rate/hold values are the
 * PROPOSED launch values (10% of platform fee is the figure the creator dashboard already
 * advertised, and Proposal 2 of claude_docs/research/affiliate-program-research-2026-03-19.md);
 * Patrick to confirm before the program is promoted.
 */
export const CREATOR_PROGRAM = {
  /** Version string stored with each creator's acceptance. Bump when the terms text changes materially. */
  TERMS_VERSION: '2026-09-29',
  /** Commission = this many basis points of FindA.Sale's platform fee on the purchase, NET of Square's estimated
   *  card processing cost (Patrick, 2026-10-12; creatorAffiliateService.commissionBaseFeeCents) (1000 = 10%). */
  COMMISSION_RATE_BPS: 1000,
  /** Commission counts as approved only this many days after the purchase (refund / chargeback window). */
  HOLD_DAYS: 30,
  /** How long a click keeps attributing a purchase (client side, see frontend lib/affiliateAttribution.ts). */
  ATTRIBUTION_WINDOW_DAYS: 30,
  /** Creator code format: prefix plus this many random characters. */
  CODE_PREFIX: 'CRT_',
  CODE_LENGTH: 6,
} as const;

/**
 * Commission (cents) on a purchase, rounded DOWN so we never over-accrue.
 * @param platformFeeCents the commission BASE: FindA.Sale's fee on the purchase net of any cash-debt recoupment AND
 *   net of Square's estimated processing cost (callers pass creatorAffiliateService.commissionBaseFeeCents, 2026-10-12)
 */
export function calculateCreatorCommissionCents(
  platformFeeCents: number,
  rateBps: number = CREATOR_PROGRAM.COMMISSION_RATE_BPS
): number {
  if (!Number.isFinite(platformFeeCents) || platformFeeCents <= 0) return 0;
  return Math.floor((platformFeeCents * rateBps) / 10000);
}
