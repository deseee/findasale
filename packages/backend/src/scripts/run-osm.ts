/**
 * ADR-078: OpenStreetMap Overpass API Scraper — GitHub Actions runner
 * Queries Overpass API across US metros for antique/secondhand/auction businesses.
 * Writes results directly to the Railway PostgreSQL database via Prisma.
 *
 * Environment variables (from GitHub secrets):
 * - DATABASE_URL: Railway PostgreSQL connection string
 * - SCRAPER_BATCH_INDEX: 0-based batch index (default: 0)
 * - SCRAPER_BATCH_COUNT: total batches (default: 1 = run all metros)
 *
 * Usage: npx tsx src/scripts/run-osm.ts
 * Cost: Free (Overpass is public)
 */

import { runOsmScraper } from '../services/scraper/osmScraper';

const batchIndex = parseInt(process.env.SCRAPER_BATCH_INDEX ?? '0', 10);
const batchCount = parseInt(process.env.SCRAPER_BATCH_COUNT ?? '1', 10);

async function main() {
  console.log(`[run-osm] Batch ${batchIndex + 1}/${batchCount}`);

  await runOsmScraper(batchIndex, batchCount);

  console.log('[run-osm] Scraping complete');
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('[run-osm] Fatal error:', err);
    process.exit(1);
  });
