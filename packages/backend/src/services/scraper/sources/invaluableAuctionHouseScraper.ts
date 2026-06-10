/**
 * Invaluable.com auction house directory scraper
 * Source: https://www.invaluable.com/auction-houses
 * ToS: GRAY — ToS page is JS-rendered (CSR-only), not accessible via static fetch.
 *   robots.txt returns empty (no Disallow rules found — open). Public unauthenticated
 *   JSON REST API at /auction-houses endpoint, linked from main nav, serves 8,158
 *   auction houses as paginated HAL-style JSON. No auth token required.
 *   Same GRAY classification as StorageAuctions.com (already in fleet).
 *   Verified: 2026-06-10.
 *
 * Strategy: paginate the public REST API with countryCode=US filter, size=100,
 *   sort=houseName,asc. Parse each record's primary location for city/state. Upsert
 *   via getOrCreateScrapedOrganizer with businessCategory AUCTION_HOUSE.
 *
 * API endpoint: GET https://www.invaluable.com/auction-houses
 *   Params: page (0-based), size (max 100 reliable), sort, countryCode=US
 *   Response: HAL JSON — _embedded.auctionHouseViewList[], page.{totalPages, totalElements}
 *   Confirmed: 2026-06-10 — page.totalElements=8158, page.totalPages=82 at size=100.
 *
 * Rate limit: 2-second delay between pages (82 pages total, ~3 min total runtime).
 *
 * ADR-073: Directory Scraper — Phase 1 (API-based, no headless browser needed)
 */

import { RateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { ScrapeStats } from '../sourceRegistry';

const SOURCE_NAME = 'Invaluable';
const API_BASE = 'https://www.invaluable.com';
const PAGE_SIZE = 100;
const MAX_PAGES = 200; // safety ceiling — actual is ~82 at size=100

interface InvaluableLocation {
  addressCity?: string;
  stateCode?: string;
  stateName?: string;
  postalCode?: string;
  countryCode?: string;
  addressPhone?: string;
  email?: string;
  primary?: boolean;
}

interface InvaluableLinks {
  website?: { href: string };
  self?: { href: string };
}

interface AuctionHouseRecord {
  sellerName?: string;
  sellerId?: number;
  ref?: string;
  locations?: InvaluableLocation[];
  _links?: InvaluableLinks;
}

interface InvaluableApiResponse {
  _embedded?: {
    auctionHouseViewList?: AuctionHouseRecord[];
  };
  page?: {
    size: number;
    totalElements: number;
    totalPages: number;
    number: number;
  };
}

/**
 * Extract the primary US location from a record's locations array.
 * Prefers primary=true, falls back to first US entry.
 * Returns null if no valid US location with city + 2-letter stateCode found.
 */
function extractPrimaryLocation(
  locations: InvaluableLocation[] | undefined
): { city: string; state: string; phone?: string; email?: string } | null {
  if (!locations || locations.length === 0) return null;

  // Prefer primary=true and countryCode=US
  let loc = locations.find((l) => l.primary === true && l.countryCode === 'US');
  // Fallback: any US location
  if (!loc) {
    loc = locations.find((l) => l.countryCode === 'US');
  }
  // Last fallback: first location with a stateCode
  if (!loc) {
    loc = locations.find((l) => l.stateCode && l.stateCode.length === 2);
  }

  if (!loc) return null;

  const city = loc.addressCity?.trim();
  const state = loc.stateCode?.trim().toUpperCase();

  if (!city || !state || state.length !== 2) return null;

  return {
    city,
    state,
    phone: loc.addressPhone?.trim() || undefined,
    email: loc.email?.trim() || undefined,
  };
}

/**
 * Fetch one page from the Invaluable auction houses API.
 * page is 0-based as the API expects.
 */
async function fetchPage(page: number): Promise<InvaluableApiResponse> {
  const url = new URL(`${API_BASE}/auction-houses`);
  url.searchParams.set('page', String(page));
  url.searchParams.set('size', String(PAGE_SIZE));
  url.searchParams.set('sort', 'houseName,asc');
  url.searchParams.set('countryCode', 'US');

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json,application/hal+json',
      'User-Agent': 'Mozilla/5.0 (compatible; FindASale-Scraper/1.0)',
      Referer: 'https://www.invaluable.com/auction-houses',
    },
    signal: AbortSignal.timeout(25000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }

  return response.json() as Promise<InvaluableApiResponse>;
}

/**
 * Main entry point for Invaluable.com auction house directory scraper.
 * Paginates the public /auction-houses JSON API (US-only), parses primary
 * location, and upserts organizers with businessCategory AUCTION_HOUSE.
 */
export async function scrapeInvaluable(
  _metro: string,
  _organizerId: string,
  _rateLimiter: RateLimiter
): Promise<ScrapeStats> {
  const stats: ScrapeStats = {
    itemsFound: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
  };

  let page = 0;
  let totalPages: number | undefined;

  console.log('[Invaluable] Starting auction house directory scrape — US only, size=100');

  while (page <= MAX_PAGES) {
    let apiResponse: InvaluableApiResponse;

    try {
      apiResponse = await fetchPage(page);
    } catch (err) {
      console.error(`[Invaluable] Fetch failed page ${page}:`, err);
      stats.itemsFailed++;
      break;
    }

    if (page === 0) {
      totalPages = apiResponse.page?.totalPages;
      const totalElements = apiResponse.page?.totalElements;
      console.log(
        `[Invaluable] API reports ${totalElements ?? 'unknown'} total records, ${totalPages ?? 'unknown'} pages`
      );
    }

    const records = apiResponse._embedded?.auctionHouseViewList;
    if (!records || records.length === 0) {
      console.log(`[Invaluable] Page ${page}: empty — stopping`);
      break;
    }

    console.log(`[Invaluable] Page ${page}: processing ${records.length} records`);

    for (const record of records) {
      const name = record.sellerName?.trim();
      if (!name) continue;

      const location = extractPrimaryLocation(record.locations);
      if (!location) {
        console.warn(
          `[Invaluable] No valid US location for "${name}" (sellerId=${record.sellerId}) — skipping`
        );
        stats.itemsSkipped++;
        continue;
      }

      stats.itemsFound++;

      const website = record._links?.website?.href?.trim() || undefined;

      try {
        const orgId = await getOrCreateScrapedOrganizer(
          name,
          SOURCE_NAME,
          location.city,
          location.state,
          undefined,        // esnOrgId
          undefined,        // googlePlaceId
          undefined,        // foursquareVenueId
          undefined,        // hereBusinessId
          'AUCTION_HOUSE',
          location.email,   // contactEmail
          location.phone,   // phone
          website,          // website
          undefined,        // lat
          undefined         // lng
        );

        if (orgId === null) {
          stats.itemsSkipped++;
          stats.itemsFound--; // undo: already exists in DB
        } else {
          stats.itemsCreated++;
        }
      } catch (err) {
        console.error(
          `[Invaluable] Failed to ingest "${name}" (${location.city}, ${location.state}):`,
          err
        );
        stats.itemsFailed++;
      }
    }

    // Advance page
    page++;

    // Stop if we've passed totalPages (0-based: last page = totalPages - 1)
    if (totalPages !== undefined && page >= totalPages) {
      console.log(`[Invaluable] Page ${page - 1} was last page (totalPages=${totalPages}) — done`);
      break;
    }

    // Polite delay: 2 seconds between pages
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  console.log('[Invaluable] ────────────────────────────────────────────────────────────');
  console.log(
    `[Invaluable] TOTAL — found ${stats.itemsFound}, created ${stats.itemsCreated}, skipped ${stats.itemsSkipped}, failed ${stats.itemsFailed}`
  );
  console.log('[Invaluable] ────────────────────────────────────────────────────────────');

  if (stats.itemsFound === 0 && stats.itemsSkipped === 0) {
    console.warn(
      '[Invaluable] Completed with zero results — API may have changed or be rate-limited'
    );
  }

  return stats;
}
