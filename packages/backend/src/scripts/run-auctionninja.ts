/**
 * AuctionNinja standalone runner — local/manual testing only
 * Production scraping is handled by the Railway cron job in index.ts (Wednesday 6 AM UTC).
 * This script is retained for ad-hoc local runs and debugging only.
 *
 * Runs the directory-based auction house discovery (national coverage, no metro needed).
 * The state directory source is also attempted via a US-wide pseudo-metro but gracefully
 * returns 0 if AuctionNinja's markup doesn't match the expected selectors.
 *
 * Usage: npx tsx src/scripts/run-auctionninja.ts
 */

import { scrapeAuctionNinja } from '../services/scraper/sources/auctionNinjaScraper';
import { RateLimiter } from '../services/scraper/rateLimiter';

async function main() {
  const rateLimiter = new RateLimiter({ requestsPerSecond: 0.3, maxRetries: 3 });

  // 'national-us' → metroToState → 'US' (no matching directory page, graceful 0)
  // The sitemap source runs regardless and covers all auction houses nationally.
  const stats = await scrapeAuctionNinja('national-us', 'standalone', rateLimiter);

  console.log('[run-auctionninja] AuctionNinja manual run complete:', stats);

  if (stats.itemsFound === 0) {
    console.error('Zero items found — site may be blocking or markup changed');
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('AuctionNinja runner failed:', err);
  process.exit(1);
});
