import cron from 'node-cron';
import { emailDiscoveryBatchJob } from '../services/emailDiscoveryService';
import { cronGuard } from '../utils/cronGuard';

/**
 * Email Discovery Batch Job
 *
 * Cursor-paginated job that discovers emails for all organizers where:
 * - contactEmail IS NULL
 * - website IS NOT NULL
 * - isUnmanagedListing = true
 *
 * Batch size: 50
 * Delay between batches: 2s
 *
 * Usage: Call directly from scheduled job or cron handler
 * Example:
 *   const result = await emailDiscoveryJob();
 *   console.log(`Discovered ${result.discovered} of ${result.processed} organizers`);
 */
export async function emailDiscoveryJob(): Promise<{
  processed: number;
  discovered: number;
  skipped: number;
}> {
  console.log('[emailDiscoveryJob] Starting batch discovery...');
  const startTime = Date.now();

  try {
    const result = await emailDiscoveryBatchJob(50, 2000);
    const duration = Date.now() - startTime;

    console.log(
      `[emailDiscoveryJob] Complete: ${result.discovered}/${result.processed} emails discovered in ${duration}ms`
    );
    return result;
  } catch (err) {
    console.error('[emailDiscoveryJob] Error:', err);
    throw err;
  }
}

/**
 * initEmailDiscoveryCron — registers the email discovery job in the cron scheduler.
 *
 * Schedule: daily at 3:00 AM UTC
 * Gate: EMAIL_DISCOVERY_ENABLED=true (Railway env var — togglable without a deploy)
 *
 * To activate: set EMAIL_DISCOVERY_ENABLED=true in Railway → backend service → Variables.
 */
export function initEmailDiscoveryCron(): void {
  if (process.env.EMAIL_DISCOVERY_ENABLED !== 'true') {
    console.log('[emailDiscoveryCron] Disabled — set EMAIL_DISCOVERY_ENABLED=true to activate');
    return;
  }

  // Daily at 3:00 AM UTC
  cron.schedule('0 3 * * *', cronGuard({ jobName: 'email-discovery' }, async () => {
    await emailDiscoveryJob();
  }), { timezone: 'UTC' });

  console.log('[emailDiscoveryCron] Registered — runs daily at 03:00 UTC');
}
