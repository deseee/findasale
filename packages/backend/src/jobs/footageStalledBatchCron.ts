/**
 * footageStalledBatchCron.ts — ADR-080 daily watchdog for stalled FootageBatches.
 *
 * S-BATCH-STUCK-2026-09-18: two confirmed, unrelated ways a FootageBatch could go
 * silent forever with nobody told:
 *
 *   (a) HUMAN-BLOCKED: a batch in NEEDS_INPUT or AWAITING_REVIEW is waiting on an
 *       admin action. The original NEEDS_INPUT notification is a one-shot fired the
 *       moment the batch enters that state (footageClassifyService.ts's
 *       notifyAdminsBatchNeedsAttention) -- nothing ever re-raises it if it just
 *       sits there unanswered. Confirmed live: batch cmtusdrov001djrsvh5wp40pt sat
 *       NEEDS_INPUT for 9 days on a single unread notification.
 *
 *   (b) STUCK IN-FLIGHT: classifyBatch()/renderBatch() are fire-and-forget
 *       in-process calls (`void classifyBatch(...)`, `void renderBatch(...)`).
 *       Railway redeploys the backend several times a day (25 deployments
 *       confirmed in the trailing few days at the time this was written) -- a
 *       redeploy mid-render kills the in-flight promise outright, and the batch
 *       is orphaned in ANALYZING or ASSEMBLING forever: classifyBatch's OWN
 *       guarded claim only accepts status:'SEALED', so nothing -- no cron, no
 *       admin route -- had any path back in for a batch parked in ANALYZING or
 *       ASSEMBLING. This is the more important half of this cron.
 *
 * Runs once daily. Matches the project cron pattern (node-cron + cronGuard) used
 * by footageBatchSealJob.ts and footageRetentionCron.ts. Scheduled at 4:15 AM UTC
 * -- offset from photoRetentionCron (3:00) and footageRetentionCron (3:30) so the
 * three daily sweeps don't contend for the same minute.
 *
 * RATE-LIMITING WITHOUT A SCHEMA CHANGE: Notification has no batchId column, and
 * this dispatch is under a zero-schema-changes constraint, so "already nagged this
 * batch today" is derived from existing data: notifyAdminsBatchStalled() always
 * embeds the raw batchId in the notification body, so a repeat nag is detected
 * with `body: { contains: batchId }` on rows created in the last 24h.
 *
 * notifyAdminsBatchStalled() below is a local, standalone notify helper --
 * deliberately NOT the private notifyAdminsBatchNeedsAttention() in
 * footageClassifyService.ts, which is out of scope for this file (footageClassifyService.ts
 * is owned by a different dispatch in this same session). Same admin-lookup +
 * createNotification(..., sendEmail: true) shape, distinct `type` values so the
 * two notifications never collide in the rate-limit check above.
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { createNotification } from '../services/notificationService';
import { classifyBatch } from '../services/video/footageClassifyService';

/** How many days a NEEDS_INPUT/AWAITING_REVIEW batch can go untouched before it's re-nagged. Default 2. */
function getStallNagDays(): number {
  const raw = process.env.FOOTAGE_STALL_NAG_DAYS;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2;
}

/**
 * How many minutes an ANALYZING/ASSEMBLING batch can go with no updatedAt movement
 * before it's presumed orphaned (redeploy-killed) and reclaimed. Default 90.
 *
 * Chosen from the actual per-call ceilings read in the render/classify path (this
 * file is read-only against those services -- nothing there was modified for this
 * estimate):
 *   - videoAssembly.ts downloadToFile(): 120s timeout per clip download, 500MB cap.
 *   - clipAnalysisService.ts: the same 120s/500MB download ceiling per clip, plus
 *     MAX_KEYFRAMES=8 OCR frames per clip.
 *   - templateRenderer.ts's ffmpeg render step has no explicit timeout of its own,
 *     and there is no batch-size cap anywhere in the ingest/classify/render path
 *     (no MAX_CLIPS-style constant exists) -- but FindA.Sale's real usage is
 *     Patrick's own short-form vertical marketing clips (a handful of clips per
 *     batch, not dozens). Even a pessimistic worst case built purely from the
 *     timeouts actually in the code (e.g. ~15-20 clips x 120s download ceiling
 *     each, back-to-back, plus OCR/transcript work and a single ffmpeg encode of a
 *     short 9:16 video) lands well under 90 minutes. 90 gives real headroom above
 *     that worst case so a legitimately still-running render is never reclaimed
 *     mid-flight, while still catching a redeploy-orphaned batch the same day.
 */
function getStuckReclaimMinutes(): number {
  const raw = process.env.FOOTAGE_STUCK_RECLAIM_MINUTES;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 90;
}

/**
 * Local notify-admins helper. Same admin-lookup + createNotification(...,
 * sendEmail: true) shape as footageClassifyService.ts's private
 * notifyAdminsBatchNeedsAttention, kept as a separate local copy per this
 * dispatch's file-ownership boundary. Always embeds the raw batchId in the
 * notification body -- this is also what makes the nag rate-limit check
 * possible without a schema column (see file header).
 */
async function notifyAdminsBatchStalled(
  batchId: string,
  kind: 'NAG' | 'RECLAIMED',
  detail: string
): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: { OR: [{ roles: { has: 'ADMIN' } }, { role: 'ADMIN' }] },
      select: { id: true },
    });
    if (admins.length === 0) {
      console.warn(`[footage-stall] No ADMIN users found -- batch ${batchId} (${kind}) has no one to notify`);
      return;
    }

    const type = kind === 'RECLAIMED' ? 'video_batch_stall_reclaimed' : 'video_batch_stall_nag';
    const title =
      kind === 'RECLAIMED' ? 'Video batch reclaimed from a stuck render' : 'Video batch still needs your input';
    const body =
      kind === 'RECLAIMED'
        ? `Footage batch ${batchId} was stuck in ${detail} with no progress -- likely killed mid-render by a backend redeploy. It has been reset to SEALED and reprocessing has been re-triggered automatically.`
        : `Footage batch ${batchId} is still waiting on you: ${detail}`;
    const link = '/admin/video-pipeline';
    const emailSubject =
      kind === 'RECLAIMED'
        ? `[FindA.Sale] Video batch reclaimed from stuck render -- ${batchId}`
        : `[FindA.Sale] Video batch still needs your input -- ${batchId}`;

    await Promise.all(
      admins.map((a) => createNotification(a.id, type, title, body, link, 'OPERATIONAL', true, emailSubject))
    );
  } catch (err: any) {
    console.warn(`[footage-stall] Failed to notify admins for batch ${batchId} (${kind}):`, err?.message ?? err);
  }
}

/**
 * Has this batch already been nagged (NAG kind only) within the last 24h? Derived
 * from the Notification table instead of a schema column -- see file header.
 */
async function alreadyNaggedToday(batchId: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const existing = await prisma.notification.findFirst({
    where: {
      type: 'video_batch_stall_nag',
      createdAt: { gte: since },
      body: { contains: batchId },
    },
    select: { id: true },
  });
  return !!existing;
}

/** Part (a): re-nag admins on batches that have sat NEEDS_INPUT/AWAITING_REVIEW too long. */
async function nagStalledHumanBlockedBatches(nagDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - nagDays * 24 * 60 * 60 * 1000);

  const candidates = await prisma.footageBatch.findMany({
    where: {
      status: { in: ['NEEDS_INPUT', 'AWAITING_REVIEW'] },
      updatedAt: { lt: cutoff },
    },
    select: { id: true, status: true, openQuestion: true, updatedAt: true },
  });

  let nagged = 0;
  for (const batch of candidates) {
    if (await alreadyNaggedToday(batch.id)) {
      console.log(`[footage-stall] Skipping nag for batch ${batch.id} -- already nagged within last 24h`);
      continue;
    }

    const staleDays = Math.round((Date.now() - batch.updatedAt.getTime()) / (24 * 60 * 60 * 1000));
    const detail =
      batch.status === 'NEEDS_INPUT'
        ? `stuck NEEDS_INPUT for ~${staleDays} day(s) -- ${batch.openQuestion ?? 'a question is staged'}`
        : `stuck AWAITING_REVIEW for ~${staleDays} day(s) -- a rendered draft is waiting for approve/reject`;

    await notifyAdminsBatchStalled(batch.id, 'NAG', detail);
    nagged++;
    console.log(`[footage-stall] Nagged batch ${batch.id} (status=${batch.status}, ${detail})`);
  }
  return nagged;
}

/** Part (b): reclaim batches orphaned mid-flight (ANALYZING/ASSEMBLING) by a redeploy. */
async function reclaimStuckInFlightBatches(reclaimMinutes: number): Promise<number> {
  const cutoff = new Date(Date.now() - reclaimMinutes * 60 * 1000);

  const candidates = await prisma.footageBatch.findMany({
    where: {
      status: { in: ['ANALYZING', 'ASSEMBLING'] },
      updatedAt: { lt: cutoff },
    },
    select: { id: true, status: true, updatedAt: true },
  });

  let reclaimed = 0;
  for (const batch of candidates) {
    // Concurrency-safe guarded claim (mirrors sealStaleFootageBatches in
    // footageIngestService.ts): re-check status+updatedAt in the WHERE clause so a
    // batch that is still genuinely rendering (updatedAt moved since we read it) or
    // that a concurrent sweep already reclaimed can never be double-claimed or
    // clobbered mid-flight.
    const { count } = await prisma.footageBatch.updateMany({
      where: { id: batch.id, status: batch.status, updatedAt: { lt: cutoff } },
      data: { status: 'SEALED' },
    });

    if (count !== 1) {
      console.log(`[footage-stall] Skipping reclaim of batch ${batch.id} -- claim lost (already moved on)`);
      continue;
    }

    const stuckForMin = Math.round((Date.now() - batch.updatedAt.getTime()) / 60000);
    console.warn(
      `[footage-stall] RECLAIMED batch ${batch.id} from ${batch.status} -- no progress for ~${stuckForMin} min ` +
        `(threshold ${reclaimMinutes} min). Reset to SEALED and re-triggering classifyBatch.`
    );

    // Re-trigger reprocessing -- necessary, not optional. Confirmed by reading
    // routes/videoPipelineAdmin.ts's GET /footage-batch/needs-input (the ONLY
    // admin-visible batch listing): it filters to status IN (NEEDS_INPUT, FAILED)
    // only. A batch left sitting at SEALED with nothing to re-fire it would drop
    // out of admin visibility entirely and have no way back in (no admin route
    // accepts a SEALED batch) -- a worse, silent limbo than the orphaned
    // ANALYZING/ASSEMBLING state this cron exists to fix. This mirrors the exact
    // re-run behavior of the existing /retry (FAILED) and /answer (NEEDS_INPUT)
    // admin routes, both of which also reset to SEALED and immediately re-invoke
    // classifyBatch() -- and the same fire-and-forget + failure-isolated shape
    // sealStaleFootageBatches() uses for a freshly-sealed batch.
    void classifyBatch(batch.id).catch((err) => {
      console.error(
        `[footage-stall] Reclaim re-run classifyBatch(${batch.id}) crashed (isolated, cron continues):`,
        err?.message ?? err
      );
    });

    await notifyAdminsBatchStalled(batch.id, 'RECLAIMED', `${batch.status} for ~${stuckForMin} minute(s) with no progress`);
    reclaimed++;
  }
  return reclaimed;
}

export function scheduleFootageStalledBatchCron(): void {
  const nagDays = getStallNagDays();
  const reclaimMinutes = getStuckReclaimMinutes();

  // Daily at 4:15 AM UTC -- offset from photoRetentionCron (3:00) and
  // footageRetentionCron (3:30) so the daily sweeps don't contend for the same minute.
  cron.schedule(
    '15 4 * * *',
    cronGuard({ jobName: 'footageStalledBatch' }, async () => {
      const nagged = await nagStalledHumanBlockedBatches(nagDays);
      const reclaimed = await reclaimStuckInFlightBatches(reclaimMinutes);

      console.log(
        `[footage-stall] Sweep complete -- nagged ${nagged} human-blocked batch(es) (>${nagDays}d stale), ` +
          `reclaimed ${reclaimed} stuck in-flight batch(es) (>${reclaimMinutes}min stale)`
      );
    })
  );

  console.log(
    `[footage-stall] Registered footage stalled-batch watchdog cron (daily at 4:15 AM UTC, ` +
      `nag>${nagDays}d, reclaim>${reclaimMinutes}min)`
  );
}
