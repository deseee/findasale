/**
 * Centralized Cloudinary URL transform utility
 *
 * Provides consistent image URL generation across frontend and backend.
 * All functions handle null/empty URLs gracefully by returning empty string.
 *
 * Usage:
 *   import { getThumbnailUrl, getOptimizedUrl } from '@findasale/shared';
 */

/**
 * Insert a Cloudinary transformation string before /upload/ in the URL.
 * @param url Cloudinary URL (e.g. https://res.cloudinary.com/cloud/image/upload/...)
 * @param transform Transformation string (e.g. 'w_200,h_200,c_fill')
 * @returns Transformed URL or original URL if /upload/ not found
 */
export function insertCloudinaryTransform(url: string, transform: string): string {
  if (!url) return '';
  const uploadIdx = url.indexOf('/upload/');
  if (uploadIdx === -1) return url;
  return url.slice(0, uploadIdx + 8) + transform + '/' + url.slice(uploadIdx + 8);
}

/**
 * Get a thumbnail URL (200×200 auto-crop, WebP, quality 60).
 * Use for grid cards, filmstrip previews, batch queue.
 * @param url Cloudinary URL
 * @returns Transformed thumbnail URL or empty string if URL is falsy
 */
export function getCloudinaryThumbnailUrl(url: string): string {
  if (!url) return '';
  return insertCloudinaryTransform(url, 'w_200,h_200,c_fill,g_auto,q_60,f_webp');
}

/**
 * Get an optimized URL (800w, WebP, auto quality).
 * Use for listing cards, sale detail pages, standard display.
 * @param url Cloudinary URL
 * @returns Transformed optimized URL or empty string if URL is falsy
 */
export function getCloudinaryOptimizedUrl(url: string): string {
  if (!url) return '';
  return insertCloudinaryTransform(url, 'w_800,c_limit,q_auto,f_webp');
}

/**
 * Get a full-resolution URL (1600w, WebP, good quality).
 * Use for lightbox, zoom, full-screen preview.
 * @param url Cloudinary URL
 * @returns Transformed full URL or empty string if URL is falsy
 */
export function getCloudinaryFullUrl(url: string): string {
  if (!url) return '';
  return insertCloudinaryTransform(url, 'w_1600,c_limit,q_auto:good,f_webp');
}
