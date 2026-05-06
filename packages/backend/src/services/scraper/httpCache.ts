/**
 * HTTP Cache-First Conditional GET Helper
 * Implements RFC 7232 conditional GET with ETag and Last-Modified headers
 *
 * Pattern: on re-fetch, send If-Modified-Since + If-None-Match
 * If server returns 304 Not Modified, skip processing and log unchanged
 * On 200, extract and store ETag + Last-Modified in Sale.scrapedMetadata.httpCache
 *
 * Expected savings: 60-80% reduction in ESN/enrichment request volume by looking like a warm cache
 */

import { prisma } from '../../lib/prisma';

const DEBUG = process.env.LOG_LEVEL === 'debug';

interface HttpCacheHeaders {
  etag?: string;
  lastModified?: string;
}

interface CacheFetchResult<T> {
  status: 304 | 200; // 304 = not modified, 200 = new content
  data?: T;
  unchanged: boolean;
}

/**
 * Retrieve cached HTTP headers (ETag, Last-Modified) from Sale.scrapedMetadata.httpCache
 * Returns empty object if no cache exists
 */
export async function getCachedHeaders(saleId: string): Promise<HttpCacheHeaders> {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { scrapedMetadata: true },
    });

    if (!sale || !sale.scrapedMetadata) {
      return {};
    }

    const metadata = sale.scrapedMetadata as Record<string, any>;
    const httpCache = metadata.httpCache as HttpCacheHeaders | undefined;

    return httpCache || {};
  } catch (error) {
    if (DEBUG) console.warn(`[HttpCache] Failed to read cached headers for sale ${saleId}:`, error);
    return {};
  }
}

/**
 * Store HTTP cache headers in Sale.scrapedMetadata.httpCache
 * Merges with existing scrapedMetadata, only updates httpCache subfield
 */
export async function setCachedHeaders(
  saleId: string,
  headers: HttpCacheHeaders
): Promise<void> {
  try {
    // Get current scrapedMetadata to preserve other fields
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { scrapedMetadata: true },
    });

    const currentMetadata = (sale?.scrapedMetadata as Record<string, any>) || {};

    // Merge: preserve all fields, update only httpCache
    const updatedMetadata = {
      ...currentMetadata,
      httpCache: headers,
    };

    await prisma.sale.update({
      where: { id: saleId },
      data: { scrapedMetadata: updatedMetadata },
    });
  } catch (error) {
    if (DEBUG) console.warn(`[HttpCache] Failed to cache headers for sale ${saleId}:`, error);
    // Non-fatal: cache write failure should not block enrichment
  }
}

/**
 * Fetch with conditional headers (If-Modified-Since, If-None-Match)
 * Returns 304 if cached and unchanged, 200 with new data if changed
 * For API/JSON endpoints: returns JSON directly; for HTML: returns text
 */
export async function fetchWithConditionalHeaders(
  url: string,
  cachedHeaders: HttpCacheHeaders,
  customHeaders?: Record<string, string>,
  options?: { timeout?: number }
): Promise<{ status: 304 | 200; data?: string | Record<string, any>; responseHeaders?: Record<string, string>; ok?: boolean; statusCode?: number }> {
  const headers: Record<string, string> = {
    ...customHeaders,
  };

  // Add conditional headers if we have cached values
  if (cachedHeaders.etag) {
    headers['If-None-Match'] = cachedHeaders.etag;
  }
  if (cachedHeaders.lastModified) {
    headers['If-Modified-Since'] = cachedHeaders.lastModified;
  }

  const timeout = options?.timeout || 15000;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(timeout),
    });

    // 304 Not Modified — content unchanged on server
    if (response.status === 304) {
      return {
        status: 304,
        data: undefined,
      };
    }

    // 200 OK — content changed, return it
    if (response.ok) {
      let data: string | Record<string, any>;

      // Detect content type and parse accordingly
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = (await response.json()) as Record<string, any>;
      } else {
        data = await response.text();
      }

      const responseHeaders = Object.fromEntries(response.headers.entries());
      return {
        status: 200,
        data,
        responseHeaders,
        ok: true,
        statusCode: 200,
      };
    }

    // Non-2xx response — return status info and let caller handle (429, 403, 404, 5xx, etc.)
    return {
      status: 200, // Placeholder status; use statusCode to get real status
      data: undefined,
      ok: false,
      statusCode: response.status,
    };
  } catch (error) {
    if (DEBUG) console.warn(`[HttpCache] Fetch error:`, error);
    throw error;
  }
}

/**
 * Extract ETag and Last-Modified from response headers
 * Returns object with only the headers that are present
 */
export function extractCacheHeaders(responseHeaders?: Record<string, string>): HttpCacheHeaders {
  if (!responseHeaders) return {};

  const result: HttpCacheHeaders = {};

  // Standard header names (case-insensitive, but we normalize)
  const etag = responseHeaders['etag'] || responseHeaders['ETag'];
  const lastModified = responseHeaders['last-modified'] || responseHeaders['Last-Modified'];

  if (etag) result.etag = etag;
  if (lastModified) result.lastModified = lastModified;

  return result;
}
