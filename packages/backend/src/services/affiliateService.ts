/**
 * Affiliate Program Service
 *
 * Feature #72: Affiliate Program foundation (Batch 1)
 * Core service for referral code generation, fraud checks, and payout calculation.
 *
 * This service handles:
 * - Referral code generation (unique, idempotent)
 * - Fraud gate enforcement (7-day account age, 30-day payout lockout)
 * - Payout calculation (2% or $50 minimum)
 * - AffiliateReferral lifecycle (PENDING → QUALIFIED → PAID)
 */

import { prisma } from '../lib/prisma';
import {
  AFFILIATE_FRAUD_GATES,
  AFFILIATE_CODE,
  AFFILIATE_QUALIFICATION,
  calculateAffiliatePayoutCents,
} from '../config/affiliateConfig';

/**
 * Generate a unique affiliate referral code
 * Format: "ORG_" + 6 random uppercase letters/numbers
 */
function generateReferralCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < AFFILIATE_CODE.CODE_LENGTH; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${AFFILIATE_CODE.PREFIX}${code}`;
}

/**
 * Ensure code uniqueness (retry if collision)
 */
async function generateUniqueReferralCode(): Promise<string> {
  for (let attempts = 0; attempts < 10; attempts++) {
    const code = generateReferralCode();
    const existing = await prisma.affiliateReferral.findUnique({
      where: { referralCode: code },
    });
    if (!existing) {
      return code;
    }
  }
  throw new Error('Failed to generate unique affiliate code after 10 attempts');
}

/**
 * Check if organizer is eligible to generate affiliate code
 * Requirements:
 * - Account created ≥ 7 days ago
 * - Has ORGANIZER role
 * - Has completed ≥1 PAID sale
 */
export async function checkAffiliateCodeEligibility(userId: string): Promise<{
  eligible: boolean;
  reason?: string;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      organizer: true,
    },
  });

  if (!user) {
    return { eligible: false, reason: 'User not found' };
  }

  // Check ORGANIZER role
  if (!user.roles.includes('ORGANIZER')) {
    return { eligible: false, reason: 'Only organizers can generate affiliate codes' };
  }

  // Check account age
  const accountAgeDays = Math.floor(
    (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (accountAgeDays < AFFILIATE_FRAUD_GATES.MIN_ACCOUNT_AGE_DAYS) {
    return {
      eligible: false,
      reason: `Account must be at least ${AFFILIATE_FRAUD_GATES.MIN_ACCOUNT_AGE_DAYS} days old`,
    };
  }

  // Check if has completed ≥1 PAID sale
  const paidSaleCount = await prisma.sale.count({
    where: {
      organizerId: user.organizer?.id,
      // Note: We assume "completed" sale is indicated by status or purchase records
      // Actual implementation depends on Sale.status enum values
      // For now, check that sale has ≥1 completed purchase with PAID status
    },
  });

  // SIMPLIFIED: Check via Purchase records (more accurate)
  if (user.organizer) {
    const completedPurchases = await prisma.purchase.count({
      where: {
        sale: { organizerId: user.organizer.id },
        status: 'PAID', // Assume Purchase has status field
      },
    });

    if (completedPurchases === 0) {
      return { eligible: false, reason: 'Must complete at least one paid sale' };
    }
  }

  return { eligible: true };
}

/**
 * Create or retrieve affiliate code for organizer
 * Idempotent: if code exists, return existing code
 *
 * @param userId Organizer user ID
 * @returns referralCode, shareUrl, createdAt
 */
export async function generateOrGetAffiliateCode(userId: string): Promise<{
  referralCode: string;
  shareUrl: string;
  createdAt: Date;
}> {
  // Check eligibility first
  const { eligible, reason } = await checkAffiliateCodeEligibility(userId);
  if (!eligible) {
    throw new Error(`Not eligible to generate code: ${reason}`);
  }

  // Check if code already exists
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { affiliateReferralCode: true, createdAt: true },
  });

  if (existingUser?.affiliateReferralCode) {
    // Return existing code (idempotent)
    return {
      referralCode: existingUser.affiliateReferralCode,
      shareUrl: `${process.env.FRONTEND_URL}/auth/register?ref=${existingUser.affiliateReferralCode}`,
      createdAt: existingUser.createdAt,
    };
  }

  // Generate new code
  const newCode = await generateUniqueReferralCode();

  // Update user with new code
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { affiliateReferralCode: newCode },
    select: { affiliateReferralCode: true, createdAt: true },
  });

  return {
    referralCode: updatedUser.affiliateReferralCode!,
    shareUrl: `${process.env.FRONTEND_URL}/auth/register?ref=${updatedUser.affiliateReferralCode}`,
    createdAt: updatedUser.createdAt,
  };
}

/**
 * Get affiliate code and stats for organizer
 *
 * @param userId Organizer user ID
 * @returns Code, stats, and share URL
 */
export async function getAffiliateCodeWithStats(userId: string): Promise<{
  referralCode: string | null;
  shareUrl: string | null;
  createdAt: Date | null;
  totalReferrals: number;
  qualifiedReferrals: number;
  totalEarned: number; // cents
  unpaidEarnings: number; // cents
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { affiliateReferralCode: true, createdAt: true },
  });

  if (!user?.affiliateReferralCode) {
    return {
      referralCode: null,
      shareUrl: null,
      createdAt: null,
      totalReferrals: 0,
      qualifiedReferrals: 0,
      totalEarned: 0,
      unpaidEarnings: 0,
    };
  }

  // Get referral stats
  const referrals = await prisma.affiliateReferral.findMany({
    where: { referrerId: userId },
  });

  const totalReferrals = referrals.length;
  const qualifiedReferrals = referrals.filter((r) => r.status === 'QUALIFIED').length;
  const totalEarned = referrals
    .filter((r) => r.status === 'PAID' && r.payoutAmountCents)
    .reduce((sum, r) => sum + (r.payoutAmountCents || 0), 0);
  const unpaidEarnings = referrals
    .filter((r) => r.status === 'QUALIFIED' && r.payoutAmountCents)
    .reduce((sum, r) => sum + (r.payoutAmountCents || 0), 0);

  return {
    referralCode: user.affiliateReferralCode,
    shareUrl: `${process.env.FRONTEND_URL}/auth/register?ref=${user.affiliateReferralCode}`,
    createdAt: user.createdAt,
    totalReferrals,
    qualifiedReferrals,
    totalEarned,
    unpaidEarnings,
  };
}

/**
 * Check if organizer is eligible to request payout
 *
 * Requirements:
 * - Account created ≥ 30 days ago (chargeback window)
 * - Unpaid balance ≥ $50
 * - Has Stripe Connect account
 */
export async function checkPayoutEligibility(userId: string): Promise<{
  eligible: boolean;
  reason?: string;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { organizer: true },
  });

  if (!user?.organizer) {
    return { eligible: false, reason: 'User is not an organizer' };
  }

  // Check account age (30-day payout lockout)
  const accountAgeDays = Math.floor(
    (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (accountAgeDays < AFFILIATE_FRAUD_GATES.MIN_PAYOUT_LOCKOUT_DAYS) {
    return {
      eligible: false,
      reason: `Account must be at least ${AFFILIATE_FRAUD_GATES.MIN_PAYOUT_LOCKOUT_DAYS} days old to request payout`,
    };
  }

  // Check unpaid balance
  const referrals = await prisma.affiliateReferral.findMany({
    where: { referrerId: userId, status: 'QUALIFIED' },
  });
  const unpaidBalance = referrals.reduce(
    (sum, r) => sum + (r.payoutAmountCents || 0),
    0
  );

  if (unpaidBalance < AFFILIATE_QUALIFICATION.MINIMUM_PAYOUT_REQUEST_CENTS) {
    return {
      eligible: false,
      reason: `Minimum payout balance is $${
        AFFILIATE_QUALIFICATION.MINIMUM_PAYOUT_REQUEST_CENTS / 100
      }. Current: $${(unpaidBalance / 100).toFixed(2)}`,
    };
  }

  // Check Stripe Connect account
  if (!user.organizer.stripeConnectId) {
    return {
      eligible: false,
      reason: 'Stripe Connect account is required to receive payouts',
    };
  }

  return { eligible: true };
}

/**
 * Qualify a referral and calculate payout
 * Called when referred organizer completes their first PAID sale
 *
 * @param referralCode Code used at signup
 * @param referredUserId Organizer who made the first PAID sale
 * @param saleAmountCents Amount of first PAID sale (cents)
 * @returns Updated AffiliateReferral or error
 */
export async function qualifyReferralAndCalculatePayout(
  referralCode: string,
  referredUserId: string,
  saleAmountCents: number
): Promise<{
  success: boolean;
  referralId?: string;
  payoutAmountCents?: number;
  error?: string;
}> {
  // Find the referral relationship
  const referral = await prisma.affiliateReferral.findUnique({
    where: { referralCode },
  });

  if (!referral) {
    return { success: false, error: 'Referral code not found' };
  }

  // Verify the referred user matches
  if (referral.referredUserId !== referredUserId) {
    return {
      success: false,
      error: 'Referred user mismatch — this code was issued to a different user',
    };
  }

  // Only qualify if status is PENDING (prevent duplicate qualification)
  if (referral.status !== 'PENDING') {
    return {
      success: false,
      error: `Referral is already ${referral.status} — cannot re-qualify`,
    };
  }

  // Calculate payout
  const payoutCents = calculateAffiliatePayoutCents(saleAmountCents);

  // Update referral to QUALIFIED
  const updated = await prisma.affiliateReferral.update({
    where: { id: referral.id },
    data: {
      status: 'QUALIFIED',
      qualifiedAt: new Date(),
      payoutAmountCents: payoutCents,
      payoutCalculatedAt: new Date(),
    },
  });

  return {
    success: true,
    referralId: updated.id,
    payoutAmountCents: payoutCents,
  };
}

/**
 * Create AffiliateReferral on signup
 * Called when new organizer signs up with referral code
 *
 * @param referralCode Code provided at signup
 * @param newUserId The user being referred
 * @returns AffiliateReferral or error
 */
export async function createReferralOnSignup(
  referralCode: string,
  newUserId: string
): Promise<{
  success: boolean;
  referralId?: string;
  referrerId?: string;
  error?: string;
}> {
  // Find the referrer via code
  const referrer = await prisma.user.findUnique({
    where: { affiliateReferralCode: referralCode },
  });

  if (!referrer) {
    return { success: false, error: 'Invalid referral code' };
  }

  // Prevent self-referral
  if (referrer.id === newUserId) {
    return { success: false, error: 'Cannot refer yourself' };
  }

  // Create AffiliateReferral (PENDING until first PAID sale)
  const referral = await prisma.affiliateReferral.create({
    data: {
      referrerId: referrer.id,
      referredUserId: newUserId,
      referralCode, // same code as referrer's
      status: 'PENDING',
    },
  });

  return {
    success: true,
    referralId: referral.id,
    referrerId: referrer.id,
  };
}
