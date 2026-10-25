/**
 * Facebook Events — shared address + geo helpers (PURE, no network).
 *
 * Single source of truth for:
 *   - looksLikeStreetAddress()      real-street-address guard (house-number lead)
 *   - deriveCityStateFromDisplay()  true US/CA city+state from a display string
 *   - extractPlaceFromEventObject() street address + geo from an FB Event object
 *
 * Extracted from facebook-events-discovery.ts (ADR-082) so the per-event
 * page-fetch enrichment path (facebook-events-page-fetch.ts) can REUSE the exact
 * same guard/derivation logic without a module import cycle (page-fetch <->
 * discovery <-> search). Behaviour is byte-identical to the discovery originals;
 * discovery now imports these from here.
 */

// US state + DC 2-letter codes -- validates a candidate token so we never treat
// "US", "Rd", "St" etc. as a state.
export const US_STATE_CODES = new Set([
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
export const CA_PROVINCE_CODES = new Set([
  'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT',
]);

// Spelled-out US state / Canadian province names -> 2-letter code. Used ONLY as
// a fallback after the 2-letter-code pass finds nothing, for display strings
// like "Millersville, Maryland" or "Red Oak, Texas 75154" (seen live on the
// 2026-10-25 retest run: these previously fell through to the query-metro
// city/state and were stored under the wrong metro). Quebec maps to QC so it is
// still DETECTED (and rejected at ingest), never silently relabelled.
export const US_STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY', 'district of columbia': 'DC',
};

export const CA_PROVINCE_NAME_TO_CODE: Record<string, string> = {
  alberta: 'AB', 'british columbia': 'BC', manitoba: 'MB', 'new brunswick': 'NB',
  'newfoundland and labrador': 'NL', newfoundland: 'NL', 'nova scotia': 'NS',
  'northwest territories': 'NT', nunavut: 'NU', ontario: 'ON',
  'prince edward island': 'PE', quebec: 'QC', 'qu\u00e9bec': 'QC',
  saskatchewan: 'SK', yukon: 'YT',
};

/**
 * Normalise a region value (2-letter code OR spelled-out name, any case) to a
 * 2-letter US state / CA province code plus its country. Returns null for
 * anything else (UK counties, junk), so callers never write a non-code state.
 * Pure + exported for unit testing.
 */
export function normalizeRegionCode(
  value: string | undefined | null
): { code: string; country: 'US' | 'CA' } | null {
  if (!value || typeof value !== 'string') return null;
  const t = value.trim();
  if (!t) return null;
  const upper = t.toUpperCase();
  if (US_STATE_CODES.has(upper)) return { code: upper, country: 'US' };
  if (CA_PROVINCE_CODES.has(upper)) return { code: upper, country: 'CA' };
  const lower = t.toLowerCase().replace(/\s+/g, ' ');
  if (US_STATE_NAME_TO_CODE[lower]) return { code: US_STATE_NAME_TO_CODE[lower], country: 'US' };
  if (CA_PROVINCE_NAME_TO_CODE[lower]) return { code: CA_PROVINCE_NAME_TO_CODE[lower], country: 'CA' };
  return null;
}

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
// Street-suffix words used to split "<street> <city>" when an organizer typed
// no comma between them ("3303 Sturbridge Ln Sugar Land, TX 77479").
const CITY_STREET_SPLIT_RE =
  /^\d.*?\b(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|boulevard|ct|court|way|pl|place|cir|circle|hwy|highway|pkwy|parkway|trl|trail|ter|terrace|loop|pike)\.?(?:\s+(?:n|s|e|w|ne|nw|se|sw)\b\.?)?\s+([A-Za-z][A-Za-z .'\u2019-]*)$/i;

/**
 * Return a usable city from the comma token before the state. A token that
 * leads with a digit is a street line, not a city: on the 2026-10-25 retest
 * "3303 Sturbridge Ln Sugar Land" was stored as the CITY. Split off the street
 * at its last suffix word ("Sugar Land"); if that is not possible return null
 * so the caller does not store a street as a city. Pure + exported for tests.
 */
export function cleanCityToken(token: string): string | null {
  const t = (token || '').trim();
  if (!t) return null;
  if (!/^\d/.test(t)) return t;
  const m = t.match(CITY_STREET_SPLIT_RE);
  return m ? m[1].trim() : null;
}

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
      const city = cleanCityToken(tokens[i - 1]);
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
      const city = cleanCityToken(tokens[i - 1]);
      if (city) return { city, state: ca[1], country: 'CA' };
    }
  }
  // Fallback (2026-10-25): spelled-out state/province name as its own comma
  // token, optionally followed by a ZIP / postal code -- "Millersville,
  // Maryland", "Red Oak, Texas 75154", "South Boston, Virginia". Runs only when
  // no 2-letter code was found above, so it never changes an existing match.
  // The city token must not lead with a digit (that would be a street line).
  for (let i = 1; i < tokens.length; i++) {
    const m = tokens[i].match(/^([A-Za-z\u00e9 .]+?)(?:\s+(?:\d{5}(?:-\d{4})?|[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d))?$/);
    if (!m) continue;
    const region = normalizeRegionCode(m[1]);
    // Only spelled-out names here -- a bare 2-letter token was already
    // handled (or deliberately rejected) by the code pass above.
    if (!region || m[1].trim().length <= 2) continue;
    const city = cleanCityToken(tokens[i - 1]);
    if (city) return { city, state: region.code, country: region.country };
  }
  return null;
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
  // Must lead with a house number (1-6 digits) then a street-name token that is
  // either an alphabetic word ("Linden", "West") OR a numbered street
  // ("72nd", "3rd", "42nd") -- numbered streets/avenues are extremely common
  // in US addresses. Rejects "Dunlay tx", "TBD - Fairfax Vermont", "35951",
  // "2130 72" (house + bare number); accepts "1356 West Sweden Rd",
  // "36 Linden St", "2130 72nd Street Circle W", "100 3rd Ave".
  return /^\d{1,6}\s+(?:[A-Za-z]|\d{1,3}(?:st|nd|rd|th)\b)/i.test(t);
}

/**
 * Result of pulling location data out of a single FB Event object's
 * `event_place`. `address` is populated ONLY when a FreeformPlace display string
 * passes looksLikeStreetAddress(); otherwise that raw text is preserved in
 * `rawPlaceText` (never dropped) for downstream cleanup. `city`/`state` are the
 * REAL values derived from the address/label when resolvable; `country` is set
 * only when derived from a parsed US/CA address.
 */
export interface DerivedPlace {
  address: string;
  city?: string;
  state?: string;
  country?: 'US' | 'CA';
  rawPlaceText: string;
}

/**
 * Pull the street address + true city/state/country out of one FB Event object's
 * `event_place`, applying the same FreeformPlace + guard logic the discovery path
 * uses. PURE. Never throws. Returns empty `address` (with any raw text preserved
 * in `rawPlaceText`) when no real street address is present.
 *
 * Used by the per-event page-fetch enrichment (facebook-events-page-fetch.ts):
 * the individual event PAGE embeds the same Event JSON as the search surface, and
 * its FreeformPlace.contextual_name frequently carries the FULL street address
 * even when the lean search-result object only had a city-level Page label.
 */
export function extractPlaceFromEventObject(ev: any): DerivedPlace {
  const out: DerivedPlace = { address: '', rawPlaceText: '' };
  const place = ev?.event_place;
  if (!place || typeof place !== 'object') return out;

  // Structured city/state when the richer object carries them.
  if (typeof place.city === 'string' && place.city.trim()) out.city = place.city.trim();
  if (typeof place.state === 'string' && place.state.trim()) out.state = place.state.trim();

  const display =
    (typeof place.contextual_name === 'string' && place.contextual_name) ||
    (typeof place.name === 'string' && place.name) ||
    '';

  // Derive the REAL city/state/country from the display string when the
  // structured fields were absent/incomplete. Only overrides when we have a
  // confident US/CA code; otherwise leaves whatever structured value existed.
  if (!out.city || !out.state) {
    const derived = deriveCityStateFromDisplay(display);
    if (derived) {
      out.city = derived.city;
      out.state = derived.state;
      out.country = derived.country;
    }
  }

  // Street address ONLY from a FreeformPlace whose display is a real street
  // string. A Page event_place carries only a city/region label -- never an
  // address -- so it must never populate the address field.
  if (place.__typename === 'FreeformPlace' && display.trim()) {
    const candidate = display.trim();
    if (looksLikeStreetAddress(candidate)) {
      out.address = candidate;
    } else {
      out.rawPlaceText = candidate;
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Page-location sanity guards (2026-10-25, run 40232424379)
// ---------------------------------------------------------------------------
//
// Root cause of that run's bad rows was the page-fetch taking the place of a
// "suggested / nearby" event (chosen by FB from the PROXY's IP geolocation)
// instead of the target event -- fixed at the source in
// facebook-events-page-fetch.ts. These guards are defence in depth: they reject
// a page location that contradicts the event's own title, or that is the
// proxy's own geolocation for an event discovered in another state.

/**
 * US states / CA provinces explicitly named in an event title, as 2-letter
 * codes. Conservative to avoid false positives from ordinary words ("IN",
 * "OK", "ME", "OR"): a 2-letter code counts only after a comma (", TX",
 * ", Tx") or uppercase directly before a ZIP ("TX 75043"); a spelled-out name
 * only after a comma or before a ZIP (", Texas", "Texas 76648"). Pure.
 *   "Estate Sale 407 NE 6th Street Hubbard, Texas 76648" -> ["TX"]
 *   "Estate Sale | October 29–31 | Orange, TX"           -> ["TX"]
 *   "Estate Sale! Rochester, Tx"                          -> ["TX"]
 *   "Yard Sale" / "Garage Sale Trail"                     -> []
 */
export function extractStatesFromTitle(title: string | undefined | null): string[] {
  const out = new Set<string>();
  if (!title || typeof title !== 'string') return [];
  const isRegion = (c: string): boolean => US_STATE_CODES.has(c) || CA_PROVINCE_CODES.has(c);

  // ", TX" / ", Tx" -- followed by end, whitespace, a ZIP or separator punctuation
  // (not "?" / "!" / a letter, so "Sale, OK?" or ", Inc" never match).
  const commaCode = /,\s*([A-Za-z]{2})(?=$|\s|\d|[)\]|\-–—.,;:\/])/g;
  let m: RegExpExecArray | null;
  while ((m = commaCode.exec(title)) !== null) {
    const c = m[1].toUpperCase();
    if (isRegion(c)) out.add(c);
  }
  // "TX 75043" (uppercase only)
  const zipCode = /\b([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/g;
  while ((m = zipCode.exec(title)) !== null) {
    if (isRegion(m[1])) out.add(m[1]);
  }
  // Spelled-out names after a comma (ending the place) or before a ZIP.
  const lower = title.toLowerCase();
  const names: Array<[string, string]> = [
    ...Object.entries(US_STATE_NAME_TO_CODE),
    ...Object.entries(CA_PROVINCE_NAME_TO_CODE),
  ];
  for (const [name, code] of names) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // ", Texas" must END the place (end / ZIP / punctuation) so ", Washington
    // Ave" or ", Kansas City" never count as a state.
    const re = new RegExp(
      `(?:,\\s*${esc}(?=\\s*(?:$|\\d{5}|[)\\]|\\-\u2013\u2014.,;:!\\/]))|\\b${esc}\\s+\\d{5}\\b)`,
      'i'
    );
    if (re.test(lower)) out.add(code);
  }
  return Array.from(out);
}

/**
 * Known geolocation(s) of the Cloudflare page-fetch proxy egress, as
 * "City, ST". FB fills logged-out event pages with suggested events near the
 * viewer; through the proxy those are Roseville / Saint Paul MN (observed on
 * run 40232424379). Override with FB_EVENTS_PROXY_GEO ("City, ST; City, ST").
 */
export const DEFAULT_PROXY_GEO = ['Roseville, MN', 'Saint Paul, MN'];

function normCity(c: string): string {
  return c
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/^saint\s+/, 'st ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getProxyGeoList(env: string | undefined = process.env.FB_EVENTS_PROXY_GEO): string[] {
  const raw = (env || '').trim();
  if (!raw) return DEFAULT_PROXY_GEO;
  return raw.split(';').map((s) => s.trim()).filter(Boolean);
}

/** True when (city, state) equals one of the proxy's known geolocations. Pure. */
export function isProxyGeo(
  city: string | undefined | null,
  state: string | undefined | null,
  list: string[] = getProxyGeoList()
): boolean {
  if (!city || !state) return false;
  const st = normalizeRegionCode(state)?.code;
  if (!st) return false;
  const c = normCity(city);
  return list.some((entry) => {
    const idx = entry.lastIndexOf(',');
    if (idx === -1) return false;
    return normCity(entry.slice(0, idx)) === c && normalizeRegionCode(entry.slice(idx + 1))?.code === st;
  });
}

export type PageLocationRejection =
  | 'title-state-conflict'
  | 'proxy-geo'
  | 'confirmed-state-conflict';

/**
 * Decide whether an event page's location must NOT be applied to an item.
 * Pure + exported for unit testing. Returns null when the page location is
 * acceptable (or carries no city/state to judge).
 *   - title-state-conflict: the title names a state/province and the page's
 *     state is not one of them ("... Orange, TX" vs Roseville MN).
 *   - proxy-geo: the page city/state is the proxy's own geolocation and the
 *     event was discovered for a metro in a different state.
 *   - confirmed-state-conflict: the item's city/state is already confirmed from
 *     the event itself and the page names a different state.
 */
export function pageLocationRejection(
  item: { title?: string; city?: string; state?: string; scrapedMetadata?: Record<string, any> | null },
  page: { city?: string; state?: string; address?: string } | null | undefined,
  proxyGeo: string[] = getProxyGeoList()
): PageLocationRejection | null {
  if (!page) return null;
  let pageState = normalizeRegionCode(page.state)?.code;
  let pageCity = typeof page.city === 'string' ? page.city.trim() : '';
  if ((!pageState || !pageCity) && page.address) {
    const d = deriveCityStateFromDisplay(page.address);
    if (d) {
      pageState = pageState || d.state;
      pageCity = pageCity || d.city;
    }
  }
  if (!pageState) return null;

  const titleStates = extractStatesFromTitle(item.title);
  if (titleStates.length > 0 && !titleStates.includes(pageState)) return 'title-state-conflict';

  const md = item.scrapedMetadata ?? {};
  if (pageCity && isProxyGeo(pageCity, pageState, proxyGeo)) {
    const metroState = normalizeRegionCode(
      typeof md.metro === 'string' ? md.metro.split(',').pop() : undefined
    )?.code;
    if (!titleStates.includes(pageState) && metroState !== pageState) return 'proxy-geo';
  }

  const confirmed =
    !!item.city &&
    !!item.state &&
    !!md.cityStateSource &&
    md.cityStateSource !== 'metro-fallback' &&
    md.geoConfidence !== 'unresolved' &&
    md.geoConfidence !== 'metro-fallback';
  if (confirmed) {
    const itemState = normalizeRegionCode(item.state)?.code;
    if (itemState && itemState !== pageState) return 'confirmed-state-conflict';
  }
  return null;
}
