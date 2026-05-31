import cron from 'node-cron';
import { cronGuard } from '../utils/cronGuard';
import { runListingEnrichmentCronBatch } from '../controllers/internalListingEnrichmentController';

/**
 * Nightly cron job (4 AM UTC) to AI-enrich scraped sale listings.
 * Processes unenriched sales in batches using Claude Haiku.
 * Batch size controlled by AI_ENRICHMENT_BATCH_SIZE env var (default: 50).
 * Built-in cost ceiling in listingEnrichmentService prevents runaway spend.
 */
export const scheduleListingEnrichmentCron = (): void => {
  cron.schedule('0 4 * * *', cronGuard({ jobName: 'listingEnrichmentCron' }, async () => {
    console.log('[ListingEnrichmentCron] Starting nightly listing enrichment batch...');
    await runListingEnrichmentCronBatch();
  }));
};
