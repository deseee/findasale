/**
 * StorageAuctions.com scraper adapter
 * Source: https://www.storageauctions.com
 * ToS: GRAY — ToS page exists at /tos but is Next.js CSR-only (no server-rendered text
 *   retrievable). No explicit anti-scraping clause found in robots.txt or any accessible
 *   page text. robots.txt: Allow: / (only /bu/, /se/, /api/, /verify-email, /create-password,
 *   /reset-password, /session-transfer/ are disallowed — all auth/user paths). The API used
 *   here is on a separate subdomain (core-service.auctions.storageauctions.com) not covered
 *   by the main robots.txt. Public /public/auctions endpoint requires no auth token.
 *
 * Strategy: call the public JSON API with a large geographic radius from the US geographic
 *   center (lat 39.8283, lng -98.5795) to enumerate all active auction listings nationwide.
 *   Each listing contains auctionLocation (facility name) and auctionCity ("City, ST") —
 *   exactly the organizer + city + state data we need. Deduplicate by name+city key so
 *   facilities with multiple active units are ingested once.
 *
 * API endpoint: GET https://core-service.auctions.storageauctions.com/public/auctions
 *   Params: lat, lng, radius (miles), limit (max 100), page (1-based)
 *   No authentication required for /public/* endpoints.
 *   Confirmed: 2026-06-10 — radius=2000 returns 3,103 auction listings, 100/page.
 *
 * Rate limit: 2-second delay between pages (polite — JSON API, not HTML scrape).
 * businessCategory: AUCTION_HOUSE (storage facility auction operators)
 *
 * ADR-073: Directory Scraper — Phase 1 (API-based, no headless browser needed)
 */

import { RateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { ScrapeStats } from '../sourceRegistry';

const SOURCE_NAME = 'StorageAuctionsCom';
const API_BASE = 'https://core-service.auctions.storageauctions.com';

// Geographic center of the contiguous US — wide enough radius covers all 48 states.
// Radius 2000 miles returns ~3,100 listings as of 2026-06-10.
// AK/HI are unlikely to have storage auctions on this platform (SpareBox/Storable focus).
const US_CENTER_LAT = 39.8283;
const US_CENTER_LNG = -98.5795;
const RADIUS_MILES = 2000;
const PAGE_LIMIT = 100;
const MAX_PAGES = 100; // safety ceiling: 100 pages × 100 records = 10,000

interface AuctionRecord {
  auctionLocation: string; // facility/company name
  auctionCity: string;     // "City, ST" format
}

interface ApiResponse {
  data: AuctionRecord[];
  page: number;
  total: number;
  limit: number;
}

/**
 * Parse "City, ST" → { city, state }.
 * Handles edge cases like "Grand Rapids, MI", "loves park, IL", "De Soto, IL".
 * Returns null if the format is unrecognisable.
 */
function parseCityState(auctionCity: string): { city: string; state: string } | null {
  if (!auctionCity) return null;

  const commaIdx = auctionCity.lastIndexOf(',');
  if (commaIdx < 1) return null;

  const city = auctionCity.slice(0, commaIdx).trim();
  const state = auctionCity.slice(commaIdx + 1).trim();

  // Validate: city non-empty, state is 2-char abbreviation
  if (!city || state.length !== 2) return null;

  // Title-case the city (API returns inconsistent capitalisation e.g. "loves park")
  const cityNormalized = city
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  return { city: cityNormalized, state: state.toUpperCase() };
}

/**
 * Fetch one page from the public auctions API.
 */
async function fetchPage(page: number): Promise<ApiResponse> {
  const url = new URL(`${API_BASE}/public/auctions`);
  url.searchParams.set('lat', String(US_CENTER_LAT));
  url.searchParams.set('lng', String(US_CENTER_LNG));
  url.searchParams.set('radius', String(RADIUS_MILES));
  url.searchParams.set('limit', String(PAGE_LIMIT));
  url.searchParams.set('page', String(page));

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; FindASale-Scraper/1.0)',
    },
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }

  return response.json() as Promise<ApiResponse>;
}

/**
 * Main entry point for StorageAuctions.com scraper.
 * Paginates the public /public/auctions API, deduplicates by facility+city,
 * and upserts organizers.
 */
export async function scrapeStorageAuctionsCom(
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

  const seen = new Set<string>();
  let page = 1;
  let totalRecords = 0;

  console.log(`[StorageAuctionsCom] Starting — radius ${RADIUS_MILES}mi from US center`);

  while (page <= MAX_PAGES) {
    let apiResponse: ApiResponse;

    try {
      apiResponse = await fetchPage(page);
    } catch (err) {
      console.error(`[StorageAuctionsCom] Fetch failed page ${page}:`, err);
      stats.itemsFailed++;
      break;
    }

    if (page === 1) {
      totalRecords = apiResponse.total;
      console.log(`[StorageAuctionsCom] API reports ${totalRecords} total auction records`);
    }

    const records = apiResponse.data;
    if (!records || records.length === 0) {
      console.log(`[StorageAuctionsCom] Page ${page}: empty — stopping`);
      break;
    }

    console.log(`[StorageAuctionsCom] Page ${page}: processing ${records.length} records`);

    for (const record of records) {
      const name = record.auctionLocation?.trim();
      if (!name) continue;

      const parsed = parseCityState(record.auctionCity);
      if (!parsed) {
        console.warn(`[StorageAuctionsCom] Could not parse city/state from "${record.auctionCity}" — skipping`);
        stats.itemsSkipped++;
        continue;
      }

      const dedupeKey = `${name.toLowerCase()}|${parsed.city.toLowerCase()}|${parsed.state}`;
      if (seen.has(dedupeKey)) {
        stats.itemsSkipped++;
        continue;
      }
      seen.add(dedupeKey);

      stats.itemsFound++;

      try {
        const orgId = await getOrCreateScrapedOrganizer(
          name,
          SOURCE_NAME,
          parsed.city,
          parsed.state,
          undefined, // esnOrgId
          undefined, // googlePlaceId
          undefined, // foursquareVenueId
          undefined, // hereBusinessId
          'AUCTION_HOUSE',
          undefined, // contactEmail
          undefined, // phone
          undefined, // website
          undefined, // lat
          undefined  // lng
        );

        if (orgId === null) {
          stats.itemsSkipped++;
          stats.itemsFound--; // undo: deduped by DB (already exists)
        } else {
          stats.itemsCreated++;
        }
      } catch (err) {
        console.error(`[StorageAuctionsCom] Failed to ingest "${name}" (${parsed.city}, ${parsed.state}):`, err);
        stats.itemsFailed++;
      }
    }

    // Check if there are more pages
    const fetched = (page - 1) * PAGE_LIMIT + records.length;
    if (fetched >= totalRecords || records.length < PAGE_LIMIT) {
      console.log(`[StorageAuctionsCom] Page ${page}: all records fetched (${fetched}/${totalRecords})`);
      break;
    }

    page++;

    // Polite delay between pages — 2 seconds
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  console.log('[StorageAuctionsCom] ────────────────────────────────────────────────────────');
  console.log(`[StorageAuctionsCom] TOTAL — found ${stats.itemsFound}, created ${stats.itemsCreated}, skipped ${stats.itemsSkipped}, failed ${stats.itemsFailed}`);
  console.log('[StorageAuctionsCom] ────────────────────────────────────────────────────────');

  if (stats.itemsFound === 0 && stats.itemsSkipped === 0) {
    console.warn('[StorageAuctionsCom] Completed with zero results — API may have changed or be unavailable');
  }

  return stats;
}
