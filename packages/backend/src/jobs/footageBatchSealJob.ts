/**
 * footageBatchSealJob.ts — ADR-080 §3.2 quiet-seal, Stage 1b.
 *
 * A lightweight recurring DB-timestamp check (NOT R2 polling) that seals any
 * OPEN FootageBatch which has gone quiet longer than FOOTAGE_BATCH_SEAL_MINUTES.
 * Runs every 5 minutes. Sealing is the END of Stage 1b — it does not trigger
 * analysis/assembly (that handoff is a TODO in the service; see ADR-080 §3.1/§4).
 *
 * Matches the project cron pattern: node-cron + cronGuard (Sentry check-ins +
 * centralized error handling), identical to jobs/webhookEventPruneJob.ts et al.
 */

import cron from 'node-cron';
import { cronGuard } from '../utils/cronGuard';
import { sealStaleFootageBatches } from '../services/video/footageIngestService';

export function scheduleFootageBatchSealCron(): void {
  // Every 5 minutes.
  cron.schedule(
    '*/5 * * * *',
    cronGuard({ jobName: 'footageBatchSeal' }, async () => {
      const { sealedBatchIds, sealMinutes } = await sealStaleFootageBatches();
      if (sealedBatchIds.length > 0) {
        console.log(
          `[footage-seal] Sweep sealed ${sealedBatchIds.length} batch(es) ` +
            `(quiet threshold ${sealMinutes} min): ${sealedBatchIds.join(', ')}`
        );
      }
    })
  );

  console.log('[footage-seal] Registered footage batch quiet-seal cron (every 5 min)');
}
