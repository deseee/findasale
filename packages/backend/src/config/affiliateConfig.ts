/**
 * Affiliate Program Configuration
 *
 * Feature #72: Affiliate Program foundation (Batch 1)
 * Contains payout amounts, fraud prevention gates, and referral rules.
 *
 * PLACEHOLDER VALUES — Patrick will lock amounts before Batch 2 ships
 * These are exported as constants so one-line changes are easy.
 */

/**
 * Affiliate payout amounts by subscription tier
 * Units: USD dollars (will be converted to cents in service)
 *
 * PLACEHOLDER ESTIMATES based on investor feedback:
 * - PRO: ~$20 per referred organizer's first PAID sale
 * - TEAMS: ~$55 per referred organizer's first PAID sale
 * - SIMPLE: $0 (prevent exploit vector)
 * - ENTERPRISE: $0 (custom deals handled off-platform)
 */
export const AFFILIATE_PAYOUT_USD = {
  SIMPLE: 0, // never paid — exploit vector
  PRO: 20, // PLACEHOLDER — 2% or floor, whichever is greater
  TEAMS: 55, // PLACEHOLDER — 2% or floor, whichever is greater
  ENTERPRISE: 0, // custom deal, handled off-platform
} as const;

/**
 * Fraud prevention gates
 */
export const AFFILIATE_FRAUD_GATES = {
  // Minimum account age before affiliate code can be generated
  MIN_ACCOUNT_AGE_DAYS: 7,

  // Minimum account age before payout can be requested
  // (protects against chargeback cycles)
  MIN_PAYOUT_LOCKOUT_DAYS: 30,
} as const;

/**
 * Referral qualification rules
 */
export const AFFILIATE_QUALIFICATION = {
  // Commission rate: 2% of first PAID sale GMV
  COMMISSION_RATE_PERCENT: 2,

  // Minimum payout (in cents)
  // If 2% < $50, use $50 floor
  MINIMUM_PAYOUT_CENTS: 5000, // $50 USD

  // Minimum balance before payout can be requested
  MINIMUM_PAYOUT_REQUEST_CENTS: 5000, // $50 USD threshold

  // One payout per referral relationship lifetime
  // (prevents churn-rejoin exploitation)
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
 * Calculate payout amount (cents) for a referral
 * Rule: max(2% of first PAID sale, $50 minimum)
 *
 * @param saleAmountCents Purchase amount in cents
 * @returns Payout amount in cents
 */
export function calculateAffiliatePayoutCents(saleAmountCents: number): number {
  const commissionCents = Math.round(saleAmountCents * 0.02); // 2% of GMV
  return Math.max(commissionCents, AFFILIATE_QUALIFICATION.MINIMUM_PAYOUT_CENTS);
}

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
 * Check if organizer can request payout
 * Requirements:
 * - Account age ≥ 30 days
 * - Unpaid balance ≥ $50
 * - Has Stripe Connect account
 */
export interface PayoutRequestEligibility {
  eligible: boolean;
  reason?: string;
}
