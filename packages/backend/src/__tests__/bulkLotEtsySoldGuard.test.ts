/**
 * Etsy sold sync meets a bulk lot (ADR-136 Addendum B, roadmap #659).
 *
 * WHAT THIS PROVES:
 *   - an Etsy order for a bulk lot is recorded in the ledger (so it is not read again) but moves no stock, sends no fan-out,
 *     and tells the organizer to use Adjust count
 *   - the lot lookup running with a failed database frees the ledger row (the next poll retries) instead of selling cards as units
 *   - a plain item still goes through the normal stock draw
 *   - the lot lookup defaults to the real lot table and the lot flag (a lot is found whatever the flag, a failure with the flag on throws)
 */
jest.mock('@sentry/node', () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));

import { recordEtsySale } from '../services/marketplace/etsySoldService';

function makeDb(lotIds: string[], over: { lookupFails?: boolean } = {}) {
  const events: any[] = [];
  const db: any = {
    etsySoldEvent: {
      create: async ({ data }: any) => void events.push(data),
      deleteMany: async ({ where }: any) => {
        for (let i = events.length - 1; i >= 0; i--) if (events[i].transactionId === where.transactionId) events.splice(i, 1);
      },
    },
    item: {
      findFirst: async () => ({ id: 'item1', title: 'Commons', saleId: 'sale1', status: 'AVAILABLE', stockTotal: 10000, stockSold: 0 }),
      findUnique: async () => ({ stockTotal: 10000, stockSold: 0 }),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    itemBulkLot: {
      findMany: async ({ where }: any) => {
        if (over.lookupFails) throw new Error('db down');
        return where.itemId.in.filter((id: string) => lotIds.includes(id)).map((itemId: string) => ({ itemId }));
      },
    },
    etsyListing: { updateMany: jest.fn(async () => ({ count: 1 })) },
  };
  return { db, events };
}

const ARGS = { organizerId: 'org1', itemId: 'item1', etsyListingId: '111', transactionId: '222', receiptId: '333', quantity: 3, soldAt: new Date('2026-10-05T10:00:00Z'), source: 'POLL' as const };

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  process.env.CARD_BULK_LOTS_ENABLED = 'true';
});
afterAll(() => {
  delete process.env.CARD_BULK_LOTS_ENABLED;
});

describe('Etsy sold sync and bulk lots', () => {
  it('records an order for a lot without moving stock, and tells the organizer to adjust the count', async () => {
    const { db, events } = makeDb(['item1']);
    const sell = jest.fn();
    const fanOut = jest.fn();
    const notify = jest.fn(async () => undefined);
    const res = await recordEtsySale(ARGS, { db, sellItemUnits: sell, fanOut, notify });
    expect(res).toEqual({ status: 'recorded', itemFound: true, unitsApplied: 0 });
    expect(events).toHaveLength(1);
    expect(sell).not.toHaveBeenCalled();
    expect(fanOut).not.toHaveBeenCalled();
    expect(db.item.updateMany).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'bulk-lot', remainingStock: 10000 }));
  });

  it('with the flag off a lot is still recognised and still not drawn down one unit at a time', async () => {
    process.env.CARD_BULK_LOTS_ENABLED = 'false';
    const { db } = makeDb(['item1']);
    const sell = jest.fn();
    const res = await recordEtsySale(ARGS, { db, sellItemUnits: sell, notify: async () => undefined });
    expect(res.unitsApplied).toBe(0);
    expect(sell).not.toHaveBeenCalled();
  });

  it('a failed lookup with the flag on frees the ledger row so the next poll retries, and sells nothing', async () => {
    const { db, events } = makeDb(['item1'], { lookupFails: true });
    const sell = jest.fn();
    const res = await recordEtsySale(ARGS, { db, sellItemUnits: sell, notify: async () => undefined });
    expect(res).toEqual({ status: 'failed' });
    expect(events).toHaveLength(0);
    expect(sell).not.toHaveBeenCalled();
  });

  it('a plain item goes through the normal stock draw', async () => {
    const { db } = makeDb([]);
    const sell = jest.fn(async () => ({ fullySoldOut: false, remainingStock: 7 }));
    const res = await recordEtsySale(ARGS, { db, sellItemUnits: sell, syncStock: async () => undefined, notify: async () => undefined });
    expect(sell).toHaveBeenCalledWith('item1', 3);
    expect(res).toMatchObject({ status: 'recorded', unitsApplied: 3, remainingStock: 7 });
  });

  it('an injected lookup overrides the default', async () => {
    const { db } = makeDb([]);
    const sell = jest.fn();
    const res = await recordEtsySale(ARGS, { db, sellItemUnits: sell, isBulkLot: async () => true, notify: async () => undefined });
    expect(res.unitsApplied).toBe(0);
    expect(sell).not.toHaveBeenCalled();
  });
});
