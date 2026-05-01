/**
 * Facebook Events discovery via search engines
 * ADR-073: Directory Scraper — search-based adapter
 *
 * Priority chain (cheapest/most-durable first):
 *   1. DuckDuckGo HTML  — no API key, no credits, uses Bing's index (free forever)
 *   2. Serper.dev       — Google SERP proxy, credit-based ($50/50k pack)
 *   3. ScaleSerp        — Google SERP proxy, 125 free/month + paid
 *
 * Tavily excluded: it is an AI search index that does not contain
 * facebook.com/events pages (confirmed — returns groups/marketplace only).
 *
 * Cron: weekly (Monday 03:00 UTC)
 * At 30 metros/week × 52 weeks = 1,560 Serper credits/year (backup only fires
 * when DDG is rate-limited or blocked, so real credit burn is much lower).
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
  { city: 'Grand Rapids',  state: 'MI' },
  { city: 'Detroit',       state: 'MI' },
  { city: 'Chicago',       state: 'IL' },
  { city: 'Indianapolis',  state: 'IN' },
  { city: 'Columbus',      state: 'OH' },
  { city: 'Cleveland',     state: 'OH' },
  { city: 'Cincinnati',    state: 'OH' },
  { city: 'Pittsburgh',    state: 'PA' },
  { city: 'Philadelphia',  state: 'PA' },
  { city: 'Baltimore',     state: 'MD' },
  { city: 'Washington',    state: 'DC' },
  { city: 'Atlanta',       state: 'GA' },
  { city: 'Charlotte',     state: 'NC' },
  { city: 'Raleigh',       state: 'NC' },
  { city: 'Nashville',     state: 'TN' },
  { city: 'Memphis',       state: 'TN' },
  { city: 'Birmingham',    state: 'AL' },
  { city: 'Jacksonville',  state: 'FL' },
  { city: 'Tampa',         state: 'FL' },
  { city: 'Orlando',       state: 'FL' },
  { city: 'Dallas',        state: 'TX' },
  { city: 'Houston',       state: 'TX' },
  { city: 'San Antonio',   state: 'TX' },
  { city: 'Austin',        state: 'TX' },
  { city: 'Denver',        state: 'CO' },
  { city: 'Phoenix',       state: 'AZ' },
  { city: 'Las Vegas',     state: 'NV' },
  { city: 'Portland',      state: 'OR' },
  { city: 'Seattle',       state: 'WA' },
  { city: 'Minneapolis',   state: 'MN' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract numeric Facebook event ID from any FB events URL variant. */
function extractFbEventId(url: string): string | null {
  const match = url.match(/facebook\.com\/events\/(\d+)/);
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
// Engine 1: DuckDuckGo HTML (primary — no API key, no credits)
// ---------------------------------------------------------------------------

/**
 * DuckDuckGo HTML endpoint scraper.
 * DDG uses Bing's index and does index public Facebook event pages.
 * The html.duckduckgo.com endpoint is the plain-HTML version used by
 * text browsers — it requires no JS and returns stable CSS classes.
 *
 * DDG redirect URLs contain the real target in the `uddg` query param.
 * Example: /l/?uddg=https%3A%2F%2Fwww.facebook.com%2Fevents%2F123456
 */
async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  // POST is more reliable than GET for DDG HTML (avoids some CAPTCHA triggers)
  const body = new URLSearchParams({ q: query, b: '', kl: 'us-en' });

  const response = await fetch('https://html.duckduckgo.com/html/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent':   getRandomUserAgent(),
      'Accept':       'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer':      'https://duckduckgo.com/',
    },
    body: body.toString(),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`DDG HTML ${response.status}`);
  }

  const html = await response.text();
  const $    = cheerio.load(html);
  const results: SearchResult[] = [];

  // DDG HTML structure (stable across recent years):
  //   div.result > div.result__body
  //     h2.result__title > a.result__a[href="/l/?uddg=URL"]
  //     div.result__snippet
  $('div.result').each((_i, el) => {
    const anchor  = $(el).find('a.result__a').first();
    const rawHref = anchor.attr('href') ?? '';
    const snippet = $(el).find('.result__snippet').text().trim();
    const title   = anchor.text().trim();

    // Extract real URL from DDG redirect
    let url = '';
    try {
      // href is like /l/?uddg=ENCODED_URL[&rut=HASH]
      const uddg = rawHref.match(/[?&]uddg=([^&]+)/);
      if (uddg) {
        url = decodeURIComponent(uddg[1]);
      } else if (rawHref.startsWith('http')) {
        url = rawHref;
      }
    } catch {
      // malformed — skip
    }

    if (url && title) {
      results.push({ url, title, snippet });
    }
  });

  return results;
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
  serperKey?:    string;
  scaleSerpKey?: string;
}

/**
 * Scrape Facebook Events for a single metro via search engines.
 *
 * Priority:
 *   1. DuckDuckGo HTML (free, no credits — always tried first)
 *   2. Serper.dev        (Google SERP proxy, credit backup)
 *   3. ScaleSerp         (Google SERP proxy, second credit backup)
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

  // --- Engine 1: DuckDuckGo (free) ---
  try {
    rawResults = await searchDuckDuckGo(query);
    usedEngine = 'duckduckgo';
    console.log(
      `[FB-Events] DDG OK for ${metro.city}, ${metro.state} — ${rawResults.length} results`
    );
  } catch (err) {
    console.warn(
      `[FB-Events] DDG failed for ${metro.city}, ${metro.state}:`,
      err instanceof Error ? err.message : err
    );
  }

  // --- Engine 2: Serper (backup) ---
  if (rawResults.length === 0 && opts.serperKey) {
    try {
      rawResults = await searchSerper(query, opts.serperKey);
      usedEngine = 'serper';
      console.log(
        `[FB-Events] Serper backup for ${metro.city}, ${metro.state} — ${rawResults.length} results`
      );
    } catch (err) {
      console.warn(
        `[FB-Events] Serper failed for ${metro.city}, ${metro.state}:`,
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
