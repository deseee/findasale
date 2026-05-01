/**
 * ADR-076: Standalone EstateSalesNet scraper for GitHub Actions
 * Runs outside Express server, POSTs results to Railway backend
 *
 * Environment variables (from GitHub secrets):
 * - RAILWAY_BACKEND_URL: https://backend-production-xxx.up.railway.app
 * - INTERNAL_SCRAPER_KEY: shared secret for authentication
 * - ESTATESALESNET_ORGANIZER_ID: organizer to attribute scraped listings to
 *
 * Usage: npx ts-node src/scripts/run-estatesalesnet.ts
 */

import { scrapeEstateSalesNetItems } from '../services/scraper/sources/estatesalesnet';
import { NATIONAL_GRID } from '../services/scraper/national-grid';
import { RateLimiter } from '../services/scraper/rateLimiter';

const INGEST_URL = (process.env.RAILWAY_BACKEND_URL || 'http://localhost:3001') + '/api/internal/scraper/ingest';
const SCRAPER_KEY = process.env.INTERNAL_SCRAPER_KEY;
const ORGANIZER_ID = process.env.ESTATESALESNET_ORGANIZER_ID;

async function main() {
  // Validate required env vars
  if (!SCRAPER_KEY) {
    throw new Error('INTERNAL_SCRAPER_KEY environment variable is not set');
  }
  // ORGANIZER_ID is optional — backend falls back to system organizer if not set
  if (!ORGANIZER_ID) {
    console.log('[run-estatesalesnet] No ESTATESALESNET_ORGANIZER_ID set — will use system organizer');
  }

  console.log(`[run-estatesalesnet] Starting scrape of ${NATIONAL_GRID.length} coordinate centers`);
  console.log(`[run-estatesalesnet] Backend URL: ${INGEST_URL}`);

  const rateLimiter = new RateLimiter({ requestsPerSecond: 1, maxRetries: 3 });
  const allItems: any[] = [];
  const seenIds = new Set<string>(); // Dedup across overlapping circles
  let successCount = 0;
  let failureCount = 0;

  // Scrape each coordinate center sequentially
  for (const center of NATIONAL_GRID) {
    try {
      console.log(`[run-estatesalesnet] Scraping ${center.label}...`);
      const items = await scrapeEstateSalesNetItems(center, rateLimiter);

      // Dedupe by sourceItemId before adding to allItems
      for (const item of items) {
        if (item.sourceItemId && !seenIds.has(item.sourceItemId)) {
          seenIds.add(item.sourceItemId);
          allItems.push(item);
        }
      }

      successCount++;
      console.log(`[run-estatesalesnet] ${center.label}: ${items.length} items (${allItems.length} total after dedup)`);
    } catch (error) {
      failureCount++;
      console.error(
        `[run-estatesalesnet] Failed for ${center.label}:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  console.log(
    `[run-estatesalesnet] Scraping complete — ${successCount} centers OK, ${failureCount} failed`
  );
  console.log(`[run-estatesalesnet] Total items collected (after dedup): ${allItems.length}`);

  // POST to Railway in batches of 25
  const batchSize = 25;
  for (let i = 0; i < allItems.length; i += batchSize) {
    const batch = allItems.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(allItems.length / batchSize);

    try {
      console.log(
        `[run-estatesalesnet] Posting batch ${batchNum}/${totalBatches} (${batch.length} items)...`
      );

      const response = await fetch(INGEST_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-scraper-key': SCRAPER_KEY,
        },
        body: JSON.stringify({
          items: batch,
          organizerId: ORGANIZER_ID,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(
          `[run-estatesalesnet] Batch ${batchNum} failed with status ${response.status}:`,
          error
        );
        continue;
      }

      const result = await response.json() as {
        stats: { created: number; updated: number; skipped: number; failed: number };
      };
      console.log(
        `[run-estatesalesnet] Batch ${batchNum} ingested — ${result.stats.created} created, ${result.stats.skipped} skipped, ${result.stats.failed} failed`
      );
    } catch (error) {
      console.error(
        `[run-estatesalesnet] Failed to post batch ${batchNum}:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  console.log(`[run-estatesalesnet] All batches posted. Done.`);
}

main().catch((error) => {
  console.error('[run-estatesalesnet] Fatal error:', error);
  process.exit(1);
});
