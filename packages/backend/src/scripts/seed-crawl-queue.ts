/**
 * Seed Crawl Queue Script
 * 
 * Initializes the DirectoryCrawlQueue with pre-configured metros and sub-areas
 * for the four primary directory sources (GooglePlaces, HERE, Foursquare, OSM).
 * 
 * Usage:
 *   cd packages/backend
 *   npx ts-node src/scripts/seed-crawl-queue.ts
 * 
 * This script is idempotent — it will not overwrite existing queue entries.
 */

import { FULL_SEED_CONFIG } from '../services/scraper/subAreaConfig';
import { seedQueue } from '../services/scraper/crawlQueueManager';

async function main() {
  console.log('[seed-crawl-queue] Starting...');
  console.log(`[seed-crawl-queue] Seeding ${FULL_SEED_CONFIG.length} queue entries`);

  const t0 = Date.now();
  try {
    await seedQueue(FULL_SEED_CONFIG);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    console.log(`[seed-crawl-queue] Complete in ${elapsed}s`);
  } catch (err) {
    console.error('[seed-crawl-queue] Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
