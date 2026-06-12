/**
 * Bid13.com scraper adapter
 * Source: https://bid13.com
 * ToS: Confirmed CLEAR — no anti-scraping language in ToS (reviewed 2026-06-12).
 * robots.txt: Open — /api/v1/ path not disallowed. Crawl-delay: 5s (respected).
 *
 * ACTIVE — JSON API discovered via bid13_search.js (custom Drupal 7 module).
 * Endpoint: POST /api/v1/search.php?t={unix_timestamp}
 * Params: offset (int), limit (int), country ("us"), zipcode (string), distance (miles)
 * Response: { request, search_coords, results: [...], server_time }
 * Per result: { facility_nid, facility_name, city, state_code, country, latitude, longitude, ... }
 *
 * Strategy: 9 strategic US zip codes at 500-mile radius to cover all regions.
 * Paginate each zip until results < limit. Deduplicate by facility_nid.
 * Only facilities with active/upcoming auctions are returned (live directory,
 * not a static registry — run monthly for freshest organizer data).
 *
 * Confirmed working: 2026-06-12
 *   - Kalamazoo area (49009, 200mi): 253 results, 104 unique facilities (MI/OH/IN/IL/WI)
 *   - Atlanta area (30301, 500mi): 400 results, 165 unique facilities (Southeast)
 *
 * Bid13 is a Drupal 7 platform for storage unit auctions — facilities are
 * self-storage operators running sealed-bid auctions on unpaid units.
 *
 * ADR-073: Directory Scraper — Storage Unit Auction Houses
 */

import { getOrCreateScrapedOrganizer } from '../index';
import { RateLimiter } from '../rateLimiter';
import { ScrapeStats } from '../sourceRegistry';

const BID13_API = 'https://bid13.com/api/v1/search.php';
const SOURCE_NAME = 'Bid13';
const PAGE_LIMIT = 500;
/** robots.txt crawl-delay: 5 s — respected between all requests */
const CRAWL_DELAY_MS = 5000;
/** 500-mile radius gives good nationwide coverage with 9 anchor zip codes */
const DISTANCE_MILES = 500;

/**
 * US coverage anchors — 9 strategic zip codes at 500-mile radius.
 * Together these cover all continental US regions with substantial overlap
 * to ensure no region's facilities are missed in a single sweep.
 *
 * Coverage areas (approximate):
 *  49009 → MI/OH/IN/IL/WI              Great Lakes + Midwest
 *  10001 → NY/NJ/CT/PA/MA/VT/NH/ME    Northeast
 *  30301 → GA/AL/MS/NC/SC/TN/FL/VA    Southeast
 *  75201 → TX/OK/LA/AR/MO/KS/NM       South Central
 *  80202 → CO/UT/WY/NE/SD/NM/KS       Mountain / Central
 *  98101 → WA/OR/ID/MT                 Pacific Northwest
 *  90001 → CA/NV/AZ                    Southwest
 *  55401 → MN/ND/SD/IA/WI             Upper Midwest
 *  63101 → MO/KY/IL/TN/AR/IA          Heartland
 */
const COVERAGE_ZIPS: string[] = [
  '49009', // Kalamazoo, MI
  '10001', // New York, NY
  '30301', // Atlanta, GA
  '75201', // Dallas, TX
  '80202', // Denver, CO
  '98101', // Seattle, WA
  '90001', // Los Angeles, CA
  '55401', // Minneapolis, MN
  '63101', // St. Louis, MO
];

interface Bid13ApiResult {
  facility_nid: string;
  facility_name: string;
  city: string;
  state_code: string;
  country: string;
  latitude: string;
  longitude: string;
  title?: string;
  nid?: string;
  expiry?: string;
}

interface Bid13ApiResponse {
  results: Bid13ApiResult[];
  server_time?: number;
  request?: Record<string, unknown>;
  search_coords?: Record<string, string>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch one page of Bid13 auction results for a given zip code and offset.
 */
async function fetchBid13Page(
  zipcode: string,
  offset: number
): Promise<Bid13ApiResult[]> {
  const ts = Math.round(Date.now() / 1000);
  const url = `${BID13_API}?t=${ts}`;

  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(PAGE_LIMIT),
    country: 'us',
    zipcode,
    distance: String(DISTANCE_MILES),
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: 'https://bid13.com/auctions',
      Accept: 'application/json, text/javascript, */*; q=0.01',
    },
    body: params.toString(),
  });

  if (!res.ok) {
    throw new Error(
      `[Bid13] API returned HTTP ${res.status} for zip ${zipcode} offset ${offset}`
    );
  }

  const data = (await res.json()) as Bid13ApiResponse;
  return Array.isArray(data.results) ? data.results : [];
}

/**
 * Bid13 national scraper — fetches storage unit auction facilities
 * via the undocumented /api/v1/search.php JSON endpoint.
 *
 * Function signature preserved for sourceRegistry compatibility.
 * _metro, _organizerId, _rateLimiter are unused — this scraper uses
 * runMode: 'national-once' with internal 5 s crawl-delay per robots.txt.
 */
export async function scrapeBid13(
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

  /** Global dedup — a facility_nid seen via one zip anchor is not re-processed */
  const seenFacilityNids = new Set<string>();

  console.log(
    `[Bid13] Starting national sweep — ` +
    `${COVERAGE_ZIPS.length} zip anchors, ${DISTANCE_MILES} mi radius each`
  );

  for (const zipcode of COVERAGE_ZIPS) {
    let offset = 0;
    let zipNew = 0;

    console.log(`[Bid13] → zip ${zipcode}…`);

    try {
      while (true) {
        // Respect robots.txt crawl-delay: 5 s between all API calls
        if (offset > 0) {
          await sleep(CRAWL_DELAY_MS);
        }

        const results = await fetchBid13Page(zipcode, offset);

        if (results.length === 0) break;

        for (const r of results) {
          const fid = r.facility_nid?.trim();
          if (!fid) continue;

          // Already processed this facility from an earlier zip anchor
          if (seenFacilityNids.has(fid)) continue;
          seenFacilityNids.add(fid);

          stats.itemsFound++;

          const name = (r.facility_name ?? '').trim();
          const city = (r.city ?? '').trim();
          const state = (r.state_code ?? '').toUpperCase().trim();

          if (!name || !city || !state) {
            stats.itemsSkipped++;
            continue;
          }

          const latRaw = parseFloat(r.latitude ?? '');
          const lngRaw = parseFloat(r.longitude ?? '');
          const lat = isNaN(latRaw) ? undefined : latRaw;
          const lng = isNaN(lngRaw) ? undefined : lngRaw;
          const website = `https://bid13.com/node/${fid}`;

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
              undefined, // phone
              website,
              lat,
              lng,
              undefined, // isStateLicensed
              undefined, // licenseState
              undefined, // licenseNumber
              SOURCE_NAME
            );

            if (orgId) {
              zipNew++;
              stats.itemsCreated++;
            } else {
              // Returned null = duplicate merged or validation rejected
              stats.itemsUpdated++;
            }
          } catch (err) {
            console.error(`[Bid13] Failed to upsert facility ${fid} (${name}):`, err);
            stats.itemsFailed++;
          }
        }

        // Fewer results than limit → no more pages for this zip
        if (results.length < PAGE_LIMIT) break;
        offset += PAGE_LIMIT;
      }
    } catch (err) {
      console.error(`[Bid13] Error sweeping zip ${zipcode}:`, err);
      stats.itemsFailed++;
    }

    console.log(`[Bid13] zip ${zipcode} — ${zipNew} new facilities (${seenFacilityNids.size} total unique so far)`);
    // Polite delay between zip sweeps
    await sleep(CRAWL_DELAY_MS);
  }

  console.log(
    `[Bid13] Complete — ${stats.itemsFound} unique facilities ingested, ` +
    `${stats.itemsCreated} created, ${stats.itemsUpdated} merged/updated, ` +
    `${stats.itemsSkipped} skipped (missing fields), ${stats.itemsFailed} failed`
  );

  return stats;
}
