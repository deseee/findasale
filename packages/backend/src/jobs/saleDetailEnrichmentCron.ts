/**
 * ADR-075: EstateSales.NET Sale Detail Enrichment Cron
 * Runs every 4 hours to enrich scraped ESN sales with descriptions and photos
 */

import cron from 'node-cron';
import { enrichSaleDetails } from '../services/scraper/saleDetailEnrichment';

/**
 * Schedule the enrichment cron to run every 4 hours (0, 4, 8, 12, 16, 20 UTC)
 */
export function scheduleSaleDetailEnrichmentCron(): void {
  // Every 4 hours: 0 */4 * * * (at 0, 4, 8, 12, 16, 20 UTC)
  cron.schedule('0 */4 * * *', async () => {
    const startTime = Date.now();
    const batchSize = parseInt(process.env.ESN_DETAIL_BATCH_SIZE || '75', 10);

    console.log(
      `[saleDetailEnrichment-cron] Starting enrichment batch (size: ${batchSize}) at ${new Date().toISOString()}`
    );

    try {
      const result = await enrichSaleDetails(batchSize);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `[saleDetailEnrichment-cron] Complete in ${elapsed}s: ` +
        `${result.processed} processed, ${result.enriched} enriched, ${result.skipped} skipped, ` +
        `aborted: ${result.aborted}`
      );
    } catch (error) {
      console.error(
        '[saleDetailEnrichment-cron] Batch failed:',
        error instanceof Error ? error.message : String(error)
      );
    }
  });

  console.log('[saleDetailEnrichment-cron] Registered enrichment cron (every 4 hours at :00 UTC)');
}
