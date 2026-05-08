/**
 * Lead Scoring Cron Job — ADR-076 Phase 2
 *
 * Re-scores all organizers weekly on Sundays at 2 AM UTC.
 * This keeps leadScore/leadTier fresh as new scraper data arrives
 * (Indiana licensing, OSM, Sale Seeker all run Monday mornings).
 *
 * Runs after the scraper batch window to pick up new licensing/review data.
 */

import cron from 'node-cron';
import { cronGuard } from '../utils/cronGuard';
import { runLeadScoringBackfill } from '../services/leadScoringService';

async function runLeadScoringJob(): Promise<void> {
  console.log('[leadScoringJob] Starting weekly lead score recomputation...');
  const stats = await runLeadScoringBackfill();
  console.log(
    `[leadScoringJob] Complete — ${stats.scored} organizers scored in ${stats.durationMs}ms. ` +
    `Distribution: COLD=${stats.cold} WARM=${stats.warm} HOT=${stats.hot} ENTERPRISE=${stats.enterprise}`
  );
}

/**
 * Schedule the lead scoring cron.
 * Runs every Sunday at 02:00 UTC — after scrapers finish their Monday morning runs.
 */
export function scheduleLeadScoringCron(): void {
  cron.schedule(
    '0 2 * * 0',
    cronGuard({ jobName: 'leadScoringJob' }, runLeadScoringJob)
  );
  console.log('[leadScoringJob] Scheduled for Sundays at 02:00 UTC');
}
