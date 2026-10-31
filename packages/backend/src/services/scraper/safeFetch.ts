/**
 * safeFetch.ts — the single ban-safe egress wrapper for all outbound scraper fetches.
 *
 * PURPOSE (Batch B5 fetch-hygiene foundation):
 * Every third-party fetch made by the scraper pipelines should funnel through this one
 * function so that ban-avoidance hygiene is enforced in exactly one place:
 *   1. Circuit-breaker consult (domainFetchState) — never hammer a dead/throttled host.
 *   2. Per-host hourly hard cap — a runaway loop can never exceed CAP req/hr for a host.
 *   3. Per-host rate spacing + jitter (rateLimiter) — no detectable fixed cadence.
 *   4. Fail-closed egress routing — when a proxy is REQUIRED but unconfigured we SKIP
 *      rather than leaking a direct request from Railway's IP.
 *   5. Breaker bookkeeping — 429/503/403/404 record failures + backoff; 2xx records success.
 *
 * DESIGN NOTES:
 * - INERT FOUNDATION: this module has no adopters yet. It changes no behaviour until a
 *   caller imports it. It must compile clean and be side-effect free at import time.
 * - FAIL OPEN on infra errors: if the breaker/DB read throws, we log and proceed with the
 *   fetch. A transient DB blip must never crash a caller or stall the whole pipeline.
 * - FAIL CLOSED on egress policy: if a proxy is required but unset, we SKIP — never fall
 *   through to a direct fetch.
 * Callers inspect `response.ok` themselves; a completed fetch always returns status FETCHED.
 */

import * as Sentry from '@sentry/node';
import { getBreakerDecision, recordOutcome, domainKey } from './domainFetchState';
import { defaultRateLimiter } from './rateLimiter';

export type SafeFetchStatus =
  | 'FETCHED'
  | 'SKIPPED_BREAKER'
  | 'SKIPPED_NO_PROXY'
  | 'SKIPPED_CAP';

export interface SafeFetchOptions {
  /** When true, the request MUST route through the configured egress proxy or be skipped. */
  requireProxy?: boolean;
  headers?: Record<string, string>;
  method?: string;
  body?: any;
  /** Override the default 15s fetch timeout for callers with different SLAs. */
  timeoutMs?: number;
  /**
   * Domain breaker policy (2026-10-30). 'strict' (default, unchanged behaviour): any
   * 429/503/403/404 records a domain failure, and a self-imposed hourly-cap breach also
   * records one. 'tolerant': for multi-page aggregator sources (GarageSaleFinder) where a
   * single dead listing page or our own hourly cap must not cool the whole domain down.
   * See TOLERANT POLICY below.
   */
  breakerPolicy?: 'strict' | 'tolerant';
  /**
   * Tolerant policy only: the sub-area this request belongs to (e.g. a metro slug). Soft
   * failures only trip the domain breaker once they span several distinct scopes.
   */
  breakerScope?: string;
}

export interface SafeFetchResult {
  status: SafeFetchStatus;
  response?: Response;
}

/** Hard per-host request ceiling per rolling hour. Overridable via env. */
const CAP = Number(process.env.SCRAPER_HOST_CAP_PER_HOUR ?? 300);
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const FETCH_TIMEOUT_MS = 15_000;

// Architect decision 2026-08-26: cap enforcement below stays exactly as-is for every host
// (it's a real ban-avoidance protection) — only alert severity changes, and only for hosts
// confirmed harmless here. Confirmed via direct DB volume check (Sale.sourceName=
// 'GarageSaleFinder', last 10 days): healthy variable daily throughput with no downward
// trend, and the highest-volume day of the window was the same day the cap fired — the
// SKIPPED_CAP path is a self-healing soft-throttle on this source, not real data loss, so
// paging it as a daily 'warning' (Sentry issue 7619979445, firing ~daily since 2026-07-19)
// was false-incident noise. Add a host here ONLY after confirming the same way — do not
// preemptively add hosts that haven't been checked.
const KNOWN_SELF_HEALING_CAP_HOSTS = new Set<string>(['garagesalefinder.com']);

// ---------------------------------------------------------------------------
// TOLERANT POLICY (2026-10-30, GarageSaleFinder blank-harvest incident)
// ---------------------------------------------------------------------------
// On 2026-10-29 and 2026-10-30 the 06:00 UTC GarageSaleFinder run tripped the single
// shared garagesalefinder.com DomainFetchState row ~6 minutes in (the 10-30 trigger was
// our own SKIPPED_CAP at 06:05:52), which put the whole domain in a 6h COOLDOWN and
// skipped the remaining ~300 of 351 metros. Under 'tolerant':
//   - Real block signals (429, 503, 403) still record a domain failure immediately.
//   - Our own hourly-cap breach does NOT record a domain failure (the host did nothing
//     wrong; the in-process cap already stops further requests for the rest of the hour).
//   - Soft failures (404, other non-2xx, network errors/timeouts) only record a domain
//     failure once the CONSECUTIVE soft-failure streak reaches TOLERANT_MIN_ATTEMPTS
//     AND spans at least TOLERANT_MIN_DISTINCT_SCOPES distinct scopes (metros). Any 2xx
//     resets the streak. After a trip the streak restarts, so the floor applies again.
export const TOLERANT_MIN_ATTEMPTS = 10;
export const TOLERANT_MIN_DISTINCT_SCOPES = 3;

interface SoftStreak {
  count: number;
  scopes: Set<string>;
}
/** domainKey -> consecutive soft-failure streak (process-local). */
const softStreaks: Map<string, SoftStreak> = new Map();

/** Test-only: reset the process-local tolerant-policy and cap state. */
export function __resetSafeFetchStateForTests(): void {
  softStreaks.clear();
  hostCounters.clear();
}

/**
 * Record a soft failure under the tolerant policy. Returns true when the streak crossed
 * both floors, i.e. the caller must record a real domain failure now.
 */
export function noteSoftFailure(url: string, scope: string | undefined): boolean {
  const key = domainKey(url) ?? resolveHost(url) ?? url;
  const streak = softStreaks.get(key) ?? { count: 0, scopes: new Set<string>() };
  streak.count += 1;
  streak.scopes.add(scope || '(none)');
  softStreaks.set(key, streak);
  if (streak.count >= TOLERANT_MIN_ATTEMPTS && streak.scopes.size >= TOLERANT_MIN_DISTINCT_SCOPES) {
    softStreaks.delete(key);
    return true;
  }
  return false;
}

/** Reset the soft-failure streak for a domain (any 2xx). */
export function noteSoftSuccess(url: string): void {
  const key = domainKey(url) ?? resolveHost(url) ?? url;
  softStreaks.delete(key);
}

/** Module-level monitoring counter: host -> { count, windowStart }. */
const hostCounters: Map<string, { count: number; windowStart: number }> = new Map();

/** Resolve the lower-cased host from a URL; null when unparseable. */
function resolveHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Increment the rolling-hour counter for a host and return the post-increment count.
 * Resets the window when the previous window has elapsed.
 */
function bumpHostCounter(host: string): number {
  const now = Date.now();
  const entry = hostCounters.get(host);
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    hostCounters.set(host, { count: 1, windowStart: now });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

/**
 * The single ban-safe egress wrapper. See module doc for the full pipeline.
 * Never throws on infra errors — returns a SafeFetchResult describing what happened.
 */
export async function safeFetch(
  url: string,
  opts: SafeFetchOptions = {}
): Promise<SafeFetchResult> {
  const host = resolveHost(url) ?? url;
  const tolerant = opts.breakerPolicy === 'tolerant';

  // 1) Circuit-breaker consult (fail open on infra error).
  try {
    const decision = await getBreakerDecision(url);
    if (decision === 'TERMINAL' || decision === 'THROTTLED') {
      return { status: 'SKIPPED_BREAKER' };
    }
  } catch (err) {
    console.warn(
      `[safeFetch] breaker read failed for ${host} (failing open):`,
      err instanceof Error ? err.message : String(err)
    );
  }

  // 2) Monitoring counter + hard hourly cap.
  const count = bumpHostCounter(host);
  if (count > CAP) {
    try {
      defaultRateLimiter.recordBackoff(host, 3600);
      // Tolerant: our own cap is not a host failure — never cool the domain down for it.
      if (!tolerant) await recordOutcome(url, false);
    } catch (err) {
      console.warn(
        `[safeFetch] cap-breach bookkeeping failed for ${host}:`,
        err instanceof Error ? err.message : String(err)
      );
    }
    if (KNOWN_SELF_HEALING_CAP_HOSTS.has(host)) {
      Sentry.captureMessage(
        `[egress-expected] host ${host} exceeded ${CAP} req/hr (confirmed self-healing — see 2026-08-26 architect decision above)`,
        'info'
      );
    } else {
      Sentry.captureMessage(
        `[egress] host ${host} exceeded ${CAP} req/hr`,
        'warning'
      );
    }
    return { status: 'SKIPPED_CAP' };
  }

  // 3) Per-host rate cap + jitter (jitter lives inside waitBeforeRequest).
  try {
    await defaultRateLimiter.waitBeforeRequest(host);
  } catch (err) {
    console.warn(
      `[safeFetch] rate-limiter wait failed for ${host} (proceeding):`,
      err instanceof Error ? err.message : String(err)
    );
  }

  // 4) Egress routing (fail closed when a proxy is required but unset).
  let fetchUrl = url;
  const fetchHeaders: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.requireProxy) {
    const proxyUrl = process.env.SCRAPER_PROXY_URL;
    const proxyToken = process.env.SCRAPER_PROXY_TOKEN;
    if (!proxyUrl || !proxyToken) {
      Sentry.captureMessage(
        `[egress] proxy required but unset — skipping ${host}`,
        'warning'
      );
      return { status: 'SKIPPED_NO_PROXY' };
    }
    fetchUrl = `${proxyUrl}/fetch?url=${encodeURIComponent(url)}`;
    fetchHeaders['Authorization'] = `Bearer ${proxyToken}`;
  }

  // Execute the fetch with a hard timeout (caller-overridable, defaults to 15s).
  let response: Response;
  try {
    response = await fetch(fetchUrl, {
      method: opts.method,
      headers: fetchHeaders,
      body: opts.body,
      signal: AbortSignal.timeout(opts.timeoutMs ?? FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    // Network error / timeout: a soft failure under the tolerant policy. Strict keeps the
    // historical behaviour (no bookkeeping). Either way the error propagates to the caller.
    if (tolerant && noteSoftFailure(url, opts.breakerScope)) {
      try {
        await recordOutcome(url, false);
      } catch {
        /* fail open */
      }
    }
    throw err;
  }

  // 5) Response handling + breaker bookkeeping (fail open on bookkeeping errors).
  try {
    if (response.status === 429 || response.status === 503) {
      const retryAfterRaw = response.headers.get('Retry-After');
      const retryAfterSeconds = retryAfterRaw ? parseInt(retryAfterRaw, 10) : NaN;
      const backoff =
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds
          : 3600;
      defaultRateLimiter.recordBackoff(host, backoff);
      if (tolerant) noteSoftSuccess(url); // the hard signal itself is recorded below
      await recordOutcome(url, false);
    } else if (response.status === 403) {
      if (tolerant) noteSoftSuccess(url);
      await recordOutcome(url, false);
    } else if (response.ok) {
      if (tolerant) noteSoftSuccess(url);
      await recordOutcome(url, true);
      defaultRateLimiter.clearBackoff(host);
    } else if (tolerant) {
      // 404 / other non-2xx: page-level, not proof the host is down.
      if (noteSoftFailure(url, opts.breakerScope)) await recordOutcome(url, false);
    } else if (response.status === 404) {
      await recordOutcome(url, false);
    }
  } catch (err) {
    console.warn(
      `[safeFetch] post-fetch bookkeeping failed for ${host} (ignoring):`,
      err instanceof Error ? err.message : String(err)
    );
  }

  return { status: 'FETCHED', response };
}
