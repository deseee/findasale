/**
 * ADR-135 batch E-B2, acceptance 1: the ETSY ATTRIBUTE_AGE_ALLOWLIST rule in the shared registry.
 * The year is injected through `asOfYear` so nothing depends on the real clock, except the one
 * test that proves the default (fake timers).
 */

// marketplaceEligibilityRules imports ebayRateEstimateService, which imports the prisma client.
jest.mock('../../lib/prisma', () => ({ prisma: {} }));

import { checkEligibility, EligibilityCheckItem } from '../marketplaceEligibilityRules';

const ETSY_REASON =
  'Etsy only accepts items that are 20 or more years old, items you made or designed, or craft and party supplies.';

function etsy(partial: Partial<EligibilityCheckItem>) {
  return checkEligibility('ETSY', { category: null, ebayCategoryId: null, ...partial });
}

describe('ETSY rule, asOfYear 2026 (cutoff 2006)', () => {
  const asOfYear = 2026;

  it('releaseYear 2006 passes and 2007 fails', () => {
    expect(etsy({ asOfYear, releaseYear: 2006 })).toEqual({ eligible: true, reason: null });
    expect(etsy({ asOfYear, releaseYear: 2007 })).toEqual({ eligible: false, reason: ETSY_REASON });
  });

  it('old releaseYears pass', () => {
    expect(etsy({ asOfYear, releaseYear: 1993 }).eligible).toBe(true);
    expect(etsy({ asOfYear, releaseYear: 1900 }).eligible).toBe(true);
  });

  it.each(['before_2007', '2000_2006', '1990s', '1980s', '1900s', '1800s', 'before_1700'])(
    'era %s passes',
    (etsyWhenMade) => {
      expect(etsy({ asOfYear, etsyWhenMade })).toEqual({ eligible: true, reason: null });
    }
  );

  it.each(['2007_2009', '2010_2019', '2020_2026', 'made_to_order'])('era %s fails', (etsyWhenMade) => {
    expect(etsy({ asOfYear, etsyWhenMade })).toEqual({ eligible: false, reason: ETSY_REASON });
  });

  it('an unknown or empty era is treated as no data and fails', () => {
    expect(etsy({ asOfYear, etsyWhenMade: 'not_an_era' }).eligible).toBe(false);
    expect(etsy({ asOfYear, etsyWhenMade: '' }).eligible).toBe(false);
    expect(etsy({ asOfYear, etsyWhenMade: null }).eligible).toBe(false);
  });

  it('a craft supply passes with no era', () => {
    expect(etsy({ asOfYear, etsyIsCraftSupply: true })).toEqual({ eligible: true, reason: null });
  });

  it('a craft supply does NOT rescue a releaseYear of 2015', () => {
    expect(etsy({ asOfYear, etsyIsCraftSupply: true, releaseYear: 2015 })).toEqual({
      eligible: false,
      reason: ETSY_REASON,
    });
  });

  it('a craft supply with an old releaseYear still passes (the year itself is old enough)', () => {
    expect(etsy({ asOfYear, etsyIsCraftSupply: true, releaseYear: 1999 }).eligible).toBe(true);
  });

  it('releaseYear decides alone: an old releaseYear passes even with a recent attested era', () => {
    expect(etsy({ asOfYear, releaseYear: 1999, etsyWhenMade: '2020_2026' }).eligible).toBe(true);
    expect(etsy({ asOfYear, releaseYear: 2015, etsyWhenMade: '1980s' }).eligible).toBe(false);
  });

  it('no data fails (allowlist posture), including craft supply false or null', () => {
    expect(etsy({ asOfYear })).toEqual({ eligible: false, reason: ETSY_REASON });
    expect(etsy({ asOfYear, etsyIsCraftSupply: false }).eligible).toBe(false);
    expect(etsy({ asOfYear, etsyIsCraftSupply: null, releaseYear: null, etsyWhenMade: null }).eligible).toBe(false);
  });

  it('a non-finite releaseYear is treated as missing data', () => {
    expect(etsy({ asOfYear, releaseYear: Number.NaN }).eligible).toBe(false);
    expect(etsy({ asOfYear, releaseYear: Number.NaN, etsyIsCraftSupply: true }).eligible).toBe(true);
  });

  it('never reads category or title: category text cannot change the decision', () => {
    expect(etsy({ asOfYear, category: 'Musical Instruments & Gear', title: 'Vintage guitar' }).eligible).toBe(false);
    expect(etsy({ asOfYear, category: 'Coins & Paper Money', etsyWhenMade: '1970s' }).eligible).toBe(true);
  });
});

describe('ETSY rule, the cutoff moves with asOfYear', () => {
  it('asOfYear 2027 gives cutoff 2007: 2007 passes, 2008 fails, 2007_2009 still fails', () => {
    expect(etsy({ asOfYear: 2027, releaseYear: 2007 }).eligible).toBe(true);
    expect(etsy({ asOfYear: 2027, releaseYear: 2008 }).eligible).toBe(false);
    expect(etsy({ asOfYear: 2027, etsyWhenMade: '2007_2009' }).eligible).toBe(false);
    expect(etsy({ asOfYear: 2027, etsyWhenMade: '2000_2006' }).eligible).toBe(true);
  });

  it('2007_2009 only qualifies once its whole range is old enough (asOfYear 2029)', () => {
    expect(etsy({ asOfYear: 2028, etsyWhenMade: '2007_2009' }).eligible).toBe(false);
    expect(etsy({ asOfYear: 2029, etsyWhenMade: '2007_2009' }).eligible).toBe(true);
  });
});

describe('ETSY rule, default clock', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses the current calendar year when asOfYear is omitted', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-15T12:00:00Z'));
    expect(etsy({ releaseYear: 2006 }).eligible).toBe(true);
    expect(etsy({ releaseYear: 2007 }).eligible).toBe(false);
    jest.setSystemTime(new Date('2027-06-15T12:00:00Z'));
    expect(etsy({ releaseYear: 2007 }).eligible).toBe(true);
  });
});

describe('ETSY fields do not leak into other platforms', () => {
  it('REVERB and FACEBOOK ignore the Etsy inputs', () => {
    const base = { category: 'Musical Instruments & Gear', ebayCategoryId: null, title: 'Guitar' };
    expect(checkEligibility('REVERB', base)).toEqual(
      checkEligibility('REVERB', { ...base, releaseYear: 2024, etsyIsCraftSupply: false, etsyWhenMade: '2020_2026', asOfYear: 2026 })
    );
    const fb = { category: 'Furniture', ebayCategoryId: null, title: 'Table' };
    expect(checkEligibility('FACEBOOK', { ...fb, releaseYear: 2024 })).toEqual({ eligible: true, reason: null });
  });
});

describe('ETSY reason copy', () => {
  it('has no em dash, no standalone AI and no "estate sale"', () => {
    const reason = etsy({ asOfYear: 2026 }).reason as string;
    expect(reason).toBe(ETSY_REASON);
    expect(reason).not.toMatch(/—/);
    expect(reason).not.toMatch(/\bAI\b/);
    expect(reason).not.toMatch(/estate sale/i);
  });
});
