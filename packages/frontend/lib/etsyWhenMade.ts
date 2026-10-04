/**
 * lib/etsyWhenMade.ts -- frontend mirror of Etsy's `when_made` era enum (ADR-135 D3.3, batch E-B5).
 *
 * DUPLICATION NOTE: the single source of truth is packages/backend/src/config/etsyWhenMade.ts. The
 * frontend package may not import from the backend package, so the table is copied here.
 * lib/__tests__/etsyWhenMade.test.ts pins the 19 values and compares this file to the backend file
 * whenever the backend source is present, so drift fails the test. Etsy rotates the enum each January
 * (ADR live test T16): when the backend table changes, change this one in the same commit.
 *
 * Pure module: no imports, no env reads and NO clock reads. Callers pass `asOfYear`.
 */

export interface EtsyEraOption {
  /** Exact string Etsy accepts for `when_made`. */
  value: string;
  /** Organizer-facing label. */
  label: string;
  /** Latest year an item in this period could have been made; null for made-to-order. */
  maxYear: number | null;
}

/** Minimum age in years for Etsy's vintage allowlist (Etsy Creativity Standards). */
export const ETSY_VINTAGE_MIN_AGE_YEARS = 20;

/** All 19 values, in the order the Etsy spec lists them. */
export const ETSY_ERA_OPTIONS: readonly EtsyEraOption[] = [
  { value: 'made_to_order', label: 'Made to order', maxYear: null },
  { value: '2020_2026', label: '2020 to 2026', maxYear: 2026 },
  { value: '2010_2019', label: '2010 to 2019', maxYear: 2019 },
  { value: '2007_2009', label: '2007 to 2009', maxYear: 2009 },
  { value: 'before_2007', label: 'Before 2007', maxYear: 2006 },
  { value: '2000_2006', label: '2000 to 2006', maxYear: 2006 },
  { value: '1990s', label: '1990s', maxYear: 1999 },
  { value: '1980s', label: '1980s', maxYear: 1989 },
  { value: '1970s', label: '1970s', maxYear: 1979 },
  { value: '1960s', label: '1960s', maxYear: 1969 },
  { value: '1950s', label: '1950s', maxYear: 1959 },
  { value: '1940s', label: '1940s', maxYear: 1949 },
  { value: '1930s', label: '1930s', maxYear: 1939 },
  { value: '1920s', label: '1920s', maxYear: 1929 },
  { value: '1910s', label: '1910s', maxYear: 1919 },
  { value: '1900s', label: '1900s', maxYear: 1909 },
  { value: '1800s', label: '1800s', maxYear: 1899 },
  { value: '1700s', label: '1700s', maxYear: 1799 },
  { value: 'before_1700', label: 'Before 1700', maxYear: 1699 },
];

/** Items made in this year or earlier qualify for the vintage allowlist. */
export function etsyVintageCutoffYear(asOfYear: number, minAgeYears: number = ETSY_VINTAGE_MIN_AGE_YEARS): number {
  return asOfYear - minAgeYears;
}

export function getEtsyEra(value: string | null | undefined): EtsyEraOption | undefined {
  if (typeof value !== 'string') return undefined;
  return ETSY_ERA_OPTIONS.find((e) => e.value === value);
}

/** True when the whole period is old enough (unknown values and made-to-order are false). */
export function etsyEraQualifies(value: string | null | undefined, asOfYear: number): boolean {
  const era = getEtsyEra(value);
  if (!era || era.maxYear === null) return false;
  return era.maxYear <= etsyVintageCutoffYear(asOfYear);
}

/**
 * The era list the picker offers. Craft and party supplies can be any age, so they get the FULL
 * list. Everything else gets only the periods whose whole range is old enough as of `asOfYear`.
 */
export function etsyEraOptionsFor(isSupply: boolean, asOfYear: number): EtsyEraOption[] {
  if (isSupply) return ETSY_ERA_OPTIONS.slice();
  return ETSY_ERA_OPTIONS.filter((e) => etsyEraQualifies(e.value, asOfYear));
}

/** Keeps the current choice only if it is still offered (used when the supply box is ticked or cleared). */
export function reconcileEra(current: string, options: readonly EtsyEraOption[]): string {
  return options.some((o) => o.value === current) ? current : '';
}
