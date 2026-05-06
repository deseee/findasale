/**
 * Image URL utilities - Phase 14c
 *
 * Cloudinary eager transformations generate three variants at upload time:
 *   thumbnail (200x200 WebP) - grid cards, filmstrips
 *   optimized (800w WebP)    - listing cards, detail pages
 *   full (1600w WebP)        - lightbox / zoom
 *
 * Older images only have the original URL. These helpers derive variant URLs
 * from any Cloudinary URL using on-the-fly transformations as a fallback.
 */

const isCloudinaryUrl = (url: string): boolean =>
  url.includes('res.cloudinary.com');

const insertTransform = (url: string, transform: string): string => {
  const uploadIdx = url.indexOf('/upload/');
  if (uploadIdx === -1) return url;
  return url.slice(0, uploadIdx + 8) + transform + '/' + url.slice(uploadIdx + 8);
};

export const getThumbnailUrl = (url: string): string => {
  if (!url) return '';
  if (!isCloudinaryUrl(url)) return url;
  return insertTransform(url, 'w_200,h_200,c_fill,g_auto,q_60,f_webp');
};

export const getOptimizedUrl = (url: string, quality?: number): string => {
  if (!url) return '';
  if (!isCloudinaryUrl(url)) return url;
  const qualityParam = quality ? `q_${quality}` : 'q_auto';
  return insertTransform(url, `w_800,c_limit,${qualityParam},f_webp`);
};

export const getFullUrl = (url: string): string => {
  if (!url) return '';
  if (!isCloudinaryUrl(url)) return url;
  return insertTransform(url, 'w_1600,c_limit,q_auto:good,f_webp');
};

export const getLqipUrl = (url: string): string => {
  if (!url) return '';
  if (!isCloudinaryUrl(url)) return url;
  return insertTransform(url, 'w_30,q_20,f_webp,e_blur:400');
};

export const getLandscape4x3Url = (url: string): string => {
  if (!url) return '';
  if (!isCloudinaryUrl(url)) return url;
  return insertTransform(url, 'c_fill,ar_4:3,w_1200,q_auto,f_webp');
};

export const getPortrait3x4Url = (url: string): string => {
  if (!url) return '';
  if (!isCloudinaryUrl(url)) return url;
  return insertTransform(url, 'c_fill,ar_3:4,w_800,q_auto,f_webp');
};

const EBAY_IMAGE_DOMAINS = [
  'i.ebayimg.com',
  'ir.ebaystatic.com',
  'thumbs.ebaystatic.com',
];

const isEbayImageUrl = (url: string): boolean => {
  try {
    const { hostname } = new URL(url);
    return EBAY_IMAGE_DOMAINS.some(
      d => hostname === d || hostname.endsWith('.' + d)
    );
  } catch {
    return false;
  }
};

const SCRAPED_IMAGE_DOMAINS = [
  'picturescdn.estatesales.net',
  'estatesales.net',
  'p1.liveauctioneers.com',
  'p2.liveauctioneers.com',
  'photos.liveauctioneers.com',
];

const isScrapedImageUrl = (url: string): boolean => {
  try {
    const { hostname } = new URL(url);
    return SCRAPED_IMAGE_DOMAINS.some(
      d => hostname === d || hostname.endsWith('.' + d)
    );
  } catch {
    return false;
  }
};

function getImageProxyUrl(): string {
  // @ts-ignore - NEXT_PUBLIC_* vars are injected at build time by Next.js
  const cfProxyUrl = process.env.NEXT_PUBLIC_CF_IMAGE_PROXY_URL;
  // CF Worker listens at /proxy — append the path. Fallback to Railway route.
  return cfProxyUrl ? `${cfProxyUrl.replace(/\/$/, '')}/proxy` : '/api/proxy-image';
}

export const getItemImageUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  if (isEbayImageUrl(url)) {
    const proxyBase = getImageProxyUrl();
    return `${proxyBase}?url=${encodeURIComponent(url)}`;
  }
  return url;
};

export const getSaleImageUrl = (url: string | null | undefined, quality?: number): string | null => {
  if (!url) return null;

  if (isCloudinaryUrl(url)) {
    return getOptimizedUrl(url, quality);
  }

  if (isScrapedImageUrl(url) || isEbayImageUrl(url)) {
    const proxyBase = getImageProxyUrl();
    return `${proxyBase}?url=${encodeURIComponent(url)}`;
  }

  return url;
};
