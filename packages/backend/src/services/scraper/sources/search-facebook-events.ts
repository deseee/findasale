/**
 * Facebook Events discovery via search engines
 * ADR-073: Directory Scraper — search-based adapter
 *
 * Priority chain (best geo-targeting first):
 *   1. Serper.dev       — Google SERP proxy, credit-based ($50/50k pack), best location-specific results
 *   2. Brave Search API — independent index, $5/month free credit with attribution
 *   3. ScaleSerp        — Google SERP proxy, 125 free/month + paid
 *
 * DuckDuckGo removed: Bing index does not reliably index facebook.com/events pages.
 * Tavily excluded: it is an AI search index that does not contain
 * facebook.com/events pages (confirmed — returns groups/marketplace only).
 *
 * Cron: weekly (Monday 03:00 UTC)
 * At 30 metros/week × 52 weeks = 1,560 Serper credits/year (primary use for accurate
 * location-specific results; Brave fallback is rate-limited, so real primary-usage is high).
 */

import * as cheerio from 'cheerio';
import { ScrapedItem } from '../index';
import { getRandomUserAgent, jitterDelay } from '../userAgents';

// ---------------------------------------------------------------------------
// Shared result shape (normalised before building ScrapedItem)
// ---------------------------------------------------------------------------

interface SearchResult {
  url: string;
  title: string;
  snippet: string;
}

// ---------------------------------------------------------------------------
// Metro list — 30 major secondary-sale markets
// ---------------------------------------------------------------------------

export interface MetroTarget {
  city: string;
  state: string; // 2-letter abbreviation
}

export const SEARCH_METROS: MetroTarget[] = [
  // Midwest
  { city: 'Grand Rapids',    state: 'MI' },
  { city: 'Detroit',         state: 'MI' },
  { city: 'Chicago',         state: 'IL' },
  { city: 'Indianapolis',    state: 'IN' },
  { city: 'Columbus',        state: 'OH' },
  { city: 'Cleveland',       state: 'OH' },
  { city: 'Cincinnati',      state: 'OH' },
  { city: 'Dayton',          state: 'OH' },
  { city: 'Toledo',          state: 'OH' },
  { city: 'Akron',           state: 'OH' },
  { city: 'Milwaukee',       state: 'WI' },
  { city: 'Madison',         state: 'WI' },
  { city: 'Minneapolis',     state: 'MN' },
  { city: 'St. Louis',       state: 'MO' },
  { city: 'Kansas City',     state: 'MO' },
  { city: 'Omaha',           state: 'NE' },
  { city: 'Des Moines',      state: 'IA' },
  { city: 'Louisville',      state: 'KY' },
  { city: 'Lexington',       state: 'KY' },
  { city: 'Wichita',         state: 'KS' },
  // Northeast
  { city: 'New York',        state: 'NY' },
  { city: 'Buffalo',         state: 'NY' },
  { city: 'Boston',          state: 'MA' },
  { city: 'Hartford',        state: 'CT' },
  { city: 'Providence',      state: 'RI' },
  { city: 'Pittsburgh',      state: 'PA' },
  { city: 'Philadelphia',    state: 'PA' },
  // Mid-Atlantic
  { city: 'Baltimore',       state: 'MD' },
  { city: 'Washington',      state: 'DC' },
  { city: 'Richmond',        state: 'VA' },
  { city: 'Norfolk',         state: 'VA' },
  // Southeast
  { city: 'Atlanta',         state: 'GA' },
  { city: 'Savannah',        state: 'GA' },
  { city: 'Charlotte',       state: 'NC' },
  { city: 'Raleigh',         state: 'NC' },
  { city: 'Greensboro',      state: 'NC' },
  { city: 'Greenville',      state: 'SC' },
  { city: 'Columbia',        state: 'SC' },
  { city: 'Charleston',      state: 'SC' },
  { city: 'Nashville',       state: 'TN' },
  { city: 'Memphis',         state: 'TN' },
  { city: 'Knoxville',       state: 'TN' },
  { city: 'Chattanooga',     state: 'TN' },
  { city: 'Birmingham',      state: 'AL' },
  { city: 'Mobile',          state: 'AL' },
  { city: 'New Orleans',     state: 'LA' },
  { city: 'Baton Rouge',     state: 'LA' },
  { city: 'Little Rock',     state: 'AR' },
  { city: 'Jacksonville',    state: 'FL' },
  { city: 'Tampa',           state: 'FL' },
  { city: 'Orlando',         state: 'FL' },
  { city: 'Miami',           state: 'FL' },
  { city: 'Fort Lauderdale', state: 'FL' },
  // South / Central
  { city: 'Dallas',          state: 'TX' },
  { city: 'Houston',         state: 'TX' },
  { city: 'San Antonio',     state: 'TX' },
  { city: 'Austin',          state: 'TX' },
  { city: 'El Paso',         state: 'TX' },
  { city: 'Oklahoma City',   state: 'OK' },
  { city: 'Tulsa',           state: 'OK' },
  { city: 'Albuquerque',     state: 'NM' },
  // Mountain / Southwest
  { city: 'Denver',          state: 'CO' },
  { city: 'Colorado Springs', state: 'CO' },
  { city: 'Salt Lake City',  state: 'UT' },
  { city: 'Phoenix',         state: 'AZ' },
  { city: 'Tucson',          state: 'AZ' },
  { city: 'Las Vegas',       state: 'NV' },
  { city: 'Boise',           state: 'ID' },
  // West Coast
  { city: 'Los Angeles',     state: 'CA' },
  { city: 'San Diego',       state: 'CA' },
  { city: 'San Francisco',   state: 'CA' },
  { city: 'Sacramento',      state: 'CA' },
  { city: 'Fresno',          state: 'CA' },
  { city: 'Portland',        state: 'OR' },
  { city: 'Spokane',         state: 'WA' },
  { city: 'Seattle',         state: 'WA' },
  // Canada — Phase 1 (English markets: ON, BC, AB, MB, SK)
  { city: 'Toronto',         state: 'ON' },
  { city: 'Ottawa',          state: 'ON' },
  { city: 'Hamilton',        state: 'ON' },
  { city: 'London',          state: 'ON' },
  { city: 'Kitchener',       state: 'ON' },
  { city: 'Windsor',         state: 'ON' },
  { city: 'St. Catharines',  state: 'ON' },
  { city: 'Vancouver',       state: 'BC' },
  { city: 'Victoria',        state: 'BC' },
  { city: 'Kelowna',         state: 'BC' },
  { city: 'Abbotsford',      state: 'BC' },
  { city: 'Calgary',         state: 'AB' },
  { city: 'Edmonton',        state: 'AB' },
  { city: 'Winnipeg',        state: 'MB' },
  { city: 'Saskatoon',       state: 'SK' },
  { city: 'Regina',          state: 'SK' },
  // Canada — Phase 2 (Atlantic + Quebec deferred for French localization)
  { city: 'Halifax',         state: 'NS' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract numeric Facebook event ID from any FB events URL variant. */
function extractFbEventId(url: string): string | null {
  // Match direct event URLs: /events/123456
  let match = url.match(/facebook\.com\/events\/(\d+)/);
  if (match) return match[1];
  // Match search-redirect URLs: /events/s/some-text/123456/
  match = url.match(/facebook\.com\/events\/s\/[^/]+\/(\d+)/);
  return match ? match[1] : null;
}

/** Infer sale type from combined title + snippet text. */
function inferSaleType(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('auction'))                              return 'AUCTION';
  if (lower.includes('estate'))                              return 'ESTATE';
  if (lower.includes('garage') || lower.includes('yard'))   return 'YARD';
  if (lower.includes('moving') || lower.includes('downsizing')) return 'MOVING';
  if (lower.includes('flea'))                                return 'FLEA_MARKET';
  return 'ESTATE';
}

/**
 * Try to extract a date from a search snippet.
 * FB event snippets often contain: "May 10 · 8:00 AM", "Saturday, May 3"
 * Returns null if unparseable — caller defaults startDate to +7 days.
 */
function parseDateFromSnippet(snippet: string): Date | null {
  try {
    const monthNames = [
      'january','february','march','april','may','june',
      'july','august','september','october','november','december',
    ];
    const pattern = new RegExp(
      `(${monthNames.join('|')})\\s+(\\d{1,2})(?:,?\\s*(\\d{4}))?`,
      'i'
    );
    const match = snippet.match(pattern);
    if (!match) return null;

    const monthIdx = monthNames.indexOf(match[1].toLowerCase());
    const day      = parseInt(match[2], 10);
    const year     = match[3] ? parseInt(match[3], 10) : new Date().getFullYear();
    const d        = new Date(year, monthIdx, day, 9, 0, 0);

    // Accept dates within ±7 days in past through +180 days future
    const now = Date.now();
    const ms  = d.getTime();
    if (ms < now - 7 * 86_400_000 || ms > now + 180 * 86_400_000) return null;
    return d;
  } catch {
    return null;
  }
}

/** Convert a raw search result into a ScrapedItem, or null if unusable. */
function buildScrapedItem(
  result: SearchResult,
  metro: MetroTarget,
  sourceApi: string
): ScrapedItem | null {
  const { url, title, snippet } = result;

  if (!url.includes('facebook.com/events/')) return null;

  const fbEventId = extractFbEventId(url);
  if (!fbEventId) return null;

  const cleanTitle = title.replace(/\s*\|?\s*Facebook.*$/i, '').trim();
  if (!cleanTitle) return null;

  const combined   = `${cleanTitle} ${snippet}`;
  const parsedStart = parseDateFromSnippet(snippet);
  const startDate  = parsedStart ?? new Date(Date.now() + 7 * 86_400_000);
  const endDate    = new Date(startDate.getTime() + 86_400_000);

  return {
    title:         cleanTitle,
    address:       '',
    city:          metro.city,
    state:         metro.state,
    zip:           '',
    startDate,
    endDate,
    description:   snippet || cleanTitle,
    organizerName: undefined,
    organizerEmail: undefined,
    photoUrls:     [],
    saleType:      inferSaleType(combined),
    sourceUrl:     url,
    sourceName:    'Facebook Events',
    sourceItemId:  `fb:events:${fbEventId}`,
    scrapedMetadata: {
      metro:           `${metro.city}, ${metro.state}`,
      sourceApi,
      dateApproximate: parsedStart === null,
    },
  };
}

// ---------------------------------------------------------------------------
// Engine 2: Brave Search API (backup — independent index, free tier available)
// ---------------------------------------------------------------------------

interface BraveResponse {
  web?: {
    results?: Array<{ url: string; title: string; description?: string }>;
  };
}

async function searchBrave(query: string, apiKey: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query, count: '10' });
  const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: {
      'X-Subscription-Token': apiKey,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Brave ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as BraveResponse;
  return (data.web?.results ?? []).map((r) => ({
    url:     r.url,
    title:   r.title,
    snippet: r.description ?? '',
  }));
}

// ---------------------------------------------------------------------------
// Engine 2: Serper.dev (backup — Google SERP proxy, credit-based)
// ---------------------------------------------------------------------------

interface SerperResponse {
  organic?: Array<{ link: string; title: string; snippet?: string }>;
}

async function searchSerper(query: string, apiKey: string): Promise<SearchResult[]> {
  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY':    apiKey,
    },
    body: JSON.stringify({ q: query, num: 10 }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Serper ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as SerperResponse;
  return (data.organic ?? []).map((r) => ({
    url:     r.link,
    title:   r.title,
    snippet: r.snippet ?? '',
  }));
}

// ---------------------------------------------------------------------------
// Engine 3: ScaleSerp (backup — Google SERP proxy, 125 free/month + paid)
// ---------------------------------------------------------------------------

interface ScaleSerpResponse {
  organic_results?: Array<{ link: string; title: string; snippet?: string }>;
}

async function searchScaleSerp(query: string, apiKey: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({ api_key: apiKey, q: query, num: '10' });
  const response = await fetch(`https://api.scaleserp.com/search?${params}`, {
    headers: { 'User-Agent': getRandomUserAgent() },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`ScaleSerp ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as ScaleSerpResponse;
  return (data.organic_results ?? []).map((r) => ({
    url:     r.link,
    title:   r.title,
    snippet: r.snippet ?? '',
  }));
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export interface FbSearchOptions {
  braveKey?:     string;
  serperKey?:    string;
  scaleSerpKey?: string;
}

/**
 * Scrape Facebook Events for a single metro via search engines.
 *
 * Priority:
 *   1. Serper.dev        (Google SERP proxy, best geo-targeting, primary)
 *   2. Brave Search API  (independent index, free fallback)
 *   3. ScaleSerp         (Google SERP proxy, second fallback)
 *
 * Returns ScrapedItem[] without ingesting.
 */
export async function scrapeFacebookEventsForMetro(
  metro: MetroTarget,
  opts: FbSearchOptions = {}
): Promise<ScrapedItem[]> {
  const query =
    `site:facebook.com/events ("estate sale" OR "garage sale" OR "yard sale" OR "estate auction") ` +
    `${metro.city} ${metro.state}`;

  let rawResults: SearchResult[] = [];
  let usedEngine = '';

  // --- Engine 1: Serper (primary — best geo-targeting) ---
  if (opts.serperKey) {
    try {
      rawResults = await searchSerper(query, opts.serperKey);
      usedEngine = 'serper';
      console.log(
        `[FB-Events] Serper OK for ${metro.city}, ${metro.state} — ${rawResults.length} results`
      );
    } catch (err) {
      console.warn(
        `[FB-Events] Serper failed for ${metro.city}, ${metro.state}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  // --- Engine 2: Brave (backup — free fallback) ---
  if (rawResults.length === 0 && opts.braveKey) {
    try {
      rawResults = await searchBrave(query, opts.braveKey);
      usedEngine = 'brave';
      console.log(
        `[FB-Events] Brave backup for ${metro.city}, ${metro.state} — ${rawResults.length} results`
      );
    } catch (err) {
      console.warn(
        `[FB-Events] Brave failed for ${metro.city}, ${metro.state}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  // --- Engine 3: ScaleSerp (second backup) ---
  if (rawResults.length === 0 && opts.scaleSerpKey) {
    try {
      rawResults = await searchScaleSerp(query, opts.scaleSerpKey);
      usedEngine = 'scaleserp';
      console.log(
        `[FB-Events] ScaleSerp backup for ${metro.city}, ${metro.state} — ${rawResults.length} results`
      );
    } catch (err) {
      console.warn(
        `[FB-Events] ScaleSerp failed for ${metro.city}, ${metro.state}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  if (rawResults.length === 0) {
    console.log(`[FB-Events] No results for ${metro.city}, ${metro.state} (all engines exhausted)`);
    return [];
  }

  // Debug: log first 3 URLs so we can monitor engine health
  const preview = rawResults.slice(0, 3).map((r) => r.url).join(' | ');
  console.log(`[FB-Events] Sample URLs (${metro.city}, engine=${usedEngine}): ${preview}`);

  const items: ScrapedItem[] = [];
  for (const r of rawResults) {
    const item = buildScrapedItem(r, metro, usedEngine);
    if (item) items.push(item);
  }

  return items;
}
