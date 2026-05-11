/**
 * ADR-073: Facebook Marketplace GraphQL Scraper — GitHub Actions runner
 * Scrapes Facebook Marketplace across 43 US metros for garage/yard/estate sales.
 * Writes directly to Railway DB via Prisma (same pattern as OSM scraper).
 *
 * Environment variables (from GitHub secrets):
 * - DATABASE_URL: Railway PostgreSQL connection string
 * - FB_MARKETPLACE_ORGANIZER_ID: optional — falls back to system organizer
 *
 * Usage: npx ts-node src/scripts/run-facebook-marketplace.ts
 * Cost: Free (public GraphQL endpoint — no login required)
 * Note: FB may return empty results or 429s without warning. Failures per metro
 *       are logged but do not abort the run.
 */

import { scrapeFacebookMarketplace } from '../services/scraper/sources/facebook-marketplace';
import { getOrCreateSystemOrganizer } from '../services/scraper/index';
import { RateLimiter } from '../services/scraper/rateLimiter';

const ORGANIZER_ID = process.env.FB_MARKETPLACE_ORGANIZER_ID;

// All metros defined in the source file's coordinate map
const METROS = [
  'new-york-ny',
  'los-angeles-ca',
  'chicago-il',
  'houston-tx',
  'phoenix-az',
  'philadelphia-pa',
  'san-antonio-tx',
  'san-diego-ca',
  'dallas-tx',
  'san-jose-ca',
  'austin-tx',
  'jacksonville-fl',
  'fort-worth-tx',
  'columbus-oh',
  'charlotte-nc',
  'san-francisco-ca',
  'indianapolis-in',
  'seattle-wa',
  'denver-co',
  'washington-dc',
  'boston-ma',
  'el-paso-tx',
  'nashville-tn',
  'detroit-mi',
  'oklahoma-city-ok',
  'memphis-tn',
  'new-orleans-la',
  'louisville-ky',
  'baltimore-md',
  'portland-or',
  'las-vegas-nv',
  'milwaukee-wi',
  'albuquerque-nm',
  'tucson-az',
  'fresno-ca',
  'mesa-az',
  'sacramento-ca',
  'atlanta-ga',
  'kansas-city-mo',
  'long-beach-ca',
  'raleigh-nc',
  'miami-fl',
  'grand-rapids-mi',
];

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  const organizerId = ORGANIZER_ID || (await getOrCreateSystemOrganizer());
  if (!ORGANIZER_ID) {
    console.log('[run-fb-marketplace] No FB_MARKETPLACE_ORGANIZER_ID — using system organizer');
  }

  console.log(
    `[run-fb-marketplace] Starting — ${METROS.length} metros, organizer: ${organizerId}`
  );

  // Conservative rate limiting: FB Marketplace is rate-sensitive
  const rateLimiter = new RateLimiter({ requestsPerSecond: 0.5, maxRetries: 2 });

  const totals = { created: 0, updated: 0, skipped: 0, failed: 0 };
  let metroSuccess = 0;
  let metroFailed = 0;

  for (const metro of METROS) {
    try {
      const stats = await scrapeFacebookMarketplace(metro, organizerId, rateLimiter);
      totals.created += stats.created;
      totals.updated += stats.updated;
      totals.skipped += stats.skipped;
      totals.failed += stats.failed;
      metroSuccess++;
      console.log(
        `[run-fb-marketplace] ${metro} — ${stats.created}c / ${stats.updated}u / ${stats.skipped}s / ${stats.failed}f`
      );
    } catch (err) {
      metroFailed++;
      console.error(
        `[run-fb-marketplace] ${metro} failed:`,
        err instanceof Error ? err.message : String(err)
      );
      // Continue to next metro — partial runs are acceptable
    }
  }

  console.log(
    `[run-fb-marketplace] Complete — ${metroSuccess}/${METROS.length} metros OK, ` +
      `${totals.created} created, ${totals.updated} updated, ` +
      `${totals.skipped} skipped, ${totals.failed} item-level failures, ` +
      `${metroFailed} metro-level failures`
  );
}

main().catch((err) => {
  console.error('[run-fb-marketplace] Fatal error:', err);
  process.exit(1);
});
