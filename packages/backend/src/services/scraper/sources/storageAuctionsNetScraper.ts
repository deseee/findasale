/**
 * StorageAuctions.net scraper adapter
 * Source: https://www.storageauctions.net
 * ToS: Confirmed CLEAR — blank robots.txt Disallow, no anti-scraping ToS language
 *
 * API endpoint discovered: GET https://www.storageauctions.net/block/auction/getallonline/{page}/{sort}
 *   - Unauthenticated JSON API (no auth token required)
 *   - sort: 'esoon' (ending soon) returns active auctions
 *   - Returns ~16 records per page; pagination until empty array
 *   - ~32 active auctions across ~2 pages at any given time (small fleet)
 *   - Confirmed reachable: 2026-06-10
 *
 * NOTE: update.storageauctions.net is NOT a REST API — it is a WebSocket/push server.
 * All REST paths there return 404. The real data API is on www.storageauctions.net.
 *
 * Fields returned per auction record:
 *   facility_name, address, city, state_code, user_id, lat, lon, phone, photos
 *
 * Strategy: paginate getallonline/{page}/esoon, deduplicate by facility+city+state,
 * upsert organizers. Pattern mirrors storageAuctionsComScraper.ts.
 *
 * Rate limit: 0.5 req/sec between pages (conservative — small dataset, ~2 pages).
 * businessCategory: AUCTION_HOUSE (storage facility auction operators)
 *
 * ADR-073: Directory Scraper — Phase 1 (API-based, no headless browser needed)
 */

import { RateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { ScrapeStats } from '../sourceRegistry';

const SOURCE_NAME = 'StorageAuctionsNet';
const API_BASE = 'https://www.storageauctions.net';
const SORT = 'esoon'; // ending soon — returns active auctions
const MAX_PAGES = 50; // safety ceiling; ~2 real pages expected

interface AuctionRecord {
  facility_name?: string;
  address?: string;
  city?: string;
  state_code?: string;
  lat?: number | string | null;
  lon?: number | string | null;
  phone?: string;
  user_id?: number | string;
}

/**
 * Fetch one page from the getallonline endpoint.
 * Returns an array of auction records, or empty array when pagination is exhausted.
 */
async function fetchPage(page: number): Promise<AuctionRecord[]> {
  const url = `${API_BASE}/block/auction/getallonline/${page}/${SORT}`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; FindASale-Scraper/1.0)',
    },
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }

  const data = await response.json() as AuctionRecord[] | { auctions?: AuctionRecord[] } | null;

  // API may return a bare array or a wrapped object — handle both
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && 'auctions' in data && Array.isArray(data.auctions)) {
    return data.auctions;
  }
  return [];
}

/**
 * Main entry point for StorageAuctions.net scraper.
 * Paginates the public getallonline API, deduplicates by facility+city+state,
 * and upserts organizers.
 *
 * Export name matches the registry import: runStorageAuctionsNetScraper()
 * The legacy scrapeStorageAuctionsNet() export is kept for the registry run() adapter.
 */
export async function runStorageAuctionsNetScraper(): Promise<ScrapeStats> {
  const stats: ScrapeStats = {
    itemsFound: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
  };

  const seen = new Set<string>();
  let page = 1;

  console.log(`[StorageAuctionsNet] Starting — paginating getallonline/${SORT}`);

  while (page <= MAX_PAGES) {
    let records: AuctionRecord[];

    try {
      records = await fetchPage(page);
    } catch (err) {
      console.error(`[StorageAuctionsNet] Fetch failed page ${page}:`, err);
      stats.itemsFailed++;
      break;
    }

    if (!records || records.length === 0) {
      console.log(`[StorageAuctionsNet] Page ${page}: empty — stopping`);
      break;
    }

    console.log(`[StorageAuctionsNet] Page ${page}: processing ${records.length} records`);

    for (const record of records) {
      const name = record.facility_name?.trim();
      if (!name) continue;

      const city = record.city?.trim();
      const state = record.state_code?.trim()?.toUpperCase();

      if (!city || !state || state.length !== 2) {
        console.warn(`[StorageAuctionsNet] Missing/invalid city or state for "${name}" — skipping`);
        stats.itemsSkipped++;
        continue;
      }

      const dedupeKey = `${name.toLowerCase()}|${city.toLowerCase()}|${state}`;
      if (seen.has(dedupeKey)) {
        stats.itemsSkipped++;
        continue;
      }
      seen.add(dedupeKey);

      stats.itemsFound++;

      // Parse lat/lon — API may return strings or numbers
      const lat = record.lat != null ? Number(record.lat) : undefined;
      const lng = record.lon != null ? Number(record.lon) : undefined;
      const latVal = lat != null && !isNaN(lat) ? lat : undefined;
      const lngVal = lng != null && !isNaN(lng) ? lng : undefined;

      const address = record.address?.trim() || undefined;
      const phone = record.phone?.trim() || undefined;

      try {
        const orgId = await getOrCreateScrapedOrganizer(
          name,
          SOURCE_NAME,
          city,
          state,
          undefined, // esnOrgId
          undefined, // googlePlaceId
          undefined, // foursquareVenueId
          undefined, // hereBusinessId
          'AUCTION_HOUSE',
          undefined, // contactEmail
          phone,
          undefined, // website
          latVal,
          lngVal
        );

        if (orgId === null) {
          stats.itemsSkipped++;
          stats.itemsFound--; // deduped by DB (already exists)
        } else {
          stats.itemsCreated++;
        }
      } catch (err) {
        console.error(`[StorageAuctionsNet] Failed to ingest "${name}" (${city}, ${state}):`, err);
        stats.itemsFailed++;
      }
    }

    page++;

    // Polite delay between pages — 2 seconds (0.5 req/sec)
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  console.log('[StorageAuctionsNet] ────────────────────────────────────────────────────────');
  console.log(`[StorageAuctionsNet] TOTAL — found ${stats.itemsFound}, created ${stats.itemsCreated}, skipped ${stats.itemsSkipped}, failed ${stats.itemsFailed}`);
  console.log('[StorageAuctionsNet] ────────────────────────────────────────────────────────');

  if (stats.itemsFound === 0 && stats.itemsSkipped === 0) {
    console.warn('[StorageAuctionsNet] Completed with zero results — API may have changed or be unavailable');
  }

  return stats;
}

/**
 * Legacy export — kept for the sourceRegistry run() adapter and existing GH Actions workflow.
 * Delegates to runStorageAuctionsNetScraper().
 */
export async function scrapeStorageAuctionsNet(
  _metro: string,
  _organizerId: string,
  _rateLimiter: RateLimiter
): Promise<ScrapeStats> {
  return runStorageAuctionsNetScraper();
}
