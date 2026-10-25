/**
 * NAA Find an Auctioneer directory scraper
 * Source: https://members.auctioneers.org/find-an-auctioneer
 * Public member directory -- no ToS prohibition found.
 * Run mode: national-once (crawls all member profiles, metro param is unused).
 * ADR-073: Directory Scraper Phase 1
 *
 * STRATEGY: Novi AMS directory endpoint (no Playwright required).
 *
 * Investigation (2026-06-11):
 *   The find-an-auctioneer page is JS-rendered via Knockout.js + Novi AMS. The page
 *   calls a plain HTTP POST endpoint at /members/directory-customer-list
 *   (directoryID=7345) that returns unauthenticated JSON.
 *
 * Re-investigation (2026-10-24, scheduled run of 2026-10-01 failed):
 *   NAA moved its public site to WordPress at www.auctioneers.org and the Novi AMS
 *   member platform to members.auctioneers.org. The old endpoint on www now returns
 *   HTTP 404 (the WordPress "Page not found" page), which is what failed the run.
 *   On the new host the endpoint still exists, but the JSON "Members" array now only
 *   carries IDs (plus lat/lng in map view). Name, address, phone and website are only
 *   in the "Html" fragment. With mapView=true the fragment holds one badge per member
 *   with the address split by <br /> into street and "City, ST ZIP" lines (the list
 *   view has no address at all), 20 members per page, stable ordering across pages.
 *   Personal emails are no longer exposed (only a secure-contact form link).
 *
 * Address quirks: state is sometimes lower case ("ca") or a full name; a trailing
 *   country line appears on some records ("United States", "United State of America",
 *   "USA", "Canada"). Non-US members (Canadian provinces) are skipped.
 */

import * as cheerio from 'cheerio';
import { RateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { ScrapeStats } from '../sourceRegistry';

const NAA_BASE_URL = 'https://members.auctioneers.org';
const DIRECTORY_ENDPOINT = `${NAA_BASE_URL}/members/directory-customer-list`;
const DIRECTORY_ID = '7345';
const PAGE_SIZE = 20; // Novi AMS map view returns 20 members per page
const SOURCE_NAME = 'NAAFindAnAuctioneer';
const NAA_DOMAIN = 'members.auctioneers.org';

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

/** Trailing country lines seen in the directory that still mean a US address */
const US_COUNTRY_RE = /^(united states?( of america)?|usa?|u\.s\.a?\.?)$/i;

interface NoviMapMember {
  ID: number;
  IsCompany?: boolean;
  ShippingAddress?: { Lat: number | null; Long: number | null } | null;
}

interface NoviDirectoryResponse {
  Status: string;
  Html: string;
  Members: NoviMapMember[];
  TotalCount: number;
}

/** One member as parsed from the directory's map-view HTML fragment */
export interface NAAMemberRecord {
  id: number;
  name: string;
  city: string | null;
  state: string | null;
  phone?: string;
  website?: string;
  lat?: number;
  lng?: number;
}

/**
 * Normalise a state value to a 2-letter US code.
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
 * Parse the address lines of one badge ("street<br />City, ST ZIP<br />Country")
 * into a US city + state. Returns nulls when the address is missing or non-US.
 */
export function parseCityState(lines: string[]): { city: string | null; state: string | null } {
  const clean = lines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (clean.length === 0) return { city: null, state: null };

  let last = clean[clean.length - 1];
  if (!/,/.test(last) && clean.length > 1) {
    // Trailing country line: keep going only if it is a US spelling
    if (!US_COUNTRY_RE.test(last)) return { city: null, state: null };
    clean.pop();
    last = clean[clean.length - 1];
  }

  // "City, ST 12345-6789" or "City, State Name 12345" or "City, ST"
  const m = last.match(/^(.+?),\s*([A-Za-z][A-Za-z .]*?)\s*(\d{5}(?:-\d{4})?)?$/);
  if (!m) return { city: null, state: null };
  const state = normaliseState(m[2]);
  const city = m[1].trim();
  if (!state || !city) return { city: null, state: null };
  return { city, state };
}

/** Parse the map-view HTML fragment into member records. */
export function parseDirectoryHtml(html: string, members: NoviMapMember[]): NAAMemberRecord[] {
  const $ = cheerio.load(html);
  const coords = new Map<number, { lat?: number; lng?: number }>();
  for (const m of members || []) {
    const lat = m.ShippingAddress?.Lat;
    const lng = m.ShippingAddress?.Long;
    coords.set(m.ID, {
      lat: typeof lat === 'number' && lat !== 0 ? lat : undefined,
      lng: typeof lng === 'number' && lng !== 0 ? lng : undefined,
    });
  }

  const out: NAAMemberRecord[] = [];
  $('div[data-member-id]').each((_, el) => {
    const badge = $(el);
    const id = Number(badge.attr('data-member-id'));
    const name = badge.find('.c-directory-map-view-member-badge__info-name').first().text().replace(/\s+/g, ' ').trim();

    const addrHtml = badge.find('span.address').first().html() || '';
    const lines = addrHtml
      .split(/<br\s*\/?>/i)
      .map((part) => cheerio.load(`<i>${part}</i>`)('i').text());
    const { city, state } = parseCityState(lines);

    const websiteHref = badge.find('a.icon.website').first().attr('href')?.trim();
    const telHref = badge.find('a.icon.phone').first().attr('href')?.trim();
    const phone = telHref && telHref.toLowerCase().startsWith('tel:') ? telHref.slice(4).trim() || undefined : undefined;

    const c = coords.get(id) || {};
    out.push({
      id,
      name,
      city,
      state,
      phone,
      website: websiteHref || undefined,
      lat: c.lat,
      lng: c.lng,
    });
  });
  return out;
}

/**
 * Fetch one page of the NAA directory (map view) via the Novi AMS endpoint.
 * Returns null when the page is past the end (the server answers with an empty body).
 */
async function fetchDirectoryPage(
  pageNumber: number,
  rateLimiter: RateLimiter
): Promise<NoviDirectoryResponse | null> {
  await rateLimiter.waitBeforeRequest(NAA_DOMAIN);

  const body = new URLSearchParams({
    directoryID: DIRECTORY_ID,
    pageNumber: String(pageNumber),
    searchText: '',
    memberTypeIDs: '',
    specialOffer: '',
    city: '',
    state: '',
    zip: '',
    county: '',
    country: '',
    mapView: 'true',
    latitude: '',
    longitude: '',
    radius: '',
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
    throw new Error(`[NAADirectory] HTTP ${response.status} on page ${pageNumber} (${DIRECTORY_ENDPOINT})`);
  }

  const text = (await response.text()).trim();
  if (!text) return null;

  let data: NoviDirectoryResponse;
  try {
    data = JSON.parse(text) as NoviDirectoryResponse;
  } catch {
    throw new Error(`[NAADirectory] Non-JSON response on page ${pageNumber}: ${text.slice(0, 120)}`);
  }

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

  console.log('[NAADirectory] Starting Novi AMS directory scrape (map view)');

  // Fetch page 1 to determine total count
  let firstPage: NoviDirectoryResponse | null;
  try {
    firstPage = await fetchDirectoryPage(1, rateLimiter);
  } catch (err) {
    console.error('[NAADirectory] Failed to fetch page 1:', err);
    throw err;
  }

  const totalCount = firstPage?.TotalCount ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  console.log(`[NAADirectory] ${totalCount} members across ${totalPages} pages`);

  if (!firstPage || totalCount === 0) {
    throw new Error('[NAADirectory] Zero members returned -- API endpoint or directoryID may have changed');
  }

  const firstRecords = parseDirectoryHtml(firstPage.Html, firstPage.Members);
  if (firstRecords.length === 0) {
    // The JSON said there are members but no badge parsed: the HTML layout changed.
    throw new Error('[NAADirectory] Page 1 returned members but no parsable member badges -- directory HTML layout may have changed');
  }

  // Process page 1 members
  await processMembers(firstRecords, stats);

  // Fetch remaining pages
  for (let page = 2; page <= totalPages; page++) {
    let pageData: NoviDirectoryResponse | null;
    try {
      pageData = await fetchDirectoryPage(page, rateLimiter);
    } catch (err) {
      console.error(`[NAADirectory] Failed to fetch page ${page}:`, err);
      stats.itemsFailed++;
      continue;
    }
    if (!pageData) break; // past the end

    await processMembers(parseDirectoryHtml(pageData.Html, pageData.Members), stats);

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
 * Ingest a batch of parsed member records into the organizer table.
 * The directory only lists members who chose to be public; members with a hidden
 * address have no address line and are skipped (no city to dedup on).
 */
async function processMembers(
  members: NAAMemberRecord[],
  stats: ScrapeStats
): Promise<void> {
  for (const member of members) {
    const name = (member.name || '').trim();
    if (!name) {
      stats.itemsSkipped++;
      continue;
    }

    // Skip if we can't confirm a US state (Canadian, hidden or invalid address)
    if (!member.state) {
      stats.itemsSkipped++;
      continue;
    }

    // Skip records with no city (insufficient for dedup)
    if (!member.city) {
      stats.itemsSkipped++;
      continue;
    }

    const { city, state } = member;

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
        undefined, // email: the directory no longer exposes member emails
        member.phone,
        member.website,
        member.lat,
        member.lng
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
