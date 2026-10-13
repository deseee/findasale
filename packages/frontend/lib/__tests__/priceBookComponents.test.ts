/**
 * Price Book screens (ADR-140 batch B7): pure helper tests, render smoke tests (server-side render to static markup, no DOM
 * needed) and source checks (no hard-coded wording, ASCII only, no dashes, no banned phrases, no NUL bytes).
 * Run: npm test   (node:test through tsx)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components/ToastContext';
import type { PriceBookRule, PriceBookRunItem, PriceBookStatus, PriceBookView } from '../priceBook';
import { PRICE_BOOK_UI, PRICE_BOOK_UI_SAMPLES, allPriceBookCopy } from '../priceBookCopy';
import {
  TAB_KEYS,
  dateInputToIso,
  dollarsToCents,
  isOlderThanDays,
  isUndoAllowed,
  isoToDateInput,
  moveId,
  optionsFrom,
  parseSignedPercent,
  parseWholeNumber,
  readTab,
  ruleToInput,
} from '../../components/priceBook/ui';
import { pbKeys } from '../../components/priceBook/usePriceBookData';
import { draftFromRule, inputFromDraft } from '../../components/priceBook/RuleEditor';
import { buildSaveRows, cellKey, draftFromRates, isGridDirty, originalByKey, parsePastedGrid } from '../../components/priceBook/RateGrid';
import { readBulkQuote } from '../../components/priceBook/BuyCalculator';
import { readAdjustPreview } from '../../components/priceBook/BulkRatesTab';
import { readImportSummary } from '../../components/priceBook/ImportDialog';
import { readStockSummary } from '../../components/priceBook/ReferenceTable';
import { formFromBook, patchFromForm, SETTING_FIELDS } from '../../components/priceBook/SettingsDrawer';
import { countSelectedRows, emptyScope, needsFreshPreview, scopeFromForm } from '../../components/priceBook/RepriceStepper';
import { isTicked, isTickable, lookNotes, priceText, whyBlockFor } from '../../components/priceBook/PreviewTable';
import PriceBookHeader from '../../components/priceBook/PriceBookHeader';
import PriceBookLink from '../../components/priceBook/PriceBookLink';
import PinLockButton from '../../components/priceBook/PinLockButton';
import PriceBookScreen from '../../components/priceBook/PriceBookScreen';
import PreviewTable from '../../components/priceBook/PreviewTable';
import RuleCard from '../../components/priceBook/RuleCard';
import StartCard from '../../components/priceBook/StartCard';
import WhyThisPrice from '../../components/priceBook/WhyThisPrice';
import SettingsDrawer from '../../components/priceBook/SettingsDrawer';
import RulesTab from '../../components/priceBook/RulesTab';
import TryItPanel from '../../components/priceBook/TryItPanel';
import RepriceStepper from '../../components/priceBook/RepriceStepper';
import ChangesTab from '../../components/priceBook/ChangesTab';
import RunHistory from '../../components/priceBook/RunHistory';
import BulkRatesTab from '../../components/priceBook/BulkRatesTab';
import BuyCalculator from '../../components/priceBook/BuyCalculator';
import CardPricesTab from '../../components/priceBook/CardPricesTab';
import BenchmarkGrid from '../../components/priceBook/BenchmarkGrid';
import ImportDialog from '../../components/priceBook/ImportDialog';
import { ReferenceEditor } from '../../components/priceBook/ReferenceTable';
import RuleEditor from '../../components/priceBook/RuleEditor';

const h = React.createElement;

const BOOK: PriceBookView = {
  enabled: true,
  allowCatalogReference: false,
  referenceOrder: ['MANUAL', 'SHOP_SOLD_HISTORY', 'SHOP_BENCHMARK', 'CATALOG_REFERENCE', 'LICENSED_FEED'],
  retailPercentBps: 9500,
  defaultFloorCents: 99,
  defaultCeilingCents: null,
  defaultRoundingMode: 'TIERED',
  defaultRoundingDirection: 'NEAREST',
  condNmBps: 10000,
  condLpBps: 9000,
  condMpBps: 8000,
  condHpBps: 6500,
  condDmgBps: 5000,
  nonEnglishBps: 10000,
  movementReviewBps: 2500,
  referenceWarnDays: 90,
  referenceMaxDays: 365,
  soldHistoryMinSales: 2,
  soldHistoryMaxSales: 5,
  soldHistoryWindowDays: 180,
  manualLockDays: 14,
  buyCreditBps: 12000,
  version: 7,
  counts: {},
};

const STATUS_ON: PriceBookStatus = {
  enabled: true,
  bookExists: true,
  bookEnabled: true,
  catalogReference: { platformOn: true, bookOptedIn: false },
  limits: {},
  vocabulary: {},
};

function rule(over: Partial<PriceBookRule> = {}): PriceBookRule {
  return {
    id: 'r1',
    family: 'RETAIL',
    name: 'Rares over $5',
    priority: 10,
    enabled: true,
    productType: 'SINGLE',
    game: 'MTG',
    setCode: null,
    rarityClass: 'RARE',
    rarityText: null,
    finish: null,
    language: null,
    variantToken: null,
    refMinCents: 500,
    refMaxCents: null,
    sourceKinds: [],
    basis: 'REFERENCE',
    percentBps: 9500,
    addCents: 0,
    fixedCents: null,
    floorCents: 99,
    ceilingCents: null,
    minMarginBps: null,
    roundingMode: 'TIERED',
    roundingDirection: 'NEAREST',
    creditBps: null,
    minOfferCents: null,
    ...over,
  };
}

function runItem(over: Partial<PriceBookRunItem> = {}): PriceBookRunItem {
  return {
    id: 'ri1',
    itemId: 'it1',
    title: 'Lightning Bolt (M11) NM',
    oldPrice: 2,
    newPrice: 2.25,
    changePercent: 12.5,
    state: 'PENDING',
    selected: true,
    priceSource: 'SHOP_SOLD_HISTORY',
    skipReason: null,
    why: 'Based on your recent sales.',
    warnings: [],
    reviewReasons: [],
    ...over,
  };
}

function wrap(child: React.ReactElement, seed?: (client: QueryClient) => void): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (seed) seed(client);
  const html = renderToStaticMarkup(h(QueryClientProvider, { client }, h(ToastProvider, null, child)));
  return html.replace(/<div class="fixed (?:top-14|bottom-20)[^"]*"><\/div>/g, '');
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

test('optionsFrom: server list wins, copy label wins over the server label, skip list is honoured', () => {
  const table = { A: 'Alpha', B: 'Beta' };
  assert.deepEqual(optionsFrom(null, table), [{ code: 'A', label: 'Alpha' }, { code: 'B', label: 'Beta' }]);
  assert.deepEqual(optionsFrom([{ code: 'B', label: 'Server B' }, { code: 'Z', label: 'Zed' }], table), [
    { code: 'B', label: 'Beta' },
    { code: 'Z', label: 'Zed' },
  ]);
  assert.deepEqual(optionsFrom(undefined, table, ['A']), [{ code: 'B', label: 'Beta' }]);
  assert.deepEqual(optionsFrom([], table).length, 2);
});

test('moveId moves one place and leaves the list alone at the ends', () => {
  assert.deepEqual(moveId(['a', 'b', 'c'], 'b', 'up'), ['b', 'a', 'c']);
  assert.deepEqual(moveId(['a', 'b', 'c'], 'b', 'down'), ['a', 'c', 'b']);
  assert.deepEqual(moveId(['a', 'b', 'c'], 'a', 'up'), ['a', 'b', 'c']);
  assert.deepEqual(moveId(['a', 'b', 'c'], 'c', 'down'), ['a', 'b', 'c']);
  assert.deepEqual(moveId(['a', 'b'], 'x', 'up'), ['a', 'b']);
});

test('date helpers read and write plain dates', () => {
  assert.equal(dateInputToIso('2026-10-12'), '2026-10-12T12:00:00.000Z');
  assert.equal(dateInputToIso('2026-02-31'), null);
  assert.equal(dateInputToIso('soon'), null);
  assert.equal(dateInputToIso(null), null);
  assert.equal(isoToDateInput('2026-10-12T12:00:00.000Z'), '2026-10-12');
  assert.equal(isoToDateInput('nope'), '');
  const now = new Date('2026-10-12T12:00:00.000Z');
  assert.equal(isOlderThanDays('2026-07-01T00:00:00.000Z', 90, now), true);
  assert.equal(isOlderThanDays('2026-10-01T00:00:00.000Z', 90, now), false);
  assert.equal(isOlderThanDays(null, 90, now), false);
  assert.equal(isOlderThanDays('2026-07-01T00:00:00.000Z', 0, now), false);
});

test('isUndoAllowed: applied or partly applied, inside the window only', () => {
  const now = new Date('2026-10-12T12:00:00.000Z');
  assert.equal(isUndoAllowed({ status: 'APPLIED', createdAt: '2026-10-10T00:00:00.000Z' }, now, 7), true);
  assert.equal(isUndoAllowed({ status: 'PARTIAL', createdAt: '2026-10-10T00:00:00.000Z' }, now, 0), true);
  assert.equal(isUndoAllowed({ status: 'APPLIED', createdAt: '2026-09-01T00:00:00.000Z' }, now, 7), false);
  assert.equal(isUndoAllowed({ status: 'UNDONE', createdAt: '2026-10-10T00:00:00.000Z' }, now, 7), false);
  assert.equal(isUndoAllowed({ status: 'PREVIEW', createdAt: '2026-10-10T00:00:00.000Z' }, now, 7), false);
});

test('number fields read plain numbers only', () => {
  assert.equal(parseWholeNumber('12', 1, 20), 12);
  assert.equal(parseWholeNumber('0', 1, 20), null);
  assert.equal(parseWholeNumber('21', 1, 20), null);
  assert.equal(parseWholeNumber('1.5', 1, 20), null);
  assert.equal(parseWholeNumber('-3', 0, 20), null);
  assert.equal(parseSignedPercent('-10'), -10);
  assert.equal(parseSignedPercent('25.5%'), 25.5);
  assert.equal(parseSignedPercent('1.234'), null);
  assert.equal(parseSignedPercent('abc'), null);
  assert.equal(dollarsToCents(2.25), 225);
  assert.equal(dollarsToCents(null), null);
  assert.equal(dollarsToCents(0.1 + 0.2), 30);
});

test('readTab accepts only the four tabs', () => {
  assert.deepEqual(TAB_KEYS, ['prices', 'bulk', 'cards', 'changes']);
  assert.equal(readTab('bulk'), 'bulk');
  assert.equal(readTab(['cards', 'x']), 'cards');
  assert.equal(readTab('nope'), 'prices');
  assert.equal(readTab(undefined), 'prices');
});

test('ruleToInput keeps every editable field and applies a patch', () => {
  const r = rule({ sourceKinds: ['MANUAL'] });
  const input = ruleToInput(r, { enabled: false });
  assert.equal(input.enabled, false);
  assert.equal(input.name, r.name);
  assert.equal(input.family, 'RETAIL');
  assert.deepEqual(input.sourceKinds, ['MANUAL']);
  assert.notEqual(input.sourceKinds, r.sourceKinds);
  assert.equal('id' in input, false);
  assert.equal('priority' in input, false);
});

test('rule form: a stored rule round trips, bad numbers are reported by field, nothing is guessed', () => {
  const draft = draftFromRule(rule());
  assert.equal(draft.percentText, '95');
  assert.equal(draft.refMinText, '5.00');
  const built = inputFromDraft(draft, 'RETAIL');
  assert.deepEqual(built.errors, {});
  assert.ok(built.input);
  assert.equal(built.input && built.input.percentBps, 9500);
  assert.equal(built.input && built.input.refMinCents, 500);
  assert.equal(built.input && built.input.floorCents, 99);

  const bad = { ...draft, name: '  ', percentText: 'lots', floorText: '1.234', refMinText: '9', refMaxText: '1' };
  const res = inputFromDraft(bad, 'RETAIL');
  assert.equal(res.input, null);
  for (const key of ['name', 'percent', 'floor', 'refMax']) assert.ok(res.errors[key], key);

  const subtract = inputFromDraft({ ...draft, addMode: 'subtract', addText: '0.10' }, 'RETAIL');
  assert.equal(subtract.input && subtract.input.addCents, -10);

  const buy = inputFromDraft({ ...draftFromRule(null), name: 'Buy', creditText: '50' }, 'BUYLIST');
  assert.ok(buy.errors.credit);
  const buyOk = inputFromDraft({ ...draftFromRule(null), name: 'Buy', creditText: '150', minOfferText: '0.25' }, 'BUYLIST');
  assert.equal(buyOk.input && buyOk.input.creditBps, 15000);
  assert.equal(buyOk.input && buyOk.input.minOfferCents, 25);
});

test('rate grid: save rows, deletes, problems and dirty check', () => {
  const rates = [
    { direction: 'SELL', game: 'MTG', tier: 'COMMON', finish: 'ANY', unit: 'PER_1000', rateCents: 800, creditRateCents: null, benchmarkNote: null, benchmarkRateCents: null, benchmarkAsOf: null },
    { direction: 'BUY', game: 'MTG', tier: 'COMMON', finish: 'ANY', unit: 'PER_1000', rateCents: 400, creditRateCents: 500, benchmarkNote: 'seen', benchmarkRateCents: 450, benchmarkAsOf: '2026-10-01T12:00:00.000Z' },
  ];
  const original = originalByKey(rates);
  const draft = draftFromRates(rates);
  assert.equal(isGridDirty(draft, original), false);
  const k = cellKey('SELL', 'COMMON', 'ANY', 'PER_1000');
  assert.equal(draft[k].text, '8.00');

  const edited = { ...draft, [k]: { ...draft[k], text: '9.00' } };
  assert.equal(isGridDirty(edited, original), true);
  const built = buildSaveRows(edited, original);
  assert.equal(built.problems.length, 0);
  assert.equal(built.changed, 1);
  assert.equal(built.changes[0].oldCents, 800);
  assert.equal(built.changes[0].newCents, 900);
  const sell = built.rows.find((r) => r.direction === 'SELL');
  assert.equal(sell && sell.priceCents, 900);
  const buy = built.rows.find((r) => r.direction === 'BUY');
  assert.equal(buy && buy.creditPriceCents, 500);
  assert.equal(buy && buy.benchmarkNote, 'seen');
  assert.equal(buy && buy.benchmarkPriceCents, 450);

  const cleared = buildSaveRows({ ...draft, [k]: { ...draft[k], text: '' } }, original);
  const gone = cleared.rows.find((r) => r.direction === 'SELL');
  assert.equal(gone && gone.priceCents, null);

  const wrong = buildSaveRows({ ...draft, [k]: { ...draft[k], text: 'eight' } }, original);
  assert.equal(wrong.problems.length, 1);
  assert.equal(wrong.problems[0].key, k);
});

test('rate grid: pasted spreadsheet text', () => {
  assert.equal(parsePastedGrid('8.00'), null);
  assert.deepEqual(parsePastedGrid('1\t2\n3\t4\n'), [['1', '2'], ['3', '4']]);
  assert.deepEqual(parsePastedGrid('1\n2'), [['1'], ['2']]);
  assert.equal(parsePastedGrid(''), null);
});

test('server answer readers never throw and fall back to empty values', () => {
  assert.equal(readBulkQuote(null).ok, false);
  const q = readBulkQuote({ quote: { ok: true, cashCents: 1000, creditCents: 1200, lines: [{ ok: true, cents: 1000, creditCents: 1200 }, 5] } });
  assert.equal(q.ok, true);
  assert.equal(q.creditCents, 1200);
  assert.equal(q.lines.length, 2);
  assert.deepEqual(readAdjustPreview(undefined), { rows: [], unchanged: 0 });
  const a = readAdjustPreview({ changes: [{ tier: 'COMMON', beforeCents: 800, afterCents: 760 }, { tier: 5 }], unchangedCount: 3 });
  assert.equal(a.rows.length, 1);
  assert.equal(a.unchanged, 3);
  const imp = readImportSummary({ summary: { willCreate: 4, updated: 2, unresolved: 1, rejected: [{ row: 3, reason: 'No price.' }, { row: 4 }] } });
  assert.deepEqual([imp.willCreate, imp.willUpdate, imp.unresolved, imp.rejected.length], [4, 2, 1, 1]);
  assert.deepEqual(readStockSummary({ summary: { created: 9, skipped: 2 } }), { created: 9, skipped: 2 });
  assert.deepEqual(readStockSummary(null), { created: null, skipped: null });
});

test('settings form: only changed settings are sent, ranges and relations are checked', () => {
  const form = formFromBook(BOOK);
  assert.equal(form.text.condLpBps, '90');
  assert.equal(form.text.defaultFloorCents, '0.99');
  assert.equal(form.text.defaultCeilingCents, '');
  assert.deepEqual(patchFromForm(form, BOOK), { patch: {}, errors: {} });

  const changed = { ...form, text: { ...form.text, condLpBps: '85', manualLockDays: '30', defaultCeilingCents: '50' }, allowCatalogReference: true, roundingMode: 'NONE' };
  const read = patchFromForm(changed, BOOK);
  assert.deepEqual(read.errors, {});
  assert.deepEqual(read.patch, { condLpBps: 8500, manualLockDays: 30, defaultCeilingCents: 5000, allowCatalogReference: true, defaultRoundingMode: 'NONE' });

  const bad = { ...form, text: { ...form.text, buyCreditBps: '50', referenceMaxDays: '30', soldHistoryMaxSales: '1', defaultCeilingCents: '0.10', movementReviewBps: 'x' } };
  const errs = patchFromForm(bad, BOOK).errors;
  for (const key of ['buyCreditBps', 'referenceMaxDays', 'soldHistoryMaxSales', 'defaultCeilingCents', 'movementReviewBps']) assert.ok(errs[key], key);

  const order = patchFromForm({ ...form, referenceOrder: ['SHOP_SOLD_HISTORY', 'MANUAL', 'SHOP_BENCHMARK', 'CATALOG_REFERENCE', 'LICENSED_FEED'] }, BOOK);
  assert.deepEqual(order.patch.referenceOrder, ['SHOP_SOLD_HISTORY', 'MANUAL', 'SHOP_BENCHMARK', 'CATALOG_REFERENCE', 'LICENSED_FEED']);
  assert.equal(SETTING_FIELDS.length, 17);
});

test('reprice scope: a lot run sends only a sale, a card run sends blanks as nothing', () => {
  assert.deepEqual(scopeFromForm('LOT', { ...emptyScope(), saleId: 's1', game: 'MTG' }), { saleId: 's1' });
  assert.deepEqual(scopeFromForm('LOT', emptyScope()), { saleId: null });
  const card = scopeFromForm('BULK', { ...emptyScope(), game: 'MTG', setCode: ' LEA ', onlyUnpriced: true });
  assert.deepEqual(card, { saleId: null, game: 'MTG', setCode: 'LEA', rarityClass: null, finish: null, onlyUnpriced: true });
});

test('failures that mean "preview again"', () => {
  for (const code of ['BOOK_CHANGED', 'PREVIEW_EXPIRED', 'COUNT_MISMATCH', 'RUN_NOT_PREVIEW']) assert.equal(needsFreshPreview(code), true, code);
  for (const code of ['NOTHING_SELECTED', 'SERVER_ERROR', 'NETWORK_ERROR']) assert.equal(needsFreshPreview(code), false, code);
});

test('countSelectedRows counts ticked ready rows once, across pages and both views', async () => {
  const pages: Record<string, { items: PriceBookRunItem[]; nextCursor: string | null }> = {
    'changes|': { items: [runItem({ id: 'a' }), runItem({ id: 'b', selected: false })], nextCursor: 'c1' },
    'changes|c1': { items: [runItem({ id: 'c' }), runItem({ id: 'r1', selected: true })], nextCursor: null },
    'review|': { items: [runItem({ id: 'r1', selected: true }), runItem({ id: 'r2', selected: false }), runItem({ id: 'r3', state: 'SKIPPED' })], nextCursor: null },
  };
  const asked: string[] = [];
  const n = await countSelectedRows(async (view, cursor) => {
    asked.push(`${view}|${cursor || ''}`);
    return pages[`${view}|${cursor || ''}`];
  });
  assert.equal(n, 3);
  assert.deepEqual(asked, ['changes|', 'changes|c1', 'review|']);
});

test('preview rows: prices in dollars become display text, ticks and notes come from the row', () => {
  assert.equal(priceText(2.25), '$2.25');
  assert.equal(priceText(null), '');
  assert.equal(isTickable(runItem()), true);
  assert.equal(isTickable(runItem({ state: 'SKIPPED' })), false);
  assert.equal(isTicked(runItem({ selected: false }), { ri1: true }), true);
  assert.equal(isTicked(runItem({ selected: true }), {}), true);
  const row = runItem({ reviewReasons: ['LARGE_MOVE'], warnings: ['MADE_UP_CODE'], changePercent: 38 });
  const notes = lookNotes(row);
  assert.ok(notes.length >= 1);
  assert.ok(notes.some((n) => n.includes('38')));
  const block = whyBlockFor(row);
  assert.equal(block.ok, true);
  assert.equal(block.priceCents, 225);
  assert.equal(block.review && block.review.required, true);
  assert.equal(whyBlockFor(runItem({ newPrice: null })).ok, false);
});

// ---------------------------------------------------------------------------
// Render smoke tests
// ---------------------------------------------------------------------------

test('header: a real switch with its state, and Settings', () => {
  const on = wrap(h(PriceBookHeader, { book: BOOK, busy: false, onToggle: () => undefined, onOpenSettings: () => undefined }));
  assert.ok(on.includes('role="switch"'));
  assert.ok(on.includes('aria-checked="true"'));
  assert.ok(on.includes('Price book'));
  assert.ok(on.includes('Settings'));
  const none = wrap(h(PriceBookHeader, { book: null, busy: false, onToggle: () => undefined, onOpenSettings: () => undefined }));
  assert.ok(none.includes('aria-checked="false"'));
});

test('rule card: sentence from describeRule and five real buttons with names', () => {
  const out = wrap(h('ol', null, h(RuleCard, { rule: rule(), index: 0, count: 2, busy: false, onEdit: () => undefined, onMove: () => undefined, onToggle: () => undefined, onDelete: () => undefined })));
  assert.equal((out.match(/<button/g) || []).length, 5);
  assert.ok(out.includes('Rares over $5'));
  assert.ok(out.includes('aria-label="Edit: Rares over $5"'));
  assert.ok(out.includes('disabled=""'), 'Move up is disabled for the first rule');
  const off = wrap(h('ol', null, h(RuleCard, { rule: rule({ enabled: false }), index: 1, count: 2, busy: false, onEdit: () => undefined, onMove: () => undefined, onToggle: () => undefined, onDelete: () => undefined })));
  assert.ok(off.includes('Turned off'));
  assert.ok(off.includes('>Turn on<'));
});

test('why this price: closed by default with aria-expanded, open shows the headline and the lock note', () => {
  const block = { ok: true, priceCents: 1025, priceSource: 'MANUAL' as const, referenceLabel: 'Your typed price', why: 'Based on your typed price.', lockedReason: 'PIN' as const };
  const closed = wrap(h(WhyThisPrice, { block }));
  assert.ok(closed.includes('aria-expanded="false"'));
  assert.equal(closed.includes('$10.25'), false);
  const open = wrap(h(WhyThisPrice, { block, defaultOpen: true }));
  assert.ok(open.includes('aria-expanded="true"'));
  assert.ok(open.includes('Suggested price: $10.25'));
  assert.ok(open.includes('Locked, so the price book will not change it.'));
  assert.equal(wrap(h(WhyThisPrice, { block: null })), '');
});

test('preview table: ticks only on rows that will change, skipped rows say why', () => {
  const rows = [runItem(), runItem({ id: 'ri2', title: 'Counterspell', state: 'SKIPPED', skipReason: 'LOCKED', newPrice: null, selected: false })];
  const out = wrap(h(PreviewTable, { kind: 'BULK', rows, overrides: {}, editable: true, busy: false, onToggle: () => undefined }));
  assert.equal((out.match(/type="checkbox"/g) || []).length, 1);
  assert.ok(out.includes('aria-label="Apply the new price for Lightning Bolt (M11) NM"'));
  assert.ok(out.includes('$2.00'));
  assert.ok(out.includes('$2.25'));
  assert.ok(out.includes('+12.5 percent'));
  assert.ok(out.includes('Locked by you'));
  const done = wrap(h(PreviewTable, { kind: 'BULK', rows, overrides: {}, editable: false, busy: false, onToggle: () => undefined }));
  assert.equal((done.match(/type="checkbox"/g) || []).length, 0);
  const lots = wrap(h(PreviewTable, { kind: 'LOT', rows: [runItem({ title: 'Bulk commons', oldPrice: 8, newPrice: 9 })], overrides: {}, editable: true, busy: false, onToggle: () => undefined }));
  assert.ok(lots.includes('Current per 1,000'));
  assert.ok(lots.includes('Rate card per 1,000'));
  assert.equal(wrap(h(PreviewTable, { kind: 'BULK', rows: [], overrides: {}, editable: true, busy: false, onToggle: () => undefined })), '');
});

test('start card: three optional steps, nothing is on until the last', () => {
  const out = wrap(h(StartCard, { book: null, onChanged: () => undefined }));
  assert.ok(out.includes('Get started'));
  assert.ok(out.includes('1. Use my current prices as my starting point'));
  assert.ok(out.includes('2. Add a starting rule'));
  assert.ok(out.includes('3. Turn on'));
  assert.ok(out.includes('Each step is optional. Nothing is turned on until the last step.'));
});

test('settings drawer: a dialog with every setting and an inline discard question that starts closed', () => {
  const out = wrap(h(SettingsDrawer, { book: BOOK, status: STATUS_ON, onClose: () => undefined, onSaved: () => undefined }));
  assert.ok(out.includes('role="dialog"'));
  assert.ok(out.includes('aria-modal="true"'));
  assert.equal((out.match(/type="text"/g) || []).length, SETTING_FIELDS.length);
  assert.ok(out.includes('Use catalog estimates for Magic when I have no price of my own'));
  assert.equal(out.includes('Close without saving your changes?'), false);
  const off = wrap(h(SettingsDrawer, { book: BOOK, status: { ...STATUS_ON, catalogReference: { platformOn: false, bookOptedIn: false } }, onClose: () => undefined, onSaved: () => undefined }));
  assert.ok(off.includes('Catalog estimates are not available right now.'));
});

test('tabs and panels render their first state without a server answer', () => {
  const noop = () => undefined;
  const pieces: Array<[string, React.ReactElement, string]> = [
    ['rules tab', h(RulesTab, { book: BOOK, status: STATUS_ON, onOpenSettings: noop }), 'Try it'],
    ['try it', h(TryItPanel, { status: STATUS_ON }), 'Nothing is changed.'],
    ['reprice scope', h(RepriceStepper, { kind: 'BULK', book: BOOK, onClose: noop, onFinished: noop }), 'Reprice my cards'],
    ['reprice lots', h(RepriceStepper, { kind: 'LOT', book: BOOK, onClose: noop, onFinished: noop }), 'Reprice my bulk lots'],
    ['changes tab', h(ChangesTab, { book: BOOK, status: STATUS_ON }), 'Recent runs'],
    ['run history', h(RunHistory, { status: STATUS_ON }), 'Recent runs'],
    ['bulk rates', h(BulkRatesTab, { book: BOOK, status: STATUS_ON, onApplyToLots: noop }), 'Bulk rates'],
    ['buy calculator', h(BuyCalculator, { game: 'MTG' }), 'Buy calculator'],
    ['card prices', h(CardPricesTab, { book: BOOK, status: STATUS_ON }), 'Card prices'],
    ['benchmarks', h(BenchmarkGrid, { rows: [] }), 'Typical value for this kind of card'],
    ['import', h(ImportDialog, { onClose: noop, onImported: noop }), 'Import a price list'],
    ['price editor', h(ReferenceEditor, { initial: null, onClose: noop, onSaved: noop }), 'Add a price'],
    ['rule editor', h(RuleEditor, { family: 'RETAIL', rule: null, vocabulary: {}, bookVersion: 7, onCancel: noop, onSaved: noop }), 'Save rule'],
  ];
  for (const [name, el, expected] of pieces) {
    const out = wrap(el);
    assert.ok(out.length > 50, name);
    assert.ok(out.includes(expected), `${name} should show "${expected}"`);
    assert.equal(/undefined|NaN|\[object|>null</.test(out), false, `${name} leaked a value`);
  }
});

test('page body: the disabled state, the start card state and the tabs state follow the status', () => {
  const noop = () => undefined;
  const seeded = (status: PriceBookStatus, book: PriceBookView | null) => (c: QueryClient) => {
    c.setQueryData(pbKeys.status, status);
    c.setQueryData(pbKeys.book, book);
  };
  const off = wrap(h(PriceBookScreen, { ready: true, tab: 'prices', onSelectTab: noop }), seeded({ ...STATUS_ON, enabled: false }, null));
  assert.ok(off.includes('The price book is not turned on yet. You can still set every price by hand.'));
  assert.equal(off.includes('role="tablist"'), false);

  const loading = wrap(h(PriceBookScreen, { ready: false, tab: 'prices', onSelectTab: noop }));
  assert.ok(loading.includes('Loading your price book'));

  const start = wrap(h(PriceBookScreen, { ready: true, tab: 'prices', onSelectTab: noop }), seeded({ ...STATUS_ON, bookExists: false }, null));
  assert.ok(start.includes('Get started'));
  assert.equal(start.includes('role="tablist"'), false);

  const full = wrap(h(PriceBookScreen, { ready: true, tab: 'changes', onSelectTab: noop }), seeded(STATUS_ON, BOOK));
  assert.ok(full.includes('role="tablist"'));
  assert.equal((full.match(/role="tab"/g) || []).length, 4);
  assert.ok(full.includes('aria-selected="true"'));
  assert.ok(full.includes('role="tabpanel"'));
  assert.equal(full.includes('Get started'), false);
  for (const label of ['Prices', 'Bulk rates', 'Card prices', 'Changes']) assert.ok(full.includes(`>${label}<`), label);

  const offBook = wrap(h(PriceBookScreen, { ready: true, tab: 'prices', onSelectTab: noop }), seeded(STATUS_ON, { ...BOOK, enabled: false }));
  assert.ok(offBook.includes('Get started'));
  assert.ok(offBook.includes('role="tablist"'));
});

test('link and lock button render nothing until the status says the price book is on', () => {
  assert.equal(wrap(h(PriceBookLink, null)), '');
  assert.equal(wrap(h(PinLockButton, { itemId: 'i1', locked: false })), '');
  const seed = (c: QueryClient) => c.setQueryData(pbKeys.status, STATUS_ON);
  const link = wrap(h(PriceBookLink, null), seed);
  assert.ok(link.includes('href="/organizer/price-book"'));
  assert.ok(link.includes('Price book'));
  const pin = wrap(h(PinLockButton, { itemId: 'i1', locked: false }), seed);
  assert.ok(pin.includes('Keep my price'));
  assert.ok(pin.includes('aria-pressed="false"'));
  const pinned = wrap(h(PinLockButton, { itemId: 'i1', locked: true }), seed);
  assert.ok(pinned.includes('Let the price book suggest again'));
  assert.equal(wrap(h(PriceBookLink, null), (c) => c.setQueryData(pbKeys.status, { ...STATUS_ON, enabled: false })), '');
  assert.equal(wrap(h(PinLockButton, { itemId: 'i1', locked: false }), (c) => c.setQueryData(pbKeys.status, { ...STATUS_ON, bookEnabled: false })), '');
});

// ---------------------------------------------------------------------------
// Copy and source checks
// ---------------------------------------------------------------------------

test('every function in the screen words has sample arguments and the copy lint covers it', () => {
  const ui = PRICE_BOOK_UI as unknown as Record<string, unknown>;
  const functions = Object.keys(ui).filter((k) => typeof ui[k] === 'function');
  assert.ok(functions.length >= 30);
  for (const key of functions) assert.ok(Object.prototype.hasOwnProperty.call(PRICE_BOOK_UI_SAMPLES, key), `no sample for ${key}`);
  for (const key of Object.keys(PRICE_BOOK_UI_SAMPLES)) assert.equal(typeof ui[key], 'function', `${key} is not a function`);
  const all = allPriceBookCopy();
  assert.ok(all.includes(PRICE_BOOK_UI.tickAll));
  assert.ok(all.includes(PRICE_BOOK_UI.importDone(4, 2)));
});

const FRONTEND = path.resolve(__dirname, '..', '..');
const SOURCE_FILES: string[] = [];
(function collect() {
  const dir = path.join(FRONTEND, 'components', 'priceBook');
  for (const name of fs.readdirSync(dir)) if (/\.(ts|tsx)$/.test(name)) SOURCE_FILES.push(path.join(dir, name));
  SOURCE_FILES.push(path.join(FRONTEND, 'pages', 'organizer', 'price-book', 'index.tsx'));
  SOURCE_FILES.push(path.join(FRONTEND, 'lib', '__tests__', 'priceBookComponents.test.ts'));
})();

test('the screen sources are ASCII, hold no dashes, banned words or NUL bytes, even in comments', () => {
  assert.ok(SOURCE_FILES.length >= 25);
  for (const file of SOURCE_FILES) {
    const raw = fs.readFileSync(file);
    const name = path.relative(FRONTEND, file);
    assert.equal(raw.includes(0), false, `${name} has a NUL byte`);
    const src = raw.toString('utf8');
    assert.ok(!/[^\x00-\x7F]/.test(src), `${name} has a non-ASCII character`);
    assert.ok(!new RegExp(' -' + '- ').test(src), `${name} has a double hyphen dash`);
    assert.ok(!/\bAI\b/.test(src), `${name} has the banned word`);
    assert.ok(!/estate\s*sale/i.test(src), `${name} has a banned phrase`);
    assert.ok(src.endsWith('\n'), `${name} has no final newline`);
  }
});

test('no wording is hard-coded in the screens: every visible string comes from priceBookCopy', () => {
  const skip = new Set(['ui.ts', 'usePriceBookData.ts', 'priceBookComponents.test.ts']);
  for (const file of SOURCE_FILES) {
    if (skip.has(path.basename(file))) continue;
    const name = path.relative(FRONTEND, file);
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) return;
      const where = `${name}:${i + 1}: ${t}`;
      // Text between tags on one line: <p className="x">Words</p>
      assert.ok(!/<(\w+)(?:\s[^<>{}]*)?>[^<>{}]*[A-Za-z][^<>{}]*<\/\1>/.test(t), `text between tags in ${where}`);
      // Attributes that people read.
      assert.ok(!/\b(aria-label|placeholder|title|alt|aria-description)="[^"]*[A-Za-z]/.test(t), `readable attribute in ${where}`);
      // A line that is only words (JSX text on its own line).
      if (/^[A-Za-z][A-Za-z']*( [A-Za-z,.!?']+)+$/.test(t)) {
        assert.ok(['else', 'default', 'return', 'break', 'continue', 'async', 'try', 'finally'].indexOf(t) >= 0, `bare words in ${where}`);
      }
    });
  }
});
