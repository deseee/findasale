// packages/backend/scripts/warm-whisper-cache.mjs
//
// ADR-078 Addendum 2 (free/self-hosted video pipeline rebuild, 2026-07-09).
//
// Docker-build-time warm-up: pre-downloads the free, local Whisper ONNX model
// (Xenova/whisper-tiny.en — a public, unauthenticated Hugging Face repo, no
// API key, no account) into a fixed cache directory so captioning.ts never
// needs a network call at runtime and every Railway container starts with the
// model already baked into the image (see Dockerfile.production, which runs
// this script in the runner stage right after node_modules is copied in).
//
// Plain ESM .mjs on purpose: @xenova/transformers ships ESM-only ("type":
// "module", no CJS build). This script runs directly via `node
// warm-whisper-cache.mjs` (Node treats .mjs as ESM natively, top-level await
// works) — it is NOT compiled by tsc and is not under src/, so it never enters
// the backend's CommonJS build. captioning.ts (which DOES compile to
// CommonJS) uses a separate dynamic-import workaround at runtime — see that
// file's module doc for why the two need different loading strategies.

const cacheDir = process.env.WHISPER_CACHE_DIR || '/opt/whisper-cache';

const { pipeline, env } = await import('@xenova/transformers');
env.cacheDir = cacheDir;
env.allowRemoteModels = true;

console.log(`[warm-whisper-cache] downloading Xenova/whisper-tiny.en into ${cacheDir} ...`);
await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
console.log('[warm-whisper-cache] done.');
