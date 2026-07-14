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
 *      (inferSaleType / isRejectedNonSaleContent) on the
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

// Reject events whose REAL parsed start is more than this far before "now".
// Tightened from 30d -> ~2d grace (S1117): FB still serves old / recurring event
// pages whose real start_timestamp is years past; a wide window let those ingest
// and render as "live now". A 2-day grace still admits genuinely same-weekend /
// multi-day-ongoing sales (e.g. a Fri start viewed on Sun). Applies ONLY to a
// real timestamp -- never to the day_time_sentence "approximate" path, which only
// ever yields now / today / tomorrow and is disclosed via the approximate badge.
const STALE_PAST_GRACE_MS = 2 * 86_400_000;

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

// US state + DC 2-letter codes -- validates a candidate token so we never treat
// "US", "Rd", "St" etc. as a state.
const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL',
  'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT',
  'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI',
  'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
]);

// Canadian province + territory 2-letter codes. Disjoint from US_STATE_CODES,
// so a bare 2-letter token unambiguously identifies its country. QC is included
// here for DETECTION only -- Quebec listings are REJECTED at ingest (LOCKED
// S1116, consistent with the S626 EU+QC exclusion posture); every other province
// is accepted and relabelled to its true city + province.
const CA_PROVINCE_CODES = new Set([
  'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT',
]);


/**
 * Extract the REAL city + 2-letter state from an event_place display string by
 * locating a valid US state-code token and taking the comma-token immediately
 * before it as the city. Pure + exported for unit testing.
 *
 * Handles both shapes that appear in live FB data:
 *   - Page label:        "Renton, WA"                                    -> Renton, WA
 *   - Page label:        "Clinton, CT"                                   -> Clinton, CT
 *   - FreeformPlace addr: "1356 West Sweden Rd, Brockport, NY, United States, New York 14420" -> Brockport, NY
 *   - FreeformPlace addr: "36 Linden St, Pittsfield, MA 01201-3212, United States"            -> Pittsfield, MA
 *   - FreeformPlace addr: "470 Gold Rd, Jasper, TN 37347-6216, United States"                 -> Jasper, TN
 *
 * A US state token is an exact 2-letter uppercase code ("NY") OR a code followed
 * by a ZIP ("MA 01201-3212" -> MA). A Canadian province token is an exact code
 * ("BC") OR a code + postal ("BC V3G 2K1"); e.g.
 * "..., Abbotsford, BC V3G 2K1, Canada" -> { Abbotsford, BC, CA }. The US and CA
 * code sets are disjoint, so `country` is unambiguous. Returns null when no valid
 * US/CA code is present (spelled-out province, or an unparseable string) so the
 * caller keeps its existing metro fallback.
 */
export function deriveCityStateFromDisplay(
  display: string
): { city: string; state: string; country: 'US' | 'CA' } | null {
  if (!display || typeof display !== 'string') return null;
  const tokens = display
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  for (let i = 1; i < tokens.length; i++) {
    // US: exact "ST", or "ST 01201" / "ST 01201-3212" (state code + trailing ZIP).
    const us = tokens[i].match(/^([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/);
    if (us && US_STATE_CODES.has(us[1])) {
      const city = tokens[i - 1];
      if (city) return { city, state: us[1], country: 'US' };
    }
    // Canada: bare province code "BC", or province + postal "BC V3G 2K1"
    // (as it appears in FreeformPlace addresses like
    // "..., Abbotsford, BC V3G 2K1, Canada"). Province set is disjoint from the
    // US set, so this never mis-claims a US token. City is the token before it.
    const ca = tokens[i].match(
      /^([A-Z]{2})(?:\s+[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d)?$/
    );
    if (ca && CA_PROVINCE_CODES.has(ca[1])) {
      const city = tokens[i - 1];
      if (city) return { city, state: ca[1], country: 'CA' };
    }
  }
  return null;
}

// How the returned city/state was resolved -- surfaced in scrapedMetadata so
// downstream cleanup can find records that never got a real city/state.
type CityStateSource =
  | 'structured'
  | 'derived-address'
  | 'derived-address-CA'
  | 'metro-fallback';

interface ParsedPlace {
  city: string;
  state: string;
  address: string;
  cityStateSource: CityStateSource;
  /**
   * Resolved country when city/state came from a parsed address ('US' or 'CA').
   * null when it is still the query-metro fallback or came from structured
   * fields. Stored in scrapedMetadata (there is NO `country` column on Sale --
   * see SCHEMA NOTE in the handoff) and used to reject Quebec at ingest.
   */
  country: 'US' | 'CA' | null;
  /**
   * true when we have a REAL street address (FreeformPlace) but could NOT
   * resolve a confident US city/state from it -- i.e. the city/state we are
   * about to store is still the query-metro fallback and therefore very likely
   * a GEO MISMATCH (non-US address such as "..., BC V3G 2K1, Canada", or an
   * unparseable/junk string). We only FLAG it here; whether such a listing is
   * rejected, relabelled non-US, or kept-and-flagged is a removal-class product
   * decision deferred to Patrick (see DECISION NEEDED in the handoff).
   */
  geoUnresolved: boolean;
  /**
   * Raw FreeformPlace text that FAILED the real-street-address guard
   * (looksLikeStreetAddress) and was therefore NOT written to `address` -- a
   * bare ZIP, a city fragment, or a placeholder ("TBD - Fairfax Vermont").
   * Empty string when the address was accepted or there was no FreeformPlace.
   * Preserved (never dropped) so downstream cleanup can inspect what FB had.
   */
  rawPlaceText: string;
}

/**
 * Heuristic "does this look like a REAL street address" guard for the
 * FreeformPlace label BEFORE it is ever written to Sale.address. FB's
 * FreeformPlace.contextual_name is a free-text field organizers type by hand, so
 * it is frequently NOT a street address at all -- observed junk includes a bare
 * ZIP ("35951"), a city fragment ("Dunlay tx"), and placeholders
 * ("TBD - Fairfax Vermont"). A real FB street label always LEADS with a house
 * number followed by a street-name word ("1356 West Sweden Rd, ...",
 * "36 Linden St, ...", "470 Gold Rd, ..."). We require exactly that shape and
 * reject a bare number / ZIP. Conservative by design: when unsure we return
 * false so the listing keeps an EMPTY address (address is optional) rather than
 * storing a wrong street string. Pure + exported for unit testing.
 */
export function looksLikeStreetAddress(candidate: string): boolean {
  if (!candidate || typeof candidate !== 'string') return false;
  const t = candidate.trim();
  if (!t) return false;
  // A bare ZIP (or ZIP+4) alone is not a street address.
  if (/^\d{5}(?:-\d{4})?$/.test(t)) return false;
  // Must lead with a house number (1-6 digits) then an alphabetic street word.
  // Rejects "Dunlay tx", "TBD - Fairfax Vermont", "35951"; accepts
  // "1356 West Sweden Rd", "36 Linden St", "470 Gold Rd", "123 Broadway".
  return /^\d{1,6}\s+[A-Za-z][A-Za-z0-9.'-]*/.test(t);
}

function parsePlace(ev: any, metro: MetroTarget): ParsedPlace {
  const place = ev?.event_place;
  let city = metro.city;
  let state = metro.state;
  let address = '';
  let rawPlaceText = '';
  let cityStateSource: CityStateSource = 'metro-fallback';
  let country: 'US' | 'CA' | null = null;

  if (place && typeof place === 'object') {
    // Some result objects carry structured city/state; the lean typeahead objects
    // carry only a `contextual_name` / `name` display string.
    const hasStructCity = typeof place.city === 'string' && place.city.trim();
    const hasStructState = typeof place.state === 'string' && place.state.trim();
    if (hasStructCity) city = place.city.trim();
    if (hasStructState) state = place.state.trim();
    if (hasStructCity && hasStructState) cityStateSource = 'structured';

    const display =
      (typeof place.contextual_name === 'string' && place.contextual_name) ||
      (typeof place.name === 'string' && place.name) ||
      '';
    // Derive the REAL city/state from the display string. Handles both bare
    // "City, ST" Page labels AND full FreeformPlace street addresses like
    // "1356 West Sweden Rd, Brockport, NY, United States, ..." (the previous
    // trailing-", ST"-only regex missed these, so out-of-metro events ingested
    // under the wrong query-metro city). Only override when we did NOT already
    // get authoritative structured city/state fields -- i.e. one still equals
    // the query-metro default. If no valid US state code is present, keep the
    // fallback (unchanged behaviour for spelled-out / unparseable strings).
    if (city === metro.city || state === metro.state) {
      const derived = deriveCityStateFromDisplay(display);
      if (derived) {
        state = derived.state;
        city = derived.city;
        country = derived.country;
        cityStateSource =
          derived.country === 'CA' ? 'derived-address-CA' : 'derived-address';
      }
    }
    // Street address ONLY from a FreeformPlace, whose contextual_name is a real
    // street string (e.g. "1356 West Sweden Rd, Brockport, NY, United States, ...").
    // A Page event_place carries only a city/region label (e.g. "Renton, WA") --
    // NOT a street address -- so it must never populate `address`. null place ->
    // address stays empty. City/state derivation above is unchanged.
    if (place.__typename === 'FreeformPlace' && display.trim()) {
      const candidate = display.trim();
      if (looksLikeStreetAddress(candidate)) {
        address = candidate;
      } else {
        // User-typed junk in the FreeformPlace label (bare ZIP, city fragment,
        // or a placeholder like "TBD - Fairfax Vermont"). A wrong street string
        // is worse than none, and address is optional -- so leave `address`
        // empty (city-level fallback) but PRESERVE the raw text for cleanup.
        rawPlaceText = candidate;
      }
    }
  }

  // A real street address that STILL rides on the query-metro city/state means
  // we placed a street-level location on the wrong metro (the confirmed
  // Casper,WY-vs-Abbotsford,BC bug). Flag it; do not silently trust the metro.
  const geoUnresolved = cityStateSource === 'metro-fallback' && address.length > 0;

  return { city, state, address, cityStateSource, country, geoUnresolved, rawPlaceText };
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

  // STALE-DATE REJECT (S1117) -- ONLY for a REAL parsed start_timestamp. FB keeps
  // serving old / recurring event pages whose real start is years past; without
  // this they ingest with dateApproximate:false and render as "live now". The
  // day_time_sentence "approximate" path (now / today / tomorrow) is exempt --
  // it is never in the past and is separately disclosed via the approximate badge.
  if (
    !dateResolved.approximate &&
    startDate.getTime() < Date.now() - STALE_PAST_GRACE_MS
  ) {
    return null;
  }

  // endDate: prefer the event's OWN real end_timestamp when it is a valid UNIX
  // seconds value at/after the start (multi-day sales carry a genuine multi-day
  // window). Fall back to start + 1 day only when there is no usable end. NEVER
  // derive endDate from "now" -- that was the artifact that paired an ancient real
  // start with a uniform ~week-out end and made dead events look live.
  const endTs = ev?.end_timestamp;
  const endFromEvent =
    typeof endTs === 'number' && endTs > 0 ? new Date(endTs * 1000) : null;
  const endDate =
    endFromEvent &&
    !isNaN(endFromEvent.getTime()) &&
    endFromEvent.getTime() >= startDate.getTime()
      ? endFromEvent
      : new Date(startDate.getTime() + 86_400_000);

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

  const { city, state, address, cityStateSource, country, geoUnresolved, rawPlaceText } =
    parsePlace(ev, metro);

  // LOCKED S1116: Canadian listings are IN -- EXCEPT Quebec, which is REJECTED
  // at ingest (consistent with the EU+QC exclusion posture). Reject when the
  // resolved province is QC, OR the parsed street address explicitly names
  // Quebec/Quebec (spelled-out province with no 2-letter code token). No US
  // state is 'QC' and metro.state is always a US state, so state==='QC' can only
  // arise from a Canadian address parse -- this never rejects a US listing.
  if (state === 'QC' || /\bqu[eé]bec\b/i.test(address)) return null;

  // Organizer attribution -- resolved in priority order, never guessed:
  //   1. A STRUCTURED host/creator NAME on the Event JSON (event_creator.name,
  //      host.name, hosts[0].name) via extractHostName -- most reliable, though
  //      the lean search-result objects frequently omit it.
  //   2. Fall back to the SAME guarded title heuristic the SERP path uses
  //      (extractOrganizerName): an explicit "hosted by X" / "by X" attribution,
  //      or a capitalized business phrase immediately preceding a sale-type
  //      keyword. It rejects bare numbers, "The", and <3-char fragments and
  //      returns null when unsure -- so a confident real business name like
  //      "Queen Bee Estate Sales" is captured while ambiguous titles fall
  //      through to the system "FindA.Sale Directory" organizer (prior behavior).
  //      We pass the event's OWN name as the title and an EMPTY snippet so the
  //      name is never double-counted. (This supersedes the earlier
  //      "do-not-derive" note: that warned against a cruder title-fragment grab;
  //      extractOrganizerName is the guarded 2026-07-12 heuristic. The fuller
  //      real organizer is still recovered later from event-page enrichment in
  //      facebook-events-page-fetch.ts.)
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
      // Geo provenance -- how city/state were resolved, so downstream cleanup can
      // find listings still sitting on the query-metro fallback (geo mismatch).
      cityStateSource,
      geoConfidence: geoUnresolved
        ? 'unresolved'
        : cityStateSource === 'metro-fallback'
          ? 'metro-fallback'
          : 'high',
      // When we could NOT resolve a confident US city/state from a real street
      // address (non-US / unparseable), keep the raw address string as the
      // cleanup anchor. `city`/`state` above remain the query-metro fallback for
      // now -- the reject-vs-relabel decision is deferred (see DECISION NEEDED).
      ...(geoUnresolved ? { rawPlaceAddress: address } : {}),
      // Raw FreeformPlace text rejected by the real-street-address guard (not
      // written to `address`). Preserved so cleanup can see what FB actually had.
      ...(rawPlaceText ? { rawPlaceText } : {}),
      // Resolved country when derived from a parsed address ('US' | 'CA'). There
      // is NO `country` column on Sale, so this is the ONLY place a Canadian
      // listing is distinguishable from a US one (see SCHEMA NOTE in handoff).
      ...(country ? { country } : {}),
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
