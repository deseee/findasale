/**
 * ADR-140 B3b: priceWriteService (section 12.5), the one place the price book writes an item price. Parity with the organizer
 * price block of itemController.updateItem is proven two ways: a transcription of that block runs against the same fixtures,
 * and the controller source is pinned to the lines the transcription copies. The compare and swap is proven on the write.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { FAKE_NOW, createFakePriceBookDb, seedItem } from './__fixtures__/priceBookFakes';
import type { AnyRow } from './__fixtures__/priceBookFakes';
import type { ItemRow, PriceBookTx } from '../services/priceBook/db';
import { PRICE_EPSILON_DOLLARS, PRICE_ITEM_SELECT, applyOrganizerPrice, buildPriceUpdate, rarityForPrice } from '../services/priceBook/priceWriteService';
import { organizerEditStamp } from '../utils/organizerEdit';

const MIN = 60 * 1000;
const NOW = new Date(FAKE_NOW.getTime() + 5 * MIN);
const SRC = join(__dirname, '..');
const controllerText = readFileSync(join(SRC, 'controllers', 'itemController.ts'), 'utf8').replace(/\s+/g, ' ');
const writeText = readFileSync(join(SRC, 'services', 'priceBook', 'priceWriteService.ts'), 'utf8');

// ---------------------------------------------------------------------------------------------
// A transcription of the organizer price block of updateItem (controllers/itemController.ts, the lines pinned below), with the
// request body reduced to a price text and the clock injected. organizerEditStamp is the real function.
// ---------------------------------------------------------------------------------------------

function legacyAssignRarity(price: number | null | undefined): string {
  if (!price || price < 25) return 'COMMON';
  if (price >= 500) return 'LEGENDARY';
  if (price >= 75) return 'RARE';
  return 'UNCOMMON';
}

function legacyPriceNumber(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function legacyUpdate(item: AnyRow, price: string, now: Date): AnyRow {
  const updateData: AnyRow = {};
  const fieldsBeingEdited: string[] = [];
  const nextPriceNum = price ? parseFloat(price) : null;
  const currentPriceNum = item.price != null ? Number(item.price) : null;
  const priceChanged = nextPriceNum === null || currentPriceNum === null ? nextPriceNum !== currentPriceNum : Math.abs(nextPriceNum - currentPriceNum) >= 0.005;
  updateData.price = price ? parseFloat(price) : null;
  if (priceChanged) updateData.priceUpdatedAt = now;
  if ((item.ebayOfferId || item.ebayListingId) && (priceChanged || item.ebaySyncState === 'FAILED_RETRYABLE' || item.ebaySyncState === 'FAILED_TERMINAL')) {
    updateData.ebaySyncState = 'PENDING';
    updateData.ebaySyncAttempts = 0;
  }
  if (priceChanged) fieldsBeingEdited.push('price');

  const newPrice = price ? parseFloat(price) : null;
  const nextRarity = legacyAssignRarity(newPrice);
  if (nextRarity !== item.rarity && (priceChanged || item.rarity === 'COMMON')) updateData.rarity = nextRarity;
  if (priceChanged && newPrice && newPrice > 0 && !item.markdownApplied) {
    updateData.priceBeforeMarkdown = newPrice;
    updateData.markdownApplied = false;
  }
  if (priceChanged || item.originalPrice == null) updateData.originalPrice = newPrice && newPrice > 0 ? newPrice : null;

  // The eBay hold: computeEbayPushFields for the price field only (the other fields are not in the patch), then the hold block.
  const ebayListedBeforeSave = !!(item.ebayOfferId || item.ebayListingId);
  const priceReopen = !priceChanged && ebayListedBeforeSave && (item.ebaySyncState === 'FAILED_RETRYABLE' || item.ebaySyncState === 'FAILED_TERMINAL');
  const pushFields: string[] = [];
  const nextNum = legacyPriceNumber(updateData.price as number | null);
  const curNum = legacyPriceNumber(item.price as number | null);
  if (nextNum !== null) {
    const changed = curNum === null ? true : Math.abs(nextNum - curNum) >= 0.005;
    if (changed || priceReopen) pushFields.push('price');
  }
  const heldThisSave = ebayListedBeforeSave && item.ebaySyncHeldAt != null;
  if (heldThisSave) {
    updateData.ebaySyncHeldAt = item.ebaySyncHeldAt;
    updateData.ebayHeldFields = Array.from(new Set([...((item.ebayHeldFields as string[] | undefined) ?? []), ...pushFields]));
  }
  if (fieldsBeingEdited.length > 0) {
    updateData.userEditedFields = Array.from(new Set([...((item.userEditedFields as string[] | undefined) || []), ...fieldsBeingEdited]));
  }
  return { ...updateData, ...organizerEditStamp(item, updateData, now) };
}

function itemOf(over: AnyRow): ItemRow {
  return {
    id: 'item1',
    organizerId: 'orgA',
    title: 'Card',
    price: null,
    costBasis: null,
    status: 'AVAILABLE',
    listingType: 'FIXED',
    draftStatus: null,
    saleId: null,
    quantity: 1,
    stockTotal: 1,
    priceUpdatedAt: null,
    deletedAt: null,
    markdownApplied: false,
    priceBeforeMarkdown: null,
    originalPrice: null,
    rarity: 'COMMON',
    ebayListingId: null,
    ebayOfferId: null,
    ebaySyncState: null,
    ebaySyncAttempts: 0,
    ebaySyncHeldAt: null,
    ebayHeldFields: [],
    userEditedFields: [],
    lastEditedAt: null,
    ...over,
  } as unknown as ItemRow;
}

const textOf = (cents: number | null): string => (cents === null ? '' : (cents / 100).toFixed(2));

describe('parity with the organizer price block of updateItem', () => {
  const HELD = new Date('2026-10-01T00:00:00.000Z');
  const prices: Array<number | null> = [null, 0, 4, 4.5, 24.99, 25, 74.99, 100, 499.99, 500];
  const news: Array<number | null> = [null, 0, 1, 400, 405, 450, 2499, 2500, 7499, 7500, 49999, 50000];
  const ebayStates: AnyRow[] = [
    {},
    { ebayListingId: 'L1' },
    { ebayOfferId: 'O1', ebaySyncState: 'SYNCED' },
    { ebayListingId: 'L1', ebaySyncState: 'FAILED_RETRYABLE', ebaySyncAttempts: 4 },
    { ebayOfferId: 'O1', ebaySyncState: 'FAILED_TERMINAL', ebaySyncAttempts: 9 },
    { ebayListingId: 'L1', ebaySyncHeldAt: HELD, ebayHeldFields: [] },
    { ebayListingId: 'L1', ebaySyncHeldAt: HELD, ebayHeldFields: ['title'], ebaySyncState: 'FAILED_TERMINAL' },
    { ebaySyncHeldAt: HELD, ebayHeldFields: ['title'] },
  ];
  const others: AnyRow[] = [
    {},
    { markdownApplied: true, priceBeforeMarkdown: 9, originalPrice: 12, rarity: 'UNCOMMON' },
    { rarity: 'RARE', originalPrice: 3, userEditedFields: ['title'], lastEditedAt: new Date('2026-09-01T00:00:00.000Z') },
    { rarity: 'LEGENDARY', priceBeforeMarkdown: 2, userEditedFields: ['price', 'title'] },
  ];

  test('buildPriceUpdate gives the same columns as the updateItem block for every combination', () => {
    let cases = 0;
    for (const price of prices) {
      for (const cents of news) {
        for (const ebay of ebayStates) {
          for (const other of others) {
            const item = itemOf({ price, ...ebay, ...other });
            const mine = buildPriceUpdate(item, cents, NOW).data;
            const theirs = legacyUpdate(item as unknown as AnyRow, textOf(cents), NOW);
            expect({ price, cents, ebay, other, data: mine }).toEqual({ price, cents, ebay, other, data: theirs });
            cases += 1;
          }
        }
      }
    }
    expect(cases).toBe(prices.length * news.length * ebayStates.length * others.length);
  });

  test('the changed flag is the controller\'s own test: half a cent or more, or a move to or from no price', () => {
    expect(buildPriceUpdate(itemOf({ price: 4 }), 400, NOW).priceChanged).toBe(false);
    expect(buildPriceUpdate(itemOf({ price: 4.004 }), 400, NOW).priceChanged).toBe(false);
    expect(buildPriceUpdate(itemOf({ price: 4 }), 401, NOW).priceChanged).toBe(true);
    expect(buildPriceUpdate(itemOf({ price: null }), 100, NOW).priceChanged).toBe(true);
    expect(buildPriceUpdate(itemOf({ price: 4 }), null, NOW).priceChanged).toBe(true);
    expect(buildPriceUpdate(itemOf({ price: null }), null, NOW).priceChanged).toBe(false);
    expect(PRICE_EPSILON_DOLLARS).toBe(0.005);
  });

  test('a change stamps the price time and the organizer edit time with the injected clock', () => {
    const data = buildPriceUpdate(itemOf({ price: 4 }), 450, NOW).data;
    expect(data.priceUpdatedAt).toEqual(NOW);
    expect(data.lastEditedAt).toEqual(NOW);
    expect(data.userEditedFields).toEqual(['price']);
    expect(data.price).toBe(4.5);
  });

  test('an eBay card goes back to PENDING with fresh attempts, and a held card keeps its hold and gains the price field', () => {
    const live = buildPriceUpdate(itemOf({ price: 4, ebayListingId: 'L1', ebaySyncState: 'SYNCED', ebaySyncAttempts: 5 }), 450, NOW).data;
    expect(live).toMatchObject({ ebaySyncState: 'PENDING', ebaySyncAttempts: 0 });
    expect(live.ebaySyncHeldAt).toBeUndefined();
    const held = buildPriceUpdate(itemOf({ price: 4, ebayListingId: 'L1', ebaySyncHeldAt: new Date('2026-10-01T00:00:00.000Z'), ebayHeldFields: ['title'] }), 450, NOW).data;
    expect(held.ebayHeldFields).toEqual(['title', 'price']);
    expect(held.ebaySyncHeldAt).toEqual(new Date('2026-10-01T00:00:00.000Z'));
    const plain = buildPriceUpdate(itemOf({ price: 4 }), 450, NOW).data;
    expect(plain.ebaySyncState).toBeUndefined();
  });

  test('the markdown anchor is set only while no markdown has been applied, and the original price always resets', () => {
    const fresh = buildPriceUpdate(itemOf({ price: 4 }), 450, NOW).data;
    expect(fresh).toMatchObject({ priceBeforeMarkdown: 4.5, markdownApplied: false, originalPrice: 4.5 });
    const marked = buildPriceUpdate(itemOf({ price: 4, markdownApplied: true, priceBeforeMarkdown: 8 }), 450, NOW).data;
    expect(marked.priceBeforeMarkdown).toBeUndefined();
    expect(marked.markdownApplied).toBeUndefined();
    expect(marked.originalPrice).toBe(4.5);
    expect(buildPriceUpdate(itemOf({ price: 4, originalPrice: 4 }), null, NOW).data.originalPrice).toBeNull();
  });

  test('0 cents is a price of 0, as the text "0" is in updateItem; null clears the price', () => {
    expect(buildPriceUpdate(itemOf({ price: 4 }), 0, NOW).data.price).toBe(0);
    expect(buildPriceUpdate(itemOf({ price: 4 }), null, NOW).data.price).toBeNull();
  });
});

describe('rarity tiers', () => {
  test('25, 75 and 500 are the boundaries, as in assignRarity', () => {
    const table: Array<[number | null, string]> = [[null, 'COMMON'], [0, 'COMMON'], [24.99, 'COMMON'], [25, 'UNCOMMON'], [74.99, 'UNCOMMON'], [75, 'RARE'], [499.99, 'RARE'], [500, 'LEGENDARY'], [10000, 'LEGENDARY']];
    for (const [price, rarity] of table) expect(rarityForPrice(price)).toBe(rarity);
    expect(rarityForPrice(undefined)).toBe('COMMON');
  });
});

describe('the controller lines this service copies are still there', () => {
  const lines = [
    "const nextPriceNum = price ? parseFloat(price) : null;",
    "const currentPriceNum = item.price != null ? Number(item.price) : null;",
    "priceChanged = nextPriceNum === null || currentPriceNum === null ? nextPriceNum !== currentPriceNum : Math.abs(nextPriceNum - currentPriceNum) >= 0.005;",
    "if (priceChanged) updateData.priceUpdatedAt = new Date();",
    "if ((item.ebayOfferId || item.ebayListingId) && (priceChanged || item.ebaySyncState === 'FAILED_RETRYABLE' || item.ebaySyncState === 'FAILED_TERMINAL')) { updateData.ebaySyncState = 'PENDING'; updateData.ebaySyncAttempts = 0;",
    "if (priceChanged) fieldsBeingEdited.push('price');",
    "if (nextRarity !== item.rarity && (priceChanged || item.rarity === ItemRarity.COMMON)) { updateData.rarity = nextRarity; }",
    "if (priceChanged && newPrice && newPrice > 0 && !item.markdownApplied) { updateData.priceBeforeMarkdown = newPrice; updateData.markdownApplied = false; }",
    "if (priceChanged || item.originalPrice == null) updateData.originalPrice = newPrice && newPrice > 0 ? newPrice : null;",
    "if (!price || price < 25) return ItemRarity.COMMON; if (price >= 500) return ItemRarity.LEGENDARY; if (price >= 75) return ItemRarity.RARE; return ItemRarity.UNCOMMON;",
    "const heldThisSave = ebayListedBeforeSave && (skipMarketplaceSyncRequested || item.ebaySyncHeldAt != null);",
    "updateData.ebaySyncHeldAt = item.ebaySyncHeldAt ?? new Date(); updateData.ebayHeldFields = Array.from(new Set([...(item.ebayHeldFields ?? []), ...changedMarketplaceFields]));",
    "const mergedEdited = Array.from(new Set([...currentEdited, ...fieldsBeingEdited])); updateData.userEditedFields = mergedEdited;",
    "...(cardPatch !== undefined || soldTransitionCommitted ? organizerEditStampAlways() : organizerEditStamp(item, updateData)),",
  ];
  test.each(lines)('%s', (line) => {
    expect(controllerText).toContain(line);
  });

  test('the controller still has no import of the price book (it is not edited by this batch)', () => {
    expect(controllerText).not.toContain('services/priceBook');
  });
});

describe('the select covers every column the builder reads', () => {
  test('each item.<column> in the service source is in PRICE_ITEM_SELECT', () => {
    const used = new Set<string>();
    const code = writeText.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const re = /\bitem\.(\w+)\b(?!\()/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) if (m[1]) used.add(m[1]);
    expect(used.size).toBeGreaterThan(10);
    for (const col of used) expect(Object.keys(PRICE_ITEM_SELECT)).toContain(col);
  });
});

// ---------------------------------------------------------------------------------------------
// The write: compare and swap, history, rollback
// ---------------------------------------------------------------------------------------------

function world(over: AnyRow = {}) {
  const db = createFakePriceBookDb();
  const row = seedItem(db, 'orgA', { price: 4, ...over });
  const tx = db as unknown as PriceBookTx;
  const item = (extra: AnyRow = {}): ItemRow => ({ ...(row as unknown as ItemRow), ...(extra as Partial<ItemRow>) });
  const read = (): AnyRow => {
    const r = db.tables.item.find((x) => x.id === row.id);
    if (!r) throw new Error('missing');
    return r;
  };
  return { db, tx, row, item, read };
}

describe('applyOrganizerPrice', () => {
  const expectOld = (cents: number | null, after: Date | null = null) => ({ priceCents: cents, notEditedAfter: after });

  test('writes the update and one history row, and says what it changed', async () => {
    const w = world();
    const out = await applyOrganizerPrice(w.tx, { item: w.item(), newPriceCents: 450, runId: 'run9', now: NOW, expect: expectOld(400, FAKE_NOW) });
    expect(out).toEqual({ status: 'APPLIED', oldPriceCents: 400, newPriceCents: 450 });
    expect(w.read()).toMatchObject({ price: 4.5, priceUpdatedAt: NOW, lastEditedAt: NOW, originalPrice: 4.5, userEditedFields: ['price'] });
    expect(w.db.tables.itemPriceHistory).toHaveLength(1);
    expect(w.db.tables.itemPriceHistory[0]).toMatchObject({ itemId: w.row.id, price: 4.5, changedBy: 'organizer', note: 'Price book run run9' });
  });

  test('a custom history note is used', async () => {
    const w = world();
    await applyOrganizerPrice(w.tx, { item: w.item(), newPriceCents: 450, runId: 'run9', now: NOW, expect: expectOld(400), historyNote: 'Price book undo of run run9' });
    expect(w.db.tables.itemPriceHistory[0]?.note).toBe('Price book undo of run run9');
  });

  test('the same price writes nothing at all (no rarity heal, no anchor, no eBay reopen, no history)', async () => {
    const w = world({ price: 30, rarity: 'COMMON', originalPrice: null, ebayListingId: 'L1', ebaySyncState: 'FAILED_TERMINAL' });
    const out = await applyOrganizerPrice(w.tx, { item: w.item(), newPriceCents: 3000, runId: 'r', now: NOW, expect: expectOld(3000) });
    expect(out).toEqual({ status: 'UNCHANGED' });
    expect(w.db.writes).toHaveLength(0);
    expect(w.read()).toMatchObject({ rarity: 'COMMON', originalPrice: null, ebaySyncState: 'FAILED_TERMINAL' });
    // updateItem would heal these on a same price resave; the builder alone still shows what it would write:
    expect(buildPriceUpdate(w.item(), 3000, NOW).data).toMatchObject({ rarity: 'UNCOMMON', originalPrice: 30, ebaySyncState: 'PENDING' });
  });

  test('the price must still be the one the preview saw', async () => {
    const w = world({ price: 5 });
    const out = await applyOrganizerPrice(w.tx, { item: w.item(), newPriceCents: 450, runId: 'r', now: NOW, expect: expectOld(400) });
    expect(out).toEqual({ status: 'CHANGED_SINCE_PREVIEW' });
    expect(w.db.writes).toHaveLength(0);
  });

  test('a price stamp after the baseline blocks it; a stamp at or before it does not; no baseline skips the check', async () => {
    const after = world({ priceUpdatedAt: new Date(FAKE_NOW.getTime() + MIN) });
    expect((await applyOrganizerPrice(after.tx, { item: after.item(), newPriceCents: 450, runId: 'r', now: NOW, expect: expectOld(400, FAKE_NOW) })).status).toBe('CHANGED_SINCE_PREVIEW');
    const same = world({ priceUpdatedAt: FAKE_NOW });
    expect((await applyOrganizerPrice(same.tx, { item: same.item(), newPriceCents: 450, runId: 'r', now: NOW, expect: expectOld(400, FAKE_NOW) })).status).toBe('APPLIED');
    const none = world({ priceUpdatedAt: new Date(FAKE_NOW.getTime() + MIN) });
    expect((await applyOrganizerPrice(none.tx, { item: none.item(), newPriceCents: 450, runId: 'r', now: NOW, expect: expectOld(400, null) })).status).toBe('APPLIED');
  });

  test('a sold, reserved or deleted item is never written', async () => {
    for (const over of [{ status: 'SOLD' }, { status: 'RESERVED' }, { deletedAt: FAKE_NOW }]) {
      const w = world(over);
      expect((await applyOrganizerPrice(w.tx, { item: w.item(), newPriceCents: 450, runId: 'r', now: NOW, expect: expectOld(400) })).status).toBe('CHANGED_SINCE_PREVIEW');
      expect(w.db.writes).toHaveLength(0);
    }
  });

  test('the write repeats the facts it was derived from, so a change after the read matches no row', async () => {
    const w = world({ markdownApplied: false, ebayListingId: null });
    const stale = w.item();
    Object.assign(w.read(), { price: 9, priceUpdatedAt: new Date(FAKE_NOW.getTime() + MIN) });
    const out = await applyOrganizerPrice(w.tx, { item: stale, newPriceCents: 450, runId: 'r', now: NOW, expect: expectOld(400, FAKE_NOW) });
    expect(out).toEqual({ status: 'CHANGED_SINCE_PREVIEW' });
    expect(w.read().price).toBe(9);
    expect(w.db.tables.itemPriceHistory).toHaveLength(0);
    const logged = w.db.writes.find((x) => x.table === 'item');
    expect(logged?.count).toBe(0);
    const where = logged?.where as Record<string, unknown>;
    expect(Object.keys(where).sort()).toEqual(['AND', 'deletedAt', 'ebayListingId', 'ebayOfferId', 'id', 'markdownApplied', 'organizerId', 'price', 'status']);
    expect(where).toMatchObject({ id: w.row.id, organizerId: 'orgA', deletedAt: null, status: 'AVAILABLE', markdownApplied: false, ebayListingId: null, ebayOfferId: null });
  });

  test('each repeated fact on its own makes the write match no row', async () => {
    const changes: AnyRow[] = [
      { markdownApplied: true },
      { ebayListingId: 'L9' },
      { ebayOfferId: 'O9' },
      { status: 'SOLD' },
      { deletedAt: FAKE_NOW },
      { organizerId: 'orgB' },
      { price: 4.5 },
      { price: null },
      { priceUpdatedAt: new Date(FAKE_NOW.getTime() + 2 * MIN) },
    ];
    for (const change of changes) {
      const w = world();
      const stale = w.item();
      Object.assign(w.read(), change);
      const out = await applyOrganizerPrice(w.tx, { item: stale, newPriceCents: 450, runId: 'r', now: NOW, expect: expectOld(400, FAKE_NOW) });
      expect({ change, status: out.status }).toEqual({ change, status: 'CHANGED_SINCE_PREVIEW' });
    }
  });

  test('another organizer\'s row is never written even when the caller\'s copy names this organizer', async () => {
    const w = world({ organizerId: 'orgB' });
    const out = await applyOrganizerPrice(w.tx, { item: w.item({ organizerId: 'orgA' } as Partial<ItemRow>), newPriceCents: 450, runId: 'r', now: NOW, expect: expectOld(400) });
    expect(out.status).toBe('CHANGED_SINCE_PREVIEW');
    expect(w.read().price).toBe(4);
  });

  test('an unpriced item can be priced, and a price can be cleared', async () => {
    const empty = world({ price: null });
    expect((await applyOrganizerPrice(empty.tx, { item: empty.item(), newPriceCents: 450, runId: 'r', now: NOW, expect: expectOld(null) })).status).toBe('APPLIED');
    expect(empty.read().price).toBe(4.5);
    const clear = world({ price: 4.5 });
    const out = await applyOrganizerPrice(clear.tx, { item: clear.item(), newPriceCents: null, runId: 'r', now: NOW, expect: expectOld(450) });
    expect(out).toEqual({ status: 'APPLIED', oldPriceCents: 450, newPriceCents: null });
    expect(clear.read().price).toBeNull();
    expect(clear.db.tables.itemPriceHistory[0]?.price).toBe(0);
  });

  test('the item update and its history row are one unit: a failed history write rolls the price back', async () => {
    const w = world();
    w.db.failWhen((table) => (table === 'itemPriceHistory' ? new Error('disk full') : null));
    await expect(w.db.$transaction((tx) => applyOrganizerPrice(tx, { item: w.item(), newPriceCents: 450, runId: 'r', now: NOW, expect: expectOld(400) }))).rejects.toThrow('disk full');
    expect(w.read().price).toBe(4);
    expect(w.db.tables.itemPriceHistory).toHaveLength(0);
  });

  test('it never reads the clock: the stamp is the argument', async () => {
    const w = world();
    const odd = new Date('2031-02-03T04:05:06.000Z');
    await applyOrganizerPrice(w.tx, { item: w.item(), newPriceCents: 450, runId: 'r', now: odd, expect: expectOld(400) });
    expect(w.read().priceUpdatedAt).toEqual(odd);
    expect(w.read().lastEditedAt).toEqual(odd);
  });
});
