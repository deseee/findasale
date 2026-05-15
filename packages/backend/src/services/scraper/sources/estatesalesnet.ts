/**
 * EstateSales.NET scraper adapter
 * Scrapes estate sales from estatesales.net using direct API calls
 * API works from datacenter IPs, no WAF blocking
 * ADR-073: Directory Scraper Phase 1 — API-based refactor
 */

import { RateLimiter } from '../rateLimiter';
import { ingestScrapedListing, ScrapedItem } from '../index';
import { getRandomUserAgent, getRandomReferer } from '../userAgents';
import { getCachedHeaders, setCachedHeaders, fetchWithConditionalHeaders, extractCacheHeaders } from '../httpCache';

const ESTATESALES_BASE_URL = 'https://www.estatesales.net';
const ESTATESALES_API_URL = 'https://www.estatesales.net/api/sale-details';

/**
 * EstateSales.NET API response type code mapping.
 * 1=Estate Sales, 2=Auctions, 16=Other (default to ESTATE if unknown)
 */
function mapEstateSalesTypeToSaleType(typeCode: number): string {
  switch (typeCode) {
    case 1:
      return 'ESTATE';
    case 2:
      return 'AUCTION';
    case 16:
      return 'ESTATE'; // Default for unknown types
    default:
      return 'ESTATE';
  }
}

/**
 * API response type from EstateSales.NET
 * Dates use wrapper format: { "_type": "DateTime", "_value": "ISO string" }
 */
interface EstatesalesNetApiRecord {
  id: number;
  name: string;
  orgName: string;
  orgId?: number; // EstateSales.NET numeric company ID for enrichment
  cityName: string;
  stateCode: string;
  postalCodeNumber: string;
  latitude: number;
  longitude: number;
  address: string;
  type: number;
  firstUtcStartDate?: { _type: string; _value: string };
  lastUtcEndDate?: { _type: string; _value: string };
  saleSchedule?: number;
}

/**
 * Scrape EstateSales.NET API for a specific coordinate center.
 * Returns ScrapedItem array without ingesting — used by GitHub Actions workflow.
 * Uses HTTP cache (ETag + Last-Modified) to reduce request volume by 60-80%.
 * Coordinate format: { lat: number, lng: number, radiusMiles: number, label: string }
 */
export async function scrapeEstateSalesNetItems(
  centerOrMetro: { lat: number; lng: number; radiusMiles: number; label: string },
  rateLimiter: RateLimiter
): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];

  try {
    await rateLimiter.loadRobotsTxt(ESTATESALES_BASE_URL);

    const { lat, lng, radiusMiles, label } = centerOrMetro;

    // API query: latitude_longitude_radius (negative longitude includes minus sign)
    const latLngRadius = `${lat}_${lng}_${radiusMiles}`;

    // Fields to retrieve from API
    const fields = [
      'id',
      'name',
      'orgName',
      'orgId',
      'cityName',
      'stateCode',
      'postalCodeNumber',
      'latitude',
      'longitude',
      'address',
      'type',
      'firstUtcStartDate',
      'lastUtcEndDate',
      'saleSchedule',
    ].join(',');

    const apiUrl = `${ESTATESALES_API_URL}?bypass=bycoordinatesanddistance:${latLngRadius}&include=saleschedule&select=${fields}&explicitTypes=DateTime`;

    console.log(
      `[EstateSalesNet] Querying API for ${label}: lat=${lat}, lng=${lng}, radius=${radiusMiles}mi`
    );

    const domain = new URL(ESTATESALES_API_URL).hostname;
    await rateLimiter.waitBeforeRequest(domain);

    if (!rateLimiter.isAllowed(apiUrl)) {
      console.warn(`[EstateSalesNet] Robots.txt advisory for ${apiUrl}, proceeding anyway`);
    }

    const referer = getRandomReferer();
    const headers: Record<string, string> = {
      'User-Agent': getRandomUserAgent(),
      Accept: 'application/json',
      'Accept-Language': 'en-US',
      'Accept-Encoding': 'gzip, deflate, br',
    };

    // Only add Referer header if not empty string
    if (referer) {
      headers['Referer'] = referer;
    }

    // Try to use cached ETag/Last-Modified for conditional request (RFC 7232)
    // Cache key is based on the API URL itself (all coordinate centers share same cache pattern)
    // In practice, we cache per-coordinate by storing in a synthetic "cache entry"
    // For now, fetch with conditional headers if available
    const cachedHeaders = await getCachedHeaders(`esn-api:${latLngRadius}`);

    const fetchResult = await fetchWithConditionalHeaders(apiUrl, cachedHeaders, headers, { timeout: 30000 });

    // 304 Not Modified — server says data hasn't changed
    if (fetchResult.status === 304) {
      console.log(`[EstateSalesNet] 304 Not Modified for ${label} — using cached data`);
      rateLimiter.clearBackoff(domain);
      return items; // Return empty; caller should use their last known data
    }

    // Non-ok status (429, 403, 404, 5xx, etc.) — handle error
    if (!fetchResult.ok || fetchResult.statusCode !== 200) {
      const status = fetchResult.statusCode || 500;
      if (status === 429) {
        const retryAfter = parseInt(headers['Retry-After'] || '60');
        rateLimiter.recordBackoff(domain, retryAfter);
      }
      console.warn(`[EstateSalesNet] API returned ${status} for ${label}`);
      return items;
    }

    // 200 OK — content changed, process and cache headers
    const records = (fetchResult.data as EstatesalesNetApiRecord[]) || [];
    console.log(`[EstateSalesNet] API returned ${records.length} sales for ${label}`);

    rateLimiter.clearBackoff(domain);

    // Store cache headers for next request
    if (fetchResult.responseHeaders) {
      const cacheHeaders = extractCacheHeaders(fetchResult.responseHeaders);
      if (Object.keys(cacheHeaders).length > 0) {
        await setCachedHeaders(`esn-api:${latLngRadius}`, cacheHeaders);
      }
    }

    // Convert each API record to ScrapedItem
    for (const record of records) {
      const item = parseApiRecordToScrapedItem(record);
      if (item) {
        items.push(item);
      }
    }

    return items;
  } catch (error) {
    console.error(`[EstateSalesNet] Scrape failed for center:`, error);
    throw error;
  }
}

/**
 * Convert a single API record to ScrapedItem
 */
function parseApiRecordToScrapedItem(record: EstatesalesNetApiRecord): ScrapedItem | null {
  try {
    // Validate required fields
    if (!record.name || !record.cityName || !record.stateCode) {
      return null;
    }

    // Parse dates from DateTime wrapper format
    const startDate = record.firstUtcStartDate?._value
      ? new Date(record.firstUtcStartDate._value)
      : null;
    const endDate = record.lastUtcEndDate?._value
      ? new Date(record.lastUtcEndDate._value)
      : null;

    if (!startDate || !endDate) {
      return null;
    }

    // Verified URL pattern: /{STATE}/{City-Slug}/{POSTAL_CODE}/{SALE_ID}
    // Examples observed: /MI/Grand-Rapids/49525/4899135, /IN/Elkhart/46514/4889307
    const citySlug = record.cityName
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join('-');
    const sourceUrl = `https://www.estatesales.net/${record.stateCode.toUpperCase()}/${citySlug}/${record.postalCodeNumber}/${record.id}`;

    return {
      title: record.name,
      address: record.address || '',
      city: record.cityName,
      state: record.stateCode.toUpperCase(),
      zip: record.postalCodeNumber || '',
      startDate,
      endDate,
      description: undefined,
      organizerName: record.orgName || undefined,
      organizerEmail: undefined,
      photoUrls: [],
      saleType: mapEstateSalesTypeToSaleType(record.type),
      sourceUrl,
      sourceName: 'EstateSalesNet',
      sourceItemId: `estatesales.net:${record.id}`,
      esnOrgId: record.orgId ?? undefined,
      scrapedMetadata: {
        apiResponse: record,
        lat: record.latitude,
        lng: record.longitude,
        saleSchedule: record.saleSchedule ?? null,
      },
    };
  } catch (error) {
    console.error(`[EstateSalesNet] Failed to parse API record ${record.id}:`, error);
    return null;
  }
}

/**
 * Scrape EstateSales.NET for a coordinate center and ingest results.
 * Supports both coordinate format (API-based) and legacy metro strings.
 * Metro strings are deprecated and return zero stats (legacy Puppeteer approach).
 */
export async function scrapeEstateSalesNet(
  centerOrMetro: string | { lat: number; lng: number; radiusMiles: number; label: string },
  organizerId: string,
  rateLimiter: RateLimiter
): Promise<{ created: number; updated: number; skipped: number; failed: number }> {
  const stats = { created: 0, updated: 0, skipped: 0, failed: 0 };

  try {
    // If it's a string (legacy metro format), log a warning and return zero stats
    // The new API approach only works with coordinate objects
    if (typeof centerOrMetro === 'string') {
      console.warn(
        `[EstateSalesNet] Legacy metro string format "${centerOrMetro}" is no longer supported. Use API-based approach with coordinate centers.`
      );
      return stats;
    }

    const items = await scrapeEstateSalesNetItems(centerOrMetro, rateLimiter);

    // Ingest collected items
    for (const item of items) {
      const result = await ingestScrapedListing(item, organizerId);
      if (result.status === 'created') stats.created++;
      else if (result.status === 'updated') stats.updated++;
      else if (result.status === 'skipped') stats.skipped++;
      else stats.failed++;
    }

    return stats;
  } catch (error) {
    const label = typeof centerOrMetro === 'string' ? centerOrMetro : centerOrMetro.label;
    console.error(`[EstateSalesNet] Scrape failed for ${label}:`, error);
    throw error;
  }
}

