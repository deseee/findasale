/**
 * Consignor ledger and consignor price tags: services/consignorLedgerService.loadUnsettled.
 * NOT EXECUTED when written (jest cannot run on the authoring device); CI is the first real run.
 * Same in-memory fake as consignorLedger.test.ts (__fixtures__/fakeLedgerDb.ts).
 *
 * A tag sold at a POS mints a photo-less SOLD Item (listingType CONSIGNOR_TAG) with the consignor on it and a PAID Purchase row. The ledger
 * must therefore:
 *   - owe the consignor for it (the item is SOLD, has a consignor and a price) with the tag price as the basis, with no minimum price floor
 *   - treat a hub tag (consignorId AND vendorBoothId) exactly the same
 *   - leave a REFUNDED tag out and say why (a refunded tag item stays SOLD, so the refunded Purchase is what excludes it)
 *   - use the net amount for a partially refunded tag
 */
jest.mock('../lib/prisma', () => {
  const { createFakeDb } = require('./__fixtures__/fakeLedgerDb');
  return { prisma: createFakeDb() };
});

import { prisma } from '../lib/prisma';
import * as ledger from '../services/consignorLedgerService';

const db: any = prisma;
const fake = db.__fake;

let ws: { userId: string; organizerId: string; workspaceId: string };
let sale: any;

beforeEach(() => {
  for (const t of Object.keys(fake.store)) fake.store[t] = [];
  ws = fake.seedWorkspace();
  sale = fake.seedSale(ws.organizerId, 'Spring Sale');
});

function seedTag(consignorId: string, priceDollars: number, over: Record<string, unknown> = {}) {
  return fake.seedItem(consignorId, {
    title: `Consigned tag $${priceDollars.toFixed(2)}`,
    price: priceDollars,
    status: 'SOLD',
    saleId: sale.id,
    listingType: 'CONSIGNOR_TAG',
    stockTotal: 1,
    stockSold: 1,
    ...over,
  });
}

describe('loadUnsettled with minted consignor tag items', () => {
  it('owes the consignor for a minted tag, on the tag price, next to an ordinary sold item', async () => {
    const c = fake.seedConsignor(ws.workspaceId);
    const tag = seedTag(c.id, 5);
    fake.seedPurchase(tag.id, { amount: 5, status: 'PAID' });
    const lamp = fake.seedItem(c.id, { price: 20, saleId: sale.id });
    fake.seedPurchase(lamp.id, { amount: 20, status: 'PAID' });

    const r = await ledger.loadUnsettled(db, { workspaceId: ws.workspaceId });
    expect(r.excluded).toHaveLength(0);
    expect(r.consignors).toHaveLength(1);
    expect(r.consignors[0].lines.map((l) => l.itemId).sort()).toEqual([tag.id, lamp.id].sort());
    expect(r.consignors[0].gross.toNumber()).toBe(25);
  });

  it('a $1.00 tag is owed as sold: the consignment minimum price floor does not apply to tags', async () => {
    const c = fake.seedConsignor(ws.workspaceId);
    const tag = seedTag(c.id, 1);
    fake.seedPurchase(tag.id, { amount: 1, status: 'PAID' });
    const r = await ledger.loadUnsettled(db, { workspaceId: ws.workspaceId });
    expect(r.consignors[0].lines.map((l) => l.itemId)).toEqual([tag.id]);
    expect(r.consignors[0].gross.toNumber()).toBe(1);
  });

  it('a hub-register tag (consignorId and vendorBoothId both set) is owed the same way', async () => {
    const c = fake.seedConsignor(ws.workspaceId);
    const tag = seedTag(c.id, 8, { vendorBoothId: 'boothV' });
    fake.seedPurchase(tag.id, { amount: 8, status: 'PAID' });
    const r = await ledger.loadUnsettled(db, { workspaceId: ws.workspaceId });
    expect(r.consignors[0].lines.map((l) => l.itemId)).toEqual([tag.id]);
    expect(r.consignors[0].gross.toNumber()).toBe(8);
  });

  it('leaves a REFUNDED tag out and reports why (the minted item stays SOLD; its refunded Purchase excludes it)', async () => {
    const c = fake.seedConsignor(ws.workspaceId);
    const refunded = seedTag(c.id, 5);
    fake.seedPurchase(refunded.id, { amount: 5, status: 'REFUNDED' });
    const kept = seedTag(c.id, 7);
    fake.seedPurchase(kept.id, { amount: 7, status: 'PAID' });

    const r = await ledger.loadUnsettled(db, { workspaceId: ws.workspaceId });
    expect(r.consignors[0].lines.map((l) => l.itemId)).toEqual([kept.id]);
    expect(r.excluded).toEqual([expect.objectContaining({ itemId: refunded.id, reason: 'REFUNDED' })]);
    expect(r.consignors[0].gross.toNumber()).toBe(7);
  });

  it('a tag whose refund is still in progress is held back, not paid', async () => {
    const c = fake.seedConsignor(ws.workspaceId);
    const tag = seedTag(c.id, 5);
    fake.seedPurchase(tag.id, { amount: 5, status: 'REFUNDING' });
    const r = await ledger.loadUnsettled(db, { workspaceId: ws.workspaceId });
    expect(r.consignors).toHaveLength(0);
    expect(r.excluded).toEqual([expect.objectContaining({ itemId: tag.id, reason: 'REFUND_IN_PROGRESS' })]);
  });

  it('a partly refunded tag is owed on what the buyer actually kept', async () => {
    const c = fake.seedConsignor(ws.workspaceId);
    const tag = seedTag(c.id, 10);
    fake.seedPurchase(tag.id, { amount: 10, status: 'PAID', refundedAmount: 4 });
    const r = await ledger.loadUnsettled(db, { workspaceId: ws.workspaceId });
    expect(r.consignors[0].lines).toHaveLength(1);
    expect(r.consignors[0].gross.toNumber()).toBe(6);
  });

  it('a tag already inside a live payout line is not owed twice', async () => {
    const c = fake.seedConsignor(ws.workspaceId);
    const tag = seedTag(c.id, 5);
    fake.seedPurchase(tag.id, { amount: 5, status: 'PAID' });
    fake.store.consignorPayoutItem.push({ id: 'line_t', payoutId: 'payout_t', itemId: tag.id, activeItemKey: tag.id });
    const r = await ledger.loadUnsettled(db, { workspaceId: ws.workspaceId });
    expect(r.consignors).toHaveLength(0);
  });
});
