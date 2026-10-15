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

// Phone photos are 12MP+; the old 2s budget (jpeg-js full-res decode alone) timed out before
// zbar ever ran. Budget now covers several downscaled sharp passes.
const DECODE_TIMEOUT_MS = 8000;

// [longest side px, contrast-enhance]. Barcodes shot from a few inches fill the frame at ~1600px;
// tiny ones need the larger pass; the enhanced pass rescues glossy/low-contrast labels.
const SHARP_ATTEMPTS: Array<[number, boolean]> = [[1600, false], [2400, false], [1600, true], [3200, false]];
const PRODUCT_TYPES = new Set<BarcodeDetectionResult['codeType']>(['UPC', 'EAN', 'ISBN']);

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

type RGBA = { data: Uint8Array; width: number; height: number };

async function scanRGBA(zbar: any, rgba: RGBA): Promise<BarcodeDetectionResult[]> {
  const symbols: any[] = await zbar.scanRGBABuffer(rgba.data.buffer, rgba.width, rgba.height);
  const out: BarcodeDetectionResult[] = [];
  for (const sym of symbols || []) {
    try {
      const code: string = sym.decode();
      if (!code) continue;
      let codeType = normalizeBarcodeType(sym.typeName ?? '');
      let value = code;
      // zbar reports a UPC-A as a 13-digit EAN with a leading 0. Normalise back to the 12-digit
      // UPC so it lands in the UPC field (a 13-digit value would be stored as EAN).
      if ((codeType === 'EAN' || codeType === 'UPC') && /^0\d{12}$/.test(value)) {
        value = value.slice(1);
        codeType = 'UPC';
      }
      out.push({ code: value, codeType });
    } catch {
      // skip unreadable symbol
    }
  }
  return out;
}

/** Auto-orient (EXIF), downscale and return exact-size RGBA bytes. Null if not 4-channel. */
async function sharpToRGBA(sharp: any, buffer: Buffer, longest: number, enhance: boolean): Promise<RGBA | null> {
  let pipe = sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize({ width: longest, height: longest, fit: 'inside', withoutEnlargement: true })
    .removeAlpha();
  if (enhance) pipe = pipe.normalise().sharpen();
  const { data, info } = await pipe.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) return null;
  const bytes = new Uint8Array(data.length);
  bytes.set(data);
  return { data: bytes, width: info.width, height: info.height };
}

/**
 * Core decode operation — separated so we can race it against a timeout.
 * Tries several downscaled/enhanced passes; prefers a UPC/EAN/ISBN symbol over QR/other.
 */
async function decodeCore(buffer: Buffer): Promise<BarcodeDetectionResult | null> {
  // Dynamic import of the inlined CJS variant — WASM embedded, no external file fetch
  let zbar: any;
  try {
    // The './dist/inlined/main.cjs' subpath is NOT in the package's "exports" map (0.11.x), so
    // importing it always threw and this decoder silently returned null for every photo.
    // The bare specifier resolves via the "require" condition to dist/main.cjs (loads zbar.wasm
    // from node_modules, fine on Railway).
    zbar = await import('@undecaf/zbar-wasm');
  } catch (err) {
    console.warn('[barcode] zbar-wasm failed to load:', (err as Error)?.message);
    return null;
  }

  let fallback: BarcodeDetectionResult | null = null;
  const consider = (results: BarcodeDetectionResult[]): BarcodeDetectionResult | null => {
    const product = results.find((r) => PRODUCT_TYPES.has(r.codeType));
    if (product) return product;
    if (!fallback && results.length > 0) fallback = results[0];
    return null;
  };

  let sharp: any = null;
  try {
    sharp = await import('sharp').then((m: any) => m.default ?? m);
  } catch {
    sharp = null;
  }

  if (sharp) {
    for (const [size, enhance] of SHARP_ATTEMPTS) {
      try {
        const rgba = await sharpToRGBA(sharp, buffer, size, enhance);
        if (!rgba) continue;
        const hit = consider(await scanRGBA(zbar, rgba));
        if (hit) return hit;
      } catch {
        // try next pass
      }
    }
    return fallback;
  }

  // sharp unavailable: legacy full-resolution pure-JS path
  const rgba = await bufferToRGBA(buffer);
  if (!rgba) return null;
  return consider(await scanRGBA(zbar, rgba)) ?? fallback;
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
