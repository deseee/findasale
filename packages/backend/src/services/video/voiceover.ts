/**
 * voiceover.ts — ADR-078 Addendum 2 (free/self-hosted rebuild, 2026-07-09)
 *
 * Patrick rejected the JSON2Video ($49/mo) + ZapCap ($0.10/min) vendor spend
 * outright — see ADR-078 "Addendum 2 — Vendor spend REJECTED, reversed to
 * free/in-house". This module no longer builds a JSON2Video Voice element
 * config; it synthesizes real, local, zero-cost narration audio and uploads it,
 * same as any other pipeline artifact.
 *
 * TTS engine: Piper (https://github.com/rhasspy/piper), MIT-licensed, no API
 * key, no account, no per-call cost, actively used across the local-TTS
 * ecosystem. Runs as a small static binary + a downloaded ONNX voice model, both
 * baked into the Docker image at build time from public, unauthenticated
 * sources — a public GitHub release (piper_linux_x86_64.tar.gz) and a public
 * Hugging Face model repo (rhasspy/piper-voices) — see Dockerfile.production.
 *
 * Verified working this session in a throwaway sandbox: piping narration text
 * into the piper binary produced a real WAV file (22050Hz mono PCM, confirmed
 * via `ffprobe`: real audio stream, non-trivial size, duration matching the
 * input text length, real-time factor ~0.25 — i.e. synthesis is faster than
 * real time).
 *
 * Output is uploaded to Cloudinary via the same `cloudinary.uploader.upload`
 * call shape thumbnailGenerator.ts already uses (resource_type: 'video' is
 * Cloudinary's convention for any audio-only asset too), so
 * VideoJob.voiceoverUrl becomes a real, publicly accessible URL — unlike the
 * old JSON2Video-wrapper version of this file, which deliberately left
 * voiceoverUrl null because JSON2Video never exposed one.
 *
 * No JSON2VIDEO_API_KEY / ZAPCAP_API_KEY references remain anywhere in this file.
 */

import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import fsSync from 'fs';
import os from 'os';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';

const execFileAsync = promisify(execFile);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Baked into the Docker image (Dockerfile.production) at these fixed paths.
// Overridable via env for local dev on a machine where Piper lives elsewhere.
const PIPER_BIN_PATH = process.env.PIPER_BIN_PATH || '/opt/piper/piper';
const PIPER_MODEL_PATH = process.env.PIPER_MODEL_PATH || '/opt/piper/voices/en_US-amy-medium.onnx';
// Piper's shared libs (libpiper_phonemize.so, libonnxruntime.so, etc.) ship
// alongside the binary in the same directory. Dockerfile.production also sets
// LD_LIBRARY_PATH globally, but it's passed explicitly here too so this module
// keeps working even if a process manager strips inherited env vars.
const PIPER_LIB_DIR = process.env.PIPER_LIB_DIR || path.dirname(PIPER_BIN_PATH);

export interface VoiceoverInput {
  scriptText: string;
}

export interface VoiceoverResult {
  /** Real, publicly-accessible Cloudinary URL for the synthesized WAV narration. */
  voiceoverUrl: string;
  /** Real ffprobe-measured duration in seconds — feeds videoAssembly.ts's
   *  duration math (audio length drives the assembled video's total length). */
  durationSeconds: number;
}

function runPiper(text: string, outputWavPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      PIPER_BIN_PATH,
      ['--model', PIPER_MODEL_PATH, '--output_file', outputWavPath],
      {
        env: {
          ...process.env,
          LD_LIBRARY_PATH: [PIPER_LIB_DIR, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':'),
        },
      }
    );

    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      const wrapped = new Error(`PIPER_SPAWN_ERROR: ${err.message}`);
      (wrapped as any).errorCode = 'PIPER_SPAWN_ERROR';
      reject(wrapped);
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        const err = new Error(`PIPER_RENDER_ERROR: piper exited ${code}: ${stderr.slice(-2000) || 'no stderr output'}`);
        (err as any).errorCode = 'PIPER_RENDER_ERROR';
        reject(err);
      }
    });

    child.stdin.write(text);
    child.stdin.end();
  });
}

async function ffprobeDurationSeconds(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  const seconds = parseFloat(stdout.trim());
  return Number.isFinite(seconds) ? seconds : 0;
}

function uploadFileToCloudinary(filePath: string, folder: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      filePath,
      { resource_type: 'video', folder }, // Cloudinary's resource_type for audio-only files is also 'video'
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('No result from Cloudinary'));
        resolve(result.secure_url);
      }
    );
  });
}

/**
 * Synthesize real narration audio for a TUTORIAL script locally via Piper — zero
 * API cost, zero external account. Throws a tagged error if the Piper binary/model
 * baked into the Docker image is missing (PIPER_NOT_FOUND / PIPER_MODEL_NOT_FOUND)
 * or if synthesis itself fails (PIPER_RENDER_ERROR / PIPER_EMPTY_OUTPUT) — same
 * "visible failure over fabricated fallback" philosophy the JSON2Video wrapper
 * used, just for a different failure class (missing local tooling instead of a
 * missing API key).
 */
export async function synthesizeVoiceover(input: VoiceoverInput): Promise<VoiceoverResult> {
  const text = (input.scriptText || '').trim();
  if (!text) {
    const err = new Error('NO_SCRIPT: voiceover requires non-empty scriptText');
    (err as any).errorCode = 'NO_SCRIPT';
    throw err;
  }

  if (!fsSync.existsSync(PIPER_BIN_PATH)) {
    const err = new Error(
      `PIPER_NOT_FOUND: Piper binary not found at ${PIPER_BIN_PATH} — Dockerfile.production should have installed it at build time`
    );
    (err as any).errorCode = 'PIPER_NOT_FOUND';
    throw err;
  }
  if (!fsSync.existsSync(PIPER_MODEL_PATH)) {
    const err = new Error(
      `PIPER_MODEL_NOT_FOUND: Piper voice model not found at ${PIPER_MODEL_PATH} — Dockerfile.production should have downloaded it at build time`
    );
    (err as any).errorCode = 'PIPER_MODEL_NOT_FOUND';
    throw err;
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'voiceover-'));
  const outputWavPath = path.join(workDir, 'voiceover.wav');

  try {
    await runPiper(text, outputWavPath);

    const stat = await fs.stat(outputWavPath);
    if (stat.size < 1000) {
      const err = new Error(`PIPER_EMPTY_OUTPUT: rendered WAV is only ${stat.size} bytes — synthesis likely failed silently`);
      (err as any).errorCode = 'PIPER_EMPTY_OUTPUT';
      throw err;
    }

    const durationSeconds = await ffprobeDurationSeconds(outputWavPath);
    const voiceoverUrl = await uploadFileToCloudinary(outputWavPath, 'findasale/video-voiceovers');

    return { voiceoverUrl, durationSeconds };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
