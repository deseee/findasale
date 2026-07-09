/**
 * thumbnailGenerator.ts — ADR-078 Wave 3 (Video Content Pipeline)
 *
 * In-house `sharp` composite thumbnail (per ADR-078: "build in-house with sharp —
 * free, Node/TS-native"). No paid vendor, no env-var gate needed for this module.
 *
 * Composite layers (bottom to top):
 *   1. The best curated shot (shots[0].photoUrl from assetCuration.ts's ordered
 *      shot list — that list is already score-ordered, so index 0 IS the best shot),
 *      resized to fill the 1080x1920 (9:16) canvas.
 *   2. A semi-transparent dark (#111111) banner strip along the bottom, with an
 *      orange (#F97316) accent bar — matches the brand template confirmed in
 *      ADR-078's "Voiceover + Assembly" section.
 *   3. The FindA.Sale pin+star logo (packages/frontend/public/icons/icon-512x512.png).
 *   4. Bold headline text inside the banner — scriptGenerator.ts's
 *      `titleSuggestion`, NOT a line parsed out of scriptText. Per the ADR-078
 *      Addendum, a TUTORIAL script's first line is a "front-loaded topic
 *      statement" (search-clarity, not a discovery-feed hook), and titleSuggestion
 *      IS that real, searchable topic line — already brand-voice-checked by
 *      scriptGenerator.ts's assertBrandVoiceCompliant(). Using it instead of
 *      re-parsing scriptText avoids a second, less reliable text-extraction step
 *      for content that's already clean.
 *
 * Upload: reuses the identical `cloudinary.uploader.upload_stream` call shape
 * already established in packages/backend/src/controllers/uploadController.ts's
 * (private, non-exported) uploadToCloudinary() helper — same resource_type:'image',
 * same cloudinary.config() env vars. That helper isn't exported from its
 * controller, so this module reconstructs the same minimal call shape rather than
 * dragging in uploadController.ts's unrelated multer/AI-analysis logic just to
 * reach one function.
 */

import axios from 'axios';
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;
const BANNER_HEIGHT = 420;
const BRAND_ORANGE = '#F97316';
const BRAND_DARK = '#111111';

// Same FRONTEND_URL pattern used across the backend (e.g. saleController.ts) and
// in videoAssembly.ts — fetched over HTTP rather than off disk since this backend
// container doesn't have the frontend package's public/ dir mounted.
const BRAND_LOGO_URL = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/icons/icon-512x512.png`;

export interface ThumbnailInput {
  /** shots[0].photoUrl from curateAssetsForVideo()'s ordered shot list. */
  bestPhotoUrl: string;
  /** scriptGenerator.ts's titleSuggestion. */
  headlineText: string;
}

export interface ThumbnailResult {
  thumbnailUrl: string;
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const res = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
    maxContentLength: 50 * 1024 * 1024,
  });
  return Buffer.from(res.data);
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Greedy word-wrap into up to `maxLines` lines of roughly `maxCharsPerLine`
 * characters. Deliberately simple (no font-metrics measurement) — sharp/libvips
 * doesn't expose text-width measurement the way a canvas API would, and this
 * project has no existing text-wrapping utility to reuse for SVG overlays.
 * Character-count wrapping is a defensible approximation for a bold, large,
 * fixed-size headline font at this canvas width; it is not pixel-perfect.
 */
function wrapHeadline(text: string, maxCharsPerLine = 22, maxLines = 3): string[] {
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

function buildBannerSvg(headlineText: string): string {
  const lines = wrapHeadline(headlineText);
  const lineHeight = 74;
  const blockHeight = lines.length * lineHeight;
  const startY = (BANNER_HEIGHT - blockHeight) / 2 + lineHeight * 0.75;

  const tspans = lines
    .map((line, i) => `<tspan x="60" y="${startY + i * lineHeight}">${escapeXml(line)}</tspan>`)
    .join('');

  return `<svg width="${CANVAS_WIDTH}" height="${BANNER_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${CANVAS_WIDTH}" height="${BANNER_HEIGHT}" fill="${BRAND_DARK}" fill-opacity="0.80" />
  <rect x="0" y="0" width="12" height="${BANNER_HEIGHT}" fill="${BRAND_ORANGE}" />
  <text font-family="Arial, sans-serif" font-weight="700" font-size="56" fill="#FFFFFF">${tspans}</text>
</svg>`;
}

/**
 * Composite the thumbnail and upload it to Cloudinary. Logo fetch failure is
 * non-fatal (thumbnail still ships without the logo, logged) — a missing brand
 * mark shouldn't block the whole pipeline over a transient fetch issue, but a
 * missing PHOTO is fatal (there is nothing to composite onto).
 */
export async function generateThumbnail(input: ThumbnailInput): Promise<ThumbnailResult> {
  const { bestPhotoUrl, headlineText } = input;

  if (!bestPhotoUrl) {
    const err = new Error('NO_PHOTO: thumbnailGenerator requires at least one curated shot (shots[0].photoUrl)');
    (err as any).errorCode = 'NO_PHOTO';
    throw err;
  }
  if (!headlineText || !headlineText.trim()) {
    const err = new Error('NO_HEADLINE: thumbnailGenerator requires scriptGenerator.ts\'s titleSuggestion');
    (err as any).errorCode = 'NO_HEADLINE';
    throw err;
  }

  const [photoBuffer, logoBuffer] = await Promise.all([
    fetchImageBuffer(bestPhotoUrl),
    fetchImageBuffer(BRAND_LOGO_URL).catch((err) => {
      console.warn('[thumbnailGenerator] logo fetch failed, compositing without logo:', err?.message ?? err);
      return null;
    }),
  ]);

  const backgroundPhoto = await sharp(photoBuffer)
    .resize(CANVAS_WIDTH, CANVAS_HEIGHT, { fit: 'cover', position: 'attention' })
    .toBuffer();

  const bannerSvgBuffer = Buffer.from(buildBannerSvg(headlineText));

  const composites: sharp.OverlayOptions[] = [
    { input: bannerSvgBuffer, top: CANVAS_HEIGHT - BANNER_HEIGHT, left: 0 },
  ];

  if (logoBuffer) {
    const logoResized = await sharp(logoBuffer).resize(120, 120, { fit: 'contain' }).toBuffer();
    composites.push({
      input: logoResized,
      top: CANVAS_HEIGHT - BANNER_HEIGHT - 150,
      left: CANVAS_WIDTH - 150,
    });
  }

  const compositedBuffer = await sharp(backgroundPhoto)
    .composite(composites)
    .jpeg({ quality: 90 })
    .toBuffer();

  const thumbnailUrl = await uploadBufferToCloudinary(compositedBuffer, 'findasale/video-thumbnails');

  return { thumbnailUrl };
}

function uploadBufferToCloudinary(buffer: Buffer, folder: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: 'image', folder },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('No result from Cloudinary'));
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}
