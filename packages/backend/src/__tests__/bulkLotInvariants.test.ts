/**
 * Lot invariants at every entry point that can touch a lot (ADR-136 Addendum B, roadmap #659).
 *
 * WHAT THIS PROVES:
 *   - the generic item edit cannot change a lot's card count, status, listing type or auction fields; a resave with the
 *     CURRENT values (the edit page sends every key) is fine; the price is a price per 1,000 rounded to whole cents and
 *     must be above $0.00; markdown exclusion and the eBay shipping override are forced, not refused
 *   - every channel refusal (auction, bounty, Facebook, hold invoice, eBay and Etsy sync) answers for a lot and lets a plain item through
 *   - a failed lookup refuses (503, fail closed) with the flag on and lets the item through with the flag off
 *   - the sync skip is true for a lot and for a failed lookup with the flag on
 *   - delete is blocked while cards are on an active hold or in a hub cart, and not otherwise
 */
import { evaluateLotItemEdit, lotChannelRefusal, lotDeleteBlocker, lotSyncSkip, LOT_CHANNEL_MESSAGES, LOT_INVARIANT_MESSAGES } from '../services/bulkLot/bulkLotInvariants';
import { FakeDb } from './__fixtures__/bulkLotFollowupFakes';

const CURRENT = { stockTotal: 10000, stockSold: 100, status: 'AVAILABLE', listingType: 'FIXED' };

function refusalOf(body: Record<string, unknown>) {
  const d = evaluateLotItemEdit(body, CURRENT);
  return d.ok ? null : d.refusal;
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('evaluateLotItemEdit', () => {
  it('refuses a different card total and sends the seller to Adjust count', () => {
    expect(refusalOf({ stockTotal: 9000 })).toMatchObject({ status: 409, code: 'BULK_USE_ADJUST', field: 'stockTotal', message: LOT_INVARIANT_MESSAGES.BULK_USE_ADJUST });
    expect(refusalOf({ stockTotal: 'abc' })?.code).toBe('BULK_USE_ADJUST');
  });

  it('lets a resave carry the current total, status and listing type', () => {
    const d = evaluateLotItemEdit({ stockTotal: 10000, status: 'AVAILABLE', listingType: 'FIXED', title: 'New title' }, CURRENT);
    expect(d.ok).toBe(true);
    expect(evaluateLotItemEdit({ stockTotal: '10000', stockSold: 100 }, CURRENT).ok).toBe(true);
    expect(evaluateLotItemEdit({ stockTotal: null, status: '', listingType: null }, CURRENT).ok).toBe(true);
  });

  it('refuses a move to auction, bounty-style listing types and a changed status', () => {
    expect(refusalOf({ listingType: 'AUCTION' })?.code).toBe('BULK_LOT_LISTING_TYPE');
    expect(refusalOf({ listingType: 'REVERSE_AUCTION' })?.code).toBe('BULK_LOT_LISTING_TYPE');
    expect(refusalOf({ status: 'SOLD' })?.code).toBe('BULK_LOT_STATUS');
    expect(refusalOf({ status: 'HIDDEN' })?.code).toBe('BULK_LOT_STATUS');
  });

  it('refuses any set auction field, but ignores the unset values the edit page always sends', () => {
    expect(refusalOf({ auctionStartPrice: 5 })?.code).toBe('BULK_LOT_AUCTION');
    expect(refusalOf({ auctionEndTime: '2026-11-01T00:00:00Z' })?.code).toBe('BULK_LOT_AUCTION');
    expect(refusalOf({ reverseAuction: true })?.code).toBe('BULK_LOT_AUCTION');
    expect(refusalOf({ bidIncrement: '1.00' })?.code).toBe('BULK_LOT_AUCTION');
    expect(evaluateLotItemEdit({ auctionStartPrice: null, auctionReservePrice: '', bidIncrement: 0, reverseAuction: false, reverseDailyDrop: 'false', auctionEndTime: undefined }, CURRENT).ok).toBe(true);
  });

  it('keeps the price per 1,000 editable, rounded to whole cents, above zero', () => {
    const ok = evaluateLotItemEdit({ price: '8.005' }, CURRENT);
    expect(ok.ok && ok.forced.price).toBe(8.01);
    const whole = evaluateLotItemEdit({ price: 12 }, CURRENT);
    expect(whole.ok && whole.forced.price).toBe(12);
    for (const bad of [0, -1, 'abc', '', 0.001, NaN]) {
      expect(refusalOf({ price: bad })).toMatchObject({ status: 400, code: 'BULK_LOT_PRICE', field: 'price' });
    }
  });

  it('forces markdown exclusion and the eBay shipping override on every allowed edit, and sends no price when none was sent', () => {
    const d = evaluateLotItemEdit({ title: 'x', excludeFromMarkdown: false, ebayShippingOverride: 'FREE' }, CURRENT);
    expect(d.ok && d.forced).toEqual({ excludeFromMarkdown: true, ebayShippingOverride: 'DONT_LIST' });
  });

  it('handles a missing body and a null current total', () => {
    expect(evaluateLotItemEdit(undefined, CURRENT).ok).toBe(true);
    expect(evaluateLotItemEdit({ stockTotal: 1 }, { ...CURRENT, stockTotal: null }).ok).toBe(true);
    expect(evaluateLotItemEdit({ stockTotal: 2 }, { ...CURRENT, stockTotal: null }).ok).toBe(false);
  });
});

describe('lotChannelRefusal', () => {
  it('refuses a lot on every channel with that channel\'s message, and passes a plain item', async () => {
    const db = new FakeDb();
    const lot = db.addLot();
    for (const channel of ['AUCTION', 'BOUNTY', 'FACEBOOK_NATIVE', 'HOLD_INVOICE', 'EBAY_SYNC', 'ETSY_SYNC'] as const) {
      const r = await lotChannelRefusal(db as any, lot.id, channel, true);
      expect(r).toMatchObject({ status: 409, code: 'BULK_LOT_CHANNEL', channel, message: LOT_CHANNEL_MESSAGES[channel] });
      expect(await lotChannelRefusal(db as any, 'plain-item', channel, true)).toBeNull();
    }
    expect(await lotChannelRefusal(db as any, null, 'AUCTION', true)).toBeNull();
  });

  it('with the flag off still recognises a lot (the lookup runs regardless of the flag)', async () => {
    const db = new FakeDb();
    const lot = db.addLot();
    expect(await lotChannelRefusal(db as any, lot.id, 'AUCTION', false)).not.toBeNull();
  });

  it('fails closed with a 503 when the lookup fails and the flag is on, and open when it is off', async () => {
    const broken = { itemBulkLot: { findMany: async () => { throw new Error('db down'); } } };
    expect(await lotChannelRefusal(broken as any, 'x', 'BOUNTY', true)).toMatchObject({ status: 503, code: 'BULK_CHECK_FAILED' });
    expect(await lotChannelRefusal(broken as any, 'x', 'BOUNTY', false)).toBeNull();
  });
});

describe('lotSyncSkip', () => {
  it('is true for a lot, false for a plain item, and follows the flag when the lookup fails', async () => {
    const db = new FakeDb();
    const lot = db.addLot();
    expect(await lotSyncSkip(db as any, lot.id, true)).toBe(true);
    expect(await lotSyncSkip(db as any, 'plain', true)).toBe(false);
    expect(await lotSyncSkip(db as any, undefined, true)).toBe(false);
    const broken = { itemBulkLot: { findMany: async () => { throw new Error('db down'); } } };
    expect(await lotSyncSkip(broken as any, 'x', true)).toBe(true);
    expect(await lotSyncSkip(broken as any, 'x', false)).toBe(false);
  });
});

describe('lotDeleteBlocker', () => {
  it('blocks while cards are on an active hold or in a hub cart, and not once they are back', async () => {
    const db = new FakeDb();
    const lot = db.addLot();
    expect(await lotDeleteBlocker(db as any, lot.id)).toBe(false);
    await db.bulkLotHold.create({ data: { itemId: lot.id, status: 'ACTIVE', quantity: 10 } });
    expect(await lotDeleteBlocker(db as any, lot.id)).toBe(true);
    db.bulkLotHold.rows[0].status = 'RELEASED';
    expect(await lotDeleteBlocker(db as any, lot.id)).toBe(false);
    await db.boothCartBulkLine.create({ data: { itemId: lot.id, status: 'RESERVED', quantity: 5 } });
    expect(await lotDeleteBlocker(db as any, lot.id)).toBe(true);
    db.boothCartBulkLine.rows[0].status = 'SOLD';
    expect(await lotDeleteBlocker(db as any, lot.id)).toBe(false);
  });

  it('with the flag on a failed check throws (the delete stops), with it off the delete is not blocked', async () => {
    const broken = { bulkLotHold: { count: async () => { throw new Error('no table'); } }, boothCartBulkLine: { count: async () => 0 } };
    await expect(lotDeleteBlocker(broken as any, 'x', true)).rejects.toThrow('no table');
    expect(await lotDeleteBlocker(broken as any, 'x', false)).toBe(false);
  });
});
