/**
 * Facebook Events discovery via search engines
 * ADR-073: Directory Scraper — search-based adapter
 *
 * Priority chain (best geo-targeting first):
 *   1. Searlo SERP API  — PRIMARY. Google SERP proxy, $0.30/1k queries, geo-accurate
 *                          (~90–100% in-metro), no credit expiry. Honors site: and the
 *                          full multi-term OR query; geo-targets via city/state in q.
 *   2. Serper.dev       — Google SERP proxy, credit-based ($50/50k pack), good location-specific results
 *   3. Brave Search API — independent index, $5/month free credit with attribution
 *   4. ScaleSerp        — Google SERP proxy, 125 free/month + paid
 *
 * DuckDuckGo removed: Bing index does not reliably index facebook.com/events pages.
 * Tavily excluded: it is an AI search index that does not contain
 * facebook.com/events pages (confirmed — returns groups/marketplace only).
 *
 * Cron: daily (03:00 UTC). The full canonical metro list (~301, derived from
 * GOOGLE_PLACES_METROS) is sharded across 7 days — ~43 metros/day — so each run
 * stays well under the Actions timeout. A module-level throttle keeps Searlo
 * calls under its per-second (5) and per-minute caps; on a 429 we honor
 * `retryAfter` and retry Searlo once before any fallback, so normal operation
 * never bleeds Serper credits.
 *
 * At ~43 metros/day × 3 sub-queries each (~129 Searlo calls/shard), Searlo is the primary cost driver
 * (~1 credit/sub-query); Serper/Brave/ScaleSerp are fallbacks only when Searlo
 * returns empty or still errors after the retry.
 */

import * as cheerio from 'cheerio';
import { ScrapedItem } from '../index';
import { getRandomUserAgent, jitterDelay } from '../userAgents';
import { GOOGLE_PLACES_METROS } from './scraperConfig';

// ---------------------------------------------------------------------------
// Shared result shape (normalised before building ScrapedItem)
// ---------------------------------------------------------------------------

interface SearchResult {
  url: string;
  title: string;
  snippet: string;
}

// ---------------------------------------------------------------------------
// Metro list — derived from GOOGLE_PLACES_METROS (single source of truth)
// ---------------------------------------------------------------------------

export interface MetroTarget {
  city: string;
  state: string; // 2-letter abbreviation
}

/**
 * SEARCH_METROS is DERIVED from GOOGLE_PLACES_METROS (the canonical scraper metro
 * list exported by scraperConfig.ts) so the two scrapers stay in sync — adding a
 * metro in one place propagates to both. Each canonical entry is a `"City, ST"`
 * string; we split on the LAST comma (city names never contain a trailing comma,
 * but may contain apostrophes/periods e.g. "Coeur d'Alene, ID" / "St. Louis, MO").
 * Yields ~301 metros. The MetroTarget shape and the SEARCH_METROS export name are
 * preserved so nothing downstream (the runner, shard helper) breaks.
 */

export const SEARCH_METROS: MetroTarget[] = GOOGLE_PLACES_METROS.map((entry) => {
  const lastComma = entry.lastIndexOf(',');
  return {
    city:  entry.slice(0, lastComma).trim(),
    state: entry.slice(lastComma + 1).trim(),
  };
});

/**
 * Number of daily shards. The full SEARCH_METROS list is split modulo this value
 * so the entire list is covered every SHARD_COUNT days. 7 → one shard per
 * day-of-week, ~43 metros/day at the current ~301-metro list.
 */
export const SHARD_COUNT = 7;

/**
 * Deterministic day index in [0, SHARD_COUNT). Uses day-of-year % SHARD_COUNT so
 * the rotation is stable within a UTC day and advances by one each day, cycling
 * through all shards every SHARD_COUNT days regardless of which weekday the cron
 * lands on. `date` is injectable for testing; defaults to now (UTC).
 */
export function getShardIndexForDate(date: Date = new Date()): number {
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - startOfYear) / 86_400_000);
  return dayOfYear % SHARD_COUNT;
}

/**
 * Return TODAY'S shard of metros: every metro whose index ≡ today's shard index
 * (mod SHARD_COUNT). Deterministic, ~43 metros/day, all metros covered every
 * SHARD_COUNT days. Pass an explicit `date` for testing.
 */
export function getMetrosForToday(date: Date = new Date()): MetroTarget[] {
  const shard = getShardIndexForDate(date);
  return SEARCH_METROS.filter((_, i) => i % SHARD_COUNT === shard);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract numeric Facebook event ID from any FB events URL variant. */
function extractFbEventId(url: string): string | null {
  // Search-redirect URLs: /events/s/some-text/123456/ — id is the trailing numeric
  // segment after /events/s/. Handle this form first (preserve prior behaviour).
  const redirectMatch = url.match(/facebook\.com\/events\/s\/[^/]+\/(\d+)/);
  if (redirectMatch) return redirectMatch[1];

  // Direct event URLs. Facebook event IDs are long numeric strings (8+ digits).
  // Venue-slug URLs embed a street number after /events/, e.g.
  //   .../events/4900-six-flags-rd-eureka-mo/Fall-Sale/402022744578852/
  // The OLD logic grabbed the FIRST \d+ after /events/ and wrongly returned 4900
  // (the street number), corrupting dedup. Instead, scan the whole path and take
  // the LAST run of 8+ consecutive digits — that is always the real event id.
  const eventsIdx = url.indexOf('/events/');
  if (eventsIdx === -1) return null;
  const pathAfter = url.slice(eventsIdx);
  const runs = pathAfter.match(/\d{8,}/g);
  if (runs && runs.length > 0) return runs[runs.length - 1];
  return null;
}

/**
 * Infer sale type from combined title + snippet text.
 *
 * `typeHint` carries the sale-type intent of the sub-query that surfaced this
 * result (see scrapeFacebookEventsForMetro). It is used ONLY as a tie-breaker /
 * fallback for flea-market events whose title does not literally contain "flea"
 * (e.g. "Spring Swap Meet", "Vendor Market Day") — these were previously
 * misclassified because the keyword check keyed on the title alone. The hint
 * never overrides an explicit auction/estate/yard/consignment signal in the text.
 */
function inferSaleType(text: string, typeHint?: string): { saleType: string; saleSubtype?: string } {
  const lower = text.toLowerCase();
  if (lower.includes('auction'))                                return { saleType: 'AUCTION', saleSubtype: 'auction' };
  if (lower.includes('estate'))                                 return { saleType: 'ESTATE', saleSubtype: 'estate' };
  if (lower.includes('garage') || lower.includes('yard'))       return { saleType: 'YARD', saleSubtype: 'yard' };
  if (lower.includes('moving') || lower.includes('downsizing')) return { saleType: 'YARD', saleSubtype: 'moving' };
  // Broadened: scan title+snippet for flea/swap terms (not just "flea"), so flea
  // events whose title omits the literal word still classify correctly. Swap-meet
  // phrasing is checked first (more specific) so it maps to the swap_meet subtype;
  // generic "flea" text maps to the flea subtype. Both share the FLEA_MARKET saleType.
  if (lower.includes('swap meet') || lower.includes('swap-meet')) {
    return { saleType: 'FLEA_MARKET', saleSubtype: 'swap_meet' };
  }
  if (lower.includes('flea')) {
    return { saleType: 'FLEA_MARKET', saleSubtype: 'flea' };
  }
  // Fallback: if this result came from the flea/swap sub-query and nothing above
  // matched, trust the query intent rather than defaulting to ESTATE.
  if (typeHint === 'FLEA_MARKET') return { saleType: 'FLEA_MARKET', saleSubtype: 'flea' };
  return { saleType: 'ESTATE', saleSubtype: 'estate' };
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


/**
 * Parse a street address from a Facebook Events URL slug.
 *
 * Slug format: {number}-{street-words}-{city}-{state}-{zip?}-{country?}
 * The 2-letter state abbreviation (lowercase) is the anchor point.
 * Everything before state = street number + name + (optional directional).
 * Between state and end = optional 5-digit zip.
 *
 * Example: "3105-tuell-st-nw-grand-rapids-mi-49504"
 *   → { address: "3105 Tuell St NW", city: "Grand Rapids", state: "MI", zip: "49504" }
 */
function parseAddressFromFacebookSlug(
  sourceUrl: string
): { address: string; city: string; state: string; zip: string } | null {
  try {
    // Extract the segment immediately after /events/
    const eventsMatch = sourceUrl.match(/\/events\/([^/?#]+)/);
    if (!eventsMatch) return null;

    const slug = eventsMatch[1];
    const parts = slug.split('-');

    // Must start with a street number
    if (!/^\d+$/.test(parts[0])) return null;

    // Find the 2-letter state abbreviation followed by a zip or "united"
    // Pattern: ...-{xx}-{5digits|united}-...
    let stateIdx = -1;
    for (let i = 1; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!/^[a-z]{2}$/.test(part)) continue;
      const next = parts[i + 1];
      if (/^\d{5}$/.test(next) || next === 'united') {
        stateIdx = i;
        break;
      }
    }
    if (stateIdx === -1) return null;

    const stateAbbr = parts[stateIdx].toUpperCase();

    // zip: 5-digit segment immediately after state (if present)
    const zipCandidate = parts[stateIdx + 1];
    const zip = /^\d{5}$/.test(zipCandidate) ? zipCandidate : '';

    // Street: parts[0] through parts[stateIdx - 1], but we must carve out the city.
    // City is everything between the street name and the state.
    // The street number is parts[0]. The street suffix (St, Ave, Blvd, etc.) and
    // optional post-directional come next, then city words.
    // Strategy: walk backwards from stateIdx - 1 until we hit a known street suffix
    // or a pure-numeric-start (house number again — shouldn't happen).
    const streetSuffixes = new Set([
      'st','ave','blvd','dr','rd','ln','way','ct','pl','cir','hwy','pkwy',
      'trl','ter','sq','loop','xing','run','pass','pike','fwy','expy',
    ]);
    const cardinals = new Set(['n','s','e','w','ne','nw','se','sw']);

    // Find the street suffix index (scanning forward from index 1)
    let suffixIdx = -1;
    for (let i = 1; i < stateIdx; i++) {
      if (streetSuffixes.has(parts[i].toLowerCase())) {
        // Check if the NEXT part is a cardinal (post-directional like NW)
        if (i + 1 < stateIdx && cardinals.has(parts[i + 1].toLowerCase())) {
          suffixIdx = i + 1;
        } else {
          suffixIdx = i;
        }
        break;
      }
    }

    let streetParts: string[];
    let cityParts: string[];

    if (suffixIdx !== -1) {
      streetParts = parts.slice(0, suffixIdx + 1);
      cityParts   = parts.slice(suffixIdx + 1, stateIdx);
    } else {
      // No recognizable suffix — heuristic: first word after number = street name,
      // rest up to state = city
      streetParts = parts.slice(0, 2);
      cityParts   = parts.slice(2, stateIdx);
    }

    if (streetParts.length === 0 || cityParts.length === 0) return null;

    const address = streetParts
      .map((p) =>
        cardinals.has(p.toLowerCase())
          ? p.toUpperCase()
          : p.charAt(0).toUpperCase() + p.slice(1)
      )
      .join(' ');
    const city = cityParts
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ');

    return { address, city, state: stateAbbr, zip };
  } catch {
    return null;
  }
}

/**
 * Secondary fallback: attempt to extract a street address from the event title.
 * Looks for patterns like "123 Main St", "456 Oak Avenue", etc.
 * Returns only the address string (city/state remain from metro or slug parse).
 */
function parseAddressFromTitle(title: string): string | null {
  const match = title.match(
    /(\d+\s+[A-Za-z]+(?:\s+[A-Za-z]+)?\s+(?:St|Ave|Blvd|Dr|Rd|Ln|Way|Ct|Pl|Cir|Hwy|Pkwy|Trl|Ter)\.?(?:\s+(?:NW|NE|SW|SE|N|S|E|W))?)/i
  );
  return match ? match[1].trim() : null;
}

/** Convert a raw search result into a ScrapedItem, or null if unusable. */
function buildScrapedItem(
  result: SearchResult,
  metro: MetroTarget,
  sourceApi: string,
  typeHint?: string
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

  // Attempt to extract precise address from URL slug; fall back to title parse
  const slugParsed = parseAddressFromFacebookSlug(url);
  const titleAddress = !slugParsed ? parseAddressFromTitle(cleanTitle) : null;

  const resolvedAddress = slugParsed?.address ?? titleAddress ?? '';
  const resolvedCity    = slugParsed?.city    ?? metro.city;
  const resolvedState   = slugParsed?.state   ?? metro.state;
  const resolvedZip     = slugParsed?.zip     ?? '';

  const inferred = inferSaleType(combined, typeHint);

  return {
    title:         cleanTitle,
    address:       resolvedAddress,
    city:          resolvedCity,
    state:         resolvedState,
    zip:           resolvedZip,
    startDate,
    endDate,
    description:   snippet || cleanTitle,
    organizerName: undefined,
    organizerEmail: undefined,
    photoUrls:     [],
    saleType:      inferred.saleType,
    saleSubtype:   inferred.saleSubtype,
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
// Searlo rate-limit throttle (MODULE-LEVEL — shared across all sub-queries/metros)
// ---------------------------------------------------------------------------
//
// Searlo enforces BOTH a per-second cap (5/sec) and a per-minute cap. Calling too
// fast returns HTTP 429 with body:
//   {"success":false,"code":4201,"retryAfter":60,
//    "limits":{"perSecond":{"limit":5,...},"perMinute":{"limit":<N>,...}}}
// and the old code fell straight through to Serper on 429 — bleeding Serper
// credits and losing Searlo's cost advantage.
//
// This throttle paces Searlo calls to stay UNDER both caps with margin:
//   • ~4 req/sec (one slot every 250ms — under the 5/sec cap)
//   • per-minute: a rolling 60s window capped at `searloPerMinuteLimit`
// The per-minute limit self-tunes from the 429 body's limits.perMinute.limit when
// observed; until then it is paced from call #1 at the SEARLO_RPM env value
// (default 9, under the free-tier 10/min cap).
//
// State is module-level (not per-metro) so pacing holds across the whole run.

const SEARLO_MIN_INTERVAL_MS = 250;   // ≈4 req/sec — under the 5/sec hard cap
// Per-minute cap PACED FROM CALL #1 (no learning-429 needed). Free tier = 10/min,
// so the default 9 leaves margin to avoid boundary 429s. Read from SEARLO_RPM
// (parsed int) so the cap is tunable without a code change: when the Searlo plan
// is upgraded, set the SEARLO_RPM env var to the new tier's per-minute limit.
// The 429 self-tune below still acts as a backstop: if a 429 ever reports a LOWER
// limit, we honor it.
const SEARLO_RPM_DEFAULT = 9;
function parseSearloRpm(): number {
  const raw = process.env.SEARLO_RPM;
  if (raw === undefined || raw.trim() === '') return SEARLO_RPM_DEFAULT;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : SEARLO_RPM_DEFAULT;
}
let searloPerMinuteLimit = parseSearloRpm(); // paces from call #1; 429 may lower it
let searloNextAllowedAt = 0;          // earliest timestamp (ms) the next call may fire
const searloCallTimestamps: number[] = []; // rolling 60s window of recent call starts

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)));

/**
 * Block until a Searlo call is permitted under BOTH the per-second spacing and the
 * rolling per-minute window, then record the call start. Shared module state means
 * concurrent/serial callers all respect the same budget.
 */
async function searloThrottleAcquire(): Promise<void> {
  // Loop because waiting for one constraint may push us into another.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const now = Date.now();

    // Per-second spacing.
    if (now < searloNextAllowedAt) {
      await sleep(searloNextAllowedAt - now);
      continue;
    }

    // Per-minute rolling window: drop timestamps older than 60s.
    while (searloCallTimestamps.length > 0 && now - searloCallTimestamps[0] >= 60_000) {
      searloCallTimestamps.shift();
    }
    if (searloCallTimestamps.length >= searloPerMinuteLimit) {
      // Wait until the oldest call ages out of the 60s window.
      const waitMs = 60_000 - (now - searloCallTimestamps[0]) + 5;
      await sleep(waitMs);
      continue;
    }

    // Slot available — reserve it.
    searloCallTimestamps.push(now);
    searloNextAllowedAt = now + SEARLO_MIN_INTERVAL_MS;
    return;
  }
}

// ---------------------------------------------------------------------------
// Engine 1: Searlo SERP API (PRIMARY — Google SERP proxy, geo-accurate, no expiry)
// ---------------------------------------------------------------------------

interface SearloResponse {
  organic?: Array<{
    position?: number;
    title: string;
    link: string;
    snippet?: string;
    domain?: string;
  }>;
}

/** Parse the per-minute limit + retryAfter (seconds) from a Searlo 429 body. */
function parseSearlo429(body: string): { retryAfterMs: number; perMinuteLimit?: number } {
  let retryAfterMs = 60_000; // default if unparseable
  let perMinuteLimit: number | undefined;
  try {
    const parsed = JSON.parse(body) as {
      retryAfter?: number;
      limits?: { perMinute?: { limit?: number } };
    };
    if (typeof parsed.retryAfter === 'number' && parsed.retryAfter > 0) {
      retryAfterMs = parsed.retryAfter * 1000;
    }
    const pm = parsed.limits?.perMinute?.limit;
    if (typeof pm === 'number' && pm > 0) perMinuteLimit = pm;
  } catch {
    /* leave defaults */
  }
  // Cap the wait so a bad retryAfter can't stall a run; 65s covers a full minute.
  retryAfterMs = Math.min(retryAfterMs, 65_000);
  return { retryAfterMs, perMinuteLimit };
}

/** Single raw Searlo request (no throttle, no retry) — used by searchSearlo. */
async function searloFetch(query: string, apiKey: string): Promise<Response> {
  // limit caps at 10 (Searlo hard cap). Depth >10 is available via the `page`
  // param for pagination, but is intentionally omitted to keep credit cost at
  // exactly 1 credit per sub-query.
  const params = new URLSearchParams({ q: query, limit: '10', gl: 'us' });
  return fetch(`https://api.searlo.tech/api/v1/search/web?${params}`, {
    headers: {
      'x-api-key': apiKey,
      'Accept':    'application/json',
    },
    signal: AbortSignal.timeout(20_000),
  });
}

async function searchSearlo(query: string, apiKey: string): Promise<SearchResult[]> {
  // Respect the shared throttle before every call so we stay under both caps.
  await searloThrottleAcquire();
  let response = await searloFetch(query, apiKey);

  // On 429: self-tune the per-minute budget, honor retryAfter (capped), and retry
  // Searlo ONCE before letting the caller fall back to Serper. This keeps us on
  // cheap Searlo instead of bleeding Serper credits on transient rate limits.
  if (response.status === 429) {
    const body = await response.text().catch(() => '');
    const { retryAfterMs, perMinuteLimit } = parseSearlo429(body);
    if (perMinuteLimit) searloPerMinuteLimit = perMinuteLimit;
    console.warn(
      `[FB-Events] Searlo 429 (rate limited) — waiting ${Math.round(retryAfterMs / 1000)}s ` +
      `then retrying once${perMinuteLimit ? ` (per-minute cap learned: ${perMinuteLimit})` : ''}`
    );
    await sleep(retryAfterMs);
    await searloThrottleAcquire();
    response = await searloFetch(query, apiKey);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Searlo ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as SearloResponse;
  return (data.organic ?? []).map((r) => ({
    url:     r.link,
    title:   r.title,
    snippet: r.snippet ?? '',
  }));
}

// ---------------------------------------------------------------------------
// Engine 3: Brave Search API (backup — independent index, free tier available)
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
// Engine 4: ScaleSerp (backup — Google SERP proxy, 125 free/month + paid)
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
  searloKey?:    string;
  braveKey?:     string;
  scaleSerpKey?: string;
}

/**
 * Scrape Facebook Events for a single metro via search engines.
 *
 * Priority:
 *   1. Searlo SERP API   (Google SERP proxy, geo-accurate, no expiry — PRIMARY)
 *   2. Serper.dev        (Google SERP proxy, best geo-targeting, first fallback)
 *   3. Brave Search API  (independent index, free fallback)
 *   4. ScaleSerp         (Google SERP proxy, second fallback)
 *
 * Returns ScrapedItem[] without ingesting.
 */
export async function scrapeFacebookEventsForMetro(
  metro: MetroTarget,
  opts: FbSearchOptions = {}
): Promise<ScrapedItem[]> {
  // Sale-type sub-queries. Each is run independently per metro and the results
  // deduped by event id. Why split the old single 9-OR-term query into these:
  //   1. CROWDING: at the num=10 result ceiling, one combined query is dominated
  //      by estate/garage/yard and almost never surfaces flea-market or auction
  //      events. Dedicated flea + auction sub-queries surfaced ~45 net flea/auction
  //      events across 6 metros in live testing that the combined top-10 never showed.
  //   2. BRAVE FALLBACK COMPATIBILITY: the Brave engine breaks above ~3 OR terms,
  //      so each sub-query is capped at ≤3 OR clauses to stay Brave-compatible.
  //
  // num stays 10: the production Serper key is free-tier (num>10 → 400 "Query pattern
  // not allowed for free accounts"). Raising num requires a paid Serper key.
  //
  // COST: this multiplies search-API credits per metro by the number of sub-queries
  // (3×) — relevant to the Serper credit budget. It is bounded to exactly one
  // request per sub-query per metro per run (no pagination, no loops beyond this list).
  const subQueries: Array<{ clause: string; typeHint: string }> = [
    // Q1: estate/garage/yard + consignment folded in as a 4th OR term (was its own
    // sub-query). Consignment already classifies as ESTATE (no distinct enum), so it
    // rides correctly under this ESTATE hint. Folding it here trims the per-metro
    // sub-query count 4 → 3, cutting Searlo calls per daily shard from 172 → 129 and
    // keeping the run comfortably under the 19-min target on the free tier.
    // NOTE: this clause carries 4 OR terms — above Brave's ~3-term ceiling. That is
    // acceptable because Searlo (primary) and Serper honor it; Brave is only a tail
    // fallback and degrades gracefully (it would surface estate-side results at worst).
    { clause: '("estate sale" OR "garage sale" OR "yard sale" OR "consignment sale")', typeHint: 'ESTATE'      },
    // Q2 (flea) and Q3 (auction) stay DEDICATED — these are the high-value sub-queries
    // we must not crowd, and each stays ≤3 OR terms (Brave-compatible).
    { clause: '("flea market" OR "swap meet")',                           typeHint: 'FLEA_MARKET' },
    { clause: '("estate auction" OR "public auction" OR "online auction")', typeHint: 'AUCTION'   },
  ];

  // Dedupe accumulator: event id → ScrapedItem (first occurrence wins).
  const byEventId = new Map<string, ScrapedItem>();

  for (const sub of subQueries) {
    const query =
      `site:facebook.com/events ${sub.clause} ${metro.city} ${metro.state}`;

    let rawResults: SearchResult[] = [];
    let usedEngine = '';
    // Track whether Searlo completed without throwing (even if it returned 0 results).
    // Fallback engines only fire on actual Searlo errors, NOT on empty results —
    // 0 results means the market has no events, not that Searlo failed.
    let searloSucceeded = false;

    // --- Engine 1: Searlo (PRIMARY — geo-accurate Google SERP proxy, no expiry) ---
    if (opts.searloKey) {
      try {
        rawResults = await searchSearlo(query, opts.searloKey);
        usedEngine = 'searlo';
        searloSucceeded = true; // Searlo completed — even 0 results is a valid answer
        console.log(
          `[FB-Events] Searlo OK for ${metro.city}, ${metro.state} [${sub.typeHint}] — ${rawResults.length} results`
        );
      } catch (err) {
        console.warn(
          `[FB-Events] Searlo failed for ${metro.city}, ${metro.state} [${sub.typeHint}]:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    // --- Engine 2: Brave (error-only fallback — free; ≤3 OR terms required) ---
    // NOTE: Serper was removed. Searlo 0 results = empty market = no fallback needed.
    // Brave only fires if Searlo threw an error (searloSucceeded=false).
    if (!searloSucceeded && rawResults.length === 0 && opts.braveKey) {
      try {
        rawResults = await searchBrave(query, opts.braveKey);
        usedEngine = 'brave';
        console.log(
          `[FB-Events] Brave fallback (Searlo error) for ${metro.city}, ${metro.state} [${sub.typeHint}] — ${rawResults.length} results`
        );
      } catch (err) {
        console.warn(
          `[FB-Events] Brave failed for ${metro.city}, ${metro.state} [${sub.typeHint}]:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    // --- Engine 3: ScaleSerp (error-only fallback) ---
    if (!searloSucceeded && rawResults.length === 0 && opts.scaleSerpKey) {
      try {
        rawResults = await searchScaleSerp(query, opts.scaleSerpKey);
        usedEngine = 'scaleserp';
        console.log(
          `[FB-Events] ScaleSerp fallback (Searlo error) for ${metro.city}, ${metro.state} [${sub.typeHint}] — ${rawResults.length} results`
        );
      } catch (err) {
        console.warn(
          `[FB-Events] ScaleSerp failed for ${metro.city}, ${metro.state} [${sub.typeHint}]:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    if (rawResults.length === 0) {
      // A single empty sub-query is not fatal — other sub-queries may still return
      // results. Log and continue rather than aborting the whole metro.
      console.warn(
        `[FB-Events] No results for ${metro.city}, ${metro.state} [${sub.typeHint}] (all engines empty/failed)`
      );
    } else {
      // Debug: log first 3 URLs so we can monitor engine health
      const preview = rawResults.slice(0, 3).map((r) => r.url).join(' | ');
      console.log(
        `[FB-Events] Sample URLs (${metro.city} [${sub.typeHint}], engine=${usedEngine}): ${preview}`
      );

      for (const r of rawResults) {
        const item = buildScrapedItem(r, metro, usedEngine, sub.typeHint);
        if (!item) continue;
        // buildScrapedItem always sets sourceItemId to `fb:events:<id>`; fall back
        // to sourceUrl only to satisfy the optional type. Used as the dedup key so
        // the same event surfaced by multiple sub-queries is ingested once.
        const dedupKey = item.sourceItemId ?? item.sourceUrl;
        if (!byEventId.has(dedupKey)) {
          byEventId.set(dedupKey, item);
        }
      }
    }

    // Inter-sub-query spacing to prevent burst 429s on Searlo's sliding-window
    // rate limiter. The module-level searloThrottleAcquire() enforces the per-minute
    // cap, but 3 sub-queries fired in quick succession can all pass through in the
    // same throttle "slot" and still hit Searlo's actual 10/min sliding window.
    // At 9 RPM (cap=10) each slot is ~6.67s — spacing sub-queries by 6500ms ensures
    // no two Searlo calls land within the same second-level bucket.
    // Non-Searlo fallback engines only get the small jitter (they don't share the
    // Searlo budget, so the large delay would just slow down fallback paths).
    if (usedEngine === 'searlo') {
      await sleep(6500);
    } else {
      await jitterDelay(200, 500);
    }
  }

  const items: ScrapedItem[] = Array.from(byEventId.values());
  return items;
}
