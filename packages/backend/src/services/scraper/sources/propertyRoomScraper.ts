/**
 * PropertyRoom.com scraper adapter
 * Source: https://www.propertyroom.com/about-us/partners
 * ToS: Confirmed CLEAR — no anti-scraping clause
 * robots.txt: /about-us/ not disallowed; only account/watchlist/search pages blocked
 *
 * PropertyRoom is the largest US online police auction platform (~4,100 client agencies).
 * The /about-us/partners page publishes a static HTML list of named law enforcement
 * agencies and municipalities that auction through the platform.
 *
 * Strategy: fetch the partners page (single request), parse named agencies from
 * <li> bullet items, resolve city+state from the agency name text, and upsert
 * each as an AUCTION_HOUSE organizer.
 *
 * City/state extraction approach:
 *   1. Named patterns: "City of X" → city=X; "X Police Department" → city=X
 *   2. Inline state abbreviations: "Birmingham, AL Police" → city=Birmingham, state=AL
 *   3. Well-known agencies (NYPD, LAPD etc.) → hardcoded city/state
 *   4. County names → county seat heuristic or skip if unresolvable
 *
 * Rate limit: 0.5 req/sec (single-page fetch — barely relevant, kept for consistency)
 * ADR-073: Directory Scraper Phase 1
 */

import * as cheerio from 'cheerio';
import { RateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { getRandomUserAgent } from '../userAgents';
import { ScrapeStats } from '../sourceRegistry';

const PR_PARTNERS_URL = 'https://www.propertyroom.com/about-us/partners';
const SOURCE_NAME = 'PropertyRoom';

/** Two-letter state abbreviations we recognise inline (e.g. "Birmingham, AL Police") */
const INLINE_STATE_RE = /,\s*([A-Z]{2})\s*(?:-|$|Police|Sheriff|Dept|Department|County|City)/;

/**
 * Hardcoded resolutions for well-known agencies where the name alone doesn't
 * contain a parseable city/state.
 */
const KNOWN_AGENCIES: Record<string, { city: string; state: string }> = {
  'NYPD': { city: 'New York', state: 'NY' },
  'NYC – DCAS': { city: 'New York', state: 'NY' },
  'MTA – NYCT': { city: 'New York', state: 'NY' },
  'Port Authority NY/NJ': { city: 'New York', state: 'NY' },
  'CT - DAS': { city: 'Hartford', state: 'CT' },
  'Jefferson Parish': { city: 'Gretna', state: 'LA' },
  'Kansas City': { city: 'Kansas City', state: 'MO' },
};

/**
 * State abbreviation → full name for "X County, StateName" patterns.
 */
const STATE_FULL_TO_ABBR: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT',
  'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI',
  'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
  'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME',
  'maryland': 'MD', 'massachusetts': 'MA', 'michigan': 'MI',
  'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
  'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM',
  'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
  'ohio': 'OH', 'oklahoma': 'OK', 'oregon': 'OR',
  'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA',
  'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
};

interface ResolvedAgency {
  name: string;
  city: string;
  state: string;
}

/**
 * Attempt to extract city and state from an agency name string.
 * Returns null if the name cannot be reliably resolved to a location.
 */
function resolveAgencyLocation(raw: string): { city: string; state: string } | null {
  const name = raw.trim();

  // 1. Hardcoded well-known agencies
  if (KNOWN_AGENCIES[name]) {
    return KNOWN_AGENCIES[name];
  }

  // 2. "City of X" pattern → city = X
  // e.g. "City of Fort Worth Police Department", "City of Milwaukee"
  const cityOfMatch = name.match(/^City of ([A-Za-z\s\.\-']+?)(?:\s+Police|\s+Sheriff|\s*$)/);
  if (cityOfMatch) {
    const city = cityOfMatch[1].trim();
    // Try to extract inline state abbr from remainder
    const stateMatch = name.match(/\b([A-Z]{2})\b/);
    const state = stateMatch ? stateMatch[1] : '';
    if (city && state) return { city, state };
    // Without state we can't reliably locate — continue to other patterns
  }

  // 3. Inline state abbreviation pattern: "Birmingham, AL Police"
  // e.g. "Birmingham, AL Police", "Clark County, NV"
  const inlineStateMatch = name.match(/^([A-Za-z\s\.\-']+?),\s*([A-Z]{2})\b/);
  if (inlineStateMatch) {
    const rawCity = inlineStateMatch[1].trim();
    const state = inlineStateMatch[2];
    // Strip trailing "County" from city name if present
    const city = rawCity.replace(/\s+County\s*$/i, '').trim();
    if (city && state) return { city, state };
  }

  // 4. "X County, StateName" pattern (full state name)
  // e.g. "Suffolk County, NY Police Department" already handled by #3,
  // but catch "Suffolk County, New York Police Department"
  const countyStateFullMatch = name.match(/([A-Za-z\s]+?)\s+County,\s+([A-Za-z\s]+?)(?:\s+(?:Police|Sheriff|Office|Department)|$)/i);
  if (countyStateFullMatch) {
    const countyName = countyStateFullMatch[1].trim();
    const stateFullRaw = countyStateFullMatch[2].trim().toLowerCase();
    const stateAbbr = STATE_FULL_TO_ABBR[stateFullRaw];
    if (countyName && stateAbbr) {
      return { city: countyName, state: stateAbbr };
    }
  }

  // 5. City name before " Police Department" / " Sheriff's Office"
  // e.g. "Atlanta Police Department", "Houston Police Department"
  // We need a state — look for a two-letter abbreviation anywhere in the name
  const policeMatch = name.match(/^([A-Za-z\s\.\-']+?)\s+(?:Police|Sheriff|Metro Police|Metropolitan Police)\s*(?:Department|Office|Dept\.?)?/i);
  if (policeMatch) {
    const city = policeMatch[1].trim();
    // Look for inline state abbreviation after the city
    const stateInName = name.match(/\b([A-Z]{2})\b/);
    if (city && stateInName) {
      return { city, state: stateInName[1] };
    }
    // No inline state — we can't reliably assign one without geocoding
    // Still return with empty state; getOrCreateScrapedOrganizer accepts empty
    if (city) return { city, state: '' };
  }

  // 6. "X Sheriff's Office/Department" (county sheriff)
  const sheriffMatch = name.match(/^([A-Za-z\s\.\-']+?)\s+Sheriff(?:'s)?\s*(?:Department|Office|Dept\.?)?/i);
  if (sheriffMatch) {
    const rawName = sheriffMatch[1].trim();
    const city = rawName.replace(/\s+County\s*$/i, '').trim();
    const stateInName = name.match(/\b([A-Z]{2})\b/);
    if (city && stateInName) return { city, state: stateInName[1] };
    if (city) return { city, state: '' };
  }

  // 7. Plain city name (e.g. "Kansas City", "Seattle", bare municipality)
  // Only accept if it looks like a simple place name (no "County", no "Dept")
  if (!/county|sheriff|police|department|authority|transit/i.test(name)) {
    const stateInName = name.match(/\b([A-Z]{2})\b/);
    if (stateInName) {
      const city = name.replace(/,?\s*[A-Z]{2}\b.*$/, '').trim();
      return { city, state: stateInName[1] };
    }
  }

  return null;
}

/**
 * Fetch the PropertyRoom partners page and extract all named agency entries.
 */
async function fetchPartnerAgencies(rateLimiter: RateLimiter): Promise<ResolvedAgency[]> {
  const domain = new URL(PR_PARTNERS_URL).hostname;
  await rateLimiter.waitBeforeRequest(domain);

  let html: string;
  try {
    const response = await fetch(PR_PARTNERS_URL, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching partners page`);
    }

    html = await response.text();
  } catch (err) {
    throw new Error(`Failed to fetch PropertyRoom partners page: ${err}`);
  }

  const $ = cheerio.load(html);
  const agencies: ResolvedAgency[] = [];
  const seen = new Set<string>();

  // Agency names are in <li> elements containing the bullet character &#9679; (•)
  $('li').each((_i, el) => {
    const text = $(el).text().trim();
    // Bullet is Unicode U+25CF or HTML entity &#9679;
    if (!text.includes('•') && !text.includes('●')) return;

    const name = text.replace(/[•●]/g, '').trim();
    if (!name || name.toLowerCase() === 'and more') return;

    // Deduplicate (partners page repeats some entries in two columns)
    if (seen.has(name)) return;
    seen.add(name);

    const location = resolveAgencyLocation(name);
    if (!location) {
      console.log(`[PropertyRoom] Could not resolve location for: "${name}" — skipping`);
      return;
    }

    agencies.push({ name, city: location.city, state: location.state });
  });

  return agencies;
}

/**
 * Main entry point for PropertyRoom scraper.
 * Fetches the partners page once, resolves locations, upserts organizers.
 * Runs as national-once (metro param is ignored).
 */
export async function scrapePropertyRoom(
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

  console.log('[PropertyRoom] Starting scrape — fetching partners page');

  let agencies: ResolvedAgency[];
  try {
    agencies = await fetchPartnerAgencies(rateLimiter);
  } catch (err) {
    console.error('[PropertyRoom] Failed to fetch partners page:', err);
    stats.itemsFailed++;
    return stats;
  }

  console.log(`[PropertyRoom] Found ${agencies.length} resolvable agencies`);
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
        'https://www.propertyroom.com', // website
        undefined, // lat
        undefined  // lng
      );

      if (orgId === null) {
        stats.itemsSkipped++;
      } else {
        stats.itemsCreated++;
      }
    } catch (err) {
      console.error(`[PropertyRoom] Failed to ingest "${agency.name}" (${agency.city}, ${agency.state}):`, err);
      stats.itemsFailed++;
    }
  }

  console.log('[PropertyRoom] ─────────────────────────────────────────────────────');
  console.log(`[PropertyRoom] TOTAL — found ${stats.itemsFound}, created ${stats.itemsCreated}, skipped ${stats.itemsSkipped}, failed ${stats.itemsFailed}`);
  console.log('[PropertyRoom] ─────────────────────────────────────────────────────');

  if (stats.itemsFound === 0) {
    console.warn('[PropertyRoom] Completed with zero results — partners page may have changed markup');
  }

  return stats;
}
