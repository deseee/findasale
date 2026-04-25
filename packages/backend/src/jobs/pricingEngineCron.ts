/**
 * Pricing Engine Cron Jobs
 * Phase 1: Daily quota reset, circuit breaker auto-recovery
 */

import cron from 'node-cron';
import { resetDailyQuotas, attemptSourceRecovery } from '../services/pricingEngine/circuit-breaker';
import { prisma } from '../lib/prisma';

/**
 * Daily 3 AM UTC: Reset API usage quotas for all sources
 */
export function scheduleQuotaResetCron(): void {
  cron.schedule('0 3 * * *', async () => {
    try {
      await resetDailyQuotas();
    } catch (error) {
      console.error('[pricing-cron] Quota reset error:', error);
    }
  });

  console.log('[pricing-cron] Scheduled daily quota reset at 3 AM UTC');
}

/**
 * Daily 4 AM UTC: Auto-recover disabled sources
 */
export function scheduleCircuitBreakerRecoveryCron(): void {
  cron.schedule('0 4 * * *', async () => {
    try {
      console.log('[pricing-cron] Attempting circuit breaker recovery');

      const disabled = await prisma.pricingSourceConfig.findMany({
        where: {
          enabled: false,
          disabledAt: { not: null },
        },
      });

      let recovered = 0;

      for (const source of disabled) {
        const success = await attemptSourceRecovery(source.sourceId);
        if (success) recovered++;
      }

      console.log(
        `[pricing-cron] Circuit breaker recovery complete: ${recovered}/${disabled.length} sources recovered`
      );
    } catch (error) {
      console.error('[pricing-cron] Circuit breaker recovery error:', error);
    }
  });

  console.log('[pricing-cron] Scheduled circuit breaker recovery at 4 AM UTC');
}
