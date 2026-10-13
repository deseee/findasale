/**
 * ADR-140 AT-28 (book half): the book version bumps on every mutation of settings, rules, the rate card and benchmarks (and
 * on nothing else), VERSION_CONFLICT, atomic reorder, and a starter only on an empty family.
 */
import { createFakePriceBookDb, FAKE_NOW, makeCtx, seedBook } from './__fixtures__/priceBookFakes';
import type { FakeDb } from './__fixtures__/priceBookFakes';
import {
  MAX_RULES_PER_FAMILY,
  applyTemplate,
  createRule,
  deleteRule,
  reorderRules,
  updateRule,
  upsertBook,
  validateSettingsPatch,
} from '../services/priceBook/bookService';
import { COPY } from '../services/priceBook/messages';
import { setLock } from '../services/priceBook/lockService';
import {
  adjustBulkRates,
  deleteBenchmark,
  deleteReference,
  importReferences,
  referencesFromStock,
  saveBulkRates,
  upsertBenchmark,
  upsertReference,
} from '../services/priceBook/referenceService';

const A = 'orgA';

const versionOf = (db: FakeDb): number => db.select('priceBook', { organizerId: A })[0]?.version as number;

function withBook(overrides: Record<string, unknown> = {}) {
  const db = createFakePriceBookDb();
  const book = seedBook(db, A, overrides);
  return { db, book, ctx: makeCtx(db, A) };
}

const rule = (name: string, extra: Record<string, unknown> = {}) => ({ family: 'RETAIL', name, basis: 'REFERENCE', percentBps: 9000, ...extra });

describe('version: settings', () => {
  test('the first write creates the book at version 1, off, with the documented defaults', async () => {
    const db = createFakePriceBookDb();
    const out = await upsertBook(makeCtx(db, A), {});
    expect(out).toMatchObject({ created: true, changed: true });
    expect(out.book).toMatchObject({ version: 1, enabled: false, allowCatalogReference: false, retailPercentBps: 10000, condLpBps: 9000, soldHistoryMinSales: 2 });
    expect(out.book.referenceOrder).toEqual(['MANUAL', 'SHOP_SOLD_HISTORY', 'SHOP_BENCHMARK', 'CATALOG_REFERENCE', 'LICENSED_FEED']);
  });

  test('a change adds exactly 1, however many settings it touches', async () => {
    const { db, ctx } = withBook();
    const out = await upsertBook(ctx, { enabled: true, retailPercentBps: 9500, condLpBps: 8500, referenceOrder: ['MANUAL', 'SHOP_BENCHMARK'] });
    expect(out).toMatchObject({ created: false, changed: true });
    expect(out.book.version).toBe(2);
    expect(versionOf(db)).toBe(2);
  });

  test('sending the same values changes nothing: no bump, no write', async () => {
    const { db, ctx } = withBook({ retailPercentBps: 9500 });
    const out = await upsertBook(ctx, { retailPercentBps: 9500, enabled: false, referenceOrder: ['MANUAL', 'SHOP_SOLD_HISTORY', 'SHOP_BENCHMARK', 'CATALOG_REFERENCE', 'LICENSED_FEED'] });
    expect(out.changed).toBe(false);
    expect(out.book.version).toBe(1);
    expect(db.writeCount()).toBe(0);
  });

  test('ifVersion: a match is accepted, a mismatch gives VERSION_CONFLICT (409) and changes nothing', async () => {
    const { db, ctx } = withBook();
    await expect(upsertBook(ctx, { retailPercentBps: 9000 }, 7)).rejects.toMatchObject({ code: 'VERSION_CONFLICT', status: 409 });
    expect(versionOf(db)).toBe(1);
    expect(db.writeCount()).toBe(0);
    const ok = await upsertBook(ctx, { retailPercentBps: 9000 }, 1);
    expect(ok.book.version).toBe(2);
    await expect(upsertBook(ctx, { retailPercentBps: 8000 }, 1)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  });

  test('two saves from the same version: one wins, the other gets VERSION_CONFLICT (compare and swap)', async () => {
    const { db, ctx } = withBook();
    const results = await Promise.allSettled([upsertBook(ctx, { retailPercentBps: 9000 }, 1), upsertBook(ctx, { retailPercentBps: 8000 }, 1)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(lost.reason).toMatchObject({ code: 'VERSION_CONFLICT' });
    expect(versionOf(db)).toBe(2);
  });

  test('updatedAt belongs to the database: the service never writes it', async () => {
    let now = FAKE_NOW;
    const db = createFakePriceBookDb({ clock: () => now });
    const ctx = makeCtx(db, A);
    await upsertBook(ctx, {});
    const created = db.select('priceBook')[0];
    now = new Date(FAKE_NOW.getTime() + 60_000);
    await upsertBook(ctx, { retailPercentBps: 9000 });
    const after = db.select('priceBook')[0];
    expect((after?.updatedAt as Date).getTime()).toBe(now.getTime());
    expect((created?.updatedAt as Date).getTime()).toBe(FAKE_NOW.getTime());
    for (const w of db.writes) expect(JSON.stringify(w.data ?? {})).not.toContain('updatedAt');
  });

  test('settings are validated; unknown or server-owned keys are refused and nothing is written', async () => {
    const { db, ctx } = withBook();
    const bad: Array<Record<string, unknown>> = [
      { organizerId: 'orgB' },
      { bookId: 'x' },
      { id: 'x' },
      { version: 99 },
      { createdAt: 'x' },
      { retailPercentBps: 0 },
      { retailPercentBps: 100001 },
      { retailPercentBps: 90.5 },
      { retailPercentBps: '9000' },
      { enabled: 'yes' },
      { condNmBps: 20001 },
      { movementReviewBps: 99 },
      { referenceOrder: [] },
      { referenceOrder: ['MANUAL', 'MANUAL'] },
      { referenceOrder: ['MANUAL', 'PRICECHARTING'] },
      { defaultRoundingMode: 'BANKER' },
      { defaultRoundingDirection: 'SIDEWAYS' },
      { soldHistoryWindowDays: 6 },
      { buyCreditBps: 9999 },
      { defaultFloorCents: 500, defaultCeilingCents: 100 },
      { referenceWarnDays: 100, referenceMaxDays: 50 },
      { soldHistoryMinSales: 6, soldHistoryMaxSales: 5 },
    ];
    for (const patch of bad) {
      await expect(upsertBook(ctx, patch)).rejects.toMatchObject({ code: 'VALIDATION', status: 400 });
    }
    expect(db.writeCount()).toBe(0);
    expect(versionOf(db)).toBe(1);
    expect(() => validateSettingsPatch('nope')).toThrow();
    expect(validateSettingsPatch({ defaultCeilingCents: null })).toEqual({ defaultCeilingCents: null });
  });
});

describe('version: rules', () => {
  test('create, update, delete and reorder each add 1; priorities start at 10 and step by 10', async () => {
    const { db, ctx } = withBook();
    const r1 = await createRule(ctx, rule('One'));
    expect(versionOf(db)).toBe(2);
    const r2 = await createRule(ctx, rule('Two', { rarityClass: 'rare' }));
    expect(versionOf(db)).toBe(3);
    expect([r1.priority, r2.priority]).toEqual([10, 20]);
    expect(r2.rarityClass).toBe('RARE');
    const upd = await updateRule(ctx, r2.id, { name: 'Two b', percentBps: 8000 });
    expect(versionOf(db)).toBe(4);
    expect(upd).toMatchObject({ name: 'Two b', percentBps: 8000, priority: 20, family: 'RETAIL' });
    await reorderRules(ctx, 'RETAIL', [r2.id, r1.id]);
    expect(versionOf(db)).toBe(5);
    await deleteRule(ctx, r1.id);
    expect(versionOf(db)).toBe(6);
  });

  test('reorder rewrites all priorities of the family; a wrong list changes nothing', async () => {
    const { db, ctx } = withBook();
    const ids: string[] = [];
    for (const n of ['a', 'b', 'c']) ids.push((await createRule(ctx, rule(n))).id);
    const before = versionOf(db);
    const out = await reorderRules(ctx, 'RETAIL', [ids[2] as string, ids[0] as string, ids[1] as string]);
    expect(out.map((r) => [r.name, r.priority])).toEqual([['c', 10], ['a', 20], ['b', 30]]);
    expect(versionOf(db)).toBe(before + 1);
    for (const wrong of [[ids[0]], [ids[0], ids[0], ids[1]], [...ids, 'extra'], [], 'nope']) {
      await expect(reorderRules(ctx, 'RETAIL', wrong)).rejects.toMatchObject({ code: 'VALIDATION' });
    }
    expect(versionOf(db)).toBe(before + 1);
  });

  test('reorder is atomic: a failure on the second row leaves priorities and version as they were', async () => {
    const { db, ctx } = withBook();
    const ids: string[] = [];
    for (const n of ['a', 'b', 'c']) ids.push((await createRule(ctx, rule(n))).id);
    const before = versionOf(db);
    let calls = 0;
    db.failWhen((table, op) => (table === 'priceBookRule' && op === 'updateMany' && (calls += 1) === 2 ? new Error('boom') : null));
    await expect(reorderRules(ctx, 'RETAIL', [ids[2] as string, ids[1] as string, ids[0] as string])).rejects.toThrow('boom');
    db.failWhen(null);
    expect(db.select('priceBookRule').map((r) => r.priority)).toEqual([10, 20, 30]);
    expect(versionOf(db)).toBe(before);
  });

  test('a rule change that fails validation or finds nothing does not bump', async () => {
    const { db, ctx } = withBook();
    const r1 = await createRule(ctx, rule('One'));
    const v = versionOf(db);
    await expect(createRule(ctx, rule('Bad', { percentBps: -1 }))).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(createRule(ctx, rule('Bad', { surprise: 1 }))).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(createRule(ctx, { ...rule('Bad'), family: 'SIDEWAYS' })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(createRule(ctx, rule('Bad', { creditBps: 12000 }))).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(createRule(ctx, rule('Bad', { basis: 'RETAIL_PRICE' }))).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(createRule(ctx, rule('Bad', { basis: 'FIXED_CENTS' }))).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(createRule(ctx, rule('Bad', { refMinCents: 500, refMaxCents: 100 }))).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(createRule(ctx, rule(''))).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(updateRule(ctx, r1.id, { name: 'x', percentBps: 1_000_000 })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(updateRule(ctx, 'nope', { name: 'x' })).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    await expect(deleteRule(ctx, 'nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(versionOf(db)).toBe(v);
  });

  test('updateRule honors ifVersion', async () => {
    const { db, ctx } = withBook();
    const r1 = await createRule(ctx, rule('One'));
    await expect(updateRule(ctx, r1.id, { name: 'x' }, versionOf(db) - 1)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    const ok = await updateRule(ctx, r1.id, { name: 'x' }, versionOf(db));
    expect(ok.name).toBe('x');
  });

  test('at most 100 rules in a family; the other family has its own 100', async () => {
    const { db, ctx } = withBook();
    for (let i = 0; i < MAX_RULES_PER_FAMILY; i += 1) {
      db.insert('priceBookRule', { bookId: db.select('priceBook')[0]?.id, family: 'RETAIL', name: `r${i}`, priority: (i + 1) * 10 });
    }
    await expect(createRule(ctx, rule('One too many'))).rejects.toMatchObject({ code: 'LIMIT_REACHED', status: 409 });
    const buy = await createRule(ctx, { family: 'BUYLIST', name: 'Buy', basis: 'REFERENCE', percentBps: 5000 });
    expect(buy.family).toBe('BUYLIST');
  });
});

describe('version: starting points', () => {
  test('a starter is applied only to an empty family, labelled, and bumps once', async () => {
    const { db, ctx } = withBook();
    const retail = await applyTemplate(ctx, 'RETAIL_STARTER');
    expect(retail.label).toBe(COPY.starterLabel);
    expect(retail.rules.map((r) => [r.name, r.percentBps, r.family])).toEqual([[COPY.starterSellAll, 10000, 'RETAIL']]);
    expect(versionOf(db)).toBe(2);
    await expect(applyTemplate(ctx, 'RETAIL_STARTER')).rejects.toMatchObject({ code: 'TEMPLATE_NEEDS_EMPTY', status: 409 });
    expect(versionOf(db)).toBe(2);
    const buy = await applyTemplate(ctx, 'BUYLIST_STARTER');
    expect(buy.rules.map((r) => [r.name, r.percentBps])).toEqual([[COPY.starterBuyUnder, 4000], [COPY.starterBuyMiddle, 5000], [COPY.starterBuyTop, 6000]]);
    expect(buy.rules.every((r) => r.creditBps === 12000 && r.family === 'BUYLIST')).toBe(true);
    expect(versionOf(db)).toBe(3);
    await expect(applyTemplate(ctx, 'NOPE')).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  test('a starter creates the book when there is none', async () => {
    const db = createFakePriceBookDb();
    await applyTemplate(makeCtx(db, A), 'RETAIL_STARTER');
    expect(versionOf(db)).toBe(2); // created at 1, the starter bumped once
  });

  test('a family with rules is not empty even if every rule is disabled', async () => {
    const { ctx } = withBook();
    await createRule(ctx, { family: 'RETAIL', name: 'Off', enabled: false, basis: 'REFERENCE', percentBps: 9000 });
    await expect(applyTemplate(ctx, 'RETAIL_STARTER')).rejects.toMatchObject({ code: 'TEMPLATE_NEEDS_EMPTY' });
  });
});

describe('version: benchmarks and the rate card bump; references and locks do not', () => {
  test('benchmarks: create and change bump; the same value again does not; delete bumps', async () => {
    const { db, ctx } = withBook();
    const input = { game: 'POKEMON', rarityClass: 'RARE', finish: 'HOLO', valueCents: 200, asOf: FAKE_NOW };
    const created = await upsertBenchmark(ctx, input);
    expect(created.created).toBe(true);
    expect(versionOf(db)).toBe(2);
    await upsertBenchmark(ctx, input);
    expect(versionOf(db)).toBe(2);
    await upsertBenchmark(ctx, { ...input, valueCents: 250 });
    expect(versionOf(db)).toBe(3);
    await deleteBenchmark(ctx, created.benchmark.id);
    expect(versionOf(db)).toBe(4);
    await expect(deleteBenchmark(ctx, created.benchmark.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(versionOf(db)).toBe(4);
    await expect(upsertBenchmark(ctx, { ...input, rarityClass: 'UNKNOWN' })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(upsertBenchmark(ctx, { ...input, valueCents: 0 })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(upsertBenchmark(ctx, { ...input, game: 'CHESS' })).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(versionOf(db)).toBe(4);
  });

  test('the rate card: one bump per save however many cells; a dry run, a no-op and a failure do not bump', async () => {
    const { db, ctx } = withBook();
    const rates = [
      { direction: 'SELL', tier: 'COMMON', unit: 'PER_1000', rateCents: 1000 },
      { direction: 'SELL', tier: 'UNCOMMON', unit: 'PER_1000', rateCents: 2000 },
      { direction: 'BUY', tier: 'COMMON', unit: 'PER_1000', rateCents: 500 },
    ];
    const dry = await saveBulkRates(ctx, { game: 'MTG', rates, dryRun: true });
    expect(dry).toMatchObject({ dryRun: true, created: 3, changed: 3 });
    expect(versionOf(db)).toBe(1);
    expect(db.select('priceBookBulkRate')).toHaveLength(0);
    const saved = await saveBulkRates(ctx, { game: 'MTG', rates });
    expect(saved).toMatchObject({ created: 3, updated: 0, deleted: 0, changed: 3, version: 2 });
    const same = await saveBulkRates(ctx, { game: 'MTG', rates });
    expect(same.changed).toBe(0);
    expect(versionOf(db)).toBe(2);
    await expect(saveBulkRates(ctx, { game: 'MTG', rates, ifVersion: 1 })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    await expect(saveBulkRates(ctx, { game: 'MTG', rates: [{ direction: 'SELL', tier: 'COMMON', unit: 'PER_1000', rateCents: 0 }] })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(saveBulkRates(ctx, { game: 'MTG', rates: [rates[0] as never, rates[0] as never] })).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(versionOf(db)).toBe(2);
    const mixed = await saveBulkRates(ctx, {
      game: 'MTG',
      rates: [
        { direction: 'SELL', tier: 'COMMON', unit: 'PER_1000', rateCents: 1100 },
        { direction: 'BUY', tier: 'COMMON', unit: 'PER_1000', rateCents: null },
      ],
    });
    expect(mixed).toMatchObject({ created: 0, updated: 1, deleted: 1, changed: 2, version: 3 });
  });

  test('a failure in the middle of a save rolls the whole save back, version included', async () => {
    const { db, ctx } = withBook();
    await saveBulkRates(ctx, { game: 'MTG', rates: [{ direction: 'SELL', tier: 'COMMON', unit: 'PER_1000', rateCents: 1000 }] });
    const before = versionOf(db);
    db.failWhen((table, op) => (table === 'priceBookBulkRate' && op === 'createMany' ? new Error('boom') : null));
    await expect(saveBulkRates(ctx, { game: 'MTG', rates: [{ direction: 'SELL', tier: 'COMMON', unit: 'PER_1000', rateCents: 2000 }, { direction: 'SELL', tier: 'RARE', unit: 'PER_1000', rateCents: 5000 }] })).rejects.toThrow('boom');
    db.failWhen(null);
    expect(db.select('priceBookBulkRate')).toHaveLength(1);
    expect(db.select('priceBookBulkRate')[0]?.rateCents).toBe(1000);
    expect(versionOf(db)).toBe(before);
  });

  test('moving all sell rates: a preview changes nothing; apply bumps once', async () => {
    const { db, ctx } = withBook();
    await saveBulkRates(ctx, { game: 'MTG', rates: [{ direction: 'SELL', tier: 'COMMON', unit: 'PER_1000', rateCents: 1000 }, { direction: 'SELL', tier: 'RARE', unit: 'PER_CARD', rateCents: 100 }] });
    const v = versionOf(db);
    const preview = await adjustBulkRates(ctx, { game: 'MTG', direction: 'SELL', percentBps: 1000, apply: false });
    expect(preview.applied).toBe(false);
    expect(preview.changes).toHaveLength(2);
    expect(versionOf(db)).toBe(v);
    const done = await adjustBulkRates(ctx, { game: 'MTG', direction: 'SELL', percentBps: 1000, apply: true });
    expect(done.applied).toBe(true);
    expect(done.version).toBe(v + 1);
    await expect(adjustBulkRates(ctx, { game: 'MTG', direction: 'SELL', percentBps: -9500, apply: true })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(adjustBulkRates(ctx, { game: 'MTG', direction: 'SELL', percentBps: 100, apply: true, ifVersion: 1 })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    expect(versionOf(db)).toBe(v + 1);
  });

  test('references, imports, "use my current prices" and locks never change the version', async () => {
    const { db, ctx } = withBook();
    seedPrintingAndStock(db);
    const v = versionOf(db);
    await upsertReference(ctx, { printingId: 'SCRYFALL:p1', finish: 'NONFOIL', valueCents: 150 });
    const ref = db.select('priceBookReference')[0];
    await upsertReference(ctx, { printingId: 'SCRYFALL:p1', finish: 'NONFOIL', valueCents: 175 });
    await importReferences(ctx, { csvText: 'Name,Price\nSol Ring,2.00', dryRun: false });
    await referencesFromStock(ctx, { overwrite: true });
    await deleteReference(ctx, ref?.id as string);
    const item = db.select('item')[0];
    await setLock(ctx, item?.id as string, { locked: true });
    await setLock(ctx, item?.id as string, { locked: false });
    expect(versionOf(db)).toBe(v);
  });
});

function seedPrintingAndStock(db: FakeDb): void {
  db.insert('cardPrinting', { id: 'SCRYFALL:p1', source: 'SCRYFALL', game: 'MTG', name: 'Lightning Bolt', setCode: 'm11', finishes: ['NONFOIL', 'FOIL'] });
  const item = db.insert('item', { organizerId: A, title: 'Bolt', price: 5 });
  db.insert('itemCard', { itemId: item.id, organizerId: A, catalogPrintingId: 'SCRYFALL:p1', cardName: 'Lightning Bolt', finish: 'NONFOIL', conditionCode: 'NM' });
}
