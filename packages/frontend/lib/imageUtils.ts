/**
 * Image URL utilities — Phase 14c
 *
 * Cloudinary eager transformations generate three variants at upload time:
 *   thumbnail (200×200 WebP) — grid cards, filmstrips
 *   optimized (800w WebP)    — listing cards, detail pages
 *   full (1600w WebP)        — lightbox / zoom
 *
 * Older images only have the original URL. These helpers derive variant URLs
 * from any Cloudinary URL using on-the-fly transformations as a fallback.
 */

/**
 * Detect whether a URL is a Cloudinary URL we can transform.
 */
const isCloudinaryUrl = (url: string): boolean =>
  url.includes('res.cloudinary.com');

/**
 * Insert a Cloudinary transformation string before /upload/ in the URL.
 * e.g. .../upload/v12345/folder/img.jpg → .../upload/w_800,c_limit,q_auto,f_webp/v12345/folder/img.jpg
 */
const insertTransform = (url: string, transform: string): string => {
  const uploadIdx = url.indexOf('/upload/');
  if (uploadIdx === -1) return url;
  return url.slice(0, uploadIdx + 8) + transform + '/' + url.slice(uploadIdx + 8);
};

/**
 * Get a thumbnail URL (200×200 auto-crop, WebP).
 * For grid cards, filmstrip previews, batch queue.
 */
export const getThumbnailUrl = (url: string): string => {
  if (!url) return '';
  if (!isCloudinaryUrl(url)) return url;
  return insertTransform(url, 'w_200,h_200,c_fill,g_auto,q_60,f_webp');
};

/**
 * Get an optimized URL (800w, WebP, optional quality control).
 * For listing cards, sale detail pages.
 * @param url Image URL
 * @param quality Optional quality (1-100). If not specified, uses q_auto.
 */
export const getOptimizedUrl = (url: string, quality?: number): string => {
  if (!url) return '';
  if (!isCloudinaryUrl(url)) return url;
  const qualityParam = quality ? `q_${quality}` : 'q_auto';
  return insertTransform(url, `w_800,c_limit,${qualityParam},f_webp`);
};

/**
 * Get a full-resolution URL (1600w, WebP).
 * For lightbox, zoom, full-screen preview.
 */
export const getFullUrl = (url: string): string => {
  if (!url) return '';
  if (!isCloudinaryUrl(url)) return url;
  return insertTransform(url, 'w_1600,c_limit,q_auto:good,f_webp');
};

/**
 * Get a low-quality placeholder (LQIP) — tiny 30px blur for skeleton loading.
 */
export const getLqipUrl = (url: string): string => {
  if (!url) return '';
  if (!isCloudinaryUrl(url)) return url;
  return insertTransform(url, 'w_30,q_20,f_webp,e_blur:400');
};

/**
 * Get a 4:3 landscape crop for photo reviews and specific display contexts.
 * Uses center crop, 1200px wide, WebP.
 */
export const getLandscape4x3Url = (url: string): string => {
  if (!url) return '';
  if (!isCloudinaryUrl(url)) return url;
  return insertTransform(url, 'c_fill,ar_4:3,w_1200,q_auto,f_webp');
};

/**
 * Get a 3:4 portrait crop for item detail pages (suits tall estate items).
 * Uses center crop, 800px wide, WebP.
 */
export const getPortrait3x4Url = (url: string): string => {
  if (!url) return '';
  if (!isCloudinaryUrl(url)) return url;
  return insertTransform(url, 'c_fill,ar_3:4,w_800,q_auto,f_webp');
};
