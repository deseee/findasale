/**
 * createEncyclopediaStub.ts — ADR-069 Phase 1
 *
 * Job to create Encyclopedia entry stubs from Haiku-generated newEncyclopediaStub objects.
 * Called asynchronously (fire-and-forget) when batchAnalyzeController receives a stub from Haiku.
 *
 * Phase 2: replace setImmediate with proper Bull/BullMQ job queue.
 */

import { createEncyclopediaStubIfNew, NewEncyclopediaStub } from '../services/encyclopediaService';

/**
 * Execute the Encyclopedia stub creation job.
 * Uses Promise-based async execution for Phase 1 (fire-and-forget).
 * Phase 2: integrate with Bull/BullMQ for proper job queueing + persistence.
 */
export async function executeCreateEncyclopediaStubJob(
  stub: NewEncyclopediaStub,
  triggerItemId?: string
): Promise<void> {
  // Phase 1: Simple async execution (fire-and-forget)
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  (async () => {
    try {
      await createEncyclopediaStubIfNew(stub, triggerItemId);
    } catch (error) {
      console.error('[createEncyclopediaStub] Job execution failed:', error);
    }
  })();
}

/**
 * Batch job for multiple stubs.
 */
export async function executeBulkCreateEncyclopediaStubsJob(
  stubs: NewEncyclopediaStub[]
): Promise<void> {
  // Phase 1: Simple async execution (fire-and-forget)
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  (async () => {
    for (const stub of stubs) {
      try {
        await createEncyclopediaStubIfNew(stub);
      } catch (error) {
        console.error(`[createEncyclopediaStub] Failed to create stub "${stub.slug}":`, error);
      }
    }
  })();
}
