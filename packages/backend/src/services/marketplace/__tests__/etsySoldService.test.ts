/**
 * ADR-135 batch E-B4 acceptance 3 (recordEtsySale) plus the listing-to-item mapping used by the webhook
 * and the poll. Everything is injected: an in-memory fake db, a fake stock pool that behaves like
 * sellItemUnits, spies for fan-out, eBay count sync and notifications. No Etsy call, no real database.
 */

jest.mock('@sentry/node', () => ({ captureMessage: jest.fn(), addBreadcrumb: jest.fn() }));
jest.mock('../../../lib/prisma', () => ({ prisma: {} }));

import { ETSY_SOLD_MESSAGES, processEtsyTransactions, recordEtsySale } from '../etsySoldService';
import type { EtsySaleNotice, RecordEtsySaleArgs } from '../etsySoldService';
import { makeEtsySyncFakeDb, seedSyncItem, seedSyncListing } from './etsySyncFakeDb';

const SOLD_AT = new Date('2026-10-03T15:00:00.000Z');

class InsufficientStockError extends Error {
  constructor() {
    super('insufficient');
    this.name = 'InsufficientStockError';
  }
}

function world(itemOver: Record<string, any> = {}, listingOver: Record<string, any> = {}) {
  const db = makeEtsySyncFakeDb();
  const item = seedSyncItem(db, itemOver);
  const listing = seedSyncListing(db, { itemId: item.id, ...listingOver });
  const log: string[] = [];
  const notices: EtsySaleNotice[] = [];
  const stockCalls: Array<[string, number]> = [];

  // Same contract as itemStockService.sellItemUnits: guarded decrement, status flips at the last unit.
  const sellItemUnits = jest.fn(async (itemId: string, units: number) => {
    log.push('sell');
    stockCalls.push([itemId, units]);
    const row = db.store.items.find((r: any) => r.id === itemId);
    const total = row.stockTotal ?? 1;
    if (row.stockSold + units > total) throw new InsufficientStockError();
    row.stockSold += units;
    const fullySoldOut = row.stockSold >= total;
    if (fullySoldOut) row.status = 'SOLD';
    return { fullySoldOut, remainingStock: Math.max(total - row.stockSold, 0) };
  });
  const syncStock = jest.fn(async () => {
    log.push('syncStock');
  });
  const fanOut = jest.fn((_id: string, _source: string) => {
    log.push('fanOut');
    // At the moment the fan-out starts, the Etsy listing must already be SOLD so the withdraw self-guards.
    expect(db.store.listings.find((l: any) => l.itemId === item.id).state).toBe('SOLD');
  });
  const notify = jest.fn(async (n: EtsySaleNotice) => {
    log.push('notify');
    notices.push(n);
  });
  // Log the order of the writes the ADR cares about.
  const origListingUpdate = db.etsyListing.updateMany;
  db.etsyListing.updateMany = async (a: any) => {
    if (a.data?.state === 'SOLD') log.push('listing-sold');
    return origListingUpdate(a);
  };
  const origItemUpdate = db.item.updateMany;
  db.item.updateMany = async (a: any) => {
    if (a.data?.lastSoldVia === 'ETSY') log.push('lastSoldVia');
    return origItemUpdate(a);
  };
  const deps = { db, sellItemUnits, syncStock, fanOut, notify, now: () => new Date('2026-10-03T16:00:00.000Z') } as any;
  return { db, item, listing, deps, log, notices, stockCalls, sellItemUnits, syncStock, fanOut, notify };
}

const sale = (over: Partial<RecordEtsySaleArgs> = {}): RecordEtsySaleArgs => ({
  organizerId: 'org_1',
  itemId: 'item_1',
  etsyListingId: '9001',
  transactionId: '7001',
  receiptId: '3001',
  quantity: 1,
  soldAt: SOLD_AT,
  source: 'WEBHOOK',
  ...over,
});

describe('recordEtsySale: ledger and idempotency', () => {
  it('writes exactly the allowed ledger fields and nothing from the buyer', async () => {
    const w = world();
    const r = await recordEtsySale({ ...sale(), buyerName: 'Pat Buyer', buyerEmail: 'b@example.com' } as any, w.deps);
    expect(r.status).toBe('recorded');
    expect(w.db.writes.soldEventCreates).toEqual([
      { transactionId: '7001', receiptId: '3001', etsyListingId: '9001', itemId: 'item_1', quantity: 1, soldAt: SOLD_AT, source: 'WEBHOOK' },
    ]);
  });

  it('records the same transactionId twice and changes stock once', async () => {
    const w = world({ stockTotal: 5 });
    const first = await recordEtsySale(sale({ quantity: 2 }), w.deps);
    const second = await recordEtsySale(sale({ quantity: 2 }), w.deps);
    expect(first.status).toBe('recorded');
    expect(second).toEqual({ status: 'alreadyRecorded' });
    expect(w.sellItemUnits).toHaveBeenCalledTimes(1);
    expect(w.item.stockSold).toBe(2);
    expect(w.notify).toHaveBeenCalledTimes(1);
    expect(w.db.store.soldEvents).toHaveLength(1);
  });

  it('webhook then poll for the same transaction is still one sale', async () => {
    const w = world({ stockTotal: 3 });
    await recordEtsySale(sale({ source: 'WEBHOOK' }), w.deps);
    const again = await recordEtsySale(sale({ source: 'POLL' }), w.deps);
    expect(again.status).toBe('alreadyRecorded');
    expect(w.item.stockSold).toBe(1);
  });

  it.each([
    ['quantity 0', { quantity: 0 }],
    ['fractional quantity', { quantity: 1.5 }],
    ['huge quantity', { quantity: 100000 }],
    ['non-numeric transaction id', { transactionId: 'abc' }],
    ['non-numeric receipt id', { receiptId: '../x' }],
    ['non-numeric listing id', { etsyListingId: 'x1' }],
    ['empty item id', { itemId: '' }],
    ['bad date', { soldAt: new Date('nope') }],
    ['bad source', { source: 'MANUAL' as any }],
  ])('rejects %s without touching anything', async (_label, over) => {
    const w = world();
    const r = await recordEtsySale(sale(over as any), w.deps);
    expect(r).toEqual({ status: 'invalid' });
    expect(w.db.store.soldEvents).toHaveLength(0);
    expect(w.sellItemUnits).not.toHaveBeenCalled();
  });
});

describe('recordEtsySale: partial sale (units remain)', () => {
  it('a 2-unit sale on stockTotal 5 leaves 3 and revises the eBay count; other channels stay live', async () => {
    const w = world({ stockTotal: 5 }, { syncedQuantity: 5 });
    const r = await recordEtsySale(sale({ quantity: 2 }), w.deps);
    expect(r).toMatchObject({ status: 'recorded', fullySoldOut: false, remainingStock: 3, unitsApplied: 2, oversold: false });
    expect(w.stockCalls).toEqual([['item_1', 2]]);
    expect(w.syncStock).toHaveBeenCalledTimes(1);
    expect(w.syncStock).toHaveBeenCalledWith('item_1', { fullySoldOut: false, remainingStock: 3 });
    expect(w.fanOut).not.toHaveBeenCalled();
    expect(w.item.status).toBe('AVAILABLE');
    expect(w.item.lastSoldVia).toBeNull();
    expect(w.listing.state).toBe('ACTIVE');
    // Etsy lowered its own count, so our record of what Etsy holds follows.
    expect(w.listing.syncedQuantity).toBe(3);
  });

  it('leaves syncedQuantity alone when it was never synced (null)', async () => {
    const w = world({ stockTotal: 5 }, { syncedQuantity: null });
    await recordEtsySale(sale({ quantity: 1 }), w.deps);
    expect(w.listing.syncedQuantity).toBeNull();
  });

  it('notification text for a partial sale', async () => {
    const w = world({ stockTotal: 5, title: 'Set of Teacups' });
    await recordEtsySale(sale({ quantity: 2 }), w.deps);
    expect(w.notices).toEqual([
      { organizerId: 'org_1', item: { id: 'item_1', title: 'Set of Teacups', saleId: 'sale_1' }, kind: 'partial', units: 2, remainingStock: 3 },
    ]);
    expect(ETSY_SOLD_MESSAGES.partial('Set of Teacups', 2, 3)).toBe('2 units of "Set of Teacups" sold on Etsy. 3 remaining.');
    expect(ETSY_SOLD_MESSAGES.partial('Set of Teacups', 1, 4)).toBe('One unit of "Set of Teacups" sold on Etsy. 4 remaining.');
  });

  it('an eBay count sync failure never fails the sale', async () => {
    const w = world({ stockTotal: 5 });
    w.deps.syncStock = jest.fn(async () => {
      throw new Error('ebay down');
    });
    const r = await recordEtsySale(sale(), w.deps);
    expect(r.status).toBe('recorded');
  });
});

describe('recordEtsySale: last unit', () => {
  it('sets the listing SOLD BEFORE the fan-out runs, then lastSoldVia ETSY, then fans out, then notifies', async () => {
    const w = world();
    const r = await recordEtsySale(sale(), w.deps);
    expect(r).toMatchObject({ status: 'recorded', fullySoldOut: true, oversold: false, remainingStock: 0 });
    expect(w.log).toEqual(['sell', 'listing-sold', 'lastSoldVia', 'fanOut', 'notify']);
    expect(w.fanOut).toHaveBeenCalledWith('item_1', 'etsy-sold');
    expect(w.listing.state).toBe('SOLD');
    expect(w.listing.endedAt).toEqual(new Date('2026-10-03T16:00:00.000Z'));
    expect(w.item.lastSoldVia).toBe('ETSY');
    expect(w.item.status).toBe('SOLD');
    expect(w.syncStock).not.toHaveBeenCalled();
  });

  it('the listing update is scoped to the item and the organizer', async () => {
    const w = world();
    await recordEtsySale(sale(), w.deps);
    expect(w.db.writes.listingUpdates[0].where).toEqual({ itemId: 'item_1', organizerId: 'org_1' });
  });

  it('notification text matches the ADR for a sold-out item', async () => {
    const w = world({ title: 'Brass Lamp' });
    await recordEtsySale(sale(), w.deps);
    expect(w.notices[0]).toMatchObject({ kind: 'sold-out', item: { title: 'Brass Lamp' } });
    expect(ETSY_SOLD_MESSAGES.title).toBe('Item sold on Etsy');
    expect(ETSY_SOLD_MESSAGES.soldOut('Brass Lamp')).toBe(
      '"Brass Lamp" sold on Etsy and has been marked as sold. It is being removed from your other marketplaces.'
    );
  });

  it('a fan-out that throws does not fail the sale', async () => {
    const w = world();
    w.deps.fanOut = jest.fn(() => {
      throw new Error('boom');
    });
    expect((await recordEtsySale(sale(), w.deps)).status).toBe('recorded');
    expect(w.notify).toHaveBeenCalled();
  });

  it('a notification that throws does not fail the sale', async () => {
    const w = world();
    w.deps.notify = jest.fn(async () => {
      throw new Error('mail down');
    });
    expect((await recordEtsySale(sale(), w.deps)).status).toBe('recorded');
  });

  it('strips angle brackets and caps long titles in the notification text', () => {
    expect(ETSY_SOLD_MESSAGES.soldOut('<b>Bold</b> lamp')).toBe('"bBold/b lamp" sold on Etsy and has been marked as sold. It is being removed from your other marketplaces.');
    expect(ETSY_SOLD_MESSAGES.soldOut('x'.repeat(500)).length).toBeLessThan(260);
    expect(ETSY_SOLD_MESSAGES.soldOut('   ')).toContain('"Your item"');
  });
});

describe('recordEtsySale: stock desync (Etsy took real money the pool does not allow)', () => {
  it('clamps to the units that remain and still records the sale', async () => {
    const w = world({ stockTotal: 3, stockSold: 2 });
    const r = await recordEtsySale(sale({ quantity: 2 }), w.deps);
    expect(r).toMatchObject({ status: 'recorded', unitsApplied: 1, fullySoldOut: true, oversold: false });
    expect(w.stockCalls).toEqual([['item_1', 2], ['item_1', 1]]);
    expect(w.item.stockSold).toBe(3);
    expect(w.fanOut).toHaveBeenCalledTimes(1);
  });

  it('with nothing left it records an oversell, tells the organizer, and does not fan out again', async () => {
    const w = world({ stockTotal: 1, stockSold: 1, status: 'SOLD', lastSoldVia: 'STRIPE' });
    const r = await recordEtsySale(sale(), w.deps);
    expect(r).toMatchObject({ status: 'recorded', oversold: true, fullySoldOut: true, unitsApplied: 0, remainingStock: 0 });
    expect(w.fanOut).not.toHaveBeenCalled();
    expect(w.item.lastSoldVia).toBe('STRIPE');
    expect(w.listing.state).toBe('SOLD');
    expect(w.notices[0].kind).toBe('oversold');
    expect(ETSY_SOLD_MESSAGES.oversold('Brass Lamp')).toContain('had already sold somewhere else');
    expect(w.db.store.soldEvents).toHaveLength(1);
  });
});

describe('recordEtsySale: failures', () => {
  it('a database error in the stock step frees the transaction id so the next poll can retry', async () => {
    const w = world();
    w.deps.sellItemUnits = jest.fn(async () => {
      throw new Error('connection reset');
    });
    const r = await recordEtsySale(sale(), w.deps);
    expect(r).toEqual({ status: 'failed' });
    expect(w.db.store.soldEvents).toHaveLength(0);
    // The retry succeeds.
    w.deps.sellItemUnits = jest.fn(async () => ({ fullySoldOut: false, remainingStock: 2 }));
    expect((await recordEtsySale(sale(), w.deps)).status).toBe('recorded');
  });

  it('a ledger write that fails for another reason is reported as failed, not thrown', async () => {
    const w = world();
    w.db.etsySoldEvent.create = async () => {
      throw new Error('db down');
    };
    expect(await recordEtsySale(sale(), w.deps)).toEqual({ status: 'failed' });
    expect(w.sellItemUnits).not.toHaveBeenCalled();
  });

  it('an item that is not this organizer\'s is not touched (ledger row kept, itemFound false)', async () => {
    const w = world({ organizerId: 'org_2', sale: { organizerId: 'org_2' } });
    const r = await recordEtsySale(sale(), w.deps);
    expect(r).toEqual({ status: 'recorded', itemFound: false });
    expect(w.sellItemUnits).not.toHaveBeenCalled();
    expect(w.notify).not.toHaveBeenCalled();
  });
});

describe('processEtsyTransactions', () => {
  const tx = (over: Record<string, any> = {}) => ({
    transactionId: '7001',
    listingId: '9001',
    quantity: 1,
    receiptId: '3001',
    paidAt: SOLD_AT,
    ...over,
  });

  it('maps a transaction to its item only through EtsyListing (listing id, shop id, organizer id)', async () => {
    const w = world();
    const out = await processEtsyTransactions({ shopId: '555', organizerId: 'org_1', transactions: [tx()], source: 'POLL' }, w.deps);
    expect(out).toEqual({ recorded: 1, alreadyRecorded: 0, unmatched: 0, invalid: 0, failed: 0 });
    expect(w.db.writes.soldEventCreates[0]).toMatchObject({ itemId: 'item_1', etsyListingId: '9001', source: 'POLL', soldAt: SOLD_AT });
  });

  it('counts a listing we did not create, a listing in another shop and another organizer as unmatched', async () => {
    const w = world();
    const out = await processEtsyTransactions(
      { shopId: '555', organizerId: 'org_1', transactions: [tx({ listingId: '1234', transactionId: '1' }), tx({ transactionId: '2' })], source: 'POLL' },
      { ...w.deps }
    );
    expect(out.unmatched).toBe(1);
    expect(out.recorded).toBe(1);
    const otherShop = await processEtsyTransactions({ shopId: '999', organizerId: 'org_1', transactions: [tx({ transactionId: '3' })], source: 'POLL' }, w.deps);
    expect(otherShop.unmatched).toBe(1);
    const otherOrg = await processEtsyTransactions({ shopId: '555', organizerId: 'org_2', transactions: [tx({ transactionId: '4' })], source: 'POLL' }, w.deps);
    expect(otherOrg.unmatched).toBe(1);
  });

  it('counts repeats as alreadyRecorded and processes transactions in order', async () => {
    const w = world({ stockTotal: 4 });
    const batch = [tx({ transactionId: '1', quantity: 1 }), tx({ transactionId: '2', quantity: 2 }), tx({ transactionId: '1', quantity: 1 })];
    const out = await processEtsyTransactions({ shopId: '555', transactions: batch, source: 'WEBHOOK' }, w.deps);
    expect(out).toMatchObject({ recorded: 2, alreadyRecorded: 1 });
    expect(w.item.stockSold).toBe(3);
  });

  it('a failing sale is counted failed and the rest still run', async () => {
    const w = world({ stockTotal: 4 });
    let n = 0;
    w.deps.sellItemUnits = jest.fn(async () => {
      n++;
      if (n === 1) throw new Error('db blip');
      return { fullySoldOut: false, remainingStock: 2 };
    });
    const out = await processEtsyTransactions({ shopId: '555', transactions: [tx({ transactionId: '1' }), tx({ transactionId: '2' })], source: 'POLL' }, w.deps);
    expect(out).toMatchObject({ failed: 1, recorded: 1 });
  });

  it('a lookup error is counted failed, never thrown', async () => {
    const w = world();
    w.db.etsyListing.findFirst = async () => {
      throw new Error('db down');
    };
    expect(await processEtsyTransactions({ shopId: '555', transactions: [tx()], source: 'POLL' }, w.deps)).toMatchObject({ failed: 1 });
  });
});
