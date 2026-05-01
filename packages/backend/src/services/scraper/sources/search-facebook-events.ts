/**
 * Facebook Events discovery via search APIs (Tavily primary, Serper fallback)
 * ADR-073: Directory Scraper — search-based adapter
 *
 * Strategy: query `site:facebook.com/events "estate sale" [City] [State]` through
 * web search APIs which have already indexed public Facebook event pages.
 * No direct Facebook access, no auth, no ToS risk.
 *
 * Free tiers (2026):
 *   Tavily  — 1,000 queries/month (ongoing, no card required) — PRIMARY
 *   Serper  — signup credits + paid packs — FALLBACK on Tavily failure
 */

import { ScrapedItem } from '../index';
import { jitterDelay } from '../userAgents';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TavilyResult {
  url: string;
  title: string;
  content: string;
  score?: number;
}

interface TavilyResponse {
  results: TavilyResult[];
}

interface SerperResult {
  title: string;
  link: string;
  snippet: string;
}

interface SerperResponse {
  organic: SerperResult[];
}

export interface MetroTarget {
  city: string;
  state: string;          // 2-letter abbreviation
  stateLabel?: string;    // full state name (optional — improves query quality for some metros)
}

// ---------------------------------------------------------------------------
// Metro list — 30 high-density secondary-sale markets, daily coverage
// 30 metros × 1 query/metro × 30 days = 900 queries/month (within Tavily 1k free)
// ---------------------------------------------------------------------------

export const SEARCH_METROS: MetroTarget[] = [
  { city: 'Grand Rapids',    state: 'MI' },
  { city: 'Detroit',         state: 'MI' },
  { city: 'Chicago',         state: 'IL' },
  { city: 'Indianapolis',    state: 'IN' },
  { city: 'Columbus',        state: 'OH' },
  { city: 'Cleveland',       state: 'OH' },
  { city: 'Cincinnati',      state: 'OH' },
  { city: 'Pittsburgh',      state: 'PA' },
  { city: 'Philadelphia',    state: 'PA' },
  { city: 'Baltimore',       state: 'MD' },
  { city: 'Washington',      state: 'DC' },
  { city: 'Atlanta',         state: 'GA' },
  { city: 'Charlotte',       state: 'NC' },
  { city: 'Raleigh',         state: 'NC' },
  { city: 'Nashville',       state: 'TN' },
  { city: 'Memphis',         state: 'TN' },
  { city: 'Birmingham',      state: 'AL' },
  { city: 'Jacksonville',    state: 'FL' },
  { city: 'Tampa',           state: 'FL' },
  { city: 'Orlando',         state: 'FL' },
  { city: 'Dallas',          state: 'TX' },
  { city: 'Houston',         state: 'TX' },
  { city: 'San Antonio',     state: 'TX' },
  { city: 'Austin',          state: 'TX' },
  { city: 'Denver',          state: 'CO' },
  { city: 'Phoenix',         state: 'AZ' },
  { city: 'Las Vegas',       state: 'NV' },
  { city: 'Portland',        state: 'OR' },
  { city: 'Seattle',         state: 'WA' },
  { city: 'Minneapolis',     state: 'MN' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the numeric Facebook event ID from a URL.
 * Handles: facebook.com/events/123456, www.facebook.com/events/123456/
 */
function extractFbEventId(url: string): string | null {
  const match = url.match(/facebook\.com\/events\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Infer sale type from title + snippet text.
 */
function inferSaleType(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('auction')) return 'AUCTION';
  if (lower.includes('estate')) return 'ESTATE';
  if (lower.includes('garage') || lower.includes('yard')) return 'YARD';
  if (lower.includes('moving') || lower.includes('downsizing')) return 'MOVING';
  if (lower.includes('flea')) return 'FLEA_MARKET';
  return 'ESTATE';
}

/**
 * Try to extract a date from a snippet string.
 * Facebook event snippets often contain: "May 10 · 8:00 AM", "Saturday, May 3 at 9 AM", etc.
 * Returns null if no date can be confidently parsed.
 */
function parseDateFromSnippet(snippet: string): Date | null {
  try {
    // Pattern: Month Day, optional year
    // e.g. "May 10", "May 10, 2026", "Saturday, May 3"
    const monthNames = [
      'january','february','march','april','may','june',
      'july','august','september','october','november','december',
    ];
    const monthPattern = monthNames.join('|');
    // Match "May 10" or "May 10, 2026" or "Saturday, May 10"
    const match = snippet.match(
      new RegExp(`(${monthPattern})\\s+(\\d{1,2})(?:,\\s*(\\d{4}))?`, 'i')
    );
    if (!match) return null;

    const monthIdx = monthNames.indexOf(match[1].toLowerCase());
    const day = parseInt(match[2], 10);
    const year = match[3] ? parseInt(match[3], 10) : new Date().getFullYear();

    const d = new Date(year, monthIdx, day, 9, 0, 0); // default 9 AM

    // Sanity: must be within next 180 days or in the past 7 days
    const now = Date.now();
    const ms = d.getTime();
    if (ms < now - 7 * 86400000 || ms > now + 180 * 86400000) return null;

    return d;
  } catch {
    return null;
  }
}

/**
 * Build a ScrapedItem from a search result URL+title+snippet, for a given metro.
 */
function buildScrapedItem(
  url: string,
  title: string,
  snippet: string,
  metro: MetroTarget,
  sourceApi: 'tavily' | 'serper'
): ScrapedItem | null {
  // Must be a real Facebook event URL
  if (!url.includes('facebook.com/events/')) return null;

  const fbEventId = extractFbEventId(url);
  if (!fbEventId) return null;

  // Clean title — FB titles often suffix with "| Facebook"
  const cleanTitle = title.replace(/\s*\|?\s*Facebook.*$/i, '').trim();
  if (!cleanTitle) return null;

  const combinedText = `${cleanTitle} ${snippet}`;

  // Try to parse start date from snippet; fall back to "7 days from now"
  const parsedStart = parseDateFromSnippet(snippet);
  const startDate = parsedStart ?? new Date(Date.now() + 7 * 86400000);
  const endDate = new Date(startDate.getTime() + 86400000); // default 1-day event

  return {
    title: cleanTitle,
    address: '',                   // not available from search results
    city: metro.city,
    state: metro.state,
    zip: '',
    startDate,
    endDate,
    description: snippet || `${cleanTitle} — discovered via Facebook Events`,
    organizerName: undefined,
    organizerEmail: undefined,
    photoUrls: [],
    saleType: inferSaleType(combinedText),
    sourceUrl: url,
    sourceName: 'Facebook Events',
    sourceItemId: `fb:events:${fbEventId}`,
    scrapedMetadata: {
      metro: `${metro.city}, ${metro.state}`,
      sourceApi,
      dateApproximate: parsedStart === null,
    },
  };
}

// ---------------------------------------------------------------------------
// Tavily search (primary)
// ---------------------------------------------------------------------------

async function searchTavily(
  query: string,
  apiKey: string
): Promise<Array<{ url: string; title: string; content: string }>> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      max_results: 10,
      include_domains: ['facebook.com'],
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Tavily ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as TavilyResponse;
  return (data.results ?? []).map((r) => ({
    url: r.url,
    title: r.title,
    content: r.content ?? '',
  }));
}

// ---------------------------------------------------------------------------
// Serper search (fallback)
// ---------------------------------------------------------------------------

async function searchSerper(
  query: string,
  apiKey: string
): Promise<Array<{ url: string; title: string; content: string }>> {
  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
    body: JSON.stringify({ q: query, num: 10 }),
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Serper ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as SerperResponse;
  return (data.organic ?? []).map((r) => ({
    url: r.link,
    title: r.title,
    content: r.snippet ?? '',
  }));
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Scrape Facebook Events for a single metro via search APIs.
 * Tries Tavily first; falls back to Serper on failure.
 * Returns ScrapedItem[] without ingesting.
 */
export async function scrapeFacebookEventsForMetro(
  metro: MetroTarget,
  tavilyKey: string | undefined,
  serperKey: string | undefined
): Promise<ScrapedItem[]> {
  const query = `site:facebook.com/events "estate sale" OR "garage sale" OR "yard sale" OR "estate auction" ${metro.city} ${metro.state}`;
  const items: ScrapedItem[] = [];

  let results: Array<{ url: string; title: string; content: string }> = [];
  let sourceApi: 'tavily' | 'serper' = 'tavily';

  // Try Tavily first
  if (tavilyKey) {
    try {
      results = await searchTavily(query, tavilyKey);
      sourceApi = 'tavily';
      console.log(`[FB-Events] Tavily OK for ${metro.city}, ${metro.state} — ${results.length} results`);
    } catch (err) {
      console.warn(`[FB-Events] Tavily failed for ${metro.city}, ${metro.state}:`, err instanceof Error ? err.message : err);
      results = [];
    }
  }

  // Fall back to Serper
  if (results.length === 0 && serperKey) {
    try {
      results = await searchSerper(query, serperKey);
      sourceApi = 'serper';
      console.log(`[FB-Events] Serper fallback for ${metro.city}, ${metro.state} — ${results.length} results`);
    } catch (err) {
      console.warn(`[FB-Events] Serper also failed for ${metro.city}, ${metro.state}:`, err instanceof Error ? err.message : err);
    }
  }

  if (results.length === 0) {
    console.log(`[FB-Events] No results for ${metro.city}, ${metro.state}`);
    return [];
  }

  for (const r of results) {
    const item = buildScrapedItem(r.url, r.title, r.content, metro, sourceApi);
    if (item) items.push(item);
  }

  return items;
}
