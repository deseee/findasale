/**
 * frameUtils (ADR-138 batch B7): the browser side of getting a picture ready to send.
 * Sizes and quality steps come from lib/cardScanCapture.ts (long edge 1024 px, JPEG quality 0.8 first, then lower until it fits
 * the 1.5 MB limit). Nothing here reads or writes storage and nothing leaves the browser; the picture is only handed back as a Blob.
 */
import { JPEG_LONG_EDGE, JPEG_QUALITY, computeDownscale, frameFitsLimit, nextJpegQuality } from '../../lib/cardScanCapture';

export const ALLOWED_IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), type, quality);
    } catch {
      resolve(null);
    }
  });
}

/** JPEG at quality 0.8, then lower, until the picture fits `maxBytes`. Null when even the lowest quality is too large. */
export async function encodeJpegWithinLimit(canvas: HTMLCanvasElement, maxBytes: number): Promise<Blob | null> {
  let quality: number | null = JPEG_QUALITY;
  while (quality !== null) {
    const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    if (blob && frameFitsLimit(blob.size, maxBytes)) return blob;
    quality = nextJpegQuality(quality);
  }
  return null;
}

/** Draws a video frame or image onto a new canvas scaled so the long edge is `longEdge`. Null when the size is not usable. */
export function drawToCanvas(source: CanvasImageSource, srcWidth: number, srcHeight: number, longEdge: number = JPEG_LONG_EDGE): HTMLCanvasElement | null {
  const size = computeDownscale(srcWidth, srcHeight, longEdge);
  if (!size) return null;
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, size.width, size.height);
  return canvas;
}

interface LoadedImage {
  image: HTMLImageElement;
  revoke: () => void;
}

function loadImage(file: Blob): Promise<LoadedImage | null> {
  return new Promise<LoadedImage | null>((resolve) => {
    let url = '';
    try {
      url = URL.createObjectURL(file);
    } catch {
      resolve(null);
      return;
    }
    const image = new Image();
    image.onload = () => resolve({ image, revoke: () => URL.revokeObjectURL(url) });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

export type PrepareResult = { ok: true; blob: Blob; fileName: string } | { ok: false; reason: 'WRONG_TYPE' | 'TOO_BIG' };

function jpegName(name: string): string {
  const base = name.replace(/\.[A-Za-z0-9]+$/, '');
  return (base === '' ? 'card' : base) + '.jpg';
}

/**
 * A chosen file, ready to send. A JPEG, PNG or WebP that already fits the limit goes as it is. A larger one is made smaller in
 * the browser (JPEG, long edge 1024 px). Any other type is refused.
 */
export async function prepareUploadFile(file: File, maxBytes: number): Promise<PrepareResult> {
  if (ALLOWED_IMAGE_TYPES.indexOf(file.type) < 0) return { ok: false, reason: 'WRONG_TYPE' };
  if (frameFitsLimit(file.size, maxBytes)) return { ok: true, blob: file, fileName: file.name || 'card.jpg' };
  const loaded = await loadImage(file);
  if (!loaded) return { ok: false, reason: 'TOO_BIG' };
  try {
    const canvas = drawToCanvas(loaded.image, loaded.image.naturalWidth, loaded.image.naturalHeight);
    if (!canvas) return { ok: false, reason: 'TOO_BIG' };
    const blob = await encodeJpegWithinLimit(canvas, maxBytes);
    if (!blob) return { ok: false, reason: 'TOO_BIG' };
    return { ok: true, blob, fileName: jpegName(file.name) };
  } finally {
    loaded.revoke();
  }
}
