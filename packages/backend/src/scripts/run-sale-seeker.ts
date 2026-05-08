/**
 * Sale Seeker scraper test script
 * Usage: npx ts-node packages/backend/src/scripts/run-sale-seeker.ts [metro]
 * Example: npx ts-node packages/backend/src/scripts/run-sale-seeker.ts grand-rapids-mi
 */

import { runScrapeRun } from '../services/scraper/index';

const metro = process.argv[2] || 'grand-rapids-mi';

console.log(`Starting Sale Seeker scraper for: ${metro}`);
runScrapeRun('SaleSeker', metro)
  .then(() => {
    console.log('Scraper completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Scraper failed:', error);
    process.exit(1);
  });
