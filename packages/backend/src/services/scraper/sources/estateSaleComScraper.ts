/**
 * EstateSale.com scraper
 * Source: https://www.estatesale.com/estate-sale-companies
 *
 * robots.txt: Crawl-Delay: 10. All Disallow rules are commented out —
 *   effectively open for *. State pages and company profiles confirmed
 *   accessible (verified 2026-06-12).
 * ToS: Standard terms; no anti-scraping prohibition found.
 * Server-rendered HTML: confirmed — both state listing pages and company
 *   profile pages are static HTML, no JS required.
 *
 * Strategy:
 *   Phase 1 — Iterate all 51 state pages:
 *     /states/featuredCompanies/{id}/Estate-Sale-Companies-{Name}.html
 *     Extract company profile URLs + basic info from table rows.
 *   Phase 2 — Visit each company profile page:
 *     Extract phone, email, website from Contact Information section.
 *     Upsert via getOrCreateScrapedOrganizer.
 *
 * Data available on profile pages:
 *   name, city, state, phone, email (optional), website (optional)
 *
 * Crawl delay: 10+ seconds between ALL requests (robots.txt Crawl-Delay: 10)
 * ADR-073: Directory Scraper Phase 2
 */

import * as cheerio from 'cheerio';
import { RateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { getRandomUserAgent } from '../userAgents';
import { ScrapeStats } from '../sourceRegistry';

const BASE_URL = 'https://www.estatesale.com';
const SOURCE_NAME = 'EstateSaleCom';
const BUSINESS_CATEGORY = 'ESTATE_SALE_CO';

const SOCIAL_DOMAINS = [
  'facebook.com', 'twitter.com', 'instagram.com', 'x.com',
  'linkedin.com', 'youtube.com', 'yelp.com', 'pinterest.com', 'tiktok.com',
  'googleadservices.com', 'doubleclick.net', 'google.com', 'maps.google',
];
const isSocialOrTracking = (url: string): boolean =>
  SOCIAL_DOMAINS.some(d => url.includes(d));

// All 51 states + DC with their numeric IDs used in EstateSale.com URLs
const STATES: Array<{ id: number; name: string; abbr: string }> = [
  { id: 1, name: 'Alabama', abbr: 'AL' },
  { id: 2, name: 'Alaska', abbr: 'AK' },
  { id: 3, name: 'Arizona', abbr: 'AZ' },
  { id: 4, name: 'Arkansas', abbr: 'AR' },
  { id: 5, name: 'California', abbr: 'CA' },
  { id: 6, name: 'Colorado', abbr: 'CO' },
  { id: 7, name: 'Connecticut', abbr: 'CT' },
  { id: 8, name: 'Delaware', abbr: 'DE' },
  { id: 9, name: 'Florida', abbr: 'FL' },
  { id: 10, name: 'Georgia', abbr: 'GA' },
  { id: 11, name: 'Hawaii', abbr: 'HI' },
  { id: 12, name: 'Idaho', abbr: 'ID' },
  { id: 13, name: 'Illinois', abbr: 'IL' },
  { id: 14, name: 'Indiana', abbr: 'IN' },
  { id: 15, name: 'Iowa', abbr: 'IA' },
  { id: 16, name: 'Kansas', abbr: 'KS' },
  { id: 17, name: 'Kentucky', abbr: 'KY' },
  { id: 18, name: 'Louisiana', abbr: 'LA' },
  { id: 19, name: 'Maine', abbr: 'ME' },
  { id: 20, name: 'Maryland', abbr: 'MD' },
  { id: 21, name: 'Massachusetts', abbr: 'MA' },
  { id: 22, name: 'Michigan', abbr: 'MI' },
  { id: 23, name: 'Minnesota', abbr: 'MN' },
  { id: 24, name: 'Mississippi', abbr: 'MS' },
  { id: 25, name: 'Missouri', abbr: 'MO' },
  { id: 26, name: 'Montana', abbr: 'MT' },
  { id: 27, name: 'Nebraska', abbr: 'NE' },
  { id: 28, name: 'Nevada', abbr: 'NV' },
  { id: 29, name: 'New Hampshire', abbr: 'NH' },
  { id: 30, name: 'New Jersey', abbr: 'NJ' },
  { id: 31, name: 'New Mexico', abbr: 'NM' },
  { id: 32, name: 'New York', abbr: 'NY' },
  { id: 33, name: 'North Carolina', abbr: 'NC' },
  { id: 34, name: 'North Dakota', abbr: 'ND' },
  { id: 35, name: 'Ohio', abbr: 'OH' },
  { id: 36, name: 'Oklahoma', abbr: 'OK' },
  { id: 37, name: 'Oregon', abbr: 'OR' },
  { id: 38, name: 'Pennsylvania', abbr: 'PA' },
  { id: 39, name: 'Rhode Island', abbr: 'RI' },
  { id: 40, name: 'South Carolina', abbr: 'SC' },
  { id: 41, name: 'South Dakota', abbr: 'SD' },
  { id: 42, name: 'Tennessee', abbr: 'TN' },
  { id: 43, name: 'Texas', abbr: 'TX' },
  { id: 44, name: 'Utah', abbr: 'UT' },
  { id: 45, name: 'Vermont', abbr: 'VT' },
  { id: 46, name: 'Virginia', abbr: 'VA' },
  { id: 47, name: 'Washington', abbr: 'WA' },
  { id: 48, name: 'West Virginia', abbr: 'WV' },
  { id: 49, name: 'Wisconsin', abbr: 'WI' },
  { id: 50, name: 'Wyoming', abbr: 'WY' },
  { id: 51, name: 'Washington DC', abbr: 'DC' },
];

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) {
      console.warn(`[EstateSaleCom] HTTP ${response.status} for ${url}`);
      return null;
    }
    return await response.text();
  } catch (err) {
    console.warn(`[EstateSaleCom] Fetch failed for ${url}:`, err);
    return null;
  }
}

/**
 * Parse a state listing page — extract company profile URLs and basic info.
 * State pages contain a table where each row has:
 *   <td><a href="/companies/view/{id}/{slug}.html">Company Name</a></td>
 *   <td>Contact Name</td>
 *   <td>City, ST</td>
 */
function parseStatePage(
  html: string,
  fallbackAbbr: string,
): Array<{ profileUrl: string; name: string; city: string }> {
  const $ = cheerio.load(html);
  const companies: Array<{ profileUrl: string; name: string; city: string }> = [];
  const seen = new Set<string>();

  $('table tr').each((_i, row) => {
    const cells = $(row).find('td');
    if (cells.length < 3) return;

    const linkEl = $(cells[0]).find('a[href*="/companies/view/"]').first();
    const href = linkEl.attr('href');
    if (!href) return;

    const profileUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
    const name = linkEl.text().trim();
    if (!name || seen.has(profileUrl)) return;

    // Last cell contains "City, ST" — take everything before the comma
    const locationText = $(cells[cells.length - 1]).text().trim();
    const city = locationText.split(',')[0]?.trim() || '';

    seen.add(profileUrl);
    companies.push({ profileUrl, name, city });
  });

  return companies;
}

/**
 * Parse a company profile page — extract contact details.
 * Profile pages expose: name (h1), Location: City, ST, Phone, mailto email, external website.
 */
function parseProfilePage(html: string): {
  name: string;
  city: string;
  state: string;
  phone?: string;
  email?: string;
  website?: string;
} {
  const $ = cheerio.load(html);

  // Company name — first h1 on page
  const name = $('h1').first().text().trim();

  // Body text for regex-based extraction
  const bodyText = $('body').text();

  // Phone — "Phone: (xxx)xxx-xxxx" pattern
  const phoneMatch = bodyText.match(/Phone:\s*([\(\d\)\s\-\.x]{7,25})/i);
  const phone = phoneMatch?.[1]?.trim() || undefined;

  // Email — from mailto: href
  const emailHref = $('a[href^="mailto:"]').first().attr('href') ?? '';
  const email = emailHref
    ? emailHref.replace('mailto:', '').split('?')[0].trim() || undefined
    : undefined;

  // Website — first external http link not on estatesale.com or social/tracking
  let website: string | undefined;
  $('a[href^="http"]').each((_i, el) => {
    if (website) return false; // cheerio: return false = break
    const href = $(el).attr('href') ?? '';
    if (
      href &&
      !href.includes('estatesale.com') &&
      !isSocialOrTracking(href)
    ) {
      website = href;
    }
  });

  // Location — "Location: City, ST" pattern in body text
  const locationMatch = bodyText.match(/Location:\s*([^,\n]+),\s*([A-Z]{2})/);
  const city = locationMatch?.[1]?.trim() || '';
  const state = locationMatch?.[2]?.trim() || '';

  return { name, city, state, phone, email, website };
}

/**
 * Main scraper entry point.
 * Phase 1: Fetch all 51 state listing pages to collect company profile URLs.
 * Phase 2: Visit each profile page for phone/email/website, then upsert.
 */
export async function scrapeEstateSaleCom(
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

  await rateLimiter.loadRobotsTxt(BASE_URL);
  console.log('[EstateSaleCom] Starting scrape — Phase 1: state listing pages');

  // ── Phase 1: collect profile URLs from all state pages ────────────────────
  type ProfileEntry = { profileUrl: string; name: string; city: string; stateAbbr: string };
  const profileQueue: ProfileEntry[] = [];
  const seenProfileUrls = new Set<string>();

  for (const state of STATES) {
    const urlName = state.name.replace(/ /g, '-');
    const stateUrl = `${BASE_URL}/states/featuredCompanies/${state.id}/Estate-Sale-Companies-${urlName}.html`;

    await rateLimiter.waitBeforeRequest('www.estatesale.com');
    const html = await fetchHtml(stateUrl);

    if (!html) {
      console.warn(`[EstateSaleCom] Failed to fetch state page: ${stateUrl}`);
      continue;
    }

    const companies = parseStatePage(html, state.abbr);
    console.log(`[EstateSaleCom] ${state.abbr}: ${companies.length} companies on listing page`);

    for (const c of companies) {
      if (!seenProfileUrls.has(c.profileUrl)) {
        seenProfileUrls.add(c.profileUrl);
        profileQueue.push({ ...c, stateAbbr: state.abbr });
      }
    }
  }

  console.log(
    `[EstateSaleCom] Phase 1 complete. Unique profiles to visit: ${profileQueue.length}`,
  );

  // ── Phase 2: visit each profile for contact details ───────────────────────
  for (const entry of profileQueue) {
    await rateLimiter.waitBeforeRequest('www.estatesale.com');
    const html = await fetchHtml(entry.profileUrl);

    if (!html) {
      console.warn(`[EstateSaleCom] Failed to fetch profile: ${entry.profileUrl}`);
      stats.itemsFailed++;
      continue;
    }

    const profile = parseProfilePage(html);

    // Fall back to state-page data if profile parse is incomplete
    const name = profile.name || entry.name;
    const city = profile.city || entry.city;
    const state = profile.state || entry.stateAbbr;

    if (!name || !state) {
      stats.itemsSkipped++;
      continue;
    }

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
        BUSINESS_CATEGORY,
        profile.email,
        profile.phone,
        profile.website,
        undefined, // lat
        undefined, // lng
        undefined, // isStateLicensed
        undefined, // licenseState
        undefined, // licenseNumber
        undefined, // sourceLabel
      );

      if (orgId === null) {
        stats.itemsSkipped++;
      } else {
        stats.itemsCreated++;
      }
    } catch (err) {
      console.error(
        `[EstateSaleCom] Failed to ingest "${name}" (${city}, ${state}):`,
        err,
      );
      stats.itemsFailed++;
    }
  }

  console.log('[EstateSaleCom] Done. Stats:', JSON.stringify(stats));
  return stats;
}
