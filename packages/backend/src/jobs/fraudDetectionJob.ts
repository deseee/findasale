import cron from 'node-cron';
import { detectOffPlatformTransactions } from '../services/fraudService';
import { cronGuard } from '../utils/cronGuard';

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
    cron.schedule('35 2 * * *', cronGuard({ jobName: 'fraudDetectionJob' }, () => runFraudDetectionJob())); // 2 AM daily
    console.log('[fraudDetectionJob] Scheduled daily off-platform detection at 2 AM');
  } catch (err) {
    console.error('[fraudDetectionJob] Failed to initialize schedule:', err);
  }
}

// Self-schedule on module load (matches pattern of other job files)
initFraudDetectionSchedule();
