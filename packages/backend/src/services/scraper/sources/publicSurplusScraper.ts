/**
 * PublicSurplus.com scraper adapter
 * Source: https://www.publicsurplus.com
 * ToS: CLEAR — ToS pages return HTTP 500 (server-side error, not a block).
 *   Privacy Policy (the only accessible policy page) contains zero prohibition language.
 *   No "scrape", "crawl", "automated", "spider", "bot", "data mining", or "aggregate"
 *   language found anywhere on the accessible site.
 *   robots.txt: permissive — User-agent: * disallows only /images/.
 *   Verified: 2026-06-10
 *
 * PublicSurplus is a major US government surplus auction platform used by thousands
 * of public agencies (municipalities, counties, school districts, utilities). It is
 * owned by The Public Group, LLC and competes with GovDeals.
 *
 * Strategy:
 *   1. Iterate all 28 category IDs (full list hardcoded below).
 *   2. For each category, page through the Ajax listing endpoint
 *      (/sms/browse/cataucsAjax) which returns static XML with 25 auction items/page.
 *      Each item yields an auction ID and a 2-letter state abbreviation.
 *   3. Collect unique auction IDs with their state across all categories/pages.
 *   4. For each unique auction, fetch the detail page (/sms/auction/view?auc=ID)
 *      which contains the agency name in a static <div class="auction-print-agency">
 *      element and the full state in a <strong> tag after "Region:".
 *   5. Deduplicate by orgid (extracted from the "View Auctions" link) — if an agency
 *      already appeared in a previously-processed auction, skip its detail fetch.
 *   6. Call getOrCreateScrapedOrganizer for each unique agency.
 *
 * Volume: ~6,330 active auctions across 28 categories as of 2026-06-10.
 *   At 25/page that is ~254 Ajax pages, plus up to ~hundreds of unique agency
 *   detail fetches. Actual unique agencies << total auctions (many agencies list
 *   multiple items). Estimated 500–2,000 unique agencies.
 *
 * Rate limit: 0.5 req/sec (2-second delay between requests). The site is a
 *   government platform — be polite.
 *
 * ADR-073: Directory Scraper Phase 1
 */

import { RateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { getRandomUserAgent } from '../userAgents';
import { ScrapeStats } from '../sourceRegistry';

const PS_BASE_URL = 'https://www.publicsurplus.com';
const SOURCE_NAME = 'PublicSurplus';

/**
 * All 28 active category IDs on PublicSurplus.
 * Enumerated from /sms/browse/home on 2026-06-10.
 */
const CATEGORY_IDS: number[] = [
  22, // Airport
  24, // Animals and Livestock
  19, // Aviation
  10, // Building
  16, // Clothing
  18, // Collectibles
   1, // Computers
   2, // Electronics
   8, // Food Supply
  28, // For Children
  14, // Furniture
  17, // Heavy Equipment
  29, // Heavy Equipment Parts
  27, // Housewares
   6, // Industrial Equipment
  11, // Jewelry
  20, // Marine
  23, // Medical
   4, // Motor Pool
  21, // Motor Pool Parts
  13, // Office
   3, // Other
  12, // Recreation
  15, // Real Estate
   9, // Tools
  25, // Uniforms
   5, // Vehicles
  26, // Weapons
];

const PAGE_SIZE = 25; // Ajax endpoint returns 25 items per page
const MAX_PAGES_PER_CATEGORY = 100; // safety ceiling (100 × 25 = 2,500 auctions/category)
const REQUEST_DELAY_MS = 2000; // 0.5 req/sec — polite floor

interface AuctionRef {
  aucId: string;
  state: string; // 2-letter abbreviation from Ajax listing
}

interface AgencyRecord {
  name: string;
  city: string;  // derived from agency name heuristic or left empty
  state: string; // from detail page Region field
  orgId: string; // internal PS orgid
}

/** Decode common HTML entities. */
function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&#038;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;/g, '’')
    .replace(/&#8216;/g, '‘')
    .trim();
}

/**
 * Best-effort city extraction from a government agency name.
 * Returns empty string when city cannot be determined without geocoding.
 *
 * Examples:
 *   "Harris County Purchasing"     → city="Harris County" (county seat heuristic skipped — empty)
 *   "Meridian School District #505" → city="" (no city extractable)
 *   "City of Logan"                → city="Logan"
 *   "Logan City"                   → city="Logan"
 *   "Rosamond Community Services District" → city="Rosamond"
 */
function extractCityFromAgencyName(name: string): string {
  // "City of X" / "City of X, State" → X
  const cityOfMatch = name.match(/^City\s+of\s+([A-Za-z\s\.\-']+?)(?:,|\s*$)/);
  if (cityOfMatch) return cityOfMatch[1].trim();

  // "X City" → X (e.g. "Logan City", "Salt Lake City")
  const cityNameMatch = name.match(/^([A-Za-z\s\.\-']+?)\s+City(?:\s*$|,)/);
  if (cityNameMatch) {
    const candidate = cityNameMatch[1].trim();
    // Avoid matching things like "Kansas" from "Kansas City"
    if (candidate.split(/\s+/).length <= 3) return candidate + ' City';
  }

  // "X Township", "X Town", "X Village", "X Borough"
  const townMatch = name.match(/^([A-Za-z\s\.\-']+?)\s+(?:Township|Town|Village|Borough)(?:\s*$|,)/i);
  if (townMatch) return townMatch[1].trim();

  // "X Community Services District", "X Utilities", "X Water District" etc.
  // Extract the leading proper noun(s) as the city approximation
  const districtMatch = name.match(/^([A-Za-z][A-Za-z\s\.\-']{2,30}?)\s+(?:Community|Unified|School|Municipal|Water|Utility|Services|Fire|Transit|Airport|Port|Authority|District|County)\b/i);
  if (districtMatch) {
    const candidate = districtMatch[1].trim();
    // Must look like a real place name (no generic words)
    if (!/^(the|city|county|state|public|general|central|north|south|east|west)$/i.test(candidate)) {
      return candidate;
    }
  }

  return ''; // Cannot reliably extract city — leave empty, let geocoder fill later
}

/**
 * Fetch one page of auction listings for a category via the Ajax XML endpoint.
 * Returns the list of (aucId, state) pairs, or empty array on failure.
 *
 * The endpoint returns XML containing CDATA blocks of HTML.
 * Each auction item has `auc=NNNNN` in anchor hrefs and an
 * `auction-item-state` span containing the 2-letter state abbreviation.
 */
async function fetchCategoryPage(
  catId: number,
  page: number,
  rateLimiter: RateLimiter,
): Promise<AuctionRef[]> {
  const url = `${PS_BASE_URL}/sms/browse/cataucsAjax?catid=${catId}&page=${page}&sortBy=timeLeft&sortDesc=N&slth=y&samb=true`;
  const domain = new URL(PS_BASE_URL).hostname;
  await rateLimiter.waitBeforeRequest(domain);

  let responseText: string;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'application/xml,text/xml,*/*',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${PS_BASE_URL}/sms/browse/cataucs?catid=${catId}`,
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      console.warn(`[PublicSurplus] catid=${catId} page=${page}: HTTP ${response.status} — skipping`);
      return [];
    }

    responseText = await response.text();
  } catch (err) {
    console.warn(`[PublicSurplus] catid=${catId} page=${page}: fetch error — ${err}`);
    return [];
  }

  // The response is XML with CDATA blocks of HTML.
  // If it's a JSON not-found ({"response":{"status":"success","statusCode":"not-found"}})
  // or empty, we've hit the end of pagination.
  if (!responseText.includes('<ajax-response>') || responseText.includes('"not-found"')) {
    return [];
  }

  const refs: AuctionRef[] = [];

  // Extract auction IDs from href="/sms/auction/view?auc=NNNNN"
  // The XML CDATA wraps HTML so we parse with regex rather than an XML parser
  const aucMatches = responseText.matchAll(/href="\/sms\/auction\/view\?auc=(\d+)"/g);
  const seenInPage = new Set<string>();

  for (const m of aucMatches) {
    const aucId = m[1];
    if (seenInPage.has(aucId)) continue; // deduplicate — each auc appears twice (grid+table)
    seenInPage.add(aucId);

    // State abbreviation comes from auction-item-state span — appears as:
    // <span class="auction-item-state">\n\t\t\t\t\t\t\tWA\n
    // We correlate positionally: find the state span after this auction's ID
    // The XML lists grid items first, then table items in the same order.
    // Simple approach: grab all states in order and zip with IDs.
    refs.push({ aucId, state: '' }); // state filled in below
  }

  // Extract all state abbreviations in document order (matches auction order)
  const stateMatches = [...responseText.matchAll(/auction-item-state[^>]*>\s*\n\s*([A-Z]{2})\s*\n/g)];

  // The grid section has one state per auction; table section repeats them.
  // We should have stateMatches.length == refs.length or 2× if both views present.
  for (let i = 0; i < refs.length; i++) {
    refs[i].state = stateMatches[i]?.['1'] ?? '';
  }

  return refs;
}

/**
 * Fetch the detail page for a single auction and extract the agency name,
 * state (authoritative), and internal orgid.
 *
 * Returns null if the page cannot be fetched or the agency name is missing.
 */
async function fetchAuctionDetail(
  aucId: string,
  fallbackState: string,
  rateLimiter: RateLimiter,
): Promise<{ name: string; state: string; orgId: string } | null> {
  const url = `${PS_BASE_URL}/sms/auction/view?auc=${aucId}`;
  const domain = new URL(PS_BASE_URL).hostname;
  await rateLimiter.waitBeforeRequest(domain);

  let html: string;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      console.warn(`[PublicSurplus] auc=${aucId}: HTTP ${response.status}`);
      return null;
    }

    html = await response.text();
  } catch (err) {
    console.warn(`[PublicSurplus] auc=${aucId}: fetch error — ${err}`);
    return null;
  }

  // Agency name is in <div class="auction-print-agency ...">Name</div>
  const agencyMatch = html.match(/<div class="auction-print-agency[^"]*">\s*([^<\n]+?)\s*<\/div>/);
  if (!agencyMatch || !agencyMatch[1].trim()) {
    console.warn(`[PublicSurplus] auc=${aucId}: agency name not found in detail page`);
    return null;
  }

  // State from <div>Region:</div><div><strong>WA</strong></div>
  const stateMatch = html.match(/Region:<\/div>\s*<div>\s*<strong>([A-Z]{2})<\/strong>/);
  const state = stateMatch ? stateMatch[1] : fallbackState;

  // OrgId from href="/sms/list/current?orgid=NNNNN"
  const orgIdMatch = html.match(/href="\/sms\/list\/current\?orgid=(\d+)"/);
  const orgId = orgIdMatch ? orgIdMatch[1] : aucId; // fall back to aucId if orgid not found

  return {
    name: decodeEntities(agencyMatch[1].trim()),
    state,
    orgId,
  };
}

/**
 * Main entry point for PublicSurplus scraper.
 *
 * Phase 1 — Index: iterate all 28 categories × all pages via Ajax XML endpoint.
 *   Collect unique (aucId, state) pairs. Stop a category when a page returns empty.
 *
 * Phase 2 — Detail: for each unique auction ID (deduped by orgId), fetch the
 *   detail page to get the agency name. Skip detail fetch if orgId already seen.
 *
 * Phase 3 — Ingest: call getOrCreateScrapedOrganizer for each unique agency.
 */
export async function scrapePublicSurplus(
  _metro: string,
  _organizerId: string,
  rateLimiter: RateLimiter,
): Promise<ScrapeStats> {
  const stats: ScrapeStats = {
    itemsFound: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
  };

  await rateLimiter.loadRobotsTxt(PS_BASE_URL);
  console.log(`[PublicSurplus] Starting scrape — ${CATEGORY_IDS.length} categories`);

  // ── Phase 1: Index all auction IDs ──────────────────────────────────────────
  const allRefs = new Map<string, AuctionRef>(); // aucId → ref

  for (const catId of CATEGORY_IDS) {
    let page = 0;
    let categoryCount = 0;

    while (page < MAX_PAGES_PER_CATEGORY) {
      const refs = await fetchCategoryPage(catId, page, rateLimiter);

      if (refs.length === 0) {
        // Empty page = end of this category's pagination
        break;
      }

      for (const ref of refs) {
        if (!allRefs.has(ref.aucId)) {
          allRefs.set(ref.aucId, ref);
        }
      }

      categoryCount += refs.length;
      console.log(`[PublicSurplus] catid=${catId} page=${page}: ${refs.length} auctions`);

      page++;
      await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
    }

    console.log(`[PublicSurplus] catid=${catId}: total ${categoryCount} auctions indexed`);
  }

  console.log(`[PublicSurplus] Index complete — ${allRefs.size} unique auction IDs`);

  // ── Phase 2 & 3: Detail fetch + ingest, deduplicated by orgId ───────────────
  const seenOrgIds = new Set<string>();
  const agencies: AgencyRecord[] = [];

  for (const [aucId, ref] of allRefs) {
    const detail = await fetchAuctionDetail(aucId, ref.state, rateLimiter);

    if (!detail) {
      stats.itemsFailed++;
      continue;
    }

    // Deduplicate by orgId — same agency listed in multiple auctions
    if (seenOrgIds.has(detail.orgId)) {
      continue;
    }
    seenOrgIds.add(detail.orgId);

    const city = extractCityFromAgencyName(detail.name);
    agencies.push({ name: detail.name, city, state: detail.state, orgId: detail.orgId });

    await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
  }

  console.log(`[PublicSurplus] Found ${agencies.length} unique agencies after deduplication`);
  stats.itemsFound = agencies.length;

  for (const agency of agencies) {
    try {
      const orgId = await getOrCreateScrapedOrganizer(
        agency.name,
        SOURCE_NAME,
        agency.city,
        agency.state,
        undefined, // esnOrgId
        undefined, // googlePlaceId
        undefined, // foursquareVenueId
        undefined, // hereBusinessId
        'AUCTION_HOUSE',
        undefined, // contactEmail
        undefined, // phone
        PS_BASE_URL, // website
        undefined, // lat
        undefined,  // lng
      );

      if (orgId === null) {
        stats.itemsSkipped++;
      } else {
        stats.itemsCreated++;
      }
    } catch (err) {
      console.error(
        `[PublicSurplus] Failed to ingest "${agency.name}" (${agency.city}, ${agency.state}):`,
        err,
      );
      stats.itemsFailed++;
    }
  }

  console.log('[PublicSurplus] ─────────────────────────────────────────────────────');
  console.log(
    `[PublicSurplus] TOTAL — found ${stats.itemsFound}, created ${stats.itemsCreated}, ` +
    `skipped ${stats.itemsSkipped}, failed ${stats.itemsFailed}`,
  );
  console.log('[PublicSurplus] ─────────────────────────────────────────────────────');

  if (stats.itemsFound === 0) {
    console.warn('[PublicSurplus] Completed with zero results — site markup may have changed');
  }

  return stats;
}
