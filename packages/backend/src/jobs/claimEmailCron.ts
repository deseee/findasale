import cron from 'node-cron';
import { sendClaimEmailBatch } from '../services/scraper/claimEmailService';

/**
 * ADR-073 Phase 2: Claim Email Pipeline — Daily cron job to send 3-touch sequences
 * Runs daily at 8 AM UTC (or when gated by CLAIM_EMAIL_ENABLED)
 */
export const initClaimEmailCron = (): void => {
  // Gate: check if claim email is enabled
  if (process.env.CLAIM_EMAIL_ENABLED !== 'true') {
    console.log('[ClaimEmailCron] Disabled (set CLAIM_EMAIL_ENABLED=true to enable)');
    return;
  }

  // Run daily at 8 AM UTC
  cron.schedule('0 8 * * *', async () => {
    console.log('[ClaimEmailCron] Starting claim email batch send');
    await sendClaimEmailBatch();
    console.log('[ClaimEmailCron] Batch send complete');
  });

  console.log('[ClaimEmailCron] Initialized (runs daily at 8 AM UTC)');
};
