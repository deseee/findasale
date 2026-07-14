/**
 * aiCostTracker.ts — #104 AI Cost Ceiling + Usage Tracking
 *
 * Tracks monthly Claude/AI API token usage and enforces a configurable cost ceiling.
 * Persists monthly token counts in Redis (key: ai:tokens:YYYY-MM, TTL: 35 days).
 * Falls back to in-memory if Redis is unavailable — never blocks AI calls on Redis outage.
 *
 * Key format: ai:tokens:YYYY-MM (reset monthly via TTL)
 * Cost calculation: (tokens / 1M) * $3.00 per 1M tokens (Claude Haiku pricing)
 */

import { redis } from './redis';
import { prisma } from './prisma';

export const ANTHROPIC_COST_PER_M_TOKENS = 3.0; // $3.00 per 1M input tokens
const DEFAULT_CEILING_USD = 50; // Default monthly ceiling
const CEILING_USD = parseFloat(process.env.AI_COST_CEILING_USD || DEFAULT_CEILING_USD.toString());
const REDIS_TTL_SECONDS = 35 * 24 * 60 * 60; // 35 days — auto-expires safely after month end

// In-memory fallback when Redis is unavailable
const memoryFallback = new Map<string, number>();

/**
 * Generate current month key (YYYY-MM)
 */
function getMonthKey(): string {
  const now = new Date();
  return `ai:tokens:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Get current token count from Redis, with in-memory fallback.
 */
async function getTokenCount(key: string): Promise<number> {
  try {
    const raw = await redis.get(key);
    if (raw !== null) return parseFloat(raw);
  } catch {
    // Redis unavailable — fall through to memory
  }
  return memoryFallback.get(key) ?? 0;
}

/**
 * Persist updated token count to Redis, with in-memory fallback.
 */
async function setTokenCount(key: string, count: number): Promise<void> {
  memoryFallback.set(key, count); // Always update memory so in-session ceiling works
  try {
    await redis.setex(key, REDIS_TTL_SECONDS, String(count));
  } catch {
    // Redis write failed — memory fallback is already set, continue
  }
}

/**
 * Track token usage from a Claude API call.
 * Updates monthly count in Redis and estimates cost.
 *
 * @param estimatedTokens Number of tokens consumed (input + output)
 * @returns true if under ceiling, false if ceiling exceeded
 */
export async function trackAITokens(estimatedTokens: number): Promise<boolean> {
  const key = getMonthKey();
  const current = await getTokenCount(key);
  const updated = current + estimatedTokens;
  await setTokenCount(key, updated);

  const estimatedCost = (updated / 1_000_000) * ANTHROPIC_COST_PER_M_TOKENS;
  const isUnderCeiling = estimatedCost <= CEILING_USD;

  if (!isUnderCeiling) {
    console.warn(
      `[AI_COST_CEILING_WARNING] Monthly AI cost ($${estimatedCost.toFixed(2)}) exceeds ceiling ($${CEILING_USD}). ` +
        `${updated} tokens used this month. Consider degrading gracefully or increasing ceiling.`
    );
  }

  return isUnderCeiling;
}

/**
 * Per-feature AI cost attribution — writes to the existing ApiUsageLog table
 * (added S487, 2026-04-16) alongside whatever ceiling-tracking call already ran.
 * Additive only: never gates or blocks a call, never replaces trackAITokens/
 * trackVisionCall/trackWebDetectionCall/trackGroundingCall — always called
 * next to one of those, never instead of it.
 * See claude_docs/feature-notes/adr-ai-cost-attribution-2026-07-12.md.
 *
 * @param service Feature tag, e.g. "anthropic:listing_enrichment" — see ADR for the vocabulary.
 * @param costUsd Estimated dollar cost of this call (or batch of `calls`).
 * @param calls Number of calls this write represents (default 1).
 */
export async function recordApiUsage(service: string, costUsd: number, calls: number = 1): Promise<void> {
  try {
    const dateKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD, UTC
    // Do NOT Math.round() to a whole cent here — a single Haiku call is typically
    // well under $0.01 (e.g. ~0.19 cents), so rounding per-call to an integer before
    // accumulating silently threw away nearly all recorded cost (every row ended up
    // estimatedCostCents = 0 despite correct callCount). Round to 4 decimal places
    // instead, just to avoid floating-point noise accumulating over thousands of
    // increments — never to a whole integer. See migration
    // 20260714120000_widen_apiusagelog_cost_precision + schema.prisma Float column.
    const safeCostCents = Number.isFinite(costUsd) ? Math.round(costUsd * 100 * 10000) / 10000 : 0;
    await prisma.apiUsageLog.upsert({
      where: { service_dateKey: { service, dateKey } },
      create: { service, dateKey, callCount: calls, estimatedCostCents: safeCostCents },
      update: {
        callCount: { increment: calls },
        estimatedCostCents: { increment: safeCostCents },
      },
    });
  } catch (err) {
    // Fail open — logging usage must never block or fail the underlying AI call.
    console.warn('[recordApiUsage] Failed to write ApiUsageLog row:', (err as Error)?.message || err);
  }
}

/**
 * Check if monthly AI cost is at or above ceiling.
 * Fail-open: returns false (not exceeded) if Redis is unavailable.
 */
export async function isAICostCeilingExceeded(): Promise<boolean> {
  const key = getMonthKey();
  try {
    const count = await getTokenCount(key);
    const estimatedCost = (count / 1_000_000) * ANTHROPIC_COST_PER_M_TOKENS;
    return estimatedCost >= CEILING_USD;
  } catch {
    // Fail open — don't block AI calls when cost tracker is unavailable
    return false;
  }
}

/**
 * Get current month's AI token usage and estimated cost.
 */
export async function getMonthlyAICost(): Promise<{
  monthKey: string;
  tokensUsed: number;
  estimatedCost: number;
  ceiling: number;
}> {
  const key = getMonthKey();
  const tokensUsed = await getTokenCount(key);
  const estimatedCost = (tokensUsed / 1_000_000) * ANTHROPIC_COST_PER_M_TOKENS;
  const monthKey = key.replace('ai:tokens:', '');
  return { monthKey, tokensUsed, estimatedCost, ceiling: CEILING_USD };
}

/**
 * Reset current month's token count (admin use only).
 */
export async function resetMonthlyAICost(): Promise<void> {
  const key = getMonthKey();
  memoryFallback.delete(key);
  try {
    await redis.del(key);
  } catch {
    // Best-effort
  }
  console.log(`[AI Cost Tracker] Reset token count for month ${key}`);
}

/**
 * No-op: Redis TTL handles cleanup automatically.
 * Kept for backward compatibility with existing callers.
 */
export function pruneOldCostRecords(): void {
  // Redis TTL (35 days) handles expiry — no manual cleanup needed
}

/**
 * Track a Google Vision API call for unified cost ceiling enforcement.
 *
 * Google Vision pricing (combined features: LABEL + OBJECT + TEXT):
 *   ~$1.50 per 1,000 images = $0.0015 per image
 * Converted to Anthropic-equivalent tokens so the same $50 ceiling applies.
 *
 * @param imageCount Number of images sent in this Vision call (default 1)
 */
export async function trackVisionCall(imageCount: number = 1): Promise<void> {
  // Google Vision combined-feature cost per image (~$0.0015)
  const GOOGLE_VISION_COST_PER_IMAGE = 0.0015;
  const visionCostUsd = imageCount * GOOGLE_VISION_COST_PER_IMAGE;
  // Convert to Anthropic-equivalent token units so the shared $50 ceiling counts Vision spend
  const equivalentTokens = Math.round((visionCostUsd / ANTHROPIC_COST_PER_M_TOKENS) * 1_000_000);
  await trackAITokens(equivalentTokens);
  await recordApiUsage('google_vision:photo_tagging', visionCostUsd);
}


/**
 * Estimate tokens for Claude request.
 * Formula: rough estimate based on input + expected output.
 * Claude Haiku: ~100k input tokens per sec, typical responses 50–400 tokens.
 *
 * For image analysis: ~1000 tokens for image + 500 tokens typical response
 * For text prompts: prompt length + 200 (typical response)
 */
export function estimateTokensForRequest(inputText: string, hasImage: boolean = false): number {
  // Rough approximation: ~4 chars = 1 token
  const textTokens = Math.ceil(inputText.length / 4);

  let imageTokens = 0;
  if (hasImage) {
    imageTokens = 1000; // Rough estimate for image encoding
  }

  const responseTokens = 300; // Conservative estimate for typical response
  return textTokens + imageTokens + responseTokens;
}


// ── Web Detection: dedicated hard-gating (ADR-web-detection-hard-gating-2026-07-01) ─────────
// Deliberately SEPARATE from the Anthropic/Vision ceiling above. Web Detection is priced at
// $3.50/1,000 units (vs ~$1.50/1,000 for the existing Label/Object/Text combo — confirmed
// cloud.google.com/vision/pricing 2026-07-01), and this is a fresh Google API surface after
// the May 2026 Places API billing incident — it gets its own budget, its own daily cap, and its
// own kill switch rather than sharing the general $50 ceiling.

const WEB_DETECTION_COST_PER_1000 = 3.5; // $3.50 per 1,000 units, confirmed cloud.google.com/vision/pricing
const WEB_DETECTION_CEILING_USD = parseFloat(process.env.WEB_DETECTION_COST_CEILING_USD || '5');
const WEB_DETECTION_DAILY_CAP = parseInt(process.env.WEB_DETECTION_DAILY_CAP || '200', 10);

function getWebDetectionMonthKey(): string {
  const now = new Date();
  return `webdetection:cost:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getWebDetectionDayKey(): string {
  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `webdetection:calls:${day}`;
}

/**
 * Layer 0 — kill switch. Mirrors bulkEmailEnabled() in utils/bulkEmailGate.ts exactly.
 * Default OFF — must be explicitly set to 'true' in Railway before Web Detection ever fires.
 */
export function webDetectionEnabled(): boolean {
  return process.env.WEB_DETECTION_ENABLED === 'true';
}

/**
 * Layer 1 — dedicated pre-flight cost ceiling for Web Detection specifically.
 * MUST be called and checked BEFORE the Vision API request fires, not after — the existing
 * getVisionLabels() only tracks cost post-hoc (see trackVisionCall call site), which is a real
 * gap this feature does not inherit.
 */
export async function isWebDetectionCeilingExceeded(): Promise<boolean> {
  const key = getWebDetectionMonthKey();
  try {
    const count = await getTokenCount(key); // reuses existing Redis/in-memory helper — value here is USD*1000, see trackWebDetectionCall
    const estimatedCost = count / 1000;
    return estimatedCost >= WEB_DETECTION_CEILING_USD;
  } catch {
    return false; // fail open — consistent with isAICostCeilingExceeded, never blocks on Redis outage
  }
}

/**
 * Layer 2 — daily hard call-count cap. Pure bug-catcher: at current FindA.Sale volume this is
 * never remotely approached by real usage. Exists to stop a loop/retry bug from running up
 * hundreds of calls in a single day before anyone notices — same failure shape as the May 2026
 * Places API cron incident.
 * @returns true if under the daily cap (safe to proceed), false if the cap is hit.
 */
export async function isWebDetectionDailyCapAvailable(): Promise<boolean> {
  const key = getWebDetectionDayKey();
  try {
    const raw = await redis.get(key);
    const count = raw !== null ? parseInt(raw, 10) : (memoryFallback.get(key) ?? 0);
    return count < WEB_DETECTION_DAILY_CAP;
  } catch {
    const count = memoryFallback.get(key) ?? 0;
    return count < WEB_DETECTION_DAILY_CAP;
  }
}

/**
 * Records one Web Detection call for both the monthly cost ceiling and the daily cap.
 * Call this immediately after a successful Web Detection request.
 */
export async function trackWebDetectionCall(): Promise<void> {
  // Monthly cost tracking (stored as USD*1000 integer to keep the same string-count storage shape
  // as the rest of this file, avoids float-precision drift across many increments).
  const monthKey = getWebDetectionMonthKey();
  const currentCostUnits = await getTokenCount(monthKey);
  await setTokenCount(monthKey, currentCostUnits + WEB_DETECTION_COST_PER_1000);
  await recordApiUsage('google_vision:web_detection', WEB_DETECTION_COST_PER_1000 / 1000);

  // Daily call count
  const dayKey = getWebDetectionDayKey();
  const DAY_TTL_SECONDS = 2 * 24 * 60 * 60; // 2 days — auto-expires, always outlives the day it counts
  try {
    const raw = await redis.get(dayKey);
    const current = raw !== null ? parseInt(raw, 10) : 0;
    const updated = current + 1;
    memoryFallback.set(dayKey, updated);
    await redis.setex(dayKey, DAY_TTL_SECONDS, String(updated));
  } catch {
    const current = memoryFallback.get(dayKey) ?? 0;
    memoryFallback.set(dayKey, current + 1);
  }
}

/**
 * Layer 5 — visibility. Same shape as getMonthlyAICost(), surfaced separately in /admin so Web
 * Detection spend is never a surprise-bill-shaped blind spot again.
 */
export async function getMonthlyWebDetectionCost(): Promise<{
  monthKey: string;
  callsThisMonth: number;
  estimatedCost: number;
  ceiling: number;
  dailyCapRemaining: number;
  enabled: boolean;
}> {
  const key = getWebDetectionMonthKey();
  const costUnits = await getTokenCount(key);
  const estimatedCost = costUnits / 1000;
  const callsThisMonth = Math.round(costUnits / WEB_DETECTION_COST_PER_1000);
  const monthKey = key.replace('webdetection:cost:', '');

  const dayKey = getWebDetectionDayKey();
  let dailyCount = 0;
  try {
    const raw = await redis.get(dayKey);
    dailyCount = raw !== null ? parseInt(raw, 10) : (memoryFallback.get(dayKey) ?? 0);
  } catch {
    dailyCount = memoryFallback.get(dayKey) ?? 0;
  }

  return {
    monthKey,
    callsThisMonth,
    estimatedCost,
    ceiling: WEB_DETECTION_CEILING_USD,
    dailyCapRemaining: Math.max(0, WEB_DETECTION_DAILY_CAP - dailyCount),
    enabled: webDetectionEnabled(),
  };
}


// ── eBay searchByImage: daily quota-protection cap (ADR-ebay-searchbyimage-tagging-2026-07-02) ──
// searchByImage is FREE — it uses the client-credentials Browse quota FindA.Sale already consumes
// for price comps, so there is deliberately NO dollar ceiling here. The only breaker is a daily
// CALL cap: it stops a batch-upload spike or a loop/retry bug from starving the shared ~5k/day
// Browse quota that price comps also draw from. Kill switch is default OFF, same posture as
// webDetectionEnabled() above.
const EBAY_IMAGE_SEARCH_DAILY_CAP = parseInt(process.env.EBAY_IMAGE_SEARCH_DAILY_CAP || '500', 10);

function getEbayImageSearchDayKey(): string {
  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `ebayimagesearch:calls:${day}`;
}

/**
 * Kill switch. Default OFF — must be explicitly set to 'true' in Railway before the eBay
 * image-search call ever fires. Mirrors webDetectionEnabled().
 */
export function ebayImageSearchEnabled(): boolean {
  return process.env.EBAY_IMAGE_SEARCH_ENABLED === 'true';
}

/**
 * Daily hard call-count cap. @returns true if under the cap (safe to proceed), false if hit.
 */
export async function canCallEbayImageSearch(): Promise<boolean> {
  const key = getEbayImageSearchDayKey();
  try {
    const raw = await redis.get(key);
    const count = raw !== null ? parseInt(raw, 10) : (memoryFallback.get(key) ?? 0);
    return count < EBAY_IMAGE_SEARCH_DAILY_CAP;
  } catch {
    const count = memoryFallback.get(key) ?? 0;
    return count < EBAY_IMAGE_SEARCH_DAILY_CAP;
  }
}

/**
 * Records one successful searchByImage call for the daily cap. Call immediately after a
 * successful, non-empty eBay response.
 */
export async function trackEbayImageSearchCall(): Promise<void> {
  const dayKey = getEbayImageSearchDayKey();
  const DAY_TTL_SECONDS = 2 * 24 * 60 * 60; // 2 days — auto-expires, always outlives the day it counts
  try {
    const raw = await redis.get(dayKey);
    const current = raw !== null ? parseInt(raw, 10) : 0;
    const updated = current + 1;
    memoryFallback.set(dayKey, updated);
    await redis.setex(dayKey, DAY_TTL_SECONDS, String(updated));
  } catch {
    const current = memoryFallback.get(dayKey) ?? 0;
    memoryFallback.set(dayKey, current + 1);
  }
}

/**
 * Visibility for /admin/ai-usage. No cost fields — the call is free; only quota usage matters.
 */
export async function getEbayImageSearchUsage(): Promise<{
  enabled: boolean;
  callsToday: number;
  dailyCapRemaining: number;
  dailyCap: number;
}> {
  const dayKey = getEbayImageSearchDayKey();
  let callsToday = 0;
  try {
    const raw = await redis.get(dayKey);
    callsToday = raw !== null ? parseInt(raw, 10) : (memoryFallback.get(dayKey) ?? 0);
  } catch {
    callsToday = memoryFallback.get(dayKey) ?? 0;
  }
  return {
    enabled: ebayImageSearchEnabled(),
    callsToday,
    dailyCapRemaining: Math.max(0, EBAY_IMAGE_SEARCH_DAILY_CAP - callsToday),
    dailyCap: EBAY_IMAGE_SEARCH_DAILY_CAP,
  };
}
// ── Grounded Identity: dedicated cost-control block (ADR grounded-identification-production-2026-07-02) ──
// Mirrors the Web Detection hard-gating pattern above. Grounding fans out to paid OpenRouter
// models (perplexity/sonar, gemini/gpt visual :online, sonar-pro on escalation), so it gets its
// OWN monthly $ ceiling, its OWN daily call cap, its OWN master + sub kill switches, and its OWN
// rollout percentage — all env-driven so cost can be dialed from Railway with no deploy. With the
// master switch OFF (the default) NOTHING here ever fires and the pipeline is byte-for-byte
// unchanged (Phase 0).

const GROUNDING_COST_CEILING_USD = parseFloat(process.env.GROUNDING_COST_CEILING_USD || '40');
const GROUNDING_DAILY_CAP = parseInt(process.env.GROUNDING_DAILY_CAP || '1000', 10);

function getGroundingMonthKey(): string {
  const now = new Date();
  return `grounding:cost:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getGroundingDayKey(): string {
  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `grounding:calls:${day}`;
}

/**
 * Layer 0 — MASTER kill switch. Default OFF — must be explicitly 'true' in Railway before any
 * grounding call ever fires. Mirrors webDetectionEnabled().
 */
export function groundingEnabled(): boolean {
  return process.env.GROUNDING_ENABLED === 'true';
}

/**
 * Independent sub-switches. Each DEFAULTS to following the master switch (so flipping the master
 * on turns both on), but can be independently forced off by setting the sub var to 'false', or
 * independently forced on by setting it to 'true'.
 */
export function groundingTextEnabled(): boolean {
  const v = process.env.GROUNDING_TEXT_ENABLED;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return groundingEnabled();
}

export function groundingVisualEnabled(): boolean {
  const v = process.env.GROUNDING_VISUAL_ENABLED;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return groundingEnabled();
}

/**
 * Rollout percentage (0–100). Only this % of eligible items actually run grounding. Default 0 —
 * so even with the master switch flipped on, nothing runs until the rollout is dialed up. The
 * caller passes a stable-ish random draw (Math.random()*100) and we compare against the pct.
 */
export function groundingRolloutPct(): number {
  const n = parseInt(process.env.GROUNDING_ROLLOUT_PCT || '0', 10);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/** Per-item spend ceiling — the orchestrator aborts remaining calls for an item once exceeded. */
export function groundingPerItemCeilingUsd(): number {
  const n = parseFloat(process.env.GROUNDING_PER_ITEM_COST_CEILING_USD || '0.08');
  return Number.isNaN(n) ? 0.08 : n;
}

/**
 * Layer 1 — dedicated PRE-FLIGHT monthly cost ceiling. Checked BEFORE any paid grounding call
 * fires. Fail-open on Redis outage (consistent with isAICostCeilingExceeded / isWebDetectionCeilingExceeded).
 */
export async function isGroundingCeilingExceeded(): Promise<boolean> {
  const key = getGroundingMonthKey();
  try {
    const costUnits = await getTokenCount(key); // stored as USD*1000 integer units, see trackGroundingCall
    const estimatedCost = costUnits / 1000;
    return estimatedCost >= GROUNDING_COST_CEILING_USD;
  } catch {
    return false;
  }
}

/**
 * Layer 2 — daily hard call-count cap. @returns true if under the cap (safe to proceed), false if hit.
 */
export async function isGroundingDailyCapAvailable(): Promise<boolean> {
  const key = getGroundingDayKey();
  try {
    const raw = await redis.get(key);
    const count = raw !== null ? parseInt(raw, 10) : (memoryFallback.get(key) ?? 0);
    return count < GROUNDING_DAILY_CAP;
  } catch {
    const count = memoryFallback.get(key) ?? 0;
    return count < GROUNDING_DAILY_CAP;
  }
}

/**
 * Records one grounding model call: adds its actual $ cost to the monthly ceiling and increments
 * the daily call count. Call after each paid grounding model call (best-effort cost estimate).
 * @param costUsd estimated dollar cost of the single call just made.
 */
export async function trackGroundingCall(costUsd: number): Promise<void> {
  const safeCost = Number.isFinite(costUsd) && costUsd > 0 ? costUsd : 0;

  // Monthly cost (stored as USD*1000 integer units — same string-count storage shape as the rest
  // of this file, avoids float drift across many increments).
  const monthKey = getGroundingMonthKey();
  const currentCostUnits = await getTokenCount(monthKey);
  await setTokenCount(monthKey, currentCostUnits + safeCost * 1000);
  await recordApiUsage('grounding:openrouter', safeCost);

  // Daily call count
  const dayKey = getGroundingDayKey();
  const DAY_TTL_SECONDS = 2 * 24 * 60 * 60; // 2 days — auto-expires, always outlives the day it counts
  try {
    const raw = await redis.get(dayKey);
    const current = raw !== null ? parseInt(raw, 10) : 0;
    const updated = current + 1;
    memoryFallback.set(dayKey, updated);
    await redis.setex(dayKey, DAY_TTL_SECONDS, String(updated));
  } catch {
    const current = memoryFallback.get(dayKey) ?? 0;
    memoryFallback.set(dayKey, current + 1);
  }
}

/**
 * Visibility for /admin/ai-usage — same shape family as getMonthlyWebDetectionCost().
 */
export async function getMonthlyGroundingCost(): Promise<{
  monthKey: string;
  estimatedCost: number;
  ceiling: number;
  dailyCap: number;
  dailyCapRemaining: number;
  rolloutPct: number;
  enabled: boolean;
  textEnabled: boolean;
  visualEnabled: boolean;
}> {
  const key = getGroundingMonthKey();
  const costUnits = await getTokenCount(key);
  const estimatedCost = costUnits / 1000;
  const monthKey = key.replace('grounding:cost:', '');

  const dayKey = getGroundingDayKey();
  let dailyCount = 0;
  try {
    const raw = await redis.get(dayKey);
    dailyCount = raw !== null ? parseInt(raw, 10) : (memoryFallback.get(dayKey) ?? 0);
  } catch {
    dailyCount = memoryFallback.get(dayKey) ?? 0;
  }

  return {
    monthKey,
    estimatedCost,
    ceiling: GROUNDING_COST_CEILING_USD,
    dailyCap: GROUNDING_DAILY_CAP,
    dailyCapRemaining: Math.max(0, GROUNDING_DAILY_CAP - dailyCount),
    rolloutPct: groundingRolloutPct(),
    enabled: groundingEnabled(),
    textEnabled: groundingTextEnabled(),
    visualEnabled: groundingVisualEnabled(),
  };
}
