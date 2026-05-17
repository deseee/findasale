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

const ANTHROPIC_COST_PER_M_TOKENS = 3.0; // $3.00 per 1M input tokens
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
