/**
 * eBay background enrich pass (importEbayInventory "[eBay Enrich]"): organizer intent wins.
 * Held / dirty items are never touched, items FindA.Sale published get blanks filled only, imported-only items refresh.
 */
import * as fs from 'fs';
import * as path from 'path';
import { planEnrichWrites, needsEnrichFetch, isEnrichProtected, isPublishedByUs, type EnrichItemState, type EnrichParsed } from '../utils/ebayEnrichPlan';
import { canonicalFromEbayCondition } from '../utils/ebayConditionImport';
import { classifyEbayShipping } from '../utils/ebayShippingClassifier';

const full = (over: Partial<EnrichItemState> = {}): EnrichItemState => ({
  description: 'Organizer description',
  photoUrls: ['https://fas/p1.jpg'],
  category: 'Organizer Category',
  tags: ['organizer-tag'],
  ebayCategoryId: '111',
  condition: 'USED',
  conditionGrade: 'B',
  ebayOfferId: 'OFFER1',
  ebaySyncHeldAt: null,
  ebayContentDirtyAt: null,
  ...over,
});

const blank = (over: Partial<EnrichItemState> = {}): EnrichItemState => ({
  description: '',
  photoUrls: [],
  category: '',
  tags: [],
  ebayCategoryId: null,
  condition: null,
  conditionGrade: null,
  ebayOfferId: 'OFFER1',
  ebaySyncHeldAt: null,
  ebayContentDirtyAt: null,
  ...over,
});

const ebayParsed = (over: Partial<EnrichParsed> = {}): EnrichParsed => ({
  description: 'eBay description',
  photoUrls: ['https://ebay/e1.jpg', 'https://ebay/e2.jpg'],
  categoryName: 'Vases',
  categoryId: '999',
  tags: ['ebay-tag'],
  ebayCondition: canonicalFromEbayCondition('4000'),
  ...over,
});

describe('held and dirty items are skipped entirely', () => {
  it('a held item gets no write and no fetch, even when everything is blank', () => {
    const item = blank({ ebaySyncHeldAt: new Date() });
    expect(isEnrichProtected(item)).toBe(true);
    expect(planEnrichWrites(item, ebayParsed())).toBeNull();
    expect(needsEnrichFetch(item)).toBe(false);
  });

  it('a content-dirty item gets no write and no fetch, even when everything is blank', () => {
    const item = blank({ ebayContentDirtyAt: new Date() });
    expect(planEnrichWrites(item, ebayParsed())).toBeNull();
    expect(needsEnrichFetch(item)).toBe(false);
  });

  it('an imported-only item that is held or dirty is also skipped', () => {
    expect(planEnrichWrites(full({ ebayOfferId: null, ebaySyncHeldAt: new Date() }), ebayParsed())).toBeNull();
    expect(planEnrichWrites(full({ ebayOfferId: '   ', ebayContentDirtyAt: new Date() }), ebayParsed())).toBeNull();
    expect(needsEnrichFetch(full({ ebayOfferId: null, ebaySyncHeldAt: new Date() }))).toBe(false);
  });
});

describe('items FindA.Sale published (non-blank ebayOfferId): fill blanks only', () => {
  it('a fully populated item is never overwritten, field by field', () => {
    const item = full();
    expect(planEnrichWrites(item, ebayParsed())).toBeNull();
    for (const field of ['description', 'photoUrls', 'category', 'tags', 'ebayCategoryId'] as const) {
      const out = planEnrichWrites(item, ebayParsed()) ?? {};
      expect(out).not.toHaveProperty(field);
    }
  });

  it('each blank field is filled on its own and nothing else is touched', () => {
    const cases: Array<[Partial<EnrichItemState>, Record<string, unknown>]> = [
      [{ description: '' }, { description: 'eBay description' }],
      [{ description: '   ' }, { description: 'eBay description' }],
      [{ description: null }, { description: 'eBay description' }],
      [{ photoUrls: [] }, { photoUrls: ['https://ebay/e1.jpg', 'https://ebay/e2.jpg'] }],
      [{ ebayCategoryId: null }, { ebayCategoryId: '999' }],
      [{ ebayCategoryId: '  ' }, { ebayCategoryId: '999' }],
    ];
    for (const [over, expected] of cases) {
      expect(planEnrichWrites(full(over), ebayParsed())).toEqual(expected);
    }
  });

  it('a blank category fills and recomputes the shipping classification from the new category and stored tags', () => {
    const out = planEnrichWrites(full({ category: null }), ebayParsed({ categoryName: 'Antique Furniture Tables' }));
    expect(out).toEqual({
      category: 'Antique Furniture Tables',
      ebayShippingClassification: classifyEbayShipping('Antique Furniture Tables', ['organizer-tag']),
    });
  });

  it('blank tags fill and recompute the shipping classification from the stored category and new tags', () => {
    const out = planEnrichWrites(full({ tags: [] }), ebayParsed({ tags: ['glass', 'fragile'] }));
    expect(out).toEqual({
      tags: ['glass', 'fragile'],
      ebayShippingClassification: classifyEbayShipping('Organizer Category', ['glass', 'fragile']),
    });
  });

  it('an entirely blank item is filled from eBay, but never gets a grade (we published it)', () => {
    const out = planEnrichWrites(blank(), ebayParsed())!;
    expect(out.description).toBe('eBay description');
    expect(out.photoUrls).toEqual(['https://ebay/e1.jpg', 'https://ebay/e2.jpg']);
    expect(out.category).toBe('Vases');
    expect(out.tags).toEqual(['ebay-tag']);
    expect(out.ebayCategoryId).toBe('999');
    expect(out.condition).toBe('USED');
    expect(out).not.toHaveProperty('conditionGrade');
    expect(out.ebayShippingClassification).toBe(classifyEbayShipping('Vases', ['ebay-tag']));
  });

  it('a different eBay category id never replaces a stored one', () => {
    expect(planEnrichWrites(full({ ebayCategoryId: '111' }), ebayParsed({ categoryId: '222' }))).toBeNull();
  });

  it('needsEnrichFetch is false when nothing is blank and true when any fill-blank field is blank', () => {
    expect(needsEnrichFetch(full())).toBe(false);
    for (const over of [{ description: '' }, { photoUrls: [] }, { category: '' }, { tags: [] }, { ebayCategoryId: null }, { condition: null }]) {
      expect(needsEnrichFetch(full(over as Partial<EnrichItemState>))).toBe(true);
    }
    // a blank grade alone is not worth a fetch: it is never filled on an item we published
    expect(needsEnrichFetch(full({ conditionGrade: null }))).toBe(false);
  });
});

describe('imported-only items (no ebayOfferId): eBay refreshes them', () => {
  it.each([null, undefined, '', '   '])('ebayOfferId %p is treated as imported-only', (offer) => {
    const item = full({ ebayOfferId: offer as any });
    expect(isPublishedByUs(item)).toBe(false);
    const out = planEnrichWrites(item, ebayParsed())!;
    expect(out.description).toBe('eBay description');
    expect(out.photoUrls).toEqual(['https://ebay/e1.jpg', 'https://ebay/e2.jpg']);
    expect(out.category).toBe('Vases');
    expect(out.tags).toEqual(['ebay-tag']);
    expect(out.ebayCategoryId).toBe('999');
    expect(out.ebayShippingClassification).toBe(classifyEbayShipping('Vases', ['ebay-tag']));
    expect(needsEnrichFetch(item)).toBe(true);
  });

  it('keeps the stored condition and grade even though eBay is the source of truth for the rest', () => {
    const out = planEnrichWrites(full({ ebayOfferId: null, condition: 'NEW', conditionGrade: 'A' }), ebayParsed())!;
    expect(out).not.toHaveProperty('condition');
    expect(out).not.toHaveProperty('conditionGrade');
  });

  it('an unchanged category id is not rewritten', () => {
    const out = planEnrichWrites(full({ ebayOfferId: null, ebayCategoryId: '999' }), ebayParsed())!;
    expect(out).not.toHaveProperty('ebayCategoryId');
  });
});

describe('empty eBay values never blank out stored values', () => {
  const empty: EnrichParsed = { description: '', photoUrls: [], categoryName: null, categoryId: null, tags: [], ebayCondition: canonicalFromEbayCondition('') };
  it('imported-only item with empty eBay data: no write at all', () => {
    expect(planEnrichWrites(full({ ebayOfferId: null }), empty)).toBeNull();
  });
  it('item we published with empty eBay data: no write at all, even when blank', () => {
    expect(planEnrichWrites(full(), empty)).toBeNull();
    expect(planEnrichWrites(blank(), empty)).toBeNull();
  });
  it('whitespace-only and missing parsed fields are ignored', () => {
    expect(planEnrichWrites(full({ ebayOfferId: null }), { description: '   ', categoryName: '  ', categoryId: ' ' })).toBeNull();
    expect(planEnrichWrites(full({ ebayOfferId: null }), {})).toBeNull();
  });
});

describe('ebayShippingClassification is recomputed only when category or tags are written', () => {
  it('not recomputed when only description, photos, category id or condition are written', () => {
    const out = planEnrichWrites(blank({ category: 'Vases', tags: ['x'] }), ebayParsed())!;
    expect(out).toHaveProperty('description');
    expect(out).toHaveProperty('photoUrls');
    expect(out).toHaveProperty('ebayCategoryId');
    expect(out).toHaveProperty('condition');
    expect(out).not.toHaveProperty('ebayShippingClassification');
  });

  it('imported-only: recomputed from the written category and the stored tags when only the category changes', () => {
    const out = planEnrichWrites(full({ ebayOfferId: null, tags: ['stored'] }), ebayParsed({ tags: [] }))!;
    expect(out.category).toBe('Vases');
    expect(out).not.toHaveProperty('tags');
    expect(out.ebayShippingClassification).toBe(classifyEbayShipping('Vases', ['stored']));
  });

  it('imported-only: recomputed from the written tags and the stored category when only the tags change', () => {
    const out = planEnrichWrites(full({ ebayOfferId: null, category: 'Stored Cat' }), ebayParsed({ categoryName: null }))!;
    expect(out.tags).toEqual(['ebay-tag']);
    expect(out).not.toHaveProperty('category');
    expect(out.ebayShippingClassification).toBe(classifyEbayShipping('Stored Cat', ['ebay-tag']));
  });

  it('a null stored category and null stored tags do not throw', () => {
    const out = planEnrichWrites({ ebayOfferId: null, category: null, tags: null, photoUrls: null }, ebayParsed({ categoryName: null, tags: [] }))!;
    expect(out).not.toHaveProperty('ebayShippingClassification');
    const out2 = planEnrichWrites({ ebayOfferId: null, category: null, tags: null }, ebayParsed({ categoryName: null }))!;
    expect(out2.ebayShippingClassification).toBe(classifyEbayShipping(null, ['ebay-tag']));
  });
});

describe('condition fill stays blank-only (fillBlankCondition)', () => {
  it('imported-only: blank condition and grade are filled when eBay states a level', () => {
    const out = planEnrichWrites(full({ ebayOfferId: null, condition: null, conditionGrade: null }), ebayParsed({ ebayCondition: canonicalFromEbayCondition('4000') }))!;
    expect(out.condition).toBe('USED');
    expect(out.conditionGrade).toBe('B');
  });

  it('imported-only: "Used" (3000) fills the condition but leaves the grade empty', () => {
    const out = planEnrichWrites(full({ ebayOfferId: null, condition: null, conditionGrade: null }), ebayParsed({ ebayCondition: canonicalFromEbayCondition('3000') }))!;
    expect(out.condition).toBe('USED');
    expect(out).not.toHaveProperty('conditionGrade');
  });

  it('never overwrites a stored condition or grade, on either kind of item', () => {
    for (const offer of ['OFFER1', null]) {
      const out = planEnrichWrites(full({ ebayOfferId: offer, condition: 'NEW', conditionGrade: 'A' }), ebayParsed({ ebayCondition: canonicalFromEbayCondition('6000') })) ?? {};
      expect(out).not.toHaveProperty('condition');
      expect(out).not.toHaveProperty('conditionGrade');
    }
  });

  it('an item we published fills a blank condition but never a grade', () => {
    const out = planEnrichWrites(full({ condition: null, conditionGrade: null }), ebayParsed({ ebayCondition: canonicalFromEbayCondition('4000') }))!;
    expect(out).toEqual({ condition: 'USED' });
  });

  it('no usable eBay condition writes nothing', () => {
    expect(planEnrichWrites(full({ condition: null, conditionGrade: null }), ebayParsed({ ebayCondition: canonicalFromEbayCondition('') }))).toBeNull();
  });
});

describe('source guard: the controller enrich pass uses the plan', () => {
  const controller = fs.readFileSync(path.join(__dirname, '../controllers/ebayController.ts'), 'utf8');
  const start = controller.indexOf('Fire-and-forget: GetItem enrichment');
  const end = controller.indexOf("[eBay Enrich] Background enrichment failed");
  const pass = controller.slice(start, end);

  it('found the enrich pass', () => {
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
  });

  it('selects both hold flags and the offer id', () => {
    expect(pass).toMatch(/ebaySyncHeldAt: true/);
    expect(pass).toMatch(/ebayContentDirtyAt: true/);
    expect(pass).toMatch(/ebayOfferId: true/);
  });

  it('filters with needsEnrichFetch and writes only what planEnrichWrites returns', () => {
    expect(pass).toMatch(/needsEnrichFetch\(/);
    expect(pass).toMatch(/planEnrichWrites\(item,/);
    expect(pass).toMatch(/data: backfill/);
    expect(controller).toMatch(/from '\.\.\/utils\/ebayEnrichPlan'/);
  });

  it('no longer overwrites fields inline', () => {
    expect(pass).not.toMatch(/backfill\.(description|photoUrls|category|tags|ebayCategoryId|ebayShippingClassification)\s*=/);
    expect(pass).not.toMatch(/Object\.assign\(backfill/);
  });

  it('the Trading import backfill treats offer-bearing, held and dirty items as blank-only for photos and category id', () => {
    expect(controller).toMatch(/const ownedOrProtected =/);
    expect(controller).toMatch(/existing\.ebaySyncHeldAt/);
    expect(controller).toMatch(/existing\.ebayContentDirtyAt/);
    expect(controller).toMatch(/ownedOrProtected \? !existing\.ebayCategoryId/);
  });
});
