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

// HARD RULE: this script is a build-time OPTIMIZATION ONLY (avoid a slow first
// request at runtime). It must never fail the Docker build / block a deploy.
// captioning.ts already sets `allowRemoteModels = true` and will lazily
// download the model itself on first real use if this pre-warm step didn't
// run or didn't finish (see that file's `getTranscriber()`), so a failure
// here just means the first real caption job pays the download cost instead
// of the Docker build paying it. Root-caused 2026-07-10 (S1106): a Railway
// build failed hard here — the visible error was a red herring from
// @xenova/transformers' internal model-class fallback chain (tries
// AutoModelForSpeechSeq2Seq first, silently swallows that failure, falls
// through to AutoModelForCTC, which threw "Unsupported model type: whisper"
// — the ACTUAL seq2seq failure reason never surfaces). Rather than chase a
// masked, possibly-transient (shared build-machine network/HF rate limit)
// error, this step is now structurally non-fatal so no future flake here can
// ever take down the whole backend deploy again.
try {
  const { pipeline, env } = await import('@xenova/transformers');
  env.cacheDir = cacheDir;
  env.allowRemoteModels = true;

  console.log(`[warm-whisper-cache] downloading Xenova/whisper-tiny.en into ${cacheDir} ...`);
  await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
  console.log('[warm-whisper-cache] done.');
} catch (err) {
  console.warn('[warm-whisper-cache] WARNING: pre-warm failed, continuing build. Whisper will download lazily at runtime on first caption job instead.');
  console.warn(err && err.stack ? err.stack : String(err));
}
// Always exit 0 — never fail the Docker build over this optimization.
process.exit(0);
