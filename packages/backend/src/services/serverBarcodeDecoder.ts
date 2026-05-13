/**
 * serverBarcodeDecoder.ts
 *
 * Server-side barcode detection from image Buffers.
 * Uses @undecaf/zbar-wasm (WebAssembly, no native deps — Railway-safe).
 * Decodes JPEG via jpeg-js and PNG via pngjs, both pure JS.
 *
 * Returns null if no barcode detected or if any error/timeout occurs.
 * Non-blocking: never throws. Always resolves within DECODE_TIMEOUT_MS.
 */

const DECODE_TIMEOUT_MS = 2000;

export interface BarcodeDetectionResult {
  code: string;
  codeType: 'UPC' | 'EAN' | 'ISBN' | 'QR' | 'OTHER';
}

// Map ZBar symbol type names → our normalized codeType
function normalizeBarcodeType(typeName: string): BarcodeDetectionResult['codeType'] {
  const t = typeName.toUpperCase();
  if (t.includes('UPC')) return 'UPC';
  if (t.includes('ISBN')) return 'ISBN';
  if (t.includes('EAN')) return 'EAN';
  if (t.includes('QRCODE') || t.includes('QR_CODE') || t === 'ZBAR_QRCODE') return 'QR';
  return 'OTHER';
}

/**
 * Decode JPEG buffer to raw RGBA bytes.
 * Uses jpeg-js (pure JS, no native deps).
 * Returns null if jpeg-js is not installed or decode fails.
 */
async function jpegToRGBA(buf: Buffer): Promise<{ data: Uint8Array; width: number; height: number } | null> {
  try {
    // Dynamic import — gracefully absent if not yet installed
    const jpeg = await import('jpeg-js').catch(() => null);
    if (!jpeg) return null;
    const decoded = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 128 });
    return { data: decoded.data, width: decoded.width, height: decoded.height };
  } catch {
    return null;
  }
}

/**
 * Decode PNG buffer to raw RGBA bytes.
 * Uses pngjs (pure JS, transitively installed, sync API).
 * Returns null if decode fails.
 */
async function pngToRGBA(buf: Buffer): Promise<{ data: Uint8Array; width: number; height: number } | null> {
  try {
    const { PNG } = await import('pngjs').catch(() => ({ PNG: null }));
    if (!PNG) return null;
    const png = PNG.sync.read(buf);
    return { data: new Uint8Array(png.data.buffer), width: png.width, height: png.height };
  } catch {
    return null;
  }
}

/**
 * Detect image format from magic bytes and decode to RGBA.
 */
async function bufferToRGBA(
  buf: Buffer,
): Promise<{ data: Uint8Array; width: number; height: number } | null> {
  // JPEG: starts with FF D8
  if (buf[0] === 0xff && buf[1] === 0xd8) return jpegToRGBA(buf);
  // PNG: starts with 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50) return pngToRGBA(buf);
  // Fallback: try JPEG first, then PNG
  const jpg = await jpegToRGBA(buf);
  if (jpg) return jpg;
  return pngToRGBA(buf);
}

/**
 * Core decode operation — separated so we can race it against a timeout.
 */
async function decodeCore(buffer: Buffer): Promise<BarcodeDetectionResult | null> {
  // Dynamic import of the inlined CJS variant — WASM embedded, no external file fetch
  let zbar: any;
  try {
    zbar = await import('@undecaf/zbar-wasm/dist/inlined/main.cjs');
  } catch {
    // Library not yet installed (pre-deploy) — silent no-op
    return null;
  }

  const rgba = await bufferToRGBA(buffer);
  if (!rgba) return null;

  const symbols: any[] = await zbar.scanRGBABuffer(
    rgba.data.buffer,
    rgba.width,
    rgba.height,
  );

  if (!symbols || symbols.length === 0) return null;

  // Pick first symbol — highest confidence result
  const sym = symbols[0];
  const code: string = sym.decode();
  const typeName: string = sym.typeName ?? '';

  if (!code) return null;

  return { code, codeType: normalizeBarcodeType(typeName) };
}

/**
 * Decode a barcode from an image Buffer.
 *
 * @param buffer - Raw image bytes (JPEG or PNG)
 * @returns Detected barcode or null
 */
export async function decodeBarcodeFromImage(buffer: Buffer): Promise<BarcodeDetectionResult | null> {
  try {
    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), DECODE_TIMEOUT_MS),
    );
    return await Promise.race([decodeCore(buffer), timeout]);
  } catch {
    return null;
  }
}
