/**
 * Shopper condition filter (utils/conditionFilter.ts): the canonical value and every legacy spelling that reads
 * as it, old shopper filter words, and the facet fold. Pure module, no mocks.
 */
import { canonicalConditionForFilter, conditionFilterValues, canonicalConditionCounts } from '../utils/conditionFilter';
import { normalizeCondition } from '../utils/conditionMapping';

describe('conditionFilterValues', () => {
  it('returns null for no filter', () => {
    for (const v of [undefined, null, '', '   ', 5]) expect(conditionFilterValues(v)).toBeNull();
  });

  it('USED matches the canonical value and the legacy used words, in any casing', () => {
    for (const input of ['USED', 'used', 'Used']) {
      const values = conditionFilterValues(input)!;
      for (const stored of ['USED', 'LIKE_NEW', 'LIKE NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'USED_GOOD']) {
        expect(values).toContain(stored);
      }
      expect(values).not.toContain('NEW');
      expect(values).not.toContain('POOR');
      expect(values).not.toContain('REFURBISHED');
    }
  });

  it('NEW matches only NEW (LIKE_NEW is a used value)', () => {
    expect(conditionFilterValues('NEW')).toEqual(['NEW']);
    expect(conditionFilterValues('new')).toEqual(['NEW']);
  });

  it('REFURBISHED and PARTS_OR_REPAIR include their legacy spellings', () => {
    expect(conditionFilterValues('REFURBISHED')).toEqual(expect.arrayContaining(['REFURBISHED', 'SELLER_REFURBISHED', 'SELLER REFURBISHED']));
    expect(conditionFilterValues('PARTS_OR_REPAIR')).toEqual(
      expect.arrayContaining(['PARTS_OR_REPAIR', 'PARTS OR REPAIR', 'POOR', 'PARTS', 'FOR_PARTS']),
    );
    expect(conditionFilterValues('Parts / Repair')).toContain('PARTS_OR_REPAIR'); // the shopper label also resolves
  });

  it('old bookmarked shopper filter values resolve to the canonical condition they mean today', () => {
    // Old FilterSidebar: mint, excellent, good, fair, poor. Old SearchFilterPanel: Excellent, Very Good, Good, Fair, Poor.
    expect(canonicalConditionForFilter('mint')).toBe('USED');
    expect(canonicalConditionForFilter('excellent')).toBe('USED');
    expect(canonicalConditionForFilter('Very Good')).toBe('USED');
    expect(canonicalConditionForFilter('good')).toBe('USED');
    expect(canonicalConditionForFilter('Fair')).toBe('USED');
    expect(canonicalConditionForFilter('Poor')).toBe('PARTS_OR_REPAIR');
    expect(canonicalConditionForFilter('LIKE_NEW')).toBe('USED');
    expect(conditionFilterValues('Very Good')).toContain('USED');
    expect(conditionFilterValues('poor')).toContain('PARTS_OR_REPAIR');
  });

  it('an unrecognized value falls back to exact case-insensitive matching of what was sent', () => {
    expect(canonicalConditionForFilter('shiny')).toBeNull();
    expect(conditionFilterValues('  Shiny ')).toEqual(['SHINY']);
  });

  it('every stored spelling it lists really reads as that canonical condition (stays in step with normalizeCondition)', () => {
    for (const canonical of ['NEW', 'USED', 'REFURBISHED', 'PARTS_OR_REPAIR'] as const) {
      for (const stored of conditionFilterValues(canonical)!) {
        expect(normalizeCondition(stored).condition).toBe(canonical);
      }
    }
  });
});

describe('canonicalConditionCounts', () => {
  it('folds legacy values onto the canonical four, canonical order first, unknown names kept after', () => {
    const out = canonicalConditionCounts([
      { name: 'GOOD', count: 5 },
      { name: 'USED', count: 20 },
      { name: 'LIKE_NEW', count: 2 },
      { name: 'NEW', count: 7 },
      { name: 'POOR', count: 1 },
      { name: 'Shiny', count: 3 },
      { name: 'PARTS_OR_REPAIR', count: 4 },
    ]);
    expect(out).toEqual([
      { name: 'NEW', count: 7 },
      { name: 'USED', count: 27 },
      { name: 'PARTS_OR_REPAIR', count: 5 },
      { name: 'Shiny', count: 3 },
    ]);
  });

  it('is empty for no rows', () => {
    expect(canonicalConditionCounts([])).toEqual([]);
  });
});
