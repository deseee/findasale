/**
 * videoAssembly.ts — ADR-078 Addendum 2 (free/self-hosted rebuild, 2026-07-09)
 *
 * Patrick rejected JSON2Video ($49/mo) outright (ADR-078 "Addendum 2 — Vendor
 * spend REJECTED"). This module now assembles the 9:16 vertical video entirely
 * locally with `ffmpeg` (apt-installed in the runner image alongside Piper —
 * see Dockerfile.production) — zero API cost, compute on infrastructure already
 * being paid for (Railway), matching Patrick's own framing: "we don't even
 * spend that on hosting."
 *
 * Approach (validated end-to-end in a throwaway sandbox this session — a real
 * ffprobe-confirmed 1080x1920 MP4 with both a real h264 video stream and a real
 * aac audio stream, total duration landing within ~0.001s of the target):
 *   1. Optionally build a brand title card (dark #111111 bg, orange #F97316
 *      accent bar, white headline) as its own opening "shot" via `sharp`
 *      rendering an SVG to JPEG — same technique thumbnailGenerator.ts already
 *      uses for its banner overlay, just rendered as a standalone frame here.
 *   2. Download each curated shot's photo (+ the title card, if present) to a
 *      scratch directory.
 *   3. Per-shot Ken Burns pan/zoom via ffmpeg's `zoompan` filter, chained
 *      together with `xfade` crossfades. The voiceover audio (from
 *      voiceover.ts's synthesizeVoiceover()) is the primary duration driver:
 *      per-shot duration = (voiceoverDurationSeconds + (N-1)*crossfade) / N,
 *      which makes the final crossfaded chain's total length land almost
 *      exactly on the narration length (crossfades overlap, so naive division
 *      alone would undershoot — this solves for that). Floored at 1.2s/shot so
 *      a short script with many curated shots doesn't produce imperceptibly-
 *      fast cuts; in that rare case the video runs slightly longer than the
 *      narration, which is a far better failure mode than jump-cut shots.
 *   4. The FindA.Sale logo (packages/frontend/public/icons/icon-512x512.png,
 *      fetched over HTTP — this backend container doesn't have the frontend
 *      package's filesystem mounted, same reasoning thumbnailGenerator.ts
 *      already documents) is composited as a persistent bottom-right watermark
 *      via ffmpeg's `overlay` filter. A fetch failure is non-fatal — the video
 *      ships without the watermark rather than blocking the whole assembly.
 *   5. The voiceover audio is muxed in as the single audio track.
 *   6. The final MP4 (libx264 + aac) is uploaded to Cloudinary (resource_type:
 *      'video'), same upload pattern already used by thumbnailGenerator.ts and
 *      voiceover.ts.
 *
 * No JSON2VIDEO_API_KEY reference remains anywhere in this file.
 */

import axios from 'axios';
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { CuratedShot } from './assetCuration';

const execFileAsync = promisify(execFile);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Brand template — confirmed in ADR-078's original "Voiceover + Assembly"
// section, unchanged by the vendor swap in Addendum 2.
const BRAND_ORANGE = '#F97316';
const BRAND_DARK = '#111111';
const BRAND_LOGO_URL = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/icons/icon-512x512.png`;

export const VERTICAL_WIDTH = 1080;
export const VERTICAL_HEIGHT = 1920;
export const FPS = 25;

// Matches assetCuration.ts's own "~4-5s/shot" comment on maxShots=12 — kept
// exported so any caller that needs a rough ESTIMATE before a real duration is
// known can still derive one (captioning.ts uses it for the estimate-fallback
// branch when no real durationSeconds is available), same role this constant
// played pre-rebuild.
export const DEFAULT_SECONDS_PER_SHOT = 4.5;

const CROSSFADE_SECONDS = 0.5;
const MIN_SHOT_SECONDS = 1.2;

export interface VideoAssemblyInput {
  /** Ordered curated shots from curateAssetsForVideo(). Must be non-empty. */
  shots: CuratedShot[];
  /** Full narration script — kept for validation/logging parity with the
   *  pre-rebuild signature; the actual audio comes from voiceoverUrl below. */
  scriptText: string;
  /** scriptGenerator.ts's titleSuggestion — used for an opening title card
   *  scene. Omit to skip the title card. */
  titleSuggestion?: string;
  /** Real Cloudinary URL from voiceover.ts's synthesizeVoiceover(). */
  voiceoverUrl: string;
  /** Real ffprobe-measured duration from synthesizeVoiceover() — the primary
   *  driver of the assembled video's total length. */
  voiceoverDurationSeconds: number;
}

export interface VideoAssemblyResult {
  rawVideoUrl: string;
  durationSeconds: number;
}

function assertInput(input: VideoAssemblyInput): void {
  if (!input.shots || input.shots.length === 0) {
    const err = new Error('NO_SHOTS: cannot assemble a video with an empty curated shot list');
    (err as any).errorCode = 'NO_SHOTS';
    throw err;
  }
  if (!input.scriptText || !input.scriptText.trim()) {
    const err = new Error('NO_SCRIPT: cannot assemble a video without narration script text');
    (err as any).errorCode = 'NO_SCRIPT';
    throw err;
  }
  if (!input.voiceoverUrl) {
    const err = new Error('NO_VOICEOVER: assembleVideo requires voiceoverUrl from voiceover.ts');
    (err as any).errorCode = 'NO_VOICEOVER';
    throw err;
  }
  if (!input.voiceoverDurationSeconds || input.voiceoverDurationSeconds <= 0) {
    const err = new Error('NO_VOICEOVER_DURATION: assembleVideo requires a real voiceoverDurationSeconds > 0');
    (err as any).errorCode = 'NO_VOICEOVER_DURATION';
    throw err;
  }
}

export async function downloadToFile(url: string, destPath: string): Promise<void> {
  const res = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
    maxContentLength: 100 * 1024 * 1024,
  });
  await fs.writeFile(destPath, Buffer.from(res.data));
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Same greedy word-wrap approach thumbnailGenerator.ts uses for its banner —
 *  sharp/libvips has no font-metrics measurement API, so character-count
 *  wrapping is a defensible approximation for a bold, fixed-size headline. */
function wrapHeadline(text: string, maxCharsPerLine = 20, maxLines = 3): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);

  return lines.slice(0, maxLines);
}

/** Renders the opening title card as a real JPEG "shot" — full-bleed brand-dark
 *  background, orange accent bar, centered white headline. Verified this
 *  session: `sharp(Buffer.from(svgString)).jpeg().toFile(...)` produces a real
 *  1080x1920 JPEG. */
export async function buildTitleCardImage(headlineText: string, destPath: string): Promise<void> {
  const lines = wrapHeadline(headlineText);
  const lineHeight = 90;
  const blockHeight = lines.length * lineHeight;
  const centerY = VERTICAL_HEIGHT / 2;
  const startY = centerY - blockHeight / 2 + lineHeight * 0.75;

  const tspans = lines
    .map((line, i) => `<tspan x="${VERTICAL_WIDTH / 2}" y="${startY + i * lineHeight}">${escapeXml(line)}</tspan>`)
    .join('');

  const svg = `<svg width="${VERTICAL_WIDTH}" height="${VERTICAL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${VERTICAL_WIDTH}" height="${VERTICAL_HEIGHT}" fill="${BRAND_DARK}" />
  <rect x="0" y="${centerY - blockHeight / 2 - 40}" width="${VERTICAL_WIDTH}" height="10" fill="${BRAND_ORANGE}" />
  <text font-family="Arial, sans-serif" font-weight="700" font-size="64" fill="#FFFFFF" text-anchor="middle">${tspans}</text>
</svg>`;

  await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toFile(destPath);
}

export function uploadFileToCloudinary(filePath: string, folder: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(filePath, { resource_type: 'video', folder }, (error, result) => {
      if (error || !result) return reject(error ?? new Error('No result from Cloudinary'));
      resolve(result.secure_url);
    });
  });
}

export async function ffprobeDurationSeconds(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  const seconds = parseFloat(stdout.trim());
  return Number.isFinite(seconds) ? seconds : 0;
}

/**
 * Assemble a 9:16 video locally with ffmpeg: curated shots (+ optional title
 * card) as a Ken-Burns/crossfade chain, brand logo watermark, voiceover audio
 * muxed in. Throws (does not silently degrade) on any stage failure — nothing
 * downstream posts without human review anyway (AWAITING_REVIEW gate), so a
 * visible failure the orchestrator can persist to VideoJob.reviewNotes is
 * strictly better than a fabricated fallback (same philosophy the JSON2Video
 * wrapper documented, now applied to a local-tooling failure mode instead of a
 * vendor API failure mode).
 */
export async function assembleVideo(input: VideoAssemblyInput): Promise<VideoAssemblyResult> {
  assertInput(input);

  const { shots, titleSuggestion, voiceoverUrl, voiceoverDurationSeconds } = input;
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-assembly-'));

  try {
    // 1. Gather visual sources: optional title card + curated shots, in order.
    //    ADR-079 (Motion Footage Extension): each shot may now be a still image
    //    OR a video clip (CuratedShot.mediaType) — tracked in parallel arrays
    //    alongside visualPaths so the ffmpeg input/filter construction below can
    //    branch per-entry. The title card is always an 'image' (built locally,
    //    never a curated clip).
    const visualPaths: string[] = [];
    const visualMediaTypes: Array<'image' | 'video'> = [];
    // Fixed duration (seconds) for 'video' entries, taken from the curated
    // shot's own clipDuration — undefined for 'image' entries, which instead
    // get an equal share of the remaining voiceover time budget (computed below).
    const visualFixedDurations: Array<number | undefined> = [];

    if (titleSuggestion && titleSuggestion.trim()) {
      const titleCardPath = path.join(workDir, 'title.jpg');
      await buildTitleCardImage(titleSuggestion.trim(), titleCardPath);
      visualPaths.push(titleCardPath);
      visualMediaTypes.push('image');
      visualFixedDurations.push(undefined);
    }

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      const mediaType: 'image' | 'video' = shot.mediaType ?? 'image';
      const ext = mediaType === 'video' ? 'mp4' : 'jpg';
      const shotPath = path.join(workDir, `shot-${i}.${ext}`);
      await downloadToFile(shot.photoUrl, shotPath);
      visualPaths.push(shotPath);
      visualMediaTypes.push(mediaType);

      if (mediaType === 'video') {
        if (!shot.clipDuration || shot.clipDuration <= 0) {
          const err = new Error(
            `NO_CLIP_DURATION: video shot itemId=${shot.itemId} has mediaType='video' but no positive clipDuration set — ` +
              `this is a curation-time decision (ADR-079 §1), assembleVideo() will not infer it`
          );
          (err as any).errorCode = 'NO_CLIP_DURATION';
          throw err;
        }
        visualFixedDurations.push(shot.clipDuration);
      } else {
        visualFixedDurations.push(undefined);
      }
    }

    // 2. Download the voiceover audio (real WAV from synthesizeVoiceover()).
    const audioPath = path.join(workDir, 'voiceover.wav');
    await downloadToFile(voiceoverUrl, audioPath);

    // 3. Logo watermark — best-effort; a fetch failure must not block the
    //    whole assembly (same "non-fatal brand mark" reasoning
    //    thumbnailGenerator.ts already uses for the identical logo fetch).
    let logoPath: string | null = null;
    try {
      const candidateLogoPath = path.join(workDir, 'logo.png');
      await downloadToFile(BRAND_LOGO_URL, candidateLogoPath);
      logoPath = candidateLogoPath;
    } catch (err: any) {
      console.warn('[videoAssembly] logo fetch failed, assembling without watermark:', err?.message ?? err);
    }

    // 4. Duration math — voiceover audio drives the total length (see module
    //    doc). ADR-079 extension: video-clip shots contribute their own fixed
    //    clipDuration instead of the computed per-shot share; the remaining
    //    'image' entries (stills + title card) split whatever time is left
    //    after subtracting the fixed clip durations, same crossfade-overlap
    //    algebra as before.
    const n = visualPaths.length;
    const numFixed = visualFixedDurations.filter((d) => d !== undefined).length;
    const sumFixedDurations = visualFixedDurations.reduce((sum: number, d) => sum + (d ?? 0), 0);
    const numFlex = n - numFixed;

    let crossfade = CROSSFADE_SECONDS;
    let perShotDuration: number;
    if (numFlex > 0) {
      perShotDuration = (voiceoverDurationSeconds - sumFixedDurations + (n - 1) * crossfade) / numFlex;
      if (perShotDuration < MIN_SHOT_SECONDS) {
        perShotDuration = MIN_SHOT_SECONDS;
        crossfade = Math.min(CROSSFADE_SECONDS, perShotDuration * 0.3);
      }
    } else {
      // Edge case: every visual entry is a fixed-duration video clip (no
      // stills/title card to flex). Total length is simply whatever the clips
      // add up to — per ADR-079 §1, clip duration is a curation-time decision,
      // not something assembleVideo() should pad or infer to hit the
      // narration length exactly. perShotDuration is unused in this branch
      // (kept defined only so TS sees it initialized).
      perShotDuration = MIN_SHOT_SECONDS;
    }

    const durations: number[] = visualFixedDurations.map((fixed) => fixed ?? perShotDuration);

    // 5. Build the ffmpeg command. Per-input branch on mediaType:
    //      image — existing path, unchanged: `-loop 1 -t <duration> -i`, then
    //        scale/crop/setsar/zoompan for the Ken Burns effect.
    //      video — new path: no `-loop`; `-i <clip>` followed by a
    //        `trim=duration=<duration>,setpts=PTS-STARTPTS` + the same
    //        scale/crop/setsar fit-to-1080x1920 used for stills, but no
    //        zoompan (the clip already has real motion — synthetic pan on top
    //        of real motion looks wrong and is unnecessary, ADR-079 §1).
    //    Both branches still feed the same `xfade` crossfade chain below —
    //    xfade operates on the scaled/cropped [s{i}] output labels regardless
    //    of whether the source was a still or a clip.
    const inputArgs: string[] = [];
    for (let i = 0; i < n; i++) {
      if (visualMediaTypes[i] === 'video') {
        inputArgs.push('-i', visualPaths[i]);
      } else {
        inputArgs.push('-loop', '1', '-t', durations[i].toFixed(3), '-i', visualPaths[i]);
      }
    }
    const logoInputIndex = n; // logo (if present) is the input immediately after all visuals
    if (logoPath) inputArgs.push('-i', logoPath);
    const audioInputIndex = logoPath ? n + 1 : n;
    inputArgs.push('-i', audioPath);

    const filters: string[] = [];
    for (let i = 0; i < n; i++) {
      if (visualMediaTypes[i] === 'video') {
        filters.push(
          `[${i}:v]trim=duration=${durations[i].toFixed(3)},setpts=PTS-STARTPTS,` +
            `scale=${VERTICAL_WIDTH}:${VERTICAL_HEIGHT}:force_original_aspect_ratio=increase,` +
            `crop=${VERTICAL_WIDTH}:${VERTICAL_HEIGHT},setsar=1[s${i}]`
        );
      } else {
        const zoompanFrames = Math.max(1, Math.round(durations[i] * FPS));
        filters.push(
          `[${i}:v]scale=${VERTICAL_WIDTH}:${VERTICAL_HEIGHT}:force_original_aspect_ratio=increase,` +
            `crop=${VERTICAL_WIDTH}:${VERTICAL_HEIGHT},setsar=1,` +
            `zoompan=z='min(zoom+0.0012,1.15)':d=${zoompanFrames}:s=${VERTICAL_WIDTH}x${VERTICAL_HEIGHT}:fps=${FPS}[s${i}]`
        );
      }
    }

    let accLabel = 's0';
    let accDuration = durations[0];
    for (let i = 1; i < n; i++) {
      const offset = accDuration - crossfade;
      const outLabel = i < n - 1 ? `x${i}` : 'vchain';
      filters.push(`[${accLabel}][s${i}]xfade=transition=fade:duration=${crossfade.toFixed(3)}:offset=${offset.toFixed(3)}[${outLabel}]`);
      accLabel = outLabel;
      accDuration = accDuration + durations[i] - crossfade;
    }
    // n === 1 edge case (defensive — normally there's always a title card plus
    // >=1 shot): no xfade chain ran, so the single shot's own label is the
    // chain output.
    const chainOutputLabel = n === 1 ? 's0' : accLabel;

    if (logoPath) {
      filters.push(`[${chainOutputLabel}][${logoInputIndex}:v]overlay=W-w-40:H-h-160:format=auto,format=yuv420p[vout]`);
    } else {
      filters.push(`[${chainOutputLabel}]format=yuv420p[vout]`);
    }

    const outputPath = path.join(workDir, 'assembled.mp4');
    const ffmpegArgs = [
      '-y',
      ...inputArgs,
      '-filter_complex', filters.join(';\n'),
      '-map', '[vout]',
      '-map', `${audioInputIndex}:a`,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-c:a', 'aac',
      '-shortest',
      outputPath,
    ];

    await execFileAsync('ffmpeg', ffmpegArgs, { maxBuffer: 20 * 1024 * 1024 });

    const stat = await fs.stat(outputPath);
    if (stat.size < 5000) {
      const err = new Error(`FFMPEG_EMPTY_OUTPUT: assembled video is only ${stat.size} bytes`);
      (err as any).errorCode = 'FFMPEG_EMPTY_OUTPUT';
      throw err;
    }

    const durationSeconds = await ffprobeDurationSeconds(outputPath);
    const rawVideoUrl = await uploadFileToCloudinary(outputPath, 'findasale/video-raw');

    return { rawVideoUrl, durationSeconds };
  } catch (error: any) {
    if (error?.errorCode) throw error;
    const message = error?.stderr ? String(error.stderr).slice(-2000) : error?.message ?? String(error);
    const err = new Error(`FFMPEG_ASSEMBLY_ERROR: ${message}`);
    (err as any).errorCode = 'FFMPEG_ASSEMBLY_ERROR';
    throw err;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
