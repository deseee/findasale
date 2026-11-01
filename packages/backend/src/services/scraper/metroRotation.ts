/**
 * Metro rotation for metro-loop sources (2026-11-01, GarageSaleFinder).
 *
 * Before this, every daily run walked NATIONAL_METROS in the same fixed order, so whenever
 * the run ran out of request budget the same tail metros (the West Coast, Alaska, Hawaii)
 * were starved day after day. Now each run starts with the metros that have gone longest
 * without a complete, successful scrape:
 *   1. metros with no qualifying success in the lookback window come first, in configured
 *      order rotated by a per-day offset (so even this group never starts at the same place);
 *   2. then every other metro, oldest success first.
 * A metro that was cut short (cap, breaker, block signal) is recorded as PARTIAL_FAILURE by
 * runScrapeRun and therefore stays at the front until it completes.
 */

import { prisma } from '../../lib/prisma';

/** How far back to look for a metro's last complete success. */
export const ROTATION_LOOKBACK_DAYS = 30;

/**
 * Jobs before this instant were written by the old code, which recorded capped metros as
 * SUCCESS. For those, only a job that actually found listings and failed none counts as a
 * real success; from this instant on, SUCCESS means the metro was fully looked at (capped
 * runs are PARTIAL_FAILURE), so an empty SUCCESS counts too.
 */
export const ROTATION_STRICT_STATUS_SINCE = new Date('2026-11-02T00:00:00Z');

/** Day index (UTC) used for the per-day offset. */
export function utcDayIndex(now: Date = new Date()): number {
  return Math.floor(now.getTime() / 86_400_000);
}

/**
 * Order metros for one run. Pure: lastSuccess maps metro -> time of its last complete success.
 * Unknown metros in lastSuccess are ignored; every configured metro appears exactly once.
 */
export function orderMetrosForRotation(
  metros: readonly string[],
  lastSuccess: ReadonlyMap<string, Date>,
  now: Date = new Date()
): string[] {
  const unique = Array.from(new Set(metros));
  const n = unique.length;
  if (n === 0) return [];
  const offset = ((utcDayIndex(now) * 37) % n + n) % n;
  const rotated = unique.slice(offset).concat(unique.slice(0, offset));
  const position = new Map(rotated.map((m, i) => [m, i]));

  const never = rotated.filter((m) => !lastSuccess.has(m));
  const seen = rotated
    .filter((m) => lastSuccess.has(m))
    .sort((a, b) => {
      const diff = lastSuccess.get(a)!.getTime() - lastSuccess.get(b)!.getTime();
      return diff !== 0 ? diff : position.get(a)! - position.get(b)!;
    });
  return never.concat(seen);
}

/** Load each metro's last complete-success time for a source (see ROTATION_STRICT_STATUS_SINCE). */
export async function loadLastSuccessByMetro(
  source: string,
  now: Date = new Date()
): Promise<Map<string, Date>> {
  const since = new Date(now.getTime() - ROTATION_LOOKBACK_DAYS * 86_400_000);
  const rows = await prisma.$queryRaw<Array<{ metro: string; last: Date | null }>>`
    SELECT "metro", MAX("completedAt") AS "last"
    FROM "ScrapedSalesJob"
    WHERE "source" = ${source}
      AND "status" = 'SUCCESS'
      AND "startedAt" >= ${since}
      AND "completedAt" IS NOT NULL
      AND (
        "startedAt" >= ${ROTATION_STRICT_STATUS_SINCE}
        OR ("itemsFound" > 0 AND "itemsFailed" = 0)
      )
    GROUP BY "metro"`;
  const out = new Map<string, Date>();
  for (const r of rows) {
    if (r.metro && r.last) out.set(r.metro, new Date(r.last));
  }
  return out;
}

/** Rotation order for a source; falls back to the configured order if the DB read fails. */
export async function rotatedMetrosForSource(
  source: string,
  metros: readonly string[],
  now: Date = new Date()
): Promise<string[]> {
  try {
    const last = await loadLastSuccessByMetro(source, now);
    return orderMetrosForRotation(metros, last, now);
  } catch (err) {
    console.warn(
      `[metroRotation] ${source}: could not read last-success times, using day-offset order only:`,
      err instanceof Error ? err.message : String(err)
    );
    return orderMetrosForRotation(metros, new Map(), now);
  }
}

/** Incomplete reasons after which the domain is cooling down: stop the run, resume next time. */
const STOP_RUN_REASONS = new Set(['skipped_breaker', 'skipped_no_proxy', 'metro_http_429', 'metro_http_503', 'metro_http_403']);

export interface RotatingLoopDeps {
  /** Run one metro; returns its stats (incompleteReason set when cut short). */
  runOne: (metro: string) => Promise<{ incompleteReason?: string } | undefined>;
  /** ms until the source host's hourly-cap window resets. */
  capResetInMs: () => number;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  /** Hard stop for the whole run (the next scheduled run picks up the rest first). */
  maxRunMs: number;
}

export interface RotatingLoopResult {
  attempted: number;
  complete: number;
  incomplete: number;
  errored: number;
  notReached: number;
  stoppedBy?: string;
}

/**
 * Walk metros in rotation order. When a metro is cut short by the hourly cap, wait for the
 * cap window to reset (if that still fits in the run) and retry that metro once, instead of
 * burning through every remaining metro with skipped requests. When the domain breaker or a
 * block signal stops a metro, end the run: every later metro would be skipped the same way,
 * and the rotation puts them first next time.
 */
export async function runRotatingMetroLoop(
  source: string,
  orderedMetros: readonly string[],
  deps: RotatingLoopDeps
): Promise<RotatingLoopResult> {
  const startedAt = deps.now();
  const deadline = startedAt + deps.maxRunMs;
  const result: RotatingLoopResult = { attempted: 0, complete: 0, incomplete: 0, errored: 0, notReached: 0 };

  for (let i = 0; i < orderedMetros.length; i++) {
    const metro = orderedMetros[i];
    if (deps.now() >= deadline) {
      result.notReached = orderedMetros.length - i;
      result.stoppedBy = 'max_run_time';
      break;
    }

    let stats: { incompleteReason?: string } | undefined;
    result.attempted++;
    try {
      stats = await deps.runOne(metro);
      if (stats?.incompleteReason === 'skipped_cap') {
        const waitMs = deps.capResetInMs() + 5_000;
        if (deps.now() + waitMs < deadline) {
          console.log(`[metroRotation] ${source}: hourly cap reached at ${metro} — waiting ${Math.round(waitMs / 1000)}s for the window to reset, then retrying it`);
          await deps.sleep(waitMs);
          stats = await deps.runOne(metro);
        }
      }
    } catch (err) {
      result.errored++;
      console.error(`[metroRotation] ${source} failed for ${metro}:`, err);
      continue;
    }

    if (stats?.incompleteReason) {
      result.incomplete++;
      if (STOP_RUN_REASONS.has(stats.incompleteReason) || stats.incompleteReason === 'skipped_cap') {
        result.notReached = orderedMetros.length - i - 1;
        result.stoppedBy = stats.incompleteReason;
        break;
      }
    } else {
      result.complete++;
    }
  }

  console.log(
    `[metroRotation] ${source} run done in ${Math.round((deps.now() - startedAt) / 60000)} min — ` +
      `attempted=${result.attempted} complete=${result.complete} incomplete=${result.incomplete} ` +
      `errored=${result.errored} notReached=${result.notReached}` +
      (result.stoppedBy ? ` stoppedBy=${result.stoppedBy} (those metros go first next run)` : '')
  );
  return result;
}
