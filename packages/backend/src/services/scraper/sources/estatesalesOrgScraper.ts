/**
 * EstateSales.org scraper
 * Source: https://estatesales.org/estate-sale-companies
 *
 * robots.txt: Permissive for *. ClaudeBot blocked from /photos ONLY.
 *   Company directory (/estate-sale-companies/*) is explicitly NOT blocked.
 * ToS: No anti-scraping prohibition confirmed (verified 2026-06-12).
 * Server-rendered HTML: confirmed — no JS required.
 *
 * Strategy:
 *   1. Fetch /estate-sale-companies index → extract 51 state links (50 states + DC)
 *   2. For each state page → extract city page links (li > a hrefs)
 *      Skip region-group pages (h3 links like /mi/central-michigan) to avoid duplicates.
 *   3. For each city page → parse .member cards:
 *      - Company name: h3 > a.title text
 *      - City/State: "Based out of <a class='city'>City, ST</a>" pattern
 *      - Phone: bare <p class="text-sm"> containing a phone number
 *      - Website: <a class="site-link"> href
 *   4. Upsert via getOrCreateScrapedOrganizer
 *
 * Data available on list pages (no per-company fetches needed):
 *   name, city, state, phone (optional), website (optional)
 *
 * Crawl delay: 2–3 s between requests (polite)
 * DO NOT fetch any URL containing /photos
 * ADR-073: Directory Scraper Phase 1
 */

import * as cheerio from 'cheerio';
import { RateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { getRandomUserAgent } from '../userAgents';
import { ScrapeStats } from '../sourceRegistry';

const ESO_BASE_URL = 'https://estatesales.org';
const SOURCE_NAME = 'EstateSalesOrg';
const BUSINESS_CATEGORY = 'ESTATE_SALE_CO';
const CRAWL_DELAY_MS = 2500; // 2–3 s average between requests

// Social media domains — strip these from website candidates
const SOCIAL_DOMAINS = [
  'facebook.com', 'twitter.com', 'instagram.com', 'x.com',
  'linkedin.com', 'youtube.com', 'yelp.com', 'pinterest.com', 'tiktok.com',
];

const isSocialUrl = (url: string): boolean =>
  SOCIAL_DOMAINS.some((d) => url.includes(d));

/**
 * Shared fetch helper with consistent headers and timeout.
 * Returns null on any network or HTTP error (non-2xx).
 * Skips any URL containing /photos per robots.txt compliance.
 */
async function fetchHtml(url: string): Promise<string | null> {
  // Hard rule: never fetch /photos URLs
  if (url.includes('/photos')) {
    console.warn(`[EstateSalesOrg] Skipping /photos URL: ${url}`);
    return null;
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(25000),
    });

    if (!response.ok) {
      console.warn(`[EstateSalesOrg] HTTP ${response.status} for ${url}`);
      return null;
    }

    return await response.text();
  } catch (err) {
    console.warn(`[EstateSalesOrg] Fetch failed for ${url}:`, err);
    return null;
  }
}

/**
 * Crawl delay helper — random jitter around CRAWL_DELAY_MS.
 */
async function politeDelay(): Promise<void> {
  const ms = CRAWL_DELAY_MS + Math.random() * 500;
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch the main index page and return all state page paths.
 * e.g. ["/estate-sale-companies/al", "/estate-sale-companies/ca", ...]
 */
async function fetchStateLinks(): Promise<string[]> {
  const url = `${ESO_BASE_URL}/estate-sale-companies`;
  const html = await fetchHtml(url);
  if (!html) {
    console.warn('[EstateSalesOrg] Could not fetch state index page');
    return [];
  }

  const $ = cheerio.load(html);
  const stateLinks: string[] = [];
  const seen = new Set<string>();

  // State links are <a href="/estate-sale-companies/{2-letter-abbr}">
  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href') ?? '';
    // Match exactly /estate-sale-companies/{2-letter-state-abbr}
    if (/^\/estate-sale-companies\/[a-z]{2}$/.test(href) && !seen.has(href)) {
      seen.add(href);
      stateLinks.push(href);
    }
  });

  return stateLinks;
}

/**
 * Fetch a state page and return all city page paths (not region-group pages).
 * Region-group paths have compound slugs like /mi/central-michigan.
 * City paths have simple slugs like /mi/grand-rapids.
 *
 * We distinguish by looking at li > a hrefs: these are city pages.
 * h3 > a hrefs are region-group aggregators — skip them to avoid duplication.
 */
async function fetchCityLinksForState(statePath: string, rateLimiter: RateLimiter): Promise<string[]> {
  const url = `${ESO_BASE_URL}${statePath}`;
  await rateLimiter.waitBeforeRequest('estatesales.org');

  const html = await fetchHtml(url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const cityLinks: string[] = [];
  const seen = new Set<string>();

  // Only collect li > a hrefs that are city-level (not region aggregators)
  // State pages use <ul class="city-list"><li><a href="...">CityName</a></li></ul>
  $('ul.city-list li a[href]').each((_i, el) => {
    const href = $(el).attr('href') ?? '';

    // Must start with base URL or be a relative path under /estate-sale-companies/{state}/
    const relative = href.startsWith(ESO_BASE_URL)
      ? href.slice(ESO_BASE_URL.length)
      : href;

    // Pattern: /estate-sale-companies/{2-letter}/{city-slug}
    // Reject if city-slug contains no hyphen or digits — region group paths tend to be longer compound names
    // Actually just collect all of them — dedup by seen set
    if (
      relative.startsWith('/estate-sale-companies/') &&
      relative.split('/').length === 4 && // exactly /estate-sale-companies/st/city
      !relative.includes('/photos') &&
      !seen.has(relative)
    ) {
      seen.add(relative);
      cityLinks.push(relative);
    }
  });

  await politeDelay();
  return cityLinks;
}

interface ESOCompany {
  name: string;
  city: string;
  state: string;
  phone?: string;
  website?: string;
}

/**
 * Parse company listings from a city (or region) page HTML.
 * Company cards use:
 *   <div class="member ...">
 *     <h3><a class="title" href="/estate-sale-companies/{slug}">Company Name</a></h3>
 *     <div class="business-info ...">
 *       <p class="text-sm">Based out of <a class="city">City, ST</a> ...</p>
 *       <p class="text-sm">(555) 555-5555</p>          <!-- optional -->
 *       <p class="text-sm"><a class="site-link" href="...">website</a></p>  <!-- optional -->
 *     </div>
 *   </div>
 */
function parseCityPage(html: string): ESOCompany[] {
  const $ = cheerio.load(html);
  const companies: ESOCompany[] = [];

  $('div.member').each((_i, card) => {
    // Company name
    const name = $(card).find('h3 a.title').first().text().trim();
    if (!name) return;

    // City + State from "Based out of <a class='city'>City, ST</a>"
    const cityLink = $(card).find('a.city').first().text().trim();
    // Format is "City, ST" — e.g. "Grand Rapids, MI"
    const cityStateMatch = cityLink.match(/^(.+),\s*([A-Z]{2})$/);
    if (!cityStateMatch) return; // skip if no parseable city/state

    const city = cityStateMatch[1].trim();
    const state = cityStateMatch[2].trim();

    if (!city || !state) return;

    // Phone — look for bare <p class="text-sm"> that looks like a phone number
    // Format on page: (555) 555-5555 or 555-555-5555
    let phone: string | undefined;
    $(card).find('p.text-sm').each((_j, p) => {
      const text = $(p).text().trim();
      if (!phone && /^\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}$/.test(text)) {
        phone = text;
      }
    });

    // Website — <a class="site-link" href="...">
    let website: string | undefined;
    const siteLink = $(card).find('a.site-link').first();
    if (siteLink.length) {
      const href = siteLink.attr('href') ?? '';
      if (href.startsWith('http') && !isSocialUrl(href) && !href.includes('estatesales.org')) {
        website = href;
      }
    }

    companies.push({ name, city, state, phone, website });
  });

  return companies;
}

/**
 * Main entry point for EstateSales.org scraper.
 * Iterates all 50 states + DC, collects city pages, parses company cards.
 * Runs as national-once (metro and organizerId params are ignored).
 */
export async function scrapeEstateSalesOrg(
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

  await rateLimiter.loadRobotsTxt(ESO_BASE_URL);
  console.log('[EstateSalesOrg] Starting scrape — fetching state index');

  // Phase 1: get all state paths
  const statePaths = await fetchStateLinks();
  console.log(`[EstateSalesOrg] Found ${statePaths.length} state pages`);

  if (statePaths.length === 0) {
    console.warn('[EstateSalesOrg] No state links found — index page may have changed markup');
    return stats;
  }

  // Track seen company slugs across all pages to avoid double-counting
  // (the same company can appear on multiple city pages if they serve multiple cities)
  const seenCompanySlugs = new Set<string>();

  // Phase 2: iterate states → city pages → companies
  for (const statePath of statePaths) {
    const stateAbbr = statePath.split('/').pop()?.toUpperCase() ?? '';
    console.log(`[EstateSalesOrg] State ${stateAbbr}: fetching city list`);

    const cityPaths = await fetchCityLinksForState(statePath, rateLimiter);
    console.log(`[EstateSalesOrg] State ${stateAbbr}: ${cityPaths.length} city pages`);

    if (cityPaths.length === 0) {
      // Some small states may have no company listings
      continue;
    }

    for (const cityPath of cityPaths) {
      // Skip any /photos path (belt-and-suspenders)
      if (cityPath.includes('/photos')) continue;

      const cityUrl = `${ESO_BASE_URL}${cityPath}`;
      await rateLimiter.waitBeforeRequest('estatesales.org');

      const html = await fetchHtml(cityUrl);
      if (!html) {
        console.warn(`[EstateSalesOrg] Failed to fetch city page: ${cityUrl}`);
        await politeDelay();
        continue;
      }

      const companies = parseCityPage(html);
      console.log(`[EstateSalesOrg]   ${cityPath}: ${companies.length} companies`);

      for (const company of companies) {
        // Build a dedup key from name + state (same company can serve multiple cities)
        const dedupKey = `${company.name.toLowerCase().replace(/\s+/g, '-')}::${company.state}`;
        if (seenCompanySlugs.has(dedupKey)) {
          stats.itemsSkipped++;
          continue;
        }
        seenCompanySlugs.add(dedupKey);

        stats.itemsFound++;

        try {
          const orgId = await getOrCreateScrapedOrganizer(
            company.name,
            SOURCE_NAME,
            company.city,
            company.state,
            undefined, // esnOrgId
            undefined, // googlePlaceId
            undefined, // foursquareVenueId
            undefined, // hereBusinessId
            BUSINESS_CATEGORY,
            undefined, // contactEmail
            company.phone,
            company.website,
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
            `[EstateSalesOrg] Failed to ingest "${company.name}" (${company.city}, ${company.state}):`,
            err
          );
          stats.itemsFailed++;
        }
      }

      await politeDelay();
    }

    console.log(
      `[EstateSalesOrg] State ${stateAbbr} done — running totals: found=${stats.itemsFound} created=${stats.itemsCreated} skipped=${stats.itemsSkipped} failed=${stats.itemsFailed}`
    );
  }

  console.log('[EstateSalesOrg] ─────────────────────────────────────────────────────');
  console.log(
    `[EstateSalesOrg] TOTAL — found ${stats.itemsFound}, created ${stats.itemsCreated}, updated ${stats.itemsUpdated}, skipped ${stats.itemsSkipped}, failed ${stats.itemsFailed}`
  );
  console.log('[EstateSalesOrg] ─────────────────────────────────────────────────────');

  if (stats.itemsFound === 0) {
    console.warn('[EstateSalesOrg] Completed with zero results — source may be blocked or changed markup');
  }

  return stats;
}
