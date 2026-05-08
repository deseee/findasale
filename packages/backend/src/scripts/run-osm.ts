/**
 * ADR-078: OpenStreetMap Overpass API Scraper — GitHub Actions runner
 * Queries Overpass API across 20 US metros for antique/secondhand/auction businesses.
 * POSTs results to Railway backend for ingestion.
 *
 * Environment variables (from GitHub secrets):
 * - RAILWAY_BACKEND_URL: https://backend-production-xxx.up.railway.app
 * - INTERNAL_SCRAPER_KEY: shared secret for /api/internal/scraper/ingest
 *
 * Usage: npx ts-node src/scripts/run-osm.ts
 * Cost: Free (Overpass is public)
 */

import { runOsmScraper } from '../services/scraper/osmScraper';
import { ScrapedItem } from '../services/scraper/index';

const INGEST_URL =
  (process.env.RAILWAY_BACKEND_URL || 'http://localhost:3001') + '/api/internal/scraper/ingest';
const SCRAPER_KEY = process.env.INTERNAL_SCRAPER_KEY;

async function main() {
  if (!SCRAPER_KEY) throw new Error('INTERNAL_SCRAPER_KEY is not set');

  console.log(`[run-osm] Backend: ${INGEST_URL}`);

  // Run the scraper — it logs progress internally
  await runOsmScraper();

  console.log('[run-osm] Scraping complete');
}

main().catch((err) => {
  console.error('[run-osm] Fatal error:', err);
  process.exit(1);
});
