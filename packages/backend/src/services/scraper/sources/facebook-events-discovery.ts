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
import {
  looksLikeStreetAddress,
  deriveCityStateFromDisplay,
} from './facebook-address';
// Re-exported so existing importers of these guards from this module keep
// working; the canonical definitions now live in facebook-address.ts.
export { looksLikeStreetAddress, deriveCityStateFromDisplay };
// ADR-082 Option A: per-event street-address enrichment. The individual FB event
// PAGE frequently embeds the FULL street address even when the lean search-result
// object only had a city-level Page label. fetchFacebookEventPage reuses the same
// guards (facebook-address.ts) and never throws (returns null on any failure).
// page-fetch imports only facebook-json / facebook-address / userAgents, so this
// discovery -> page-fetch edge introduces NO import cycle.
import { fetchFacebookEventPage } from './facebook-events-page-fetch';

const FETCH_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// ADR-082 Option A -- per-event address enrichment budget (RUN-GLOBAL).
// ---------------------------------------------------------------------------
//
// The metro loop calls scrapeFacebookEventsForMetroViaProxy ~43x per sharded
// run. The cap + wall-clock budget below are RUN-GLOBAL (not per-metro), so they
// are carried in a shared mutable AddressEnrichCtx threaded into every call.
// Enrichment is serial (concurrency 1) with an 800-1500ms jittered delay between
// fetches to stay well within FB's single-IP rate window through the proxy.
const ADDR_FETCH_MAX_PER_RUN = 150;          // run-global fetch cap (NOT per metro)
const ADDR_FETCH_TIME_BUDGET_MS = 10 * 60_000; // 10-min wall-clock enrichment ceiling
const ADDR_FETCH_TIMEOUT_MS = 8_000;         // per-fetch timeout for this path

// ---------------------------------------------------------------------------
// Date-recovery pass (2026-08-30, S-FB-EVENTS-DATE-RECOVERY) -- PER-METRO cap
// (not run-global like the address-enrichment budget above). Evidence this
// session: a metro with genuinely no-date search-page stubs has only a
// handful of unique candidates (2 in the confirmed Tuscaloosa case), so this
// stays small and bounded regardless of how many sub-query duplicates surface.
// ---------------------------------------------------------------------------
const DATE_RECOVERY_MAX_PER_METRO = 10;

/**
 * Shared, mutable enrichment context threaded through EVERY metro call in a run
 * so the cap (used) and wall-clock budget (startMs) are enforced run-globally.
 * `skipUrls` is a fetch-once set (URLs already enriched/attempted, seeded from
 * the DB by the runner and grown in-memory as this run fetches). `enabled` is the
 * FB_EVENTS_ADDRESS_FETCH flag -- when false the entire second pass is a no-op.
 */
export interface AddressEnrichCtx {
  enabled: boolean;
  used: number;
  startMs: number;
  skipUrls: Set<string>;
}

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
    const text = await response.text();

    // TEMP DIAGNOSTIC (2026-07-27, Patrick: "diagnose it immediately") --
    // extractEventObjects has been silently returning 0 events for every
    // metro/category for 3+ consecutive days with ZERO HTTP-level errors,
    // meaning the fetch itself succeeds but the returned page has no embedded
    // Event JSON. Log response length + a login-wall/checkpoint marker check so
    // the NEXT run tells us whether FB is serving a login wall / checkpoint
    // page instead of real search results, rather than us guessing again.
    const lower = text.toLowerCase();
    const looksBlocked =
      lower.includes('checkpoint') ||
      lower.includes('log_in') ||
      lower.includes('log into facebook') ||
      lower.includes('you must log in') ||
      lower.includes('captcha');
    console.log(
      `[FB-Events-Discovery] DIAG len=${text.length} looksBlocked=${looksBlocked} url=${searchUrl.slice(0, 90)}`
    );

    return text;
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
  typeHint: string,
  // Rejection-reason tally (2026-08-30, S-FB-EVENTS-ZERO-INGEST-DIAG): optional
  // out-param, keyed and incremented by rejectReason() below at every early
  // `return null` exit. Purely additive -- does not change accept/reject logic,
  // only makes WHICH check fired visible in the run log (see aggregate log line
  // in scrapeFacebookEventsForMetroViaProxy). undefined when caller doesn't care.
  reasons?: Record<string, number>,
  // Date-recovery out-param (2026-08-30, S-FB-EVENTS-DATE-RECOVERY): when a
  // no-date rejection fires AND a valid fbEventId/sourceUrl were already
  // resolved, the candidate is pushed here (in addition to, not instead of,
  // the existing reasons tally + null return) so the caller can give it one
  // more chance via the individual event page. Purely additive -- undefined
  // when the caller doesn't pass it, in which case behavior is unchanged.
  noDateCandidates?: Array<{ ev: any; typeHint: string; fbEventId: string; sourceUrl: string }>
): ScrapedItem | null {
  const rejectReason = (reason: string): null => {
    if (reasons) reasons[reason] = (reasons[reason] ?? 0) + 1;
    return null;
  };

  // Title
  const rawName = typeof ev?.name === 'string' ? ev.name.trim() : '';
  if (!rawName) return rejectReason('no-name');

  // Online-only events are not physical sales -- skip.
  if (ev?.is_online === true) return rejectReason('online');

  // Non-sale content rejection (concerts/funerals/etc). Feed the event's OWN
  // name as both title and combined text -- no SERP snippet carousel bleed here.
  if (isRejectedNonSaleContent(rawName, rawName)) return rejectReason('non-sale');

  // Sale-type classification -- reject when there is no positive signal at all.
  const inferred = inferSaleType(rawName, typeHint);
  if (inferred === null) return rejectReason('unclassified-type');

  // Deterministic past/stale drop FIRST (FB's own boolean), then real date.
  if (ev?.is_past === true) return rejectReason('past');

  // Numeric FB event id (dedup anchor) -- from ev.id, else from the url.
  // MOVED BEFORE date resolution (2026-08-30, S-FB-EVENTS-DATE-RECOVERY): a
  // no-date rejection still needs a valid id/url to be queued as a
  // date-recovery candidate below. This extraction never depended on any
  // date field, so moving it earlier changes no existing behavior.
  const url = typeof ev?.url === 'string' ? ev.url : '';
  let fbEventId: string | null = null;
  if (typeof ev?.id === 'string' && /^\d{6,}$/.test(ev.id)) {
    fbEventId = ev.id;
  } else if (url) {
    fbEventId = extractFbEventIdFromUrl(url);
  }
  if (!fbEventId) return rejectReason('no-event-id');

  const sourceUrl = url
    ? canonicalizeEventUrl(url)
    : `https://www.facebook.com/events/${fbEventId}/`;

  const dateResolved = resolveEventDate(ev);
  if (!dateResolved) {
    // No trustworthy date signal on the search-page stub -- queue it for the
    // date-recovery pass (individual event page) in
    // scrapeFacebookEventsForMetroViaProxy. Purely additive: the immediate
    // reject-null behavior for THIS pass is unchanged, and nothing is
    // fabricated here.
    if (noDateCandidates) {
      noDateCandidates.push({ ev, typeHint, fbEventId, sourceUrl });
    }
    return rejectReason('no-date');
  }
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
    return rejectReason('stale-date');
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

  const item = buildScrapedItemFromEvent(
    ev,
    metro,
    typeHint,
    fbEventId,
    sourceUrl,
    startDate,
    endDate,
    dateResolved.approximate,
    'search-page'
  );
  if (!item) return rejectReason('quebec');
  return item;
}

// ---------------------------------------------------------------------------
// Shared tail: place/quebec/organizer resolution + ScrapedItem construction.
// Factored out (2026-08-30, S-FB-EVENTS-DATE-RECOVERY) so the normal
// search-page accept path (mapEventToScrapedItem, dateSource:'search-page')
// and the date-recovery accept path (scrapeFacebookEventsForMetroViaProxy,
// dateSource:'page-fetch-recovery') build byte-identical ScrapedItem shapes
// from a single source instead of duplicating ~40 lines twice. Returns null
// for the Quebec reject (parity with the original inline check) -- caller
// decides how to log/count that.
// ---------------------------------------------------------------------------
function buildScrapedItemFromEvent(
  ev: any,
  metro: MetroTarget,
  typeHint: string,
  fbEventId: string,
  sourceUrl: string,
  startDate: Date,
  endDate: Date,
  dateApproximate: boolean,
  dateSource: 'search-page' | 'page-fetch-recovery'
): ScrapedItem | null {
  const rawName = typeof ev?.name === 'string' ? ev.name.trim() : '';
  const inferred = inferSaleType(rawName, typeHint);
  // Defensive only -- both callers already confirmed a non-null classification
  // for this same event before reaching here (search-page path checks it
  // directly above; the date-recovery path re-uses an event that already
  // passed this check on its first pass). Never expected to fire.
  if (inferred === null) return null;

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
      dateApproximate,
      // Provenance of the date itself: 'search-page' (normal path, resolveEventDate
      // found a real signal on the aggregate search result) vs 'page-fetch-recovery'
      // (search-page stub had zero date fields; recovered from the individual event
      // page via fetchFacebookEventPage -- see date-recovery pass). Additive field,
      // useful for future debugging of ingest volume by source.
      dateSource,
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
  _opts: FbSearchOptions = {},
  enrichCtx?: AddressEnrichCtx
): Promise<ScrapedItem[]> {
  const byEventId = new Map<string, ScrapedItem>();
  // Rejection-reason tally for this metro's whole sub-query loop (2026-08-30,
  // S-FB-EVENTS-ZERO-INGEST-DIAG) -- reset per metro call, aggregated across all
  // SUB_QUERIES, logged once below. Diagnostic only; does not affect ingest.
  const rejectReasons: Record<string, number> = {};
  // Date-recovery candidates for this metro's whole sub-query loop (2026-08-30,
  // S-FB-EVENTS-DATE-RECOVERY) -- reset per metro call (NOT run-global), fed by
  // every mapEventToScrapedItem no-date rejection below, consumed by the
  // date-recovery pass after the sub-query loop.
  const noDateCandidates: Array<{ ev: any; typeHint: string; fbEventId: string; sourceUrl: string }> = [];

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
      const item = mapEventToScrapedItem(ev, metro, sub.typeHint, rejectReasons, noDateCandidates);
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

  // Aggregate rejection-reason breakdown for this metro, ALL sub-queries combined.
  // Diagnostic for S-FB-EVENTS-ZERO-INGEST-DIAG (2026-08-30) -- only printed when at
  // least one rejection happened, so a genuinely quiet metro (few/no events found)
  // doesn't spam an all-zero line.
  const rejectTotal = Object.values(rejectReasons).reduce((a, b) => a + b, 0);
  if (rejectTotal > 0) {
    const breakdown = Object.entries(rejectReasons)
      .map(([reason, n]) => `${reason}=${n}`)
      .join(', ');
    console.log(
      `[FB-Events-Discovery] ${metro.city}, ${metro.state} -- rejection reasons: ${breakdown}`
    );
  }

  // ------------------------------------------------------------------
  // DATE-RECOVERY PASS (2026-08-30, S-FB-EVENTS-DATE-RECOVERY).
  //
  // Confirmed live (GH Actions run #81, 2026-08-30): for a metro+phrase combo
  // with few real matching events, FB serves a LEAN search-result stub for
  // those events (bare __typename:"Event" with id/name/url only -- zero date
  // fields anywhere), which resolveEventDate correctly cannot resolve. The
  // INDIVIDUAL event page reliably carries the real date (confirmed live via
  // fetchFacebookEventPage against a real Tuscaloosa no-date event -- its
  // og:description read "...on Friday, August 28 2026", parsed by the
  // existing Pattern 0 regex in facebook-events-page-fetch.ts). This gives
  // every no-date candidate ONE more chance before it is permanently dropped.
  //
  // Runs UNCONDITIONALLY -- independent of enrichCtx/FB_EVENTS_ADDRESS_FETCH.
  // This recovers a REAL date (not an address-only upgrade), so it must not
  // be gated behind the address-only feature flag below. Bounded to
  // DATE_RECOVERY_MAX_PER_METRO unique candidates (deduped by fbEventId --
  // confirmed live that the same stub event can surface multiple times within
  // and across sub-queries) and throttled with the same jitter pattern used
  // elsewhere in this file. Never fabricates a date: if the page-fetch also
  // fails or yields no date, the event stays dropped exactly as before.
  if (noDateCandidates.length > 0) {
    const dedupedCandidates = new Map<
      string,
      { ev: any; typeHint: string; fbEventId: string; sourceUrl: string }
    >();
    for (const candidate of noDateCandidates) {
      if (!dedupedCandidates.has(candidate.fbEventId)) {
        dedupedCandidates.set(candidate.fbEventId, candidate);
      }
    }
    const recoveryCandidates = Array.from(dedupedCandidates.values()).slice(
      0,
      DATE_RECOVERY_MAX_PER_METRO
    );

    let dateRecovered = 0;
    for (const candidate of recoveryCandidates) {
      // Already present (recovered via a different sub-query's duplicate, or
      // otherwise accepted) -- skip the redundant fetch.
      if (byEventId.has(`fb:events:${candidate.fbEventId}`)) continue;

      try {
        const page = await fetchFacebookEventPage(candidate.sourceUrl, ADDR_FETCH_TIMEOUT_MS);
        if (page?.startDate) {
          const recoveredItem = buildScrapedItemFromEvent(
            candidate.ev,
            metro,
            candidate.typeHint,
            candidate.fbEventId,
            candidate.sourceUrl,
            page.startDate,
            page.endDate ?? new Date(page.startDate.getTime() + 86_400_000),
            /* dateApproximate */ false,
            'page-fetch-recovery'
          );
          if (recoveredItem) {
            const key = recoveredItem.sourceItemId ?? recoveredItem.sourceUrl;
            if (!byEventId.has(key)) {
              byEventId.set(key, recoveredItem);
              dateRecovered++;
            }
          }
        }
        // page === null or no startDate -- leave dropped, never fabricate.
      } catch (err) {
        console.warn(
          `[FB-Events-Discovery] date-recovery fetch failed for ${candidate.sourceUrl}:`,
          err instanceof Error ? err.message : String(err)
        );
      }

      // Serial throttle between fetches (concurrency 1), same pacing as the
      // address-enrichment pass below.
      await jitterDelay(800, 1500);
    }

    console.log(
      `[FB-Events-Discovery] ${metro.city}, ${metro.state} -- date-recovery: ` +
        `${dateRecovered}/${recoveryCandidates.length} no-date candidates rescued via page-fetch`
    );
  }

  // ------------------------------------------------------------------
  // SECOND PASS (ADR-082 Option A) -- per-event street-address enrichment.
  // Runs over the UNIQUE, post-dedupe events (byEventId.values()) so each event
  // is fetched at most ONCE per run. Gated behind enrichCtx.enabled
  // (FB_EVENTS_ADDRESS_FETCH); when off this whole block is skipped -> zero
  // behavior change. Cap + wall-clock budget are RUN-GLOBAL via the shared
  // enrichCtx. Any per-item failure is swallowed -- enrichment NEVER fails the run.
  if (enrichCtx && enrichCtx.enabled) {
    for (const item of byEventId.values()) {
      // Run-global guards -- shared across all ~43 metro calls this run.
      if (enrichCtx.used >= ADDR_FETCH_MAX_PER_RUN) break;
      if (Date.now() - enrichCtx.startMs > ADDR_FETCH_TIME_BUDGET_MS) break;

      // Already has a real street address -- nothing to upgrade.
      if (looksLikeStreetAddress(item.address)) continue;

      // Fetch-once: skip URLs already enriched/attempted (DB-seeded or this run).
      if (enrichCtx.skipUrls.has(item.sourceUrl)) continue;

      enrichCtx.used++;
      enrichCtx.skipUrls.add(item.sourceUrl);

      // Mark attempted UP FRONT so a re-fetch is never retried -- even if the
      // fetch below returns null or throws (fetch-once semantics persist via
      // scrapedMetadata, which ingest writes verbatim at CREATE time).
      item.scrapedMetadata = {
        ...(item.scrapedMetadata ?? {}),
        addressFetchAttempted: true,
        addressFetchAt: new Date().toISOString(),
      };

      try {
        const page = await fetchFacebookEventPage(item.sourceUrl, ADDR_FETCH_TIMEOUT_MS);

        // GUARDED WRITE-BACK -- only when the page yielded a REAL street address.
        // We only reach here because item.address was NOT already a street, so
        // this can never downgrade an existing street address.
        if (page?.address && looksLikeStreetAddress(page.address)) {
          // QC drop parity with mapEventToScrapedItem's ingest-time reject.
          if (page.state === 'QC' || /\bqu[eé]bec\b/i.test(page.address)) {
            byEventId.delete(item.sourceItemId ?? item.sourceUrl);
          } else {
            item.address = page.address;
            if (page.city) item.city = page.city;
            if (page.state) item.state = page.state;
            item.scrapedMetadata = {
              ...(item.scrapedMetadata ?? {}),
              cityStateSource: 'page-fetch-address',
              geoConfidence: 'high',
              ...(page.country ? { country: page.country } : {}),
            };
          }
        }
      } catch (err) {
        // A single enrichment error never fails the run -- keep city-level.
        console.warn(
          `[FB-Events-Discovery] address enrich failed for ${item.sourceUrl}:`,
          err instanceof Error ? err.message : String(err)
        );
      }

      // Serial throttle between fetches (concurrency 1).
      await jitterDelay(800, 1500);
    }

    console.log(
      `[FB-Events-Discovery] ${metro.city}, ${metro.state} -- address enrichment ` +
        `used ${enrichCtx.used}/${ADDR_FETCH_MAX_PER_RUN} fetches (run-global)`
    );
  }

  return Array.from(byEventId.values());
}
