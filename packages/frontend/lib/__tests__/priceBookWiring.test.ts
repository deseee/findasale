/**
 * priceBookWiring (ADR-140 batch B8): the price book lines inside the existing screens. Pure rules, plus render smoke tests
 * (server-side render to static markup, no DOM needed) that prove each edited screen shows nothing new when the answer has no
 * priceBook block, and shows the provenance, lock note and "Why this price" button when it has one.
 * Run: npm test   (node:test through tsx)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components/ToastContext';
import SuggestedPriceBox from '../../components/cardRecord/SuggestedPriceBox';
import SuggestedPriceLookup from '../../components/cardScan/SuggestedPriceLookup';
import ItemPriceLock from '../../components/priceBook/ItemPriceLock';
import RepriceUnpricedLink from '../../components/priceBook/RepriceUnpricedLink';
import ChangesTab from '../../components/priceBook/ChangesTab';
import { emptyScope, scopeFormFromPreset, scopeFromForm } from '../../components/priceBook/RepriceStepper';
import { pbKeys } from '../../components/priceBook/usePriceBookData';
import type { PriceBookLockRow, PriceBookStatus, PriceBookView } from '../priceBook';
import { PRICE_BOOK_COPY, PRICE_BOOK_UI, allPriceBookCopy } from '../priceBookCopy';
import {
  PRICE_BOOK_PAGE_PATH,
  cleanId,
  isItemPinned,
  offerRepriceUnpriced,
  readUnpricedPreset,
  repriceUnpricedHref,
  withItemId,
} from '../priceBookWiring';

const STATUS_ON: PriceBookStatus = {
  enabled: true,
  bookExists: true,
  bookEnabled: true,
  catalogReference: { platformOn: true, bookOptedIn: false },
  limits: {},
  vocabulary: {},
};

function lock(itemId: string, lockedUntil: string | null = null): PriceBookLockRow {
  return { itemId, reason: 'PIN', priceCentsAtLock: null, lockedUntil, createdAt: null };
}

/** Renders inside the app's providers and drops the empty toast containers the toast provider always adds. */
function wrap(client: QueryClient, node: React.ReactElement): string {
  return renderToStaticMarkup(
    React.createElement(QueryClientProvider, { client }, React.createElement(ToastProvider, null, node))
  ).replace(/<div class="fixed [^"]*"><\/div>/g, '');
}

function freshClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

// ---------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------

test('cleanId keeps plain ids and drops anything else', () => {
  assert.equal(cleanId('clx9abc_12-Z'), 'clx9abc_12-Z');
  assert.equal(cleanId(' abc '), 'abc');
  for (const bad of ['', 'a b', 'a/b', 'a?b=1', '<x>', 'x'.repeat(65), null, undefined, 5, {}]) assert.equal(cleanId(bad), '', String(bad));
});

test('withItemId adds the item id only when there is one', () => {
  assert.deepEqual(withItemId({ printingId: 'p1' }, 'it1'), { printingId: 'p1', itemId: 'it1' });
  assert.deepEqual(withItemId({ printingId: 'p1' }, ' it1 '), { printingId: 'p1', itemId: 'it1' });
  for (const none of [null, undefined, '', '   ']) assert.deepEqual(withItemId({ printingId: 'p1' }, none), { printingId: 'p1' });
});

test('the link after an import or scan save names the sale and the batch, and reads back', () => {
  const href = repriceUnpricedHref('sale1', 'batch_9');
  assert.equal(href, `${PRICE_BOOK_PAGE_PATH}?tab=changes&unpriced=1&sale=sale1&batch=batch_9`);
  const query: Record<string, string> = {};
  href.split('?')[1].split('&').forEach((pair) => {
    const [k, v] = pair.split('=');
    query[k] = v;
  });
  assert.deepEqual(readUnpricedPreset(query), { saleId: 'sale1', batchId: 'batch_9' });
  assert.equal(repriceUnpricedHref(null, 'b1'), `${PRICE_BOOK_PAGE_PATH}?tab=changes&unpriced=1&batch=b1`);
  assert.equal(repriceUnpricedHref('s1', null), `${PRICE_BOOK_PAGE_PATH}?tab=changes&unpriced=1&sale=s1`);
  assert.equal(repriceUnpricedHref('bad id&x=1', 'b1'), `${PRICE_BOOK_PAGE_PATH}?tab=changes&unpriced=1&batch=b1`);
});

test('the preset is read only from tab=changes with unpriced=1, and ids are checked', () => {
  assert.equal(readUnpricedPreset(null), null);
  assert.equal(readUnpricedPreset(undefined), null);
  assert.equal(readUnpricedPreset({}), null);
  assert.equal(readUnpricedPreset({ tab: 'changes' }), null);
  assert.equal(readUnpricedPreset({ unpriced: '1' }), null);
  assert.equal(readUnpricedPreset({ tab: 'prices', unpriced: '1' }), null);
  assert.equal(readUnpricedPreset({ tab: 'changes', unpriced: '0' }), null);
  assert.deepEqual(readUnpricedPreset({ tab: 'changes', unpriced: '1' }), { saleId: null, batchId: null });
  assert.deepEqual(readUnpricedPreset({ tab: ['changes', 'x'], unpriced: ['1'], sale: ['s1', 's2'], batch: 'b1' }), { saleId: 's1', batchId: 'b1' });
  assert.deepEqual(readUnpricedPreset({ tab: 'changes', unpriced: '1', sale: '<script>', batch: 'a b' }), { saleId: null, batchId: null });
});

test('the unpriced line is offered only with cards to price, a batch, and the price book plus the shop book on', () => {
  const on = { enabled: true, bookEnabled: true };
  assert.equal(offerRepriceUnpriced({ needsPrice: 3, batchId: 'b1', status: on }), true);
  assert.equal(offerRepriceUnpriced({ needsPrice: 0, batchId: 'b1', status: on }), false);
  assert.equal(offerRepriceUnpriced({ needsPrice: 3, batchId: null, status: on }), false);
  assert.equal(offerRepriceUnpriced({ needsPrice: 3, batchId: undefined, status: on }), false);
  assert.equal(offerRepriceUnpriced({ needsPrice: 3, batchId: 'b1', status: null }), false);
  assert.equal(offerRepriceUnpriced({ needsPrice: 3, batchId: 'b1', status: undefined }), false);
  assert.equal(offerRepriceUnpriced({ needsPrice: 3, batchId: 'b1', status: { enabled: false, bookEnabled: true } }), false);
  assert.equal(offerRepriceUnpriced({ needsPrice: 3, batchId: 'b1', status: { enabled: true, bookEnabled: false } }), false);
});

test('a pin counts until it runs out; no end date holds until the shop lets go', () => {
  const now = new Date('2026-10-13T12:00:00Z');
  assert.equal(isItemPinned([lock('a')], 'a', now), true);
  assert.equal(isItemPinned([lock('a')], 'b', now), false);
  assert.equal(isItemPinned([lock('a', '2026-10-20T00:00:00Z')], 'a', now), true);
  assert.equal(isItemPinned([lock('a', '2026-10-01T00:00:00Z')], 'a', now), false);
  assert.equal(isItemPinned([lock('a', 'not a date')], 'a', now), true);
  assert.equal(isItemPinned([], 'a', now), false);
  assert.equal(isItemPinned(null, 'a', now), false);
  assert.equal(isItemPinned([lock('a')], null, now), false);
  assert.equal(isItemPinned([lock('a')], '', now), false);
});

test('the unpriced scope: that sale, only cards without a price, that batch; the batch goes out only with the tick', () => {
  const form = scopeFormFromPreset({ saleId: 's1', batchId: 'b1' });
  assert.equal(form.saleId, 's1');
  assert.equal(form.onlyUnpriced, true);
  assert.equal(form.includeMarkedDown, false);
  assert.equal(form.includeEbayLive, false);
  assert.deepEqual(scopeFromForm('BULK', form), { saleId: 's1', game: null, setCode: null, rarityClass: null, finish: null, onlyUnpriced: true, intakeBatchId: 'b1' });
  assert.deepEqual(scopeFromForm('BULK', { ...form, onlyUnpriced: false }), { saleId: 's1', game: null, setCode: null, rarityClass: null, finish: null, onlyUnpriced: false });
  assert.deepEqual(scopeFromForm('LOT', form), { saleId: 's1' });
  assert.deepEqual(scopeFormFromPreset(null), emptyScope());
  assert.deepEqual(scopeFormFromPreset(undefined), emptyScope());
  const noBatch = scopeFormFromPreset({ saleId: null, batchId: null });
  assert.equal(noBatch.onlyUnpriced, true);
  assert.equal('intakeBatchId' in scopeFromForm('BULK', noBatch), false);
  assert.equal('intakeBatchId' in scopeFromForm('BULK', emptyScope()), false);
});

test('the unpriced line reads plainly in the singular and plural and passes the copy lint', () => {
  assert.equal(PRICE_BOOK_COPY.repriceUnpricedLine(1), 'Price the card without a price from my price book');
  assert.equal(PRICE_BOOK_COPY.repriceUnpricedLine(12), 'Price the 12 cards without a price from my price book');
  const all = allPriceBookCopy();
  assert.ok(all.includes(PRICE_BOOK_COPY.repriceUnpricedLine(119)));
  assert.ok(all.includes(PRICE_BOOK_COPY.repriceUnpricedLine(1)));
});

// ---------------------------------------------------------------------------
// Render smoke tests
// ---------------------------------------------------------------------------

test('the extra price book pieces render nothing until the status says the price book is on', () => {
  const client = freshClient();
  assert.equal(wrap(client, React.createElement(RepriceUnpricedLink, { needsPrice: 3, saleId: 's1', batchId: 'b1' })), '');
  assert.equal(wrap(client, React.createElement(ItemPriceLock, { itemId: 'it1' })), '');
  client.setQueryData(pbKeys.status, { ...STATUS_ON, enabled: false });
  assert.equal(wrap(client, React.createElement(RepriceUnpricedLink, { needsPrice: 3, saleId: 's1', batchId: 'b1' })), '');
  assert.equal(wrap(client, React.createElement(ItemPriceLock, { itemId: 'it1' })), '');
  client.setQueryData(pbKeys.status, { ...STATUS_ON, bookEnabled: false });
  assert.equal(wrap(client, React.createElement(RepriceUnpricedLink, { needsPrice: 3, saleId: 's1', batchId: 'b1' })), '');
  assert.equal(wrap(client, React.createElement(ItemPriceLock, { itemId: 'it1' })), '');
});

test('the unpriced line shows when the book is on and some cards have no price', () => {
  const client = freshClient();
  client.setQueryData(pbKeys.status, STATUS_ON);
  const html = wrap(client, React.createElement(RepriceUnpricedLink, { needsPrice: 12, saleId: 's1', batchId: 'b1' }));
  assert.ok(html.includes('Price the 12 cards without a price from my price book'));
  assert.ok(html.includes('href="/organizer/price-book?tab=changes&amp;unpriced=1&amp;sale=s1&amp;batch=b1"'));
  assert.equal(wrap(client, React.createElement(RepriceUnpricedLink, { needsPrice: 0, saleId: 's1', batchId: 'b1' })), '');
  assert.equal(wrap(client, React.createElement(RepriceUnpricedLink, { needsPrice: 12, saleId: 's1', batchId: null })), '');
});

test('the pin shows only for an item with a card record while the book is on', () => {
  const client = freshClient();
  client.setQueryData(pbKeys.status, STATUS_ON);
  assert.equal(wrap(client, React.createElement(ItemPriceLock, { itemId: 'it1' })), '');
  client.setQueryData(['item-card', 'it1'], null);
  assert.equal(wrap(client, React.createElement(ItemPriceLock, { itemId: 'it1' })), '');
  client.setQueryData(['item-card', 'it1'], { game: 'MTG' });
  client.setQueryData([...pbKeys.all, 'locks', 'it1'], false);
  const open = wrap(client, React.createElement(ItemPriceLock, { itemId: 'it1' }));
  assert.ok(open.includes(PRICE_BOOK_COPY.pinLock));
  assert.ok(!open.includes(PRICE_BOOK_COPY.lockedNotApplied));
  client.setQueryData([...pbKeys.all, 'locks', 'it1'], true);
  const pinned = wrap(client, React.createElement(ItemPriceLock, { itemId: 'it1' }));
  assert.ok(pinned.includes(PRICE_BOOK_COPY.pinUnlock));
  assert.ok(pinned.includes(PRICE_BOOK_COPY.lockedNotApplied));
});

const VOCAB = { finishes: [{ code: 'NONFOIL', label: 'Non-foil' }], conditionCodes: [{ code: 'NM', label: 'Near Mint' }] };
const NOOP = (): void => undefined;

function boxHtml(client: QueryClient, itemId?: string): string {
  return wrap(
    client,
    React.createElement(SuggestedPriceBox, {
      printingId: 'p1',
      graded: false,
      finish: 'NONFOIL',
      conditionCode: 'NM',
      language: 'EN',
      vocab: VOCAB,
      lookupEnabled: true,
      itemId,
      busy: false,
      onUse: NOOP,
    })
  );
}

test('the item editor box shows nothing new without a priceBook block', () => {
  const client = freshClient();
  client.setQueryData(['card-suggested-price', 'p1', 'NONFOIL', 'NM', 'EN', null], {
    ok: true,
    suggestedPrice: 4.5,
    asOf: '2026-10-10T00:00:00Z',
    showDataDate: true,
    basis: { finish: 'NONFOIL', conditionCode: 'NM' },
  });
  const html = boxHtml(client);
  assert.ok(html.includes('$4.50'));
  assert.ok(!html.includes(PRICE_BOOK_COPY.whyButton));
  assert.ok(!html.includes('aria-expanded'));
  assert.ok(!html.includes(PRICE_BOOK_COPY.lockedNotApplied));
});

test('the item editor box shows the source line, the lock note and the why button when the book answered', () => {
  const client = freshClient();
  client.setQueryData(['card-suggested-price', 'p1', 'NONFOIL', 'NM', 'EN', 'it1'], {
    ok: true,
    suggestedPrice: 10.25,
    basis: { finish: 'NONFOIL', conditionCode: 'NM' },
    priceBook: { ok: true, priceCents: 1025, priceSource: 'MANUAL', priceAsOf: '2026-10-03T12:00:00Z', lockedReason: 'PIN', applyAllowed: false },
  });
  const html = boxHtml(client, 'it1');
  assert.ok(html.includes('$10.25'));
  assert.ok(html.includes('Your typed price'));
  assert.ok(html.includes(PRICE_BOOK_COPY.lockedNotApplied));
  assert.ok(html.includes(PRICE_BOOK_COPY.whyButton));
  // The number is still offered: a locked item keeps its button (ADR-140 section 12.3).
  assert.ok(html.includes('Use suggested price'));
});

test('the item editor box says there is nothing to base a price on when the book has no reference', () => {
  const client = freshClient();
  client.setQueryData(['card-suggested-price', 'p1', 'NONFOIL', 'NM', 'EN', null], {
    ok: false,
    suggestedPrice: null,
    code: 'NO_REFERENCE',
    priceBook: { ok: false, code: 'NO_REFERENCE', priceCents: null, applyAllowed: false },
  });
  const html = boxHtml(client);
  assert.ok(html.includes(PRICE_BOOK_COPY.noSuggestion));
  assert.ok(!html.includes('Use suggested price'));
});

test('the scan queue lookup starts as the same single button', () => {
  const html = wrap(
    freshClient(),
    React.createElement(SuggestedPriceLookup, { printingId: 'p1', finish: 'NONFOIL', conditionCode: 'NM', onUse: NOOP })
  );
  assert.ok(html.startsWith('<button'));
  assert.ok(!html.includes(PRICE_BOOK_COPY.whyButton));
});

test('the Changes tab opens the stepper straight away only when it was sent the unpriced preset', () => {
  const book = { version: 1, enabled: true } as unknown as PriceBookView;
  const none = wrap(freshClient(), React.createElement(ChangesTab, { book, status: STATUS_ON }));
  const preset = wrap(freshClient(), React.createElement(ChangesTab, { book, status: STATUS_ON, preset: { saleId: 's1', batchId: 'b1' } }));
  // The start card with the two buttons is replaced by the scope step, with "Only cards without a price" already ticked.
  assert.ok(!none.includes(PRICE_BOOK_UI.onlyUnpriced));
  assert.ok(preset.includes(PRICE_BOOK_UI.onlyUnpriced));
  assert.ok(/<input[^>]*checked=""/.test(preset));
});
