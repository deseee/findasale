/**
 * domainFetchState.ts — Per-domain circuit breaker for the website / sale-detail
 * re-fetch pipelines.
 *
 * BACKGROUND (2026-07-17 Railway abuse incident, STATE.md S1133):
 * Three nightly re-fetch pipelines (email discovery, organizer-website address, and
 * sale-detail enrichment) re-qualified permanently-dead third-party URLs forever because
 * a hard-failing URL was never marked as failed. The result was the same 403/404 domains
 * (bid13.com, etc.) being hammered every night. The existing crawlQueueManager breaker is
 * wired ONLY to the metro-loop queue and does not cover these re-fetchers.
 *
 * This module is a lightweight, DB-backed, per-registrable-domain circuit breaker built on
 * the Batch-0 `DomainFetchState` table:
 *   - shouldFetch(url)      -> may this domain be fetched right now?
 *   - recordOutcome(url, ok)-> record success/failure; escalate COOLDOWN -> TERMINAL after N.
 *   - isTerminal(url)       -> is this domain permanently/soft-blocked?
 *   - RunDedupGuard         -> in-run "fetch each domain at most once per run" guard.
 *
 * Policy: after each consecutive failure the domain enters COOLDOWN with exponential backoff
 * (6h, 12h, 24h, ... capped at 7d). After TERMINAL_THRESHOLD consecutive failures it becomes
 * TERMINAL and is never fetched again until the row is manually reset. A single success at
 * any point resets the domain to OK.
 *
 * All inputs accept either a full URL or a bare host/domain — they are normalised to the
 * registrable domain (the DomainFetchState primary key) via domainKey(). All DB paths are
 * wrapped in try/catch and FAIL OPEN on read errors (never hard-block the whole pipeline on a
 * transient DB blip) while FAILING SAFE on write errors (log + continue).
 */

import { prisma } from '../../lib/prisma';
import { isBlockedWebsiteDomain, registrableDomain } from '../../config/domainBlocklist';

// ---------------------------------------------------------------------------
// Policy knobs
// ---------------------------------------------------------------------------

/** Consecutive failures at which a domain becomes permanently TERMINAL. */
const TERMINAL_THRESHOLD = 5;
/** First cooldown window; doubles each subsequent failure. */
const COOLDOWN_BASE_MS = 6 * 60 * 60 * 1000; // 6 hours
/** Upper bound on the cooldown window. */
const COOLDOWN_MAX_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type DomainStatus =
  | 'OK'
  | 'COOLDOWN'
  | 'TERMINAL'
  | 'BLOCKED'
  | 'NONE'
  | 'UNKNOWN';

export interface OutcomeResult {
  status: DomainStatus;
  consecutiveFailures: number;
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise a URL or bare host to its registrable domain (the DomainFetchState @id).
 * Delegates to the canonical extractor in domainBlocklist and falls back to a self-contained
 * host parse. Returns null when there is nothing domain-like to extract. Never throws.
 */
export function domainKey(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const reg = registrableDomain(trimmed);
    if (reg) return reg;
  } catch {
    /* fall through to host parse */
  }

  try {
    const u = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const h = u.hostname.toLowerCase().replace(/^www\./, '');
    return h.includes('.') ? h : null;
  } catch {
    const h = trimmed.toLowerCase().replace(/^www\./, '');
    return h.includes('.') ? h : null;
  }
}

// ---------------------------------------------------------------------------
// Read side
// ---------------------------------------------------------------------------

/**
 * Return the current breaker status for a domain.
 * BLOCKED  = social/aggregator/mega-brand denylist (never an organizer's own site).
 * NONE     = no row yet (never attempted) -> treated as fetchable.
 * UNKNOWN  = unparseable input or a DB read error.
 */
export async function getDomainStatus(
  input: string | null | undefined
): Promise<DomainStatus> {
  if (!input) return 'UNKNOWN';
  if (isBlockedWebsiteDomain(input)) return 'BLOCKED';
  const key = domainKey(input);
  if (!key) return 'UNKNOWN';
  try {
    const state = await prisma.domainFetchState.findUnique({
      where: { registrableDomain: key },
    });
    if (!state) return 'NONE';
    return (state.status as DomainStatus) ?? 'NONE';
  } catch {
    return 'UNKNOWN';
  }
}

/**
 * True when a domain is permanently or denylist-blocked (TERMINAL or BLOCKED). Callers use
 * this to permanently mark the owning row (Organizer.websiteEnrichmentExhausted /
 * Sale.sourceUrlFetchFailedAt) so it stops re-qualifying for selection.
 */
export async function isTerminal(input: string | null | undefined): Promise<boolean> {
  const s = await getDomainStatus(input);
  return s === 'TERMINAL' || s === 'BLOCKED';
}

/**
 * May this domain be fetched right now?
 * - false for denylisted domains (aggregator/social/mega-brand).
 * - false for unparseable input.
 * - false while TERMINAL / BLOCKED, or while in an active COOLDOWN window.
 * - true when there is no row, the domain is OK, or the cooldown window has elapsed.
 * FAILS OPEN (returns true) on a DB read error so a transient blip never stalls a whole run.
 */
export async function shouldFetch(input: string | null | undefined): Promise<boolean> {
  if (!input) return false;
  if (isBlockedWebsiteDomain(input)) return false;
  const key = domainKey(input);
  if (!key) return false;
  try {
    const state = await prisma.domainFetchState.findUnique({
      where: { registrableDomain: key },
    });
    if (!state) return true;
    if (state.status === 'TERMINAL' || state.status === 'BLOCKED') return false;
    if (state.status === 'COOLDOWN') {
      if (state.nextEligibleAt && state.nextEligibleAt.getTime() > Date.now()) {
        return false;
      }
      return true;
    }
    return true; // OK
  } catch (err) {
    console.warn(
      `[domainFetchState] shouldFetch read failed for ${key} (failing open):`,
      err instanceof Error ? err.message : String(err)
    );
    return true;
  }
}

/**
 * STATE-ONLY breaker decision that IGNORES the aggregator/social denylist. Use this for
 * pipelines where aggregator hosts are LEGITIMATE fetch targets — e.g. the sale-detail
 * enrichment (ADR-075) whose designed source is estatesales.net, which sits on the website
 * denylist. Consults ONLY the DomainFetchState breaker + cooldown window.
 *   'FETCH'     -> allowed (no row, OK, or an elapsed cooldown window).
 *   'THROTTLED' -> inside an active COOLDOWN window; skip WITHOUT a permanent mark.
 *   'TERMINAL'  -> permanently dead; caller should permanently mark the owning row.
 * FAILS OPEN ('FETCH') on unparseable input or a DB read error.
 */
export async function getBreakerDecision(
  input: string | null | undefined
): Promise<'FETCH' | 'THROTTLED' | 'TERMINAL'> {
  const key = domainKey(input);
  if (!key) return 'FETCH';
  try {
    const state = await prisma.domainFetchState.findUnique({
      where: { registrableDomain: key },
    });
    if (!state) return 'FETCH';
    if (state.status === 'TERMINAL' || state.status === 'BLOCKED') return 'TERMINAL';
    if (state.status === 'COOLDOWN') {
      if (state.nextEligibleAt && state.nextEligibleAt.getTime() > Date.now()) {
        return 'THROTTLED';
      }
      return 'FETCH';
    }
    return 'FETCH'; // OK
  } catch (err) {
    console.warn(
      `[domainFetchState] getBreakerDecision read failed for ${key} (failing open):`,
      err instanceof Error ? err.message : String(err)
    );
    return 'FETCH';
  }
}

// ---------------------------------------------------------------------------
// Write side
// ---------------------------------------------------------------------------

/**
 * Record the outcome of a fetch attempt against a domain and update its breaker state.
 * ok=true  -> reset to OK, consecutiveFailures=0.
 * ok=false -> increment failures; COOLDOWN with exponential backoff, escalating to TERMINAL
 *             once TERMINAL_THRESHOLD consecutive failures is reached. TERMINAL is sticky.
 * Returns the resulting status so callers can permanently mark the owning row on TERMINAL.
 * FAILS SAFE (logs + returns UNKNOWN) on any DB write error.
 */
export async function recordOutcome(
  input: string | null | undefined,
  ok: boolean
): Promise<OutcomeResult> {
  const key = domainKey(input);
  if (!key) return { status: 'UNKNOWN', consecutiveFailures: 0 };
  const now = new Date();

  try {
    if (ok) {
      await prisma.domainFetchState.upsert({
        where: { registrableDomain: key },
        create: {
          registrableDomain: key,
          status: 'OK',
          consecutiveFailures: 0,
          lastOutcome: 'OK',
          lastAttemptAt: now,
          nextEligibleAt: null,
        },
        update: {
          status: 'OK',
          consecutiveFailures: 0,
          lastOutcome: 'OK',
          lastAttemptAt: now,
          nextEligibleAt: null,
        },
      });
      return { status: 'OK', consecutiveFailures: 0 };
    }

    const existing = await prisma.domainFetchState.findUnique({
      where: { registrableDomain: key },
    });

    // TERMINAL is sticky — record the attempt timestamp but do not "un-terminal".
    if (existing && existing.status === 'TERMINAL') {
      await prisma.domainFetchState.update({
        where: { registrableDomain: key },
        data: { lastOutcome: 'FAIL', lastAttemptAt: now },
      });
      return { status: 'TERMINAL', consecutiveFailures: existing.consecutiveFailures };
    }

    const failures = (existing?.consecutiveFailures ?? 0) + 1;
    let status: DomainStatus;
    let nextEligibleAt: Date | null;

    if (failures >= TERMINAL_THRESHOLD) {
      status = 'TERMINAL';
      nextEligibleAt = null;
    } else {
      status = 'COOLDOWN';
      const backoff = Math.min(
        COOLDOWN_BASE_MS * Math.pow(2, failures - 1),
        COOLDOWN_MAX_MS
      );
      nextEligibleAt = new Date(now.getTime() + backoff);
    }

    await prisma.domainFetchState.upsert({
      where: { registrableDomain: key },
      create: {
        registrableDomain: key,
        status,
        consecutiveFailures: failures,
        lastOutcome: 'FAIL',
        lastAttemptAt: now,
        nextEligibleAt,
      },
      update: {
        status,
        consecutiveFailures: failures,
        lastOutcome: 'FAIL',
        lastAttemptAt: now,
        nextEligibleAt,
      },
    });

    return { status, consecutiveFailures: failures };
  } catch (err) {
    console.warn(
      `[domainFetchState] recordOutcome write failed for ${key}:`,
      err instanceof Error ? err.message : String(err)
    );
    return { status: 'UNKNOWN', consecutiveFailures: 0 };
  }
}

// ---------------------------------------------------------------------------
// In-run per-domain de-dup guard
// ---------------------------------------------------------------------------

/**
 * Ensures a given registrable domain is fetched at most once per run. Callers create one
 * guard per batch/run and call firstTime(url) before fetching: it returns true exactly once
 * per domain (the first time), false on repeats or unparseable input.
 *
 * NOTE: de-dup is by REGISTRABLE DOMAIN, so it is appropriate only for pipelines where the
 * fetch target IS the organizer's own domain (email discovery, organizer-website address).
 * It must NOT be used for the sale-detail pipeline, where many distinct sale pages legitimately
 * share one aggregator host.
 */
export class RunDedupGuard {
  private readonly seen = new Set<string>();

  /** True the first time a domain is seen this run; false on repeats or unparseable input. */
  firstTime(input: string | null | undefined): boolean {
    const key = domainKey(input);
    if (!key) return false;
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    return true;
  }

  /** Has this domain already been seen this run? */
  has(input: string | null | undefined): boolean {
    const key = domainKey(input);
    return key ? this.seen.has(key) : false;
  }

  get size(): number {
    return this.seen.size;
  }
}

/** Factory for a fresh per-run de-dup guard. */
export function createRunDedupGuard(): RunDedupGuard {
  return new RunDedupGuard();
}
