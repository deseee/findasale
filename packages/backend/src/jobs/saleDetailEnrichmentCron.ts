/**
 * ADR-075: EstateSales.NET Sale Detail Enrichment Cron
 * Runs every 4 hours to enrich scraped ESN sales with descriptions and photos
 */

import cron from 'node-cron';
import { cronGuard } from '../utils/cronGuard';
import { runEnrichmentBatch } from '../services/scraper/saleDetailEnrichment';

/**
 * Schedule the enrichment cron to run every 4 hours (0, 4, 8, 12, 16, 20 UTC).
 *
 * NOTE: As of the Railway cost-reduction batch, this cron is DISABLED by default.
 * GitHub Actions (`.github/workflows/enrich-sale-details.yml`) is the canonical owner
 * of sale-detail enrichment. To re-enable the backend cron (e.g., if GH Actions fails),
 * set USE_BACKEND_SALE_ENRICHMENT=true in Railway env.
 */
export function scheduleSaleDetailEnrichmentCron(): void {
  if (process.env.USE_BACKEND_SALE_ENRICHMENT !== 'true') {
    console.log(
      '[saleDetailEnrichment-cron] Skipped — GH Actions handles enrichment ' +
      '(set USE_BACKEND_SALE_ENRICHMENT=true to re-enable backend cron)'
    );
    return;
  }

  // Every 4 hours: 0 */4 * * * (at 0, 4, 8, 12, 16, 20 UTC)
  cron.schedule('0 */4 * * *', cronGuard({ jobName: 'saleDetailEnrichmentCron' }, async () => {
    const startTime = Date.now();
    const batchSize = parseInt(process.env.ESN_DETAIL_BATCH_SIZE || '75', 10);

    console.log(
      `[saleDetailEnrichment-cron] Starting enrichment batch (size: ${batchSize}) at ${new Date().toISOString()}`
    );

    try {
      const result = await runEnrichmentBatch({ limit: batchSize });

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
  }));

  console.log('[saleDetailEnrichment-cron] Registered enrichment cron (every 4 hours at :00 UTC)');
}
