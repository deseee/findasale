/**
 * NAA Find an Auctioneer directory scraper
 * Source: https://www.auctioneers.org/find-an-auctioneer
 * Public member directory — no ToS prohibition found.
 * Run mode: national-once (crawls all member profiles, metro param is unused).
 * ADR-073: Directory Scraper Phase 1
 *
 * STRATEGY: sitemap-driven static crawl.
 * The NAA directory SEARCH page (?state=XX) is JS-rendered (Novi AMS) and returns
 * only a placeholder to a plain fetch — so it is NOT used. Instead we read
 * https://www.auctioneers.org/sitemap.xml (advertised in robots.txt), extract every
 * individual member profile URL (/find-an-auctioneer/<slug>), and fetch each profile
 * page directly. Those profile pages ARE fully static plain HTML: name, company,
 * city/state, website, and phone are all present in the raw response with no JS and
 * no auth required. Each profile is parsed with cheerio and upserted via the same
 * getOrCreateScrapedOrganizer path with source attribution 'NAAFindAnAuctioneer'.
 * Verified working against live HTML: 2026-06-05.
 */

import * as cheerio from 'cheerio';
import { RateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { getRandomUserAgent } from '../userAgents';
import { ScrapeStats } from '../sourceRegistry';

const NAA_BASE_URL = 'https://www.auctioneers.org';
const NAA_SITEMAP_URL = `${NAA_BASE_URL}/sitemap.xml`;
const NAA_DOMAIN = new URL(NAA_BASE_URL).hostname;

// Street-suffix tokens used to locate the boundary between street address and city.
// NAA addresses render as a single run: "<street> <City>, <ST> <ZIP> <country>".
// There is no delimiter between street and city, so we anchor on the last street
// suffix and treat everything after it (up to the comma) as the city.
const STREET_SUFFIX =
  /(?:Rd|Road|Dr|Drive|St|Street|Ave|Avenue|Ln|Lane|Blvd|Boulevard|Ct|Court|Way|Hwy|Highway|Pkwy|Cir|Circle|Pl|Place|Ste|Suite|Box|Sq|Square|Ter|Terrace|Trl|Trail|Pike|Loop|Run|Pass|Row|Walk|Bend|Crossing|Xing)\b\.?/gi;

interface NAAMember {
  name: string;
  company?: string;
  city: string;
  state: string;
  website?: string;
  phone?: string;
}

/**
 * Fetch the sitemap and extract every individual member profile URL.
 * Member profiles are static slugs of the form /find-an-auctioneer/<slug>.
 * The bare /find-an-auctioneer landing page is excluded (it is the JS-rendered
 * search page, not a member profile).
 */
async function fetchMemberUrls(rateLimiter: RateLimiter): Promise<string[]> {
  await rateLimiter.waitBeforeRequest(NAA_DOMAIN);

  const response = await fetch(NAA_SITEMAP_URL, {
    headers: {
      'User-Agent': getRandomUserAgent(),
      'Accept': 'application/xml,text/xml',
    },
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    throw new Error(`[NAADirectory] HTTP ${response.status} fetching sitemap`);
  }

  const xml = await response.text();

  // Extract <loc> values that point at individual member profiles.
  // Match the slug segment so we ignore the bare /find-an-auctioneer landing page.
  const urls = new Set<string>();
  const locRegex = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = locRegex.exec(xml)) !== null) {
    const url = match[1].trim();
    // Member profile: /find-an-auctioneer/<non-empty-slug> with no further path segment.
    const m = url.match(/\/find-an-auctioneer\/([^/?#]+)\/?$/i);
    if (m && m[1]) {
      urls.add(url.replace(/\/$/, ''));
    }
  }

  return Array.from(urls);
}

/**
 * Fetch and parse a single static member profile page.
 * Returns the parsed member, or null if the page had no usable name.
 */
async function fetchMemberProfile(
  url: string,
  rateLimiter: RateLimiter
): Promise<NAAMember | null> {
  await rateLimiter.waitBeforeRequest(NAA_DOMAIN);

  const response = await fetch(url, {
    headers: {
      'User-Agent': getRandomUserAgent(),
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    throw new Error(`[NAADirectory] HTTP ${response.status} for ${url}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const name = $('h1.o-details-block__title').first().text().trim();
  if (!name) {
    return null;
  }

  const company =
    $('p.o-details-block__details-copy.company').first().text().trim() || undefined;

  // Address: the details-copy <p> that follows the map-marker icon span.
  // Format: "<street> <City>, <ST> <ZIP> <country>".
  const addressText = $('span.novicon-map-marker')
    .closest('.o-details-block__details-info')
    .find('p.o-details-block__details-copy')
    .first()
    .text()
    .trim();

  const { city, state } = parseCityState(addressText);

  // Website: the external website link in the social-icon row.
  // Skip tel:, mailto:, and the internal secure-contact email link.
  let website: string | undefined;
  $('a.o-details-block__details-social-icon').each((_i, el) => {
    if (website) return;
    const href = $(el).attr('href');
    if (href && /^https?:\/\//i.test(href) && !/auctioneers\.org/i.test(href)) {
      website = href.trim();
    }
  });

  // Phone: the tel: link.
  const telHref = $('a[href^="tel:"]').first().attr('href');
  const phone = telHref
    ? telHref.replace(/^tel:/i, '').trim() || undefined
    : undefined;

  return { name, company, city, state, website, phone };
}

/**
 * Parse city + state from a single-run NAA address string.
 * State is reliable (2-letter code before the ZIP). City is the text after the
 * last street-suffix token up to the comma. If no street suffix is found, the
 * whole pre-comma segment is used. Returns empty strings for fields that cannot
 * be confirmed rather than guessing.
 */
function parseCityState(address: string): { city: string; state: string } {
  if (!address) return { city: '', state: '' };

  const stateMatch = address.match(/,\s*([A-Z]{2})\b\s+\d{5}/);
  const state = stateMatch?.[1] ?? '';

  const before = stateMatch
    ? address.slice(0, stateMatch.index).trim()
    : address.trim();

  let city = before;
  STREET_SUFFIX.lastIndex = 0;
  let last: RegExpExecArray | null;
  let lastEnd = -1;
  while ((last = STREET_SUFFIX.exec(before)) !== null) {
    lastEnd = last.index + last[0].length;
  }
  if (lastEnd >= 0) {
    city = before.slice(lastEnd).trim();
    // Strip any leftover suite/number remnant immediately before the city.
    city = city.replace(/^(?:Ste\.?|Suite|Unit|Apt\.?|#|No\.?)\s*\S+\s*/i, '').trim();
    city = city.replace(/^\d+\s*/, '').trim();
  }

  return { city, state };
}

/**
 * Main entry point for NAA directory scrape.
 * metro param is unused — this is a national-once source.
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

  console.log('[NAADirectory] Starting sitemap-driven auctioneer directory scrape');

  await rateLimiter.loadRobotsTxt(NAA_BASE_URL);

  let memberUrls: string[];
  try {
    memberUrls = await fetchMemberUrls(rateLimiter);
  } catch (err) {
    console.error('[NAADirectory] Failed to fetch/parse sitemap:', err);
    throw err;
  }

  console.log(`[NAADirectory] Found ${memberUrls.length} member profile URLs in sitemap`);

  for (const url of memberUrls) {
    let member: NAAMember | null;
    try {
      member = await fetchMemberProfile(url, rateLimiter);
    } catch (err) {
      console.error(`[NAADirectory] Failed to fetch profile ${url}:`, err);
      stats.itemsFailed++;
      continue;
    }

    if (!member) {
      console.log(`[NAADirectory] No usable member data at ${url} — skipping`);
      stats.itemsSkipped++;
      continue;
    }

    stats.itemsFound++;

    try {
      const orgId = await getOrCreateScrapedOrganizer(
        member.name,
        'NAAFindAnAuctioneer',
        member.city,
        member.state,
        undefined, // esnOrgId
        undefined, // googlePlaceId
        undefined, // foursquareVenueId
        undefined, // hereBusinessId
        'AUCTION_HOUSE',
        undefined, // contactEmail
        member.phone,
        member.website,
        undefined, // lat
        undefined  // lng
      );

      if (orgId === null) {
        stats.itemsSkipped++;
      } else {
        stats.itemsCreated++;
      }
    } catch (err) {
      console.error(
        `[NAADirectory] Failed to ingest ${member.name} (${member.city}, ${member.state}):`,
        err
      );
      stats.itemsFailed++;
    }

    // Respectful crawl rate: short jitter on top of the RateLimiter's 1 req/sec floor.
    await new Promise((resolve) => setTimeout(resolve, 250 + Math.random() * 500));
  }

  console.log(
    `[NAADirectory] Complete — found ${stats.itemsFound}, created ${stats.itemsCreated}, skipped ${stats.itemsSkipped}, failed ${stats.itemsFailed}`
  );

  if (stats.itemsFound === 0) {
    throw new Error('[NAA] Zero members found — sitemap structure or profile markup may have changed');
  }

  return stats;
}
