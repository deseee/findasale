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

export const isCloudinaryUrl = (url: string): boolean =>
  url.includes('res.cloudinary.com');

const insertTransform = (url: string, transform: string): string => {
  const uploadIdx = url.indexOf('/upload/');
  if (uploadIdx === -1) return url;
  return url.slice(0, uploadIdx + 8) + transform + '/' + url.slice(uploadIdx + 8);
};

export const getThumbnailUrl = (url: string): string => {
  if (!url) return '';
  if (!isCloudinaryUrl(url)) return url;
  return insertTransform(url, 'w_200,h_200,c_fill,g_auto,q_60,f_auto');
};

export const getOptimizedUrl = (url: string, quality?: number): string => {
  if (!url) return '';
  if (!isCloudinaryUrl(url)) return url;
  const qualityParam = quality ? `q_${quality}` : 'q_auto';
  return insertTransform(url, `w_800,c_limit,${qualityParam},f_auto`);
};

export const getFullUrl = (url: string): string => {
  if (!url) return '';
  if (!isCloudinaryUrl(url)) return url;
  return insertTransform(url, 'w_1600,c_limit,q_auto:good,f_auto');
};

export const getLqipUrl = (url: string): string => {
  if (!url) return '';
  if (isCloudinaryUrl(url)) return insertTransform(url, 'w_30,q_20,f_auto,e_blur:400');
  // Bug fix 2026-07-08 (found during live QA of the front-page image fix): this used
  // to return non-Cloudinary URLs raw, so the LQIP blur backdrop for scraped/eBay
  // images hotlinked hotlink-protected CDNs directly instead of going through the
  // proxy worker like the main photo does (getSaleImageUrl) -- a guaranteed-to-fail
  // request on any hotlink-protected source. Proxy those the same way.
  if (isScrapedImageUrl(url) || isEbayImageUrl(url)) {
    const proxyBase = getImageProxyUrl();
    return `${proxyBase}?url=${encodeURIComponent(url)}`;
  }
  return url;
};

export const getLandscape4x3Url = (url: string): string => {
  if (!url) return '';
  if (!isCloudinaryUrl(url)) return url;
  return insertTransform(url, 'c_fill,ar_4:3,w_1200,q_auto,f_auto');
};

export const getPortrait3x4Url = (url: string): string => {
  if (!url) return '';
  if (!isCloudinaryUrl(url)) return url;
  return insertTransform(url, 'c_fill,ar_3:4,w_800,q_auto,f_auto');
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
  // Hotlink-protected aggregator CDNs (confirmed 503 when loaded directly,
  // unproxied, live 2026-07-08 — front-page image bug): covers subdomains like
  // ysn.tlstatic.com, gsf.tlstatic.com, gsalr.tlstatic.com, eso-cdn.tlcdn.workers.dev
  'tlstatic.com',
  'tlcdn.workers.dev',
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
  // CF Worker listens at /proxy — append the path. Fallback to hardcoded worker URL.
  return cfProxyUrl ? `${cfProxyUrl.replace(/\/$/, '')}/proxy` : 'https://findasale-image-proxy.findasale.workers.dev/proxy';
}

export const getItemImageUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  // Bug fix 2026-07-08: this previously only proxied eBay URLs, so item photos
  // from hotlink-protected scraped CDNs (estatesales.net, liveauctioneers.com,
  // tlstatic.com/tlcdn.workers.dev aggregators) were requested directly and
  // returned 503 from the origin. getSaleImageUrl already proxied these for
  // sale-level photos; item-level photos (index.tsx search grid, ItemCard) did not.
  if (isEbayImageUrl(url) || isScrapedImageUrl(url)) {
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

/**
 * Build a Cloudinary responsive `srcset` string at multiple widths.
 *
 * Reuses the same transform pipeline as getOptimizedUrl (q_auto, c_limit, f_auto)
 * so browsers receive AVIF/WebP at the width that best fits the rendered slot.
 *
 * Defensive: returns '' for empty input or any non-Cloudinary URL (eBay-proxied,
 * scraped CDN, or external). An empty srcset is a no-op on <img>, so callers can
 * safely spread it without breaking non-Cloudinary images.
 */
export const getCloudinarySrcSet = (
  url: string | null | undefined,
  widths: number[] = [400, 800, 1200],
): string => {
  if (!url || !isCloudinaryUrl(url)) return '';
  return widths
    .map((w) => `${insertTransform(url, `w_${w},c_limit,q_auto,f_auto`)} ${w}w`)
    .join(', ');
};
