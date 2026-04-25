/**
 * Circuit Breaker — Resilience for adapter failures
 * Phase 1: Track failures, disable sources on threshold, auto-recover
 */

import prisma from '@findasale/database';

const FAILURE_THRESHOLD = 3; // Disable after 3 consecutive failures
const FAILURE_WINDOW_MINUTES = 60; // Track failures over the last hour

/**
 * Record an adapter failure and check if source should be disabled
 */
export async function recordAdapterFailure(sourceId: string): Promise<void> {
  const config = await prisma.pricingSourceConfig.findUnique({
    where: { sourceId },
  });

  if (!config) {
    console.warn(`[circuit-breaker] Source not found: ${sourceId}`);
    return;
  }

  const newFailureCount = config.consecutiveFailures + 1;
  const lastFailureAt = new Date();

  // Disable source if failure threshold exceeded
  if (newFailureCount >= FAILURE_THRESHOLD) {
    console.warn(
      `[circuit-breaker] ${sourceId} disabled after ${newFailureCount} consecutive failures`
    );

    await prisma.pricingSourceConfig.update({
      where: { sourceId },
      data: {
        enabled: false,
        consecutiveFailures: newFailureCount,
        disabledAt: lastFailureAt,
        lastFailureAt,
      },
    });
  } else {
    // Track failure without disabling yet
    await prisma.pricingSourceConfig.update({
      where: { sourceId },
      data: {
        consecutiveFailures: newFailureCount,
        lastFailureAt,
      },
    });
  }
}

/**
 * Reset failure counter on successful fetch
 */
export async function resetFailureCounter(sourceId: string): Promise<void> {
  await prisma.pricingSourceConfig.update({
    where: { sourceId },
    data: {
      consecutiveFailures: 0,
    },
  });
}

/**
 * Check if source has exceeded daily API quota
 */
export async function checkQuota(sourceId: string): Promise<{
  hasQuota: boolean;
  remaining: number;
  message: string;
}> {
  const config = await prisma.pricingSourceConfig.findUnique({
    where: { sourceId },
  });

  if (!config) {
    return {
      hasQuota: false,
      remaining: 0,
      message: `Source not found: ${sourceId}`,
    };
  }

  // No quota limit configured (unlimited)
  if (!config.apiQuotaDaily) {
    return {
      hasQuota: true,
      remaining: Infinity,
      message: 'Unlimited quota',
    };
  }

  const remaining = config.apiQuotaDaily - config.apiUsedToday;

  if (remaining <= 0) {
    return {
      hasQuota: false,
      remaining: 0,
      message: `Quota exceeded for ${sourceId}`,
    };
  }

  return {
    hasQuota: true,
    remaining,
    message: `${remaining} requests remaining today`,
  };
}

/**
 * Increment API usage counter for a source
 */
export async function recordApiUsage(sourceId: string, count: number = 1): Promise<void> {
  await prisma.pricingSourceConfig.update({
    where: { sourceId },
    data: {
      apiUsedToday: {
        increment: count,
      },
    },
  });
}

/**
 * Auto-reset daily quota at midnight UTC
 * Called by cron job daily at 3 AM UTC
 */
export async function resetDailyQuotas(): Promise<void> {
  const now = new Date();
  console.log(`[circuit-breaker] Resetting daily quotas at ${now.toISOString()}`);

  const result = await prisma.pricingSourceConfig.updateMany({
    data: {
      apiUsedToday: 0,
      lastResetAt: now,
    },
  });

  console.log(`[circuit-breaker] Reset quotas for ${result.count} sources`);
}

/**
 * Auto-recover disabled sources (cron job at 4 AM UTC)
 * Tests disabled sources to see if they're available again
 */
export async function attemptSourceRecovery(sourceId: string): Promise<boolean> {
  const config = await prisma.pricingSourceConfig.findUnique({
    where: { sourceId },
  });

  if (!config || !config.disabledAt) {
    return false; // Not disabled
  }

  // Check if source has been disabled for at least 1 hour
  const hoursSinceDisabled =
    (Date.now() - config.disabledAt.getTime()) / (1000 * 60 * 60);

  if (hoursSinceDisabled < 1) {
    return false; // Too recent, wait longer
  }

  // Try to recover: source should implement isAvailable() check
  // For now, just reset the failure counter and re-enable
  console.log(`[circuit-breaker] Attempting recovery of ${sourceId}`);

  await prisma.pricingSourceConfig.update({
    where: { sourceId },
    data: {
      enabled: true,
      consecutiveFailures: 0,
      disabledAt: null,
    },
  });

  console.log(`[circuit-breaker] ${sourceId} re-enabled`);
  return true;
}

/**
 * Get circuit breaker status for all sources
 */
export async function getCircuitBreakerStatus() {
  const sources = await prisma.pricingSourceConfig.findMany();

  return sources.map(source => ({
    sourceId: source.sourceId,
    enabled: source.enabled,
    tier: source.tier,
    failureCount: source.consecutiveFailures,
    disabledAt: source.disabledAt,
    lastFailure: source.lastFailureAt,
    quota: {
      used: source.apiUsedToday,
      daily: source.apiQuotaDaily,
    },
  }));
}
