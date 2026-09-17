import { v2 as cloudinary } from 'cloudinary';
import { prisma } from '../lib/prisma';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Cloudinary watermark utility for FindA.Sale
 * Applies a FindA.Sale watermark overlay to Cloudinary image URLs using URL-based transformations
 */

/**
 * Applies a FindA.Sale watermark overlay to a Cloudinary image URL
 * using URL-based transformations (no re-upload or API calls).
 *
 * @param originalUrl - Full Cloudinary URL (https://res.cloudinary.com/...)
 * @returns Watermarked URL with transformation chain appended
 *
 * Example input:  https://res.cloudinary.com/abc/image/upload/v1/findasale/item123.jpg
 * Example output: https://res.cloudinary.com/abc/image/upload/l_text:Arial_44_bold:FindA.Sale,co_white,g_south,y_25,o_90/v1/findasale/item123.jpg
 */
export function getWatermarkedUrl(originalUrl: string): string {
  // Validate URL is a Cloudinary URL (contains `res.cloudinary.com`)
  if (!originalUrl || !originalUrl.includes('res.cloudinary.com')) {
    // Not a Cloudinary URL — return unchanged (fail-safe)
    return originalUrl;
  }

  try {
    // Parse the URL to find the version segment (e.g., /v1/)
    // Format: https://res.cloudinary.com/{cloud}/image/upload/{transformations}/v{version}/{public_id_path}
    const versionMatch = originalUrl.match(/\/v\d+\//);

    if (!versionMatch) {
      // No version segment found — return unchanged
      return originalUrl;
    }

    const versionSegment = versionMatch[0]; // e.g., "/v1/"
    const versionIndex = originalUrl.indexOf(versionSegment);

    // Build watermark transformation
    // Text centered on south edge (bottom-center), sized for legibility.
    // QR overlay (when applied by getWatermarkedUrlWithQR) is stacked ABOVE this text.
    const watermarkTransformation =
      'l_text:Arial_44_bold:FindA.Sale,co_white,g_south,y_25,o_90';

    // Insert transformation before the version segment
    const watermarkedUrl =
      originalUrl.slice(0, versionIndex) +
      '/' +
      watermarkTransformation +
      originalUrl.slice(versionIndex);

    return watermarkedUrl;
  } catch {
    // On any error, return the original URL unchanged
    return originalUrl;
  }
}

/**
 * Applies watermark + optional QR code overlay to a Cloudinary image URL.
 * Used for exported photos that need QR codes linking back to item pages.
 *
 * @param originalUrl - Full Cloudinary URL (https://res.cloudinary.com/...)
 * @param itemId - Item ID for QR code (if qrEmbedEnabled is true)
 * @param qrEmbedEnabled - Whether to embed QR code overlay (default true)
 * @param qrAssetReady - Whether this item's QR overlay image has already been generated +
 *   stored on Cloudinary (see ensureQrCodeAsset below). When true, references the short
 *   public_id instead of re-deriving + re-encoding the external QR-service URL on every call
 *   (fixes eBay's 3975-char photo URL limit being exceeded). When false, falls back to the
 *   original external-URL base64 fetch overlay.
 * @returns Watermarked URL with optional QR overlay appended
 *
 * Example input:  https://res.cloudinary.com/abc/image/upload/v1/findasale/item123.jpg
 * Example output (qrAssetReady): https://res.cloudinary.com/abc/image/upload/l_text:Montserrat_bold_18:FindA.Sale,g_south_east,x_20,y_20,o_60/l_findasale:qr:item123,g_south_east,w_85,h_85,x_15,y_20/v1/findasale/item123.jpg
 * Example output (fallback):     https://res.cloudinary.com/abc/image/upload/l_text:Montserrat_bold_18:FindA.Sale,g_south_east,x_20,y_20,o_60/l_fetch:aHR0cHM6Ly9hcGkucXJzZXJ2ZXIuY29tL3YxL2NyZWF0ZS1xci1jb2RlLz9zaXplPTgweDgwJmRhdGE9aHR0cHM6Ly9maW5kYS5zYWxlL2l0ZW1zL2l0ZW0xMjM=,g_south_east,w_80,h_80,x_10,y_10/v1/findasale/item123.jpg
 */
export function getWatermarkedUrlWithQR(
  originalUrl: string,
  itemId?: string,
  qrEmbedEnabled: boolean = true,
  qrAssetReady: boolean = false
): string {
  // Start with the watermarked URL
  const watermarkedUrl = getWatermarkedUrl(originalUrl);

  // If QR embed is disabled or no itemId, return watermarked URL only
  if (!qrEmbedEnabled || !itemId) {
    return watermarkedUrl;
  }

  // Validate URL is a Cloudinary URL
  if (!watermarkedUrl.includes('res.cloudinary.com')) {
    return watermarkedUrl;
  }

  try {
    // Find the version segment to insert the QR overlay before it
    const versionMatch = watermarkedUrl.match(/\/v\d+\//);
    if (!versionMatch) {
      return watermarkedUrl;
    }

    const versionSegment = versionMatch[0];
    const versionIndex = watermarkedUrl.indexOf(versionSegment);

    let qrTransformation: string;

    if (qrAssetReady) {
      // QR overlay image already generated + stored on Cloudinary for this item (see
      // ensureQrCodeAsset below) -- reference it by its short public_id instead of
      // re-deriving + re-encoding the external QR-service URL on every call (this is what
      // was blowing past eBay's 3975-char photo URL limit). Hand-built as a literal
      // colon-delimited string -- never via the Cloudinary SDK's transformation-object
      // builder, which has a known bug with slash-containing public_ids
      // (cloudinary/cloudinary_npm#88).
      qrTransformation = `l_findasale:qr:${itemId},g_south_east,w_85,h_85,x_15,y_20`;
    } else {
      // Fallback: QR asset not ready yet for this item -- derive the external QR-service
      // URL and embed it as a base64 fetch overlay (original behavior, unchanged).
      // Build QR code URL — request a larger source so the scaled overlay stays crisp
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=4&data=https://finda.sale/items/${itemId}`;

      // Base64 encode the QR code URL for Cloudinary fetch overlay
      const qrCodeUrlBase64 = Buffer.from(qrCodeUrl).toString('base64');

      // QR overlay: positioned bottom-right corner, sized 85×85, with small margins from edges.
      // Positioned under where ENDED sale banner would appear. Text overlay remains centered at g_south,y_25.
      qrTransformation = `l_fetch:${qrCodeUrlBase64},g_south_east,w_85,h_85,x_15,y_20`;
    }

    // Insert QR transformation before the version segment
    const urlWithQR =
      watermarkedUrl.slice(0, versionIndex) +
      '/' +
      qrTransformation +
      watermarkedUrl.slice(versionIndex);

    return urlWithQR;
  } catch {
    // On any error, return the watermarked URL without QR
    return watermarkedUrl;
  }
}


/**
 * Generates (if needed) and stores this item's QR overlay image on Cloudinary, once per item,
 * so getWatermarkedUrlWithQR can reference it by a short public_id instead of re-deriving +
 * re-encoding the external QR-service URL on every call. Fire-and-forget: callers invoke this
 * without awaiting it, so it never throws.
 */
export async function ensureQrCodeAsset(itemId: string): Promise<void> {
  try {
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=4&data=https://finda.sale/items/${itemId}`;
    await cloudinary.uploader.upload(qrCodeUrl, {
      public_id: `findasale/qr/${itemId}`,
      resource_type: 'image',
      overwrite: false,
      unique_filename: false,
    });
    await prisma.item.update({ where: { id: itemId }, data: { qrAssetReady: true } });
  } catch {
    // never throw — callers invoke this fire-and-forget
  }
}
