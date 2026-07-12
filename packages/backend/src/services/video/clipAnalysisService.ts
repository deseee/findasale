/**
 * clipAnalysisService.ts — ADR-080 §5 (Per-Clip Understanding -> ClipAnalysis).
 *
 * CLIP ANALYSIS + CLASSIFICATION stage (understanding only — NO rendering; that
 * is the separate render stage). For each raw FootageAsset uploaded to R2, this
 * service runs three signal extractors and fuses them with one grounded Claude
 * Haiku classification pass into a typed `ClipAnalysis`:
 *
 *   1. Caption OCR (the PRIMARY metadata engine) — ffmpeg scene-change keyframes
 *      + `ppu-paddle-ocr` (PaddleOCR PP-OCRv6 small ONNX, Node-native, no Python)
 *      read Patrick's burned-in YouCut on-screen captions ("Paid $4", "Sale 1",
 *      "This lamp sat in a basement 40 years"). Adjacent-frame duplicate caption
 *      text is time-grouped into ordered spans (video-subtitle-extractor logic).
 *   2. Whisper VO transcript — the EXISTING @xenova/transformers transcriber in
 *      captioning.ts (reused via transcribeLocalVideoFile — no new STT lib).
 *   3. Vision frame labels — the EXISTING Google Vision integration in
 *      cloudAIService.getVisionLabels (reused — no new Vision client).
 *
 * The fused signals are handed to Claude Haiku (the locked AI chain — same model
 * env var, axios shape, aiCostTracker cost-ceiling, and grounding/brand rules as
 * scriptGenerator.ts) which returns a strict-JSON { role, roleConfidence, facts,
 * ordering } classification. GROUNDING (ADR-078/§13 carried): the model may use
 * ONLY the extracted OCR/VO/Vision signal — it may NOT invent a price, item, room,
 * or hook line that is not present in the signal. If Haiku is unavailable or over
 * the cost ceiling, a deterministic signal-only fallback classifier keeps the clip
 * analyzable at low confidence (so the batch degrades to the §6 one-question gate
 * rather than crashing) — never a fabricated high-confidence guess.
 *
 * The result is persisted onto the FootageAsset (typed columns role/roleConfidence
 * /ocrCaptions/transcript/durationMs + the full analysisJson blob) and the asset is
 * moved to ANALYZED (or UNUSABLE when no signal at all could be extracted — kept,
 * never silently dropped, per ADR-080 §6.3 fail-loud).
 *
 * NOTE ON MODEL PROVISIONING: `ppu-paddle-ocr` fetches its PP-OCRv6 small .ort
 * models on first run and caches them under ~/.cache/ppu-paddle-ocr (exactly like
 * captioning.ts's Whisper cache). Provisioning is lazy-runtime by default (works
 * with zero Docker change — first analysis downloads from the public GitHub source);
 * Dockerfile.production SHOULD add a build-time `PaddleOcrService.downloadModels()`
 * warm step to avoid a cold first-run network fetch (mirrors the warm-whisper-cache
 * step). See the handoff notes for the exact Dockerfile line.
 */

import axios from 'axios';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { prisma } from '../../lib/prisma';
import { getPresignedFootageUrl, inferMediaTypeFromKey } from './r2Client';
import { transcribeLocalVideoFile } from './captioning';
import { getVisionLabels } from '../cloudAIService';
import {
  trackAITokens,
  estimateTokensForRequest,
  isAICostCeilingExceeded,
  ANTHROPIC_COST_PER_M_TOKENS,
  recordApiUsage,
} from '../../lib/aiCostTracker';

// Single canonical ClipRole list — re-exported from templates/types so the
// template layer and this service can never diverge (ADR-080 §5.2 / §9 rule).
import type { ClipRole } from './templates/types';
export type { ClipRole };

const execFileAsync = promisify(execFile);

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

// ---------------------------------------------------------------------------
// The ClipAnalysis contract (ADR-080 §5.2 — verbatim shape).
// ---------------------------------------------------------------------------

export interface ClipFacts {
  prices: number[];           // parsed from OCR ("Paid $4","$35","Retail $430+") + VO, USD
  itemName?: string;          // "brass floor lamp" — OCR/VO/Vision consensus
  room?: string;              // "reading nook" — room-styling seasons
  hookLine?: string;          // verbatim strong on-screen line for a HOOK clip
  saleOrdinal?: number;       // "Sale 1" -> 1; drives batch ordering
  isScreenRecording: boolean; // Vision "UI/screenshot" + no physical scene => MAP beat
}

export interface ClipSignalConfidence {
  ocr: number;     // 0-1, PaddleOCR mean line confidence (proxy: coverage)
  whisper: number; // 0-1
  vision: number;  // 0-1
}

export interface ClipAnalysis {
  assetId: string;
  r2Key: string;
  durationMs: number;
  mediaType: 'video' | 'image';

  role: ClipRole;
  roleConfidence: number;     // 0-1 fused confidence -> ADR-080 §6 thresholds
  facts: ClipFacts;

  ordering: {
    saleOrdinal?: number;     // explicit "Sale N" caption wins
    uploadIndex: number;      // fallback: order clips arrived in the batch
    isLikelyOpener: boolean;  // HOOK/BEFORE/MAP heuristic
    isLikelyCloser: boolean;  // CTA/AFTER heuristic
  };

  signals: ClipSignalConfidence;
  rawCaptions: string[];      // ordered OCR spans (audit + staged-file display)
  transcript: string;         // Whisper text
  notes?: string;             // classifier rationale, surfaced in the staged file
}

export interface AnalyzeClipInput {
  assetId: string;
  r2Key: string;
  /** Order this clip arrived in its batch (fallback ordering hint). */
  uploadIndex?: number;
}

// ---------------------------------------------------------------------------
// ppu-paddle-ocr — lazy, memoized service (ESM-only package; CommonJS backend
// reaches it via the Function-constructor dynamic-import trick, identical to the
// captioning.ts @xenova workaround, so tsc's commonjs downlevel can't rewrite it
// into a require() that throws ERR_REQUIRE_ESM).
// ---------------------------------------------------------------------------

let ocrServicePromise: Promise<any> | null = null;

async function getOcrService(): Promise<any | null> {
  if (!ocrServicePromise) {
    ocrServicePromise = (async () => {
      const dynamicImport = new Function('specifier', 'return import(specifier)') as (
        specifier: string
      ) => Promise<any>;
      const mod = await dynamicImport('ppu-paddle-ocr');
      const PaddleOcrService = mod.PaddleOcrService ?? mod.default?.PaddleOcrService;
      if (!PaddleOcrService) {
        throw new Error('ppu-paddle-ocr: PaddleOcrService export not found');
      }
      // canvas-native engine avoids the heavier OpenCV.js path; CPU-only ONNX.
      const service = new PaddleOcrService({
        processing: { engine: 'canvas-native' },
        session: { executionProviders: ['cpu'] },
      });
      await service.initialize();
      return service;
    })().catch((err) => {
      // Reset so a transient init failure can retry on the next clip, and let OCR
      // degrade to "no captions" rather than crash the whole analysis.
      ocrServicePromise = null;
      console.warn('[clipAnalysis] OCR service init failed — continuing without OCR:', err?.message ?? err);
      return null;
    });
  }
  return ocrServicePromise;
}

// ---------------------------------------------------------------------------
// Small local ffmpeg/ffprobe + download helpers (ffmpeg is already in the
// runtime — same binary captioning.ts / videoAssembly.ts rely on).
// ---------------------------------------------------------------------------

const MAX_KEYFRAMES = 8;          // cap OCR/Vision cost per clip
const MAX_VISION_FRAMES = 3;      // ADR-080 §5.1 "1-3 representative frames"

async function downloadToFile(url: string, dest: string): Promise<void> {
  const res = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: 120000,
    maxContentLength: 500 * 1024 * 1024,
  });
  await fs.writeFile(dest, Buffer.from(res.data));
}

async function ffprobeDurationMs(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    const seconds = parseFloat(String(stdout).trim());
    return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null;
  } catch {
    return null;
  }
}

/**
 * Extract ordered keyframes. Primary: ffmpeg scene-change filter (ADR-080 reuse
 * stack — select='gt(scene,0.3)'). Fallback: a fixed cadence (one frame every
 * ~2s) when the scene filter yields too few frames (a static clip with burned
 * captions can have almost no scene changes yet still carry the key caption text).
 * Returns absolute keyframe file paths in time order (capped at MAX_KEYFRAMES).
 */
async function extractKeyframes(videoPath: string, workDir: string): Promise<string[]> {
  const scenePattern = path.join(workDir, 'kf-scene-%03d.png');
  try {
    await execFileAsync(
      'ffmpeg',
      ['-y', '-i', videoPath, '-vf', "select='gt(scene,0.3)',showinfo", '-vsync', 'vfr',
       '-frames:v', String(MAX_KEYFRAMES), scenePattern],
      { maxBuffer: 20 * 1024 * 1024 }
    );
  } catch {
    /* fall through to cadence fallback */
  }

  let frames = (await fs.readdir(workDir))
    .filter((f) => f.startsWith('kf-scene-') && f.endsWith('.png'))
    .sort()
    .map((f) => path.join(workDir, f));

  if (frames.length >= 2) return frames.slice(0, MAX_KEYFRAMES);

  // Cadence fallback: one frame every 2 seconds.
  const cadencePattern = path.join(workDir, 'kf-cad-%03d.png');
  try {
    await execFileAsync(
      'ffmpeg',
      ['-y', '-i', videoPath, '-vf', 'fps=1/2', '-frames:v', String(MAX_KEYFRAMES), cadencePattern],
      { maxBuffer: 20 * 1024 * 1024 }
    );
  } catch {
    /* ignore — may already have 0-1 scene frame */
  }

  frames = (await fs.readdir(workDir))
    .filter((f) => (f.startsWith('kf-scene-') || f.startsWith('kf-cad-')) && f.endsWith('.png'))
    .sort()
    .map((f) => path.join(workDir, f));

  return frames.slice(0, MAX_KEYFRAMES);
}

// ---------------------------------------------------------------------------
// OCR: run PaddleOCR on each keyframe, then dedupe + time-group adjacent
// identical caption text into ordered spans (video-subtitle-extractor model).
// ---------------------------------------------------------------------------

function normalizeCaption(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Collapse adjacent frames that read the same (or near-same) caption into one
 *  ordered span, so a caption shown across 4 keyframes becomes one line, in the
 *  order it appeared on screen. */
function timeGroupCaptions(perFrameText: string[]): string[] {
  const spans: string[] = [];
  let last = '';
  for (const raw of perFrameText) {
    const text = normalizeCaption(raw);
    if (!text) continue;
    // Skip if identical to, or fully contained in, the immediately previous span
    // (a caption lingering across consecutive keyframes).
    if (text === last) continue;
    if (last && (last.includes(text) || text.includes(last))) {
      // keep the longer of the two (the fuller caption)
      if (text.length > last.length) {
        spans[spans.length - 1] = text;
        last = text;
      }
      continue;
    }
    spans.push(text);
    last = text;
  }
  return spans;
}

async function runOcrOnFrames(framePaths: string[]): Promise<{ captions: string[]; confidence: number }> {
  if (framePaths.length === 0) return { captions: [], confidence: 0 };
  const service = await getOcrService();
  if (!service) return { captions: [], confidence: 0 };

  const perFrameText: string[] = [];
  let framesWithText = 0;
  for (const fp of framePaths) {
    try {
      const result = await service.recognize(fp);
      const text: string = normalizeCaption(String(result?.text ?? ''));
      if (text) framesWithText++;
      perFrameText.push(text);
    } catch (err: any) {
      console.warn(`[clipAnalysis] OCR failed on ${path.basename(fp)}:`, err?.message ?? err);
      perFrameText.push('');
    }
  }

  const captions = timeGroupCaptions(perFrameText);
  // Confidence proxy: fraction of keyframes that yielded any caption text. The
  // PP-OCRv6 result surface here is text-only; coverage is the honest signal we
  // have without per-box scores, so we use it rather than fabricate a number.
  const confidence = framePaths.length > 0 ? framesWithText / framePaths.length : 0;
  return { captions, confidence };
}

// ---------------------------------------------------------------------------
// Vision: label 1-3 representative keyframes via the existing Google Vision
// integration; derive a screen-recording signal for the MAP beat.
// ---------------------------------------------------------------------------

interface VisionResult {
  objectLabels: string[];
  detectedText: string[];
  isScreenRecording: boolean;
  confidence: number;
}

const SCREEN_RECORD_HINTS = [
  'screenshot', 'map', 'text', 'font', 'software', 'web page', 'website',
  'user interface', 'ui', 'screen', 'display device', 'mobile phone', 'menu', 'icon',
];

function pickVisionFrames(framePaths: string[]): string[] {
  if (framePaths.length <= MAX_VISION_FRAMES) return framePaths;
  const first = framePaths[0];
  const mid = framePaths[Math.floor(framePaths.length / 2)];
  const last = framePaths[framePaths.length - 1];
  return Array.from(new Set([first, mid, last]));
}

async function runVisionOnFrames(framePaths: string[]): Promise<VisionResult> {
  const frames = pickVisionFrames(framePaths);
  const objectLabels: string[] = [];
  const detectedText: string[] = [];
  let calls = 0;
  let ok = 0;
  for (const fp of frames) {
    calls++;
    try {
      const b64 = (await fs.readFile(fp)).toString('base64');
      const v = await getVisionLabels(b64);
      if (v.objectLabels?.length || v.detectedText?.length) ok++;
      objectLabels.push(...(v.objectLabels ?? []));
      detectedText.push(...(v.detectedText ?? []));
    } catch (err: any) {
      console.warn('[clipAnalysis] Vision failed on a frame:', err?.message ?? err);
    }
  }
  const lowered = objectLabels.map((l) => l.toLowerCase());
  const screenHits = lowered.filter((l) => SCREEN_RECORD_HINTS.some((h) => l.includes(h))).length;
  // Screen-record if the frame reads as UI/map/text-dominant and shows no strong
  // physical-scene labels (furniture / room / person).
  const physicalHits = lowered.filter((l) =>
    ['furniture', 'room', 'chair', 'table', 'person', 'wood', 'living room', 'lamp', 'shelf'].some((h) => l.includes(h))
  ).length;
  const isScreenRecording = screenHits >= 2 && screenHits > physicalHits;
  const confidence = calls > 0 ? ok / calls : 0;
  return { objectLabels: Array.from(new Set(objectLabels)), detectedText: Array.from(new Set(detectedText)), isScreenRecording, confidence };
}

// ---------------------------------------------------------------------------
// Signal parsing helpers (deterministic, grounded in real captions/transcript).
// ---------------------------------------------------------------------------

const PRICE_RE = /\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/g;
const SALE_ORDINAL_RE = /\bsale\s+(\d{1,2})\b/i;

function parsePrices(sources: string[]): number[] {
  const out: number[] = [];
  for (const s of sources) {
    let m: RegExpExecArray | null;
    PRICE_RE.lastIndex = 0;
    while ((m = PRICE_RE.exec(s)) !== null) {
      const n = parseFloat(m[1].replace(/,/g, ''));
      if (Number.isFinite(n)) out.push(n);
    }
  }
  return out;
}

function parseSaleOrdinal(captions: string[]): number | undefined {
  for (const c of captions) {
    const m = c.match(SALE_ORDINAL_RE);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Haiku classification (fusion) — the locked chain (scriptGenerator.ts pattern).
// ---------------------------------------------------------------------------

interface HaikuClassification {
  role: ClipRole;
  roleConfidence: number;
  facts: Partial<ClipFacts>;
  ordering?: { isLikelyOpener?: boolean; isLikelyCloser?: boolean };
  notes?: string;
}

const VALID_ROLES: ClipRole[] = ['HOOK', 'FIND', 'PRICE_REVEAL', 'BEFORE', 'AFTER', 'MAP', 'STYLING', 'CTA', 'UNKNOWN'];

function buildClassificationPrompt(signal: {
  captions: string[];
  transcript: string;
  visionLabels: string[];
  detectedText: string[];
  isScreenRecording: boolean;
  durationMs: number;
  parsedPrices: number[];
  parsedSaleOrdinal?: number;
}): string {
  const payload = {
    orderedOnScreenCaptions: signal.captions,
    spokenTranscript: signal.transcript,
    visionLabels: signal.visionLabels,
    visionDetectedText: signal.detectedText,
    looksLikeScreenRecording: signal.isScreenRecording,
    durationMs: signal.durationMs,
    pricesFoundInText: signal.parsedPrices,
    saleOrdinalFoundInCaption: signal.parsedSaleOrdinal ?? null,
  };

  return `You classify ONE short vertical video clip for a secondary-sale (estate/garage/flea) social video. You are given only extracted signals from the clip. Assign the clip's ROLE and pull out FACTS.

HARD GROUNDING RULE: Use ONLY the signals below. Never invent a price, item name, room, or on-screen line that is not present in the captions, transcript, or vision text. If a fact is not in the signals, omit it — omission is correct, invention is never correct. Prices must come from pricesFoundInText (or clearly from a caption/transcript); do not guess a number.

ROLE — choose exactly one from this set:
- HOOK: an opening attention line (a strong spoken/on-screen statement, e.g. "This sat in a basement 40 years"). Usually early, no price.
- FIND: showing a found item.
- PRICE_REVEAL: a price is the point of the clip (e.g. "Paid $4", "Paid $4 / Resale $35"). Set this over FIND when a price dominates.
- BEFORE: an empty / unstyled room or a starting state.
- AFTER: the finished / styled state of a room or item.
- MAP: a screen recording of a map / app / listings (looksLikeScreenRecording true, no physical scene).
- STYLING: building / cleaning / styling / a time-lapse.
- CTA: a closing call to action.
- UNKNOWN: the signals genuinely do not support any single role.

roleConfidence: 0.0-1.0. Be honest. If captions/transcript are empty or contradictory, use a LOW confidence (below 0.5) rather than a confident guess.

FACTS to extract (only if grounded in the signals):
- prices: array of USD numbers actually present in the text.
- itemName: the item shown, if named in caption/transcript/vision (short noun phrase).
- room: the room, if named (room-styling clips).
- hookLine: for a HOOK role only, the verbatim strong line from the captions/transcript.
- saleOrdinal: integer if a caption says "Sale N".
- isScreenRecording: boolean.

ordering: isLikelyOpener (HOOK/BEFORE/MAP-style opener) and isLikelyCloser (CTA/AFTER-style closer).
notes: one short sentence on WHY you chose this role (for a human reviewer). Do not use the word "AI".

SIGNALS (JSON, the ONLY source of truth):
${JSON.stringify(payload, null, 2)}

Respond with ONLY valid JSON, exactly this shape:
{
  "role": "ROLE_ENUM",
  "roleConfidence": 0.0,
  "facts": { "prices": [], "itemName": "", "room": "", "hookLine": "", "saleOrdinal": null, "isScreenRecording": false },
  "ordering": { "isLikelyOpener": false, "isLikelyCloser": false },
  "notes": ""
}`;
}

async function classifyWithHaiku(prompt: string): Promise<{ result: HaikuClassification; costCents: number } | null> {
  if (!ANTHROPIC_API_KEY) return null;
  if (await isAICostCeilingExceeded()) return null;

  const estimatedTokens = estimateTokensForRequest(prompt, false);
  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: ANTHROPIC_MODEL,
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const content: string = response.data.content?.[0]?.text ?? '';
    const responseTokens = Math.ceil(content.length / 4) + 50;
    await trackAITokens(estimatedTokens + responseTokens);
    await recordApiUsage('anthropic:video_pipeline', (estimatedTokens + responseTokens) / 1_000_000 * ANTHROPIC_COST_PER_M_TOKENS);

    const raw = content.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(raw) as HaikuClassification;
    const costCents = Math.round(((estimatedTokens + responseTokens) / 1_000_000) * ANTHROPIC_COST_PER_M_TOKENS * 100);
    return { result: parsed, costCents };
  } catch (err: any) {
    console.warn('[clipAnalysis] Haiku classification failed — falling back to signal-only classifier:', err?.message ?? err);
    return null;
  }
}

/**
 * Deterministic signal-only fallback classifier. Used when Haiku is unavailable
 * (no key / over ceiling / parse error). Grounded purely in the extracted signals
 * and intentionally CONSERVATIVE on confidence so the batch drops to the §6
 * one-question gate rather than auto-shipping a guess.
 */
function fallbackClassify(signal: {
  captions: string[];
  transcript: string;
  isScreenRecording: boolean;
  parsedPrices: number[];
  parsedSaleOrdinal?: number;
}): HaikuClassification {
  const joined = `${signal.captions.join(' ')} ${signal.transcript}`.toLowerCase();
  let role: ClipRole = 'UNKNOWN';
  let confidence = 0.35;

  if (signal.isScreenRecording) {
    role = 'MAP';
    confidence = 0.55;
  } else if (signal.parsedPrices.length > 0) {
    role = 'PRICE_REVEAL';
    confidence = 0.5;
  } else if (/\b(free to browse|finda\.sale|near you|check the map|link)\b/.test(joined)) {
    role = 'CTA';
    confidence = 0.45;
  } else if (/\bbefore\b/.test(joined)) {
    role = 'BEFORE';
    confidence = 0.4;
  } else if (/\bafter\b/.test(joined)) {
    role = 'AFTER';
    confidence = 0.4;
  } else if (signal.captions.length > 0) {
    role = 'FIND';
    confidence = 0.4;
  }

  return {
    role,
    roleConfidence: confidence,
    facts: {
      prices: signal.parsedPrices,
      saleOrdinal: signal.parsedSaleOrdinal,
      isScreenRecording: signal.isScreenRecording,
    },
    ordering: {
      isLikelyOpener: role === 'MAP' || role === 'BEFORE',
      isLikelyCloser: role === 'CTA' || role === 'AFTER',
    },
    notes: 'Signal-only classification (language model unavailable this pass).',
  };
}

// ---------------------------------------------------------------------------
// Public API — analyzeClip / analyzeBatch (ADR-080 §5.2 signatures).
// ---------------------------------------------------------------------------

function clampConfidence(n: unknown, fallback = 0): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(1, v));
}

function cleanStr(s: unknown): string | undefined {
  if (typeof s !== 'string') return undefined;
  const t = s.trim();
  return t.length > 0 ? t : undefined;
}

/**
 * Analyze a single FootageAsset end-to-end and PERSIST the ClipAnalysis onto the
 * row. Always resolves (never throws) — a clip that cannot be downloaded or that
 * yields no signal is marked UNUSABLE and returned with role UNKNOWN, so one bad
 * clip can never abort the whole batch (ADR-080 §6.3 fail-loud, never drop).
 */
export async function analyzeClip(input: AnalyzeClipInput): Promise<ClipAnalysis> {
  const { assetId, r2Key } = input;
  const uploadIndex = input.uploadIndex ?? 0;
  const mediaType = inferMediaTypeFromKey(r2Key);

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-analysis-'));
  let durationMs = 0;
  let captions: string[] = [];
  let transcript = '';
  let ocrConfidence = 0;
  let whisperConfidence = 0;
  let vision: VisionResult = { objectLabels: [], detectedText: [], isScreenRecording: false, confidence: 0 };

  try {
    const url = await getPresignedFootageUrl(r2Key);
    const isVideo = mediaType === 'video';
    const localPath = path.join(workDir, isVideo ? 'clip.mp4' : 'clip.img');
    await downloadToFile(url, localPath);

    let framePaths: string[] = [];
    if (isVideo) {
      durationMs = (await ffprobeDurationMs(localPath)) ?? 0;
      framePaths = await extractKeyframes(localPath, workDir);
    } else {
      framePaths = [localPath]; // an image IS its own single keyframe
    }

    // Run the three extractors. OCR + Vision operate on keyframes; Whisper on the
    // full video audio. Each is best-effort — a failure yields an empty signal,
    // never a thrown error, so partial understanding still classifies.
    const [ocrOut, visionOut, transcriptOut] = await Promise.all([
      runOcrOnFrames(framePaths),
      runVisionOnFrames(framePaths),
      isVideo
        ? transcribeLocalVideoFile(localPath).catch((err: any) => {
            console.warn('[clipAnalysis] Whisper transcript failed:', err?.message ?? err);
            return { text: '', chunks: [] as any[] };
          })
        : Promise.resolve({ text: '', chunks: [] as any[] }),
    ]);

    captions = ocrOut.captions;
    ocrConfidence = ocrOut.confidence;
    vision = visionOut;
    transcript = (transcriptOut?.text ?? '').trim();
    whisperConfidence = transcript.length > 0 ? 0.7 : 0;
  } catch (err: any) {
    console.warn(`[clipAnalysis] Signal extraction failed for asset ${assetId} (${r2Key}):`, err?.message ?? err);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }

  // Deterministic parses (grounded).
  const parsedPrices = parsePrices([...captions, transcript]);
  const parsedSaleOrdinal = parseSaleOrdinal(captions);
  const hasAnySignal = captions.length > 0 || transcript.length > 0 || vision.objectLabels.length > 0;

  // Fuse via Haiku (or fallback).
  let classification: HaikuClassification;
  if (hasAnySignal) {
    const prompt = buildClassificationPrompt({
      captions,
      transcript,
      visionLabels: vision.objectLabels,
      detectedText: vision.detectedText,
      isScreenRecording: vision.isScreenRecording,
      durationMs,
      parsedPrices,
      parsedSaleOrdinal,
    });
    const haiku = await classifyWithHaiku(prompt);
    classification = haiku
      ? haiku.result
      : fallbackClassify({ captions, transcript, isScreenRecording: vision.isScreenRecording, parsedPrices, parsedSaleOrdinal });
  } else {
    // No signal at all — genuinely unusable. Never silently drop (§6.3).
    classification = {
      role: 'UNKNOWN',
      roleConfidence: 0,
      facts: { prices: [], isScreenRecording: false },
      ordering: { isLikelyOpener: false, isLikelyCloser: false },
      notes: 'No OCR, transcript, or vision signal could be extracted — clip unusable.',
    };
  }

  // Validate/normalize the role.
  const role: ClipRole = VALID_ROLES.includes(classification.role) ? classification.role : 'UNKNOWN';
  const roleConfidence = clampConfidence(classification.roleConfidence, 0);

  // Merge grounded parses with model facts (parses win for prices/ordinal — they
  // are deterministic and cannot hallucinate).
  const facts: ClipFacts = {
    prices: parsedPrices.length > 0 ? parsedPrices : (Array.isArray(classification.facts?.prices) ? classification.facts!.prices!.filter((n) => Number.isFinite(n)) : []),
    itemName: cleanStr(classification.facts?.itemName),
    room: cleanStr(classification.facts?.room),
    hookLine: role === 'HOOK' ? cleanStr(classification.facts?.hookLine) : undefined,
    saleOrdinal: parsedSaleOrdinal ?? (Number.isFinite(classification.facts?.saleOrdinal as number) ? (classification.facts!.saleOrdinal as number) : undefined),
    isScreenRecording: vision.isScreenRecording || classification.facts?.isScreenRecording === true,
  };

  const analysis: ClipAnalysis = {
    assetId,
    r2Key,
    durationMs,
    mediaType,
    role,
    roleConfidence,
    facts,
    ordering: {
      saleOrdinal: facts.saleOrdinal,
      uploadIndex,
      isLikelyOpener: classification.ordering?.isLikelyOpener === true || role === 'HOOK' || role === 'BEFORE' || role === 'MAP',
      isLikelyCloser: classification.ordering?.isLikelyCloser === true || role === 'CTA' || role === 'AFTER',
    },
    signals: {
      ocr: clampConfidence(ocrConfidence),
      whisper: clampConfidence(whisperConfidence),
      vision: clampConfidence(vision.confidence),
    },
    rawCaptions: captions,
    transcript,
    notes: cleanStr(classification.notes),
  };

  // PERSIST onto the FootageAsset (typed columns + full analysisJson blob).
  await prisma.footageAsset.update({
    where: { id: assetId },
    data: {
      status: hasAnySignal ? 'ANALYZED' : 'UNUSABLE',
      role,
      roleConfidence,
      ocrCaptions: captions,
      transcript: transcript || null,
      durationMs: durationMs > 0 ? durationMs : undefined,
      analysisJson: analysis as unknown as any,
    },
  });

  return analysis;
}

/**
 * Analyze every asset in a batch (ADR-080 §5.2). Sequential to bound peak memory
 * and native ONNX thread contention (OCR + Whisper are both CPU/ONNX heavy). The
 * upload order (createdAt) is the fallback ordering hint per clip.
 */
export async function analyzeBatch(batchId: string): Promise<ClipAnalysis[]> {
  const assets = await prisma.footageAsset.findMany({
    where: { batchId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, r2Key: true },
  });

  const analyses: ClipAnalysis[] = [];
  for (let i = 0; i < assets.length; i++) {
    const a = assets[i];
    const analysis = await analyzeClip({ assetId: a.id, r2Key: a.r2Key, uploadIndex: i });
    analyses.push(analysis);
  }
  return analyses;
}
