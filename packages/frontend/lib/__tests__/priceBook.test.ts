/**
 * priceBook (ADR-140 batch B6, AT-31 part): response readers, request body builders, API wrappers and the apply/undo loop.
 * Run: npm test   (node:test through tsx, no extra dependencies)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BULK_RATES_MAX_ROWS,
  RUN_LOOP_MAX_CALLS,
  SUGGEST_MAX_CARDS,
  buildAdjustBody,
  buildApplyBody,
  buildBenchmarkBody,
  buildBookBody,
  buildBulkRatesBody,
  buildFromStockBody,
  buildImportBody,
  buildLockBody,
  buildReferenceBody,
  buildReferencesParams,
  buildReorderBody,
  buildRuleBody,
  buildRunItemsParams,
  buildRunItemsPatch,
  buildRunPreviewBody,
  buildSuggestBody,
  chunkSuggestCards,
  createPriceBookApi,
  priceBookApi,
  readBenchmarks,
  readBook,
  readBulkRates,
  readLocks,
  readPriceBookError,
  readReferences,
  readRules,
  readRunItems,
  readRunList,
  readRunPreview,
  readRunProgress,
  readStatus,
  readSuggestResponse,
  readSuggestionResult,
  readVocabulary,
  runUntilDone,
  unwrapBody,
  UNKNOWN_PRICE_BOOK_STATUS,
  type PriceBookHttp,
  type RunProgress,
  type SuggestCardInput,
} from '../priceBook';
import { PRICE_BOOK_ERROR_WORDING } from '../priceBookCopy';

// The keys the server owns (ADR-140 section 10). The browser must never send them.
const SERVER_OWNED = ['bookId', 'organizerId', 'bookVersion', 'createdByUserId', 'version', 'state', 'selected', 'id', 'priority', 'createdAt', 'updatedAt'];

function keysOf(o: unknown): string[] {
  return Object.keys((o || {}) as Record<string, unknown>);
}

function assertNoServerKeys(o: unknown, where: string): void {
  for (const k of keysOf(o)) assert.ok(!SERVER_OWNED.includes(k), `${where} sent the server-owned key ${k}`);
}

interface Call {
  method: string;
  url: string;
  body?: unknown;
  params?: Record<string, unknown>;
}

function fakeHttp(respond: (c: Call) => unknown = () => ({ success: true, data: {} })): { http: PriceBookHttp; calls: Call[] } {
  const calls: Call[] = [];
  const run = async (c: Call): Promise<{ data: unknown }> => {
    calls.push(c);
    return { data: respond(c) };
  };
  const http: PriceBookHttp = {
    get: (url, config) => run({ method: 'GET', url, params: config ? config.params : undefined }),
    post: (url, body) => run({ method: 'POST', url, body }),
    put: (url, body) => run({ method: 'PUT', url, body }),
    patch: (url, body) => run({ method: 'PATCH', url, body }),
    delete: (url) => run({ method: 'DELETE', url }),
  };
  return { http, calls };
}

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

test('status: a full body is read, anything else means the price book is off', () => {
  const body = {
    success: true,
    data: {
      enabled: true,
      bookExists: true,
      bookEnabled: false,
      catalogReference: { platformOn: true, bookOptedIn: false },
      limits: { maxRulesPerFamily: 100, junk: 'x' },
      vocabulary: { finish: [{ code: 'FOIL', label: 'Foil' }, 'NONFOIL', { nope: 1 }], family: ['RETAIL', 'BUYLIST'], empty: [] },
    },
  };
  const s = readStatus(body);
  assert.equal(s.enabled, true);
  assert.equal(s.bookExists, true);
  assert.equal(s.bookEnabled, false);
  assert.deepEqual(s.catalogReference, { platformOn: true, bookOptedIn: false });
  assert.deepEqual(s.limits, { maxRulesPerFamily: 100 });
  assert.deepEqual(s.vocabulary.finish, [{ code: 'FOIL', label: 'Foil' }, { code: 'NONFOIL', label: 'NONFOIL' }]);
  assert.equal(s.vocabulary.empty, undefined);
  assert.deepEqual(readStatus(body.data), s, 'the envelope is optional');
  for (const bad of [null, undefined, 'x', 5, {}, { success: true }, { data: { enabled: 'yes' } }]) {
    assert.deepEqual(readStatus(bad), UNKNOWN_PRICE_BOOK_STATUS);
  }
  assert.equal(readStatus(null).enabled, false);
  // the default must not be shared, so one caller cannot change another's
  readStatus(null).catalogReference.platformOn = true;
  assert.equal(readStatus(null).catalogReference.platformOn, false);
  assert.deepEqual(readVocabulary(null), {});
});

test('book: null until the first write, then the settings and version', () => {
  assert.equal(readBook({ success: true, data: { book: null } }), null);
  assert.equal(readBook(null), null);
  assert.equal(readBook({ data: {} }), null);
  const b = readBook({
    success: true,
    data: {
      book: {
        enabled: true, version: 7, allowCatalogReference: false, referenceOrder: ['MANUAL', 'SHOP_SOLD_HISTORY'], retailPercentBps: 10000,
        defaultFloorCents: 0, defaultCeilingCents: null, defaultRoundingMode: 'TIERED', defaultRoundingDirection: 'NEAREST', condNmBps: 10000,
        condLpBps: 9000, condMpBps: 8000, condHpBps: 6500, condDmgBps: 5000, nonEnglishBps: 10000, movementReviewBps: 2500,
        referenceWarnDays: 90, referenceMaxDays: 365, soldHistoryMinSales: 2, soldHistoryMaxSales: 5, soldHistoryWindowDays: 180,
        manualLockDays: 14, buyCreditBps: 12000, counts: { rules: 3, references: 12, nope: 'x' },
      },
    },
  });
  assert.ok(b);
  assert.equal(b.version, 7);
  assert.equal(b.condLpBps, 9000);
  assert.equal(b.defaultCeilingCents, null);
  assert.deepEqual(b.referenceOrder, ['MANUAL', 'SHOP_SOLD_HISTORY']);
  assert.deepEqual(b.counts, { rules: 3, references: 12 });
  const sparse = readBook({ data: { book: { enabled: true } } });
  assert.ok(sparse);
  assert.equal(sparse.version, 1);
  assert.equal(sparse.defaultRoundingMode, 'TIERED');
});

test('rules: read in the order sent, bad rows dropped, an array or a list under "rules"', () => {
  const row = { id: 'r1', family: 'RETAIL', name: 'Rares', priority: 10, enabled: true, rarityClass: 'RARE', sourceKinds: ['MANUAL', 5], percentBps: 9500 };
  const rules = readRules({ success: true, data: { rules: [row, { id: 'r2', family: 'WRONG' }, null, { family: 'RETAIL' }, { ...row, id: 'r3', family: 'BUYLIST' }] } });
  assert.deepEqual(rules.map((r) => r.id), ['r1', 'r3']);
  assert.equal(rules[0].percentBps, 9500);
  assert.deepEqual(rules[0].sourceKinds, ['MANUAL']);
  assert.equal(rules[0].addCents, 0);
  assert.equal(rules[0].basis, 'REFERENCE');
  assert.equal(rules[0].floorCents, null);
  assert.equal(readRules([row]).length, 1);
  assert.deepEqual(readRules(null), []);
  assert.deepEqual(readRules({ data: { rules: 'x' } }), []);
});

test('references and benchmarks accept cents or dollars and drop rows without a price', () => {
  const refs = readReferences({
    success: true,
    data: {
      references: [
        { id: 'a', cardKey: 'p:X', game: 'MTG', finish: 'FOIL', valueCents: 1200, language: 'en', note: 'from my binder' },
        { id: 'b', cardKey: 's:lea|1|bolt|', game: 'MTG', finish: 'NONFOIL', price: 2.5 },
        { id: 'c', game: 'MTG', finish: 'FOIL' },
        { cardKey: 'p:Y', valueCents: 5 },
      ],
      nextCursor: 'abc',
    },
  });
  assert.deepEqual(refs.references.map((r) => [r.id, r.valueCents]), [['a', 1200], ['b', 250]]);
  assert.equal(refs.references[0].note, 'from my binder');
  assert.equal(refs.references[1].language, 'en');
  assert.equal(refs.nextCursor, 'abc');
  assert.equal(readReferences(null).nextCursor, null);
  const marks = readBenchmarks({ data: { benchmarks: [{ id: 'm', game: 'POKEMON', rarityClass: 'RARE', finish: 'HOLO', valueCents: 200, asOf: '2026-10-01T00:00:00.000Z' }, { id: 'n' }] } });
  assert.equal(marks.length, 1);
  assert.equal(marks[0].valueCents, 200);
  assert.equal(marks[0].asOf, '2026-10-01T00:00:00.000Z');
});

test('bulk rates and lots', () => {
  const r = readBulkRates({
    success: true,
    data: {
      version: 4,
      rates: [
        { direction: 'SELL', tier: 'COMMON', finish: 'ANY', unit: 'PER_1000', rateCents: 800, benchmarkNote: 'noted', benchmarkRateCents: 1000, benchmarkAsOf: '2026-10-12T00:00:00.000Z' },
        { direction: 'BUY', tier: 'RARE', unit: 'PER_CARD', price: 0.1, creditPrice: 0.12 },
        { direction: 'SELL', tier: 'LAND' },
      ],
      lots: [{ itemId: 'i1', title: 'Bulk commons', lotKind: 'BULK_COMMON', currentPerThousandCents: 800, rateCardPerThousandCents: null }, { title: 'no id' }],
    },
  });
  assert.equal(r.version, 4);
  assert.equal(r.rates.length, 2);
  assert.equal(r.rates[0].rateCents, 800);
  assert.equal(r.rates[0].benchmarkRateCents, 1000);
  assert.equal(r.rates[1].rateCents, 10);
  assert.equal(r.rates[1].creditRateCents, 12);
  assert.equal(r.rates[1].finish, 'ANY');
  assert.deepEqual(r.lots, [{ itemId: 'i1', title: 'Bulk commons', lotKind: 'BULK_COMMON', currentPerThousandCents: 800, rateCardPerThousandCents: null }]);
  assert.deepEqual(readBulkRates(null), { rates: [], lots: [], version: null });
});

test('suggest results: the ADR-140 section 10.1 example is read whole, and a failure row stays small', () => {
  const body = {
    success: true,
    data: {
      bookVersion: 7,
      results: [
        {
          ref: 'a1', ok: true, priceCents: 1025, price: 10.25, currency: 'USD', priceSource: 'MANUAL', priceAsOf: '2026-10-03T14:00:00.000Z',
          referenceCents: 1200, referenceOrigin: 'SHOP', referenceLabel: 'Your typed price',
          rule: { id: 'cm1xyz', name: 'Rares over $5', bookVersion: 7, isDefault: false }, unchanged: false, applyAllowed: true, lockedReason: null,
          review: { required: false, reasons: [], movePercent: 8 }, warnings: [{ code: 'CATALOG_ESTIMATE', message: 'm' }, { nope: 1 }],
          trace: [{ step: 'REFERENCE', label: 'Your typed price', beforeCents: null, afterCents: 1200 }, { label: 5 }], why: 'Based on your typed price.',
        },
        { ref: 'a2', ok: false, code: 'NO_REFERENCE', priceCents: null, applyAllowed: false, why: 'No suggestion yet. Add a price for this card in your price book.' },
        { ref: 'a3', priceCents: 5 },
        'junk',
      ],
    },
  };
  const out = readSuggestResponse(body);
  assert.equal(out.bookVersion, 7);
  assert.equal(out.results.length, 2);
  const a1 = out.results[0];
  assert.equal(a1.priceCents, 1025);
  assert.equal(a1.priceSource, 'MANUAL');
  assert.equal(a1.rule && a1.rule.name, 'Rares over $5');
  assert.equal(a1.lockedReason, undefined);
  assert.equal(a1.review && a1.review.movePercent, 8);
  assert.deepEqual(a1.warnings, [{ code: 'CATALOG_ESTIMATE', message: 'm' }]);
  assert.equal(a1.trace && a1.trace.length, 1);
  const a2 = out.results[1];
  assert.equal(a2.ok, false);
  assert.equal(a2.code, 'NO_REFERENCE');
  assert.equal(a2.priceCents, null);
  assert.equal(a2.applyAllowed, false);
  assert.deepEqual(a2.warnings, []);
  assert.equal(readSuggestionResult({ ok: 'yes' }), null);
  assert.equal(readSuggestionResult(null), null);
  assert.equal((readSuggestionResult({ ok: true, priceCents: 1, lockedReason: 'PIN' }) || { lockedReason: null }).lockedReason, 'PIN');
  assert.deepEqual(readSuggestResponse(null), { bookVersion: null, results: [] });
});

test('runs: preview, rows, list, locks and progress', () => {
  const preview = readRunPreview({
    success: true,
    data: {
      run: { id: 'cm2run', kind: 'BULK', status: 'PREVIEW', bookVersion: 7, expiresAt: '2026-10-12T20:30:00.000Z', counts: { eligible: 482, changes: 128, unchanged: 311, skipped: 24, review: 9 } },
      items: [
        { id: 'cm3ri', itemId: 'cm0abc', title: 'Lightning Bolt (M11) NM', oldPrice: 2.0, newPrice: 2.25, changePercent: 12.5, state: 'PENDING', selected: true, priceSource: 'SHOP_SOLD_HISTORY', why: '...', warnings: [], reviewReasons: [] },
        { id: 'bad' },
      ],
      nextCursor: null,
    },
  });
  assert.ok(preview);
  assert.equal(preview.run.id, 'cm2run');
  assert.deepEqual(preview.run.counts, { eligible: 482, changes: 128, unchanged: 311, skipped: 24, review: 9 });
  assert.equal(preview.items.length, 1);
  assert.equal(preview.items[0].newPrice, 2.25);
  assert.equal(preview.items[0].selected, true);
  assert.equal(preview.nextCursor, null);
  assert.equal(readRunPreview({ data: {} }), null);
  assert.equal(readRunPreview(null), null);
  const rows = readRunItems({ data: { items: [{ id: 'x', itemId: 'y', state: 'SKIPPED', skipReason: 'LOCKED' }], nextCursor: 'n2' } });
  assert.equal(rows.items[0].skipReason, 'LOCKED');
  assert.equal(rows.items[0].selected, false);
  assert.equal(rows.nextCursor, 'n2');
  assert.equal(readRunList({ data: { runs: [{ id: 'a', status: 'APPLIED', counts: {} }, { nope: 1 }] } }).length, 1);
  assert.equal(readLocks({ data: { locks: [{ itemId: 'i', lockedUntil: null }, {}] } }).length, 1);
  assert.deepEqual(readRunProgress({ success: true, data: { status: 'APPLYING', applied: 200, remaining: 300 } }), {
    status: 'APPLYING', applied: 200, remaining: 300, changedSince: 0, failed: 0, undone: 0, undoSkipped: 0,
  });
  const done = readRunProgress({ data: { status: 'PARTIAL', applied: 115, remaining: 0, changedSince: 4, failed: 1 } });
  assert.ok(done);
  assert.equal(done.changedSince, 4);
  assert.equal(done.failed, 1);
  assert.equal(readRunProgress({ data: { summary: { applied: 3 }, status: 'APPLIED' } })?.applied, 3);
  assert.equal(readRunProgress(null), null);
  assert.equal(readRunProgress({ data: { applied: 3 } }), null);
});

test('unwrapBody gives the data when there is an envelope and the body when there is not', () => {
  assert.deepEqual(unwrapBody({ success: true, data: { a: 1 } }), { a: 1 });
  assert.deepEqual(unwrapBody({ a: 1 }), { a: 1 });
  assert.equal(unwrapBody(null), null);
  assert.deepEqual(unwrapBody({ data: null, a: 1 }), { data: null, a: 1 });
});

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

test('errors: plain wording from the code, never the raw server text', () => {
  const e = readPriceBookError({ response: { status: 409, data: { success: false, error: 'raw words', code: 'BOOK_CHANGED', foo: 3 } } });
  assert.equal(e.status, 409);
  assert.equal(e.code, 'BOOK_CHANGED');
  assert.equal(e.message, PRICE_BOOK_ERROR_WORDING.BOOK_CHANGED);
  assert.ok(!e.message.includes('raw words'));
  assert.deepEqual(e.extra, { foo: 3 });
  assert.equal(readPriceBookError({ response: { status: 404, data: { code: 'PRICE_BOOK_DISABLED' } } }).message, PRICE_BOOK_ERROR_WORDING.PRICE_BOOK_DISABLED);
  assert.equal(readPriceBookError({ response: { status: 429, data: {} } }).code, 'RATE_LIMITED');
  assert.equal(readPriceBookError({ response: { status: 500 } }).code, 'SERVER_ERROR');
  assert.equal(readPriceBookError({ response: { status: 404 } }).code, 'NOT_FOUND');
  assert.equal(readPriceBookError({ response: { status: 400, data: { code: 'VALIDATION', issues: [1] } } }).extra.issues !== undefined, true);
  assert.equal(readPriceBookError({ response: { status: 418, data: {} } }).code, 'UNKNOWN');
  assert.equal(readPriceBookError({ response: { status: 418, data: {} } }).message, PRICE_BOOK_ERROR_WORDING.UNKNOWN);
  assert.equal(readPriceBookError({ response: { status: 409, data: { code: 'constructor' } } }).message, PRICE_BOOK_ERROR_WORDING.UNKNOWN);
  for (const bad of [new Error('Network Error'), null, undefined, 'x', {}]) {
    const n = readPriceBookError(bad);
    assert.equal(n.code, 'NETWORK_ERROR');
    assert.equal(n.status, null);
    assert.equal(n.message, PRICE_BOOK_ERROR_WORDING.NETWORK_ERROR);
  }
});

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

test('book body: only the settings columns and ifVersion', () => {
  const body = buildBookBody(
    { enabled: true, retailPercentBps: 9500, condLpBps: 8500, id: 'x', organizerId: 'o', version: 9, createdAt: 'z', bogus: 1 } as never,
    7
  );
  assert.deepEqual(body, { enabled: true, retailPercentBps: 9500, condLpBps: 8500, ifVersion: 7 });
  assert.deepEqual(buildBookBody({}), {});
  assert.deepEqual(buildBookBody({ defaultCeilingCents: null }), { defaultCeilingCents: null });
  assert.deepEqual(buildBookBody({ enabled: false }, null), { enabled: false });
});

test('rule body: the matcher and action fields only, the name is trimmed and capped, nothing the server owns', () => {
  const body = buildRuleBody(
    {
      family: 'RETAIL', name: '  Rares over $5  ', enabled: true, rarityClass: 'RARE', finish: 'FOIL', refMinCents: 500, sourceKinds: ['MANUAL'],
      basis: 'REFERENCE', percentBps: 9500, roundingMode: 'NEAREST_25C', roundingDirection: 'NEAREST', floorCents: 99, game: null,
      id: 'r1', bookId: 'b', organizerId: 'o', priority: 10, productType: 'SEALED', version: 3, createdAt: 'x',
    } as never,
    7
  );
  assert.equal(body.name, 'Rares over $5');
  assert.equal(body.family, 'RETAIL');
  assert.equal(body.ifVersion, 7);
  assert.equal(body.game, null);
  assert.equal(body.percentBps, 9500);
  assert.deepEqual(body.sourceKinds, ['MANUAL']);
  assertNoServerKeys(body, 'rule');
  assert.ok(!('productType' in body));
  assert.equal(buildRuleBody({ family: 'BUYLIST', name: 'x'.repeat(200) }).name, 'x'.repeat(80));
  assert.ok(!('enabled' in buildRuleBody({ family: 'BUYLIST', name: 'n' })));
  assert.ok(!('ifVersion' in buildRuleBody({ family: 'BUYLIST', name: 'n' })));
  assert.deepEqual(buildReorderBody('BUYLIST', ['a', 'b']), { family: 'BUYLIST', ids: ['a', 'b'] });
});

test('reference and benchmark bodies send dollars, trim text and cap the note', () => {
  const body = buildReferenceBody({
    printingId: ' SCRYFALL:9f0e ', typed: { setCode: ' base1 ', cardName: '', rarity: 'Rare' }, game: 'POKEMON', finish: 'HOLO', language: 'en',
    priceCents: 1999, note: 'n'.repeat(500), asOf: '2026-10-03T14:00:00.000Z',
  });
  assert.equal(body.printingId, 'SCRYFALL:9f0e');
  assert.deepEqual(body.typed, { setCode: 'base1', rarity: 'Rare' });
  assert.equal(body.price, 19.99);
  assert.equal((body.note as string).length, 200);
  assert.equal(body.game, 'POKEMON');
  assertNoServerKeys(body, 'reference');
  const plain = buildReferenceBody({ finish: 'FOIL', language: 'en', priceCents: 100 });
  assert.deepEqual(plain, { finish: 'FOIL', language: 'en', price: 1 });
  const bm = buildBenchmarkBody({ game: 'POKEMON', rarityClass: 'RARE', finish: 'HOLO', priceCents: 200, note: ' typical ' });
  assert.deepEqual(bm, { game: 'POKEMON', rarityClass: 'RARE', finish: 'HOLO', price: 2, note: 'typical' });
});

test('from-stock and import bodies', () => {
  assert.deepEqual(buildFromStockBody({ overwrite: false }), { overwrite: false });
  assert.deepEqual(buildFromStockBody({ saleId: 's1', game: 'MTG', overwrite: true }), { saleId: 's1', game: 'MTG', overwrite: true });
  assert.deepEqual(buildImportBody({ csvText: 'Name,Price\nBolt,1', dryRun: true }), { csvText: 'Name,Price\nBolt,1', dryRun: true });
  assert.deepEqual(buildImportBody({ rows: [{ Name: 'Bolt' }], dryRun: false }), { rows: [{ Name: 'Bolt' }], dryRun: false });
  assert.deepEqual(buildImportBody({ csvText: '', rows: null, dryRun: true }), { dryRun: true });
});

test('bulk rates body: dollars, null deletes a cell, over 600 rows is refused', () => {
  const body = buildBulkRatesBody(
    'MTG',
    [
      { direction: 'SELL', tier: 'COMMON', finish: 'ANY', unit: 'PER_1000', priceCents: 800, benchmarkNote: ' noted ', benchmarkPriceCents: 1000, benchmarkAsOf: '2026-10-12T00:00:00.000Z' },
      { direction: 'BUY', tier: 'RARE', finish: 'ANY', unit: 'PER_CARD', priceCents: 10, creditPriceCents: 12 },
      { direction: 'SELL', tier: 'LAND', finish: 'ANY', unit: 'PER_1000', priceCents: null },
    ],
    4
  );
  assert.ok(body);
  assert.equal(body.game, 'MTG');
  assert.equal(body.ifVersion, 4);
  const rates = body.rates as Array<Record<string, unknown>>;
  assert.deepEqual(rates[0], { direction: 'SELL', tier: 'COMMON', finish: 'ANY', unit: 'PER_1000', price: 8, benchmarkNote: 'noted', benchmarkPrice: 10, benchmarkAsOf: '2026-10-12T00:00:00.000Z' });
  assert.deepEqual(rates[1], { direction: 'BUY', tier: 'RARE', finish: 'ANY', unit: 'PER_CARD', price: 0.1, creditPrice: 0.12 });
  assert.equal(rates[2].price, null);
  const many = Array.from({ length: BULK_RATES_MAX_ROWS + 1 }, () => ({ direction: 'SELL', tier: 'COMMON', finish: 'ANY', unit: 'PER_1000', priceCents: 1 }));
  assert.equal(buildBulkRatesBody('MTG', many), null);
  assert.ok(buildBulkRatesBody('MTG', many.slice(0, BULK_RATES_MAX_ROWS)));
});

test('adjust body: -90 to 500 percent only', () => {
  assert.deepEqual(buildAdjustBody({ game: 'MTG', direction: 'SELL', percent: -10, apply: false }), { game: 'MTG', direction: 'SELL', percent: -10, apply: false });
  assert.deepEqual(buildAdjustBody({ game: 'MTG', finish: 'FOIL', direction: 'BUY', percent: 500, apply: true }), { game: 'MTG', finish: 'FOIL', direction: 'BUY', percent: 500, apply: true });
  assert.ok(buildAdjustBody({ game: 'MTG', direction: 'SELL', percent: -90, apply: false }));
  assert.equal(buildAdjustBody({ game: 'MTG', direction: 'SELL', percent: -91, apply: false }), null);
  assert.equal(buildAdjustBody({ game: 'MTG', direction: 'SELL', percent: 501, apply: false }), null);
  assert.equal(buildAdjustBody({ game: 'MTG', direction: 'SELL', percent: NaN, apply: false }), null);
});

test('suggest body: fixed keys, trimmed text, at most 100 cards per call, chunking for more', () => {
  const card: SuggestCardInput = {
    ref: 'a1', itemId: ' cm0abc ', printingId: '', game: 'MTG', finish: 'FOIL', conditionCode: 'LP', language: 'en', quantity: 3,
    typed: { setCode: 'base1', collectorNumber: '4/102', cardName: 'Charizard', setName: 'Base Set (Shadowless)', rarity: 'Rare' },
  };
  const body = buildSuggestBody('RETAIL', [{ ...card, extra: 1, organizerId: 'o', bookVersion: 1 } as never]);
  assert.equal(body.family, 'RETAIL');
  const sent = (body.cards as Array<Record<string, unknown>>)[0];
  assert.deepEqual(Object.keys(sent).sort(), ['conditionCode', 'finish', 'game', 'itemId', 'language', 'quantity', 'ref', 'typed'].sort());
  assert.equal(sent.itemId, 'cm0abc');
  assertNoServerKeys(sent, 'suggest card');
  assert.equal(((buildSuggestBody('RETAIL', [{ ref: 'z', finish: 'FOIL', quantity: 0 }]).cards as Array<Record<string, unknown>>)[0]).quantity, undefined);
  assert.equal(((buildSuggestBody('RETAIL', [{ ref: 'z', finish: 'FOIL', quantity: 1.5 }]).cards as Array<Record<string, unknown>>)[0]).quantity, undefined);
  const many = Array.from({ length: 250 }, (_, i) => ({ ref: `r${i}`, finish: 'FOIL' }));
  assert.equal((buildSuggestBody('RETAIL', many).cards as unknown[]).length, SUGGEST_MAX_CARDS);
  const chunks = chunkSuggestCards(many);
  assert.deepEqual(chunks.map((c) => c.length), [100, 100, 50]);
  assert.deepEqual(chunkSuggestCards([]), []);
  assert.deepEqual(chunkSuggestCards([1, 2, 3], 2), [[1, 2], [3]]);
});

test('lock, run preview, row patch and apply bodies', () => {
  assert.deepEqual(buildLockBody({ locked: true }), { locked: true });
  assert.deepEqual(buildLockBody({ locked: true, until: '2026-12-01T00:00:00.000Z' }), { locked: true, until: '2026-12-01T00:00:00.000Z' });
  assert.deepEqual(buildLockBody({ locked: false, until: '2026-12-01T00:00:00.000Z' }), { locked: false });

  assert.deepEqual(buildRunPreviewBody({ kind: 'BULK' }), { kind: 'BULK', scope: { onlyUnpriced: false }, includeMarkedDown: false, includeEbayLive: false });
  const withBatch = buildRunPreviewBody({ kind: 'BULK', scope: { saleId: 's1', game: 'MTG', onlyUnpriced: true, intakeBatchId: 'batch1' }, includeEbayLive: true });
  assert.deepEqual(withBatch, { kind: 'BULK', scope: { saleId: 's1', game: 'MTG', onlyUnpriced: true, intakeBatchId: 'batch1' }, includeMarkedDown: false, includeEbayLive: true });
  // intakeBatchId is only accepted together with onlyUnpriced (section 10.2)
  const dropped = buildRunPreviewBody({ kind: 'BULK', scope: { intakeBatchId: 'batch1' } });
  assert.ok(!('intakeBatchId' in (dropped.scope as object)));
  assert.equal(buildRunPreviewBody({ kind: 'LOT' }).kind, 'LOT');

  assert.deepEqual(buildRunItemsPatch({ selectIds: ['a'], deselectIds: [], selectAllChanges: true }), { selectIds: ['a'], selectAllChanges: true });
  assert.deepEqual(buildRunItemsPatch({}), {});
  assertNoServerKeys(buildRunItemsPatch({ selectIds: ['a'], selectReview: false }), 'patch');
  assert.deepEqual(buildApplyBody({ ifBookVersion: 7, expectedCount: 119 }), { ifBookVersion: 7, expectedCount: 119 });
});

test('query params are trimmed and capped', () => {
  assert.deepEqual(buildReferencesParams({ game: ' MTG ', q: '', cursor: null, limit: 500 }), { game: 'MTG', limit: 100 });
  assert.deepEqual(buildReferencesParams({ q: 'bolt', limit: 0 }), { q: 'bolt', limit: 1 });
  assert.deepEqual(buildReferencesParams({}), {});
  assert.deepEqual(buildRunItemsParams({ view: 'review', cursor: 'c', limit: 999 }), { view: 'review', cursor: 'c', limit: 200 });
  assert.deepEqual(buildRunItemsParams({}), {});
});

// ---------------------------------------------------------------------------
// Wrappers
// ---------------------------------------------------------------------------

test('wrappers call the documented paths with the documented methods', async () => {
  const { http, calls } = fakeHttp((c) => {
    if (c.url.endsWith('/status')) return { success: true, data: { enabled: true, bookExists: true, bookEnabled: true, catalogReference: { platformOn: true, bookOptedIn: false }, limits: {}, vocabulary: {} } };
    if (c.url.endsWith('/suggest')) return { success: true, data: { bookVersion: 7, results: [{ ref: 'a', ok: false, code: 'NO_REFERENCE', priceCents: null }] } };
    if (c.url.endsWith('/runs/preview')) return { success: true, data: { run: { id: 'r', kind: 'BULK', status: 'PREVIEW', counts: {} }, items: [] } };
    return { success: true, data: {} };
  });
  const pb = createPriceBookApi(http);

  assert.equal((await pb.getStatus()).enabled, true);
  await pb.getBook();
  await pb.putBook({ enabled: true }, 3);
  await pb.applyTemplate('RETAIL_STARTER');
  await pb.listRules('RETAIL');
  await pb.listRules();
  await pb.createRule({ family: 'RETAIL', name: 'All cards' });
  await pb.updateRule('r/1', { family: 'RETAIL', name: 'All cards' }, 4);
  await pb.deleteRule('r1');
  await pb.reorderRules('RETAIL', ['b', 'a']);
  await pb.listReferences({ game: 'MTG', limit: 50 });
  await pb.putReference({ finish: 'FOIL', language: 'en', priceCents: 100, printingId: 'p' });
  await pb.deleteReference('x1');
  await pb.referencesFromStock({ overwrite: false });
  await pb.importReferences({ csvText: 'a', dryRun: true });
  await pb.listBenchmarks();
  await pb.putBenchmark({ game: 'MTG', rarityClass: 'RARE', finish: 'ANY', priceCents: 100 });
  await pb.deleteBenchmark('b1');
  await pb.getBulkRates('MTG');
  assert.ok(await pb.putBulkRates('MTG', [{ direction: 'SELL', tier: 'COMMON', finish: 'ANY', unit: 'PER_1000', priceCents: 800 }], 2));
  assert.ok(await pb.adjustBulkRates({ game: 'MTG', direction: 'SELL', percent: -10, apply: false }));
  await pb.buylistQuote([{ ref: 'a', finish: 'FOIL' }]);
  await pb.buylistBulkQuote('MTG', [{ tier: 'COMMON', finish: 'ANY', cards: 3000 }]);
  const suggested = await pb.suggest('RETAIL', [{ ref: 'a', finish: 'FOIL' }]);
  assert.equal(suggested.results[0].code, 'NO_REFERENCE');
  await pb.putLock('item/1', { locked: true });
  await pb.listLocks(20);
  const preview = await pb.previewRun({ kind: 'BULK' });
  assert.ok(preview);
  await pb.listRuns();
  await pb.getRun('run1');
  await pb.listRunItems('run1', { view: 'changes', limit: 200 });
  await pb.patchRunItems('run1', { selectAllChanges: true });
  await pb.applyRun('run1', { ifBookVersion: 7, expectedCount: 3 });
  await pb.undoRun('run1');
  await pb.cancelRun('run1');

  const seen = calls.map((c) => `${c.method} ${c.url}`);
  assert.deepEqual(seen, [
    'GET /price-book/status',
    'GET /price-book/book',
    'PUT /price-book/book',
    'POST /price-book/book/templates',
    'GET /price-book/rules',
    'GET /price-book/rules',
    'POST /price-book/rules',
    'PUT /price-book/rules/r%2F1',
    'DELETE /price-book/rules/r1',
    'POST /price-book/rules/reorder',
    'GET /price-book/references',
    'PUT /price-book/references',
    'DELETE /price-book/references/x1',
    'POST /price-book/references/from-stock',
    'POST /price-book/references/import',
    'GET /price-book/benchmarks',
    'PUT /price-book/benchmarks',
    'DELETE /price-book/benchmarks/b1',
    'GET /price-book/bulk-rates',
    'PUT /price-book/bulk-rates',
    'POST /price-book/bulk-rates/adjust',
    'POST /price-book/buylist/quote',
    'POST /price-book/buylist/bulk-quote',
    'POST /price-book/suggest',
    'PUT /price-book/locks/item%2F1',
    'GET /price-book/locks',
    'POST /price-book/runs/preview',
    'GET /price-book/runs',
    'GET /price-book/runs/run1',
    'GET /price-book/runs/run1/items',
    'PATCH /price-book/runs/run1/items',
    'POST /price-book/runs/run1/apply',
    'POST /price-book/runs/run1/undo',
    'POST /price-book/runs/run1/cancel',
  ]);
  assert.deepEqual(calls[4].params, { family: 'RETAIL' });
  assert.equal(calls[5].params, undefined);
  assert.deepEqual(calls[2].body, { enabled: true, ifVersion: 3 });
  assert.deepEqual(calls[3].body, { template: 'RETAIL_STARTER' });
  assert.equal((calls[7].body as Record<string, unknown>).ifVersion, 4);
  assert.deepEqual(calls[10].params, { game: 'MTG', limit: 50 });
  assert.equal((calls[11].body as Record<string, unknown>).price, 1);
  assert.deepEqual(calls[18].params, { game: 'MTG' });
  assert.deepEqual(calls[29].params, { view: 'changes', limit: 200 });
  assert.deepEqual(calls[31].body, { ifBookVersion: 7, expectedCount: 3 });
  assert.deepEqual(calls[32].body, {}, 'undo sends an empty body');
  // no write ever carries a key the server owns
  for (const c of calls) if (c.method !== 'GET' && c.method !== 'DELETE') assertNoServerKeys(c.body, `${c.method} ${c.url}`);
});

test('wrappers refuse an oversized grid or an out-of-range percent without sending anything', async () => {
  const { http, calls } = fakeHttp();
  const pb = createPriceBookApi(http);
  const many = Array.from({ length: BULK_RATES_MAX_ROWS + 1 }, () => ({ direction: 'SELL', tier: 'COMMON', finish: 'ANY', unit: 'PER_1000', priceCents: 1 }));
  assert.equal(await pb.putBulkRates('MTG', many), null);
  assert.equal(await pb.adjustBulkRates({ game: 'MTG', direction: 'SELL', percent: 900, apply: true }), null);
  assert.equal(calls.length, 0);
});

test('wrappers let a failed request through as the thrown value so the screen can use readPriceBookError', async () => {
  const http: PriceBookHttp = {
    get: async () => {
      throw { response: { status: 404, data: { code: 'PRICE_BOOK_DISABLED' } } };
    },
    post: async () => ({ data: {} }),
    put: async () => ({ data: {} }),
    patch: async () => ({ data: {} }),
    delete: async () => ({ data: {} }),
  };
  await assert.rejects(createPriceBookApi(http).getBook(), (err: unknown) => readPriceBookError(err).code === 'PRICE_BOOK_DISABLED');
});

test('the default wrappers are wired to the shared axios instance', () => {
  for (const name of ['getStatus', 'suggest', 'previewRun', 'applyRun', 'undoRun', 'putBulkRates', 'listRules'] as const) {
    assert.equal(typeof priceBookApi[name], 'function', name);
  }
});

// ---------------------------------------------------------------------------
// Apply and undo loop
// ---------------------------------------------------------------------------

function progress(over: Partial<RunProgress>): RunProgress {
  return { status: 'APPLYING', applied: 0, remaining: 0, changedSince: 0, failed: 0, undone: 0, undoSkipped: 0, ...over };
}

test('runUntilDone: keeps calling while the status is APPLYING and stops at the final summary', async () => {
  const steps = [progress({ applied: 200, remaining: 319 }), progress({ applied: 400, remaining: 119 }), progress({ status: 'PARTIAL', applied: 515, remaining: 0, changedSince: 4 })];
  const seen: string[] = [];
  let i = 0;
  const result = await runUntilDone(async () => steps[i++], { onProgress: (p) => seen.push(p.status) });
  assert.equal(i, 3);
  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.changedSince, 4);
  assert.deepEqual(seen, ['APPLYING', 'APPLYING', 'PARTIAL']);
  const single = await runUntilDone(async () => progress({ status: 'APPLIED', applied: 3 }));
  assert.equal(single.status, 'APPLIED');
});

test('runUntilDone: a call that makes no progress, a null body or too many calls ends with an error instead of looping', async () => {
  let calls = 0;
  await assert.rejects(
    runUntilDone(async () => {
      calls += 1;
      return progress({ applied: 200, remaining: 300 });
    }),
    (err: unknown) => (err as { code?: string }).code === 'BAD_RESPONSE'
  );
  assert.equal(calls, 2);
  await assert.rejects(runUntilDone(async () => null), (err: unknown) => (err as { code?: string }).code === 'BAD_RESPONSE');
  let n = 0;
  await assert.rejects(runUntilDone(async () => progress({ applied: (n += 1), remaining: 1000 - n }), { maxCalls: 5 }), (err: unknown) => (err as { code?: string }).code === 'BAD_RESPONSE');
  assert.equal(n, 5);
  assert.ok(RUN_LOOP_MAX_CALLS >= 10);
});

test('runUntilDone: a 409 ALREADY_APPLIED that carries the final summary is the result, any other failure is rethrown', async () => {
  const already = { response: { status: 409, data: { success: false, code: 'ALREADY_APPLIED', summary: { status: 'APPLIED', applied: 119, remaining: 0 } } } };
  const result = await runUntilDone(async () => {
    throw already;
  });
  assert.equal(result.status, 'APPLIED');
  assert.equal(result.applied, 119);
  const noSummary = { response: { status: 409, data: { success: false, code: 'ALREADY_APPLIED' } } };
  await assert.rejects(runUntilDone(async () => { throw noSummary; }), (err: unknown) => err === noSummary);
  const expired = { response: { status: 409, data: { code: 'PREVIEW_EXPIRED' } } };
  await assert.rejects(runUntilDone(async () => { throw expired; }), (err: unknown) => err === expired);
});
