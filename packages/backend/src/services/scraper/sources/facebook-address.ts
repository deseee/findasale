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
