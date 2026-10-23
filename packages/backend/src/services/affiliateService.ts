/**
 * Affiliate Program Service
 *
 * Feature #72: Affiliate Program foundation (Batch 1)
 * Core service for referral code generation, fraud checks, and payout calculation.
 *
 * This service handles:
 * - Referral code generation (unique, idempotent)
 * - Code eligibility gate (7-day account age, one paid sale)
 * - Referral credit (roadmap #661, 2026-10-23): a share of the NET platform fee on the referred organizer's paid
 *   purchases, booked as subscription credit (SubscriptionCreditEntry, see subscriptionCreditService.ts) and applied to
 *   the referrer's PRO/TEAMS renewals by jobs/squareBillingChargeJob.ts. Fraud gate per ADR-119.
 * - AffiliateReferral lifecycle (PENDING -> QUALIFIED; BLOCKED / PENDING_REVIEW held for admin review; CANCELLED on reject)
 */

import { prisma } from '../lib/prisma';
import {
  AFFILIATE_FRAUD_GATES,
  AFFILIATE_CODE,
  ORGANIZER_REFERRAL_CREDIT as CFG,
  calculateReferralCreditCents,
  isReferralCreditEnabled,
} from '../config/affiliateConfig';
import { commissionBaseFeeCents, proratedCommissionCents, REVERSED_PURCHASE_STATUSES } from './creatorAffiliateService';
import { withCreditLock } from './subscriptionCreditService';

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
    // The code lives on the REFERRER's User row (User.affiliateReferralCode is the unique column); AffiliateReferral rows
    // only copy it, and are no longer unique on it (roadmap #661).
    const existing = await prisma.user.findUnique({
      where: { affiliateReferralCode: code },
      select: { id: true },
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
    // isTestTransaction exclusion (2026-08-29): test-transaction rows must never count as a real sale here
    const completedPurchases = await prisma.purchase.count({
      where: {
        sale: { organizerId: user.organizer.id },
        status: 'PAID', // Assume Purchase has status field
        isTestTransaction: false,
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
      shareUrl: `${process.env.FRONTEND_URL}/register?aff=${existingUser.affiliateReferralCode}`, // 2026-08-08 fix (roadmap #318): was /auth/register?ref= -- wrong path (no /auth prefix on the real registration page) AND wrong param (?ref= is the separate shopper-to-shopper referral system; the registration page reads the affiliate program's own code from ?aff=, see pages/register.tsx)
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
    shareUrl: `${process.env.FRONTEND_URL}/register?aff=${updatedUser.affiliateReferralCode}`, // 2026-08-08 fix (roadmap #318): same URL fix as above
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
    shareUrl: `${process.env.FRONTEND_URL}/register?aff=${user.affiliateReferralCode}`, // 2026-08-08 fix (roadmap #318): same URL fix as above
    createdAt: user.createdAt,
    totalReferrals,
    qualifiedReferrals,
    totalEarned,
    unpaidEarnings,
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

// ---------------------------------------------------------------------------
// Roadmap #661 (2026-10-23): referral credit on real Purchase rows
// ---------------------------------------------------------------------------
//
// Trigger: every PAID Purchase on a sale owned by a referred organizer, within ORGANIZER_REFERRAL_CREDIT.EARNING_WINDOW_DAYS
// of the referral. Two entry points reach processPurchaseForReferralCredit:
//   - fireReferralCreditCheck(purchaseId): fire-and-forget hook from the Square purchase-completion paths (it rides on
//     fireSquarePurchaseEngagement, which every Square checkout, webhook, hold-invoice, auction, bounty, bulk-pack and
//     POS request path already calls after commit) and expands to the other paid rows of the same sale;
//   - jobs/referralCreditSweepJob.ts: every 30 minutes (48h lookback) and daily (full earning window). This is the
//     guarantee: it covers every Purchase creation path, including the ones that never call the hook (cash, POS
//     payment-link recorder, vendor booth cart, reservation RECORD, legacy Stripe), and it reconciles refunds,
//     disputes and chargebacks. A credit cannot be used for HOLD_DAYS (7), so the sweep's latency costs nothing.
//
// Credit per purchase = COMMISSION_RATE_BPS x the NET platform fee actually collected on it (Patrick 2026-10-12): the
// Square app fee actually sent (already net of Square's processing cost) minus any cash-debt recoupment it carried, or
// for a legacy Stripe card row the fee minus debt. Cash and other non-card POS tenders earn nothing: their fee is a debt
// that may never be collected, and a cash sale is trivially self-recorded. (Items marked sold off-platform via
// Bring-Your-Own-Rails / OffPlatformSale carry no fee at all -- Patrick 2026-10-23 -- so they earn nothing either.)
//
// Fraud (ADR-119, decisions 2026-09-04):
//   - identity-grade (hard block, admin appeal): referrer and referred are the same account or email, share a device
//     fingerprint, or share a card fingerprint. Referral -> fraudReviewStatus BLOCKED, every credit it earns is HELD.
//   - composite (hold for review): referral velocity, round-trip referral, per-referrer caps. -> PENDING_REVIEW, HELD.
//   - per purchase (actor is not target): the referrer, the referred organizer, or the referrer's card / device buying
//     from the referred organizer earns nothing.
//   - refunds / disputes / chargebacks: the purchase's credit is re-derived from its current status and refunded share
//     and the difference is booked as a REFERRAL_ADJUSTMENT (negative = clawback). Credit already spent on a renewal
//     drives the balance negative, which later earnings pay down; the referrer's card is never charged for it.
//   IP address is never read (CLAUDE.md section 9, same posture as checkoutGuard.ts).

const DAY_MS = 24 * 60 * 60 * 1000;

/** Payment references that are not a real card payment (cash, organizer-recorded settlements, test rows). */
const SYNTHETIC_PAYMENT_REF = /^(cash_|sq_test_|pos_)/;

export interface ReferralPurchaseShape {
  status: string;
  amount: number | null;
  platformFeeAmount: number | null;
  cashDebtCollectedAmount: number | null;
  cashLegAmount: number | null;
  processor: string | null;
  squareAppFeeSentCents: number | null;
  stripePaymentIntentId?: string | null;
  squarePaymentId?: string | null;
  refundedAmount?: number | null;
}

/**
 * FindA.Sale's fee actually collected on a purchase, net of Square's processing cost and of any cash-debt recoupment
 * (that is repayment of an earlier sale's fee, not this sale's). 0 for cash and any non-card tender. Pure.
 */
export function referralNetFeeCents(p: ReferralPurchaseShape): number {
  const processor = p.processor ?? 'STRIPE';
  if (processor !== 'SQUARE' && processor !== 'STRIPE') return 0;
  if (p.stripePaymentIntentId && SYNTHETIC_PAYMENT_REF.test(p.stripePaymentIntentId)) return 0;
  if (p.squarePaymentId && SYNTHETIC_PAYMENT_REF.test(p.squarePaymentId)) return 0;
  const debtCents = Math.max(0, Math.round((Number(p.cashDebtCollectedAmount) || 0) * 100));
  if (processor === 'SQUARE' && p.squareAppFeeSentCents !== null && p.squareAppFeeSentCents !== undefined) {
    return Math.max(0, Math.round(Number(p.squareAppFeeSentCents) || 0) - debtCents);
  }
  const amountCents = Math.max(0, Math.round((Number(p.amount) || 0) * 100));
  const cashLegCents = Math.max(0, Math.round((Number(p.cashLegAmount) || 0) * 100));
  const inclusiveFeeCents = Math.max(0, Math.round((Number(p.platformFeeAmount) || 0) * 100) - debtCents);
  return commissionBaseFeeCents({ inclusiveFeeCents, cardLegCents: Math.max(0, amountCents - cashLegCents), processor });
}

/** What a purchase's credit is worth NOW: 0 once reversed or not PAID, prorated by any partial refund. Pure. */
export function referralCreditWorthNowCents(originalCents: number, p: ReferralPurchaseShape): number {
  if (!(originalCents > 0)) return 0;
  if (p.status !== 'PAID' || REVERSED_PURCHASE_STATUSES.includes(p.status)) return 0;
  return proratedCommissionCents({
    commissionCents: originalCents,
    purchase: { status: p.status, amount: p.amount, refundedAmount: p.refundedAmount ?? null },
  });
}

type FraudUser = { id: string; email: string | null; deviceFingerprint: string | null; stripeCardFingerprint: string | null };

function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = a?.trim().toLowerCase();
  const y = b?.trim().toLowerCase();
  return !!x && !!y && x === y;
}

/** Identity-grade signals between referrer and referred (null-safe: a missing fingerprint never matches). Pure. */
export function identitySignals(referrer: FraudUser, referred: FraudUser): Array<'SELF_REFERRAL' | 'SHARED_DEVICE_FP' | 'SHARED_CARD_FP'> {
  const out: Array<'SELF_REFERRAL' | 'SHARED_DEVICE_FP' | 'SHARED_CARD_FP'> = [];
  if (referrer.id === referred.id || sameEmail(referrer.email, referred.email)) out.push('SELF_REFERRAL');
  if (referrer.deviceFingerprint && referred.deviceFingerprint && referrer.deviceFingerprint === referred.deviceFingerprint) out.push('SHARED_DEVICE_FP');
  if (referrer.stripeCardFingerprint && referred.stripeCardFingerprint && referrer.stripeCardFingerprint === referred.stripeCardFingerprint) out.push('SHARED_CARD_FP');
  return out;
}

const FRAUD_USER_SELECT = { id: true, email: true, deviceFingerprint: true, stripeCardFingerprint: true } as const;

async function recordSignal(
  tx: any,
  referral: { id: string; referrerId: string; referredUserId: string },
  signalType: string,
  confidenceScore: number,
  flags: string[],
  purchaseId: string | null,
  notes?: string
): Promise<void> {
  // Idempotent: one signal of a type per referral (and per purchase, for per-purchase signals). Runs under the referrer's
  // advisory lock, so the check-then-create can not race.
  const exists = await tx.affiliateFraudSignal.findFirst({
    where: { affiliateReferralId: referral.id, signalType, purchaseId },
    select: { id: true },
  });
  if (exists) return;
  await tx.affiliateFraudSignal.create({
    data: {
      affiliateReferralId: referral.id,
      referrerId: referral.referrerId,
      referredUserId: referral.referredUserId,
      purchaseId,
      signalType,
      confidenceScore,
      flags,
      notes: notes ?? null,
    },
  });
}

/** Sum of a referral's usable (ACTIVE, i.e. not held for review and not voided) earned + adjustment credit, written back to payoutAmountCents for the dashboards. */
async function refreshReferralTotal(tx: any, referralId: string, now: Date): Promise<void> {
  const rows = await tx.subscriptionCreditEntry.findMany({
    where: { affiliateReferralId: referralId, kind: { in: ['REFERRAL_EARNED', 'REFERRAL_ADJUSTMENT'] }, status: 'ACTIVE' },
    select: { amountCents: true },
  });
  const total = rows.reduce((s: number, r: { amountCents: number }) => s + (r.amountCents || 0), 0);
  await tx.affiliateReferral.update({
    where: { id: referralId },
    data: { payoutAmountCents: total, payoutCalculatedAt: now },
  });
}

export interface QualificationResult {
  /** The referral's fraud review status after the call: CLEAR | APPROVED (credit usable) or PENDING_REVIEW | BLOCKED | REJECTED (credit held). */
  fraudReviewStatus: string;
  signals: string[];
}

/**
 * Qualify a referral on the referred organizer's FIRST qualifying paid purchase (roadmap #661: this is the function that
 * had no callers; it is now called by processPurchaseForReferralCredit, inside the referrer's credit lock).
 *
 * Runs the ADR-119 fraud gate BEFORE any credit exists:
 *   - identity-grade match -> BLOCKED (status stays PENDING, credit HELD until an admin approves or rejects);
 *   - composite score >= threshold, or the referrer is past the qualified-referral cap -> PENDING_REVIEW (same);
 *   - otherwise PENDING -> QUALIFIED with qualifiedAt and holdUntil.
 * Only ever acts on a PENDING referral with fraudReviewStatus CLEAR; anything else is returned unchanged, so it can not
 * re-qualify or clear a block. The credit amount itself is per purchase (calculateReferralCreditCents on the net fee).
 */
export async function qualifyReferralAndCalculatePayout(
  tx: any,
  referral: { id: string; referrerId: string; referredUserId: string; status: string; fraudReviewStatus: string; qualifiedAt: Date | null },
  now: Date = new Date()
): Promise<QualificationResult> {
  if (referral.status !== 'PENDING' || referral.fraudReviewStatus !== 'CLEAR' || referral.qualifiedAt) {
    return { fraudReviewStatus: referral.fraudReviewStatus || 'CLEAR', signals: [] };
  }

  const [referrer, referred] = await Promise.all([
    tx.user.findUnique({ where: { id: referral.referrerId }, select: FRAUD_USER_SELECT }),
    tx.user.findUnique({ where: { id: referral.referredUserId }, select: FRAUD_USER_SELECT }),
  ]);
  const signals: string[] = [];

  // 1. Identity-grade (hard block)
  // A missing account on either side can not be checked, so it is treated as the strongest signal (admin can approve).
  const identity: string[] = referrer && referred ? identitySignals(referrer, referred) : ['SELF_REFERRAL'];
  for (const sig of identity) {
    signals.push(sig);
    await recordSignal(tx, referral, sig, 100, [sig], null);
  }
  if (identity.length > 0) {
    await tx.affiliateReferral.update({
      where: { id: referral.id },
      data: {
        fraudReviewStatus: 'BLOCKED',
        deviceFraudFlag: identity.includes('SHARED_DEVICE_FP'),
        cardFraudFlag: identity.includes('SHARED_CARD_FP'),
        fraudCompositeScore: 100,
      },
    });
    console.warn(`[affiliate][referral-blocked] referral=${referral.id} signals=${identity.join(',')}`);
    return { fraudReviewStatus: 'BLOCKED', signals };
  }

  // 2. Composite (hold for review)
  let score = 0;
  const velocitySince = new Date(now.getTime() - CFG.VELOCITY_WINDOW_DAYS * DAY_MS);
  const recentQualified = await tx.affiliateReferral.count({
    where: { referrerId: referral.referrerId, qualifiedAt: { gte: velocitySince } },
  });
  if (recentQualified + 1 >= CFG.VELOCITY_HIGH_COUNT) {
    score += 90;
    await recordSignal(tx, referral, 'REFERRAL_VELOCITY', 90, [`qualified_in_${CFG.VELOCITY_WINDOW_DAYS}d:${recentQualified + 1}`], null);
    signals.push('REFERRAL_VELOCITY');
  } else if (recentQualified + 1 >= CFG.VELOCITY_MEDIUM_COUNT) {
    score += 50;
    await recordSignal(tx, referral, 'REFERRAL_VELOCITY', 50, [`qualified_in_${CFG.VELOCITY_WINDOW_DAYS}d:${recentQualified + 1}`], null);
    signals.push('REFERRAL_VELOCITY');
  }
  const roundTrip = await tx.affiliateReferral.findFirst({
    where: { referrerId: referral.referredUserId, referredUserId: referral.referrerId },
    select: { id: true },
  });
  if (roundTrip) {
    score += CFG.ROUND_TRIP_SCORE;
    await recordSignal(tx, referral, 'ROUND_TRIP_REFERRAL', CFG.ROUND_TRIP_SCORE, [`mirror:${roundTrip.id}`], null);
    signals.push('ROUND_TRIP_REFERRAL');
  }
  const capSince = new Date(now.getTime() - CFG.CAP_WINDOW_DAYS * DAY_MS);
  const qualifiedInCapWindow = await tx.affiliateReferral.count({
    where: { referrerId: referral.referrerId, qualifiedAt: { gte: capSince } },
  });
  const overCap = qualifiedInCapWindow >= CFG.CAP_MAX_QUALIFIED_REFERRALS;
  if (overCap) {
    await recordSignal(tx, referral, 'REFERRER_CAP', 60, [`qualified_in_${CFG.CAP_WINDOW_DAYS}d:${qualifiedInCapWindow}`], null);
    signals.push('REFERRER_CAP');
  }

  const holdUntil = new Date(now.getTime() + CFG.HOLD_DAYS * DAY_MS);
  if (score >= CFG.REVIEW_SCORE_THRESHOLD || overCap) {
    await tx.affiliateReferral.update({
      where: { id: referral.id },
      data: { fraudReviewStatus: 'PENDING_REVIEW', fraudCompositeScore: Math.min(100, score) },
    });
    console.warn(`[affiliate][referral-held] referral=${referral.id} score=${score} signals=${signals.join(',')}`);
    return { fraudReviewStatus: 'PENDING_REVIEW', signals };
  }

  await tx.affiliateReferral.update({
    where: { id: referral.id },
    data: { status: 'QUALIFIED', qualifiedAt: now, holdUntil, fraudCompositeScore: score },
  });
  return { fraudReviewStatus: 'CLEAR', signals };
}

export type ReferralCreditOutcome =
  | { action: 'NONE'; reason: string }
  | { action: 'SKIPPED'; reason: string }
  | { action: 'EARNED'; creditCents: number; status: 'ACTIVE' | 'HELD' }
  | { action: 'ADJUSTED'; deltaCents: number };

const PURCHASE_CREDIT_SELECT = {
  id: true,
  status: true,
  amount: true,
  platformFeeAmount: true,
  cashDebtCollectedAmount: true,
  cashLegAmount: true,
  processor: true,
  squareAppFeeSentCents: true,
  stripePaymentIntentId: true,
  squarePaymentId: true,
  refundedAmount: true,
  isTestTransaction: true,
  userId: true,
  buyerEmail: true,
  buyerCardFingerprint: true,
  createdAt: true,
  sale: { select: { organizer: { select: { userId: true } } } },
} as const;

/**
 * Earn, or reconcile, the referral credit for one Purchase. Idempotent (the earn row is keyed
 * `referral-earn:<purchaseId>`; reconciliation re-derives the target from the purchase's current state and books only
 * the difference) and serialized per referrer by the credit advisory lock. Never throws.
 */
export async function processPurchaseForReferralCredit(purchaseId: string, now: Date = new Date()): Promise<ReferralCreditOutcome> {
  if (!isReferralCreditEnabled()) return { action: 'NONE', reason: 'DISABLED' };
  try {
    const purchase = await prisma.purchase.findUnique({ where: { id: purchaseId }, select: PURCHASE_CREDIT_SELECT });
    if (!purchase) return { action: 'NONE', reason: 'PURCHASE_NOT_FOUND' };
    const organizerUserId = purchase.sale?.organizer?.userId;
    if (!organizerUserId) return { action: 'NONE', reason: 'NO_ORGANIZER' };

    // Cheap early exit for the common case (organizer was not referred). Earliest live referral wins.
    const referralHead = await prisma.affiliateReferral.findFirst({
      where: { referredUserId: organizerUserId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, referrerId: true },
    });
    if (!referralHead) return { action: 'NONE', reason: 'NOT_REFERRED' };

    return await withCreditLock(referralHead.referrerId, async (tx) => {
      const referral = await tx.affiliateReferral.findUnique({
        where: { id: referralHead.id },
        select: { id: true, referrerId: true, referredUserId: true, status: true, fraudReviewStatus: true, qualifiedAt: true, createdAt: true },
      });
      if (!referral) return { action: 'NONE', reason: 'REFERRAL_GONE' } as ReferralCreditOutcome;

      const existing: Array<{ id: string; kind: string; amountCents: number; status: string; availableAt: Date }> =
        await tx.subscriptionCreditEntry.findMany({
          where: { sourcePurchaseId: purchase.id, kind: { in: ['REFERRAL_EARNED', 'REFERRAL_ADJUSTMENT'] } },
          select: { id: true, kind: true, amountCents: true, status: true, availableAt: true },
        });

      // ---- Reconcile an already-earned purchase (refund, partial refund, dispute, chargeback, dispute won) ----
      const earn = existing.find((e) => e.kind === 'REFERRAL_EARNED');
      if (earn) {
        if (earn.status === 'VOID') return { action: 'NONE', reason: 'EARN_VOID' } as ReferralCreditOutcome;
        const target = referralCreditWorthNowCents(earn.amountCents, purchase);
        const current = existing.filter((e) => e.status !== 'VOID').reduce((s, e) => s + e.amountCents, 0);
        const delta = target - current;
        if (delta === 0) return { action: 'NONE', reason: 'UP_TO_DATE' } as ReferralCreditOutcome;
        const earnAvail = new Date(earn.availableAt);
        await tx.subscriptionCreditEntry.create({
          data: {
            userId: referral.referrerId,
            amountCents: delta,
            kind: 'REFERRAL_ADJUSTMENT',
            // Same status as the earning row (a HELD earning's clawback stays HELD), and never available before it, so a
            // clawback inside the hold nets to zero instead of pushing the usable balance negative for a week.
            status: earn.status,
            availableAt: earnAvail.getTime() > now.getTime() ? earnAvail : now,
            affiliateReferralId: referral.id,
            sourcePurchaseId: purchase.id,
            note: delta < 0 ? `Clawback: purchase is now ${purchase.status}${purchase.refundedAmount ? ` (refunded $${Number(purchase.refundedAmount).toFixed(2)})` : ''}` : `Restored: purchase is ${purchase.status} again`,
          },
        });
        await refreshReferralTotal(tx, referral.id, now);
        console.log(`[affiliate][referral-credit] adjusted purchase=${purchase.id} referral=${referral.id} delta=${delta}`);
        return { action: 'ADJUSTED', deltaCents: delta } as ReferralCreditOutcome;
      }

      // ---- New earning ----
      if (referral.status === 'CANCELLED' || referral.fraudReviewStatus === 'REJECTED') return { action: 'SKIPPED', reason: 'REFERRAL_CLOSED' } as ReferralCreditOutcome;
      if (purchase.status !== 'PAID') return { action: 'SKIPPED', reason: 'NOT_PAID' } as ReferralCreditOutcome;
      if (purchase.isTestTransaction) return { action: 'SKIPPED', reason: 'TEST_TRANSACTION' } as ReferralCreditOutcome;
      const bought = new Date(purchase.createdAt).getTime();
      const start = new Date(referral.createdAt).getTime();
      if (bought < start) return { action: 'SKIPPED', reason: 'BEFORE_REFERRAL' } as ReferralCreditOutcome;
      if (bought > start + CFG.EARNING_WINDOW_DAYS * DAY_MS) return { action: 'SKIPPED', reason: 'OUTSIDE_WINDOW' } as ReferralCreditOutcome;

      // Actor is not target, per purchase: the referrer (or the referred organizer) buying the referred organizer's goods,
      // by account, email, card or device, earns nothing.
      const [referrer, referred, buyer] = await Promise.all([
        tx.user.findUnique({ where: { id: referral.referrerId }, select: FRAUD_USER_SELECT }),
        tx.user.findUnique({ where: { id: referral.referredUserId }, select: FRAUD_USER_SELECT }),
        purchase.userId ? tx.user.findUnique({ where: { id: purchase.userId }, select: FRAUD_USER_SELECT }) : Promise.resolve(null),
      ]);
      const insiders = [referrer, referred].filter(Boolean) as FraudUser[];
      const selfDealing = insiders.some(
        (u) =>
          (purchase.userId && purchase.userId === u.id) ||
          sameEmail(purchase.buyerEmail, u.email) ||
          (!!buyer && sameEmail(buyer.email, u.email)) ||
          (!!purchase.buyerCardFingerprint && !!u.stripeCardFingerprint && purchase.buyerCardFingerprint === u.stripeCardFingerprint) ||
          (!!buyer?.stripeCardFingerprint && !!u.stripeCardFingerprint && buyer.stripeCardFingerprint === u.stripeCardFingerprint) ||
          (!!buyer?.deviceFingerprint && !!u.deviceFingerprint && buyer.deviceFingerprint === u.deviceFingerprint)
      );
      if (selfDealing) {
        await recordSignal(tx, referral, 'PURCHASE_SELF_DEALING', 100, ['buyer_matches_referrer_or_referred'], purchase.id);
        console.warn(`[affiliate][referral-credit] self-dealing purchase=${purchase.id} referral=${referral.id} -- no credit`);
        return { action: 'SKIPPED', reason: 'SELF_DEALING' } as ReferralCreditOutcome;
      }

      const netFeeCents = referralNetFeeCents(purchase);
      const fullCredit = calculateReferralCreditCents(netFeeCents);
      const creditCents = referralCreditWorthNowCents(fullCredit, purchase);
      if (creditCents <= 0) return { action: 'SKIPPED', reason: 'ZERO_CREDIT' } as ReferralCreditOutcome;

      // First qualifying purchase runs the fraud gate (no-op on later ones).
      const q = await qualifyReferralAndCalculatePayout(tx, referral, now);
      let status: 'ACTIVE' | 'HELD' = q.fraudReviewStatus === 'CLEAR' || q.fraudReviewStatus === 'APPROVED' ? 'ACTIVE' : 'HELD';
      let note: string | null = status === 'HELD' ? `Held for review (${q.fraudReviewStatus})` : null;

      // Per-referrer credit cap over the rolling window (ADR-119 decision 3): past it, park for review, never drop.
      if (status === 'ACTIVE') {
        const capSince = new Date(now.getTime() - CFG.CAP_WINDOW_DAYS * DAY_MS);
        const earned = await tx.subscriptionCreditEntry.findMany({
          where: { userId: referral.referrerId, kind: 'REFERRAL_EARNED', status: { in: ['ACTIVE', 'HELD'] }, createdAt: { gte: capSince } },
          select: { amountCents: true },
        });
        const earnedCents = earned.reduce((s: number, r: { amountCents: number }) => s + (r.amountCents || 0), 0);
        if (earnedCents + creditCents > CFG.CAP_MAX_CREDIT_CENTS) {
          status = 'HELD';
          note = `Held for review: referrer past the $${(CFG.CAP_MAX_CREDIT_CENTS / 100).toFixed(0)} per ${CFG.CAP_WINDOW_DAYS} days credit cap`;
          await recordSignal(tx, referral, 'REFERRER_CAP', 60, [`credit_in_${CFG.CAP_WINDOW_DAYS}d:${earnedCents}`], purchase.id);
        }
      }

      try {
        await tx.subscriptionCreditEntry.create({
          data: {
            userId: referral.referrerId,
            amountCents: creditCents,
            kind: 'REFERRAL_EARNED',
            status,
            availableAt: new Date(bought + CFG.HOLD_DAYS * DAY_MS),
            idempotencyKey: `referral-earn:${purchase.id}`,
            affiliateReferralId: referral.id,
            sourcePurchaseId: purchase.id,
            netFeeCents,
            commissionRateBps: CFG.COMMISSION_RATE_BPS,
            note,
          },
        });
      } catch (err) {
        if ((err as { code?: string })?.code === 'P2002') return { action: 'NONE', reason: 'ALREADY_RECORDED' } as ReferralCreditOutcome;
        throw err;
      }
      await refreshReferralTotal(tx, referral.id, now);
      console.log(`[affiliate][referral-credit] earned purchase=${purchase.id} referral=${referral.id} credit=${creditCents} status=${status}`);
      return { action: 'EARNED', creditCents, status } as ReferralCreditOutcome;
    });
  } catch (err) {
    console.warn(`[affiliate][referral-credit] processPurchaseForReferralCredit(${purchaseId}) failed (non-fatal, the sweep retries):`, err);
    return { action: 'NONE', reason: 'ERROR' };
  }
}

/**
 * Fire-and-forget hook for payment paths (called after the Purchase is committed). Processes the given purchase and the
 * other recent paid rows of the same sale (a cart pays once but writes one row per item). Never throws.
 */
export function fireReferralCreditCheck(purchaseId: string | null | undefined): void {
  if (!purchaseId || !isReferralCreditEnabled()) return;
  try {
    setImmediate(() => {
      (async () => {
        const seed = await prisma.purchase.findUnique({
          where: { id: purchaseId },
          select: { id: true, saleId: true, sale: { select: { organizer: { select: { userId: true } } } } },
        });
        const organizerUserId = seed?.sale?.organizer?.userId;
        if (!seed || !organizerUserId) return;
        const referred = await prisma.affiliateReferral.findFirst({ where: { referredUserId: organizerUserId }, select: { id: true } });
        if (!referred) return;
        const siblings = seed.saleId
          ? await prisma.purchase.findMany({
              where: { saleId: seed.saleId, updatedAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) } },
              select: { id: true },
              take: 200,
            })
          : [];
        const ids = Array.from(new Set([seed.id, ...siblings.map((s: { id: string }) => s.id)]));
        for (const id of ids) await processPurchaseForReferralCredit(id);
      })().catch((err) => console.warn(`[affiliate][referral-credit] fire(${purchaseId}) failed (non-fatal):`, err));
    });
  } catch (err) {
    console.warn('[affiliate][referral-credit] could not schedule referral credit check (non-fatal):', err);
  }
}

/**
 * Sweep: every purchase on a referred organizer's sales touched since `since` (new, refunded, disputed...), plus every
 * purchase that already carries referral credit and was touched since then. Returns how many purchases were processed.
 */
export async function sweepReferralCredit(params: { since: Date; now?: Date }): Promise<{ processed: number; earned: number; adjusted: number }> {
  const now = params.now ?? new Date();
  const result = { processed: 0, earned: 0, adjusted: 0 };
  if (!isReferralCreditEnabled()) return result;
  const windowStart = new Date(now.getTime() - (CFG.EARNING_WINDOW_DAYS + 1) * DAY_MS);
  const referrals = await prisma.affiliateReferral.findMany({
    where: { createdAt: { gte: windowStart }, status: { not: 'CANCELLED' } },
    select: { referredUserId: true },
  });
  const referredUserIds = Array.from(new Set(referrals.map((r) => r.referredUserId)));
  const ids = new Set<string>();
  for (let i = 0; i < referredUserIds.length; i += 200) {
    const chunk = referredUserIds.slice(i, i + 200);
    const rows = await prisma.purchase.findMany({
      where: { updatedAt: { gte: params.since }, sale: { organizer: { userId: { in: chunk } } } },
      select: { id: true },
    });
    rows.forEach((r) => ids.add(r.id));
  }
  // Clawbacks on purchases whose referral is older than the earning window.
  const credited = await prisma.subscriptionCreditEntry.findMany({
    where: { kind: 'REFERRAL_EARNED', status: { not: 'VOID' }, sourcePurchaseId: { not: null } },
    select: { sourcePurchaseId: true },
  });
  const creditedIds = Array.from(new Set(credited.map((c) => c.sourcePurchaseId as string)));
  for (let i = 0; i < creditedIds.length; i += 500) {
    const rows = await prisma.purchase.findMany({
      where: { id: { in: creditedIds.slice(i, i + 500) }, updatedAt: { gte: params.since } },
      select: { id: true },
    });
    rows.forEach((r) => ids.add(r.id));
  }
  for (const id of ids) {
    const out = await processPurchaseForReferralCredit(id, now);
    result.processed++;
    if (out.action === 'EARNED') result.earned++;
    if (out.action === 'ADJUSTED') result.adjusted++;
  }
  return result;
}

/**
 * Admin decision on a BLOCKED or PENDING_REVIEW referral (ADR-119 section 6: the appeal path for every block).
 *   APPROVE: referral -> QUALIFIED / APPROVED, its HELD credit -> ACTIVE (usable after each row's own hold).
 *   REJECT:  referral -> CANCELLED / REJECTED, all of its earned credit -> VOID (if some was already spent on a renewal
 *            the balance goes negative and later earnings pay it down; no card is ever charged for it).
 */
export async function reviewReferral(params: {
  referralId: string;
  decision: 'APPROVE' | 'REJECT';
  adminUserId: string;
  note?: string | null;
  now?: Date;
}): Promise<{ id: string; status: string; fraudReviewStatus: string; creditRowsChanged: number }> {
  const now = params.now ?? new Date();
  if (params.decision !== 'APPROVE' && params.decision !== 'REJECT') throw new Error('INVALID_DECISION');
  const head = await prisma.affiliateReferral.findUnique({ where: { id: params.referralId }, select: { id: true, referrerId: true } });
  if (!head) throw new Error('REFERRAL_NOT_FOUND');
  return withCreditLock(head.referrerId, async (tx) => {
    const r = await tx.affiliateReferral.findUnique({
      where: { id: head.id },
      select: { id: true, status: true, fraudReviewStatus: true, qualifiedAt: true, holdUntil: true },
    });
    if (!r) throw new Error('REFERRAL_NOT_FOUND');
    const note = (params.note ?? '').toString().slice(0, 1000) || null;
    let changed = 0;
    if (params.decision === 'APPROVE') {
      const updated = await tx.affiliateReferral.update({
        where: { id: r.id },
        data: {
          fraudReviewStatus: 'APPROVED',
          status: r.status === 'PENDING' ? 'QUALIFIED' : r.status === 'CANCELLED' ? 'QUALIFIED' : r.status,
          qualifiedAt: r.qualifiedAt ?? now,
          holdUntil: r.holdUntil ?? new Date(now.getTime() + CFG.HOLD_DAYS * DAY_MS),
          reviewedByAdminId: params.adminUserId,
          reviewedAt: now,
        },
        select: { id: true, status: true, fraudReviewStatus: true },
      });
      const res = await tx.subscriptionCreditEntry.updateMany({
        where: { affiliateReferralId: r.id, status: { in: ['HELD', 'VOID'] }, kind: { in: ['REFERRAL_EARNED', 'REFERRAL_ADJUSTMENT'] } },
        data: { status: 'ACTIVE' },
      });
      changed = res.count;
      await tx.affiliateFraudSignal.updateMany({
        where: { affiliateReferralId: r.id, reviewOutcome: 'PENDING' },
        data: { reviewOutcome: 'APPROVED', reviewedByAdminId: params.adminUserId, reviewedAt: now, notes: note },
      });
      await refreshReferralTotal(tx, r.id, now);
      return { ...updated, creditRowsChanged: changed };
    }
    const updated = await tx.affiliateReferral.update({
      where: { id: r.id },
      data: { fraudReviewStatus: 'REJECTED', status: 'CANCELLED', reviewedByAdminId: params.adminUserId, reviewedAt: now },
      select: { id: true, status: true, fraudReviewStatus: true },
    });
    const res = await tx.subscriptionCreditEntry.updateMany({
      where: { affiliateReferralId: r.id, status: { in: ['ACTIVE', 'HELD'] }, kind: { in: ['REFERRAL_EARNED', 'REFERRAL_ADJUSTMENT'] } },
      data: { status: 'VOID' },
    });
    changed = res.count;
    await tx.affiliateFraudSignal.updateMany({
      where: { affiliateReferralId: r.id, reviewOutcome: 'PENDING' },
      data: { reviewOutcome: 'REJECTED', reviewedByAdminId: params.adminUserId, reviewedAt: now, notes: note },
    });
    await refreshReferralTotal(tx, r.id, now);
    return { ...updated, creditRowsChanged: changed };
  });
}
