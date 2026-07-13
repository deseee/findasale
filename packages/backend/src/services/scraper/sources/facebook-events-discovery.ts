/**
 * ADR-082 Phase 3: Facebook Events discovery via the Cloudflare proxy +
 * embedded-JSON parse. Replaces the paid-SERP discovery in
 * search-facebook-events.ts (which is retained behind the
 * FB_EVENTS_DISCOVERY_VIA_PROXY flag as an instant rollback).
 *
 * Flow, per metro x sale-type sub-query:
 *   1. Build FB's OWN event-search URL:
 *        https://www.facebook.com/events/search/?q=<phrase> <city> <state>
 *      (trailing slash before ?q= -- the form proven to return events this session).
 *   2. Fetch it through the EXISTING Cloudflare Worker proxy route
 *        GET ${FB_EVENTS_PROXY_URL}/fb-event-page?url=<encoded search url>
 *      with `Authorization: Bearer ${FB_EVENTS_PROXY_TOKEN}` -- same route + auth as
 *      facebook-events-page-fetch.ts. The route's allowlist already accepts
 *      https://www.facebook.com/events/... URLs, so NO new Worker route is needed.
 *   3. Parse every `__typename:"Event"` object out of the returned HTML
 *      (facebook-json.ts -- pure, no CSS-class dependence).
 *   4. Map each Event -> ScrapedItem with a REAL date from `start_timestamp`
 *      (never the +7-day fabrication the SERP path fell back to), dropping past /
 *      stale / non-sale events, and reusing the SERP path's cleaned helpers
 *      (inferSaleType / isRejectedNonSaleContent / extractOrganizerName) on the
 *      event's OWN name -- a clean signal, free of the SERP snippet-carousel bleed.
 *   5. Dedupe on the numeric FB event id BEFORE returning.
 *
 * Same output contract as scrapeFacebookEventsForMetro: returns ScrapedItem[]
 * without ingesting, so run-search-facebook-events.ts swaps callers cleanly.
 *
 * Never throws out of a fetch: any failure returns [] for that sub-query so the
 * metro loop keeps going.
 */

import { ScrapedItem } from '../index';
import { getRandomUserAgent, getRandomReferer, jitterDelay } from '../userAgents';
import {
  extractEventObjects,
  extractFbEventIdFromUrl,
  canonicalizeEventUrl,
} from './facebook-json';
import {
  MetroTarget,
  FbSearchOptions,
  inferSaleType,
  isRejectedNonSaleContent,
  extractOrganizerName,
} from './search-facebook-events';

const FETCH_TIMEOUT_MS = 15_000;

// Reject events whose real start is more than this far in the past -- deterministic
// stale filter (replaces the SERP path's explicit-past-year snippet heuristic).
const STALE_PAST_MS = 30 * 86_400_000;

// ---------------------------------------------------------------------------
// Sale-type sub-queries -- FB free-text search phrases (NOT site: SERP clauses)
// ---------------------------------------------------------------------------
//
// FB's events/search q is free text and returns ~7 events/page regardless of
// boolean operators, so each phrase is issued as its own query (one proxy fetch
// per phrase per metro) and results deduped by event id. Kept deliberately small
// -- 5 phrases x ~43 metros/shard ~= 215 proxy fetches/day, well under the Worker
// free tier (100k/day) and FB's single-IP rate window. typeHint mirrors the SERP
// path's sub-query intent and is only used as a tie-breaker inside inferSaleType.
const SUB_QUERIES: Array<{ phrase: string; typeHint: string }> = [
  { phrase: 'estate sale',    typeHint: 'ESTATE'      },
  { phrase: 'garage sale',    typeHint: 'YARD'        },
  { phrase: 'yard sale',      typeHint: 'YARD'        },
  { phrase: 'flea market',    typeHint: 'FLEA_MARKET' },
  { phrase: 'estate auction', typeHint: 'AUCTION'     },
];

// ---------------------------------------------------------------------------
// Fetch: FB events/search HTML through the existing proxy route
// ---------------------------------------------------------------------------

/**
 * Fetch the raw HTML of an FB events/search page through the Cloudflare Worker
 * proxy (AS13335) -- the same `/fb-event-page` route + Bearer auth as
 * facebook-events-page-fetch.ts. FB_EVENTS_PROXY_URL is the BARE worker origin;
 * we append `/fb-event-page?url=<encoded>`. Returns null on any failure (never
 * throws) so the caller falls through to the next sub-query / metro.
 */
async function fetchSearchHtml(searchUrl: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const proxyBase = process.env.FB_EVENTS_PROXY_URL;
  const proxyToken = process.env.FB_EVENTS_PROXY_TOKEN;
  const useProxy = Boolean(proxyBase && proxyToken);

  try {
    let fetchUrl: string;
    let fetchInit: RequestInit;

    if (useProxy) {
      fetchUrl = `${proxyBase}/fb-event-page?url=${encodeURIComponent(searchUrl)}`;
      fetchInit = {
        method: 'GET',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${proxyToken}` },
      };
    } else {
      // Direct fallback (works from a dev box / Cowork sandbox; blocked from
      // GH Actions / Railway egress -- matches page-fetch behaviour).
      fetchUrl = searchUrl;
      fetchInit = {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': getRandomUserAgent(),
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: getRandomReferer() || 'https://www.google.com/',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'cross-site',
          'Sec-Fetch-Dest': 'document',
        },
      };
    }

    const response = await fetch(fetchUrl, fetchInit);
    if (!response.ok) {
      console.warn(
        `[FB-Events-Discovery] HTTP ${response.status} for ${searchUrl} (proxy=${useProxy})`
      );
      return null;
    }
    return await response.text();
  } catch (err) {
    console.warn(
      `[FB-Events-Discovery] Fetch failed for ${searchUrl}:`,
      err instanceof Error ? err.message : String(err)
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Date resolution -- real start_timestamp first, light day_time_sentence parse,
// otherwise reject (NEVER fabricate a near-term date).
// ---------------------------------------------------------------------------

/**
 * Resolve an Event's real start Date. Priority:
 *   1. `start_timestamp` (UNIX seconds) -- authoritative, present on the richer
 *      result objects. -> exact Date, dateApproximate:false.
 *   2. `day_time_sentence` -- only a few unambiguous cases ("happening now",
 *      "today", "tomorrow"). Anything else returns null.
 * Returns { date, approximate } or null when no trustworthy signal exists. Never
 * guesses a fabricated +7-day date -- a null here means the event is skipped.
 */
function resolveEventDate(ev: any): { date: Date; approximate: boolean } | null {
  const ts = ev?.start_timestamp;
  if (typeof ts === 'number' && ts > 0) {
    const d = new Date(ts * 1000);
    if (!isNaN(d.getTime())) return { date: d, approximate: false };
  }

  const sentence =
    typeof ev?.day_time_sentence === 'string' ? ev.day_time_sentence.toLowerCase() : '';
  if (sentence) {
    const now = new Date();
    if (sentence.includes('happening now') || sentence.includes('ongoing') || sentence === 'today') {
      return { date: now, approximate: true };
    }
    if (sentence.startsWith('today') || sentence.includes('today at')) {
      return { date: now, approximate: true };
    }
    if (sentence.startsWith('tomorrow') || sentence.includes('tomorrow at')) {
      return { date: new Date(now.getTime() + 86_400_000), approximate: true };
    }
  }

  // No trustworthy date signal -- skip rather than fabricate.
  return null;
}

// ---------------------------------------------------------------------------
// event_place -> city/state best-effort parse
// ---------------------------------------------------------------------------

function parsePlace(
  ev: any,
  metro: MetroTarget
): { city: string; state: string; address: string } {
  const place = ev?.event_place;
  let city = metro.city;
  let state = metro.state;
  let address = '';

  if (place && typeof place === 'object') {
    // Some result objects carry structured city/state; the lean typeahead objects
    // carry only a `contextual_name` / `name` display string.
    if (typeof place.city === 'string' && place.city.trim()) city = place.city.trim();
    if (typeof place.state === 'string' && place.state.trim()) state = place.state.trim();

    const display =
      (typeof place.contextual_name === 'string' && place.contextual_name) ||
      (typeof place.name === 'string' && place.name) ||
      '';
    // Parse a trailing ", ST" out of a "City, ST" display string when we did not
    // get structured fields.
    const m = display.match(/,\s*([A-Z]{2})\b\s*$/);
    if (m && (city === metro.city || state === metro.state)) {
      state = m[1];
      const cityPart = display.slice(0, m.index).split(',').pop();
      if (cityPart && cityPart.trim()) city = cityPart.trim();
    }
    if (typeof place.address === 'string' && place.address.trim()) {
      address = place.address.trim();
    }
  }

  return { city, state, address };
}

// ---------------------------------------------------------------------------
// Host / organizer name best-effort from the Event JSON
// ---------------------------------------------------------------------------

function extractHostName(ev: any): string | undefined {
  const candidates = [
    ev?.event_creator?.name,
    ev?.host?.name,
    ev?.eventCreator?.name,
    Array.isArray(ev?.hosts) ? ev.hosts[0]?.name : undefined,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length >= 2) return c.trim();
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Map one FB Event object -> ScrapedItem (or null to reject)
// ---------------------------------------------------------------------------

function mapEventToScrapedItem(
  ev: any,
  metro: MetroTarget,
  typeHint: string
): ScrapedItem | null {
  // Title
  const rawName = typeof ev?.name === 'string' ? ev.name.trim() : '';
  if (!rawName) return null;

  // Online-only events are not physical sales -- skip.
  if (ev?.is_online === true) return null;

  // Non-sale content rejection (concerts/funerals/etc). Feed the event's OWN
  // name as both title and combined text -- no SERP snippet carousel bleed here.
  if (isRejectedNonSaleContent(rawName, rawName)) return null;

  // Sale-type classification -- reject when there is no positive signal at all.
  const inferred = inferSaleType(rawName, typeHint);
  if (inferred === null) return null;

  // Deterministic past/stale drop FIRST (FB's own boolean), then real date.
  if (ev?.is_past === true) return null;

  const dateResolved = resolveEventDate(ev);
  if (!dateResolved) return null; // no trustworthy date -> skip, never fabricate
  const startDate = dateResolved.date;
  if (startDate.getTime() < Date.now() - STALE_PAST_MS) return null; // stale

  const endDate = new Date(startDate.getTime() + 86_400_000);

  // Numeric FB event id (dedup anchor) -- from ev.id, else from the url.
  const url = typeof ev?.url === 'string' ? ev.url : '';
  let fbEventId: string | null = null;
  if (typeof ev?.id === 'string' && /^\d{6,}$/.test(ev.id)) {
    fbEventId = ev.id;
  } else if (url) {
    fbEventId = extractFbEventIdFromUrl(url);
  }
  if (!fbEventId) return null;

  const sourceUrl = url
    ? canonicalizeEventUrl(url)
    : `https://www.facebook.com/events/${fbEventId}/`;

  const { city, state, address } = parsePlace(ev, metro);

  // Organizer: prefer a real host name from the JSON; else the SERP path's
  // title-regex heuristic; else undefined (system organizer, prior behaviour).
  const organizerName =
    extractHostName(ev) ?? extractOrganizerName(rawName, '') ?? undefined;

  return {
    title: rawName,
    address,
    city,
    state,
    zip: '',
    startDate,
    endDate,
    description: rawName,
    organizerName,
    organizerEmail: undefined,
    photoUrls: [],
    saleType: inferred.saleType,
    saleSubtype: inferred.saleSubtype,
    sourceUrl,
    sourceName: 'Facebook Events',
    sourceItemId: `fb:events:${fbEventId}`,
    scrapedMetadata: {
      metro: `${metro.city}, ${metro.state}`,
      sourceApi: 'fb-proxy-discovery',
      dateApproximate: dateResolved.approximate,
    },
  };
}

// ---------------------------------------------------------------------------
// Main export -- same signature/return as scrapeFacebookEventsForMetro
// ---------------------------------------------------------------------------

/**
 * Discover Facebook Events for a single metro via FB's own event-search surface
 * through the Cloudflare proxy. Returns ScrapedItem[] (deduped by FB event id),
 * without ingesting. `opts` is accepted for signature parity with the SERP path
 * (scrapeFacebookEventsForMetro) but the search-API keys are unused here.
 */
export async function scrapeFacebookEventsForMetroViaProxy(
  metro: MetroTarget,
  _opts: FbSearchOptions = {}
): Promise<ScrapedItem[]> {
  const byEventId = new Map<string, ScrapedItem>();

  for (const sub of SUB_QUERIES) {
    const q = `${sub.phrase} ${metro.city} ${metro.state}`;
    const searchUrl = `https://www.facebook.com/events/search/?q=${encodeURIComponent(q)}`;

    const html = await fetchSearchHtml(searchUrl);
    if (!html) {
      // Space out even on failure to avoid bursting the proxy / FB.
      await jitterDelay(500, 1200);
      continue;
    }

    let events: any[] = [];
    try {
      events = extractEventObjects(html);
    } catch (err) {
      console.warn(
        `[FB-Events-Discovery] parse failed for ${metro.city}, ${metro.state} [${sub.typeHint}]:`,
        err instanceof Error ? err.message : String(err)
      );
    }

    let mapped = 0;
    for (const ev of events) {
      const item = mapEventToScrapedItem(ev, metro, sub.typeHint);
      if (!item) continue;
      const key = item.sourceItemId ?? item.sourceUrl;
      if (!byEventId.has(key)) {
        byEventId.set(key, item);
        mapped++;
      }
    }

    console.log(
      `[FB-Events-Discovery] ${metro.city}, ${metro.state} [${sub.typeHint}] -- ` +
        `${events.length} events found, ${mapped} new sale items`
    );

    // Light inter-query jitter -- one proxy request per phrase; the Worker + FB
    // tolerate this pacing across the sharded metro run.
    await jitterDelay(800, 1800);
  }

  return Array.from(byEventId.values());
}
