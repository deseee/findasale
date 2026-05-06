/**
 * cronGuard.ts — Cron job error handler with Sentry integration
 *
 * Wraps all cron job handlers to provide:
 * - Centralized error logging and Sentry capture
 * - Failure counter tracking for observability
 * - Consistent logging format across all jobs
 *
 * Usage:
 *   import { cronGuard } from '../utils/cronGuard';
 *   cron.schedule('0 * * * *', cronGuard({ jobName: 'myJob' }, async () => {
 *     // job logic
 *   }));
 */

import * as Sentry from '@sentry/node';

export interface CronGuardOptions {
  jobName: string;
  alertThresholdConsecutiveFailures?: number;
}

const failureCounters = new Map<string, number>();

/**
 * Wraps a cron job handler with error handling, logging, and Sentry capture.
 *
 * @param opts Configuration (jobName required, alertThreshold optional)
 * @param fn The async function to execute
 * @returns A wrapped function suitable for cron.schedule()
 */
export function cronGuard(
  opts: CronGuardOptions,
  fn: () => Promise<void>
): () => Promise<void> {
  return async () => {
    const startTime = Date.now();
    try {
      await fn();
      // Reset failure count on success
      failureCounters.set(opts.jobName, 0);
      const duration = Date.now() - startTime;
      console.log(`[CRON OK] ${opts.jobName} completed in ${duration}ms`);
    } catch (err) {
      const count = (failureCounters.get(opts.jobName) || 0) + 1;
      failureCounters.set(opts.jobName, count);
      const duration = Date.now() - startTime;
      console.error(
        `[CRON FAIL #${count}] ${opts.jobName} failed after ${duration}ms:`,
        err instanceof Error ? err.message : String(err)
      );

      // Capture to Sentry if available
      try {
        Sentry.captureException(err, {
          tags: {
            job: opts.jobName,
            type: 'cron_failure',
            consecutiveFailures: String(count),
          },
          extra: {
            durationMs: duration,
            jobName: opts.jobName,
          },
          level: 'error',
        });
      } catch (_sentryErr) {
        // Sentry initialization may not be complete — silently continue
      }
    }
  };
}
