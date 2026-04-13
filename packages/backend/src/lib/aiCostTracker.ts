/**
 * aiCostTracker.ts — #104 AI Cost Ceiling + Usage Tracking
 *
 * Tracks monthly Claude/AI API token usage and enforces a configurable cost ceiling.
 * Uses in-memory storage (compatible with the existing redis.ts TTL cache).
 *
 * When cost exceeds threshold, logs warning and can optionally degrade gracefully
 * (return cached/simplified response instead of calling Claude).
 *
 * Key format: ai:tokens:YYYY-MM (reset monthly)
 * Cost calculation: (tokens / 1M) * $3.00 per 1M tokens (Claude Haiku 3 pricing)
 */

const ANTHROPIC_COST_PER_M_TOKENS = 3.0; // $3.00 per 1M input tokens
const DEFAULT_CEILING_USD = 50; // Default monthly ceiling
const CEILING_USD = parseFloat(process.env.AI_COST_CEILING_USD || DEFAULT_CEILING_USD.toString());

interface CostRecord {
  monthKey: string;
  tokensUsed: number;
  estimatedCost: number;
  lastUpdated: Date;
}

// In-memory store for monthly token counts
const monthlyCostStore = new Map<string, CostRecord>();

/**
 * Generate current month key (YYYY-MM)
 */
function getMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Get or initialize the cost record for the current month
 */
function getCostRecord(): CostRecord {
  const monthKey = getMonthKey();
  if (!monthlyCostStore.has(monthKey)) {
    monthlyCostStore.set(monthKey, {
      monthKey,
      tokensUsed: 0,
      estimatedCost: 0,
      lastUpdated: new Date(),
    });
  }
  return monthlyCostStore.get(monthKey)!;
}

/**
 * Track token usage from a Claude API call
 * Estimates tokens used and updates monthly cost
 *
 * @param estimatedTokens Number of tokens consumed (input + output)
 * @returns true if under ceiling, false if ceiling exceeded
 */
export function trackAITokens(estimatedTokens: number): boolean {
  const record = getCostRecord();
  record.tokensUsed += estimatedTokens;
  record.estimatedCost = (record.tokensUsed / 1_000_000) * ANTHROPIC_COST_PER_M_TOKENS;
  record.lastUpdated = new Date();

  const isUnderCeiling = record.estimatedCost <= CEILING_USD;

  if (!isUnderCeiling) {
    console.warn(
      `[AI_COST_CEILING_WARNING] Monthly AI cost ($${record.estimatedCost.toFixed(2)}) exceeds ceiling ($${CEILING_USD}). ` +
        `${record.tokensUsed} tokens used this month. Consider degrading gracefully or increasing ceiling.`
    );
  }

  return isUnderCeiling;
}

/**
 * Check if monthly AI cost is at or above ceiling
 * Returns true if ceiling is exceeded
 */
export function isAICostCeilingExceeded(): boolean {
  const record = getCostRecord();
  return record.estimatedCost >= CEILING_USD;
}

/**
 * Get current month's AI token usage and estimated cost
 */
export function getMonthlyAICost(): { monthKey: string; tokensUsed: number; estimatedCost: number; ceiling: number } {
  const record = getCostRecord();
  return {
    monthKey: record.monthKey,
    tokensUsed: record.tokensUsed,
    estimatedCost: record.estimatedCost,
    ceiling: CEILING_USD,
  };
}

/**
 * Reset current month's token count (admin use only)
 */
export function resetMonthlyAICost(): void {
  const monthKey = getMonthKey();
  monthlyCostStore.delete(monthKey);
  console.log(`[AI Cost Tracker] Reset token count for month ${monthKey}`);
}

/**
 * Clean up old month records (keep last 3 months only)
 * Call this periodically to prevent memory buildup
 */
export function pruneOldCostRecords(): void {
  const now = new Date();
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  for (const [monthKey] of monthlyCostStore.entries()) {
    // Parse monthKey (YYYY-MM format)
    const [year, month] = monthKey.split('-').map(Number);
    const recordDate = new Date(year, month - 1, 1);

    if (recordDate < threeMonthsAgo) {
      monthlyCostStore.delete(monthKey);
    }
  }
}

/**
 * Estimate tokens for Claude request
 * Formula: rough estimate based on input + expected output
 * Claude Haiku: ~100k input tokens per sec, typical responses 50–400 tokens
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
