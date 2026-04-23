import cron from 'node-cron';
import { referralTrancheService } from '../services/referralTrancheService';

/**
 * Feature #XXX: Referral Reputation Score Recomputation Job
 *
 * Runs daily at 2 AM UTC to recompute all referrer reputation scores.
 * Score = fully-earned referral pairs / total referral pairs in rolling 90-day window
 *
 * Reputation multiplier (0.0–1.0) applied to all tranche XP awards:
 * - New users start at 1.0 (full credit)
 * - Score only computed if referrer has >= 3 referrals in 90 days
 * - Multiplier floor: 0.1 (never zero XP)
 */

export const recomputeReputationScores = async (): Promise<void> => {
  try {
    console.log(`[reputationScoreJob] Starting reputation score recomputation...`);
    await referralTrancheService.recomputeAllScores();
    console.log(`[reputationScoreJob] Reputation score recomputation completed`);
  } catch (error) {
    console.error('[reputationScoreJob] Fatal error:', error);
  }
};

/**
 * Register the reputation score recomputation cron job.
 * Schedule: Daily at 2 AM UTC (02:00 UTC)
 * Cron pattern: '0 2 * * *' = every day at 02:00 UTC
 */
export const scheduleReputationScoreCron = (): void => {
  cron.schedule('0 2 * * *', () => {
    console.log('[reputationScoreJob] Running scheduled reputation score recomputation job...');
    recomputeReputationScores();
  });
  console.log('[reputationScoreJob] Scheduled reputation score job registered (daily at 02:00 UTC)');
};
