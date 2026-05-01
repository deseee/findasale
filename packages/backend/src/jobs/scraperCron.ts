/**
 * ADR-073: Directory Scraper — Scheduled Jobs
 * Runs daily scrapes across national metro list.
 * Gated by SCRAPER_ENABLED env var (set to "true" to activate).
 *
 * Schedule:
 *   00:00 UTC — EstateSalesNet (all metros)
 *   06:00 UTC — GarageSaleFinder (all metros)
 */

import cron from 'node-cron';
import { runScrapeRun } from '../services/scraper';

/**
 * Top ~50 US metros by estate/yard sale activity.
 * Format: [city-slug]-[state-abbrev]
 */
const NATIONAL_METROS = [
  // Northeast
  'new-york-ny',
  'philadelphia-pa',
  'boston-ma',
  'pittsburgh-pa',
  'baltimore-md',
  'washington-dc',
  'newark-nj',
  'hartford-ct',
  'providence-ri',
  'buffalo-ny',
  'rochester-ny',
  'albany-ny',

  // Southeast
  'atlanta-ga',
  'charlotte-nc',
  'raleigh-nc',
  'nashville-tn',
  'memphis-tn',
  'miami-fl',
  'orlando-fl',
  'tampa-fl',
  'jacksonville-fl',
  'richmond-va',
  'norfolk-va',

  // Midwest
  'chicago-il',
  'detroit-mi',
  'grand-rapids-mi',
  'cleveland-oh',
  'columbus-oh',
  'cincinnati-oh',
  'indianapolis-in',
  'milwaukee-wi',
  'minneapolis-mn',
  'st-louis-mo',
  'kansas-city-mo',
  'omaha-ne',
  'des-moines-ia',

  // Southwest
  'dallas-tx',
  'houston-tx',
  'san-antonio-tx',
  'austin-tx',
  'phoenix-az',
  'tucson-az',
  'albuquerque-nm',
  'denver-co',
  'colorado-springs-co',
  'salt-lake-city-ut',
  'las-vegas-nv',

  // West Coast
  'los-angeles-ca',
  'san-francisco-ca',
  'san-diego-ca',
  'sacramento-ca',
  'portland-or',
  'seattle-wa',
  'spokane-wa',
];

/**
 * Run a source across all metros sequentially.
 * Sequential to respect rate limits — one metro at a time.
 */
async function runSourceAcrossMetros(source: string): Promise<void> {
  console.log(`[scraperCron] Starting ${source} run across ${NATIONAL_METROS.length} metros`);
  let totalCreated = 0;
  let totalFailed = 0;

  for (const metro of NATIONAL_METROS) {
    try {
      await runScrapeRun(source, metro);
    } catch (error) {
      totalFailed++;
      console.error(`[scraperCron] ${source} failed for ${metro}:`, error);
      // Continue to next metro — don't let one failure stop the run
    }
  }

  console.log(`[scraperCron] ${source} complete — ${NATIONAL_METROS.length - totalFailed} metros OK, ${totalFailed} failed`);
}

/**
 * Initialize scraper cron jobs.
 * Called once at server startup via src/index.ts.
 */
export function initScraperCron(): void {
  if (process.env.SCRAPER_ENABLED !== 'true') {
    console.log('[scraperCron] Scraper disabled — set SCRAPER_ENABLED=true to activate');
    return;
  }

  console.log('[scraperCron] Scraper cron initialized');

  // EstateSalesNet: daily at 00:00 UTC (Railway server is UTC)
  cron.schedule('0 0 * * *', async () => {
    console.log('[scraperCron] EstateSalesNet daily run starting');
    await runSourceAcrossMetros('EstateSalesNet').catch((err) =>
      console.error('[scraperCron] EstateSalesNet run error:', err)
    );
  });

  // GarageSaleFinder: daily at 06:00 UTC (offset to avoid simultaneous runs)
  cron.schedule('0 6 * * *', async () => {
    console.log('[scraperCron] GarageSaleFinder daily run starting');
    await runSourceAcrossMetros('GarageSaleFinder').catch((err) =>
      console.error('[scraperCron] GarageSaleFinder run error:', err)
    );
  });

  console.log('[scraperCron] Scheduled: EstateSalesNet @ 00:00 UTC, GarageSaleFinder @ 06:00 UTC');
}
