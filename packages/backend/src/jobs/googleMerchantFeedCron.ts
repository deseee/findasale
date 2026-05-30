import cron from 'node-cron';
import { cronGuard } from '../utils/cronGuard';
import { buildAndCacheFeed } from '../services/googleMerchantFeedService';

/**
 * Feature #463: Google Merchant Center free product-listings feed cron.
 *
 * Nightly, rebuilds the Google Merchant TSV product feed from current DB state,
 * uploads it to Cloudinary as a raw artifact, and refreshes the in-memory cache
 * served by GET /api/google-merchant/feed.
 *
 * Runs at 3:30 AM UTC (NOT 3:00 — that slot is taken by markdownCycleCron).
 */
export function scheduleGoogleMerchantFeedCron(): void {
  // 30 3 * * * = 3:30 AM UTC every day
  cron.schedule(
    '30 3 * * *',
    cronGuard({ jobName: 'googleMerchantFeedCron' }, async () => {
      const entry = await buildAndCacheFeed();
      console.log(
        `[google-merchant-feed-cron] Feed rebuilt — ${entry.itemCount} eligible items, ${entry.tsv.length} bytes`
      );
    })
  );

  console.log(
    '[google-merchant-feed-cron] Registered Google Merchant feed cron (3:30 AM UTC daily)'
  );
}
