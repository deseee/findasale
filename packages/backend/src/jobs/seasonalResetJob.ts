/**
 * Seasonal Rollover Job — Explorer's Guild annual season boundary.
 *
 * REDESIGNED 2026-09-29: this job no longer demotes anyone. The old reset lowered the stored
 * explorerRank but not guildXp, and every XP award recomputes rank from guildXp, so ranks snapped
 * back and the seasonal board was meaningless. Now rank is permanent and the Hall of Fame
 * "This Season's Leaders" board ranks XP EARNED THIS SEASON straight from the PointsTransaction
 * ledger (services/seasonStandingsService.ts), so it starts fresh on Jan 1 UTC with no write at all.
 *
 * What this job still does at the boundary: logs the season boundary and the final top 10 of the season
 * that just ended (there is no existing table for season snapshots and adding one is a migration, so the
 * durable record is the log line), and calls xpService.applySeasonalReset(), which is now a logged
 * no-op kept so callers and schedules do not change. Nothing is written to any user row.
 *
 * Schedule: 00:05 UTC on Jan 1 through Jan 7. Re-running is harmless (read-only plus logs); a
 * per-process memo skips repeats within one server run. The extra days are a catch-up window in case
 * the server was down or redeploying at the moment of the Jan 1 run.
 *
 * Registration (index.ts is not edited by this file). Add these two lines next to the other job
 * imports/starts in packages/backend/src/index.ts:
 *   import { startSeasonalResetJob } from './jobs/seasonalResetJob';
 *   startSeasonalResetJob();
 */

import cron from 'node-cron';
import { cronGuard } from '../utils/cronGuard';
import { applySeasonalReset } from '../services/xpService';
import { getSeasonXpLeaders, seasonStartFor } from '../services/seasonStandingsService';

export { seasonStartFor };

export type SeasonalResetOutcome = 'recorded' | 'skipped_already_recorded';

/** Years whose boundary this process already recorded (per-process memo; the job is read-only so a repeat is harmless). */
const recordedYears = new Set<number>();

/** Test helper: forget the per-process memo. */
export function _resetSeasonalMemoForTests(): void {
  recordedYears.clear();
}

/**
 * Record the season boundary once per process: logs the final top 10 of the season that just ended
 * (XP earned during it) and calls the no-op applySeasonalReset. Never demotes, never writes user rows.
 * Exported for tests and for one-off manual runs.
 */
export async function runSeasonalResetIfDue(now: Date = new Date()): Promise<SeasonalResetOutcome> {
  const year = now.getUTCFullYear();
  if (recordedYears.has(year)) {
    console.log(`[seasonalResetJob] Season ${year} boundary already recorded by this process, skipping`);
    return 'skipped_already_recorded';
  }
  try {
    const newSeasonStart = seasonStartFor(now);
    const closingSeasonStart = new Date(Date.UTC(year - 1, 0, 1));
    const finalTop = await getSeasonXpLeaders({ start: closingSeasonStart, end: newSeasonStart, limit: 10 });
    console.log(
      `[seasonalResetJob] Season ${year - 1} closed at ${newSeasonStart.toISOString()}. Final top ${finalTop.length} by XP earned: ` +
        JSON.stringify(finalTop)
    );
  } catch (err) {
    // The snapshot is a log line only; never fail the boundary over it.
    console.error('[seasonalResetJob] Could not compute the closing-season standings (non-fatal):', err);
  }
  await applySeasonalReset();
  recordedYears.add(year);
  return 'recorded';
}

export function startSeasonalResetJob(): void {
  // minute hour day-of-month month day-of-week: 00:05 UTC, Jan 1 to Jan 7
  cron.schedule(
    '5 0 1-7 1 *',
    cronGuard({ jobName: 'seasonalResetJob' }, async () => {
      console.log('[seasonalResetJob] Recording the season boundary...');
      await runSeasonalResetIfDue();
    }),
    { timezone: 'UTC' }
  );
  console.log('[seasonalResetJob] Registered: 00:05 UTC on Jan 1-7 (read-only season boundary record, catch-up window)');
}
