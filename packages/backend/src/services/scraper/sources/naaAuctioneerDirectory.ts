/**
 * NAA Find an Auctioneer directory scraper
 * Source: https://www.auctioneers.org/find-an-auctioneer
 * Public member directory -- no ToS prohibition found.
 * Run mode: national-once (crawls all member profiles, metro param is unused).
 * ADR-073: Directory Scraper Phase 1
 *
 * STRATEGY: Novi AMS JSON API (no Playwright required).
 *
 * Investigation (2026-06-11):
 *   The /find-an-auctioneer landing page is JS-rendered via Knockout.js + Novi AMS
 *   platform. However the page source exposes a plain HTTP POST endpoint at
 *   /members/directory-customer-list that the frontend calls to populate member cards.
 *   This endpoint returns unauthenticated JSON with full structured member data:
 *   name, city, state, phone, email, website, lat/lng.
 *
 *   API parameters (from directory.js + page HTML):
 *     directoryID=7345  (NAA's Find an Auctioneer directory ID on Novi AMS)
 *     pageNumber=N      (1-based, 12 records per page)
 *     searchText=       (empty = all members)
 *     Total pages: ceil(2384 / 12) = 199
 *
 *   Prior approach (sitemap-driven profile fetch) was replaced because the Novi AMS
 *   platform redirects /find-an-auctioneer/<slug> back to the search landing page
 *   for non-member visitors -- individual profiles are no longer publicly accessible.
 *
 * ShippingCountry inconsistency: values include "United States", "USA", "United State"
 *   (typo in Novi AMS data), and "CAN". Filter by state code presence instead.
 * ShippingState inconsistency: occasionally a full state name ("Pennsylvania") instead
 *   of 2-letter code. Normalised via US_STATE_MAP.
 */

import { RateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { ScrapeStats } from '../sourceRegistry';

const NAA_BASE_URL = 'https://www.auctioneers.org';
const DIRECTORY_ENDPOINT = `${NAA_BASE_URL}/members/directory-customer-list`;
const DIRECTORY_ID = '7345';
const PAGE_SIZE = 12; // Novi AMS returns 12 members per page
const SOURCE_NAME = 'NAAFindAnAuctioneer';
const NAA_DOMAIN = 'www.auctioneers.org';

/** US state name -> 2-letter code map for normalisation */
const US_STATE_MAP: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY', 'district of columbia': 'DC',
};

/** Set of valid 2-letter US state codes */
const US_STATE_CODES = new Set(Object.values(US_STATE_MAP));

interface NoviMember {
  ID: number;
  Name: string;
  ShippingCity: string | null;
  ShippingState: string | null;
  ShippingCountry: string | null;
  ShippingLatitude: number | null;
  ShippingLongitude: number | null;
  Phone: string | null;
  Email: string | null;
  Website: string | null;
  HideContactInformation: boolean;
  HideAddress: boolean;
  HideOnWebsite: boolean;
}

interface NoviDirectoryResponse {
  Status: string;
  Members: NoviMember[];
  TotalCount: number;
}

/**
 * Normalise a ShippingState value to a 2-letter US code.
 * Returns null if the value cannot be resolved (e.g. Canadian province).
 */
function normaliseState(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 2) {
    const upper = trimmed.toUpperCase();
    return US_STATE_CODES.has(upper) ? upper : null;
  }
  return US_STATE_MAP[trimmed.toLowerCase()] ?? null;
}

/**
 * Fetch one page of the NAA directory via the Novi AMS JSON endpoint.
 */
async function fetchDirectoryPage(
  pageNumber: number,
  rateLimiter: RateLimiter
): Promise<NoviDirectoryResponse> {
  await rateLimiter.waitBeforeRequest(NAA_DOMAIN);

  const body = new URLSearchParams({
    directoryID: DIRECTORY_ID,
    pageNumber: String(pageNumber),
    searchText: '',
    memberTypeIDs: '',
    specialOffer: '',
    city: '',
    state: '',
  });

  const response = await fetch(DIRECTORY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': `${NAA_BASE_URL}/find-an-auctioneer`,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    body: body.toString(),
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    throw new Error(`[NAADirectory] HTTP ${response.status} on page ${pageNumber}`);
  }

  const data = (await response.json()) as NoviDirectoryResponse;

  if (data.Status !== 'OK') {
    throw new Error(`[NAADirectory] API status "${data.Status}" on page ${pageNumber}`);
  }

  return data;
}

/**
 * Main entry point for NAA directory scrape.
 * metro param is unused -- this is a national-once source.
 */
export async function scrapeNAADirectory(
  _metro: string,
  _organizerId: string,
  rateLimiter: RateLimiter
): Promise<ScrapeStats> {
  const stats: ScrapeStats = {
    itemsFound: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
  };

  console.log('[NAADirectory] Starting Novi AMS JSON API scrape');

  // Fetch page 1 to determine total count
  let firstPage: NoviDirectoryResponse;
  try {
    firstPage = await fetchDirectoryPage(1, rateLimiter);
  } catch (err) {
    console.error('[NAADirectory] Failed to fetch page 1:', err);
    throw err;
  }

  const totalCount = firstPage.TotalCount;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  console.log(`[NAADirectory] ${totalCount} members across ${totalPages} pages`);

  if (totalCount === 0) {
    throw new Error('[NAADirectory] Zero members returned -- API endpoint or directoryID may have changed');
  }

  // Process page 1 members
  await processMembers(firstPage.Members, stats);

  // Fetch remaining pages
  for (let page = 2; page <= totalPages; page++) {
    let pageData: NoviDirectoryResponse;
    try {
      pageData = await fetchDirectoryPage(page, rateLimiter);
    } catch (err) {
      console.error(`[NAADirectory] Failed to fetch page ${page}:`, err);
      stats.itemsFailed++;
      continue;
    }

    await processMembers(pageData.Members, stats);

    // Polite delay between pages (on top of RateLimiter's 1 req/sec floor)
    await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 400));

    if (page % 25 === 0) {
      console.log(
        `[NAADirectory] Progress: page ${page}/${totalPages} — ` +
        `created ${stats.itemsCreated}, skipped ${stats.itemsSkipped}`
      );
    }
  }

  console.log(
    `[NAADirectory] Complete — found ${stats.itemsFound}, created ${stats.itemsCreated}, ` +
    `skipped ${stats.itemsSkipped}, failed ${stats.itemsFailed}`
  );

  return stats;
}

/**
 * Ingest a batch of Novi AMS member records into the organizer table.
 */
async function processMembers(
  members: NoviMember[],
  stats: ScrapeStats
): Promise<void> {
  for (const member of members) {
    // Skip members who have opted out of public directory listing
    if (member.HideOnWebsite || member.HideContactInformation) {
      stats.itemsSkipped++;
      continue;
    }

    const name = (member.Name || '').trim();
    if (!name) {
      stats.itemsSkipped++;
      continue;
    }

    const city = (member.ShippingCity || '').trim() || null;
    const state = normaliseState(member.ShippingState);

    // Skip if we can't confirm US state (likely Canadian or invalid data)
    if (!state) {
      stats.itemsSkipped++;
      continue;
    }

    // Skip records with no city (insufficient for dedup)
    if (!city) {
      stats.itemsSkipped++;
      continue;
    }

    const phone = member.HideAddress ? undefined : (member.Phone?.trim() || undefined);
    const website = member.Website?.trim() || undefined;
    const email = member.HideContactInformation ? undefined : (member.Email?.trim() || undefined);
    const lat = member.ShippingLatitude ?? undefined;
    const lng = member.ShippingLongitude ?? undefined;

    stats.itemsFound++;

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
        email,
        phone,
        website,
        lat,
        lng
      );

      if (orgId === null) {
        stats.itemsSkipped++;
        stats.itemsFound--; // already existed
      } else {
        stats.itemsCreated++;
      }
    } catch (err) {
      console.error(`[NAADirectory] Failed to ingest "${name}" (${city}, ${state}):`, err);
      stats.itemsFailed++;
    }
  }
}
