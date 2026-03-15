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
      'l_text:Montserrat_bold_18:FindA.Sale,g_south_east,x_20,y_20,o_60';

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
