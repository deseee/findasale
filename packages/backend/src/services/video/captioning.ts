/**
 * captioning.ts — ADR-078 Addendum 2 (free/self-hosted rebuild, 2026-07-09)
 *
 * Patrick rejected ZapCap ($0.10/min) outright (ADR-078 "Addendum 2 — Vendor
 * spend REJECTED"). This module now transcribes the assembled video's audio
 * locally via a free, self-hosted Whisper model and burns captions in with
 * ffmpeg — zero API cost, zero account, zero per-minute charge.
 *
 * STT engine: Transformers.js (`@xenova/transformers`) running the
 * `Xenova/whisper-tiny.en` model fully in-process via ONNX Runtime — no
 * separate binary to compile, no server to run, npm-installable. The model is
 * downloaded once from a public, unauthenticated Hugging Face repo and baked
 * into the Docker image at build time (Dockerfile.production runs a warm-up
 * script that caches it to /opt/whisper-cache), so production never makes a
 * network call for the model at runtime.
 *
 * Verified working this session in a throwaway sandbox: transcribed a real
 * Piper-synthesized test clip and returned an accurate transcript with
 * word-level timestamps — e.g. input text "Rapid Fire Mode lets you photograph
 * every item in a sale without stopping to type titles or set prices."
 * transcribed back as "Rapid Fire Mode lets you photograph every item in a
 * sale without stopping to type titles or set prices." (Whisper's own
 * capitalization of the product-mode name), with per-word start/end timestamps
 * (e.g. {"text":" Rapid","timestamp":[0,0.46]}).
 *
 * `@xenova/transformers` ships ESM-only ("type": "module", no CJS build) while
 * this backend compiles to CommonJS (tsconfig `module: "commonjs"`). A plain
 * `import`/`require` throws ERR_REQUIRE_ESM at runtime, and TypeScript
 * downlevels a normal dynamic `import()` call to `require()` under a commonjs
 * module target, which hits the same wall. Verified in this session:
 * constructing the dynamic import via `new Function('specifier', 'return
 * import(specifier)')` — a well-known, documented CJS/ESM-interop workaround —
 * bypasses tsc's static rewrite and genuinely `import()`s the ESM module at
 * runtime. Confirmed working end-to-end against the compiled-CommonJS-style
 * entry point in a throwaway sandbox test.
 *
 * Caption burn-in: ffmpeg's `subtitles` filter over an SRT built from
 * Whisper's word-level timestamps (grouped a few words per caption line) —
 * same ffmpeg binary videoAssembly.ts and voiceover.ts already rely on.
 *
 * costCents is always 0 here — there is no per-minute vendor cost anymore. CPU
 * time on infrastructure Patrick is already paying for (Railway) is not new
 * incremental spend, matching his own framing ("we don't even spend that on
 * hosting") — this file does not invent a fake shadow cost to keep the
 * VideoJob.costCents field "interesting."
 *
 * No ZAPCAP_API_KEY reference remains anywhere in this file.
 */

import axios from 'axios';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';
import { WaveFile } from 'wavefile';
import { DEFAULT_SECONDS_PER_SHOT } from './videoAssembly';

const execFileAsync = promisify(execFile);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const WHISPER_MODEL_ID = 'Xenova/whisper-tiny.en';
const WHISPER_CACHE_DIR = process.env.WHISPER_CACHE_DIR || '/opt/whisper-cache';

export interface CaptioningInput {
  rawVideoUrl: string;
  /** Real render duration in seconds, if known — pass videoAssembly.ts's
   *  VideoAssemblyResult.durationSeconds (preferred, since it's ffprobe-measured). */
  durationSeconds?: number;
  /** Used ONLY as a fallback estimate input (shotCount * DEFAULT_SECONDS_PER_SHOT)
   *  when durationSeconds isn't provided. */
  shotCount?: number;
}

export interface CaptioningResult {
  captionedVideoUrl: string;
  /** Always 0 — no per-minute vendor cost in the free/self-hosted pipeline. */
  costCents: number;
  /** The duration value used for record-keeping, for auditability (mirrors the
   *  pre-rebuild field even though it no longer drives a real charge). */
  durationSecondsUsedForCost: number;
  /** true if durationSecondsUsedForCost came from the shotCount estimate rather
   *  than a real ffprobe-measured duration. */
  isEstimatedDuration: boolean;
  /** Real Whisper transcript text — new in this rebuild (ZapCap never exposed
   *  its intermediate transcript to this pipeline; the local Whisper pass does). */
  transcriptText: string;
}

interface WhisperChunk {
  text: string;
  timestamp: [number, number | null];
}

let transcriberPromise: Promise<any> | null = null;

/**
 * Load @xenova/transformers via the Function-constructor dynamic-import trick
 * (see module doc for why) and build the ASR pipeline once, memoized for the
 * process lifetime — model load is the expensive part (~1s once cached),
 * reused across every VideoJob this process handles.
 */
async function getTranscriber(): Promise<any> {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;
      const { pipeline, env } = await dynamicImport('@xenova/transformers');
      env.cacheDir = WHISPER_CACHE_DIR;
      env.allowRemoteModels = true; // fallback for local dev without a pre-warmed cache
      return pipeline('automatic-speech-recognition', WHISPER_MODEL_ID);
    })();
  }
  return transcriberPromise;
}

function downloadToBuffer(url: string): Promise<Buffer> {
  return axios
    .get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: 60000, maxContentLength: 200 * 1024 * 1024 })
    .then((res) => Buffer.from(res.data));
}

async function extractAudioWav(videoPath: string, outputWavPath: string): Promise<void> {
  await execFileAsync('ffmpeg', ['-y', '-i', videoPath, '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav', outputWavPath]);
}

/** Decodes a 16kHz mono WAV into the Float32Array @xenova/transformers expects
 *  — same `wavefile` decode pattern validated in this session's sandbox test. */
async function wavToFloat32(wavPath: string): Promise<Float32Array> {
  const buffer = await fs.readFile(wavPath);
  const wav = new WaveFile(buffer);
  wav.toBitDepth('32f');
  wav.toSampleRate(16000);
  let samples: any = wav.getSamples();
  if (Array.isArray(samples)) samples = samples[0]; // mono after extractAudioWav's -ac 1, but guard anyway
  return samples as Float32Array;
}

function srtTimestamp(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  const ms = Math.round((clamped - Math.floor(clamped)) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/** Groups Whisper's word-level chunks a few words at a time into SRT cues —
 *  same grouping technique validated in this session's sandbox test. Falls
 *  back to a single full-duration cue if no word timestamps came back (e.g. an
 *  unusually short or silent clip). */
function buildSrt(chunks: WhisperChunk[], fallbackText: string, fallbackDuration: number): string {
  if (!chunks || chunks.length === 0) {
    const text = fallbackText || 'FindA.Sale';
    return `1\n${srtTimestamp(0)} --> ${srtTimestamp(fallbackDuration)}\n${text}\n\n`;
  }

  const WORDS_PER_CUE = 3;
  let srt = '';
  let idx = 1;
  for (let i = 0; i < chunks.length; i += WORDS_PER_CUE) {
    const group = chunks.slice(i, i + WORDS_PER_CUE);
    const start = group[0].timestamp[0] ?? 0;
    const lastTimestamp = group[group.length - 1].timestamp[1];
    const end = lastTimestamp ?? start + 1;
    const text = group
      .map((c) => c.text.trim())
      .join(' ')
      .trim();
    if (!text) continue;
    srt += `${idx}\n${srtTimestamp(start)} --> ${srtTimestamp(end)}\n${text}\n\n`;
    idx++;
  }
  return srt;
}

/** Escapes a filesystem path for ffmpeg's `subtitles=` filter argument, which
 *  otherwise treats a bare `:` as a filter-option separator — a documented
 *  ffmpeg gotcha for absolute paths on some platforms/builds. Linux temp paths
 *  used here don't normally contain colons, so this is a defensive no-op in
 *  practice, but cheap insurance. */
function escapeForFfmpegFilterPath(filePath: string): string {
  return filePath.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
}

function uploadFileToCloudinary(filePath: string, folder: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(filePath, { resource_type: 'video', folder }, (error, result) => {
      if (error || !result) return reject(error ?? new Error('No result from Cloudinary'));
      resolve(result.secure_url);
    });
  });
}

/**
 * Transcribe the assembled video's audio locally (Whisper) and burn captions
 * in (ffmpeg). Throws (does not silently degrade) on any stage failure — same
 * "visible failure over fabricated fallback" philosophy the ZapCap wrapper
 * documented, now applied to a local-tooling failure mode instead of a vendor
 * API failure mode. costCents is always 0.
 */
export async function captionVideo(input: CaptioningInput): Promise<CaptioningResult> {
  const { rawVideoUrl } = input;
  if (!rawVideoUrl) {
    const err = new Error('NO_VIDEO: captioning requires a rawVideoUrl from videoAssembly.ts');
    (err as any).errorCode = 'NO_VIDEO';
    throw err;
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'captioning-'));

  try {
    const videoPath = path.join(workDir, 'raw.mp4');
    const videoBuffer = await downloadToBuffer(rawVideoUrl);
    await fs.writeFile(videoPath, videoBuffer);

    const audioWavPath = path.join(workDir, 'audio.wav');
    await extractAudioWav(videoPath, audioWavPath);

    const audioFloat32 = await wavToFloat32(audioWavPath);

    const transcriber = await getTranscriber();
    const result = await transcriber(audioFloat32, { return_timestamps: 'word' });
    const transcriptText: string = (result?.text ?? '').trim();
    const chunks: WhisperChunk[] = Array.isArray(result?.chunks) ? result.chunks : [];

    const isEstimatedDuration = input.durationSeconds === undefined || input.durationSeconds <= 0;
    const durationSecondsUsedForCost = isEstimatedDuration
      ? Math.max(1, (input.shotCount ?? 1) * DEFAULT_SECONDS_PER_SHOT)
      : (input.durationSeconds as number);

    const srtContent = buildSrt(chunks, transcriptText, durationSecondsUsedForCost);
    const srtPath = path.join(workDir, 'captions.srt');
    await fs.writeFile(srtPath, srtContent, 'utf8');

    const captionedPath = path.join(workDir, 'captioned.mp4');
    const subtitlesArg = `subtitles=${escapeForFfmpegFilterPath(srtPath)}:force_style='FontName=Arial,FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00111111,BorderStyle=3,Outline=2,Alignment=2,MarginV=180'`;

    await execFileAsync(
      'ffmpeg',
      ['-y', '-i', videoPath, '-vf', subtitlesArg, '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'copy', captionedPath],
      { maxBuffer: 20 * 1024 * 1024 }
    );

    const stat = await fs.stat(captionedPath);
    if (stat.size < 5000) {
      const err = new Error(`FFMPEG_EMPTY_OUTPUT: captioned video is only ${stat.size} bytes`);
      (err as any).errorCode = 'FFMPEG_EMPTY_OUTPUT';
      throw err;
    }

    const captionedVideoUrl = await uploadFileToCloudinary(captionedPath, 'findasale/video-captioned');

    return {
      captionedVideoUrl,
      costCents: 0,
      durationSecondsUsedForCost,
      isEstimatedDuration,
      transcriptText,
    };
  } catch (error: any) {
    if (error?.errorCode) throw error;
    const message = error?.stderr ? String(error.stderr).slice(-2000) : error?.message ?? String(error);
    const err = new Error(`CAPTIONING_ERROR: ${message}`);
    (err as any).errorCode = 'CAPTIONING_ERROR';
    throw err;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
