/**
 * Event-loop stall detector (2026-11-01, Sentry FINDASALE-NODEJS-91 / -93).
 *
 * On 2026-10-27 09:11-09:16 UTC and 2026-10-29 09:42-09:47 UTC the backend process stopped
 * running JavaScript for ~50 s at a time, five times in a row. Every request in flight hit the
 * 30 s global timeout (503) even for a single findUnique, node-cron skipped every job due in
 * those minutes, and the traces had no spans because nothing ran. The only trace was in the
 * Railway logs: 50-60 s gaps followed by a burst of lines with one timestamp.
 *
 * This module makes the next stall name itself:
 *  - a 500 ms interval measures how late it fires. A gap of EVENT_LOOP_STALL_WARN_MS or more
 *    (default 2000) is logged once the loop is free again, with the activities that were
 *    running (cron jobs and batch jobs register through trackActivity) and the number of
 *    requests in flight, and is sent to Sentry as a warning (at most once a minute).
 *  - getEventLoopSnapshot() gives the worst gap and the p99 delay of the last minute, so the
 *    request timeout can say whether a 503 was a slow dependency or a blocked loop.
 *
 * The interval is unref'd and does no I/O on the normal path, so it costs nothing measurable.
 */
import { monitorEventLoopDelay, IntervalHistogram } from 'perf_hooks';
import * as Sentry from '@sentry/node';

const PROBE_INTERVAL_MS = 500;
const WINDOW_MS = 60_000;
const SENTRY_MIN_INTERVAL_MS = 60_000;

export const stallWarnMs = (): number => {
  const n = parseInt(process.env.EVENT_LOOP_STALL_WARN_MS || '', 10);
  return Number.isFinite(n) && n > 0 ? n : 2000;
};

/** Activities currently running, by name, with their start times (a name may run more than once). */
const activities = new Map<string, number[]>();
let inFlightRequests = 0;

/**
 * Mark a named activity (cron job, batch job) as running. Call the returned function when it ends.
 * Safe to call more than once; never throws.
 */
export function trackActivity(name: string): () => void {
  const startedAt = Date.now();
  const list = activities.get(name) ?? [];
  list.push(startedAt);
  activities.set(name, list);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const cur = activities.get(name);
    if (!cur) return;
    const i = cur.indexOf(startedAt);
    if (i >= 0) cur.splice(i, 1);
    if (cur.length === 0) activities.delete(name);
  };
}

/** Names of the activities running right now, with how long each has run, e.g. "emailDiscoveryBatchJob (312s)". */
export function runningActivities(now: number = Date.now()): string[] {
  const out: string[] = [];
  for (const [name, starts] of activities) {
    for (const s of starts) out.push(`${name} (${Math.round((now - s) / 1000)}s)`);
  }
  return out;
}

export function requestStarted(): void {
  inFlightRequests++;
}

export function requestEnded(): void {
  if (inFlightRequests > 0) inFlightRequests--;
}

interface GapSample {
  at: number;
  gapMs: number;
}

let recentGaps: GapSample[] = [];
let lastStall: GapSample | null = null;
let lastSentryAt = 0;
let histogram: IntervalHistogram | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let lastTick = 0;

/**
 * Record one probe result. Exported for tests: `gapMs` is how much later than scheduled the probe
 * fired. Returns true when the gap counted as a stall.
 */
export function recordProbeGap(gapMs: number, now: number = Date.now()): boolean {
  recentGaps.push({ at: now, gapMs });
  const cutoff = now - WINDOW_MS;
  while (recentGaps.length > 0 && recentGaps[0].at < cutoff) recentGaps.shift();

  if (gapMs < stallWarnMs()) return false;

  lastStall = { at: now, gapMs };
  const running = runningActivities(now);
  const msg =
    `[eventLoop] blocked for ~${Math.round(gapMs)}ms (ended ${new Date(now).toISOString()}); ` +
    `requests in flight: ${inFlightRequests}; running: ${running.length ? running.join(', ') : 'none registered'}`;
  console.error(msg);
  if (now - lastSentryAt >= SENTRY_MIN_INTERVAL_MS) {
    lastSentryAt = now;
    try {
      Sentry.captureMessage(msg, 'warning');
    } catch {
      // Sentry not initialized -- the console line above is enough.
    }
  }
  return true;
}

export interface EventLoopSnapshot {
  /** Worst probe lateness in the last minute, ms. */
  maxGapLastMinuteMs: number;
  /** p99 event-loop delay since the monitor started (perf_hooks histogram), ms; null if unavailable. */
  p99DelayMs: number | null;
  /** The most recent stall at or above the warn threshold, if any. */
  lastStallMs: number | null;
  lastStallAt: string | null;
  inFlightRequests: number;
  running: string[];
}

export function getEventLoopSnapshot(now: number = Date.now()): EventLoopSnapshot {
  const cutoff = now - WINDOW_MS;
  let maxGap = 0;
  for (const g of recentGaps) if (g.at >= cutoff && g.gapMs > maxGap) maxGap = g.gapMs;
  // The probe cannot fire while the loop is blocked, so a stall still in progress is measured here.
  if (timer && lastTick > 0) {
    const pending = now - lastTick - PROBE_INTERVAL_MS;
    if (pending > maxGap) maxGap = pending;
  }
  let p99: number | null = null;
  try {
    if (histogram) p99 = Math.round(histogram.percentile(99) / 1e6);
  } catch {
    p99 = null;
  }
  return {
    maxGapLastMinuteMs: Math.max(0, Math.round(maxGap)),
    p99DelayMs: p99,
    lastStallMs: lastStall ? Math.round(lastStall.gapMs) : null,
    lastStallAt: lastStall ? new Date(lastStall.at).toISOString() : null,
    inFlightRequests,
    running: runningActivities(now),
  };
}

/** One-line form of the snapshot for log messages. */
export function formatEventLoopSnapshot(s: EventLoopSnapshot = getEventLoopSnapshot()): string {
  return (
    `eventLoop maxGap(1m)=${s.maxGapLastMinuteMs}ms p99=${s.p99DelayMs === null ? 'n/a' : `${s.p99DelayMs}ms`} ` +
    `lastStall=${s.lastStallMs ?? 'none'}${s.lastStallAt ? `@${s.lastStallAt}` : ''} ` +
    `inFlight=${s.inFlightRequests} running=[${s.running.join(', ')}]`
  );
}

/** Start the probe (idempotent). Called once from index.ts at boot. */
export function startEventLoopMonitor(): void {
  if (timer) return;
  try {
    histogram = monitorEventLoopDelay({ resolution: 20 });
    histogram.enable();
  } catch {
    histogram = null;
  }
  lastTick = Date.now();
  timer = setInterval(() => {
    const now = Date.now();
    recordProbeGap(Math.max(0, now - lastTick - PROBE_INTERVAL_MS), now);
    lastTick = now;
  }, PROBE_INTERVAL_MS);
  (timer as any)?.unref?.();
  console.log(`[eventLoop] stall monitor active (warn at ${stallWarnMs()}ms)`);
}

/** Test helper: stop the probe and clear all state. */
export function resetEventLoopMonitorForTests(): void {
  if (timer) clearInterval(timer);
  timer = null;
  try {
    histogram?.disable();
  } catch {
    // ignore
  }
  histogram = null;
  recentGaps = [];
  lastStall = null;
  lastSentryAt = 0;
  lastTick = 0;
  inFlightRequests = 0;
  activities.clear();
}
