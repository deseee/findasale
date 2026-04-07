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
 * Example output: https://res.cloudinary.com/abc/image/upload/l_text:Montserrat_bold_18:FindA.Sale,g_south_east,x_20,y_20,o_60/v1/findasale/item123.jpg
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
    const watermarkTransformation =
      'l_text:Arial_18:FindA.Sale,g_south_east,x_20,y_20,o_70';

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
 * @returns Watermarked URL with optional QR overlay appended
 *
 * Example input:  https://res.cloudinary.com/abc/image/upload/v1/findasale/item123.jpg
 * Example output: https://res.cloudinary.com/abc/image/upload/l_text:Montserrat_bold_18:FindA.Sale,g_south_east,x_20,y_20,o_60/l_fetch:aHR0cHM6Ly9hcGkucXJzZXJ2ZXIuY29tL3YxL2NyZWF0ZS1xci1jb2RlLz9zaXplPTgweDgwJmRhdGE9aHR0cHM6Ly9maW5kYS5zYWxlL2l0ZW1zL2l0ZW0xMjM=,g_south_east,w_80,h_80,x_10,y_10/v1/findasale/item123.jpg
 */
export function getWatermarkedUrlWithQR(
  originalUrl: string,
  itemId?: string,
  qrEmbedEnabled: boolean = true
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
    // Build QR code URL
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=https://finda.sale/items/${itemId}`;

    // Base64 encode the QR code URL for Cloudinary fetch overlay
    const qrCodeUrlBase64 = Buffer.from(qrCodeUrl).toString('base64');

    // Find the version segment to insert the QR overlay before it
    const versionMatch = watermarkedUrl.match(/\/v\d+\//);
    if (!versionMatch) {
      return watermarkedUrl;
    }

    const versionSegment = versionMatch[0];
    const versionIndex = watermarkedUrl.indexOf(versionSegment);

    // Build QR overlay transformation: fetch base64-encoded URL and place in south_east corner
    const qrTransformation = `l_fetch:${qrCodeUrlBase64},g_south_east,w_80,h_80,x_10,y_10`;

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
