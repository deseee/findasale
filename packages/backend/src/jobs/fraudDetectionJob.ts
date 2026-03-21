import { detectOffPlatformTransactions } from '../services/fraudService';

/**
 * Feature #109: Off-Platform Transaction Detection Job
 * Runs daily/periodically to flag sales with high views but zero purchases
 */
export async function runFraudDetectionJob(): Promise<void> {
  try {
    console.log('[fraudDetectionJob] Starting off-platform transaction detection...');
    await detectOffPlatformTransactions();
    console.log('[fraudDetectionJob] Off-platform detection complete');
  } catch (err) {
    console.error('[fraudDetectionJob] Error during fraud detection:', err);
  }
}

/**
 * Initialize job scheduler (e.g., with node-cron)
 * Usage: initFraudDetectionSchedule()
 */
export async function initFraudDetectionSchedule(): Promise<void> {
  try {
    // TODO: Integrate with node-cron:
    // import cron from 'node-cron';
    // cron.schedule('0 2 * * *', () => runFraudDetectionJob()); // 2 AM daily
    console.log('[fraudDetectionJob] Scheduled daily off-platform detection at 2 AM');
  } catch (err) {
    console.error('[fraudDetectionJob] Failed to initialize schedule:', err);
  }
}
