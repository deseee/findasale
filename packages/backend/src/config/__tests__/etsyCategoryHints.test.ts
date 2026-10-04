/**
 * ADR-135 batch E-B3: config/etsyCategoryHints.ts ships EMPTY (hints are authored after live test T4,
 * because the taxonomy tree shape and names are unverified). The helper must work with an empty map.
 */

import { ETSY_CATEGORY_HINTS, ETSY_HINT_PATH_SEPARATOR, getEtsyCategoryHintPrefixes } from '../etsyCategoryHints';

describe('etsyCategoryHints', () => {
  it('ships an empty map and resolves no prefixes from it', () => {
    expect(ETSY_CATEGORY_HINTS).toEqual({});
    expect(getEtsyCategoryHintPrefixes('Home & Garden')).toEqual([]);
    expect(getEtsyCategoryHintPrefixes(null)).toEqual([]);
    expect(getEtsyCategoryHintPrefixes(undefined)).toEqual([]);
  });

  it('uses " > " as the path separator, matching the taxonomy cache fullPath', () => {
    expect(ETSY_HINT_PATH_SEPARATOR).toBe(' > ');
  });

  it('returns the prefixes for a category from a supplied map', () => {
    const hints = { Furniture: [['Home & Living', 'Furniture']], 'Home & Garden': [['Home & Living'], ['Craft Supplies & Tools']] };
    expect(getEtsyCategoryHintPrefixes('Furniture', hints)).toEqual(['Home & Living > Furniture']);
    expect(getEtsyCategoryHintPrefixes('Home & Garden', hints)).toEqual(['Home & Living', 'Craft Supplies & Tools']);
    expect(getEtsyCategoryHintPrefixes('Unknown', hints)).toEqual([]);
  });

  it('is safe against prototype keys and malformed entries', () => {
    expect(getEtsyCategoryHintPrefixes('__proto__', {})).toEqual([]);
    expect(getEtsyCategoryHintPrefixes('constructor', {})).toEqual([]);
    expect(getEtsyCategoryHintPrefixes('A', { A: [[], [''], null as any, 'x' as any] } as any)).toEqual([]);
  });

  it('does not mutate the map it is given', () => {
    const hints = { A: [['X', 'Y']] };
    const before = JSON.stringify(hints);
    getEtsyCategoryHintPrefixes('A', hints);
    expect(JSON.stringify(hints)).toBe(before);
  });
});
