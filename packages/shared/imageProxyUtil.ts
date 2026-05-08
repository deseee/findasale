/**
 * Image proxy utility for eBay CDN images
 *
 * Since eBay images are served from a CDN without CORS headers,
 * they must be proxied through the FindA.Sale backend image-proxy endpoint
 * to be safely loaded in the browser without blocking.
 *
 * Usage in React components:
 * ```tsx
 * import { getImageProxyUrl } from '@findasale/shared';
 *
 * const photoUrl = item.photoUrls?.[0];
 * const displayUrl = photoUrl ? getImageProxyUrl(photoUrl) : null;
 *
 * <Image src={displayUrl} ... />
 * ```
 */

const EBAY_DOMAINS = ['i.ebayimg.com', 'ir.ebaystatic.com', 'thumbs.ebaystatic.com'];
const CLOUDINARY_DOMAIN = 'res.cloudinary.com';

/**
 * Converts an image URL to use the backend image proxy if it's from eBay CDN
 * Leaves Cloudinary and other URLs unchanged
 */
export function getImageProxyUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    // Check if this is an eBay image
    const isEbayImage = EBAY_DOMAINS.some(
      domain => hostname === domain || hostname.endsWith('.' + domain)
    );

    if (isEbayImage) {
      // Route through backend proxy
      return `/api/image-proxy?url=${encodeURIComponent(url)}`;
    }

    // Keep non-eBay URLs as-is (Cloudinary, etc.)
    return url;
  } catch (error) {
    // If URL parsing fails, return as-is
    console.warn('Failed to parse URL for image proxy:', url, error);
    return url;
  }
}

/**
 * Checks if a URL is from an eBay CDN
 */
export function isEbayImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;

  try {
    const urlObj = new URL(url);
    return EBAY_DOMAINS.some(
      domain => urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
}
