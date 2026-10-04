/*
 * etsyWhenMade.ts -- single source of truth for Etsy's `when_made` era enum (ADR-135 D3.3 / D4.2,
 * batch E-B2). Dependency-free on purpose (same shape as ebayCategories.ts): no imports, no env
 * reads, no clock reads at module load, so the eligibility registry, the Etsy mapper and the
 * organizer-facing era picker can all import it without side effects.
 *
 * SPEC EVIDENCE (confirmed 2026-10-03 by downloading
 * https://www.etsy.com/openapi/generated/oas/3.0.0.json, info.version 3.0.0, operation
 * createDraftListing, request body application/x-www-form-urlencoded):
 *   when_made enum (19 values, in spec order): made_to_order, 2020_2026, 2010_2019, 2007_2009,
 *     before_2007, 2000_2006, 1990s, 1980s, 1970s, 1960s, 1950s, 1940s, 1930s, 1920s, 1910s,
 *     1900s, 1800s, 1700s, before_1700.
 *   who_made enum: i_did, someone_else, collective.
 *   type enum: physical, download, both.
 *   is_supply: boolean; "Requires who_made and when_made".
 * Etsy rotates this enum (the newest bucket names the current year range). ADR-135 live test T16:
 * every January, re-download the spec and diff the enum against ETSY_WHEN_MADE below. Any Etsy 400
 * that mentions when_made is also a signal that this table is stale.
 *
 * `maxYear` is the latest calendar year an item in that bucket could have been made, i.e. the
 * year the eligibility rule compares to (asOfYear - minAgeYears). A bucket qualifies for the Etsy
 * "20 or more years old" allowlist only when its WHOLE range is old enough (maxYear <= cutoff), so
 * a bucket that straddles the cutoff never qualifies. made_to_order is current production, so it
 * has no maxYear and never qualifies.
 *
 * `qualifiesAsVintage` is the ADR's static subset for 2026 (cutoff 2006) and is informational,
 * for building a UI picker. The rule itself never reads it; it recomputes from maxYear and the
 * current year, so the cutoff moves every January without a code change.
 */

export type EtsyWhenMadeValue =
  | 'made_to_order'
  | '2020_2026'
  | '2010_2019'
  | '2007_2009'
  | 'before_2007'
  | '2000_2006'
  | '1990s'
  | '1980s'
  | '1970s'
  | '1960s'
  | '1950s'
  | '1940s'
  | '1930s'
  | '1920s'
  | '1910s'
  | '1900s'
  | '1800s'
  | '1700s'
  | 'before_1700';

export interface EtsyWhenMadeEntry {
  /** Exact string Etsy accepts for `when_made`. */
  value: EtsyWhenMadeValue;
  /** Organizer-facing label for the era picker. */
  label: string;
  /** Latest year an item in this bucket could have been made; null for made_to_order. */
  maxYear: number | null;
  /** ADR-135 D3.3 subset for 2026 (maxYear <= 2006). Informational only, see file header. */
  qualifiesAsVintage: boolean;
}

/** Minimum age in years for Etsy's vintage allowlist (Etsy Creativity Standards: 20+ years old). */
export const ETSY_VINTAGE_MIN_AGE_YEARS = 20;

export const ETSY_WHEN_MADE: readonly EtsyWhenMadeEntry[] = [
  { value: 'made_to_order', label: 'Made to order', maxYear: null, qualifiesAsVintage: false },
  { value: '2020_2026', label: '2020 to 2026', maxYear: 2026, qualifiesAsVintage: false },
  { value: '2010_2019', label: '2010 to 2019', maxYear: 2019, qualifiesAsVintage: false },
  { value: '2007_2009', label: '2007 to 2009', maxYear: 2009, qualifiesAsVintage: false },
  { value: 'before_2007', label: 'Before 2007', maxYear: 2006, qualifiesAsVintage: true },
  { value: '2000_2006', label: '2000 to 2006', maxYear: 2006, qualifiesAsVintage: true },
  { value: '1990s', label: '1990s', maxYear: 1999, qualifiesAsVintage: true },
  { value: '1980s', label: '1980s', maxYear: 1989, qualifiesAsVintage: true },
  { value: '1970s', label: '1970s', maxYear: 1979, qualifiesAsVintage: true },
  { value: '1960s', label: '1960s', maxYear: 1969, qualifiesAsVintage: true },
  { value: '1950s', label: '1950s', maxYear: 1959, qualifiesAsVintage: true },
  { value: '1940s', label: '1940s', maxYear: 1949, qualifiesAsVintage: true },
  { value: '1930s', label: '1930s', maxYear: 1939, qualifiesAsVintage: true },
  { value: '1920s', label: '1920s', maxYear: 1929, qualifiesAsVintage: true },
  { value: '1910s', label: '1910s', maxYear: 1919, qualifiesAsVintage: true },
  { value: '1900s', label: '1900s', maxYear: 1909, qualifiesAsVintage: true },
  { value: '1800s', label: '1800s', maxYear: 1899, qualifiesAsVintage: true },
  { value: '1700s', label: '1700s', maxYear: 1799, qualifiesAsVintage: true },
  { value: 'before_1700', label: 'Before 1700', maxYear: 1699, qualifiesAsVintage: true },
];

/** Etsy `who_made` enum (spec-confirmed). v1 only ever sends ETSY_WHO_MADE_DEFAULT (ADR-135 D-9). */
export const ETSY_WHO_MADE_VALUES = ['i_did', 'someone_else', 'collective'] as const;
export type EtsyWhoMade = (typeof ETSY_WHO_MADE_VALUES)[number];
export const ETSY_WHO_MADE_DEFAULT: EtsyWhoMade = 'someone_else';

/** Look up an era by its exact Etsy value. Unknown or empty input returns undefined. */
export function getEtsyWhenMade(value: string | null | undefined): EtsyWhenMadeEntry | undefined {
  if (typeof value !== 'string') return undefined;
  return ETSY_WHEN_MADE.find((e) => e.value === value);
}

/** Cutoff year for the vintage allowlist: items made in this year or earlier qualify. */
export function etsyVintageCutoffYear(asOfYear: number, minAgeYears: number = ETSY_VINTAGE_MIN_AGE_YEARS): number {
  return asOfYear - minAgeYears;
}

/**
 * True when `value` is a known Etsy era whose whole range is at least `minAgeYears` old as of
 * `asOfYear`. Unknown values, empty values and made_to_order are false (allowlist posture).
 */
export function etsyWhenMadeQualifies(
  value: string | null | undefined,
  asOfYear: number,
  minAgeYears: number = ETSY_VINTAGE_MIN_AGE_YEARS
): boolean {
  const entry = getEtsyWhenMade(value);
  if (!entry || entry.maxYear === null) return false;
  return entry.maxYear <= etsyVintageCutoffYear(asOfYear, minAgeYears);
}
