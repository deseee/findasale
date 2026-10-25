/**
 * Facebook Events scraper quality gate (2026-10-25 retest findings):
 *   - past-dated events ingested (2-day START grace; no check on the
 *     date-recovery path),
 *   - query-metro city/state stamped on events from elsewhere,
 *   - cross-metro duplicates,
 *   - date-only page dates anchored at UTC midnight.
 * All functions under test are pure (no network / DB).
 */

import {
  checkEventWindow,
  startOfTodayCutoff,
  isLocationConfirmed,
  filterFbEventItems,
  fbEventKey,
  FB_EVENT_MAX_FUTURE_DAYS,
} from '../sources/facebook-events-quality';
import {
  deriveCityStateFromDisplay,
  normalizeRegionCode,
  cleanCityToken,
} from '../sources/facebook-address';
import { applyPageLocation } from '../sources/facebook-events-discovery';
import type { ScrapedItem } from '../index';

// Run time of the real retest: 2026-10-25 17:15 UTC.
const NOW = new Date('2026-10-25T17:15:00Z');
const DAY = 86_400_000;

function item(overrides: Partial<ScrapedItem> & { md?: Record<string, any> } = {}): ScrapedItem {
  const { md, ...rest } = overrides;
  return {
    title: 'Garage Sale',
    address: '',
    city: 'Effingham',
    state: 'IL',
    zip: '',
    startDate: new Date('2026-10-31T14:00:00Z'),
    endDate: new Date('2026-11-01T14:00:00Z'),
    sourceUrl: 'https://www.facebook.com/events/1234567890123/',
    sourceName: 'Facebook Events',
    sourceItemId: 'fb:events:1234567890123',
    scrapedMetadata: {
      cityStateSource: 'derived-address',
      geoConfidence: 'high',
      endSource: 'derived',
      ...(md ?? {}),
    },
    ...rest,
  };
}

describe('startOfTodayCutoff', () => {
  test('is 00:00 Hawaii time (10:00 UTC) of the current US day', () => {
    expect(startOfTodayCutoff(NOW).toISOString()).toBe('2026-10-25T10:00:00.000Z');
  });
  test('at 03:00 UTC (scheduled run) "today" is still the previous US day', () => {
    expect(startOfTodayCutoff(new Date('2026-10-26T03:00:00Z')).toISOString()).toBe(
      '2026-10-25T10:00:00.000Z'
    );
  });
});

describe('checkEventWindow', () => {
  test('rejects a start-only event from yesterday (retest rows 10-20..10-24)', () => {
    expect(checkEventWindow(new Date('2026-10-23T18:00:00Z'), null, NOW)).toBe('ended-before-today');
    expect(checkEventWindow(new Date('2026-10-24T12:00:00Z'), null, NOW)).toBe('ended-before-today');
  });
  test('keeps a start-only event that started earlier today', () => {
    expect(checkEventWindow(new Date('2026-10-25T14:00:00Z'), null, NOW)).toBeNull();
  });
  test('keeps a date-only page date for today (anchored 12:00 UTC)', () => {
    expect(checkEventWindow(new Date('2026-10-25T12:00:00Z'), null, NOW)).toBeNull();
  });
  test('keeps a multi-day sale that started earlier but has a real end in the future', () => {
    expect(
      checkEventWindow(new Date('2026-10-23T14:00:00Z'), new Date('2026-10-26T22:00:00Z'), NOW)
    ).toBeNull();
  });
  test('rejects a real end before today', () => {
    expect(
      checkEventWindow(new Date('2026-10-22T14:00:00Z'), new Date('2026-10-24T22:00:00Z'), NOW)
    ).toBe('ended-before-today');
  });
  test('rejects end before start and unparseable / epoch dates', () => {
    expect(
      checkEventWindow(new Date('2026-10-30T14:00:00Z'), new Date('2026-10-29T14:00:00Z'), NOW)
    ).toBe('end-before-start');
    expect(checkEventWindow('not a date', null, NOW)).toBe('invalid-date');
    expect(checkEventWindow(new Date(0), null, NOW)).toBe('invalid-date');
  });
  test(`rejects a start more than ${FB_EVENT_MAX_FUTURE_DAYS} days out (e.g. 2027-05-08)`, () => {
    expect(checkEventWindow(new Date('2027-05-08T12:00:00Z'), null, NOW)).toBe('too-far-future');
    expect(checkEventWindow(new Date('2027-01-19T13:00:00Z'), null, NOW)).toBeNull();
  });
  test('accepts ISO strings (items arrive JSON-serialised)', () => {
    expect(checkEventWindow('2026-10-31T14:00:00.000Z', null, NOW)).toBeNull();
  });
});

describe('isLocationConfirmed', () => {
  test('metro-fallback, unresolved, or missing provenance is NOT confirmed', () => {
    expect(isLocationConfirmed(item({ md: { cityStateSource: 'metro-fallback', geoConfidence: 'metro-fallback' } }))).toBe(false);
    expect(isLocationConfirmed(item({ md: { cityStateSource: 'metro-fallback', geoConfidence: 'unresolved' } }))).toBe(false);
    expect(isLocationConfirmed({ city: 'Elgin', state: 'IL', scrapedMetadata: {} })).toBe(false);
  });
  test('event-derived provenance is confirmed', () => {
    for (const src of ['structured', 'derived-address', 'derived-address-CA', 'page-fetch-address', 'page-fetch-place', 'slug']) {
      expect(isLocationConfirmed(item({ md: { cityStateSource: src } }))).toBe(true);
    }
  });
});

describe('filterFbEventItems', () => {
  test('drops past, far-future and unconfirmed-location items with reasons', () => {
    const past = item({ sourceItemId: 'fb:events:1000000001', sourceUrl: 'https://www.facebook.com/events/1000000001/', startDate: new Date('2026-10-23T18:00:00Z'), endDate: new Date('2026-10-24T18:00:00Z') });
    const far = item({ sourceItemId: 'fb:events:1000000002', sourceUrl: 'https://www.facebook.com/events/1000000002/', startDate: new Date('2027-05-08T12:00:00Z'), endDate: new Date('2027-05-09T12:00:00Z') });
    const metro = item({ sourceItemId: 'fb:events:1000000003', sourceUrl: 'https://www.facebook.com/events/1000000003/', city: 'Elgin', md: { cityStateSource: 'metro-fallback', geoConfidence: 'metro-fallback' } });
    const good = item({ sourceItemId: 'fb:events:1000000004', sourceUrl: 'https://www.facebook.com/events/1000000004/' });
    const { kept, dropped } = filterFbEventItems([past, far, metro, good], { now: NOW });
    expect(kept.map((k) => k.sourceItemId)).toEqual(['fb:events:1000000004']);
    expect(dropped).toEqual({ 'ended-before-today': 1, 'too-far-future': 1, 'location-unconfirmed': 1 });
  });

  test('uses the real end (endSource=event) for multi-day sales', () => {
    const multi = item({ startDate: new Date('2026-10-23T14:00:00Z'), endDate: new Date('2026-10-26T22:00:00Z'), md: { endSource: 'event' } });
    expect(filterFbEventItems([multi], { now: NOW }).kept).toHaveLength(1);
    const derived = item({ startDate: new Date('2026-10-23T14:00:00Z'), endDate: new Date('2026-10-26T22:00:00Z'), md: { endSource: 'derived' } });
    expect(filterFbEventItems([derived], { now: NOW }).kept).toHaveLength(0);
  });

  test('dedupes the same event id across metros, preferring the confirmed copy', () => {
    const fromElgin = item({ city: 'Elgin', md: { metro: 'Elgin, IL', cityStateSource: 'metro-fallback', geoConfidence: 'metro-fallback' } });
    const fromPeoria = item({ city: 'Effingham', md: { metro: 'Peoria, IL', cityStateSource: 'page-fetch-place' } });
    const { kept, dropped } = filterFbEventItems([fromElgin, fromPeoria], { now: NOW });
    expect(kept).toHaveLength(1);
    expect(kept[0].city).toBe('Effingham');
    expect(dropped['duplicate-event-id']).toBe(1);
  });

  test('dedupes by URL id when sourceItemId is absent (share-link vs canonical)', () => {
    const a = item({ sourceItemId: undefined, sourceUrl: 'https://www.facebook.com/events/s/garage-sale/1234567890123/' });
    const b = item({ sourceItemId: undefined, sourceUrl: 'https://www.facebook.com/events/1234567890123/' });
    expect(fbEventKey(a)).toBe(fbEventKey(b));
    expect(filterFbEventItems([a, b], { now: NOW }).kept).toHaveLength(1);
  });

  test('passes already-stored sourceUrls through untouched (ingest dedupes them)', () => {
    const stored = item({ startDate: new Date('2026-10-20T14:00:00Z'), endDate: new Date('2026-10-21T14:00:00Z') });
    const { kept } = filterFbEventItems([stored], {
      now: NOW,
      existingSourceUrls: new Set([stored.sourceUrl]),
    });
    expect(kept).toHaveLength(1);
  });
});

describe('deriveCityStateFromDisplay / normalizeRegionCode', () => {
  test('existing 2-letter-code behaviour is unchanged', () => {
    expect(deriveCityStateFromDisplay('Renton, WA')).toEqual({ city: 'Renton', state: 'WA', country: 'US' });
    expect(deriveCityStateFromDisplay('36 Linden St, Pittsfield, MA 01201-3212, United States')).toEqual({ city: 'Pittsfield', state: 'MA', country: 'US' });
  });
  test('spelled-out state names (seen on the retest) resolve', () => {
    expect(deriveCityStateFromDisplay('Millersville, Maryland')).toEqual({ city: 'Millersville', state: 'MD', country: 'US' });
    expect(deriveCityStateFromDisplay('303 Lazy Springs Drive, Red Oak, Texas 75154')).toEqual({ city: 'Red Oak', state: 'TX', country: 'US' });
    expect(deriveCityStateFromDisplay('South Boston, Virginia')).toEqual({ city: 'South Boston', state: 'VA', country: 'US' });
  });
  test('a street glued to the city (no comma) is split off, never stored as the city', () => {
    expect(deriveCityStateFromDisplay('3303 Sturbridge Ln Sugar Land, TX 77479')).toEqual({ city: 'Sugar Land', state: 'TX', country: 'US' });
    expect(deriveCityStateFromDisplay('815 SW 40th Street San Antonio, TX')).toEqual({ city: 'San Antonio', state: 'TX', country: 'US' });
    expect(deriveCityStateFromDisplay('420 Franklin Ave. Grand Forks, ND')).toEqual({ city: 'Grand Forks', state: 'ND', country: 'US' });
    expect(deriveCityStateFromDisplay('5132 McCandless Road Butler, PA 16001')).toEqual({ city: 'Butler', state: 'PA', country: 'US' });
    expect(cleanCityToken('2215 Arizona')).toBeNull();
    expect(cleanCityToken('Grand Rapids')).toBe('Grand Rapids');
  });
  test('non-US/CA places and street-only lines stay unresolved', () => {
    expect(deriveCityStateFromDisplay("The Halls, St Andrew's Plain, Norwich NR")).toBeNull();
    expect(deriveCityStateFromDisplay('Sturgis Michigan')).toBeNull();
    expect(deriveCityStateFromDisplay('1270 E Frederick St, Texas')).toBeNull();
  });
  test('normalizeRegionCode', () => {
    expect(normalizeRegionCode('tx')).toEqual({ code: 'TX', country: 'US' });
    expect(normalizeRegionCode('Illinois')).toEqual({ code: 'IL', country: 'US' });
    expect(normalizeRegionCode('British Columbia')).toEqual({ code: 'BC', country: 'CA' });
    expect(normalizeRegionCode('Norfolk')).toBeNull();
    expect(normalizeRegionCode(undefined)).toBeNull();
  });
});

describe('applyPageLocation', () => {
  const metroItem = (): ScrapedItem =>
    item({ city: 'Elgin', state: 'IL', md: { metro: 'Elgin, IL', cityStateSource: 'metro-fallback', geoConfidence: 'metro-fallback' } });

  test('replaces the metro with the event page city/state', () => {
    const it = metroItem();
    expect(applyPageLocation(it, { city: 'Effingham', state: 'IL' })).toBe('city');
    expect(it.city).toBe('Effingham');
    expect(it.scrapedMetadata!.cityStateSource).toBe('page-fetch-place');
    expect(isLocationConfirmed(it)).toBe(true);
  });

  test('applies a street address together with its own city/state', () => {
    const it = metroItem();
    expect(applyPageLocation(it, { address: '2909 Park St', city: 'Effingham', state: 'Illinois' })).toBe('street');
    expect([it.address, it.city, it.state]).toEqual(['2909 Park St', 'Effingham', 'IL']);
    expect(isLocationConfirmed(it)).toBe(true);
  });

  test('never glues a street address onto the metro when the page has no city', () => {
    const it = metroItem();
    expect(applyPageLocation(it, { address: '2909 Park St' })).toBe('none');
    expect(it.address).toBe('');
    expect(isLocationConfirmed(it)).toBe(false);
  });

  test('adds a street address to an already-confirmed city', () => {
    const it = item();
    expect(applyPageLocation(it, { address: '2909 Park St' })).toBe('street');
    expect(it.address).toBe('2909 Park St');
    expect(it.city).toBe('Effingham');
  });

  test('does not overwrite a confirmed city with a page city', () => {
    const it = item();
    expect(applyPageLocation(it, { city: 'Somewhere', state: 'IL' })).toBe('none');
    expect(it.city).toBe('Effingham');
  });

  test('non-US/CA page region leaves the item unconfirmed; Quebec is flagged', () => {
    const uk = metroItem();
    expect(applyPageLocation(uk, { city: 'Norwich', state: 'Norfolk' })).toBe('none');
    expect(isLocationConfirmed(uk)).toBe(false);
    expect(applyPageLocation(metroItem(), { city: 'Montreal', state: 'QC' })).toBe('quebec');
    expect(applyPageLocation(metroItem(), null)).toBe('none');
  });
});
