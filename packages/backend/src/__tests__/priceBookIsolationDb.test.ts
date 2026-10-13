/**
 * ADR-140 AT-20 (database half): tenant isolation. Organizer A can never see or alter organizer B's price book rows, or items,
 * through any B3a service, and every query and write a service makes is scoped to the caller's own book or items.
 *
 * The fake database logs every read and write (priceBookFakes.ts), so besides checking behaviour this suite checks the shape of
 * every query: child tables are only ever read with bookId, writes carry bookId, items are read with organizerId.
 */
import { createFakePriceBookDb, FAKE_NOW, makeCtx, seedBook, seedCardItem, seedPrinting, seedPurchase } from './__fixtures__/priceBookFakes';
import type { AnyRow, FakeDb, TableName } from './__fixtures__/priceBookFakes';
import {
  applyTemplate,
  createRule,
  deleteRule,
  getBookWithCounts,
  listRules,
  reorderRules,
  updateRule,
  upsertBook,
} from '../services/priceBook/bookService';
import type { BookRow } from '../services/priceBook/db';
import { listLocks, resolveLocks, setLock } from '../services/priceBook/lockService';
import {
  adjustBulkRates,
  deleteBenchmark,
  deleteReference,
  importReferences,
  listBenchmarks,
  listBulkRates,
  listReferences,
  referencesFromStock,
  saveBulkRates,
  upsertBenchmark,
  upsertReference,
} from '../services/priceBook/referenceService';
import { suggest, suggestForRoute } from '../services/priceBook/suggestService';

const A = 'orgA';
const B = 'orgB';

interface Org {
  id: string;
  book: AnyRow;
  item: AnyRow;
  rule: AnyRow;
  ref: AnyRow;
  bench: AnyRow;
  rate: AnyRow;
  lock: AnyRow;
  run: AnyRow;
  runItem: AnyRow;
}

function seedOrg(db: FakeDb, id: string, scale: number, extras: { buyRule: boolean }): Org {
  const book = seedBook(db, id, { version: 5, enabled: true, allowCatalogReference: true });
  const bookId = book.id as string;
  const { item } = seedCardItem(db, id, { price: 10 * scale }, { catalogPrintingId: 'SCRYFALL:p1', cardName: 'Lightning Bolt' });
  for (let i = 0; i < 3; i += 1) seedPurchase(db, item.id as string, { amount: 10 * scale, createdAt: new Date(FAKE_NOW.getTime() - (i + 1) * 86400000) });
  const rule = db.insert('priceBookRule', { bookId, family: 'RETAIL', name: `Retail ${id}`, priority: 10, percentBps: 5000 * scale });
  if (extras.buyRule) db.insert('priceBookRule', { bookId, family: 'BUYLIST', name: `Buy ${id}`, priority: 10, percentBps: 4000 });
  const ref = db.insert('priceBookReference', {
    bookId,
    cardKey: 'p:SCRYFALL:p1',
    catalogPrintingId: 'SCRYFALL:p1',
    game: 'MTG',
    finish: 'NONFOIL',
    language: 'en',
    valueCents: 500 * scale,
    asOf: FAKE_NOW,
  });
  const bench = db.insert('priceBookBenchmark', { bookId, game: 'POKEMON', rarityClass: 'RARE', finish: 'HOLO', valueCents: 200 * scale });
  const rate = db.insert('priceBookBulkRate', { bookId, direction: 'SELL', game: 'MTG', tier: 'COMMON', unit: 'PER_1000', rateCents: 1000 * scale });
  const lock = db.insert('priceBookLock', { bookId, itemId: item.id });
  const run = db.insert('priceBookRun', { bookId, kind: 'BULK', status: 'APPLIED', bookVersion: 5, expiresAt: FAKE_NOW });
  const runItem = db.insert('priceBookRunItem', {
    runId: run.id,
    itemId: item.id,
    itemTitle: 'Card',
    state: 'APPLIED',
    referenceCents: 500 * scale,
    bookVersion: 5,
    appliedAt: FAKE_NOW,
  });
  return { id, book, item, rule, ref, bench, rate, lock, run, runItem };
}

function world() {
  const db = createFakePriceBookDb();
  seedPrinting(db, { id: 'SCRYFALL:p1', name: 'Lightning Bolt', setCode: 'm11', collectorNumber: '149', rarity: 'common', finishes: ['NONFOIL', 'FOIL'] });
  seedPrinting(db, { id: 'SCRYFALL:p2', name: 'Sol Ring', setCode: 'c21', collectorNumber: '263', rarity: 'uncommon', finishes: ['NONFOIL'] });
  const a = seedOrg(db, A, 1, { buyRule: false });
  const b = seedOrg(db, B, 7, { buyRule: true });
  return { db, a, b };
}

/** Everything that belongs to organizer B, as a string, so "nothing changed" is one comparison. */
function snapshotOf(db: FakeDb, org: Org): string {
  const bookId = org.book.id as string;
  const runIds = db.select('priceBookRun', { bookId }).map((r) => r.id as string);
  const itemIds = db.select('item', { organizerId: org.id }).map((r) => r.id as string);
  const parts: Array<[TableName, AnyRow[]]> = [
    ['priceBook', db.select('priceBook', { organizerId: org.id })],
    ['priceBookRule', db.select('priceBookRule', { bookId })],
    ['priceBookReference', db.select('priceBookReference', { bookId })],
    ['priceBookBenchmark', db.select('priceBookBenchmark', { bookId })],
    ['priceBookBulkRate', db.select('priceBookBulkRate', { bookId })],
    ['priceBookLock', db.select('priceBookLock', { bookId })],
    ['priceBookRun', db.select('priceBookRun', { bookId })],
    ['priceBookRunItem', db.select('priceBookRunItem', { runId: { in: runIds } })],
    ['item', db.select('item', { organizerId: org.id })],
    ['itemCard', db.select('itemCard', { organizerId: org.id })],
    ['purchase', db.select('purchase', { itemId: { in: itemIds } })],
  ];
  return JSON.stringify(parts);
}

const CHILD_TABLES = ['priceBookRule', 'priceBookReference', 'priceBookBenchmark', 'priceBookBulkRate', 'priceBookLock', 'priceBookRun'];

function assertWritesScoped(db: FakeDb, own: Org): void {
  const bookId = own.book.id as string;
  for (const w of db.writes) {
    const where = (w.where ?? {}) as AnyRow;
    if (w.table === 'priceBook') {
      if (w.op === 'create') expect((w.data as AnyRow).organizerId).toBe(own.id);
      else expect(where.id === bookId || where.organizerId === own.id).toBe(true);
      continue;
    }
    if (!CHILD_TABLES.includes(w.table)) throw new Error(`unexpected write to ${w.table}`);
    if (w.op === 'create') expect((w.data as AnyRow).bookId).toBe(bookId);
    else if (w.op === 'createMany') (w.data as AnyRow[]).forEach((d) => expect(d.bookId).toBe(bookId));
    else expect(where.bookId).toBe(bookId); // updateMany and deleteMany never rely on a bare id
  }
}

function assertReadsScoped(db: FakeDb, own: Org): void {
  const bookId = own.book.id as string;
  const ownItems = new Set(db.select('item', { organizerId: own.id }).map((r) => r.id as string));
  const ownRuns = new Set(db.select('priceBookRun', { bookId }).map((r) => r.id as string));
  for (const r of db.reads) {
    const where = (r.where ?? {}) as AnyRow;
    if (r.table === 'priceBook') {
      expect(where.organizerId === own.id || where.id === bookId).toBe(true);
    } else if (['priceBookRule', 'priceBookReference', 'priceBookBenchmark', 'priceBookBulkRate', 'priceBookLock', 'priceBookRun'].includes(r.table)) {
      expect(where.bookId).toBe(bookId);
    } else if (r.table === 'item') {
      expect(where.organizerId).toBe(own.id);
    } else if (r.table === 'itemCard' || r.table === 'itemBulkLot') {
      // by organizer, or by item ids that were already organizer-checked
      const ids = (where.itemId as AnyRow | undefined)?.in as string[] | undefined;
      expect(where.organizerId === own.id || (ids !== undefined && ids.every((i) => ownItems.has(i)))).toBe(true);
    } else if (r.table === 'purchase') {
      const ids = (where.itemId as AnyRow | undefined)?.in as string[] | undefined;
      expect(ids !== undefined && ids.every((i) => ownItems.has(i))).toBe(true);
    } else if (r.table === 'priceBookRunItem') {
      // rows are read by item (already organizer-checked) and then kept only if their run belongs to the book
      const ids = (where.itemId as AnyRow | undefined)?.in as string[] | undefined;
      expect(ids !== undefined && ids.every((i) => ownItems.has(i))).toBe(true);
    } else if (r.table !== 'cardPrinting' && r.table !== 'cardPrice') {
      throw new Error(`unexpected read of ${r.table}`);
    }
  }
  expect(ownRuns.size).toBeGreaterThan(0);
}

const attempt = async (fn: () => Promise<unknown>): Promise<{ ok: boolean; code?: string; message?: string }> => {
  try {
    await fn();
    return { ok: true };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { ok: false, code: err.code, message: err.message };
  }
};

describe('isolation: book settings and rules', () => {
  test('counts and lists show only the caller\'s own rows', async () => {
    const { db, a } = world();
    const got = await getBookWithCounts(makeCtx(db, A));
    expect(got.book?.id).toBe(a.book.id);
    expect(got.counts).toEqual({ rules: 1, references: 1, benchmarks: 1, bulkRates: 1, locks: 1 });
    const rules = await listRules(makeCtx(db, A));
    expect(rules.map((r) => r.id)).toEqual([a.rule.id]);
  });

  test('a book change by A leaves B\'s book alone, and A\'s version check ignores B\'s version', async () => {
    const { db, a, b } = world();
    const before = snapshotOf(db, b);
    const out = await upsertBook(makeCtx(db, A), { retailPercentBps: 9000 }, 5);
    expect(out.book.version).toBe(6);
    expect(snapshotOf(db, b)).toBe(before);
    // B's version is also 5, so make them differ and check that A cannot pass with B's number.
    const stale = await attempt(() => upsertBook(makeCtx(db, A), { retailPercentBps: 8000 }, 5));
    expect(stale.code).toBe('VERSION_CONFLICT');
    expect(snapshotOf(db, b)).toBe(before);
    assertWritesScoped(db, a);
  });

  test('B\'s rule ids behave as missing for A (update, delete, reorder), and B keeps every rule', async () => {
    const { db, a, b } = world();
    const before = snapshotOf(db, b);
    const bRuleId = b.rule.id as string;
    expect((await attempt(() => updateRule(makeCtx(db, A), bRuleId, { name: 'Hijacked', basis: 'REFERENCE', percentBps: 1 }))).code).toBe('NOT_FOUND');
    expect((await attempt(() => deleteRule(makeCtx(db, A), bRuleId))).code).toBe('NOT_FOUND');
    expect((await attempt(() => reorderRules(makeCtx(db, A), 'RETAIL', [a.rule.id, bRuleId]))).code).toBe('VALIDATION');
    expect((await attempt(() => reorderRules(makeCtx(db, A), 'RETAIL', [bRuleId]))).code).toBe('VALIDATION');
    expect(snapshotOf(db, b)).toBe(before);
    const missing = await attempt(() => updateRule(makeCtx(db, A), 'rule_does_not_exist', { name: 'x' }));
    expect(missing.code).toBe('NOT_FOUND');
    assertWritesScoped(db, a);
  });

  test('creating rules and applying a starter affects only A, and B\'s rules do not block A\'s starter', async () => {
    const { db, a, b } = world();
    const before = snapshotOf(db, b);
    const tpl = await applyTemplate(makeCtx(db, A), 'BUYLIST_STARTER'); // B has buylist rules, A has none
    expect(tpl.rules.length).toBeGreaterThan(0);
    const created = await createRule(makeCtx(db, A), { family: 'RETAIL', name: 'Mine', basis: 'REFERENCE', percentBps: 9000 });
    expect(created.bookId).toBe(a.book.id);
    expect(snapshotOf(db, b)).toBe(before);
    assertWritesScoped(db, a);
  });

  test('an organizer with no book yet gets its own book on the first write; nobody else\'s book changes', async () => {
    const { db, b } = world();
    const before = snapshotOf(db, b);
    const out = await upsertBook(makeCtx(db, 'orgC'), { enabled: true });
    expect(out.created).toBe(true);
    expect(out.book.version).toBe(1);
    expect(db.select('priceBook')).toHaveLength(3);
    expect(snapshotOf(db, b)).toBe(before);
    expect((await getBookWithCounts(makeCtx(db, 'orgD'))).book).toBeNull();
  });
});

describe('isolation: references, benchmarks and the rate card', () => {
  test('lists show only A\'s rows', async () => {
    const { db, a } = world();
    const refs = await listReferences(makeCtx(db, A), {});
    expect(refs.rows.map((r) => r.id)).toEqual([a.ref.id]);
    expect((await listReferences(makeCtx(db, A), { q: 'p:' })).rows.length).toBeLessThanOrEqual(1);
    expect((await listBenchmarks(makeCtx(db, A))).map((r) => r.id)).toEqual([a.bench.id]);
    expect((await listBulkRates(makeCtx(db, A))).map((r) => r.id)).toEqual([a.rate.id]);
    expect(await listReferences(makeCtx(db, 'orgC'), {})).toEqual({ rows: [], nextCursor: null });
  });

  test('B\'s reference and benchmark ids behave as missing for A', async () => {
    const { db, b } = world();
    const before = snapshotOf(db, b);
    expect((await attempt(() => deleteReference(makeCtx(db, A), b.ref.id as string))).code).toBe('NOT_FOUND');
    expect((await attempt(() => deleteBenchmark(makeCtx(db, A), b.bench.id as string))).code).toBe('NOT_FOUND');
    expect(snapshotOf(db, b)).toBe(before);
  });

  test('saving the same card, benchmark or rate as B creates A\'s own row and leaves B\'s value', async () => {
    const { db, a, b } = world();
    const before = snapshotOf(db, b);
    await upsertReference(makeCtx(db, A), { printingId: 'SCRYFALL:p1', finish: 'NONFOIL', valueCents: 123 });
    await upsertBenchmark(makeCtx(db, A), { game: 'POKEMON', rarityClass: 'RARE', finish: 'HOLO', valueCents: 321 });
    await saveBulkRates(makeCtx(db, A), { game: 'MTG', rates: [{ direction: 'SELL', tier: 'COMMON', unit: 'PER_1000', rateCents: 4321 }] });
    expect(snapshotOf(db, b)).toBe(before);
    expect(db.select('priceBookReference', { bookId: a.book.id })).toHaveLength(1);
    expect(db.select('priceBookReference', { bookId: a.book.id })[0]?.valueCents).toBe(123);
    expect(db.select('priceBookBulkRate', { bookId: a.book.id })[0]?.rateCents).toBe(4321);
    expect(db.select('priceBookBenchmark', { bookId: a.book.id })[0]?.valueCents).toBe(321);
    assertWritesScoped(db, a);
  });

  test('deleting a rate cell and moving all rates change only A\'s rate card', async () => {
    const { db, a, b } = world();
    const before = snapshotOf(db, b);
    const adjusted = await adjustBulkRates(makeCtx(db, A), { game: 'MTG', direction: 'SELL', percentBps: 1000, apply: true });
    expect(adjusted.applied).toBe(true);
    expect(db.select('priceBookBulkRate', { bookId: a.book.id })[0]?.rateCents).toBe(1100);
    await saveBulkRates(makeCtx(db, A), { game: 'MTG', rates: [{ direction: 'SELL', tier: 'COMMON', unit: 'PER_1000', rateCents: null }] });
    expect(db.select('priceBookBulkRate', { bookId: a.book.id })).toHaveLength(0);
    expect(snapshotOf(db, b)).toBe(before);
    assertWritesScoped(db, a);
  });

  test('the import and "use my current prices" only read and write A\'s world', async () => {
    const { db, a, b } = world();
    const before = snapshotOf(db, b);
    const imp = await importReferences(makeCtx(db, A), { csvText: 'Name,Price\nLightning Bolt,1.50\nSol Ring,2.00', dryRun: false });
    expect(imp.willCreate).toBe(2);
    const stock = await referencesFromStock(makeCtx(db, A), { overwrite: true });
    expect(stock.considered).toBe(1); // only A's own item
    expect(db.select('priceBookReference', { bookId: a.book.id }).every((r) => (r.valueCents as number) <= 1000)).toBe(true);
    expect(snapshotOf(db, b)).toBe(before);
    assertWritesScoped(db, a);
    assertReadsScoped(db, a);
  });
});

describe('isolation: locks', () => {
  test('pinning or unpinning B\'s item as A behaves as a missing item and changes nothing', async () => {
    const { db, b } = world();
    const before = snapshotOf(db, b);
    const bItem = b.item.id as string;
    expect((await attempt(() => setLock(makeCtx(db, A), bItem, { locked: true }))).code).toBe('NOT_FOUND');
    expect((await attempt(() => setLock(makeCtx(db, A), bItem, { locked: false }))).code).toBe('NOT_FOUND');
    expect((await attempt(() => setLock(makeCtx(db, A), 'item_does_not_exist', { locked: true }))).code).toBe('NOT_FOUND');
    expect(db.writeCount('priceBookLock')).toBe(0);
    expect(snapshotOf(db, b)).toBe(before);
  });

  test('the same message for a foreign id and a missing id (a foreign item reveals nothing)', async () => {
    const { db, b } = world();
    const foreign = await attempt(() => setLock(makeCtx(db, A), b.item.id as string, { locked: true }));
    const missing = await attempt(() => setLock(makeCtx(db, A), 'item_nope', { locked: true }));
    expect(foreign).toEqual(missing);
  });

  test('A\'s lock list holds only A\'s pins; unpinning A\'s own item leaves B\'s pin', async () => {
    const { db, a, b } = world();
    const before = snapshotOf(db, b);
    expect((await listLocks(makeCtx(db, A))).map((l) => l.itemId)).toEqual([a.item.id]);
    const out = await setLock(makeCtx(db, A), a.item.id as string, { locked: false });
    expect(out.locked).toBe(false);
    expect(await listLocks(makeCtx(db, A))).toEqual([]);
    expect(snapshotOf(db, b)).toBe(before);
    assertWritesScoped(db, a);
  });

  test('resolving locks for A never reports B\'s items, and a stray lock row for B\'s item in A\'s book is not honored', async () => {
    const { db, a, b } = world();
    db.insert('priceBookLock', { bookId: a.book.id, itemId: b.item.id });
    const scope = { organizerId: A, bookId: a.book.id as string, manualLockDays: 14, now: FAKE_NOW };
    const map = await resolveLocks(db, scope, [a.item.id as string, b.item.id as string]);
    expect(Array.from(map.keys())).toEqual([a.item.id]);
    expect(map.get(a.item.id as string)?.kind).toBe('PIN');
    expect((await listLocks(makeCtx(db, A))).map((l) => l.itemId)).toEqual([a.item.id]);
  });
});

describe('isolation: suggestions', () => {
  test('a foreign item id behaves as a missing item', async () => {
    const { db, b } = world();
    const foreign = await attempt(() => suggest(makeCtx(db, A), [{ itemId: b.item.id as string }], { family: 'RETAIL' }));
    const missing = await attempt(() => suggest(makeCtx(db, A), [{ itemId: 'item_nope' }], { family: 'RETAIL' }));
    expect(foreign.code).toBe('NOT_FOUND');
    expect(foreign).toEqual(missing);
  });

  test('B\'s typed prices, sales and benchmarks never reach A\'s suggestion', async () => {
    const { db, a, b } = world();
    // Only B knows Sol Ring: a typed price, three sales and a benchmark.
    db.insert('priceBookReference', { bookId: b.book.id, cardKey: 'p:SCRYFALL:p2', game: 'MTG', finish: 'NONFOIL', language: 'en', valueCents: 99999, asOf: FAKE_NOW });
    const { item } = seedCardItem(db, B, { price: 999 }, { catalogPrintingId: 'SCRYFALL:p2', cardName: 'Sol Ring' });
    for (let i = 0; i < 3; i += 1) seedPurchase(db, item.id as string, { amount: 999, createdAt: new Date(FAKE_NOW.getTime() - (i + 1) * 86400000) });
    const before = snapshotOf(db, b);
    db.reads.length = 0;
    const asA = await suggest(makeCtx(db, A), [{ printingId: 'SCRYFALL:p2', finish: 'NONFOIL', conditionCode: 'NM' }], { family: 'RETAIL' });
    assertReadsScoped(db, a);
    expect(asA.results[0]?.suggestion.ok).toBe(false);
    expect(asA.results[0]?.suggestion.code).toBe('NO_REFERENCE');
    const asB = await suggest(makeCtx(db, B), [{ printingId: 'SCRYFALL:p2', finish: 'NONFOIL', conditionCode: 'NM' }], { family: 'RETAIL' });
    expect(asB.results[0]?.suggestion.referenceCents).toBe(99999);
    expect(snapshotOf(db, b)).toBe(before);
  });

  test('the same card gives each organizer its own number from its own book, version and lock', async () => {
    const { db, a, b } = world();
    const asA = await suggest(makeCtx(db, A), [{ itemId: a.item.id as string }], { family: 'RETAIL' });
    const asB = await suggest(makeCtx(db, B), [{ itemId: b.item.id as string }], { family: 'RETAIL' });
    expect(asA.results[0]?.suggestion.referenceCents).toBe(500);
    expect(asB.results[0]?.suggestion.referenceCents).toBe(3500);
    expect(asA.results[0]?.suggestion.rule?.name).toBe('Retail orgA');
    expect(asB.results[0]?.suggestion.rule?.name).toBe('Retail orgB');
    expect(asA.results[0]?.suggestion.lockedReason).toBe('PIN');
    expect(asB.bookVersion).toBe(5);
  });

  test('suggestForRoute answers null for an organizer with no book, whoever else has one', async () => {
    const { db } = world();
    expect(await suggestForRoute(makeCtx(db, 'orgC', { env: { CARD_PRICE_BOOK_ENABLED: 'true' } }), [{ printingId: 'SCRYFALL:p1', finish: 'NONFOIL', conditionCode: 'NM' }], { family: 'RETAIL' })).toBeNull();
  });

  test('every query a suggestion makes is scoped to the caller', async () => {
    const { db, a } = world();
    await suggest(makeCtx(db, A, { env: {} }), [{ itemId: a.item.id as string }, { printingId: 'SCRYFALL:p1', finish: 'FOIL', conditionCode: 'LP' }], { family: 'BUYLIST' });
    assertReadsScoped(db, a);
    expect(db.writes).toHaveLength(0);
  });
});

describe('isolation: the book row itself', () => {
  test('a book is found by organizer id only', async () => {
    const { db, a, b } = world();
    const row = (await getBookWithCounts(makeCtx(db, B))).book;
    expect(row?.id).toBe(b.book.id);
    expect(row?.id).not.toBe(a.book.id);
    const raw = db.select('priceBook') as unknown as BookRow[];
    expect(raw.map((r) => r.organizerId).sort()).toEqual([A, B]);
  });
});
