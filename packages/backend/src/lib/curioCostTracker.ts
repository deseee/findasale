/**
 * curioCostTracker.ts -- Curio backend cost/rate governance (Phase 1)
 *
 * Enforces the Curio-specific cost/abuse caps from
 * claude_docs/feature-notes/curio-api-adr-2026-07-17.md. Mirrors the AI_DAILY_CALL_CAP /
 * isAICostCeilingExceeded pattern in lib/aiCostTracker.ts (same in-memory-backstop-on-Redis-
 * outage design: a per-process counter that ALWAYS increments so a single process can never
 * blow past a cap even if Redis is unavailable/lying) -- but this is a FULLY SEPARATE pool.
 * It never shares Redis keys or in-memory counters with the existing organizer AI_DAILY_CALL_CAP /
 * ai:tokens:YYYY-MM pool (that pool hit $0 once, S1122 -- Curio must never be able to do that
 * again, and must never be starved by/starve organizer AI usage either).
 *
 * Three independent dials, per the ADR's Cost Math (Patrick-approved, ~70% cut from the original
 * draft, 2026-07-17):
 *   - CURIO_DAILY_SCAN_CAP (default 3)        -- per-user scans/day
 *   - CURIO_GLOBAL_DAILY_SCAN_CAP (default 12) -- all users combined, scans/day
 *   - CURIO_MONTHLY_BUDGET_CEILING_USD (default $9.00) -- hard $ stop, derived as
 *     12/day * $0.025/scan-worst-case * 30 days
 *   - CURIO_DEGRADED_MODE_THRESHOLD_PCT (default 80) -- soft threshold (% of the GLOBAL daily
 *     pool used) after which remaining scans that day route to the cheaper degraded pipeline
 *     (getVisionLabelsDegraded() in cloudAIService.ts) instead of a hard 429.
 */

import { redis } from './redis';

// ── Env-driven caps (Patrick-approved 2026-07-17 revision) ────────────────────────────────────
export const CURIO_DAILY_SCAN_CAP = parseInt(process.env.CURIO_DAILY_SCAN_CAP || '3', 10);
export const CURIO_GLOBAL_DAILY_SCAN_CAP = parseInt(process.env.CURIO_GLOBAL_DAILY_SCAN_CAP || '12', 10);
export const CURIO_MONTHLY_BUDGET_CEILING_USD = parseFloat(process.env.CURIO_MONTHLY_BUDGET_CEILING_USD || '9.00');
export const CURIO_DEGRADED_MODE_THRESHOLD_PCT = parseInt(process.env.CURIO_DEGRADED_MODE_THRESHOLD_PCT || '80', 10);

// Per-scan cost estimates used ONLY for accounting into the monthly $ pool (trackCurioScan) --
// not a live per-call price. See ADR Cost Math for the sourced Google Vision / Anthropic Haiku
// per-unit pricing behind these numbers.
export const CURIO_FULL_SCAN_COST_ESTIMATE_USD = 0.025; // 3-photo worst case, Vision (3 features) + Haiku
export const CURIO_DEGRADED_SCAN_COST_PER_IMAGE_USD = 0.0015; // single Vision LABEL_DETECTION call, 1 image

// In-memory fallback store, mirrors aiCostTracker.ts's memoryFallback pattern.
const memoryFallback = new Map<string, number>();

function currentDayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function getCurioUserDayKey(userId: string): string {
  return `curio:scans:user:${userId}:${currentDayStr()}`;
}

function getCurioGlobalDayKey(): string {
  return `curio:scans:global:${currentDayStr()}`;
}

function getCurioMonthKey(): string {
  const now = new Date();
  return `curio:cost:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function secondsUntilNextDay(): number {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(1, Math.ceil((next.getTime() - now.getTime()) / 1000));
}

// Per-process in-memory backstop for the GLOBAL daily count -- same fail-safer pattern as
// aiCostTracker's aiCallMemCount: ALWAYS increments regardless of Redis health, so a Redis
// outage can never grant unlimited global Curio scans.
let curioGlobalDay = '';
let curioGlobalMemCount = 0;
function rollCurioGlobalDay(): void {
  const d = currentDayStr();
  if (curioGlobalDay !== d) {
    curioGlobalDay = d;
    curioGlobalMemCount = 0;
  }
}

async function readCount(key: string): Promise<number> {
  try {
    const raw = await redis.get(key);
    if (raw !== null) return parseInt(raw, 10);
  } catch {
    // fall through to memory fallback
  }
  return memoryFallback.get(key) ?? 0;
}

async function incrementCount(key: string): Promise<number> {
  const DAY_TTL_SECONDS = 2 * 24 * 60 * 60; // 2 days -- always outlives the day it counts
  const current = await readCount(key);
  const updated = current + 1;
  memoryFallback.set(key, updated);
  try {
    await redis.setex(key, DAY_TTL_SECONDS, String(updated));
  } catch {
    // Redis unavailable -- memory fallback above already updated.
  }
  return updated;
}

/**
 * Pre-flight check: is this user (and the platform-wide pool) still under today's Curio scan
 * caps? Checked BEFORE any Vision/Haiku/eBay call -- this is the primary abuse/cost breaker.
 * Global count is backstopped by curioGlobalMemCount so a Redis outage can never grant
 * unlimited global scans, mirroring aiCostTracker's isAIDailyCallCapAvailable() fail-safer.
 */
export async function isCurioScanAvailable(userId: string): Promise<{
  available: boolean;
  reason?: 'USER_DAILY_CAP' | 'GLOBAL_DAILY_CAP';
  retryAfterSeconds?: number;
}> {
  rollCurioGlobalDay();
  if (curioGlobalMemCount >= CURIO_GLOBAL_DAILY_SCAN_CAP) {
    return { available: false, reason: 'GLOBAL_DAILY_CAP', retryAfterSeconds: secondsUntilNextDay() };
  }
  const userCount = await readCount(getCurioUserDayKey(userId));
  if (userCount >= CURIO_DAILY_SCAN_CAP) {
    return { available: false, reason: 'USER_DAILY_CAP', retryAfterSeconds: secondsUntilNextDay() };
  }
  const globalCount = await readCount(getCurioGlobalDayKey());
  if (globalCount >= CURIO_GLOBAL_DAILY_SCAN_CAP) {
    return { available: false, reason: 'GLOBAL_DAILY_CAP', retryAfterSeconds: secondsUntilNextDay() };
  }
  return { available: true };
}

/**
 * Soft threshold: once CURIO_DEGRADED_MODE_THRESHOLD_PCT% of the GLOBAL daily pool is used,
 * remaining scans today should route to the cheaper degraded pipeline (Label-Detection-only,
 * no Haiku) instead of a hard 429. Checked by the controller (not the cap gate itself), since a
 * degraded scan is still an allowed scan -- it changes WHICH pipeline runs, not whether the
 * request is allowed through at all.
 */
export async function isCurioDegradedMode(): Promise<boolean> {
  rollCurioGlobalDay();
  const threshold = Math.floor((CURIO_DEGRADED_MODE_THRESHOLD_PCT / 100) * CURIO_GLOBAL_DAILY_SCAN_CAP);
  if (curioGlobalMemCount >= threshold) return true;
  const globalCount = await readCount(getCurioGlobalDayKey());
  return Math.max(globalCount, curioGlobalMemCount) >= threshold;
}

/**
 * Monthly $ hard stop -- separate Redis/memory pool from the existing organizer AI ceiling
 * (never touches the ai:tokens:YYYY-MM key). Stored as USD*10000 integer units to avoid float
 * drift across many increments (same integer-units pattern as aiCostTracker's Web
 * Detection/Grounding blocks). Fail-open on a Redis/read error -- consistent with
 * isAICostCeilingExceeded(), never blocks Curio entirely on a Redis outage; the daily scan caps
 * above are the fail-safer backstop in that case.
 */
export async function isCurioCostCeilingExceeded(): Promise<boolean> {
  try {
    const units = await readCount(getCurioMonthKey());
    const spentUsd = units / 10000;
    return spentUsd >= CURIO_MONTHLY_BUDGET_CEILING_USD;
  } catch {
    return false;
  }
}

/**
 * Records one completed Curio scan: increments the per-user daily count, the global daily count
 * (+ its in-memory backstop), and adds costUsd to the monthly $ pool. Call this ONCE per scan
 * request, AFTER the scan actually ran (any mode -- full/degraded/hard-cap), never before --
 * mirrors trackEbayPriceComps()/trackGroundingCall()'s "record after, not before" convention in
 * aiCostTracker.ts.
 */
export async function trackCurioScan(userId: string, costUsd: number): Promise<void> {
  rollCurioGlobalDay();
  curioGlobalMemCount += 1; // Redis-independent backstop -- ALWAYS increments
  await incrementCount(getCurioUserDayKey(userId));
  await incrementCount(getCurioGlobalDayKey());

  const monthKey = getCurioMonthKey();
  const safeCost = Number.isFinite(costUsd) && costUsd > 0 ? costUsd : 0;
  const currentUnits = await readCount(monthKey);
  const updatedUnits = currentUnits + Math.round(safeCost * 10000);
  memoryFallback.set(monthKey, updatedUnits);
  try {
    await redis.setex(monthKey, 35 * 24 * 60 * 60, String(updatedUnits)); // 35 days, mirrors aiCostTracker's REDIS_TTL_SECONDS
  } catch {
    // Redis unavailable -- memory fallback above already updated.
  }
}
