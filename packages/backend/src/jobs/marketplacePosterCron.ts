import cron from 'node-cron';
import { cronGuard } from '../utils/cronGuard';
import { processDueJobs } from '../services/marketplace/marketplacePosterService';

/**
 * Marketplace Poster cron (ADR-083).
 *
 * Every 10 minutes, processes any QUEUED MarketplaceListingJob rows whose
 * scheduledFor has arrived (POST or REMOVE). Human-like pacing between
 * individual jobs is applied inside processDueJobs, not here.
 *
 * Wrapped in cronGuard so failures land in Sentry monitors exactly like the
 * other ~40 jobs. Until a real MarketplacePosterAccount exists (Patrick
 * action, see ADR-083), every run resolves QUEUED jobs to SKIPPED — expected,
 * not an error.
 */
export function scheduleMarketplacePosterCron(): void {
  cron.schedule(
    '*/10 * * * *',
    cronGuard(
      { jobName: 'marketplacePoster', alertThresholdConsecutiveFailures: 3 },
      async () => {
        await processDueJobs();
      }
    )
  );

  console.log('[marketplace-poster-cron] Registered marketplace poster cron (every 10 minutes)');
}
