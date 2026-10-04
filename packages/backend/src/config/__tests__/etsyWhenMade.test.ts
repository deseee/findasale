/**
 * ADR-135 batch E-B2: config/etsyWhenMade.ts is the single source of truth for Etsy's when_made
 * enum. The expected list below is the enum confirmed from Etsy's OpenAPI spec (info.version 3.0.0,
 * createDraftListing) on 2026-10-03; a mismatch here is the January re-check (ADR-135 T16).
 */

import {
  ETSY_VINTAGE_MIN_AGE_YEARS,
  ETSY_WHEN_MADE,
  ETSY_WHO_MADE_DEFAULT,
  ETSY_WHO_MADE_VALUES,
  etsyVintageCutoffYear,
  etsyWhenMadeQualifies,
  getEtsyWhenMade,
} from '../etsyWhenMade';

const SPEC_WHEN_MADE = [
  'made_to_order', '2020_2026', '2010_2019', '2007_2009', 'before_2007', '2000_2006',
  '1990s', '1980s', '1970s', '1960s', '1950s', '1940s', '1930s', '1920s', '1910s', '1900s',
  '1800s', '1700s', 'before_1700',
];

describe('ETSY_WHEN_MADE', () => {
  it('lists exactly the 19 spec values, in spec order, with no duplicates', () => {
    expect(ETSY_WHEN_MADE.map((e) => e.value)).toEqual(SPEC_WHEN_MADE);
    expect(new Set(ETSY_WHEN_MADE.map((e) => e.value)).size).toBe(19);
  });

  it('every entry has a label, and maxYear is null only for made_to_order', () => {
    for (const e of ETSY_WHEN_MADE) {
      expect(e.label.length).toBeGreaterThan(0);
      if (e.value === 'made_to_order') expect(e.maxYear).toBeNull();
      else expect(typeof e.maxYear).toBe('number');
    }
  });

  it('maxYear values match the ADR (before_2007 and 2000_2006 -> 2006, 1990s -> 1999, before_1700 -> 1699)', () => {
    const byValue = (v: string) => getEtsyWhenMade(v)?.maxYear;
    expect(byValue('before_2007')).toBe(2006);
    expect(byValue('2000_2006')).toBe(2006);
    expect(byValue('2007_2009')).toBe(2009);
    expect(byValue('1990s')).toBe(1999);
    expect(byValue('1800s')).toBe(1899);
    expect(byValue('before_1700')).toBe(1699);
  });

  it('the static qualifiesAsVintage flag agrees with maxYear for 2026 (cutoff 2006)', () => {
    for (const e of ETSY_WHEN_MADE) {
      expect(e.qualifiesAsVintage).toBe(etsyWhenMadeQualifies(e.value, 2026));
    }
  });

  it('the vintage subset matches ADR-135 D3.3 exactly', () => {
    const vintage = ETSY_WHEN_MADE.filter((e) => e.qualifiesAsVintage).map((e) => e.value);
    expect(vintage).toEqual([
      'before_2007', '2000_2006', '1990s', '1980s', '1970s', '1960s', '1950s', '1940s', '1930s',
      '1920s', '1910s', '1900s', '1800s', '1700s', 'before_1700',
    ]);
  });
});

describe('helpers', () => {
  it('getEtsyWhenMade returns undefined for unknown or non-string input', () => {
    expect(getEtsyWhenMade('nope')).toBeUndefined();
    expect(getEtsyWhenMade(null)).toBeUndefined();
    expect(getEtsyWhenMade(undefined)).toBeUndefined();
    expect(getEtsyWhenMade('1990s')?.label).toBe('1990s');
  });

  it('etsyVintageCutoffYear is asOfYear minus the minimum age (default 20)', () => {
    expect(ETSY_VINTAGE_MIN_AGE_YEARS).toBe(20);
    expect(etsyVintageCutoffYear(2026)).toBe(2006);
    expect(etsyVintageCutoffYear(2027)).toBe(2007);
    expect(etsyVintageCutoffYear(2026, 30)).toBe(1996);
  });

  it('etsyWhenMadeQualifies is false for made_to_order, unknown and empty values', () => {
    expect(etsyWhenMadeQualifies('made_to_order', 2100)).toBe(false);
    expect(etsyWhenMadeQualifies('bogus', 2026)).toBe(false);
    expect(etsyWhenMadeQualifies('', 2026)).toBe(false);
    expect(etsyWhenMadeQualifies(null, 2026)).toBe(false);
  });

  it('who_made values are the spec enum and the default is someone_else', () => {
    expect([...ETSY_WHO_MADE_VALUES]).toEqual(['i_did', 'someone_else', 'collective']);
    expect(ETSY_WHO_MADE_DEFAULT).toBe('someone_else');
  });
});
