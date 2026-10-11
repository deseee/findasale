/**
 * mergeEbayIdentifiers / resolveMpnRequired / normalizeIdentifier (brand, mpn, upc, ean, isbn on a live eBay listing).
 * Fixed fixtures only: no network, no eBay calls. NOT EXECUTED when written (jest cannot run on the authoring device);
 * CI is the first real run.
 */
import { mergeEbayIdentifiers, resolveMpnRequired, normalizeIdentifier, MPN_PLACEHOLDER, BOOKS_CATEGORY_ID } from '../ebayIdentifierMerge';

const DNA = 'Does Not Apply';
const base = () => ({
  title: 'Old title',
  description: 'Old desc',
  imageUrls: ['https://img/1.jpg'],
  epid: '12345',
  brand: 'Acme',
  mpn: 'X1',
  aspects: { Brand: ['Acme'], MPN: ['X1'], Color: ['Black'] } as Record<string, string[]>,
});
const ctx = (over: Partial<{ categoryId: string | null; mpnRequired: boolean | null }> = {}) => ({
  categoryId: '44995' as string | null,
  mpnRequired: null as boolean | null,
  ...over,
});

describe('normalizeIdentifier', () => {
  it('trims and returns null for empty or non-string input', () => {
    expect(normalizeIdentifier('  Acme ')).toBe('Acme');
    expect(normalizeIdentifier('   ')).toBeNull();
    expect(normalizeIdentifier('')).toBeNull();
    expect(normalizeIdentifier(null)).toBeNull();
    expect(normalizeIdentifier(undefined)).toBeNull();
    expect(normalizeIdentifier(42)).toBeNull();
  });
});

describe('brand', () => {
  it('brand-only edit: overwrites product.brand and the Brand aspect, keeps MPN and every other aspect, keeps epid and images', () => {
    const r = mergeEbayIdentifiers(base(), { brand: '  NewCo ', mpn: 'X1' }, ['brand'], ctx());
    expect(r.changed).toBe(true);
    expect(r.done).toEqual(['brand']);
    expect(r.skipped).toEqual([]);
    expect(r.product.brand).toBe('NewCo');
    expect(r.product.aspects).toEqual({ Brand: ['NewCo'], MPN: ['X1'], Color: ['Black'] });
    expect(r.product.mpn).toBe('X1');
    expect(r.product.epid).toBe('12345');
    expect(r.product.imageUrls).toEqual(['https://img/1.jpg']);
    expect(r.product.title).toBe('Old title');
  });

  it('matches aspect keys case-insensitively and keeps eBay\'s spelling of the key', () => {
    const p = { ...base(), aspects: { brand: ['Acme'], mpn: ['X1'], Color: ['Black'] } as Record<string, string[]> };
    const r = mergeEbayIdentifiers(p, { brand: 'NewCo', mpn: 'X1' }, ['brand'], ctx());
    expect(r.product.aspects).toEqual({ brand: ['NewCo'], mpn: ['X1'], Color: ['Black'] });
    expect(Object.keys(r.product.aspects as object)).toEqual(['brand', 'mpn', 'Color']);
  });

  it('brand set on a listing with no MPN anywhere: MPN becomes Does Not Apply in product.mpn and the MPN aspect', () => {
    const p = { title: 'T', aspects: { Color: ['Black'] } as Record<string, string[]> };
    const r = mergeEbayIdentifiers(p, { brand: 'Acme', mpn: null }, ['brand'], ctx());
    expect(r.product.brand).toBe('Acme');
    expect(r.product.mpn).toBe(DNA);
    expect(r.product.aspects).toEqual({ Color: ['Black'], Brand: ['Acme'], MPN: [DNA] });
    expect(MPN_PLACEHOLDER).toBe(DNA);
  });

  it('brand set, item has no MPN, eBay already has a real MPN: the real MPN stays', () => {
    const r = mergeEbayIdentifiers(base(), { brand: 'NewCo', mpn: null }, ['brand'], ctx());
    expect(r.product.mpn).toBe('X1');
    expect((r.product.aspects as Record<string, string[]>).MPN).toEqual(['X1']);
  });

  it('brand set and the item has a real MPN while eBay still shows Does Not Apply: the real MPN replaces it', () => {
    const p = { ...base(), mpn: DNA, aspects: { Brand: ['Acme'], MPN: [DNA] } as Record<string, string[]> };
    const r = mergeEbayIdentifiers(p, { brand: 'NewCo', mpn: 'Z9' }, ['brand'], ctx());
    expect(r.product.mpn).toBe('Z9');
    expect((r.product.aspects as Record<string, string[]>).MPN).toEqual(['Z9']);
  });

  it('brand set where MPN exists in only one place: the other place is filled so Brand and MPN stay paired', () => {
    const onlyProduct = { title: 'T', mpn: 'X1', aspects: { Color: ['Black'] } as Record<string, string[]> };
    const a = mergeEbayIdentifiers(onlyProduct, { brand: 'Acme', mpn: 'X1' }, ['brand'], ctx());
    expect((a.product.aspects as Record<string, string[]>).MPN).toEqual(['X1']);
    const onlyAspect = { title: 'T', aspects: { MPN: ['X2'] } as Record<string, string[]> };
    const b = mergeEbayIdentifiers(onlyAspect, { brand: 'Acme', mpn: null }, ['brand'], ctx());
    expect(b.product.mpn).toBe('X2');
  });

  it('clearing the brand is skipped: product and aspects are untouched and the note says why', () => {
    const r = mergeEbayIdentifiers(base(), { brand: null, mpn: 'X1' }, ['brand'], ctx());
    expect(r.changed).toBe(false);
    expect(r.product).toEqual(base());
    expect(r.done).toEqual([]);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0]).toMatchObject({ field: 'brand', code: 'BRAND_CLEAR_SKIPPED' });
  });
});

describe('mpn', () => {
  it('a real MPN edit sets product.mpn and the MPN aspect', () => {
    const r = mergeEbayIdentifiers(base(), { brand: 'Acme', mpn: ' Z9 ' }, ['mpn'], ctx());
    expect(r.product.mpn).toBe('Z9');
    expect((r.product.aspects as Record<string, string[]>).MPN).toEqual(['Z9']);
    expect(r.done).toEqual(['mpn']);
  });

  it('a real MPN replaces an existing Does Not Apply', () => {
    const p = { ...base(), mpn: DNA, aspects: { Brand: ['Acme'], MPN: [DNA] } as Record<string, string[]> };
    const r = mergeEbayIdentifiers(p, { brand: 'Acme', mpn: 'Z9' }, ['mpn'], ctx());
    expect(r.product.mpn).toBe('Z9');
    expect((r.product.aspects as Record<string, string[]>).MPN).toEqual(['Z9']);
  });

  it('MPN cleared while a Brand exists becomes Does Not Apply (never a Brand without an MPN)', () => {
    const r = mergeEbayIdentifiers(base(), { brand: 'Acme', mpn: '' }, ['mpn'], ctx());
    expect(r.product.mpn).toBe(DNA);
    expect((r.product.aspects as Record<string, string[]>).MPN).toEqual([DNA]);
  });

  it('MPN cleared while eBay has only a Brand aspect (Unbranded) still becomes Does Not Apply', () => {
    const p = { title: 'T', aspects: { Brand: ['Unbranded'], MPN: ['X1'] } as Record<string, string[]> };
    const r = mergeEbayIdentifiers(p, { brand: null, mpn: null }, ['mpn'], ctx());
    expect((r.product.aspects as Record<string, string[]>).MPN).toEqual([DNA]);
  });

  it('MPN cleared with no Brand is removed only when the category is known not to require it', () => {
    const p = { title: 'T', mpn: 'X1', aspects: { MPN: ['X1'], Color: ['Black'] } as Record<string, string[]> };
    const r = mergeEbayIdentifiers(p, { brand: null, mpn: null }, ['mpn'], ctx({ mpnRequired: false }));
    expect('mpn' in r.product).toBe(false);
    expect(r.product.aspects).toEqual({ Color: ['Black'] });
    expect(r.done).toEqual(['mpn']);
  });

  it('MPN cleared with no Brand is left untouched and reported when MPN is required or unknown', () => {
    const p = { title: 'T', mpn: 'X1', aspects: { MPN: ['X1'] } as Record<string, string[]> };
    for (const mpnRequired of [true, null]) {
      const r = mergeEbayIdentifiers(p, { brand: null, mpn: null }, ['mpn'], ctx({ mpnRequired }));
      expect(r.changed).toBe(false);
      expect(r.product).toEqual(p);
      expect(r.skipped[0]).toMatchObject({ field: 'mpn', code: 'MPN_CLEAR_SKIPPED' });
      expect(r.done).toEqual([]);
    }
  });
});

describe('upc and ean', () => {
  it('adds upc and ean as one-element arrays (trimmed) and preserves everything else', () => {
    const r = mergeEbayIdentifiers(base(), { upc: ' 012345678905 ', ean: '4006381333931' }, ['upc', 'ean'], ctx());
    expect(r.changed).toBe(true);
    expect(r.product.upc).toEqual(['012345678905']);
    expect(r.product.ean).toEqual(['4006381333931']);
    expect(r.product.aspects).toEqual(base().aspects);
    expect(r.product.epid).toBe('12345');
  });

  it('replaces an existing upc', () => {
    const r = mergeEbayIdentifiers({ ...base(), upc: ['000000000000'] }, { upc: '012345678905' }, ['upc'], ctx());
    expect(r.product.upc).toEqual(['012345678905']);
  });

  it('clearing upc or ean deletes the arrays', () => {
    const p = { ...base(), upc: ['012345678905'], ean: ['4006381333931'] };
    const r = mergeEbayIdentifiers(p, { upc: '', ean: null }, ['upc', 'ean'], ctx());
    expect('upc' in r.product).toBe(false);
    expect('ean' in r.product).toBe(false);
    expect(r.changed).toBe(true);
    expect(r.done).toEqual(['upc', 'ean']);
  });

  it('clearing a upc that is not on the listing changes nothing', () => {
    const r = mergeEbayIdentifiers(base(), { upc: null }, ['upc'], ctx());
    expect(r.changed).toBe(false);
  });
});

describe('isbn', () => {
  it('sets product.isbn and overwrites the ISBN aspect on a Books listing', () => {
    const p = { title: 'T', isbn: ['9780000000002'], aspects: { Isbn: ['9780000000002'], Author: ['A'] } as Record<string, string[]> };
    const r = mergeEbayIdentifiers(p, { isbn: ' 9781234567897 ' }, ['isbn'], ctx({ categoryId: BOOKS_CATEGORY_ID }));
    expect(r.product.isbn).toEqual(['9781234567897']);
    expect(r.product.aspects).toEqual({ Isbn: ['9781234567897'], Author: ['A'] });
  });

  it('sets the ISBN aspect when none exists yet', () => {
    const r = mergeEbayIdentifiers({ title: 'T' }, { isbn: '9781234567897' }, ['isbn'], ctx({ categoryId: BOOKS_CATEGORY_ID }));
    expect(r.product.aspects).toEqual({ ISBN: ['9781234567897'] });
  });

  it('clearing isbn on a Books listing is skipped and reported', () => {
    const p = { title: 'T', isbn: ['9781234567897'], aspects: { ISBN: ['9781234567897'] } as Record<string, string[]> };
    const r = mergeEbayIdentifiers(p, { isbn: null }, ['isbn'], ctx({ categoryId: BOOKS_CATEGORY_ID }));
    expect(r.changed).toBe(false);
    expect(r.product).toEqual(p);
    expect(r.skipped[0]).toMatchObject({ field: 'isbn', code: 'ISBN_CLEAR_SKIPPED' });
  });

  it('clearing isbn is skipped when an ISBN aspect is present, even outside Books', () => {
    const p = { title: 'T', isbn: ['9781234567897'], aspects: { isbn: ['9781234567897'] } as Record<string, string[]> };
    const r = mergeEbayIdentifiers(p, { isbn: '' }, ['isbn'], ctx({ categoryId: '99' }));
    expect(r.changed).toBe(false);
    expect(r.skipped[0].code).toBe('ISBN_CLEAR_SKIPPED');
  });

  it('clearing isbn outside Books with no ISBN aspect deletes product.isbn', () => {
    const p = { title: 'T', isbn: ['9781234567897'], aspects: { Color: ['Black'] } as Record<string, string[]> };
    const r = mergeEbayIdentifiers(p, { isbn: null }, ['isbn'], ctx({ categoryId: '99' }));
    expect('isbn' in r.product).toBe(false);
    expect(r.changed).toBe(true);
    expect(r.done).toEqual(['isbn']);
  });
});

describe('no-ops and safety', () => {
  it('values already on the listing yield changed=false (so no PUT and no republish)', () => {
    const p = { ...base(), upc: ['012345678905'], isbn: ['9781234567897'] };
    p.aspects = { ...p.aspects, ISBN: ['9781234567897'] };
    const r = mergeEbayIdentifiers(
      p,
      { brand: 'Acme', mpn: 'X1', upc: '012345678905', isbn: '9781234567897' },
      ['brand', 'mpn', 'upc', 'isbn'],
      ctx()
    );
    expect(r.changed).toBe(false);
    expect(r.done).toEqual(['brand', 'mpn', 'upc', 'isbn']);
  });

  it('only the requested fields are touched', () => {
    const r = mergeEbayIdentifiers(base(), { brand: 'Other', mpn: 'Other', upc: '1', ean: '2', isbn: '3' }, ['upc'], ctx());
    expect(r.product.brand).toBe('Acme');
    expect(r.product.mpn).toBe('X1');
    expect(r.product.upc).toEqual(['1']);
    expect('ean' in r.product).toBe(false);
    expect('isbn' in r.product).toBe(false);
  });

  it('never writes an empty string and never mutates its input', () => {
    const input = base();
    const snapshot = JSON.stringify(input);
    const r = mergeEbayIdentifiers(input, { brand: '   ', mpn: '   ', upc: '  ', ean: '', isbn: ' ' }, ['brand', 'mpn', 'upc', 'ean', 'isbn'], ctx());
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(JSON.stringify(r.product)).not.toMatch(/""|\[""\]/);
  });

  it('handles a missing product or missing aspects object', () => {
    const r = mergeEbayIdentifiers(undefined, { upc: '012345678905' }, ['upc'], ctx());
    expect(r.product).toEqual({ upc: ['012345678905'] });
    expect('aspects' in r.product).toBe(false);
  });
});

describe('resolveMpnRequired', () => {
  it('true / false from the taxonomy, null when it cannot be told', async () => {
    expect(await resolveMpnRequired('1', async () => [{ name: 'MPN', required: true }])).toBe(true);
    expect(await resolveMpnRequired('1', async () => [{ name: 'mpn', required: false }])).toBe(false);
    expect(await resolveMpnRequired('1', async () => [{ name: 'Brand', required: true }])).toBe(false);
    expect(await resolveMpnRequired('1', async () => null)).toBeNull();
    expect(await resolveMpnRequired('1', async () => { throw new Error('boom'); })).toBeNull();
    expect(await resolveMpnRequired(null, async () => [])).toBeNull();
  });
});
