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
import { getOrCreateScrapedOrganizer, generateDedupeKey } from '../index';
import { getRandomUserAgent, getRandomReferer } from '../userAgents';
import { ScrapeStats } from '../sourceRegistry';
import { prisma } from '../../../lib/prisma';
import { sanitizeEmailCandidate, isMalformedCandidate } from '../../emailProvenance';

const BASE_URL = 'https://www.estatesale.com';
const SOURCE_NAME = 'EstateSaleCom';
const BUSINESS_CATEGORY = 'ESTATE_SALE_CO';

// Egress fix — sibling to GarageSaleFinder's Sentry [egress] "host exceeded 300 req/hr" fix.
// Same anti-pattern: Phase 2 below unconditionally fetched a detail (profile) page for every
// listing found on Phase 1's state pages, every run, with zero upfront freshness check — cost
// paid regardless of whether the profile had changed since the last run. Unlike GarageSaleFinder
// (whose sourceItemId is embedded in the index-page URL itself), EstateSaleCom's Phase 1 state
// pages already carry {name, city} per company row — the exact same identifying data
// getOrCreateScrapedOrganizer's dedupeKey tier (index.ts generateDedupeKey) keys off for this
// source, since EstateSaleCom never passes googlePlaceId/foursquareVenueId/hereBusinessId/
// esnOrgId. That means the dedupeKey is computable BEFORE the profile fetch, so a batch DB
// pre-check can skip the fetch entirely for companies this source already confirmed recently.
// scrape-estatesalecom.yml cron: '0 6 * 3,6,9,12 0' (quarterly, ~91-day cadence). 80 days
// leaves a safety margin so a slightly early/late run still treats prior-quarter data as
// stale rather than skipping it.
const FRESHNESS_WINDOW_MS = 80 * 24 * 60 * 60 * 1000;

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
    // 2026-07-26: added a Referer header (helper already existed via
    // getRandomReferer() but was never wired in here) after live diagnosis
    // showed every one of 51 state-page requests returned HTTP 200 with a
    // parseable-but-empty table (0 companies), while the exact same URL
    // fetched through an independent tool returned the real, populated
    // table -- consistent with the site (or a CDN/WAF in front of it)
    // soft-blocking requests that look like bare automated fetches
    // (no Referer, no cookies, no browser fingerprint) rather than a
    // real site outage or a markup/selector change. Trying the cheapest,
    // lowest-risk fix first: look more like a referred browser navigation.
    const referer = getRandomReferer();
    const response = await fetch(url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        ...(referer ? { Referer: referer } : {}),
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
  // 2026-08-16: decode + structurally validate before this becomes a stored, mailed
  // organizer address — un-decoded `%XX` hrefs produced live bounces. Shared helper.
  const emailHref = $('a[href^="mailto:"]').first().attr('href') ?? '';
  const emailCandidate = emailHref
    ? sanitizeEmailCandidate(emailHref.replace(/^mailto:/i, '').split('?')[0])
    : '';
  const email =
    emailCandidate && !isMalformedCandidate(emailCandidate) ? emailCandidate : undefined;

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
    // 2026-07-26: diagnostic only -- if a listing page parses to zero
    // companies, log a short snippet + common bot-block markers so a
    // future run can tell "site changed markup" apart from "soft-blocked
    // by a WAF/CDN challenge page" without needing another guess-and-push
    // round-trip. Truncated to avoid flooding CI logs across 51 states.
    if (companies.length === 0) {
      const snippet = html.replace(/\s+/g, ' ').trim().slice(0, 300);
      const blockMarkers = ['Just a moment', 'cf-browser-verification', 'Access Denied', 'captcha', 'cdn-cgi/challenge-platform'];
      const matchedMarker = blockMarkers.find((m) => html.includes(m));
      console.warn(
        `[EstateSaleCom] ${state.abbr}: 0 companies -- possible block marker: ${matchedMarker ?? 'none found'} -- snippet: ${snippet}`,
      );
    }

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

  // ── Freshness pre-check (egress fix — see FRESHNESS_WINDOW_MS comment above) ──────────
  const dedupeKeyByProfileUrl = new Map<string, string>();
  for (const entry of profileQueue) {
    dedupeKeyByProfileUrl.set(entry.profileUrl, generateDedupeKey(entry.name, entry.city));
  }
  const uniqueDedupeKeys = Array.from(new Set(dedupeKeyByProfileUrl.values()));

  const freshDedupeKeys = new Set<string>();
  if (uniqueDedupeKeys.length > 0) {
    try {
      const existingOrgs = await prisma.organizer.findMany({
        where: { dedupeKey: { in: uniqueDedupeKeys } },
        select: { dedupeKey: true, sourcesJson: true },
      });
      const now = Date.now();
      for (const org of existingOrgs) {
        if (!org.dedupeKey) continue;
        const sources = (org.sourcesJson as Array<{ sourceName?: string; lastSeen?: string }>) ?? [];
        const ownTouch = sources.find((s) => s.sourceName === SOURCE_NAME);
        if (ownTouch?.lastSeen) {
          const lastSeenMs = new Date(ownTouch.lastSeen).getTime();
          if (!isNaN(lastSeenMs) && now - lastSeenMs < FRESHNESS_WINDOW_MS) {
            freshDedupeKeys.add(org.dedupeKey);
          }
        }
      }
    } catch (err) {
      // Fail open — a freshness pre-check DB error must never block the scrape; fall back
      // to the prior unconditional-fetch behaviour for this run instead.
      console.warn('[EstateSaleCom] Freshness pre-check query failed (failing open):', err);
    }
  }

  let skippedFresh = 0;
  if (freshDedupeKeys.size > 0) {
    console.log(
      `[EstateSaleCom] Freshness pre-check: ${freshDedupeKeys.size}/${uniqueDedupeKeys.length} companies already confirmed by this source within the last ${Math.round(FRESHNESS_WINDOW_MS / 86400000)} days — skipping their profile fetch.`,
    );
  }

  // ── Phase 2: visit each profile for contact details ───────────────────────
  for (const entry of profileQueue) {
    const dedupeKey = dedupeKeyByProfileUrl.get(entry.profileUrl)!;
    if (freshDedupeKeys.has(dedupeKey)) {
      skippedFresh++;
      stats.itemsSkipped++;
      continue;
    }

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

  console.log('[EstateSaleCom] Done. Stats:', JSON.stringify(stats), `skippedFresh=${skippedFresh}`);

  // 2026-08-08: was previously missing entirely -- the script only exited
  // non-zero on an uncaught exception, never on "ran cleanly but found
  // nothing". Every one of 51 state-page fetches can (and per STATE.md, did)
  // return HTTP 200 with a parseable-but-empty table if the site/CDN soft-
  // blocks bare automated requests -- that produced itemsFound=0 while the
  // GitHub Actions step still reported "success", so nobody was ever alerted
  // (confirmed: "4/5 runs 'success' since 2026-06-14, zero Organizer rows
  // ever created from this source"). Matches the established convention used
  // by nearly every other scraper in this directory (grep 'zero results' —
  // auctionZipScraper.ts, nasmmScraper.ts, foursquarePlaces.ts, etc. all
  // throw here) so the workflow's "Notify on failure" step actually fires.
  if (stats.itemsFound === 0 && skippedFresh === 0) {
    throw new Error(
      '[EstateSaleCom] Completed with zero results across all 51 state pages -- ' +
      'site may be soft-blocking automated requests (see per-state block-marker ' +
      'diagnostics logged above) or markup has changed.',
    );
  }

  return stats;
}
