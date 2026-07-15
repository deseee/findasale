import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { deleteRawFootageObject } from '../services/video/r2Client';

/**
 * Footage Retention Cron — ADR-080 §7
 *
 * Raw R2 footage for a FootageBatch is deliberately NOT deleted at approval/
 * rejection time (that was a documented data-loss bug, see the comment in
 * videoJobOrchestrator.ts near the assembly-success path). Instead, the
 * approve/reject handlers in routes/videoPipelineAdmin.ts stamp a `retainUntil`
 * date on the batch, and this daily sweep deletes a batch's consumed R2 assets
 * only once `retainUntil` has passed -- giving a human a real window to reopen
 * or re-inspect recently-decided footage before it's gone for good.
 *
 * A batch only moves to ARCHIVED once every one of its assets deletes
 * successfully. A partial failure (one asset's R2 delete errors) leaves the
 * batch in its current status (APPROVED/REJECTED) so the sweep retries the
 * whole batch again on the next run -- R2 DeleteObject is idempotent, so
 * re-attempting already-deleted keys is harmless.
 *
 * Runs daily at 3:30 AM UTC (offset from photoRetentionCron's 3:00 AM so the
 * two retention sweeps don't contend for the same minute).
 */
export function scheduleFootageRetentionCron(): void {
  cron.schedule(
    '30 3 * * *',
    cronGuard({ jobName: 'footageRetentionCron' }, async () => {
      const now = new Date();

      const dueBatches = await prisma.footageBatch.findMany({
        where: {
          status: { in: ['APPROVED', 'REJECTED'] },
          retainUntil: { lte: now },
        },
        include: { assets: true },
      });

      if (dueBatches.length === 0) {
        console.log('[footage-retention-cron] No batches past retainUntil, nothing to do');
        return;
      }

      console.log(`[footage-retention-cron] ${dueBatches.length} batch(es) past retainUntil, sweeping`);

      let archivedCount = 0;
      let retriedCount = 0;

      for (const batch of dueBatches) {
        let allDeleted = true;

        for (const asset of batch.assets) {
          try {
            await deleteRawFootageObject(asset.r2Key);
          } catch (err: any) {
            allDeleted = false;
            console.error(
              `[footage-retention-cron] Failed to delete R2 object ${asset.r2Key} (batch ${batch.id}):`,
              err?.message ?? err
            );
          }
        }

        if (allDeleted) {
          await prisma.footageBatch.update({
            where: { id: batch.id },
            data: { status: 'ARCHIVED' },
          });
          archivedCount++;
        } else {
          // Leave status as-is (APPROVED/REJECTED) so this batch is picked up
          // again on the next run -- deletes already succeeded are harmless to
          // retry (idempotent), and we never want a partial-failure batch to
          // silently disappear from the sweep's future consideration.
          retriedCount++;
        }
      }

      console.log(
        `[footage-retention-cron] Archived ${archivedCount} batch(es), ${retriedCount} will retry next run`
      );
    })
  );

  console.log('[footage-retention-cron] Registered footage retention cron (daily at 3:30 AM UTC)');
}
