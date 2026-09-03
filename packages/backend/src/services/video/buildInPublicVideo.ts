/**
 * buildInPublicVideo.ts — ADR-118 ("Text-Card 'Press Release' Video Style")
 *
 * Turns already-Patrick-approved build-in-public copy (a short headline +
 * a longer body) into a real 9:16 video: a sequence of branded text cards
 * (rendered via videoAssembly.ts's buildTextCardImage(), generalized this
 * same session from the single-purpose title-card renderer) narrated by a
 * local Piper voiceover, assembled with videoAssembly.ts's existing
 * Ken-Burns/crossfade engine, captioned via captioning.ts's local Whisper
 * pass, and thumbnailed via thumbnailGenerator.ts — all free/self-hosted,
 * zero new AI spend (this narrates copy Patrick already approved once this
 * week; it does not call Claude Haiku or any other billed API — see ADR-118
 * "No new AI spend").
 *
 * Mirrors videoJobOrchestrator.ts's TUTORIAL pipeline stage-by-stage (same
 * status-advancing philosophy, same "persist artifacts as they happen so a
 * mid-pipeline failure doesn't lose already-done work", same fail-loud
 * error tagging) but is a SEPARATE entry point rather than a branch inside
 * runVideoJobPipeline(), because that function explicitly throws
 * UNSUPPORTED_PURPOSE for any purpose !== 'TUTORIAL' and ADR-118 deliberately
 * did not touch that function's contract.
 *
 * Wraps the finished job in a zero-FootageAsset FootageBatch (ADR-118 "Design:
 * reuse FootageBatch as the review wrapper") so it surfaces in the EXISTING
 * `/admin/video-pipeline` "Awaiting Review" list with no new frontend code,
 * and so Approve routes through the EXISTING
 * stageYoutubeShortForApprovedJob() fan-out untouched (confirmed this
 * session: that function operates on any VideoJob reaching APPROVED, not
 * just TUTORIAL-purpose ones).
 *
 * scriptText is stored as `${headline}\n\n${longBody}` — NOT the raw spoken
 * narration — to match youtube.ts's deriveTitleAndDescription() convention
 * that stageYoutubeShortForApprovedJob() already relies on (first line <=100
 * chars becomes the YouTube title, the rest becomes the description). The
 * actual spoken narration passed to Piper is a separate, punctuation-joined
 * string built locally in this file and never persisted as scriptText.
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { prisma } from '../../lib/prisma';
import { synthesizeVoiceover } from './voiceover';
import { assembleVideo, buildTextCardImage, uploadFileToCloudinary } from './videoAssembly';
import { captionVideo } from './captioning';
import { generateThumbnail } from './thumbnailGenerator';
import type { CuratedShot } from './assetCuration';

// Mirrors videoJobOrchestrator.ts's own CONTENT_PIPELINE_DIR resolution
// (this file lives at the same depth: packages/backend/src/services/video/).
const CONTENT_PIPELINE_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'claude_docs',
  'marketing',
  'content-pipeline'
);

// Card text budget: buildTextCardImage's wrapHeadline caller drops any line
// past maxLines rather than truncating mid-word onto an ellipsis, so a beat
// that runs long would silently lose words off the card. Capped here well
// under the 5-line x 24-char (~120 char) visual budget we pass to
// buildTextCardImage below, so nothing gets silently dropped.
const MAX_CHARS_PER_BEAT = 100;
const CARD_MAX_LINES = 5;
const CARD_MAX_CHARS_PER_LINE = 24;

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

/**
 * Deterministic sentence-boundary chunking — NOT an AI call. Groups
 * sentences greedily so each beat stays under MAX_CHARS_PER_BEAT and no
 * sentence is ever split mid-thought (a lone sentence longer than the cap
 * still becomes its own beat rather than being cut off).
 */
function splitIntoBeats(longBody: string, maxCharsPerBeat = MAX_CHARS_PER_BEAT): string[] {
  const sentences = longBody
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);

  const beats: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > maxCharsPerBeat && current) {
      beats.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current) beats.push(current);
  return beats;
}

function writeStagedContent(input: {
  jobId: string;
  headline: string;
  longBody: string;
  sourceFile: string;
  thumbnailUrl: string;
  captionedVideoUrl: string;
}): string {
  const dateStamp = todayDateStamp();
  return `STATUS: AWAITING EDIT

# Video Batch — ${dateStamp}

## VideoJob ${input.jobId} — BUILD_IN_PUBLIC — press-release text-card style

**Source content:** ${input.sourceFile}

**Suggested platforms:** YouTube, TikTok (once TikTok's own platform audit clears — external, unrelated to this job)

**Headline / card 1:** ${input.headline}

**Full narration body:**
${input.longBody}

**Thumbnail:** ${input.thumbnailUrl}

**Captioned video:** ${input.captionedVideoUrl}

---
Review at /admin/video-pipeline. Approving this batch fans out through the
existing stageYoutubeShortForApprovedJob() flow — it still lands as a DRAFT
SocialPost requiring a second explicit confirm in /admin/social-accounts
before anything actually publishes (ADR-118: video stays double-gated,
deliberately NOT auto-send like the ADR-116 text/image pipeline).
`;
}

async function writeStagedReviewFile(fileName: string, body: string): Promise<void> {
  const absolutePath = path.join(CONTENT_PIPELINE_DIR, fileName);
  await fs.mkdir(CONTENT_PIPELINE_DIR, { recursive: true }).catch((e) =>
    console.warn(`[buildInPublicVideo] could not create ${CONTENT_PIPELINE_DIR} (non-fatal):`, e?.message ?? e)
  );
  await fs.writeFile(absolutePath, body, 'utf8').catch((e) =>
    console.warn(`[buildInPublicVideo] could not write local staged file ${absolutePath} (non-fatal):`, e?.message ?? e)
  );
}

export interface BuildInPublicVideoInput {
  /** Short punchy headline — becomes card 1 AND (via scriptText's first line)
   *  the eventual YouTube title if this job is later approved and fanned out. */
  headline: string;
  /** The longer, already-approved build-in-public body copy to narrate. */
  longBody: string;
  /** Path/identifier of the source content file this video was generated
   *  from — recorded in the staged review file for traceability only. */
  sourceFile: string;
}

export interface BuildInPublicVideoResult {
  status: 'AWAITING_REVIEW' | 'FAILED';
  videoJobId: string;
  stagedFile?: string;
}

/**
 * Runs the full BUILD_IN_PUBLIC video pipeline for one piece of approved
 * copy. Every stage persists its artifact to the VideoJob row as it
 * completes (same "don't lose already-done work on a later failure"
 * philosophy as videoJobOrchestrator.ts's runVideoJobPipeline()). Any stage
 * failure sets status FAILED with a real, tagged reviewNotes message and
 * re-throws — never fabricates a fallback video.
 */
export async function runBuildInPublicVideoJob(
  input: BuildInPublicVideoInput
): Promise<BuildInPublicVideoResult> {
  const headline = (input.headline || '').trim();
  const longBody = (input.longBody || '').trim();
  const sourceFile = (input.sourceFile || '').trim();

  if (!headline) {
    throw taggedError('MISSING_HEADLINE', 'runBuildInPublicVideoJob requires a non-empty headline');
  }
  if (!longBody) {
    throw taggedError('MISSING_LONG_BODY', 'runBuildInPublicVideoJob requires non-empty longBody');
  }
  if (!sourceFile) {
    throw taggedError('MISSING_SOURCE_FILE', 'runBuildInPublicVideoJob requires a sourceFile for traceability');
  }

  // youtube.ts's deriveTitleAndDescription() convention: first line (<=100
  // chars, it truncates) becomes the title, the rest becomes the description.
  // This is what makes the EXISTING stageYoutubeShortForApprovedJob() fan-out
  // work unmodified once this job is approved.
  const scriptText = `${headline}\n\n${longBody}`;
  const fullNarration = `${headline}. ${longBody}`;

  const job = await prisma.videoJob.create({
    data: {
      trigger: 'BUILD_IN_PUBLIC',
      purpose: 'PROMO',
      status: 'QUEUED',
      scriptText,
    },
  });

  let runningCostCents = 0;

  try {
    const beats = splitIntoBeats(longBody);
    const cardTexts = [headline, ...beats];

    // VOICEOVER — Piper, local, zero cost.
    await updateJob(job.id, { status: 'VOICEOVER' });
    const voiceover = await synthesizeVoiceover({ scriptText: fullNarration });
    await updateJob(job.id, { voiceoverUrl: voiceover.voiceoverUrl });

    // Render + upload each text card. assembleVideo() downloads shots by
    // real URL (downloadToFile), so each card must be uploaded first.
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bip-video-'));
    const shots: CuratedShot[] = [];
    try {
      for (let i = 0; i < cardTexts.length; i++) {
        const cardPath = path.join(workDir, `card-${i}.jpg`);
        await buildTextCardImage(cardTexts[i], cardPath, {
          maxLines: CARD_MAX_LINES,
          maxCharsPerLine: CARD_MAX_CHARS_PER_LINE,
        });
        const cardUrl = await uploadFileToCloudinary(cardPath, 'findasale/build-in-public-video-cards');
        shots.push({
          itemId: `card-${i}`,
          photoUrl: cardUrl,
          itemTitle: cardTexts[i].slice(0, 60),
          photoRole: 'TEXT_CARD',
          score: 1,
          reason: `Auto-generated text card ${i + 1}/${cardTexts.length} from build-in-public copy (${sourceFile}).`,
          mediaType: 'image',
        });
      }
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
    await updateJob(job.id, { sourceAssetUrls: shots.map((s) => s.photoUrl) });

    // ASSEMBLING — reuse the existing Ken-Burns/crossfade engine untouched.
    // No separate title card: card 1 IS the headline card already.
    await updateJob(job.id, { status: 'ASSEMBLING' });
    const assembly = await assembleVideo({
      shots,
      scriptText: fullNarration,
      titleSuggestion: undefined,
      voiceoverUrl: voiceover.voiceoverUrl,
      voiceoverDurationSeconds: voiceover.durationSeconds,
    });
    await updateJob(job.id, { rawVideoUrl: assembly.rawVideoUrl });

    // CAPTIONING — local Whisper pass, zero cost.
    await updateJob(job.id, { status: 'CAPTIONING' });
    const captioning = await captionVideo({
      rawVideoUrl: assembly.rawVideoUrl,
      durationSeconds: assembly.durationSeconds,
      shotCount: shots.length,
    });
    runningCostCents += captioning.costCents;
    await updateJob(job.id, { captionedVideoUrl: captioning.captionedVideoUrl, costCents: runningCostCents });

    // THUMBNAIL
    await updateJob(job.id, { status: 'THUMBNAIL' });
    const thumbnail = await generateThumbnail({
      bestPhotoUrl: shots[0].photoUrl,
      headlineText: headline,
    });
    await updateJob(job.id, { thumbnailUrl: thumbnail.thumbnailUrl });

    // STAGE FOR REVIEW
    const stagedContent = writeStagedContent({
      jobId: job.id,
      headline,
      longBody,
      sourceFile,
      thumbnailUrl: thumbnail.thumbnailUrl,
      captionedVideoUrl: captioning.captionedVideoUrl,
    });
    await writeStagedReviewFile(`video-batch-${todayDateStamp()}-build-in-public-${job.id}.md`, stagedContent);
    await updateJob(job.id, { status: 'AWAITING_REVIEW', stagedFile: stagedContent });

    // Wrap in a zero-FootageAsset FootageBatch so it surfaces on the
    // existing /admin/video-pipeline "Awaiting Review" list — no new
    // frontend code, no new fan-out logic (ADR-118 "Design" section).
    await prisma.footageBatch.create({
      data: {
        videoJobId: job.id,
        templateId: 'press-release-cards',
        status: 'AWAITING_REVIEW',
        stagedFile: stagedContent,
      },
    });

    return { status: 'AWAITING_REVIEW', videoJobId: job.id, stagedFile: stagedContent };
  } catch (error: any) {
    const message = error?.errorCode ? `${error.errorCode}: ${error.message}` : error?.message ?? String(error);
    await prisma.videoJob
      .update({ where: { id: job.id }, data: { status: 'FAILED', reviewNotes: message, costCents: runningCostCents } })
      .catch(() => {});
    throw error;
  }
}
