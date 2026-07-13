/**
 * routes/videoPipelineAdmin.ts — ADR-078 Wave 3: one-time ops trigger to run the
 * video content pipeline end-to-end against a real pilot guideTopic.
 *
 * TEMPORARY, ADMIN-ONLY: there is no Phase 4 admin UI yet (correctly deferred).
 * This is the smallest possible authenticated trigger so Patrick can invoke the
 * real pipeline once via an authenticated admin browser session (Claude-in-Chrome
 * executing an authenticated fetch() from an already-logged-in admin page — the
 * same technique already used elsewhere in this project for admin-only test
 * actions). Runs SYNCHRONOUSLY: this is a single manual test invocation, not
 * production job infrastructure — no polling/async job queue is built here on
 * purpose. The request WILL take real wall-clock time (Piper voiceover synthesis,
 * ffmpeg assembly, Whisper transcription, a real Haiku script-gen API call) —
 * likely 10-90 seconds. No artificial timeout is applied here.
 *
 * SECURITY (AUTHZ-ON-EVERY-ENDPOINT): every route below is guarded by BOTH
 * `authenticate` AND `requireAdmin` — identical pattern to
 * routes/socialPublisher.ts (ADR-077a invariant #3). No organizer/shopper/anon
 * access to this surface.
 *
 * NOTE: does not call videoJobOrchestrator's internals directly — only calls
 * the exported runVideoJobPipeline(jobId) entrypoint. All pipeline stage logic
 * (asset curation, scripting, voiceover, assembly, captioning, thumbnail,
 * staged-review-file write) is unchanged and owned entirely by
 * services/video/videoJobOrchestrator.ts.
 */

import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { runVideoJobPipeline, GUIDE_TOPIC_FACTS } from '../services/video/videoJobOrchestrator';
import { classifyBatch } from '../services/video/footageClassifyService';
import { ALL_TEMPLATES } from '../services/video/templates';
import { FootageRole } from '@prisma/client';

const router = Router();

// Every route below this line: authenticate + requireAdmin. No exceptions.
router.use(authenticate, requireAdmin);

/**
 * POST /api/admin/video-pipeline/dry-run
 * Body: { guideTopic: string } — must be one of GUIDE_TOPIC_FACTS' real, currently
 * built pilot slugs (read live from videoJobOrchestrator.ts, not hardcoded here).
 *
 * Creates a real VideoJob row (trigger=GUIDE_LIBRARY, purpose=TUTORIAL,
 * status=QUEUED), then runs the orchestrator synchronously to completion (or
 * real failure) before responding with the final VideoJob state.
 */
router.post('/dry-run', async (req, res) => {
  const validTopics = Object.keys(GUIDE_TOPIC_FACTS);
  const guideTopic = req.body?.guideTopic;

  if (typeof guideTopic !== 'string' || !validTopics.includes(guideTopic)) {
    return res.status(400).json({
      message: `Invalid or missing guideTopic. Valid options: ${validTopics.join(', ')}`,
    });
  }

  let job;
  try {
    job = await prisma.videoJob.create({
      data: {
        trigger: 'GUIDE_LIBRARY',
        purpose: 'TUTORIAL',
        guideTopic,
        status: 'QUEUED',
      },
    });
  } catch (err: any) {
    console.error('[videoPipelineAdmin] Failed to create VideoJob:', err);
    return res.status(500).json({ message: 'Failed to create VideoJob', error: err?.message });
  }

  try {
    const result = await runVideoJobPipeline(job.id);
    const finalJob = await prisma.videoJob.findUnique({ where: { id: job.id } });
    return res.status(200).json({
      jobId: job.id,
      status: finalJob?.status ?? result.status,
      stagedFile: finalJob?.stagedFile ?? result.stagedFile,
      costCents: finalJob?.costCents ?? null,
      reviewNotes: finalJob?.reviewNotes ?? null,
    });
  } catch (err: any) {
    const finalJob = await prisma.videoJob.findUnique({ where: { id: job.id } }).catch(() => null);
    console.error(`[videoPipelineAdmin] Pipeline run failed for VideoJob ${job.id}:`, err);
    return res.status(500).json({
      jobId: job.id,
      status: finalJob?.status ?? 'FAILED',
      reviewNotes: finalJob?.reviewNotes ?? err?.message ?? 'Unknown pipeline failure',
      costCents: finalJob?.costCents ?? null,
    });
  }
});


/**
 * GET /api/admin/video-pipeline/footage-batch/needs-input
 * ADR-080 Stage 2 handoff: lists every FootageBatch currently blocked on a human
 * (status NEEDS_INPUT -- a staged question -- OR status FAILED -- an unrecoverable
 * error), oldest-sealed-first. Broadened 2026-07-13 to include FAILED alongside
 * NEEDS_INPUT: both states need a human to look at the batch, and this is the
 * same list the admin UI page reads. `status` is included per row so the caller
 * can branch (NEEDS_INPUT -> answer/reject, FAILED -> retry/reject). This is the
 * only surface for discovering open questions right now — there is no Phase 4
 * review UI yet beyond the minimal admin page added alongside this route.
 */
router.get('/footage-batch/needs-input', async (req, res) => {
  try {
    const batches = await prisma.footageBatch.findMany({
      where: { status: { in: ['NEEDS_INPUT', 'FAILED'] } },
      orderBy: { sealedAt: 'asc' },
      include: { _count: { select: { assets: true } } },
    });
    return res.status(200).json({
      count: batches.length,
      batches: batches.map((b) => ({
        id: b.id,
        status: b.status,
        openQuestion: b.openQuestion,
        questionField: b.questionField,
        templateId: b.templateId,
        templateConfidence: b.templateConfidence,
        reviewNotes: b.reviewNotes,
        sealedAt: b.sealedAt,
        createdAt: b.createdAt,
        assetCount: b._count.assets,
      })),
    });
  } catch (err: any) {
    console.error('[videoPipelineAdmin] Failed to list needs-input batches:', err);
    return res.status(500).json({ message: 'Failed to list needs-input batches', error: err?.message });
  }
});

// ADR-080 §6 questionField shape 2 — "assetId:<id>.role"
const ASSET_ROLE_QUESTION = /^assetId:(.+)\.role$/;

/**
 * POST /api/admin/video-pipeline/footage-batch/:batchId/answer
 * Body: { answer: string }
 *
 * ADR-080 Stage 2 handoff: resolves the ONE staged question on a NEEDS_INPUT
 * FootageBatch. questionField shapes are owned by footageClassifyService's
 * decideGate() — this route only interprets and applies them:
 *   1. 'batch.templateId'       -> answer resolves to a Template id or displayName
 *   2. 'assetId:<id>.role'      -> answer resolves to a FootageRole value
 *   3. 'batch.footage'          -> dead-end reject, no data value, no re-classify
 *
 * After applying (shapes 1 & 2 only), the batch is handed back to SEALED so
 * classifyBatch()'s guarded claim (status:'SEALED' -> 'ANALYZING') can re-run it.
 * Unlike the seal cron's fire-and-forget call, this is a low-traffic admin
 * action, so we AWAIT classifyBatch() directly and return its real result
 * (ASSEMBLING / a NEXT NEEDS_INPUT question / FAILED) in one round trip.
 */
router.post('/footage-batch/:batchId/answer', async (req, res) => {
  const { batchId } = req.params;
  const answer = req.body?.answer;

  if (typeof answer !== 'string' || answer.trim().length === 0) {
    return res.status(400).json({ message: 'Body must include a non-empty string "answer".' });
  }

  const batch = await prisma.footageBatch.findUnique({ where: { id: batchId } });
  if (!batch) {
    return res.status(404).json({ message: `FootageBatch ${batchId} not found` });
  }
  if (batch.status !== 'NEEDS_INPUT') {
    return res.status(400).json({ message: `Batch is not awaiting input (status=${batch.status})` });
  }
  if (!batch.questionField) {
    return res.status(400).json({ message: 'Batch has no questionField staged -- nothing to answer' });
  }

  // Shape 3: batch.footage -- dead-end reject, no data value, no re-classify.
  if (batch.questionField === 'batch.footage') {
    const rejected = await prisma.footageBatch.update({
      where: { id: batchId },
      data: { status: 'REJECTED', openQuestion: null, questionField: null },
    });
    return res.status(200).json({ ok: true, batchId, status: rejected.status });
  }

  // Shape 2: assetId:<id>.role
  const assetMatch = batch.questionField.match(ASSET_ROLE_QUESTION);
  if (assetMatch) {
    const assetId = assetMatch[1];
    const normalized = answer.trim().toUpperCase();
    const validRoles = Object.values(FootageRole);
    if (!validRoles.includes(normalized as FootageRole)) {
      return res.status(400).json({
        message: `"${answer}" is not a valid clip role.`,
        validOptions: validRoles,
      });
    }
    const asset = await prisma.footageAsset.findUnique({ where: { id: assetId } });
    if (!asset || asset.batchId !== batchId) {
      return res.status(400).json({ message: `Asset ${assetId} not found on batch ${batchId}` });
    }
    await prisma.footageAsset.update({
      where: { id: assetId },
      data: { role: normalized as FootageRole, roleConfidence: 1.0 },
    });
  } else if (batch.questionField === 'batch.templateId') {
    // Shape 1: batch.templateId -- answer must resolve to a template id or displayName.
    const normalized = answer.trim().toLowerCase();
    const match = ALL_TEMPLATES.find(
      (t) => t.id.toLowerCase() === normalized || t.displayName.toLowerCase() === normalized
    );
    if (!match) {
      return res.status(400).json({
        message: `"${answer}" does not match a known template.`,
        validOptions: ALL_TEMPLATES.map((t) => ({ id: t.id, displayName: t.displayName })),
      });
    }
    await prisma.footageBatch.update({
      where: { id: batchId },
      // templateConfidence: 1.0 marks this as a human-confirmed, LOCKED answer --
      // classifyBatch() reads this exact signal to skip re-inference so the
      // answer can never be silently overwritten on the next classify pass
      // (real bug found + fixed 2026-07-13: without this, the same template
      // question re-asked itself forever no matter what was answered).
      data: { templateId: match.id, templateConfidence: 1.0 },
    });
  } else if (batch.questionField.startsWith('slot:')) {
    // Shape 4: slot:<key> -- staged by templateRenderer.ts (render stage) when a
    // template's REQUIRED slot has no matching footage. There is no data VALUE to
    // apply here (unlike role/templateId) -- the only real fix is the human adding
    // the missing clip to the batch before answering. The answer text itself is
    // just an acknowledgement; any non-empty string proceeds. Falls through to the
    // shared SEALED + classifyBatch() re-run below, which -- now that the missing
    // footage presumably exists -- re-runs analyze/gate/render end-to-end.
    console.log(`[videoPipelineAdmin] Batch ${batchId} acknowledged missing-slot question (${batch.questionField}); re-running.`);
  } else {
    return res.status(400).json({ message: `Unrecognized questionField: ${batch.questionField}` });
  }

  // Clear the staged question and hand back to SEALED so classifyBatch's guarded
  // claim can re-run it.
  await prisma.footageBatch.update({
    where: { id: batchId },
    data: { status: 'SEALED', openQuestion: null, questionField: null },
  });

  try {
    const result = await classifyBatch(batchId);
    return res.status(200).json({ ok: true, batchId, result });
  } catch (err: any) {
    console.error(`[videoPipelineAdmin] classifyBatch re-run failed for ${batchId}:`, err);
    return res.status(500).json({ ok: false, batchId, message: 'Re-classification failed', error: err?.message });
  }
});

/**
 * POST /api/admin/video-pipeline/footage-batch/:batchId/reject
 * Body: { reason?: string }
 *
 * General-purpose reject, added 2026-07-13 to close a real gap: the ONLY reject
 * path before this was the narrow 'batch.footage' dead-end inside the /answer
 * route (no analyzable clips). This route rejects a batch regardless of WHY --
 * bad footage, wrong sale, duplicate shoot, anything -- from either NEEDS_INPUT
 * or FAILED. Terminal: REJECTED per schema comment means full stop, no retry.
 */
router.post('/footage-batch/:batchId/reject', async (req, res) => {
  const { batchId } = req.params;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;

  const batch = await prisma.footageBatch.findUnique({ where: { id: batchId } });
  if (!batch) {
    return res.status(404).json({ message: `FootageBatch ${batchId} not found` });
  }
  if (batch.status !== 'NEEDS_INPUT' && batch.status !== 'FAILED') {
    return res.status(400).json({
      message: `Batch cannot be rejected from status=${batch.status} (only NEEDS_INPUT or FAILED).`,
    });
  }

  const rejected = await prisma.footageBatch.update({
    where: { id: batchId },
    data: {
      status: 'REJECTED',
      openQuestion: null,
      questionField: null,
      reviewNotes: reason ? `Rejected: ${reason}` : batch.reviewNotes,
    },
  });
  return res.status(200).json({ ok: true, batchId, status: rejected.status });
});

/**
 * POST /api/admin/video-pipeline/footage-batch/:batchId/retry
 *
 * Closes the other real gap: before this, FAILED was a dead end with no way to
 * retry short of a raw DB update. Only valid from FAILED. Hands the batch back
 * to SEALED so classifyBatch()'s guarded claim (status:'SEALED' -> 'ANALYZING')
 * can pick it up again, then awaits the real result (mirrors the /answer route's
 * re-run pattern) rather than firing-and-forgetting, since this is a low-traffic
 * admin action same as /answer.
 */
router.post('/footage-batch/:batchId/retry', async (req, res) => {
  const { batchId } = req.params;

  const batch = await prisma.footageBatch.findUnique({ where: { id: batchId } });
  if (!batch) {
    return res.status(404).json({ message: `FootageBatch ${batchId} not found` });
  }
  if (batch.status !== 'FAILED') {
    return res.status(400).json({ message: `Batch is not FAILED (status=${batch.status}) -- nothing to retry.` });
  }

  await prisma.footageBatch.update({
    where: { id: batchId },
    data: { status: 'SEALED' },
  });

  try {
    const result = await classifyBatch(batchId);
    return res.status(200).json({ ok: true, batchId, result });
  } catch (err: any) {
    console.error(`[videoPipelineAdmin] classifyBatch retry failed for ${batchId}:`, err);
    return res.status(500).json({ ok: false, batchId, message: 'Retry failed', error: err?.message });
  }
});

/**
 * GET /api/admin/video-pipeline/footage-batch/awaiting-review
 * ADR-080 render-stage handoff: lists every FootageBatch that finished
 * rendering and is staged for human review (status AWAITING_REVIEW), newest
 * first. `stagedFile` is the FULL review markdown content (real bug found +
 * fixed 2026-07-13: this used to be an on-disk-only path on Railway's
 * ephemeral filesystem, never committed to git, so a rendered batch's review
 * content was completely unreachable after the fact -- see
 * templateRenderer.ts's writeStagedBatchReviewFile). This is the only surface
 * for reading that content now; there is still no separate Phase 4 review UI
 * beyond the admin page added alongside this route.
 */
router.get('/footage-batch/awaiting-review', async (req, res) => {
  try {
    const batches = await prisma.footageBatch.findMany({
      where: { status: 'AWAITING_REVIEW' },
      orderBy: { updatedAt: 'desc' },
      include: {
        videoJob: { select: { id: true, rawVideoUrl: true, captionedVideoUrl: true, thumbnailUrl: true, status: true } },
      },
    });
    return res.status(200).json({
      count: batches.length,
      batches: batches.map((b) => ({
        id: b.id,
        templateId: b.templateId,
        templateConfidence: b.templateConfidence,
        videoJobId: b.videoJobId,
        videoUrl: b.videoJob?.captionedVideoUrl ?? b.videoJob?.rawVideoUrl ?? null,
        thumbnailUrl: b.videoJob?.thumbnailUrl ?? null,
        stagedContent: b.stagedFile,
        updatedAt: b.updatedAt,
      })),
    });
  } catch (err: any) {
    console.error('[videoPipelineAdmin] Failed to list awaiting-review batches:', err);
    return res.status(500).json({ message: 'Failed to list awaiting-review batches', error: err?.message });
  }
});

/**
 * POST /api/admin/video-pipeline/footage-batch/:batchId/approve
 * Marks a rendered, staged batch as human-approved. Matches schema.prisma's
 * documented FootageBatchStatus.APPROVED semantics ("human flipped staged
 * file to APPROVED"). No downstream publish automation consumes this status
 * yet (correctly out of scope here) -- this only records the decision.
 */
router.post('/footage-batch/:batchId/approve', async (req, res) => {
  const { batchId } = req.params;

  const batch = await prisma.footageBatch.findUnique({ where: { id: batchId } });
  if (!batch) {
    return res.status(404).json({ message: `FootageBatch ${batchId} not found` });
  }
  if (batch.status !== 'AWAITING_REVIEW') {
    return res.status(400).json({ message: `Batch is not awaiting review (status=${batch.status})` });
  }

  const approved = await prisma.footageBatch.update({
    where: { id: batchId },
    data: { status: 'APPROVED', approvedAt: new Date() },
  });
  if (batch.videoJobId) {
    await prisma.videoJob
      .update({ where: { id: batch.videoJobId }, data: { status: 'APPROVED' } })
      .catch((e) => console.warn(`[videoPipelineAdmin] could not mark VideoJob ${batch.videoJobId} APPROVED (non-fatal):`, e?.message ?? e));
  }
  return res.status(200).json({ ok: true, batchId, status: approved.status });
});

export default router;
