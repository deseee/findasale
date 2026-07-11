/**
 * templateRenderer.ts — ADR-080 Phase 1, FINAL stage: TEMPLATE RENDER + APPROVAL STAGING.
 *
 * This is the render stage the TODO handoff in footageClassifyService.ts pointed
 * to. A FootageBatch that reaches `ASSEMBLING` is fully classified (templateId +
 * per-clip ClipAnalysis persisted). `renderBatch(batchId)`:
 *   1. Loads the ASSEMBLING batch + its analyzed FootageAssets + the selected
 *      Template (templates/index.ts).
 *   2. Runs SLOT-FILL (ADR-080 §9.2): maps each ClipAnalysis to the template's
 *      ordered SlotSpecs by role + ordering hints; handles missing/extra clips
 *      gracefully; fails loud (NEEDS_INPUT, one question) on a missing REQUIRED,
 *      non-synthesizable slot — never ships a blank scene.
 *   3. Assembles a 9:16 vertical MP4 via ffmpeg with the template's polish rules:
 *      ordered clips scaled to the vertical frame, animated on-screen captions
 *      from each clip's OCR text, price-pop overlays on PRICE_REVEAL finds, a
 *      budget ticker for A/B, a brand title card + CTA end card, loudnorm audio,
 *      optional music bed, and the brand logo watermark.
 *   4. Uploads the finished MP4, creates a VideoJob (reusing ADR-078's VideoJob
 *      machinery + title/description derivation), sets FootageBatch.videoJobId.
 *   5. Stages the finished cut into the existing content-pipeline review markdown
 *      (STATUS: AWAITING EDIT) and moves the batch to AWAITING_REVIEW.
 *
 * ENGINEERING DECISION (approved, ADR-080 §11 #1): the render engine is the
 * EXISTING, PROVEN ffmpeg assembler (videoAssembly.ts), NOT Revideo. Revideo is a
 * Phase-2 polish upgrade. This file REUSES videoAssembly's ffmpeg primitives
 * (scale/crop/setsar fit, Ken-Burns zoompan, loudnorm/mux conventions, ffprobe,
 * Cloudinary upload, the sharp-SVG card technique) and the SAME approval-gate
 * mechanism (STATUS: AWAITING EDIT -> APPROVED). The render engine is isolated
 * behind the `RenderEngine` interface so a Revideo backend can swap in later
 * behind the same `render(plan)` call — see `FfmpegRenderEngine` and the
 * `selectEngine()` swap point.
 *
 * FAILURE ISOLATION: renderBatch never throws to its caller. Any error sets the
 * batch to FAILED with reviewNotes + logs, so a render failure can never crash the
 * classify sweep that triggers it. Raw footage is NEVER deleted here (ADR-080 §7 —
 * raw stays through approval + the retention window).
 *
 * BRAND VOICE: the literal word "AI" is never emitted in any overlay, title,
 * description, or caption (scrubBrand + the same /\bAI\b/ backstop scriptGenerator
 * uses). Sender = "The FindA.Sale Team"; CTA = "Free to browse · a sale near you ·
 * FindA.Sale."
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';

import { prisma } from '../../lib/prisma';
import {
  VERTICAL_WIDTH,
  VERTICAL_HEIGHT,
  FPS,
  downloadToFile,
  uploadFileToCloudinary,
  ffprobeDurationSeconds,
} from './videoAssembly';
import { TEMPLATES_BY_ID, type Template, type SlotSpec } from './templates';
import type { ClipAnalysis, ClipRole } from './clipAnalysisService';
import { getPresignedFootageUrl } from './r2Client';

const execFileAsync = promisify(execFile);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Brand template — same values videoAssembly.ts / thumbnailGenerator.ts use.
const BRAND_ORANGE = '#F97316';
const BRAND_DARK = '#111111';
const BRAND_LOGO_URL = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/icons/icon-512x512.png`;

// Optional music bed (best-effort; a fetch failure ships the video without it,
// same non-fatal reasoning videoAssembly uses for the logo). No new spend — an
// operator sets this to a URL of a royalty-free/self-hosted track, or leaves it
// unset. ADR-080 §13: no recurring paid vendor.
const MUSIC_BED_URL = process.env.FOOTAGE_MUSIC_BED_URL || '';

// CTA line — locked brand copy (task + ADR-080 §8). Never contains "AI".
const CTA_LINE_1 = 'Free to browse';
const CTA_LINE_2 = 'a sale near you';
const CTA_LINE_3 = 'FindA.Sale';

const MIN_SEG_SECONDS = 1.2;
const TITLE_CARD_SECONDS = 3.0;
const CTA_CARD_SECONDS = 2.8;
const OVERLAY_FADE_SECONDS = 0.25;

// ---------------------------------------------------------------------------
// Small text helpers (self-contained; mirror videoAssembly's escapeXml/wrap).
// ---------------------------------------------------------------------------

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Brand-voice scrub: never emit the literal word "AI" (or "Artificial
 * Intelligence") in any on-screen text — the same rule scriptGenerator enforces.
 * Replaces the mechanism word with "Smart" rather than dropping it, so a caption
 * that somehow carried it still reads naturally. Applied to every derived string
 * and to OCR captions before they are burned in.
 */
function scrubBrand(text: string): string {
  return (text || '')
    .replace(/\bArtificial Intelligence\b/gi, 'Smart')
    .replace(/\bA\.?I\.?\b/g, 'Smart');
}

function wrap(text: string, maxCharsPerLine: number, maxLines: number): string[] {
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

function fmtUsd(n: number): string {
  const rounded = Math.round(n);
  return `$${rounded.toLocaleString('en-US')}`;
}

// ---------------------------------------------------------------------------
// sharp-rendered overlay/card images (the proven text-render technique — SVG ->
// PNG/JPEG via sharp, exactly as videoAssembly.buildTitleCardImage does). Overlay
// PNGs are FULL-FRAME transparent so ffmpeg composites them at overlay=0:0 with
// no per-element x/y math. Full cards are opaque JPEGs used as their own segment.
// ---------------------------------------------------------------------------

/** Transparent full-frame lower-third caption card (the clip's OCR text). */
async function buildCaptionOverlay(text: string, destPath: string): Promise<void> {
  const clean = scrubBrand(text).trim();
  const lines = wrap(clean, 26, 3);
  const fontSize = 52;
  const lineHeight = 66;
  const pad = 28;
  const boxHeight = lines.length * lineHeight + pad * 2;
  const boxY = VERTICAL_HEIGHT - 360 - boxHeight;
  const boxW = VERTICAL_WIDTH - 120;
  const boxX = 60;
  const tspans = lines
    .map(
      (line, i) =>
        `<tspan x="${VERTICAL_WIDTH / 2}" y="${boxY + pad + fontSize + i * lineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join('');
  const svg = `<svg width="${VERTICAL_WIDTH}" height="${VERTICAL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${boxX}" y="${boxY}" rx="24" ry="24" width="${boxW}" height="${boxHeight}" fill="#000000" fill-opacity="0.62" />
  <text font-family="Arial, sans-serif" font-weight="700" font-size="${fontSize}" fill="#FFFFFF" text-anchor="middle">${tspans}</text>
</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(destPath);
}

/** Transparent full-frame price-pop pill: "Paid $X · Worth $Y" (or "$X"). */
async function buildPricePopOverlay(prices: number[], destPath: string): Promise<void> {
  let label: string;
  if (prices.length >= 2) {
    const paid = Math.min(...prices);
    const worth = Math.max(...prices);
    label = `Paid ${fmtUsd(paid)} · Worth ${fmtUsd(worth)}`;
  } else {
    label = fmtUsd(prices[0] ?? 0);
  }
  label = scrubBrand(label);
  const fontSize = 70;
  const pillW = Math.min(VERTICAL_WIDTH - 80, Math.max(420, label.length * 34 + 120));
  const pillH = 130;
  const pillX = (VERTICAL_WIDTH - pillW) / 2;
  const pillY = VERTICAL_HEIGHT * 0.46;
  const svg = `<svg width="${VERTICAL_WIDTH}" height="${VERTICAL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${pillX}" y="${pillY}" rx="65" ry="65" width="${pillW}" height="${pillH}" fill="${BRAND_ORANGE}" />
  <text x="${VERTICAL_WIDTH / 2}" y="${pillY + pillH / 2 + fontSize / 3}" font-family="Arial, sans-serif" font-weight="800" font-size="${fontSize}" fill="#FFFFFF" text-anchor="middle">${escapeXml(label)}</text>
</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(destPath);
}

/** Transparent full-frame top-right budget ticker: "Spent $X". */
async function buildBudgetTickerOverlay(runningTotal: number, destPath: string): Promise<void> {
  const label = scrubBrand(`Spent ${fmtUsd(runningTotal)}`);
  const fontSize = 46;
  const pillW = Math.max(260, label.length * 24 + 70);
  const pillH = 84;
  const pillX = VERTICAL_WIDTH - pillW - 50;
  const pillY = 150;
  const svg = `<svg width="${VERTICAL_WIDTH}" height="${VERTICAL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${pillX}" y="${pillY}" rx="42" ry="42" width="${pillW}" height="${pillH}" fill="#000000" fill-opacity="0.7" />
  <text x="${pillX + pillW / 2}" y="${pillY + pillH / 2 + fontSize / 3}" font-family="Arial, sans-serif" font-weight="700" font-size="${fontSize}" fill="${BRAND_ORANGE}" text-anchor="middle">${escapeXml(label)}</text>
</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(destPath);
}

/** Transparent full-frame top banner (title/CTA text burned over a real clip). */
async function buildTopBanner(text: string, destPath: string): Promise<void> {
  const clean = scrubBrand(text).trim();
  const lines = wrap(clean, 24, 2);
  const fontSize = 58;
  const lineHeight = 72;
  const boxH = lines.length * lineHeight + 48;
  const boxY = 120;
  const tspans = lines
    .map((line, i) => `<tspan x="${VERTICAL_WIDTH / 2}" y="${boxY + 40 + fontSize + i * lineHeight}">${escapeXml(line)}</tspan>`)
    .join('');
  const svg = `<svg width="${VERTICAL_WIDTH}" height="${VERTICAL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect x="60" y="${boxY}" rx="24" ry="24" width="${VERTICAL_WIDTH - 120}" height="${boxH}" fill="#000000" fill-opacity="0.6" />
  <text font-family="Arial, sans-serif" font-weight="800" font-size="${fontSize}" fill="#FFFFFF" text-anchor="middle">${tspans}</text>
</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(destPath);
}

/** Transparent full-frame small corner label (e.g. "After") for match-cut reveals. */
async function buildCornerLabel(text: string, destPath: string): Promise<void> {
  const label = scrubBrand(text);
  const pillW = Math.max(180, label.length * 34 + 60);
  const svg = `<svg width="${VERTICAL_WIDTH}" height="${VERTICAL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect x="50" y="150" rx="18" ry="18" width="${pillW}" height="80" fill="${BRAND_ORANGE}" />
  <text x="${50 + pillW / 2}" y="205" font-family="Arial, sans-serif" font-weight="800" font-size="48" fill="#FFFFFF" text-anchor="middle">${escapeXml(label)}</text>
</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(destPath);
}

/** Opaque full-frame brand title card (its own segment). */
async function buildTitleCard(headline: string, subtitle: string, destPath: string): Promise<void> {
  const hLines = wrap(scrubBrand(headline), 18, 3);
  const centerY = VERTICAL_HEIGHT / 2 - 60;
  const lineHeight = 96;
  const startY = centerY - (hLines.length * lineHeight) / 2 + lineHeight * 0.75;
  const hTspans = hLines
    .map((line, i) => `<tspan x="${VERTICAL_WIDTH / 2}" y="${startY + i * lineHeight}">${escapeXml(line)}</tspan>`)
    .join('');
  const subClean = scrubBrand(subtitle).trim();
  const subEl = subClean
    ? `<text x="${VERTICAL_WIDTH / 2}" y="${startY + hLines.length * lineHeight + 70}" font-family="Arial, sans-serif" font-weight="600" font-size="52" fill="${BRAND_ORANGE}" text-anchor="middle">${escapeXml(subClean)}</text>`
    : '';
  const svg = `<svg width="${VERTICAL_WIDTH}" height="${VERTICAL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${VERTICAL_WIDTH}" height="${VERTICAL_HEIGHT}" fill="${BRAND_DARK}" />
  <rect x="0" y="${centerY - (hLines.length * lineHeight) / 2 - 50}" width="${VERTICAL_WIDTH}" height="10" fill="${BRAND_ORANGE}" />
  <text font-family="Arial, sans-serif" font-weight="800" font-size="72" fill="#FFFFFF" text-anchor="middle">${hTspans}</text>
  ${subEl}
</svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toFile(destPath);
}

/** Opaque full-frame brand CTA end card (its own segment). */
async function buildCtaCard(destPath: string): Promise<void> {
  const svg = `<svg width="${VERTICAL_WIDTH}" height="${VERTICAL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${VERTICAL_WIDTH}" height="${VERTICAL_HEIGHT}" fill="${BRAND_DARK}" />
  <text x="${VERTICAL_WIDTH / 2}" y="${VERTICAL_HEIGHT / 2 - 120}" font-family="Arial, sans-serif" font-weight="700" font-size="70" fill="#FFFFFF" text-anchor="middle">${escapeXml(CTA_LINE_1)}</text>
  <text x="${VERTICAL_WIDTH / 2}" y="${VERTICAL_HEIGHT / 2}" font-family="Arial, sans-serif" font-weight="600" font-size="56" fill="#FFFFFF" text-anchor="middle">${escapeXml(CTA_LINE_2)}</text>
  <rect x="${VERTICAL_WIDTH / 2 - 260}" y="${VERTICAL_HEIGHT / 2 + 70}" rx="70" ry="70" width="520" height="140" fill="${BRAND_ORANGE}" />
  <text x="${VERTICAL_WIDTH / 2}" y="${VERTICAL_HEIGHT / 2 + 160}" font-family="Arial, sans-serif" font-weight="800" font-size="66" fill="#FFFFFF" text-anchor="middle">${escapeXml(CTA_LINE_3)}</text>
</svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toFile(destPath);
}

// ---------------------------------------------------------------------------
// Slot fill (ADR-080 §9.2).
// ---------------------------------------------------------------------------

interface FilledSlot {
  slot: SlotSpec;
  analysis: ClipAnalysis | null; // null => synthesized brand card (title/cta)
  synthetic: 'title_card' | 'cta_card' | null;
}

interface SlotFillResult {
  filled: FilledSlot[];
  /** Required, non-synthesizable slots with no clip -> fail loud (§9.2 step 5). */
  missingRequired: SlotSpec[];
  /** Clips that no slot accepted (extra footage) — dropped from the cut, noted. */
  unused: ClipAnalysis[];
}

/** Order clips by ADR-080 §5.4 precedence: saleOrdinal -> opener/closer -> uploadIndex. */
function orderedAnalyses(analyses: ClipAnalysis[]): ClipAnalysis[] {
  return [...analyses].sort((a, b) => {
    const ao = a.ordering.saleOrdinal;
    const bo = b.ordering.saleOrdinal;
    if (typeof ao === 'number' && typeof bo === 'number' && ao !== bo) return ao - bo;
    if (typeof ao === 'number' && typeof bo !== 'number') return -1;
    if (typeof bo === 'number' && typeof ao !== 'number') return 1;
    if (a.ordering.isLikelyOpener !== b.ordering.isLikelyOpener) return a.ordering.isLikelyOpener ? -1 : 1;
    if (a.ordering.isLikelyCloser !== b.ordering.isLikelyCloser) return a.ordering.isLikelyCloser ? 1 : -1;
    return a.ordering.uploadIndex - b.ordering.uploadIndex;
  });
}

/**
 * Greedy slot fill (ADR-080 §9.2): assign each clip to the first unfilled slot
 * whose acceptsRoles includes its role, respecting order. A title/cta slot with
 * no matching clip is SYNTHESIZED as a brand card (never a hard-fail). Any other
 * required-but-unfilled slot is a missing-required fail-loud. Extra clips are
 * collected as unused.
 */
function slotFill(template: Template, analyses: ClipAnalysis[]): SlotFillResult {
  const ordered = orderedAnalyses(analyses);
  const used = new Set<string>();
  const filled: FilledSlot[] = [];
  const missingRequired: SlotSpec[] = [];

  for (const slot of template.slots) {
    // Type the role variable as the full ClipRole union (never a narrowed literal)
    // so acceptsRoles.includes(role) is a union-vs-union check — avoids TS2367.
    const match = ordered.find((a) => {
      const role: ClipRole = a.role;
      return !used.has(a.assetId) && slot.acceptsRoles.includes(role);
    });

    if (match) {
      used.add(match.assetId);
      filled.push({ slot, analysis: match, synthetic: null });
      continue;
    }

    // No clip matched. Title/CTA slots are synthesizable brand cards.
    const overlay = slot.overlay;
    if (overlay === 'title_card') {
      filled.push({ slot, analysis: null, synthetic: 'title_card' });
      continue;
    }
    if (overlay === 'cta_card') {
      filled.push({ slot, analysis: null, synthetic: 'cta_card' });
      continue;
    }

    if (slot.required) {
      missingRequired.push(slot);
    }
    // optional + unfilled -> simply skipped.
  }

  const unused = ordered.filter((a) => !used.has(a.assetId));
  return { filled, missingRequired, unused };
}

// ---------------------------------------------------------------------------
// Render plan (engine-agnostic — this is what a Revideo backend would also consume).
// ---------------------------------------------------------------------------

interface OverlaySpec {
  /** Absolute path to a full-frame PNG (transparent) composited at 0:0. */
  pngPath: string;
  /** Show window, seconds relative to the segment start. */
  start: number;
  end: number;
}

interface RenderSegment {
  key: string;
  /** Local path to the visual source (downloaded clip or generated card image). */
  visualPath: string;
  isImage: boolean;
  hasAudio: boolean;
  durationSec: number;
  overlays: OverlaySpec[];
}

interface RenderPlan {
  templateId: string;
  segments: RenderSegment[];
  logoPath: string | null;
  musicPath: string | null;
}

interface RenderOutput {
  outputPath: string;
  durationSeconds: number;
}

/** Render engine seam — FfmpegRenderEngine today; a RevideoRenderEngine can swap
 *  in behind this exact interface later (ADR-080 §11 #1 Phase-2 upgrade). */
export interface RenderEngine {
  readonly id: string;
  render(plan: RenderPlan, workDir: string): Promise<RenderOutput>;
}

// ---------------------------------------------------------------------------
// FfmpegRenderEngine — two-pass, built on videoAssembly's proven patterns.
//   Pass 1: normalize each segment to an identical-codec 1080x1920 MP4 with its
//           overlays baked in (scale/crop/setsar fit + Ken-Burns zoompan for
//           stills, exactly as videoAssembly does; per-overlay alpha fade-in for
//           the "pop").
//   Pass 2: concat-demux the segments (hard cuts — reliable, sync-perfect) and
//           apply loudnorm + optional ducked music bed + the brand logo watermark.
//   Transitions: Phase 1 renders every boundary as a clean hard CUT. True
//   frame-overlap crossfade / match-cut / split-screen are deferred to the
//   Revideo swap (Phase 2) — the primary Phase-1 formats (E, B) are fast-cut by
//   design, so hard cuts lose nothing there. Match-cut slots still place BEFORE
//   and AFTER adjacent and add an "After" label so the reveal reads.
// ---------------------------------------------------------------------------

class FfmpegRenderEngine implements RenderEngine {
  readonly id = 'ffmpeg';

  async probeHasAudio(file: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v', 'error',
        '-select_streams', 'a',
        '-show_entries', 'stream=index',
        '-of', 'csv=p=0',
        file,
      ]);
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  private async renderSegment(seg: RenderSegment, index: number, workDir: string): Promise<string> {
    const dur = Math.max(MIN_SEG_SECONDS, seg.durationSec);
    const durStr = dur.toFixed(3);
    const segPath = path.join(workDir, `seg-${index}.mp4`);

    const inputArgs: string[] = [];
    // input 0 — the visual
    if (seg.isImage) {
      inputArgs.push('-loop', '1', '-t', durStr, '-i', seg.visualPath);
    } else {
      inputArgs.push('-i', seg.visualPath);
    }
    // inputs 1..K — overlay PNGs (each looped for the segment duration)
    seg.overlays.forEach((ov) => {
      inputArgs.push('-loop', '1', '-t', durStr, '-i', ov.pngPath);
    });

    const useClipAudio = !seg.isImage && seg.hasAudio;
    let silenceIdx = -1;
    if (!useClipAudio) {
      silenceIdx = 1 + seg.overlays.length;
      inputArgs.push('-f', 'lavfi', '-t', durStr, '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
    }

    const filters: string[] = [];
    if (seg.isImage) {
      const frames = Math.max(1, Math.round(dur * FPS));
      filters.push(
        `[0:v]scale=${VERTICAL_WIDTH}:${VERTICAL_HEIGHT}:force_original_aspect_ratio=increase,` +
          `crop=${VERTICAL_WIDTH}:${VERTICAL_HEIGHT},setsar=1,` +
          `zoompan=z='min(zoom+0.0012,1.15)':d=${frames}:s=${VERTICAL_WIDTH}x${VERTICAL_HEIGHT}:fps=${FPS},format=rgba[v0]`,
      );
    } else {
      filters.push(
        `[0:v]trim=duration=${durStr},setpts=PTS-STARTPTS,` +
          `scale=${VERTICAL_WIDTH}:${VERTICAL_HEIGHT}:force_original_aspect_ratio=increase,` +
          `crop=${VERTICAL_WIDTH}:${VERTICAL_HEIGHT},setsar=1,format=rgba[v0]`,
      );
    }

    let cur = 'v0';
    seg.overlays.forEach((ov, j) => {
      const inputIdx = j + 1;
      const fadeSt = Math.max(0, ov.start).toFixed(2);
      filters.push(`[${inputIdx}:v]format=rgba,fade=t=in:st=${fadeSt}:d=${OVERLAY_FADE_SECONDS}:alpha=1[o${inputIdx}]`);
      const out = `vc${inputIdx}`;
      filters.push(
        `[${cur}][o${inputIdx}]overlay=0:0:enable='between(t,${ov.start.toFixed(2)},${ov.end.toFixed(2)})'[${out}]`,
      );
      cur = out;
    });
    filters.push(`[${cur}]format=yuv420p[vout]`);

    // Audio: real clip audio (trimmed to the segment) or generated silence.
    if (useClipAudio) {
      filters.push(`[0:a]aresample=44100,aformat=channel_layouts=stereo,atrim=0:${durStr},asetpts=PTS-STARTPTS[aout]`);
    } else {
      filters.push(`[${silenceIdx}:a]asetpts=PTS-STARTPTS[aout]`);
    }

    const args = [
      '-y',
      ...inputArgs,
      '-filter_complex', filters.join(';\n'),
      '-map', '[vout]',
      '-map', '[aout]',
      '-r', String(FPS),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-ar', '44100',
      '-ac', '2',
      '-t', durStr,
      '-shortest',
      segPath,
    ];

    await execFileAsync('ffmpeg', args, { maxBuffer: 20 * 1024 * 1024 });
    return segPath;
  }

  async render(plan: RenderPlan, workDir: string): Promise<RenderOutput> {
    if (plan.segments.length === 0) {
      const err = new Error('NO_SEGMENTS: render plan has no segments');
      (err as any).errorCode = 'NO_SEGMENTS';
      throw err;
    }

    // Pass 1 — normalize every segment (identical codec params for concat).
    const segPaths: string[] = [];
    for (let i = 0; i < plan.segments.length; i++) {
      segPaths.push(await this.renderSegment(plan.segments[i], i, workDir));
    }

    // Pass 2 — concat-demux + loudnorm + optional music duck + logo watermark.
    const listPath = path.join(workDir, 'concat-list.txt');
    const listBody = segPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
    await fs.writeFile(listPath, listBody, 'utf8');

    const inputArgs: string[] = ['-f', 'concat', '-safe', '0', '-i', listPath];
    let logoIdx = -1;
    let musicIdx = -1;
    if (plan.logoPath) {
      inputArgs.push('-i', plan.logoPath);
      logoIdx = 1;
    }
    if (plan.musicPath) {
      inputArgs.push('-i', plan.musicPath);
      musicIdx = plan.logoPath ? 2 : 1;
    }

    const filters: string[] = [];
    // Video: optional logo overlay.
    let videoMap = '0:v';
    if (logoIdx >= 0) {
      filters.push(`[0:v][${logoIdx}:v]overlay=W-w-40:H-h-160:format=auto,format=yuv420p[v]`);
      videoMap = '[v]';
    }
    // Audio: loudnorm the concatenated track; duck an optional music bed under it.
    if (musicIdx >= 0) {
      filters.push(`[0:a]loudnorm=I=-16:TP=-1.5:LRA=11[vo]`);
      filters.push(`[${musicIdx}:a]aloop=loop=-1:size=2000000000,volume=0.12[mus]`);
      filters.push(`[vo][mus]amix=inputs=2:duration=first:dropout_transition=0[a]`);
    } else {
      filters.push(`[0:a]loudnorm=I=-16:TP=-1.5:LRA=11[a]`);
    }

    const outputPath = path.join(workDir, 'final.mp4');
    const args = ['-y', ...inputArgs, '-filter_complex', filters.join(';\n')];
    if (logoIdx >= 0) {
      args.push('-map', videoMap, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p');
    } else {
      args.push('-map', '0:v', '-c:v', 'copy');
    }
    args.push('-map', '[a]', '-c:a', 'aac', '-movflags', '+faststart', outputPath);

    await execFileAsync('ffmpeg', args, { maxBuffer: 20 * 1024 * 1024 });

    const stat = await fs.stat(outputPath);
    if (stat.size < 5000) {
      const err = new Error(`FFMPEG_EMPTY_OUTPUT: final video is only ${stat.size} bytes`);
      (err as any).errorCode = 'FFMPEG_EMPTY_OUTPUT';
      throw err;
    }
    const durationSeconds = await ffprobeDurationSeconds(outputPath);
    return { outputPath, durationSeconds };
  }
}

/**
 * Engine selection — the Revideo swap point. Default is the proven ffmpeg engine
 * (ADR-080 §11 #1). Setting FOOTAGE_RENDER_ENGINE=revideo is reserved for the
 * Phase-2 Revideo backend; until that lands it falls back to ffmpeg with a warning
 * rather than failing a render.
 */
function selectEngine(): RenderEngine {
  const want = (process.env.FOOTAGE_RENDER_ENGINE || 'ffmpeg').toLowerCase();
  if (want === 'revideo') {
    console.warn('[templateRenderer] FOOTAGE_RENDER_ENGINE=revideo requested but the Revideo backend is a Phase-2 upgrade (ADR-080 §11 #1) — falling back to the ffmpeg engine.');
  }
  return new FfmpegRenderEngine();
}

// ---------------------------------------------------------------------------
// Build the render plan from the filled slots (overlays + durations + downloads).
// ---------------------------------------------------------------------------

function captionTextFor(a: ClipAnalysis): string {
  if (a.rawCaptions && a.rawCaptions.length) return a.rawCaptions.join('  ');
  if (a.facts.hookLine) return a.facts.hookLine;
  if (a.facts.itemName) return a.facts.itemName;
  return '';
}

function segDurationSec(template: Template, slot: SlotSpec, a: ClipAnalysis | null): number {
  const target = template.polish.pacing.targetShotMs;
  if (!a) return slot.overlay === 'cta_card' ? CTA_CARD_SECONDS : TITLE_CARD_SECONDS;
  let ms = a.durationMs > 0 ? a.durationMs : target;
  const maxMs = slot.maxMs ?? Math.max(target * 2, 6000);
  const minMs = slot.minMs ?? 1200;
  ms = Math.min(Math.max(ms, minMs), maxMs);
  return ms / 1000;
}

async function buildRenderPlan(
  template: Template,
  fill: SlotFillResult,
  workDir: string,
  engine: FfmpegRenderEngine,
): Promise<RenderPlan> {
  const segments: RenderSegment[] = [];
  let overlayCounter = 0;
  let runningBudget = 0;

  for (let i = 0; i < fill.filled.length; i++) {
    const { slot, analysis, synthetic } = fill.filled[i];
    const durationSec = segDurationSec(template, slot, analysis);

    // --- Synthetic brand cards (no clip) ---
    if (synthetic === 'title_card') {
      const cardPath = path.join(workDir, `card-title-${i}.jpg`);
      await buildTitleCard(template.displayName, '', cardPath);
      segments.push({ key: slot.key, visualPath: cardPath, isImage: true, hasAudio: false, durationSec, overlays: [] });
      continue;
    }
    if (synthetic === 'cta_card') {
      const cardPath = path.join(workDir, `card-cta-${i}.jpg`);
      await buildCtaCard(cardPath);
      segments.push({ key: slot.key, visualPath: cardPath, isImage: true, hasAudio: false, durationSec, overlays: [] });
      continue;
    }

    // --- Real clip segment ---
    const a = analysis as ClipAnalysis;
    const isImage = a.mediaType === 'image';
    const visualPath = path.join(workDir, `clip-${i}.${isImage ? 'jpg' : 'mp4'}`);
    const url = await getPresignedFootageUrl(a.r2Key);
    await downloadToFile(url, visualPath);
    const hasAudio = isImage ? false : await engine.probeHasAudio(visualPath);

    const overlays: OverlaySpec[] = [];
    const overlayType = slot.overlay;

    // Title/CTA overlay burned on a real clip -> a top banner (not a full card).
    if (overlayType === 'title_card') {
      const bannerText = a.facts.hookLine || captionTextFor(a) || template.displayName;
      const p = path.join(workDir, `ov-banner-${overlayCounter++}.png`);
      await buildTopBanner(bannerText, p);
      overlays.push({ pngPath: p, start: 0.2, end: durationSec });
    } else if (overlayType === 'cta_card') {
      const p = path.join(workDir, `ov-cta-${overlayCounter++}.png`);
      await buildTopBanner(`${CTA_LINE_1} · ${CTA_LINE_3}`, p);
      overlays.push({ pngPath: p, start: 0.2, end: durationSec });
    } else {
      // Caption lower-third (the OCR metadata) on every non-card clip.
      const caption = captionTextFor(a);
      if (caption.trim()) {
        const p = path.join(workDir, `ov-cap-${overlayCounter++}.png`);
        await buildCaptionOverlay(caption, p);
        overlays.push({ pngPath: p, start: 0.2, end: durationSec });
      }
    }

    // Price-pop overlay (real numbers only).
    if (overlayType === 'price_pop' && a.facts.prices.length > 0) {
      const p = path.join(workDir, `ov-price-${overlayCounter++}.png`);
      await buildPricePopOverlay(a.facts.prices, p);
      overlays.push({ pngPath: p, start: 0.4, end: durationSec });
    }

    // Budget ticker (A/B running spend).
    if (overlayType === 'budget_ticker') {
      const add = a.facts.prices.length ? Math.min(...a.facts.prices) : 0;
      runningBudget += add;
      const p = path.join(workDir, `ov-budget-${overlayCounter++}.png`);
      await buildBudgetTickerOverlay(runningBudget, p);
      overlays.push({ pngPath: p, start: 0.2, end: durationSec });
    }

    // Match-cut reveal label (Phase-1 reads as a hard-cut reveal; label it).
    if (slot.transitionIn === 'match_cut') {
      const p = path.join(workDir, `ov-label-${overlayCounter++}.png`);
      await buildCornerLabel('After', p);
      overlays.push({ pngPath: p, start: 0, end: Math.min(1.5, durationSec) });
    }

    segments.push({ key: slot.key, visualPath, isImage, hasAudio, durationSec, overlays });
  }

  // Logo watermark — best-effort (a fetch failure ships without it).
  let logoPath: string | null = null;
  try {
    const candidate = path.join(workDir, 'logo.png');
    await downloadToFile(BRAND_LOGO_URL, candidate);
    logoPath = candidate;
  } catch (err: any) {
    console.warn('[templateRenderer] logo fetch failed, rendering without watermark:', err?.message ?? err);
  }

  // Optional music bed — best-effort.
  let musicPath: string | null = null;
  if (MUSIC_BED_URL) {
    try {
      const candidate = path.join(workDir, 'music.mp3');
      await downloadToFile(MUSIC_BED_URL, candidate);
      musicPath = candidate;
    } catch (err: any) {
      console.warn('[templateRenderer] music bed fetch failed, rendering without music:', err?.message ?? err);
    }
  }

  return { templateId: template.id, segments, logoPath, musicPath };
}

// ---------------------------------------------------------------------------
// Title / description derivation (feeds VideoJob + the staged file).
// ---------------------------------------------------------------------------

function collectPriceStats(analyses: ClipAnalysis[]): { paidTotal: number; worthTotal: number; findCount: number } {
  let paidTotal = 0;
  let worthTotal = 0;
  let findCount = 0;
  for (const a of analyses) {
    const role: ClipRole = a.role;
    if ((role === 'FIND' || role === 'PRICE_REVEAL') && a.facts.prices.length) {
      findCount++;
      paidTotal += Math.min(...a.facts.prices);
      worthTotal += Math.max(...a.facts.prices);
    }
  }
  return { paidTotal, worthTotal, findCount };
}

function deriveTitleAndDescription(
  template: Template,
  analyses: ClipAnalysis[],
): { title: string; description: string } {
  const { paidTotal, worthTotal, findCount } = collectPriceStats(analyses);
  let title: string;
  switch (template.id) {
    case 'season-E-sold-near-you':
      title = findCount > 0 ? `${findCount} finds near you this weekend` : 'What is near you this weekend';
      break;
    case 'season-B-resale-route':
      title = paidTotal > 0 ? `The Resale Route — paid ${fmtUsd(paidTotal)}, worth ${fmtUsd(worthTotal)}` : 'The Resale Route';
      break;
    case 'season-A-room-styling':
      title = paidTotal > 0 ? `Styled a room for ${fmtUsd(paidTotal)}` : template.displayName;
      break;
    case 'season-C-map-to-mantel': {
      const hook = analyses.find((a) => a.role === 'HOOK')?.facts.hookLine;
      title = hook ? hook : 'Map to Mantel';
      break;
    }
    default:
      title = template.displayName;
  }

  const lines: string[] = [];
  for (const a of analyses) {
    const role: ClipRole = a.role;
    if (role === 'FIND' || role === 'PRICE_REVEAL') {
      const name = a.facts.itemName || captionTextFor(a) || 'A great find';
      const priceStr = a.facts.prices.length
        ? a.facts.prices.length >= 2
          ? ` — paid ${fmtUsd(Math.min(...a.facts.prices))}, worth ${fmtUsd(Math.max(...a.facts.prices))}`
          : ` — ${fmtUsd(a.facts.prices[0])}`
        : '';
      lines.push(`• ${name}${priceStr}`);
    }
  }
  const bodyLines = lines.slice(0, 8).join('\n');
  const description = `${bodyLines}${bodyLines ? '\n\n' : ''}${CTA_LINE_1}, ${CTA_LINE_2}, ${CTA_LINE_3}.`;

  return { title: scrubBrand(title), description: scrubBrand(description) };
}

// ---------------------------------------------------------------------------
// Staged review file (reuses the STATUS: AWAITING EDIT gate, extended per §8).
// ---------------------------------------------------------------------------

const CONTENT_PIPELINE_DIR = path.resolve(
  __dirname, '..', '..', '..', '..', '..', 'claude_docs', 'marketing', 'content-pipeline',
);

function todayDateStamp(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

interface StageBatchInput {
  batchId: string;
  jobId: string;
  template: Template;
  templateConfidence: number | null;
  title: string;
  description: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  durationSeconds: number;
  fill: SlotFillResult;
  analyses: ClipAnalysis[];
  rationale: string | null;
}

async function writeStagedBatchReviewFile(input: StageBatchInput): Promise<string> {
  const dateStamp = todayDateStamp();
  const shortId = input.batchId.slice(-6);
  const fileName = `video-batch-${dateStamp}-${shortId}.md`;
  const absolutePath = path.join(CONTENT_PIPELINE_DIR, fileName);
  const relativePath = `claude_docs/marketing/content-pipeline/${fileName}`;

  const purposeToPlatform =
    input.template.purpose === 'TUTORIAL' ? 'YouTube' : 'TikTok / Reels (short-form vertical)';

  const clipRows = input.analyses
    .map((a) => {
      const conf = typeof a.roleConfidence === 'number' ? a.roleConfidence.toFixed(2) : 'n/a';
      const soft = a.roleConfidence >= 0.5 && a.roleConfidence < 0.75 ? '  (confirm role)' : '';
      const caps = a.rawCaptions && a.rawCaptions.length ? scrubBrand(a.rawCaptions.join(' | ')) : '(none read)';
      return `| clip ${a.ordering.uploadIndex + 1} | ${a.role} | ${conf}${soft} | ${caps} |`;
    })
    .join('\n');

  const missingNote = input.fill.missingRequired.length
    ? `\n**Needs footage:** ${input.fill.missingRequired.map((s) => s.key).join(', ')} (required slot with no matching clip)\n`
    : '';
  const unusedNote = input.fill.unused.length
    ? `\n**Unused clips (not in this cut):** ${input.fill.unused.map((a) => `clip ${a.ordering.uploadIndex + 1} (${a.role})`).join(', ')}\n`
    : '';

  const body = `STATUS: AWAITING EDIT

# Video Batch — ${dateStamp} — ${input.template.displayName}

## FootageBatch ${input.batchId} -> VideoJob ${input.jobId}

**Format:** ${input.template.id} (${input.template.purpose})${input.templateConfidence != null ? ` — inference confidence ${input.templateConfidence.toFixed(2)}` : ''}
${input.rationale ? `**Why this format:** ${scrubBrand(input.rationale)}\n` : ''}
**Suggested platform:** ${purposeToPlatform}

**Title suggestion:** ${input.title}

**Description suggestion:**

${input.description}

**Finished video (${input.durationSeconds.toFixed(1)}s):** ${input.videoUrl}
${input.thumbnailUrl ? `**Thumbnail:** ${input.thumbnailUrl}\n` : ''}${missingNote}${unusedNote}
## Clips read (OCR / role / confidence)

| Clip | Role | Confidence | On-screen captions read |
|---|---|---|---|
${clipRows}

---

_Generated by templateRenderer.ts (ADR-080 §9 render stage). Staged for human
review only — the generating code never sets STATUS to APPROVED. Change the STATUS
line above to \`APPROVED\` by hand once reviewed. Raw footage is retained in R2
through approval + the retention window (ADR-080 §7) — nothing is deleted here._
`;

  await fs.mkdir(CONTENT_PIPELINE_DIR, { recursive: true });
  await fs.writeFile(absolutePath, body, 'utf8');
  return relativePath;
}

// ---------------------------------------------------------------------------
// Cloudinary helpers (video upload reuses videoAssembly's exported helper; the
// thumbnail is an image, needing resource_type:'image').
// ---------------------------------------------------------------------------

function uploadImageToCloudinary(filePath: string, folder: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(filePath, { resource_type: 'image', folder }, (error, result) => {
      if (error || !result) return reject(error ?? new Error('No result from Cloudinary'));
      resolve(result.secure_url);
    });
  });
}

// ---------------------------------------------------------------------------
// ClipAnalysis reload from persisted FootageAsset rows.
// ---------------------------------------------------------------------------

type PersistedAsset = {
  id: string;
  r2Key: string;
  mediaType: string;
  durationMs: number | null;
  role: string;
  roleConfidence: number | null;
  ocrCaptions: string[];
  transcript: string | null;
  analysisJson: unknown;
  createdAt: Date;
};

/** Rehydrate a ClipAnalysis from a persisted asset. Prefers the full analysisJson
 *  blob (ADR-080 §5 contract); falls back to the typed columns if it is missing. */
function analysisFromAsset(asset: PersistedAsset, uploadIndex: number): ClipAnalysis | null {
  if (asset.analysisJson && typeof asset.analysisJson === 'object') {
    const parsed = asset.analysisJson as ClipAnalysis;
    // Trust the persisted contract but guarantee the fields the renderer reads.
    if (parsed && parsed.role && parsed.facts && parsed.ordering) {
      return parsed;
    }
  }
  // Fallback: reconstruct a minimal ClipAnalysis from typed columns.
  const role = (asset.role as ClipRole) || 'UNKNOWN';
  return {
    assetId: asset.id,
    r2Key: asset.r2Key,
    durationMs: asset.durationMs ?? 0,
    mediaType: asset.mediaType === 'image' ? 'image' : 'video',
    role,
    roleConfidence: asset.roleConfidence ?? 0,
    facts: { prices: [], isScreenRecording: false },
    ordering: { uploadIndex, isLikelyOpener: false, isLikelyCloser: false },
    signals: { ocr: 0, whisper: 0, vision: 0 },
    rawCaptions: asset.ocrCaptions ?? [],
    transcript: asset.transcript ?? '',
  };
}

// ---------------------------------------------------------------------------
// renderBatch — the public entry point wired to the classify stage.
// ---------------------------------------------------------------------------

export interface RenderBatchResult {
  batchId: string;
  status: 'AWAITING_REVIEW' | 'NEEDS_INPUT' | 'FAILED' | 'SKIPPED';
  templateId?: string;
  videoJobId?: string;
  stagedFile?: string;
  videoUrl?: string;
  durationSeconds?: number;
  reason?: string;
}

/** In-process guard so a duplicate trigger for the same batch does not double-render. */
const inFlight = new Set<string>();

/**
 * Render a classified (ASSEMBLING) FootageBatch into a finished 9:16 MP4, create
 * its VideoJob, and stage it for one-word approval. Failure-isolated: never throws;
 * any error sets the batch to FAILED (+ reviewNotes) and returns a result object.
 * Raw footage is never deleted here (ADR-080 §7).
 */
export async function renderBatch(batchId: string): Promise<RenderBatchResult> {
  if (inFlight.has(batchId)) {
    return { batchId, status: 'SKIPPED', reason: 'already rendering in this process' };
  }
  inFlight.add(batchId);

  let workDir: string | null = null;
  try {
    const batch = await prisma.footageBatch.findUnique({ where: { id: batchId } });
    if (!batch) {
      return { batchId, status: 'SKIPPED', reason: 'batch not found' };
    }
    if (batch.status !== 'ASSEMBLING') {
      console.log(`[templateRenderer] Batch ${batchId} not renderable (status=${batch.status}) — skipping`);
      return { batchId, status: 'SKIPPED', reason: `status ${batch.status}` };
    }
    if (batch.videoJobId) {
      console.log(`[templateRenderer] Batch ${batchId} already has videoJobId=${batch.videoJobId} — skipping`);
      return { batchId, status: 'SKIPPED', reason: 'already rendered' };
    }
    if (!batch.templateId || !TEMPLATES_BY_ID[batch.templateId]) {
      throw new Error(`NO_TEMPLATE: batch ${batchId} has no resolvable templateId (${batch.templateId ?? 'null'})`);
    }
    const template = TEMPLATES_BY_ID[batch.templateId];

    // Load persisted analyses in upload order.
    const assets = (await prisma.footageAsset.findMany({
      where: { batchId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, r2Key: true, mediaType: true, durationMs: true, role: true,
        roleConfidence: true, ocrCaptions: true, transcript: true, analysisJson: true, createdAt: true,
      },
    })) as PersistedAsset[];

    const analyses: ClipAnalysis[] = [];
    assets.forEach((asset, i) => {
      const a = analysisFromAsset(asset, i);
      if (a) analyses.push(a);
    });

    if (analyses.length === 0) {
      await prisma.footageBatch.update({
        where: { id: batchId },
        data: {
          status: 'NEEDS_INPUT',
          openQuestion: 'This shoot has no analyzable clips to render. Re-upload the footage or reject this batch.',
          questionField: 'batch.footage',
        },
      });
      return { batchId, status: 'NEEDS_INPUT', templateId: template.id, reason: 'no analyzable clips' };
    }

    // Slot fill (ADR-080 §9.2).
    const fill = slotFill(template, analyses);

    // Fail loud on a missing REQUIRED, non-synthesizable slot — never ship blank.
    if (fill.missingRequired.length > 0) {
      const first = fill.missingRequired[0];
      const question =
        `This "${template.displayName}" cut is missing footage for its "${first.key}" beat` +
        `${first.note ? ` (${first.note})` : ''}. Add that clip, or reject this batch.`;
      await prisma.footageBatch.update({
        where: { id: batchId },
        data: { status: 'NEEDS_INPUT', openQuestion: question, questionField: `slot:${first.key}` },
      });
      console.log(`[templateRenderer] Batch ${batchId} NEEDS_INPUT — missing required slot "${first.key}"`);
      return { batchId, status: 'NEEDS_INPUT', templateId: template.id, reason: `missing required slot ${first.key}` };
    }

    // Build + render. Use a non-null local (dir) for the render calls so the
    // string param never depends on control-flow narrowing of the nullable workDir.
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'template-render-'));
    workDir = dir;
    const engine = selectEngine();
    const ffmpegEngine = engine instanceof FfmpegRenderEngine ? engine : new FfmpegRenderEngine();
    const plan = await buildRenderPlan(template, fill, dir, ffmpegEngine);
    const rendered = await engine.render(plan, dir);

    // Upload the finished MP4 (captions already burned in).
    const videoUrl = await uploadFileToCloudinary(rendered.outputPath, 'findasale/video-auto');

    const { title, description } = deriveTitleAndDescription(template, analyses);

    // Thumbnail — a brand title card (clips are video, so we build our own).
    let thumbnailUrl: string | null = null;
    try {
      const thumbPath = path.join(workDir, 'thumb.jpg');
      await buildTitleCard(title || template.displayName, template.displayName, thumbPath);
      thumbnailUrl = await uploadImageToCloudinary(thumbPath, 'findasale/video-auto-thumb');
    } catch (err: any) {
      console.warn('[templateRenderer] thumbnail generation failed (non-fatal):', err?.message ?? err);
    }

    // Wave-4 fan-out contract (videoJobOrchestrator §doc): SocialPost.body =
    // `${title}\n\n${description}` — store the same shape in scriptText now.
    const body = `${title}\n\n${description}`;

    // Create the VideoJob (reuses ADR-078 VideoJob machinery). purpose comes from
    // the template (ATTENTION/PROMO); this bypasses runVideoJobPipeline (which is
    // TUTORIAL-only) because the auto-classify path renders the finished cut itself.
    const job = await prisma.videoJob.create({
      data: {
        trigger: 'MANUAL',
        purpose: template.purpose,
        status: 'AWAITING_REVIEW',
        sourceAssetUrls: analyses.map((a) => a.r2Key),
        scriptText: body,
        rawVideoUrl: videoUrl,
        captionedVideoUrl: videoUrl,
        thumbnailUrl: thumbnailUrl ?? undefined,
        costCents: 0,
      },
      select: { id: true },
    });

    // Stage for approval + move the batch to AWAITING_REVIEW.
    const stagedFile = await writeStagedBatchReviewFile({
      batchId,
      jobId: job.id,
      template,
      templateConfidence: batch.templateConfidence,
      title,
      description,
      videoUrl,
      thumbnailUrl,
      durationSeconds: rendered.durationSeconds,
      fill,
      analyses,
      rationale: batch.reviewNotes,
    });

    await prisma.footageBatch.update({
      where: { id: batchId },
      data: { status: 'AWAITING_REVIEW', videoJobId: job.id, stagedFile },
    });
    // Mark the consumed clips USED (they stay in R2 — retention per §7).
    await prisma.footageAsset
      .updateMany({ where: { batchId, status: 'ANALYZED' }, data: { status: 'USED' } })
      .catch((e) => console.warn('[templateRenderer] could not mark assets USED (non-fatal):', e?.message ?? e));

    console.log(
      `[templateRenderer] Batch ${batchId} RENDERED -> VideoJob ${job.id} (${template.id}, ` +
        `${rendered.durationSeconds.toFixed(1)}s, ${plan.segments.length} segments). Staged: ${stagedFile}`,
    );

    return {
      batchId,
      status: 'AWAITING_REVIEW',
      templateId: template.id,
      videoJobId: job.id,
      stagedFile,
      videoUrl,
      durationSeconds: rendered.durationSeconds,
    };
  } catch (err: any) {
    const message = err?.errorCode ? `${err.errorCode}: ${err.message}` : err?.message ?? String(err);
    console.error(`[templateRenderer] Batch ${batchId} render FAILED:`, message);
    await prisma.footageBatch
      .update({
        where: { id: batchId },
        data: { status: 'FAILED', reviewNotes: `Render error: ${message}`.slice(0, 1000) },
      })
      .catch((e) => console.error(`[templateRenderer] Could not mark batch ${batchId} FAILED:`, e?.message ?? e));
    return { batchId, status: 'FAILED', reason: message };
  } finally {
    inFlight.delete(batchId);
    if (workDir) {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
