import { normalizeBulkCategoryValue, LEGACY_CATEGORY_NAMES } from '../utils/bulkCategory';

describe('normalizeBulkCategoryValue', () => {
  it('has the 14 legacy names', () => {
    expect(LEGACY_CATEGORY_NAMES).toHaveLength(14);
  });

  it('normalizes legacy names case-insensitively to lowercase', () => {
    for (const name of LEGACY_CATEGORY_NAMES) {
      expect(normalizeBulkCategoryValue(name)).toEqual({ ok: true, value: name });
      expect(normalizeBulkCategoryValue(name.toUpperCase())).toEqual({ ok: true, value: name });
      expect(normalizeBulkCategoryValue(name[0].toUpperCase() + name.slice(1))).toEqual({ ok: true, value: name });
    }
    expect(normalizeBulkCategoryValue('  Furniture ')).toEqual({ ok: true, value: 'furniture' });
  });

  it('accepts eBay L1 names with casing and ampersand preserved', () => {
    expect(normalizeBulkCategoryValue('Home & Garden')).toEqual({ ok: true, value: 'Home & Garden' });
    expect(normalizeBulkCategoryValue('Books & Magazines')).toEqual({ ok: true, value: 'Books & Magazines' });
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeBulkCategoryValue('  Home & Garden \t')).toEqual({ ok: true, value: 'Home & Garden' });
  });

  it('rejects empty, whitespace-only and non-string values', () => {
    const msg = 'category value must be a non-empty string.';
    for (const bad of ['', '   ', '\t\n', undefined, null, 42, true, {}, ['furniture']]) {
      expect(normalizeBulkCategoryValue(bad)).toEqual({ ok: false, message: msg });
    }
  });

  it('rejects values longer than 200 characters and accepts exactly 200', () => {
    const r = normalizeBulkCategoryValue('a'.repeat(201));
    expect(r.ok).toBe(false);
    expect(normalizeBulkCategoryValue('a'.repeat(200))).toEqual({ ok: true, value: 'a'.repeat(200) });
  });

  it('rejects control characters', () => {
    for (const bad of ['Home\u0000Garden', 'Home\nGarden', 'Home\u001fGarden', 'Home\u007fGarden']) {
      const r = normalizeBulkCategoryValue(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/control characters/);
    }
  });
});
