import { prisma } from '../lib/prisma';

// D-XP-004: Referral Fraud Gate — observational service
// Phase 3: Device/IP fraud detection (observational mode, no blocking)
// Phase 4: Account age gate, IP velocity checks

// Observational mode flag — flip to true in Phase 4 to activate blocking
const FRAUD_GATE_ACTIVE = false;

/**
 * Minimum account age in days before XP reward is eligible
 * Used in Phase 4 for account age gate
 */
export const MIN_ACCOUNT_AGE_DAYS = 7;

/**
 * Fraud score threshold for automatic deferral
 * Scores >= 50 trigger review needed before XP award
 */
const FRAUD_GATE_THRESHOLD = 50;

/**
 * Check if multiple accounts share the same device fingerprint
 * and used the same referral code
 * Returns score 0-100: High = suspicious
 */
export async function checkDeviceAbuse(
  referrerId: string,
  referredUserId: string
): Promise<number> {
  try {
    // Get the referred user's device fingerprint
    const referredUser = await prisma.user.findUnique({
      where: { id: referredUserId },
      select: { deviceFingerprint: true }
    });

    if (!referredUser?.deviceFingerprint) {
      return 0; // No fingerprint data
    }

    // Count other users with same device fingerprint who used the same referral code
    const sharedDeviceCount = await prisma.referral.count({
      where: {
        referrerId,
        referredUser: {
          deviceFingerprint: referredUser.deviceFingerprint
        },
        referredUserId: { not: referredUserId } // Exclude self
      }
    });

    // Scoring: 3+ shared device accounts = highly suspicious
    if (sharedDeviceCount >= 3) return 80;
    if (sharedDeviceCount >= 2) return 40;
    return 0; // One or zero other accounts with same device
  } catch (error) {
    console.error('[referralFraud] checkDeviceAbuse error:', error);
    return 0; // Fail open: don't block on errors
  }
}

/**
 * Check if referrer has sent 5+ referrals in past 7 days
 * (IP velocity check — rapid referral velocity is suspicious)
 * Returns score 0-100
 */
export async function checkReferralVelocity(referrerId: string): Promise<number> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Count ReferralReward records for this referrer in last 7 days
    const recentReferralCount = await prisma.referralReward.count({
      where: {
        referrerId,
        createdAt: { gte: sevenDaysAgo }
      }
    });

    // Scoring: 10+ referrals in 7 days = very high velocity
    if (recentReferralCount >= 10) return 90;
    if (recentReferralCount >= 5) return 50;
    return 0; // Normal velocity
  } catch (error) {
    console.error('[referralFraud] checkReferralVelocity error:', error);
    return 0; // Fail open
  }
}

/**
 * Get account age in days
 */
export function getAccountAgeDays(createdAt: Date): number {
  const ageMs = Date.now() - createdAt.getTime();
  return Math.floor(ageMs / (24 * 60 * 60 * 1000));
}

/**
 * Composite fraud evaluation
 * Runs device abuse and IP velocity checks
 * Creates ReferralFraudSignal record if score > 30
 * Returns: { shouldDefer, fraudScore, signals }
 *
 * In Phase 3 (observational): logs signals but never sets shouldDefer = true
 * In Phase 4 (active): sets shouldDefer = true if score >= FRAUD_GATE_THRESHOLD
 */
export async function evaluateReferralFraud(
  referrerId: string,
  referredUserId: string,
  referralRewardId: string
): Promise<{ shouldDefer: boolean; fraudScore: number; signals: string[] }> {
  try {
    const signals: string[] = [];
    let compositeScore = 0;

    // Check device abuse
    const deviceScore = await checkDeviceAbuse(referrerId, referredUserId);
    if (deviceScore > 0) {
      signals.push('DEVICE_ABUSE');
      compositeScore += deviceScore;
    }

    // Check IP velocity
    const velocityScore = await checkReferralVelocity(referrerId);
    if (velocityScore > 0) {
      signals.push('IP_VELOCITY');
      compositeScore += velocityScore;
    }

    // Average the scores to normalize to 0-100
    const fraudScore = signals.length > 0 ? Math.floor(compositeScore / signals.length) : 0;

    // Create fraud signal record if score > 30
    if (fraudScore > 30) {
      await prisma.referralFraudSignal.create({
        data: {
          referralRewardId,
          referrerId,
          referredUserId,
          signalType: signals[0] || 'UNKNOWN',
          confidenceScore: fraudScore,
          flags: signals,
          reviewOutcome: 'PENDING'
        }
      });

      // Update referral reward with fraud scores
      await prisma.referralReward.update({
        where: { id: referralRewardId },
        data: {
          deviceFraudScore: deviceScore,
          ipFraudScore: velocityScore,
          fraudReviewStatus: 'PENDING_REVIEW'
        }
      });
    }

    // Phase 3: Observational mode — never defer
    // Phase 4: Flip FRAUD_GATE_ACTIVE to true to enable automatic deferral
    const shouldDefer = FRAUD_GATE_ACTIVE && fraudScore >= FRAUD_GATE_THRESHOLD;

    return {
      shouldDefer,
      fraudScore,
      signals
    };
  } catch (error) {
    console.error('[referralFraud] evaluateReferralFraud error:', error);
    return {
      shouldDefer: false,
      fraudScore: 0,
      signals: []
    };
  }
}
