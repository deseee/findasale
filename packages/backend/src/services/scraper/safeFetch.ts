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
import { getBreakerDecision, recordOutcome } from './domainFetchState';
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
}

export interface SafeFetchResult {
  status: SafeFetchStatus;
  response?: Response;
}

/** Hard per-host request ceiling per rolling hour. Overridable via env. */
const CAP = Number(process.env.SCRAPER_HOST_CAP_PER_HOUR ?? 300);
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const FETCH_TIMEOUT_MS = 15_000;

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
      await recordOutcome(url, false);
    } catch (err) {
      console.warn(
        `[safeFetch] cap-breach bookkeeping failed for ${host}:`,
        err instanceof Error ? err.message : String(err)
      );
    }
    Sentry.captureMessage(
      `[egress] host ${host} exceeded ${CAP} req/hr`,
      'warning'
    );
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
  const response = await fetch(fetchUrl, {
    method: opts.method,
    headers: fetchHeaders,
    body: opts.body,
    signal: AbortSignal.timeout(opts.timeoutMs ?? FETCH_TIMEOUT_MS),
  });

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
      await recordOutcome(url, false);
    } else if (response.status === 403 || response.status === 404) {
      await recordOutcome(url, false);
    } else if (response.ok) {
      await recordOutcome(url, true);
      defaultRateLimiter.clearBackoff(host);
    }
  } catch (err) {
    console.warn(
      `[safeFetch] post-fetch bookkeeping failed for ${host} (ignoring):`,
      err instanceof Error ? err.message : String(err)
    );
  }

  return { status: 'FETCHED', response };
}
