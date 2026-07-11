// packages/backend/scripts/warm-paddle-ocr-cache.mjs
//
// ADR-080 §5.1 (auto-classify clip analysis — caption OCR engine).
//
// Docker-build-time warm-up: pre-downloads the free PP-OCRv6 small ONNX (.ort)
// models used by `ppu-paddle-ocr` (public, unauthenticated GitHub source, no API
// key, no account) into the package's default cache (~/.cache/ppu-paddle-ocr) so
// clipAnalysisService.ts never needs a network call at runtime. Runs in the
// Dockerfile.production RUNNER stage (same stage/user as the Whisper warm-up), so
// the populated ~/.cache is baked into the final image and the runtime container
// starts with the models already present.
//
// Plain ESM .mjs on purpose: ppu-paddle-ocr is ESM-only, exactly like
// @xenova/transformers. This script runs directly via `node
// warm-paddle-ocr-cache.mjs` (native ESM, top-level await) and is NOT compiled by
// tsc. clipAnalysisService.ts (CommonJS build) uses the Function-constructor
// dynamic-import workaround at runtime — same split as captioning.ts / Whisper.
//
// HARD RULE: build-time OPTIMIZATION ONLY. It must never fail the Docker build.
// clipAnalysisService.ts downloads the models lazily on first real use if this
// pre-warm did not run or did not finish, so a failure here just moves the
// one-time download cost to the first real clip-analysis job. Always exit 0.
try {
  const mod = await import('ppu-paddle-ocr');
  const PaddleOcrService = mod.PaddleOcrService ?? mod.default?.PaddleOcrService;
  if (!PaddleOcrService) throw new Error('PaddleOcrService export not found');
  console.log('[warm-paddle-ocr-cache] downloading PP-OCRv6 small models into ~/.cache/ppu-paddle-ocr ...');
  if (typeof PaddleOcrService.downloadModels === 'function') {
    await PaddleOcrService.downloadModels();
  } else {
    // Fallback: an initialize() also fetches+caches the default models.
    const svc = new PaddleOcrService({ processing: { engine: 'canvas-native' }, session: { executionProviders: ['cpu'] } });
    await svc.initialize();
    await svc.destroy?.();
  }
  console.log('[warm-paddle-ocr-cache] done.');
} catch (err) {
  console.warn('[warm-paddle-ocr-cache] WARNING: pre-warm failed, continuing build. PaddleOCR models will download lazily at runtime on first clip-analysis job instead.');
  console.warn(err && err.stack ? err.stack : String(err));
}
process.exit(0);
