/**
 * ADR-135 batch E-B3, acceptance 7: taxonomy parsing into EtsyTaxonomyNode rows (level, isLeaf,
 * fullPath), replacement in one transaction, the 32-bit id guard, and the leaf picker working with
 * an EMPTY hints file (searchable leaf list plus keyword suggestions labeled "Suggested").
 * Fake database, injected Etsy request, no network.
 */

jest.mock('@sentry/node', () => ({ captureMessage: jest.fn() }));

import {
  ETSY_SUGGESTED_LABEL,
  ETSY_TAXONOMY_INSERT_CHUNK,
  ETSY_TAXONOMY_MAX_NODE_ID,
  ETSY_TAXONOMY_PATH,
  ensureEtsyTaxonomyLoaded,
  getEtsyTaxonomyNode,
  parseEtsyTaxonomyTree,
  refreshEtsyTaxonomy,
  refreshEtsyTaxonomyCache,
  resetEtsyTaxonomyLoadForTests,
  scoreEtsyTaxonomyLeaf,
  searchEtsyTaxonomyLeaves,
  tokenizeForTaxonomy,
} from '../etsyTaxonomy';
import { ETSY_CATEGORY_HINTS, getEtsyCategoryHintPrefixes } from '../../../config/etsyCategoryHints';
import { makeEtsyListingFakeDb, seedTaxonomy } from './etsyListingFakeDb';
import { etsyResp } from './etsyFakeDb';
import type { EtsyRequestOptions } from '../etsyHttp';

const ENV = { ETSY_CONNECTOR_ENABLED: 'true' };
const NOW = new Date('2026-10-03T12:00:00.000Z');

const NESTED = {
  count: 3,
  results: [
    {
      id: 1,
      level: 0,
      name: ' Home & Living ',
      parent_id: null,
      children: [
        { id: 10, name: 'Home Decor', parent_id: 1, children: [{ id: 1234, name: 'Candle Holders', parent_id: 10, children: [] }, { id: 1235, name: 'Wall Art', children: [] }] },
        { id: 11, name: 'Kitchen', parent_id: 1 },
      ],
    },
    { id: 2, name: 'Jewelry', children: [{ id: 20, name: 'Necklaces' }] },
  ],
};

describe('parseEtsyTaxonomyTree', () => {
  it('computes level (1 = top), isLeaf and fullPath from the nesting, trimming names', () => {
    const { rows, skippedInvalid, skippedDuplicate, skippedOrphan } = parseEtsyTaxonomyTree(NESTED);
    expect([skippedInvalid, skippedDuplicate, skippedOrphan]).toEqual([0, 0, 0]);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(1)).toEqual({ id: 1, parentId: null, name: 'Home & Living', level: 1, isLeaf: false, fullPath: 'Home & Living' });
    expect(byId.get(10)).toEqual({ id: 10, parentId: 1, name: 'Home Decor', level: 2, isLeaf: false, fullPath: 'Home & Living > Home Decor' });
    expect(byId.get(1234)).toEqual({ id: 1234, parentId: 10, name: 'Candle Holders', level: 3, isLeaf: true, fullPath: 'Home & Living > Home Decor > Candle Holders' });
    expect(byId.get(1235)?.parentId).toBe(10);
    expect(byId.get(11)).toMatchObject({ isLeaf: true, level: 2, fullPath: 'Home & Living > Kitchen' });
    expect(byId.get(20)).toMatchObject({ parentId: 2, level: 2, isLeaf: true, fullPath: 'Jewelry > Necklaces' });
    expect(rows).toHaveLength(7);
    expect(rows.filter((r) => r.isLeaf).map((r) => r.id).sort((a, b) => a - b)).toEqual([11, 20, 1234, 1235]);
  });

  it('does not trust a level field from Etsy', () => {
    const { rows } = parseEtsyTaxonomyTree({ results: [{ id: 5, name: 'Top', level: 9, children: [{ id: 6, name: 'Child', level: 0 }] }] });
    expect(rows.map((r) => r.level)).toEqual([1, 2]);
  });

  it('accepts a flat list that links nodes with parent_id, in any order', () => {
    const { rows } = parseEtsyTaxonomyTree([
      { id: 30, name: 'Leaf', parent_id: 20 },
      { id: 20, name: 'Middle', parent_id: 10 },
      { id: 10, name: 'Root', parent_id: null },
    ]);
    const leaf = rows.find((r) => r.id === 30);
    expect(leaf).toMatchObject({ level: 3, isLeaf: true, fullPath: 'Root > Middle > Leaf' });
    expect(rows.find((r) => r.id === 10)).toMatchObject({ level: 1, isLeaf: false });
  });

  it('guards ids outside the 32-bit range (skips the node and its whole subtree)', () => {
    expect(ETSY_TAXONOMY_MAX_NODE_ID).toBe(2147483647);
    const { rows, skippedInvalid } = parseEtsyTaxonomyTree({
      results: [
        { id: 2147483647, name: 'Largest allowed' },
        { id: 2147483648, name: 'Too big', children: [{ id: 7, name: 'Child of too big' }] },
        { id: 0, name: 'Zero' },
        { id: -4, name: 'Negative' },
        { id: 1.5, name: 'Fraction' },
        { id: '12', name: 'String id ok' },
        { id: 'abc', name: 'Not a number' },
        { id: 99999999999, name: 'Way too big' },
      ],
    });
    expect(rows.map((r) => r.id).sort((a, b) => a - b)).toEqual([12, 2147483647]);
    expect(skippedInvalid).toBe(6); // six bad ids; the child under the too-big node is never visited
  });

  it('skips empty names, keeps the first duplicate id, and drops orphans', () => {
    const { rows, skippedInvalid, skippedDuplicate, skippedOrphan } = parseEtsyTaxonomyTree({
      results: [
        { id: 1, name: 'A' },
        { id: 1, name: 'A again' },
        { id: 2, name: '   ' },
        { id: 3, name: 'Orphan', parent_id: 999 },
        { id: 4, name: 'B', parent_id: 1 },
      ],
    });
    expect(rows.map((r) => r.id)).toEqual([1, 4]);
    expect(rows.find((r) => r.id === 1)?.name).toBe('A');
    expect([skippedInvalid, skippedDuplicate, skippedOrphan]).toEqual([1, 1, 1]);
  });

  it('survives cycles and hostile depth without hanging', () => {
    const cyc = parseEtsyTaxonomyTree([{ id: 1, name: 'A', parent_id: 2 }, { id: 2, name: 'B', parent_id: 1 }]);
    expect(cyc.rows).toEqual([]);
    let node: any = { id: 1, name: 'n1' };
    const root = node;
    for (let i = 2; i < 200; i++) {
      node.children = [{ id: i, name: `n${i}` }];
      node = node.children[0];
    }
    const deep = parseEtsyTaxonomyTree({ results: [root] });
    expect(deep.rows.length).toBeLessThan(200);
    expect(deep.skippedOrphan).toBeGreaterThan(0);
  });

  it.each([[null], [undefined], [42], ['x'], [{}], [{ results: 'no' }], [[]]])('returns no rows for %p', (input) => {
    expect(parseEtsyTaxonomyTree(input).rows).toEqual([]);
  });
});

describe('refreshEtsyTaxonomy', () => {
  beforeEach(() => resetEtsyTaxonomyLoadForTests());

  it('replaces the cache in ONE transaction and reports counts', async () => {
    const db = makeEtsyListingFakeDb();
    seedTaxonomy(db); // old rows that must disappear
    const request = jest.fn(async (_o: EtsyRequestOptions) => etsyResp(200, NESTED));
    const out = await refreshEtsyTaxonomy({ db, env: ENV, now: () => NOW, request });
    expect(out).toEqual({ nodeCount: 7, leafCount: 4, skipped: 0 });
    expect(db.calls.transactions).toEqual([2]); // one transaction: deleteMany plus one createMany
    expect(db.calls.deleteMany).toBe(1);
    expect(db.store.nodes.map((n: any) => n.id).sort((a: number, b: number) => a - b)).toEqual([1, 2, 10, 11, 20, 1234, 1235]);
    expect(db.store.nodes.every((n: any) => n.fetchedAt.getTime() === NOW.getTime())).toBe(true);
    const row = db.store.nodes.find((n: any) => n.id === 1234);
    expect(row).toMatchObject({ parentId: 10, level: 3, isLeaf: true, fullPath: 'Home & Living > Home Decor > Candle Holders' });
  });

  it('asks Etsy once for the public tree, BACKGROUND by default', async () => {
    const db = makeEtsyListingFakeDb();
    const request = jest.fn(async (_o: EtsyRequestOptions) => etsyResp(200, NESTED));
    await refreshEtsyTaxonomy({ db, env: ENV, request });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toMatchObject({ method: 'GET', path: ETSY_TAXONOMY_PATH, priority: 'BACKGROUND' });
    expect(request.mock.calls[0][0].accessToken).toBeUndefined();
    await refreshEtsyTaxonomy({ db, env: ENV, request }, { priority: 'INTERACTIVE' });
    expect(request.mock.calls[1][0].priority).toBe('INTERACTIVE');
  });

  it('inserts in chunks inside the same single transaction', async () => {
    const db = makeEtsyListingFakeDb();
    const results = Array.from({ length: ETSY_TAXONOMY_INSERT_CHUNK + 500 }, (_v, i) => ({ id: i + 1, name: `Leaf ${i + 1}` }));
    await refreshEtsyTaxonomy({ db, env: ENV, request: async () => etsyResp(200, { results }) });
    expect(db.calls.transactions).toEqual([3]);
    expect(db.calls.createMany).toEqual([ETSY_TAXONOMY_INSERT_CHUNK, 500]);
    expect(db.store.nodes).toHaveLength(ETSY_TAXONOMY_INSERT_CHUNK + 500);
  });

  it('never wipes a good cache when Etsy fails or returns nothing usable', async () => {
    const db = makeEtsyListingFakeDb();
    seedTaxonomy(db);
    const before = db.store.nodes.length;
    await expect(refreshEtsyTaxonomy({ db, env: ENV, request: async () => etsyResp(500, { error: 'boom' }) })).rejects.toMatchObject({ code: 'ETSY_UPSTREAM' });
    await expect(refreshEtsyTaxonomy({ db, env: ENV, request: async () => etsyResp(200, { results: [] }) })).rejects.toMatchObject({ code: 'ETSY_UPSTREAM' });
    await expect(refreshEtsyTaxonomy({ db, env: ENV, request: async () => etsyResp(200, '<html>') })).rejects.toMatchObject({ code: 'ETSY_UPSTREAM' });
    expect(db.store.nodes).toHaveLength(before);
    expect(db.calls.transactions).toEqual([]);
    expect(db.calls.deleteMany).toBe(0);
  });

  it('makes no request when the kill switch is off', async () => {
    const db = makeEtsyListingFakeDb();
    const request = jest.fn(async (_o: EtsyRequestOptions) => etsyResp(200, NESTED));
    await expect(refreshEtsyTaxonomy({ db, env: { ETSY_CONNECTOR_ENABLED: 'false' }, request })).rejects.toMatchObject({ code: 'ETSY_DISABLED' });
    expect(request).not.toHaveBeenCalled();
  });

  it('refreshEtsyTaxonomyCache resolves to nothing (the housekeeping hook shape)', async () => {
    const db = makeEtsyListingFakeDb();
    await expect(refreshEtsyTaxonomyCache({ db, env: ENV, request: async () => etsyResp(200, NESTED) })).resolves.toBeUndefined();
    expect(db.store.nodes).toHaveLength(7);
  });
});

describe('ensureEtsyTaxonomyLoaded', () => {
  beforeEach(() => resetEtsyTaxonomyLoadForTests());

  it('loads on first use when empty (INTERACTIVE), and not again when populated', async () => {
    const db = makeEtsyListingFakeDb();
    const request = jest.fn(async (_o: EtsyRequestOptions) => etsyResp(200, NESTED));
    await expect(ensureEtsyTaxonomyLoaded({ db, env: ENV, request })).resolves.toBe(true);
    expect(request.mock.calls[0][0].priority).toBe('INTERACTIVE');
    await expect(ensureEtsyTaxonomyLoaded({ db, env: ENV, request })).resolves.toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('runs one load at a time per process', async () => {
    const db = makeEtsyListingFakeDb();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const request = jest.fn(async (_o: EtsyRequestOptions) => {
      await gate;
      return etsyResp(200, NESTED);
    });
    const a = ensureEtsyTaxonomyLoaded({ db, env: ENV, request });
    const b = ensureEtsyTaxonomyLoaded({ db, env: ENV, request });
    await new Promise((r) => setImmediate(r));
    release();
    await expect(Promise.all([a, b])).resolves.toEqual([true, true]);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('returns false (does not throw) when the first load fails, then can try again', async () => {
    const db = makeEtsyListingFakeDb();
    const failing = jest.fn(async (_o: EtsyRequestOptions) => etsyResp(503, null));
    await expect(ensureEtsyTaxonomyLoaded({ db, env: ENV, request: failing })).resolves.toBe(false);
    await expect(ensureEtsyTaxonomyLoaded({ db, env: ENV, request: async () => etsyResp(200, NESTED) })).resolves.toBe(true);
  });
});

describe('getEtsyTaxonomyNode', () => {
  it('returns a cached node by id or null', async () => {
    const db = makeEtsyListingFakeDb();
    seedTaxonomy(db);
    await expect(getEtsyTaxonomyNode(1234, { db })).resolves.toMatchObject({ id: 1234, isLeaf: true });
    await expect(getEtsyTaxonomyNode(4321, { db })).resolves.toBeNull();
  });
});

describe('tokenizing and scoring', () => {
  it('keeps words of three or more characters, drops stop words, de-duplicates, caps at 8', () => {
    expect(tokenizeForTaxonomy('Vintage BRASS Candle-Holder, set of 2 with the base')).toEqual(['brass', 'candle', 'holder', 'base']);
    expect(tokenizeForTaxonomy(null)).toEqual([]);
    expect(tokenizeForTaxonomy('aa bb')).toEqual([]);
    expect(tokenizeForTaxonomy('one two three four five six seven eight nine ten eleven twelve'.replace(/one|two/g, 'alpha beta'))).toHaveLength(8);
  });

  it('scores a hit in the leaf name above a hit elsewhere in the path', () => {
    const leaf = { name: 'Candle Holders', fullPath: 'Home & Living > Home Decor > Candle Holders' };
    expect(scoreEtsyTaxonomyLeaf(leaf, ['candle'])).toBe(3);
    expect(scoreEtsyTaxonomyLeaf(leaf, ['decor'])).toBe(1);
    expect(scoreEtsyTaxonomyLeaf(leaf, ['candle', 'decor', 'zzz'])).toBe(4);
    expect(scoreEtsyTaxonomyLeaf(leaf, [])).toBe(0);
  });
});

describe('searchEtsyTaxonomyLeaves with an EMPTY hints file', () => {
  beforeEach(() => resetEtsyTaxonomyLoadForTests());

  it('ships an empty hints map and resolves no prefixes from it', () => {
    expect(ETSY_CATEGORY_HINTS).toEqual({});
    expect(getEtsyCategoryHintPrefixes('Home & Garden')).toEqual([]);
  });

  it('suggests leaves from the item title, labeled Suggested, and never suggests non-leaves', async () => {
    const db = makeEtsyListingFakeDb();
    seedTaxonomy(db);
    const out = await searchEtsyTaxonomyLeaves({ itemTitle: 'Vintage Brass Candle Holder', itemCategory: 'Home & Garden' }, { db, env: ENV });
    expect(out.ready).toBe(true);
    expect(out.suggestedLabel).toBe('Suggested');
    expect(ETSY_SUGGESTED_LABEL).toBe('Suggested');
    expect(out.suggested.map((s) => s.id)).toEqual([1234, 20]);
    expect(out.suggested.every((s) => s.suggested === true)).toBe(true);
    expect(out.suggested.some((s) => s.id === 10 || s.id === 1)).toBe(false);
  });

  it('offers a searchable leaf list: all typed words must appear in the path, leaves only', async () => {
    const db = makeEtsyListingFakeDb();
    seedTaxonomy(db);
    const art = await searchEtsyTaxonomyLeaves({ query: 'decor wall' }, { db, env: ENV });
    expect(art.results.map((r) => r.id)).toEqual([1235]);
    expect(art.results[0]).toMatchObject({ name: 'Wall Art', fullPath: 'Home & Living > Home Decor > Wall Art', suggested: false });
    const decor = await searchEtsyTaxonomyLeaves({ query: 'DECOR' }, { db, env: ENV });
    expect(decor.results.map((r) => r.id)).toEqual([1234, 1235]);
    const none = await searchEtsyTaxonomyLeaves({ query: 'zzzz' }, { db, env: ENV });
    expect(none.results).toEqual([]);
  });

  it('marks search results that are also suggestions, and honors the limit', async () => {
    const db = makeEtsyListingFakeDb();
    seedTaxonomy(db);
    const out = await searchEtsyTaxonomyLeaves({ query: 'decor', itemTitle: 'candle holder', limit: 1 }, { db, env: ENV });
    expect(out.results).toHaveLength(1);
    expect(out.results[0]).toMatchObject({ id: 1234, suggested: true });
  });

  it('returns a gentle hint (no error) when there is nothing to search yet', async () => {
    const db = makeEtsyListingFakeDb();
    seedTaxonomy(db);
    const out = await searchEtsyTaxonomyLeaves({}, { db, env: ENV });
    expect(out).toMatchObject({ ready: true, suggested: [], results: [] });
    expect(out.message).toBe('Type a few words to search Etsy categories.');
  });

  it('reports not ready (and loads on first use) when the cache is empty', async () => {
    const db = makeEtsyListingFakeDb();
    const failing = await searchEtsyTaxonomyLeaves({ query: 'candle' }, { db, env: ENV, request: async () => etsyResp(503, null) });
    expect(failing).toMatchObject({ ready: false, suggested: [], results: [], message: 'Etsy categories are loading. Try again in a moment.' });
    resetEtsyTaxonomyLoadForTests();
    const loaded = await searchEtsyTaxonomyLeaves({ query: 'candle' }, { db, env: ENV, request: async () => etsyResp(200, NESTED) });
    expect(loaded.ready).toBe(true);
    expect(db.store.nodes).toHaveLength(7);
  });
});

describe('searchEtsyTaxonomyLeaves with hints (once authored)', () => {
  it('narrows suggestions to the hinted subtree and lists it when nothing is typed', async () => {
    const db = makeEtsyListingFakeDb();
    seedTaxonomy(db);
    const hints = { 'Jewelry & Watches': [['Jewelry'] as const], 'Home & Garden': [['Home & Living', 'Home Decor'] as const] };
    const jewelry = await searchEtsyTaxonomyLeaves({ itemTitle: 'Brass candle', itemCategory: 'Jewelry & Watches' }, { db, env: ENV }, hints);
    expect(jewelry.suggested.map((s) => s.id)).toEqual([20]); // the hinted branch wins over the better keyword match
    const listed = await searchEtsyTaxonomyLeaves({ itemCategory: 'Home & Garden' }, { db, env: ENV }, hints);
    expect(listed.results.map((r) => r.id)).toEqual([1234, 1235]);
  });

  it('falls back to keyword suggestions when the hinted branch has no match', async () => {
    const db = makeEtsyListingFakeDb();
    seedTaxonomy(db);
    const hints = { Crafts: [['Jewelry'] as const] };
    const out = await searchEtsyTaxonomyLeaves({ itemTitle: 'Candle holder', itemCategory: 'Crafts' }, { db, env: ENV }, hints);
    expect(out.suggested.map((s) => s.id)).toEqual([1234]);
  });

  it('ignores malformed hint paths', () => {
    expect(getEtsyCategoryHintPrefixes('X', { X: [[], [''], ['A', 'B']] as any })).toEqual(['A > B']);
    expect(getEtsyCategoryHintPrefixes(null)).toEqual([]);
    expect(getEtsyCategoryHintPrefixes('__proto__', {})).toEqual([]);
  });
});
