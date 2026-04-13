/**
 * Image URL utility with low-bandwidth support (Feature #22)
 *
 * Provides a single export function that integrates with the low-bandwidth
 * detection system. Components can use this to automatically apply quality
 * degradation based on network conditions.
 */

import { getOptimizedUrl as getOptimizedUrlBase } from './imageUtils';

interface GetImageUrlOptions {
  lowBandwidth?: boolean;
  size?: 'thumbnail' | 'optimized' | 'full';
}

/**
 * Get an optimized image URL with optional low-bandwidth degradation.
 * @param url Image URL
 * @param options Configuration options
 * @returns Optimized URL
 *
 * Example:
 *   getImageUrl(url, { lowBandwidth: true, size: 'optimized' })
 */
export function getImageUrl(url: string, options?: GetImageUrlOptions): string {
  if (!url) return '';

  const { lowBandwidth = false, size = 'optimized' } = options || {};

  // Determine quality based on bandwidth
  let quality: number;
  if (lowBandwidth) {
    quality = 40; // Heavy compression for slow connections
  } else if (size === 'thumbnail') {
    quality = 60;
  } else if (size === 'full') {
    quality = 85;
  } else {
    quality = 75; // Default optimized quality
  }

  return getOptimizedUrlBase(url, quality);
}

export default getImageUrl;
