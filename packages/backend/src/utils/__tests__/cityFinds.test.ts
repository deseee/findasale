/**
 * cityFinds helpers (ADR-074 city cluster wiring, 2026-09-29). NOT EXECUTED when written (jest
 * cannot run on the authoring device); CI is the first real run.
 */
import {
  parseCitySlug,
  slugMatchesCity,
  computeSavingsPct,
  rankCityFinds,
  directoryAddressWhere,
  CityFindInput,
} from '../cityFinds';

describe('parseCitySlug', () => {
  it('parses a normal slug', () => {
    expect(parseCitySlug('grand-rapids-mi')).toEqual({ stateCode: 'MI', cityName: 'Grand Rapids', matchToken: 'rapids' });
  });

  it('picks the later word on a length tie and the longest word otherwise', () => {
    expect(parseCitySlug('st-louis-mo')?.matchToken).toBe('louis');
    expect(parseCitySlug('new-york-ny')?.matchToken).toBe('york');
    expect(parseCitySlug('detroit-mi')?.matchToken).toBe('detroit');
  });

  it('rejects malformed slugs', () => {
    expect(parseCitySlug('')).toBeNull();
    expect(parseCitySlug(null)).toBeNull();
    expect(parseCitySlug('[city-slug]')).toBeNull();
    expect(parseCitySlug('nowhere')).toBeNull();
    expect(parseCitySlug('-mi')).toBeNull();
    expect(parseCitySlug('grand rapids-mi')).toBeNull();
  });

  it('is case-insensitive on input', () => {
    expect(parseCitySlug('Grand-Rapids-MI')?.stateCode).toBe('MI');
  });
});

describe('slugMatchesCity', () => {
  it('matches canonical city + state, including dots and case', () => {
    expect(slugMatchesCity('grand-rapids-mi', 'Grand Rapids', 'MI')).toBe(true);
    expect(slugMatchesCity('st-louis-mo', 'St. Louis', 'mo')).toBe(true);
  });
  it('rejects a different city or state', () => {
    expect(slugMatchesCity('grand-rapids-mi', 'Grand Rapids', 'MN')).toBe(false);
    expect(slugMatchesCity('grand-rapids-mi', 'Grand Junction', 'MI')).toBe(false);
    expect(slugMatchesCity('grand-rapids-mi', null, 'MI')).toBe(false);
  });
});

describe('computeSavingsPct', () => {
  it('computes a rounded percent for a real cut', () => {
    expect(computeSavingsPct(75, 100)).toBe(25);
    expect(computeSavingsPct(66, 100)).toBe(34);
  });
  it('returns null when there is nothing honest to claim', () => {
    expect(computeSavingsPct(100, 100)).toBeNull();
    expect(computeSavingsPct(120, 100)).toBeNull();
    expect(computeSavingsPct(97, 100)).toBeNull(); // 3% is noise
    expect(computeSavingsPct(5, 100)).toBeNull(); // 95% is a suspect original price
    expect(computeSavingsPct(null, 100)).toBeNull();
    expect(computeSavingsPct(50, null)).toBeNull();
    expect(computeSavingsPct(0, 100)).toBeNull();
    expect(computeSavingsPct(NaN, 100)).toBeNull();
  });
});

const item = (over: Partial<CityFindInput> & { id: string }): CityFindInput => ({
  title: 'Thing',
  price: 50,
  originalPrice: null,
  condition: null,
  category: null,
  photoUrls: ['https://img/1.jpg'],
  saleId: 's1',
  createdAt: '2026-09-01T00:00:00Z',
  sale: { id: 's1', title: 'Big Sale', city: 'Grand Rapids', state: 'MI' },
  ...over,
});

describe('rankCityFinds', () => {
  it('drops items from other cities, unpriced items and items without a photo', () => {
    const out = rankCityFinds(
      [
        item({ id: 'a' }),
        item({ id: 'b', sale: { city: 'Grand Rapids', state: 'MN' } }),
        item({ id: 'c', price: 0 }),
        item({ id: 'd', price: null }),
        item({ id: 'e', photoUrls: [] }),
        item({ id: 'f', sale: null }),
      ],
      'grand-rapids-mi'
    );
    expect(out.map((f) => f.id)).toEqual(['a']);
  });

  it('ranks real savings first (largest first), then newest', () => {
    const out = rankCityFinds(
      [
        item({ id: 'new-nosave', createdAt: '2026-09-20T00:00:00Z' }),
        item({ id: 'old-nosave', createdAt: '2026-09-02T00:00:00Z' }),
        item({ id: 'save20', price: 80, originalPrice: 100 }),
        item({ id: 'save50', price: 50, originalPrice: 100 }),
      ],
      'grand-rapids-mi'
    );
    expect(out.map((f) => f.id)).toEqual(['save50', 'save20', 'new-nosave', 'old-nosave']);
    expect(out[0].savingsPct).toBe(50);
    expect(out[0].originalPrice).toBe(100);
    expect(out[2].savingsPct).toBeNull();
    expect(out[2].originalPrice).toBeNull();
  });

  it('never exposes an original price that is not backing a savings claim', () => {
    const out = rankCityFinds([item({ id: 'x', price: 99, originalPrice: 100 })], 'grand-rapids-mi');
    expect(out[0].savingsPct).toBeNull();
    expect(out[0].originalPrice).toBeNull();
  });

  it('dedupes by id and honors the limit', () => {
    const many = Array.from({ length: 30 }, (_, i) => item({ id: `i${i}`, createdAt: new Date(2026, 8, 1 + (i % 28)).toISOString() }));
    many.push(item({ id: 'i0' }));
    const out = rankCityFinds(many, 'grand-rapids-mi', 12);
    expect(out).toHaveLength(12);
    expect(new Set(out.map((f) => f.id)).size).toBe(12);
  });

  it('uses the first non-empty photo', () => {
    const out = rankCityFinds([item({ id: 'p', photoUrls: ['', 'https://img/2.jpg'] })], 'grand-rapids-mi');
    expect(out[0].photoUrl).toBe('https://img/2.jpg');
  });
});

describe('directoryAddressWhere', () => {
  it('requires both the city name and the region code', () => {
    const w = directoryAddressWhere('Grand Rapids', 'mi');
    expect(w.AND[0]).toEqual({ address: { contains: 'Grand Rapids', mode: 'insensitive' } });
    const orClauses = (w.AND[1] as any).OR;
    expect(orClauses).toEqual([
      { address: { contains: ', MI ' } },
      { address: { endsWith: ', MI' } },
      { address: { endsWith: ' MI' } },
    ]);
  });

  it('region clauses are case-sensitive so MI cannot match Miami or Minnesota', () => {
    const orClauses = (directoryAddressWhere('X', 'MI').AND[1] as any).OR;
    for (const c of orClauses) {
      expect(c.address.mode).toBeUndefined();
    }
  });
});
