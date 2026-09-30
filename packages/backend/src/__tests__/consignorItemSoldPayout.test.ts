/**
 * Feature #309 "item sold" consignor email math (services/consignorItemSoldPayout.ts, wired into
 * controllers/stripeController.ts's payment_intent.succeeded item-sold block, 2026-09-29).
 *
 * NOT EXECUTED when written (no runnable jest in the environment). Run
 *   pnpm --filter backend test -- consignorItemSoldPayout
 * before merging.
 *
 * THE BUG: the email computed `price * (100 - commissionRate) / 100`, but Consignor.commissionRate
 * is the CONSIGNOR's share (70.00 = the consignor gets 70%), so a 70% consignor was told they would
 * receive 30%. It also took the consignor from the sale's first item row instead of the sold item.
 * This suite pins: the consignor comes from the sold item's own consignorId, and the net is what
 * the shared ADR-096 calculateConsignorPayout returns (flat and tiered, rounded half-up to cents).
 *
 * calculateConsignorPayout is the REAL implementation; only prisma is mocked.
 */

jest.mock('../lib/prisma', () => ({
  prisma: {
    consignor: { findUnique: jest.fn() },
    commissionTier: { findMany: jest.fn() },
  },
}));
jest.mock('../services/commissionTierService', () => ({ DEFAULT_LADDER: [] }));

import * as fs from 'fs';
import * as path from 'path';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../lib/prisma';
import { getConsignorItemSoldPayout } from '../services/consignorItemSoldPayout';

const db: any = prisma;

const consignorRow = (over: any = {}) => ({
  id: 'con_1',
  workspaceId: 'ws_1',
  name: 'Pat Maker',
  email: 'pat@maplemail.net',
  commissionRate: new Decimal('70.00'),
  useTieredCommission: false,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getConsignorItemSoldPayout', () => {
  it('a 70% consignor nets 70% of the price, not the inverse 30%', async () => {
    db.consignor.findUnique.mockResolvedValue(consignorRow());
    const res = await getConsignorItemSoldPayout({ id: 'item_1', price: 100, consignorId: 'con_1' });
    expect(res?.consignorPayout).toBe(70);
    expect(res?.consignorPayout).not.toBe(30);
    expect(res?.consignor).toEqual({ id: 'con_1', name: 'Pat Maker', email: 'pat@maplemail.net' });
  });

  it("loads the consignor from the SOLD ITEM's own consignorId", async () => {
    db.consignor.findUnique.mockResolvedValue(consignorRow({ id: 'con_9' }));
    await getConsignorItemSoldPayout({ id: 'item_1', price: 20, consignorId: 'con_9' });
    expect(db.consignor.findUnique).toHaveBeenCalledWith({ where: { id: 'con_9' } });
  });

  it('rounds half-up to cents like the ledger ($33.33 at 70% = $23.33)', async () => {
    db.consignor.findUnique.mockResolvedValue(consignorRow());
    const res = await getConsignorItemSoldPayout({ id: 'item_1', price: 33.33, consignorId: 'con_1' });
    expect(res?.consignorPayout).toBe(23.33);
  });

  it('a 100% consignor nets the whole price and a 0% consignor nets nothing', async () => {
    db.consignor.findUnique.mockResolvedValue(consignorRow({ commissionRate: new Decimal('100.00') }));
    expect((await getConsignorItemSoldPayout({ id: 'i', price: 45.5, consignorId: 'con_1' }))?.consignorPayout).toBe(45.5);
    db.consignor.findUnique.mockResolvedValue(consignorRow({ commissionRate: new Decimal('0.00') }));
    expect((await getConsignorItemSoldPayout({ id: 'i', price: 45.5, consignorId: 'con_1' }))?.consignorPayout).toBe(0);
  });

  it('honours tiered commission (the shared function, not a second copy of the math)', async () => {
    db.consignor.findUnique.mockResolvedValue(consignorRow({ useTieredCommission: true }));
    db.commissionTier.findMany.mockResolvedValue([
      { id: 't1', minPrice: new Decimal('0'), maxPrice: new Decimal('50'), consignorRate: new Decimal('60') },
      { id: 't2', minPrice: new Decimal('50'), maxPrice: null, consignorRate: new Decimal('80') },
    ]);
    expect((await getConsignorItemSoldPayout({ id: 'i', price: 75, consignorId: 'con_1' }))?.consignorPayout).toBe(60);
    expect((await getConsignorItemSoldPayout({ id: 'i', price: 40, consignorId: 'con_1' }))?.consignorPayout).toBe(24);
  });

  it('a missing price nets 0 instead of NaN', async () => {
    db.consignor.findUnique.mockResolvedValue(consignorRow());
    expect((await getConsignorItemSoldPayout({ id: 'i', price: null, consignorId: 'con_1' }))?.consignorPayout).toBe(0);
  });

  it('returns null, without a DB read, for an item with no consignor', async () => {
    expect(await getConsignorItemSoldPayout({ id: 'i', price: 10, consignorId: null })).toBeNull();
    expect(await getConsignorItemSoldPayout({ id: 'i', price: 10 })).toBeNull();
    expect(db.consignor.findUnique).not.toHaveBeenCalled();
  });

  it('returns null when the consignor row no longer exists', async () => {
    db.consignor.findUnique.mockResolvedValue(null);
    expect(await getConsignorItemSoldPayout({ id: 'i', price: 10, consignorId: 'gone' })).toBeNull();
  });
});

describe('stripeController wiring (source contract)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../controllers/stripeController.ts'), 'utf8');

  it('no longer computes the consignor net with the inverse 100 - commissionRate math', () => {
    expect(src).not.toMatch(/100\s*-\s*Number\(consignor\.commissionRate\)/);
  });

  it("takes the consignor from the sold item's own consignorId through the shared payout helper", () => {
    expect(src).toMatch(/getConsignorItemSoldPayout/);
    expect(src).toMatch(/soldItem\.consignorId/);
    expect(src).not.toMatch(/saleData\?\.items\?\.\[0\]/);
  });
});
