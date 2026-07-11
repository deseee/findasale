/**
 * videoJobOrchestrator.ts — ADR-078 Wave 3 (Video Content Pipeline)
 *
 * Runs ADR-078's pipeline steps 1-7 for a single VideoJob (TUTORIAL purpose only,
 * per the ADR's "Revised Phase 1 pilot scope"): asset curation -> script ->
 * voiceover -> assembly -> captioning -> thumbnail -> stage for human review.
 * Advances VideoJob.status at each stage and persists intermediate artifacts +
 * a running costCents total AS THEY HAPPEN, not just at the end, so a mid-pipeline
 * failure doesn't lose earlier, already-paid-for work.
 *
 * NOTE (2026-07-09, ADR-078 Addendum 2): voiceover.ts and videoAssembly.ts were
 * rebuilt this session to remove the JSON2Video vendor dependency (Patrick
 * rejected the paid-vendor spend outright). Their call signatures changed
 * (synthesizeVoiceover() replaces buildVoiceoverElement(), assembleVideo() now
 * takes a real voiceoverUrl/voiceoverDurationSeconds) — updated below. This
 * orchestrator's stage sequencing, status-advancing, and staged-review-file
 * logic are otherwise unchanged.
 *
 * OUT OF SCOPE HERE (ADR-078 steps 8-11 — Wave 4, once Patrick approves a staged
 * video): Patrick's manual STATUS flip to APPROVED, fan-out to SocialPost rows,
 * actual publishing (owned by the existing socialPublisherCron), and analytics
 * feedback. This module stops at AWAITING_REVIEW. No code path here ever writes
 * `status: APPROVED` or creates a SocialPost row — per ADR-078's hard constraint:
 * "No code path may create a SocialPost with a non-null videoJobId from a
 * VideoJob that hasn't reached APPROVED."
 *
 * Intended SocialPost.body shape for Wave 4 (documented now, NOT implemented):
 * per youtube.ts's deriveTitleAndDescription() (packages/backend/src/services/
 * social/platforms/youtube.ts, ~line 90), YouTube's publisher takes SocialPost.body,
 * splits on the first line break, and uses the FIRST LINE (<=100 chars, truncated)
 * as the video title with the REST of the body as the description (auto-appending
 * #Shorts if missing). So Wave 4's fan-out step must construct:
 *   body: `${titleSuggestion}\n\n${descriptionSuggestion}`
 * (title on line 1, blank line, then description) — NOT a new title column on
 * SocialPost. NOTE: the VideoJob schema (Waves 1-2) has no dedicated
 * titleSuggestion/descriptionSuggestion columns — only `scriptText`. This
 * orchestrator writes both into the staged markdown file (human-readable) but
 * Wave 4's fan-out step will need to either (a) parse them back out of the staged
 * file, or (b) get two new nullable VideoJob columns added first. Flagging this
 * now rather than silently working around it.
 *
 * PRISMA NOTE: prisma.videoJob.* calls below reference the VideoJob model added to
 * packages/database/prisma/schema.prisma in Waves 1-2. That model is NOT YET
 * migrated to the production DB, and this VM's Prisma client cannot be
 * regenerated (known EPERM-on-unlink VM limitation, already flagged in Waves
 * 1-2 — confirmed again this Wave when `pnpm --filter backend add sharp` hit the
 * identical EPERM-on-unlink error against this VM's mounted node_modules). So
 * `prisma.videoJob` will not type-check in THIS VM. That is expected, not a bug
 * introduced here — see the Wave 3 dispatch's own framing of this constraint.
 */

import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../../lib/prisma';
import { curateAssetsForVideo } from './assetCuration';
import { generateTutorialScript } from './scriptGenerator';
import { synthesizeVoiceover } from './voiceover';
import { assembleVideo } from './videoAssembly';
import { captionVideo } from './captioning';
import { generateThumbnail } from './thumbnailGenerator';

/**
 * Grounded facts for the two Phase 1 pilot guideTopic slugs (per
 * claude_docs/strategy/guide-and-video-library-plan.md §4.3: "Rapidfire Mode:
 * Photograph an Entire Sale in One Pass" and "Lighting and Framing for Better
 * Auto-Tagged Photos"). This is genuinely new work for this Wave — no prior
 * module builds a grounded-facts source for guide-library scripts.
 *
 * Every fact below is traceable to real, already-written product copy, NOT
 * invented for this file:
 *   - 'rapidfire-mode' facts are pulled from
 *     packages/frontend/data/guides/entries/rapidfire-mode.ts (the guide's own
 *     `body` text — see its lines 11, 13, 27-32, 38-40, 69-80, 84-87) and the
 *     real in-app UI copy in
 *     packages/frontend/pages/organizer/add-items/[saleId].tsx line 2089
 *     ("Rapidfire Mode: Rapidly capture multiple items. 1 Photo = 1 Item...").
 *   - 'lighting-and-framing' facts are pulled from
 *     packages/frontend/data/guides/entries/lighting-and-framing.ts (the guide's
 *     own `body` text — see its lines 11, 13, 19-39, 45-77, 63, 104-105).
 * Slugs match this file's own `slug` field in each GuideEntry, so a future
 * caller can key VideoJob.guideTopic directly off the guide library's existing
 * slugs rather than inventing a parallel naming scheme.
 */
export const GUIDE_TOPIC_FACTS: Record<string, Record<string, unknown>> = {
  'rapidfire-mode': {
    whatItIs:
      "Rapidfire mode lets you photograph every item in a sale without stopping to type titles, set prices, or fill in details. You take photos, one per item, and move on. The app queues everything for review, where you confirm prices and fix anything that needs attention.",
    whoItsFor:
      "Anyone running a sale with a lot of items: yard sales, estate sales, flea market booths, consignment drop-offs, auctions. If you're listing more than 10 items, use this mode.",
    typicalPace:
      "Most organizers photograph 100 items in about an hour. For a typical yard sale or estate sale room of 20 to 30 items, most organizers finish photographing in about 15 to 20 minutes.",
    howToStart: [
      'Open FindA.Sale and go to your sale dashboard.',
      'Tap Add Items.',
      'Tap Rapidfire mode (or Start Photo Session depending on your view).',
      'The camera opens. You are ready.',
    ],
    coreRule:
      "One item, one photo, move forward. Point the camera at the item, tap the shutter, and the app advances automatically. You don't tap a Next button.",
    realAppUiCopy:
      "Rapidfire Mode: Rapidly capture multiple items. 1 Photo = 1 Item. Photos upload and analyze in the background. Tap + on the thumbnail to add more photos to that item. (Source: packages/frontend/pages/organizer/add-items/[saleId].tsx, line 2089.)",
    reviewQueueSteps: [
      'Check the suggested title and correct it if wrong.',
      'Review the suggested price — your price always wins over the suggestion.',
      'Check the condition and change it if needed.',
      'Tap Save or Approve to move the item to your active listing.',
    ],
    retakeNudge:
      "The orange Retake nudge appears on any photo where image quality may affect how well buyers can see the item. It's a suggestion, not a blocker — you can skip it and publish anyway.",
  },
  'lighting-and-framing': {
    whatItIs:
      "Good photos sell items faster and at better prices. You don't need a camera or lighting equipment, just your phone and a few habits that take about ten seconds per item to apply.",
    appliesTo:
      'Any type of sale: yard sales, flea market booths, estate sales, consignment drop-offs, auctions.',
    lightingRules: [
      'Natural light is your best option — overcast daylight or open shade outside is soft and even, with no harsh shadows.',
      'Direct sunlight creates hard shadows on one side and blows out bright surfaces on the other; move into open shade or face the item away from direct sun.',
      'Overhead fluorescent lights create a yellow-green cast on light-colored items and deep shadows under anything with a lip or edge.',
      "The built-in flash is harsh at close range on anything shiny, metallic, glass, or ceramic, but is fine for matte items like fabric, wood, or paper in a dim room.",
      "For glass and mirrors, shoot at a slight angle, about 15 degrees off straight-on, so the flash reflection doesn't land in the shot.",
    ],
    framingRules: [
      'The item should fill 70 to 80 percent of the frame.',
      'Hold the phone in landscape for most items; use portrait only for tall narrow items like lamps or framed art taller than it is wide.',
      'Keep the item straight in frame — line up flat edges, like on framed prints, rugs, or furniture, with the edge of the screen.',
      'Get the camera level with the item, not shooting down at an angle.',
      'Use a plain, uncluttered background — a solid-color tablecloth, foam core, a clean floor section, or a white wall.',
    ],
    whyBackgroundMatters:
      "A busy background competes with the item and makes it harder for photo recognition to identify what it's looking at, which affects the accuracy of auto-suggested titles and prices.",
    commonBlurryPhotoFix:
      "If photos keep coming out blurry, either the phone is moving when the shutter is tapped, or the camera is focusing on the background instead of the item. Tap the screen directly on the item before shooting to lock focus.",
  },
};

const CONTENT_PIPELINE_DIR = path.resolve(__dirname, '..', '..', '..', '..', '..', 'claude_docs', 'marketing', 'content-pipeline');

function taggedError(code: string, message: string): Error {
  const err = new Error(message);
  (err as any).errorCode = code;
  return err;
}

function todayDateStamp(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

async function updateJob(jobId: string, data: Record<string, unknown>): Promise<void> {
  await prisma.videoJob.update({ where: { id: jobId }, data });
}

interface StageReviewFileInput {
  jobId: string;
  guideTopic: string;
  scriptText: string;
  titleSuggestion: string;
  descriptionSuggestion: string;
  thumbnailUrl: string;
  captionedVideoUrl: string;
}

/**
 * Writes claude_docs/marketing/content-pipeline/video-batch-YYYY-MM-DD.md with
 * `STATUS: AWAITING EDIT` on line 1 — identical pattern to the existing
 * social-batch-*.md / press-release-*.md files (media-pipeline-build-spec.md §0).
 * This function NEVER writes APPROVED; only Patrick hand-edits that in.
 */
async function writeStagedReviewFile(input: StageReviewFileInput): Promise<string> {
  const dateStamp = todayDateStamp();
  const fileName = `video-batch-${dateStamp}.md`;
  const absolutePath = path.join(CONTENT_PIPELINE_DIR, fileName);
  const relativePath = `claude_docs/marketing/content-pipeline/${fileName}`;

  const body = `STATUS: AWAITING EDIT

# Video Batch — ${dateStamp}

## VideoJob ${input.jobId} — TUTORIAL — guideTopic: ${input.guideTopic}

**Suggested platform:** YouTube (per ADR-078 Addendum: "TUTORIAL -> YouTube ... first")

**Title suggestion:** ${input.titleSuggestion}

**Description suggestion:** ${input.descriptionSuggestion}

**Thumbnail:** ${input.thumbnailUrl}

**Video:** ${input.captionedVideoUrl}

## Script text

${input.scriptText}

---

_Generated by videoJobOrchestrator.ts. This file is staged for human review only —
the generating code never sets STATUS to APPROVED. Change the STATUS line above to
\`APPROVED\` by hand once reviewed, per media-pipeline-build-spec.md §0._
`;

  await fs.mkdir(CONTENT_PIPELINE_DIR, { recursive: true });
  await fs.writeFile(absolutePath, body, 'utf8');

  return relativePath;
}

export interface RunVideoJobPipelineResult {
  status: 'AWAITING_REVIEW';
  stagedFile: string;
}

/**
 * Run the full production pipeline for one VideoJob, advancing status at each
 * stage and persisting artifacts incrementally. On any stage failure, sets
 * status=FAILED with reviewNotes describing the error, then re-throws — callers
 * (a cron/admin trigger, not built in this Wave) decide whether/how to retry.
 */
export async function runVideoJobPipeline(jobId: string): Promise<RunVideoJobPipelineResult> {
  const job = await prisma.videoJob.findUnique({ where: { id: jobId } });
  if (!job) {
    throw taggedError('JOB_NOT_FOUND', `runVideoJobPipeline: VideoJob ${jobId} not found`);
  }
  if (job.purpose !== 'TUTORIAL') {
    throw taggedError(
      'UNSUPPORTED_PURPOSE',
      `runVideoJobPipeline: only VideoPurpose.TUTORIAL is built in this Wave (ADR-078 "Revised Phase 1 pilot scope" — ATTENTION is Phase 3, PROMO is Phase 2); got purpose=${job.purpose}`
    );
  }

  let runningCostCents = job.costCents ?? 0;

  try {
    // 1. CURATING_ASSETS
    await updateJob(jobId, { status: 'CURATING_ASSETS' });
    const curation = await curateAssetsForVideo({
      saleId: job.saleId ?? undefined,
      guideTopic: job.guideTopic ?? undefined,
    });
    if (curation.orderedShotList.length === 0) {
      throw taggedError(
        'NO_ASSETS',
        `No curated visual assets available for VideoJob ${jobId} (saleId=${job.saleId ?? 'null'}, guideTopic=${job.guideTopic ?? 'null'})`
      );
    }
    await updateJob(jobId, { sourceAssetUrls: curation.orderedShotList });

    // 2. SCRIPTING
    await updateJob(jobId, { status: 'SCRIPTING' });
    const guideTopic = job.guideTopic;
    if (!guideTopic || !GUIDE_TOPIC_FACTS[guideTopic]) {
      throw taggedError(
        'NO_GROUNDED_FACTS',
        `No GUIDE_TOPIC_FACTS entry for guideTopic="${guideTopic ?? 'null'}" — only "rapidfire-mode" and "lighting-and-framing" are built in this Wave (ADR-078 Phase 1 pilot scope)`
      );
    }
    const scriptResult = await generateTutorialScript({ guideTopic, groundedFacts: GUIDE_TOPIC_FACTS[guideTopic] });
    runningCostCents += scriptResult.costCents;
    await updateJob(jobId, { scriptText: scriptResult.scriptText, costCents: runningCostCents });

    // 3. VOICEOVER — real local synthesis (ADR-078 Addendum 2 rebuild). Piper
    // (packages/backend/src/services/video/voiceover.ts) produces a real WAV and
    // uploads it, so VideoJob.voiceoverUrl is now a real, playable URL — unlike
    // the pre-rebuild JSON2Video-wrapper version, which left this field null
    // because JSON2Video never exposed a standalone voiceover asset.
    await updateJob(jobId, { status: 'VOICEOVER' });
    const voiceover = await synthesizeVoiceover({ scriptText: scriptResult.scriptText });
    await updateJob(jobId, { voiceoverUrl: voiceover.voiceoverUrl });

    // 4. ASSEMBLING — local ffmpeg assembly (ADR-078 Addendum 2 rebuild), no
    // JSON2Video call. voiceoverDurationSeconds (real, ffprobe-measured) drives
    // the assembled video's total length — see videoAssembly.ts module doc.
    await updateJob(jobId, { status: 'ASSEMBLING' });
    const assembly = await assembleVideo({
      shots: curation.shots,
      scriptText: scriptResult.scriptText,
      titleSuggestion: scriptResult.titleSuggestion,
      voiceoverUrl: voiceover.voiceoverUrl,
      voiceoverDurationSeconds: voiceover.durationSeconds,
    });
    await updateJob(jobId, { rawVideoUrl: assembly.rawVideoUrl });

    // ADR-080 §7 — RETENTION FIX (premature-delete data-loss bug removed).
    // Previously this point deleted every consumed R2 raw-footage object
    // immediately after assembleVideo() succeeded — i.e. BEFORE the batch
    // ever reached AWAITING_REVIEW, let alone APPROVED. That destroyed the
    // source on any reject or re-cut request (confirmed data-loss bug).
    // Raw footage MUST survive assembly -> AWAITING_REVIEW -> APPROVED and a
    // configurable retention window (FOOTAGE_RETENTION_DAYS). The delete now
    // happens ONLY post-approval, past retainUntil, via the event-driven
    // retention sweep implemented in a later ADR-080 stage (§7.2-7.3) — NOT
    // here. Do not re-add any deleteRawFootageObject() call to the assembly
    // success path.

    // 5. CAPTIONING
    await updateJob(jobId, { status: 'CAPTIONING' });
    const captioning = await captionVideo({
      rawVideoUrl: assembly.rawVideoUrl,
      durationSeconds: assembly.durationSeconds,
      shotCount: curation.shots.length,
    });
    runningCostCents += captioning.costCents;
    await updateJob(jobId, { captionedVideoUrl: captioning.captionedVideoUrl, costCents: runningCostCents });

    // 6. THUMBNAIL
    await updateJob(jobId, { status: 'THUMBNAIL' });
    const thumbnail = await generateThumbnail({
      bestPhotoUrl: curation.shots[0].photoUrl,
      headlineText: scriptResult.titleSuggestion,
    });
    await updateJob(jobId, { thumbnailUrl: thumbnail.thumbnailUrl });

    // 7. STAGE FOR REVIEW
    const stagedFile = await writeStagedReviewFile({
      jobId,
      guideTopic,
      scriptText: scriptResult.scriptText,
      titleSuggestion: scriptResult.titleSuggestion,
      descriptionSuggestion: scriptResult.descriptionSuggestion,
      thumbnailUrl: thumbnail.thumbnailUrl,
      captionedVideoUrl: captioning.captionedVideoUrl,
    });
    await updateJob(jobId, { status: 'AWAITING_REVIEW', stagedFile });

    return { status: 'AWAITING_REVIEW', stagedFile };
  } catch (error: any) {
    const message = error?.errorCode ? `${error.errorCode}: ${error.message}` : error?.message ?? String(error);
    try {
      await prisma.videoJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', reviewNotes: message, costCents: runningCostCents },
      });
    } catch (persistError) {
      console.error(`[videoJobOrchestrator] failed to persist FAILED status for VideoJob ${jobId}:`, persistError);
    }
    throw error;
  }
}
