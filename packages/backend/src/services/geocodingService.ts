/**
 * Geocoding Service — reusable pure function for address → lat/lng resolution.
 * Extracted from geocodeController.ts to be callable outside of HTTP request context.
 *
 * Strategies (in order):
 *   1. Structured Nominatim query (street + city + state + postalcode)
 *   2. Free-text Nominatim query (full address string)
 *   3. US Census Geocoder (authoritative for US addresses)
 *
 * Rate limiting: Nominatim requires ≤1 request per second.
 * The module-level `lastNominatimRequestTime` variable is shared across all callers
 * in the same process, so concurrent callers self-serialize correctly.
 *
 * For high-volume batch operations (>100 addresses), callers MUST add an additional
 * 1100ms delay between calls to avoid breaching Nominatim ToS.
 */

import axios from 'axios';

export interface GeocodedResult {
  lat: number;
  lng: number;
  displayName: string;
  source: 'nominatim-structured' | 'nominatim-freetext' | 'census';
}

// In-memory cache shared with the geocodeController module instance
const geocodeCache = new Map<string, GeocodedResult & { cachedAt: number }>();
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

// Shared rate-limit state for Nominatim (process-scoped)
let lastNominatimRequestTime = 0;
const MIN_NOMINATIM_INTERVAL_MS = 1100;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Canadian (and other non-US) province/territory codes. US Census 400s on these,
// so Strategy 3 is skipped and Nominatim (which covers Canada) is relied upon.
const NON_US_STATE_CODES = new Set([
  'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT',
]);

function isNonUsState(state: string): boolean {
  return NON_US_STATE_CODES.has((state || '').trim().toUpperCase());
}

async function waitForNominatimSlot(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastNominatimRequestTime;
  if (elapsed < MIN_NOMINATIM_INTERVAL_MS) {
    await sleep(MIN_NOMINATIM_INTERVAL_MS - elapsed);
  }
  lastNominatimRequestTime = Date.now();
}

/**
 * Geocode a US address to lat/lng coordinates.
 * Returns null if all three strategies fail.
 *
 * @param address  Street address line (e.g. "123 Main St")
 * @param city     City name
 * @param state    Two-letter state abbreviation
 * @param zip      ZIP code (optional but improves accuracy)
 */
export async function geocodeAddress(
  address: string,
  city: string,
  state: string,
  zip?: string | null
): Promise<GeocodedResult | null> {
  if (!address || !city || !state) return null;

  const fullAddress = `${address}, ${city}, ${state}${zip ? ' ' + zip : ''}`;
  const cacheKey = fullAddress.toLowerCase().trim();

  // Return cached result if fresh
  const cached = geocodeCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    const { cachedAt: _cachedAt, ...result } = cached;
    return result;
  }

  // Strategy 1: Structured Nominatim query
  await waitForNominatimSlot();

  try {
    const response1 = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        street: address,
        city,
        state,
        postalcode: zip || undefined,
        country: 'us',
        format: 'json',
        limit: 1,
      },
      headers: { 'User-Agent': 'FindA.Sale/1.0 (https://finda.sale; support@finda.sale)' },
      timeout: 8000,
    });

    if (response1.data?.length > 0) {
      const result: GeocodedResult = {
        lat: parseFloat(response1.data[0].lat),
        lng: parseFloat(response1.data[0].lon),
        displayName: response1.data[0].display_name,
        source: 'nominatim-structured',
      };
      geocodeCache.set(cacheKey, { ...result, cachedAt: Date.now() });
      return result;
    }
  } catch (err) {
    console.error('[geocodingService] Strategy 1 (Nominatim structured) error:', err instanceof Error ? err.message : err);
  }

  // Strategy 2: Free-text Nominatim query
  await waitForNominatimSlot();

  try {
    const response2 = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: fullAddress,
        format: 'json',
        limit: 1,
        countrycodes: 'us',
      },
      headers: { 'User-Agent': 'FindA.Sale/1.0 (https://finda.sale; support@finda.sale)' },
      timeout: 8000,
    });

    if (response2.data?.length > 0) {
      const result: GeocodedResult = {
        lat: parseFloat(response2.data[0].lat),
        lng: parseFloat(response2.data[0].lon),
        displayName: response2.data[0].display_name,
        source: 'nominatim-freetext',
      };
      geocodeCache.set(cacheKey, { ...result, cachedAt: Date.now() });
      return result;
    }
  } catch (err) {
    console.error('[geocodingService] Strategy 2 (Nominatim free-text) error:', err instanceof Error ? err.message : err);
  }

  // Strategy 3: US Census Geocoder (US-only — skip for Canadian/non-US states,
  // and skip when there's no street — the Census structured /address endpoint
  // requires `street` and 400s outright without it, rather than returning an
  // empty match list. Confirmed via live Railway logs 2026-07-20 (mirrors the
  // same fix in geocodeBacklogJob.ts's copy of this strategy chain).
  if (isNonUsState(state) || !(address || '').trim()) {
    return null;
  }
  try {
    const censusResponse = await axios.get('https://geocoding.geo.census.gov/geocoder/locations/address', {
      params: {
        street: address,
        city,
        state,
        zip: zip || undefined,
        benchmark: 'Public_AR_Current',
        format: 'json',
      },
      timeout: 8000,
    });

    const matches = censusResponse.data?.result?.addressMatches;
    if (matches?.length > 0) {
      const match = matches[0];
      const result: GeocodedResult = {
        lat: match.coordinates.y,
        lng: match.coordinates.x,
        displayName: match.matchedAddress,
        source: 'census',
      };
      geocodeCache.set(cacheKey, { ...result, cachedAt: Date.now() });
      return result;
    }
  } catch (err) {
    console.error('[geocodingService] Strategy 3 (Census) error:', err instanceof Error ? err.message : err);
  }

  // All strategies failed
  return null;
}

/**
 * ADR-091: Geocode a city+state CENTROID -- distinct from geocodeAddress() above,
 * which requires a street and returns null immediately without one (Strategy 3/Census
 * 400s on address-less structured queries). Used to resolve a page's city-slug
 * (e.g. "foley-al" -> "Foley", "AL") to a lat/lng so /sales/by-city can run a radius
 * query. Reuses this module's shared Nominatim rate-limiter (waitForNominatimSlot) --
 * do not add a second one. Callers are expected to persist the result (CityCoordinate
 * table) since this function does not use the module's in-memory geocodeCache -- a city
 * centroid should be looked up once, ever, not re-fetched every 7 days.
 *
 * 2026-07-28 -- COUNTRY ROUTING + RESULT VALIDATION (this was silently poisoning the
 * CityCoordinate cache, not merely failing):
 * Both queries below used to hard-code the United States (`country: 'us'` /
 * `countrycodes: 'us'`). Sale.city/state legitimately contains Canadian rows
 * (Ontario and British Columbia -- "mississauga-on" alone had 152 active sales), and
 * Nominatim does not return "no match" for those. It returns the nearest US string
 * match instead, which the caller then persisted as an authoritative centroid.
 * Measured against production on 2026-07-28, ALL NINE non-US CityCoordinate rows held
 * US coordinates:
 *     toronto-on   -> 39.906,-86.224  (Toronto, INDIANA)
 *     vancouver-bc -> 45.631,-122.674 (Vancouver, WASHINGTON)
 *     victoria-bc  -> 28.800,-97.006  (Victoria, TEXAS)
 *     richmond-bc  -> 37.539,-77.434  (Richmond, VIRGINIA)
 * The by-city radius query then searched 35 miles around Indiana and reported
 * `matchMode: 'radius'`, so the page looked healthy while returning nothing.
 * The same failure mode is reachable for US slugs via the free-text fallback, which
 * matched STREETS in the wrong state ("Nanaimo, BC" -> "Nanaimo Crescent, Florida";
 * "Markham, ON" -> "Markham Street, Shreveport, Louisiana").
 *
 * Two fixes, both here:
 *   1. Route the country filter off the state code (the NON_US_STATE_CODES set this
 *      module already declares) instead of assuming US.
 *   2. Request `addressdetails=1` and REJECT any result whose country -- or whose
 *      state/province, when both sides are known -- disagrees with what was asked for.
 * Rejecting yields null, which the caller already handles (it falls back to exact
 * city-string matching). A null is recoverable; a confidently-wrong centroid is not.
 */

// Full names as Nominatim reports them in `address.state`, keyed by the two-letter
// code that appears in a city slug. Used to reject mismatched results. An unknown
// code is treated as not_found up front by geocodeCityStateInternal (see below) --
// it no longer reaches cityResultMatchesRegion at all, closing the gap where an
// unrecognized code used to skip the state check entirely.
const US_STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  PR: 'Puerto Rico', VI: 'United States Virgin Islands', GU: 'Guam',
};

const CA_PROVINCE_NAMES: Record<string, string> = {
  AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', NT: 'Northwest Territories',
  NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Quebec',
  SK: 'Saskatchewan', YT: 'Yukon',
};

/** Accent- and case-insensitive compare ("Quebec" vs Nominatim's "Quebec"/"Quebec"). */
function normalizeRegionName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]+/g, ' ')
    .trim();
}

/** Expected full region name for a two-letter code, or null if the code is unknown. */
function expectedRegionName(state: string): string | null {
  const code = (state || '').trim().toUpperCase();
  return CA_PROVINCE_NAMES[code] ?? US_STATE_NAMES[code] ?? null;
}

/**
 * Reject a Nominatim hit that resolved to a different country or a different
 * state/province than the one asked for. Both checks are skipped when the data
 * needed to make them isn't present, so this can only reject on positive evidence
 * of a mismatch -- it never turns a good result into a null on a technicality.
 */
function cityResultMatchesRegion(
  result: any,
  state: string,
  expectedCountryCode: 'us' | 'ca'
): boolean {
  const address = result?.address;
  const countryCode = String(address?.country_code ?? '').toLowerCase();
  if (countryCode && countryCode !== expectedCountryCode) return false;

  const expected = expectedRegionName(state);
  const actual = address?.state ?? address?.province ?? address?.territory ?? address?.region;
  if (expected && typeof actual === 'string' && actual.trim()) {
    if (normalizeRegionName(actual) !== normalizeRegionName(expected)) return false;
  }
  return true;
}

export interface GeocodeCityStateResult {
  result: GeocodedResult | null;
  /**
   * ADR (2026-09-24, fake-city soft-404 fix, `/sales/by-city`):
   * - 'ok'        — a match was found and accepted.
   * - 'not_found' — the geocoder ran cleanly (no thrown/network error on
   *                 every attempt made) and confirmed no matching place, OR
   *                 the state/province code isn't one we recognize at all
   *                 (see the up-front check below -- an unrecognized code
   *                 used to SKIP the region check entirely and let a
   *                 same-named city in the wrong/nonexistent region through).
   * - 'error'     — at least one geocoder attempt threw (network error,
   *                 timeout, non-2xx) and no match was found on any attempt
   *                 -- we don't actually know whether the place exists.
   * Callers that need to tell "definitely not a real place" apart from
   * "the geocoder itself is having a bad day" (so they don't turn a
   * transient outage into a false 404) should use this, not the plain
   * `geocodeCityState` wrapper below, which only preserves the old
   * `GeocodedResult | null` contract for its existing caller.
   */
  status: 'ok' | 'not_found' | 'error';
}

async function geocodeCityStateInternal(city: string, state: string): Promise<GeocodeCityStateResult> {
  if (!city || !state) return { result: null, status: 'not_found' };

  // An unrecognized state/province code can never be positively confirmed as
  // a real region, so treat it as not_found up front rather than reaching
  // Nominatim at all. Previously this case fell through to
  // cityResultMatchesRegion(), which SKIPPED the region check entirely for an
  // unknown `expected` name -- meaning a fake state code (e.g. "zz") could
  // still accept a same-named city hit from an unrelated real region and
  // radius-match against it. See cityResultMatchesRegion below.
  if (!expectedRegionName(state)) {
    return { result: null, status: 'not_found' };
  }

  // Route the country filter off the state code rather than assuming US.
  const countryCode: 'us' | 'ca' = isNonUsState(state) ? 'ca' : 'us';
  let sawError = false;

  await waitForNominatimSlot();

  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        city,
        state,
        country: countryCode,
        format: 'json',
        addressdetails: 1,
        limit: 1,
      },
      headers: { 'User-Agent': 'FindA.Sale/1.0 (https://finda.sale; support@finda.sale)' },
      timeout: 8000,
    });

    const hit = response.data?.[0];
    if (hit) {
      if (cityResultMatchesRegion(hit, state, countryCode)) {
        return {
          result: {
            lat: parseFloat(hit.lat),
            lng: parseFloat(hit.lon),
            displayName: hit.display_name,
            source: 'nominatim-structured',
          },
          status: 'ok',
        };
      }
      console.warn(
        `[geocodingService] geocodeCityState rejected off-region structured hit for "${city}, ${state}": ${hit.display_name}`
      );
    }
  } catch (err) {
    sawError = true;
    console.error('[geocodingService] geocodeCityState structured error:', err instanceof Error ? err.message : err);
  }

  // Free-text fallback (covers small towns Nominatim's structured city/state
  // params sometimes miss, e.g. unincorporated places). This is the strategy that
  // matched wrong-state STREETS, so the same region validation applies.
  await waitForNominatimSlot();

  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: `${city}, ${state}`,
        format: 'json',
        addressdetails: 1,
        limit: 1,
        countrycodes: countryCode,
      },
      headers: { 'User-Agent': 'FindA.Sale/1.0 (https://finda.sale; support@finda.sale)' },
      timeout: 8000,
    });

    const hit = response.data?.[0];
    if (hit) {
      if (cityResultMatchesRegion(hit, state, countryCode)) {
        return {
          result: {
            lat: parseFloat(hit.lat),
            lng: parseFloat(hit.lon),
            displayName: hit.display_name,
            source: 'nominatim-freetext',
          },
          status: 'ok',
        };
      }
      console.warn(
        `[geocodingService] geocodeCityState rejected off-region free-text hit for "${city}, ${state}": ${hit.display_name}`
      );
    }
  } catch (err) {
    sawError = true;
    console.error('[geocodingService] geocodeCityState free-text error:', err instanceof Error ? err.message : err);
  }

  return { result: null, status: sawError ? 'error' : 'not_found' };
}

/**
 * Full result + status. Use this for any caller that needs to distinguish a
 * confirmed-nonexistent place from a geocoder outage (e.g. `/sales/by-city`,
 * which surfaces this as `geocoderStatus` so the frontend can 404 only on a
 * genuine not_found, never on a transient error).
 */
export async function geocodeCityStateWithStatus(city: string, state: string): Promise<GeocodeCityStateResult> {
  return geocodeCityStateInternal(city, state);
}

/**
 * Backward-compatible wrapper preserving the original `GeocodedResult | null`
 * contract (used by jobs/cityCoordinateBackfillJob.ts, which doesn't need the
 * not_found/error distinction -- it just retries next run either way).
 */
export async function geocodeCityState(city: string, state: string): Promise<GeocodedResult | null> {
  const { result } = await geocodeCityStateInternal(city, state);
  return result;
}
