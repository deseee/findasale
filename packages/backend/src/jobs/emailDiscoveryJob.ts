import { emailDiscoveryBatchJob } from '../services/emailDiscoveryService';

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
