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

export default router;
