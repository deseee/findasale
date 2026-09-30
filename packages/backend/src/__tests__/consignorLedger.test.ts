/**
 * Consignor settlement ledger (organizer-settles model, 2026-09-29): behavior coverage for
 * services/consignorLedgerService.ts and the per-line output of calculateConsignorPayout.
 *
 * NOT EXECUTED when written: the build sandbox could not run jest or tsc (disk full, no test
 * runner). Run `pnpm --filter backend test consignorLedger` before merging. Everything here runs
 * against the in-memory fake in __fixtures__/fakeLedgerDb.ts, which models the semantics the ledger
 * relies on: the unique activeItemKey guard (P2002), conditional updateMany, transaction rollback,
 * relation filters, and serialized transactions. No real DB, email, payment rail or network.
 */
jest.mock('../lib/prisma', () => {
  const { createFakeDb } = require('./__fixtures__/fakeLedgerDb');
  return { prisma: createFakeDb() };
});

import { prisma } from '../lib/prisma';
import * as ledger from '../services/consignorLedgerService';
import { calculateConsignorPayout, roundToCents } from '../services/commissionCalcService';

const db: any = prisma;
const fake = db.__fake;
const D = fake.D;

let ws: { userId: string; organizerId: string; workspaceId: string };
let sale: any;

beforeEach(() => {
  for (const t of Object.keys(fake.store)) fake.store[t] = [];
  ws = fake.seedWorkspace();
  sale = fake.seedSale(ws.organizerId, 'Spring Sale');
});

/** Run a sync function and return what it threw (or undefined). */
function catchErr(fn: () => unknown): any {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return undefined;
}

const paidAtIso = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

async function makeRun(opts: { items?: { price: number; title?: string; saleId?: string | null }[]; consignors?: number } = {}) {
  const items = opts.items ?? [{ price: 20 }, { price: 30 }];
  const consignors: any[] = [];
  for (let n = 0; n < (opts.consignors ?? 1); n++) {
    const c = fake.seedConsignor(ws.workspaceId, { name: `Consignor ${n + 1}`, email: `c${n + 1}@example.com` });
    consignors.push(c);
    for (const it of items) {
      fake.seedItem(c.id, { price: it.price, title: it.title ?? `Item ${n + 1}-${it.price}`, saleId: it.saleId === undefined ? sale.id : it.saleId });
    }
  }
  const { batch, excluded } = await ledger.createSettlementRun(db, { workspaceId: ws.workspaceId, actorUserId: ws.userId, saleId: sale.id });
  return { batch, excluded, consignors };
}

async function makeApprovedRun(opts: Parameters<typeof makeRun>[0] = {}) {
  const run = await makeRun(opts);
  await ledger.approveRun(db, { workspaceId: ws.workspaceId, batchId: run.batch.id, actorUserId: ws.userId });
  return run;
}

const payoutsOf = (batchId: string) => fake.store.consignorPayout.filter((p: any) => p.settlementBatchId === batchId);
const eventsOf = (payoutId: string, type?: string) =>
  fake.store.consignorPayoutEvent.filter((e: any) => e.payoutId === payoutId && (!type || e.type === type));

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('calculateConsignorPayout per-line output', () => {
  const flat = (rate: number) => ({ id: 'c1', workspaceId: 'w1', commissionRate: D(rate), useTieredCommission: false });

  it('rounds each share half-up to cents and net is the sum of the rounded shares', async () => {
    const r = await calculateConsignorPayout(flat(50), [
      { id: 'a', price: 0.25 },
      { id: 'b', price: 0.25 },
    ]);
    expect(r.lines.map((l) => l.share.toFixed(2))).toEqual(['0.13', '0.13']); // 0.125 rounds UP
    expect(r.net.toFixed(2)).toBe('0.26'); // not 0.25: the total equals the sum of the visible lines
    expect(r.gross.toFixed(2)).toBe('0.50');
  });

  it('per-line rounding sums exactly for an awkward rate', async () => {
    const items = [19.99, 19.99, 19.99].map((price, i) => ({ id: `i${i}`, price }));
    const r = await calculateConsignorPayout(flat(33.33), items);
    for (const l of r.lines) expect(l.share.toFixed(2)).toBe('6.66'); // 6.662667
    expect(r.net.toFixed(2)).toBe('19.98');
    expect(r.net.equals(r.lines.reduce((s, l) => s.plus(l.share), D(0)))).toBe(true);
  });

  it('every line carries the consignor rate, price and a null tier label when flat', async () => {
    const r = await calculateConsignorPayout(flat(70), [{ id: 'a', price: 10 }]);
    expect(r.lines[0]).toMatchObject({ itemId: 'a', tierLabel: null });
    expect(r.lines[0].ratePct.toString()).toBe('70');
    expect(r.lines[0].price.toFixed(2)).toBe('10.00');
    expect(r.tierBreakdown).toBeNull();
  });

  it('tier boundary: minPrice is inclusive, so an item at exactly $25 or $100 takes the higher band', async () => {
    fake.store.commissionTier.push(
      { id: 't1', workspaceId: 'w1', minPrice: D(0), maxPrice: D(25), consignorRate: D(30) },
      { id: 't2', workspaceId: 'w1', minPrice: D(25), maxPrice: D(100), consignorRate: D(50) },
      { id: 't3', workspaceId: 'w1', minPrice: D(100), maxPrice: null, consignorRate: D(70) }
    );
    const consignor = { id: 'c1', workspaceId: 'w1', commissionRate: D(50), useTieredCommission: true };
    const r = await calculateConsignorPayout(consignor, [
      { id: 'low', price: 24.99 },
      { id: 'at25', price: 25 },
      { id: 'at100', price: 100 },
    ]);
    const rate = (id: string) => r.lines.find((l) => l.itemId === id)!.ratePct.toString();
    expect(rate('low')).toBe('30');
    expect(rate('at25')).toBe('50');
    expect(rate('at100')).toBe('70');
    expect(r.net.equals(r.lines.reduce((s, l) => s.plus(l.share), D(0)))).toBe(true);
    expect(r.tierBreakdown).toHaveLength(3);
  });

  it('a tiered consignor with no ladder falls back to the flat rate with lines', async () => {
    const r = await calculateConsignorPayout({ id: 'c1', workspaceId: 'empty', commissionRate: D(40), useTieredCommission: true }, [{ id: 'a', price: 10 }]);
    expect(r.lines[0].share.toFixed(2)).toBe('4.00');
    expect(r.tierBreakdown).toBeNull();
  });

  it('null, negative and NaN prices count as 0 instead of corrupting the total', async () => {
    const r = await calculateConsignorPayout(flat(50), [
      { id: 'n', price: null },
      { id: 'neg', price: -5 },
      { id: 'nan', price: NaN },
      { id: 'ok', price: 10 },
    ]);
    expect(r.gross.toFixed(2)).toBe('10.00');
    expect(r.net.toFixed(2)).toBe('5.00');
  });

  it('roundToCents is half-up', () => {
    expect(roundToCents(0.125).toFixed(2)).toBe('0.13');
    expect(roundToCents(0.124).toFixed(2)).toBe('0.12');
    expect(roundToCents('2.675').toFixed(2)).toBe('2.68');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('loadUnsettled', () => {
  it('excludes items that already sit in a live payout line and includes them again once the line is voided', async () => {
    const c = fake.seedConsignor(ws.workspaceId);
    const a = fake.seedItem(c.id, { price: 20, saleId: sale.id });
    const b = fake.seedItem(c.id, { price: 30, saleId: sale.id });
    fake.store.consignorPayoutItem.push({ id: 'line_x', payoutId: 'payout_x', itemId: a.id, activeItemKey: a.id });

    let r = await ledger.loadUnsettled(db, { workspaceId: ws.workspaceId });
    expect(r.consignors[0].lines.map((l) => l.itemId)).toEqual([b.id]);

    fake.store.consignorPayoutItem[0].activeItemKey = null; // voided
    r = await ledger.loadUnsettled(db, { workspaceId: ws.workspaceId });
    expect(r.consignors[0].lines.map((l) => l.itemId).sort()).toEqual([a.id, b.id].sort());
  });

  it('only counts SOLD items that have a consignor', async () => {
    const c = fake.seedConsignor(ws.workspaceId);
    fake.seedItem(c.id, { price: 20, status: 'AVAILABLE' });
    fake.seedItem(null, { price: 99 });
    const sold = fake.seedItem(c.id, { price: 10 });
    const r = await ledger.loadUnsettled(db, { workspaceId: ws.workspaceId });
    expect(r.consignors).toHaveLength(1);
    expect(r.consignors[0].lines.map((l) => l.itemId)).toEqual([sold.id]);
  });

  it.each([
    ['REFUNDED', 'REFUNDED'],
    ['DISPUTE_LOST', 'DISPUTE_LOST'],
    ['DISPUTED', 'DISPUTED'],
    ['REFUNDING', 'REFUND_IN_PROGRESS'],
  ])('excludes an item whose latest purchase is %s and reports why', async (purchaseStatus, reason) => {
    const c = fake.seedConsignor(ws.workspaceId);
    const item = fake.seedItem(c.id, { price: 20, title: 'Vase' });
    fake.seedPurchase(item.id, { status: purchaseStatus });
    const r = await ledger.loadUnsettled(db, { workspaceId: ws.workspaceId });
    expect(r.consignors).toHaveLength(0);
    expect(r.excluded).toEqual([expect.objectContaining({ itemId: item.id, title: 'Vase', reason })]);
    expect(r.excluded[0].detail.length).toBeGreaterThan(10);
  });

  it('an item that was refunded and then resold (latest purchase PAID) is payable', async () => {
    const c = fake.seedConsignor(ws.workspaceId);
    const item = fake.seedItem(c.id, { price: 20 });
    fake.seedPurchase(item.id, { status: 'REFUNDED', createdAt: new Date('2026-01-01') });
    fake.seedPurchase(item.id, { status: 'PAID', amount: 20, createdAt: new Date('2026-02-01') });
    const r = await ledger.loadUnsettled(db, { workspaceId: ws.workspaceId });
    expect(r.consignors[0].lines).toHaveLength(1);
    expect(r.excluded).toHaveLength(0);
  });

  it('excludes items with no usable price', async () => {
    const c = fake.seedConsignor(ws.workspaceId);
    const item = fake.seedItem(c.id, { price: null });
    const zero = fake.seedItem(c.id, { price: 0 });
    const r = await ledger.loadUnsettled(db, { workspaceId: ws.workspaceId });
    expect(r.excluded.map((e) => e.itemId).sort()).toEqual([item.id, zero.id].sort());
    expect(r.excluded.every((e) => e.reason === 'NO_PRICE')).toBe(true);
  });

  it('stores collectedAmount and basisSource per line and flags variance without changing the payout', async () => {
    const c = fake.seedConsignor(ws.workspaceId);
    const same = fake.seedItem(c.id, { price: 20, title: 'Same' });
    fake.seedPurchase(same.id, { amount: 20 });
    const off = fake.seedItem(c.id, { price: 40, title: 'Discounted at register' });
    fake.seedPurchase(off.id, { amount: 30 });
    const partial = fake.seedItem(c.id, { price: 50, title: 'Partly refunded' });
    fake.seedPurchase(partial.id, { amount: 50, refundedAmount: 10 });
    const cash = fake.seedItem(c.id, { price: 10, title: 'Cash sale, no purchase row' });

    const r = await ledger.loadUnsettled(db, { workspaceId: ws.workspaceId });
    const line = (id: string) => r.consignors[0].lines.find((l) => l.itemId === id)!;
    expect(line(same.id)).toMatchObject({ varianceFlag: false, basisSource: 'ITEM_PRICE' });
    expect(line(same.id).collectedAmount!.toFixed(2)).toBe('20.00');
    expect(line(off.id).varianceFlag).toBe(true);
    expect(line(off.id).collectedAmount!.toFixed(2)).toBe('30.00');
    expect(line(off.id).listPrice.toFixed(2)).toBe('40.00'); // basis is still the tag price in v1
    expect(line(partial.id).collectedAmount!.toFixed(2)).toBe('40.00');
    expect(line(partial.id).varianceFlag).toBe(true);
    expect(line(cash.id).collectedAmount).toBeNull();
    expect(line(cash.id).varianceFlag).toBe(false);
    expect(r.consignors[0].hasVariance).toBe(true);
    expect(r.consignors[0].net.toFixed(2)).toBe('60.00'); // 50% of 120 list total, variance does not change it
  });

  it('respects saleId scope (a sale, or consignment inventory with a null saleId) and asOf', async () => {
    const c = fake.seedConsignor(ws.workspaceId);
    const inSale = fake.seedItem(c.id, { price: 10, saleId: sale.id, updatedAt: new Date('2026-03-01') });
    const inventory = fake.seedItem(c.id, { price: 10, saleId: null, updatedAt: new Date('2026-04-01') });

    const saleOnly = await ledger.loadUnsettled(db, { workspaceId: ws.workspaceId, saleId: sale.id });
    expect(saleOnly.consignors[0].lines.map((l) => l.itemId)).toEqual([inSale.id]);

    const inventoryOnly = await ledger.loadUnsettled(db, { workspaceId: ws.workspaceId, saleId: null });
    expect(inventoryOnly.consignors[0].lines.map((l) => l.itemId)).toEqual([inventory.id]);

    const all = await ledger.loadUnsettled(db, { workspaceId: ws.workspaceId });
    expect(all.consignors[0].lines).toHaveLength(2);

    const early = await ledger.loadUnsettled(db, { workspaceId: ws.workspaceId, asOf: new Date('2026-03-15') });
    expect(early.consignors[0].lines.map((l) => l.itemId)).toEqual([inSale.id]);
  });

  it('never returns another workspace\'s consignors', async () => {
    const other = fake.seedWorkspace({ userId: 'user_2' });
    const theirs = fake.seedConsignor(other.workspaceId, { name: 'Theirs' });
    fake.seedItem(theirs.id, { price: 99 });
    const r = await ledger.loadUnsettled(db, { workspaceId: ws.workspaceId });
    expect(r.consignors).toHaveLength(0);
  });

  it('holds back items that pre-date a legacy payout (no lines) until acknowledged', async () => {
    const c = fake.seedConsignor(ws.workspaceId);
    const old = fake.seedItem(c.id, { price: 20, saleId: sale.id, updatedAt: new Date('2026-05-01') });
    const fresh = fake.seedItem(c.id, { price: 20, saleId: sale.id, updatedAt: new Date('2026-07-01') });
    fake.store.consignorPayout.push({ id: 'payout_legacy', consignorId: c.id, saleId: sale.id, status: 'PENDING', netPayout: D(10), createdAt: new Date('2026-06-01') });

    let r = await ledger.loadUnsettled(db, { workspaceId: ws.workspaceId });
    expect(r.consignors[0].lines.map((l) => l.itemId)).toEqual([fresh.id]);
    expect(r.excluded).toEqual([expect.objectContaining({ itemId: old.id, reason: 'LEGACY_PAYOUT_OVERLAP' })]);
    expect(r.consignors[0].legacyPayouts).toHaveLength(1);

    r = await ledger.loadUnsettled(db, { workspaceId: ws.workspaceId, acknowledgeLegacyOverlap: true });
    expect(r.consignors[0].lines).toHaveLength(2);
    expect(r.excluded).toHaveLength(0);
  });

  it('ignores legacy SIMULATED and VOID payouts for the overlap check', async () => {
    const c = fake.seedConsignor(ws.workspaceId);
    fake.seedItem(c.id, { price: 20, saleId: sale.id, updatedAt: new Date('2026-05-01') });
    fake.store.consignorPayout.push({ id: 'payout_sim', consignorId: c.id, saleId: sale.id, status: 'SIMULATED', netPayout: D(10), createdAt: new Date('2026-06-01') });
    const r = await ledger.loadUnsettled(db, { workspaceId: ws.workspaceId });
    expect(r.consignors[0].lines).toHaveLength(1);
    expect(r.excluded).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('createSettlementRun', () => {
  it('creates a DRAFT batch, one PENDING payout per consignor, one active line per item, and audit events, with no money moved', async () => {
    const { batch } = await makeRun({ consignors: 2 });
    expect(batch.status).toBe('DRAFT');
    expect(batch.payoutMode).toBe('ORGANIZER_SETTLES');
    expect(batch.runNumber).toBe(1);
    expect(batch.saleId).toBe(sale.id);
    expect(batch.snapshotAt).toBeTruthy();
    const payouts = payoutsOf(batch.id);
    expect(payouts).toHaveLength(2);
    for (const p of payouts) {
      expect(p).toMatchObject({ status: 'PENDING', processor: 'MANUAL', saleId: sale.id });
      expect(p.method ?? null).toBeNull();
      expect(p.paidAt ?? null).toBeNull();
      expect(ledger.money(p.netPayout)).toBe('25.00'); // 50% of 20 + 30
      expect(eventsOf(p.id, 'BATCH_CREATED')).toHaveLength(1);
    }
    const lines = fake.store.consignorPayoutItem;
    expect(lines).toHaveLength(4);
    expect(lines.every((l: any) => l.activeItemKey === l.itemId)).toBe(true);
    expect(ledger.money(batch.totalGross)).toBe('100.00');
    expect(ledger.money(batch.totalConsignorPayouts)).toBe('50.00');
  });

  it('a second run for the same sale only picks up items that are still unsettled, and gets runNumber 2', async () => {
    const first = await makeRun();
    const c = fake.store.consignor[0];
    fake.seedItem(c.id, { price: 10, title: 'Sold later', saleId: sale.id });
    const second = await ledger.createSettlementRun(db, { workspaceId: ws.workspaceId, actorUserId: ws.userId, saleId: sale.id });
    expect(second.batch.runNumber).toBe(2);
    expect(second.batch.id).not.toBe(first.batch.id);
    expect(fake.store.consignorPayoutItem.filter((l: any) => l.payoutId === payoutsOf(second.batch.id)[0].id)).toHaveLength(1);
  });

  it('a run with nothing unsettled is a 400 NOTHING_TO_SETTLE that lists what was excluded', async () => {
    const c = fake.seedConsignor(ws.workspaceId);
    const item = fake.seedItem(c.id, { price: 20 });
    fake.seedPurchase(item.id, { status: 'REFUNDED' });
    await expect(ledger.createSettlementRun(db, { workspaceId: ws.workspaceId, actorUserId: ws.userId })).rejects.toMatchObject({
      status: 400,
      code: 'NOTHING_TO_SETTLE',
      extra: { excluded: [expect.objectContaining({ itemId: item.id, reason: 'REFUNDED' })] },
    });
    expect(fake.store.consignorSettlementBatch).toHaveLength(0);
  });

  it('can settle consignment inventory with no sale (null saleId) and across sales', async () => {
    const c = fake.seedConsignor(ws.workspaceId);
    fake.seedItem(c.id, { price: 10, saleId: null });
    fake.seedItem(c.id, { price: 10, saleId: sale.id });
    const { batch } = await ledger.createSettlementRun(db, { workspaceId: ws.workspaceId, actorUserId: ws.userId });
    expect(batch.saleId ?? null).toBeNull();
    expect(payoutsOf(batch.id)[0].saleId ?? null).toBeNull();
    expect(fake.store.consignorPayoutItem).toHaveLength(2);
  });

  it('limits a run to the chosen consignorIds and remembers the scope', async () => {
    const a = fake.seedConsignor(ws.workspaceId, { name: 'A' });
    const b = fake.seedConsignor(ws.workspaceId, { name: 'B' });
    fake.seedItem(a.id, { price: 10 });
    fake.seedItem(b.id, { price: 10 });
    const { batch } = await ledger.createSettlementRun(db, { workspaceId: ws.workspaceId, actorUserId: ws.userId, consignorIds: [a.id] });
    expect(payoutsOf(batch.id).map((p: any) => p.consignorId)).toEqual([a.id]);
    expect(fake.store.consignorSettlementBatch[0].scopeConsignorIds).toEqual([a.id]);
  });

  it('two concurrent create-run calls cannot both claim the same items: one wins, the other gets 409 with the existing batch id', async () => {
    const c = fake.seedConsignor(ws.workspaceId);
    fake.seedItem(c.id, { price: 20, saleId: sale.id });
    fake.seedItem(c.id, { price: 30, saleId: sale.id });
    const params = { workspaceId: ws.workspaceId, actorUserId: ws.userId, saleId: sale.id };
    const results = await Promise.allSettled([ledger.createSettlementRun(db, params), ledger.createSettlementRun(db, params)]);
    const ok = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
    const bad = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(bad).toHaveLength(1);
    expect(bad[0].reason).toBeInstanceOf(ledger.LedgerError);
    expect(bad[0].reason).toMatchObject({ status: 409, code: 'ALREADY_SETTLED', extra: { batchId: ok[0].value.batch.id } });
    expect(fake.store.consignorSettlementBatch).toHaveLength(1); // the loser's batch rolled back
    expect(fake.store.consignorPayoutItem).toHaveLength(2); // each item exactly once
  });

  it('the unique activeItemKey rejects a second live line for the same item even if the service is bypassed', async () => {
    const c = fake.seedConsignor(ws.workspaceId);
    const item = fake.seedItem(c.id, { price: 20 });
    await db.consignorPayoutItem.create({ data: { payoutId: 'p1', itemId: item.id, activeItemKey: item.id } });
    await expect(db.consignorPayoutItem.create({ data: { payoutId: 'p2', itemId: item.id, activeItemKey: item.id } })).rejects.toMatchObject({ code: 'P2002' });
    // a voided line (null key) does not collide
    await expect(db.consignorPayoutItem.create({ data: { payoutId: 'p3', itemId: item.id, activeItemKey: null } })).resolves.toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('refreshDraftRun', () => {
  it('returns a diff of added, removed and changed lines and re-totals the payout', async () => {
    const { batch, consignors } = await makeRun({ items: [{ price: 20, title: 'A' }, { price: 30, title: 'B' }] });
    const c = consignors[0];
    const itemA = fake.store.item.find((i: any) => i.title === 'A');
    const itemB = fake.store.item.find((i: any) => i.title === 'B');
    itemA.price = 25; // price changed after the snapshot
    fake.seedPurchase(itemB.id, { status: 'REFUNDED' }); // refunded after the snapshot
    const itemC = fake.seedItem(c.id, { price: 10, title: 'C', saleId: sale.id }); // sold after the snapshot

    const { batch: after, diff } = await ledger.refreshDraftRun(db, { workspaceId: ws.workspaceId, batchId: batch.id, actorUserId: ws.userId });

    expect(diff.added.map((a: any) => a.itemId)).toEqual([itemC.id]);
    expect(diff.removed).toEqual([expect.objectContaining({ itemId: itemB.id, reason: 'REFUNDED' })]);
    expect(diff.changed).toEqual([expect.objectContaining({ itemId: itemA.id, before: expect.objectContaining({ listPrice: '20.00' }), after: expect.objectContaining({ listPrice: '25.00' }) })]);
    expect(diff.excluded.map((e: any) => e.itemId)).toContain(itemB.id);

    const payout = payoutsOf(batch.id)[0];
    expect(ledger.money(payout.netPayout)).toBe('17.50'); // 50% of (25 + 10)
    expect(ledger.money(after.totalConsignorPayouts)).toBe('17.50');
    const keys = fake.store.consignorPayoutItem.map((l: any) => l.activeItemKey).sort();
    expect(keys).toEqual([itemA.id, itemC.id].sort());
    expect(eventsOf(payout.id, 'REFRESHED')).toHaveLength(1);
  });

  it('is a no-change refresh when nothing moved', async () => {
    const { batch } = await makeRun();
    const { diff } = await ledger.refreshDraftRun(db, { workspaceId: ws.workspaceId, batchId: batch.id, actorUserId: ws.userId });
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.changed).toHaveLength(0);
    expect(diff.unchanged).toBe(2);
  });

  it('voids a payout whose consignor has nothing left after the refresh and frees nothing that is still owed', async () => {
    const { batch } = await makeRun({ items: [{ price: 20 }] });
    const item = fake.store.item[0];
    fake.seedPurchase(item.id, { status: 'DISPUTE_LOST' });
    const { batch: after } = await ledger.refreshDraftRun(db, { workspaceId: ws.workspaceId, batchId: batch.id, actorUserId: ws.userId });
    expect(payoutsOf(batch.id)[0].status).toBe('VOID');
    expect(fake.store.consignorPayoutItem).toHaveLength(0);
    expect(ledger.money(after.totalConsignorPayouts)).toBe('0.00');
    expect(eventsOf(payoutsOf(batch.id)[0].id, 'VOIDED')).toHaveLength(1);
  });

  it('is blocked once the run is approved (409 NOT_DRAFT)', async () => {
    const { batch } = await makeApprovedRun();
    await expect(ledger.refreshDraftRun(db, { workspaceId: ws.workspaceId, batchId: batch.id, actorUserId: ws.userId })).rejects.toMatchObject({ status: 409, code: 'NOT_DRAFT' });
  });

  it('keeps an explicitly acknowledged legacy-overlap item through a refresh', async () => {
    const c = fake.seedConsignor(ws.workspaceId);
    fake.seedItem(c.id, { price: 20, saleId: sale.id, updatedAt: new Date('2026-05-01') });
    fake.store.consignorPayout.push({ id: 'payout_legacy', consignorId: c.id, saleId: sale.id, status: 'PENDING', netPayout: D(10), createdAt: new Date('2026-06-01') });
    const { batch } = await ledger.createSettlementRun(db, { workspaceId: ws.workspaceId, actorUserId: ws.userId, saleId: sale.id, acknowledgeLegacyOverlap: true });
    const { diff } = await ledger.refreshDraftRun(db, { workspaceId: ws.workspaceId, batchId: batch.id, actorUserId: ws.userId });
    expect(diff.removed).toHaveLength(0);
    expect(diff.unchanged).toBe(1);
  });

  it('cross-workspace batch id is a 404', async () => {
    const { batch } = await makeRun();
    const other = fake.seedWorkspace({ userId: 'user_2' });
    await expect(ledger.refreshDraftRun(db, { workspaceId: other.workspaceId, batchId: batch.id, actorUserId: 'user_2' })).rejects.toMatchObject({ status: 404 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('approveRun', () => {
  it('moves DRAFT to APPROVED, records who and when, and leaves every payout PENDING', async () => {
    const { batch } = await makeRun({ consignors: 2 });
    const r = await ledger.approveRun(db, { workspaceId: ws.workspaceId, batchId: batch.id, actorUserId: ws.userId });
    expect(r.noop).toBe(false);
    const row = fake.store.consignorSettlementBatch[0];
    expect(row).toMatchObject({ status: 'APPROVED', approvedByUserId: ws.userId });
    expect(row.approvedAt).toBeInstanceOf(Date);
    for (const p of payoutsOf(batch.id)) {
      expect(p.status).toBe('PENDING'); // approval is a checkpoint, not a payment
      expect(p.paidAt ?? null).toBeNull();
      expect(eventsOf(p.id, 'APPROVED')).toHaveLength(1);
    }
  });

  it('is idempotent: approving again is a no-op and writes no new events', async () => {
    const { batch } = await makeApprovedRun();
    const before = fake.store.consignorPayoutEvent.length;
    const again = await ledger.approveRun(db, { workspaceId: ws.workspaceId, batchId: batch.id, actorUserId: ws.userId });
    expect(again.noop).toBe(true);
    expect(fake.store.consignorPayoutEvent.length).toBe(before);
  });

  it('cannot approve a cancelled run', async () => {
    const { batch } = await makeRun();
    await ledger.cancelRun(db, { workspaceId: ws.workspaceId, batchId: batch.id, actorUserId: ws.userId, reason: 'Wrong sale' });
    await expect(ledger.approveRun(db, { workspaceId: ws.workspaceId, batchId: batch.id, actorUserId: ws.userId })).rejects.toMatchObject({ status: 409, code: 'INVALID_STATE' });
  });

  it('cross-workspace batch id is a 404', async () => {
    const { batch } = await makeRun();
    const other = fake.seedWorkspace({ userId: 'user_2' });
    await expect(ledger.approveRun(db, { workspaceId: other.workspaceId, batchId: batch.id, actorUserId: 'user_2' })).rejects.toMatchObject({ status: 404 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('cancelRun', () => {
  it('cancels a draft: payouts void, every line activeItemKey clears, and the items are unsettled again', async () => {
    const { batch } = await makeRun();
    const r = await ledger.cancelRun(db, { workspaceId: ws.workspaceId, batchId: batch.id, actorUserId: ws.userId, reason: 'Started too early' });
    expect(r.noop).toBe(false);
    expect(fake.store.consignorSettlementBatch[0]).toMatchObject({ status: 'CANCELLED', cancelledReason: 'Started too early', cancelledByUserId: ws.userId });
    const p = payoutsOf(batch.id)[0];
    expect(p).toMatchObject({ status: 'VOID', voidReason: 'Started too early' });
    expect(fake.store.consignorPayoutItem.every((l: any) => l.activeItemKey === null)).toBe(true);
    expect(fake.store.consignorPayoutItem).toHaveLength(2); // history kept
    expect(eventsOf(p.id, 'CANCELLED')).toHaveLength(1);

    const unsettled = await ledger.loadUnsettled(db, { workspaceId: ws.workspaceId });
    expect(unsettled.consignors[0].lines).toHaveLength(2);
    const second = await ledger.createSettlementRun(db, { workspaceId: ws.workspaceId, actorUserId: ws.userId, saleId: sale.id });
    expect(second.batch.runNumber).toBe(2);
  });

  it('is idempotent', async () => {
    const { batch } = await makeRun();
    await ledger.cancelRun(db, { workspaceId: ws.workspaceId, batchId: batch.id, actorUserId: ws.userId, reason: 'x' });
    const again = await ledger.cancelRun(db, { workspaceId: ws.workspaceId, batchId: batch.id, actorUserId: ws.userId, reason: 'x' });
    expect(again.noop).toBe(true);
  });

  it('is blocked when any payout is PAID (status PARTIALLY_PAID)', async () => {
    const { batch } = await makeApprovedRun({ consignors: 2 });
    const first = payoutsOf(batch.id)[0];
    await ledger.markPayoutPaid(db, { workspaceId: ws.workspaceId, payoutId: first.id, actorUserId: ws.userId, input: ledger.validateMarkPaidInput({ method: 'CASH', paidAt: paidAtIso() }) });
    await expect(ledger.cancelRun(db, { workspaceId: ws.workspaceId, batchId: batch.id, actorUserId: ws.userId, reason: 'Oops' })).rejects.toMatchObject({ status: 409, code: 'HAS_PAID_PAYOUTS' });
    expect(fake.store.consignorPayoutItem.every((l: any) => l.activeItemKey !== null)).toBe(true);
  });

  it('rolls everything back if a payment lands between the state check and the void (paid row inside an APPROVED batch)', async () => {
    const { batch } = await makeApprovedRun({ consignors: 2 });
    payoutsOf(batch.id)[0].status = 'PAID'; // simulates a mark-paid that committed while batch status still read APPROVED
    await expect(ledger.cancelRun(db, { workspaceId: ws.workspaceId, batchId: batch.id, actorUserId: ws.userId, reason: 'Race' })).rejects.toMatchObject({ code: 'HAS_PAID_PAYOUTS' });
    expect(fake.store.consignorSettlementBatch[0].status).toBe('APPROVED'); // CANCELLED update was rolled back
    expect(payoutsOf(batch.id)[1].status).toBe('PENDING');
    expect(fake.store.consignorPayoutItem.every((l: any) => l.activeItemKey !== null)).toBe(true);
  });

  it('cross-workspace batch id is a 404', async () => {
    const { batch } = await makeRun();
    const other = fake.seedWorkspace({ userId: 'user_2' });
    await expect(ledger.cancelRun(db, { workspaceId: other.workspaceId, batchId: batch.id, actorUserId: 'user_2', reason: 'x' })).rejects.toMatchObject({ status: 404 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('validateMarkPaidInput', () => {
  const now = new Date('2026-09-29T12:00:00Z');
  const code = (fn: () => unknown) => {
    try {
      fn();
    } catch (e: any) {
      return e.code;
    }
    return null;
  };

  it('accepts a minimal valid body and defaults paidAt to now', () => {
    const r = ledger.validateMarkPaidInput({ method: 'cash' }, now);
    expect(r).toEqual({ method: 'CASH', paidAt: now, reference: null, note: null, notifyConsignor: false });
  });

  it('accepts every documented method and rejects anything else, including legacy VENMO and ACH', () => {
    for (const m of ['CASH', 'CHECK', 'SQUARE', 'BANK_TRANSFER', 'OTHER']) {
      expect(ledger.validateMarkPaidInput({ method: m }, now).method).toBe(m);
    }
    for (const bad of ['VENMO', 'ACH', 'STRIPE', 'PAYPAL', '', undefined, null, 5]) {
      expect(code(() => ledger.validateMarkPaidInput({ method: bad }, now))).toBe('INVALID_METHOD');
    }
    expect(code(() => ledger.validateMarkPaidInput(undefined, now))).toBe('INVALID_METHOD');
  });

  it('notifyConsignor is true only for the boolean true', () => {
    expect(ledger.validateMarkPaidInput({ method: 'CASH', notifyConsignor: true }, now).notifyConsignor).toBe(true);
    for (const v of ['true', 1, 'yes', null, undefined, false]) {
      expect(ledger.validateMarkPaidInput({ method: 'CASH', notifyConsignor: v }, now).notifyConsignor).toBe(false);
    }
  });

  it('paidAt: valid past date kept, up to one day ahead allowed, more than a day ahead rejected', () => {
    const past = ledger.validateMarkPaidInput({ method: 'CASH', paidAt: '2026-09-01T00:00:00Z' }, now);
    expect(past.paidAt.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    const soon = new Date(now.getTime() + 23 * 3600 * 1000).toISOString();
    expect(ledger.validateMarkPaidInput({ method: 'CASH', paidAt: soon }, now).paidAt.toISOString()).toBe(soon);
    const far = new Date(now.getTime() + 25 * 3600 * 1000).toISOString();
    expect(code(() => ledger.validateMarkPaidInput({ method: 'CASH', paidAt: far }, now))).toBe('PAID_AT_IN_FUTURE');
  });

  it('paidAt: garbage, non-string and pre-2000 values are rejected', () => {
    expect(code(() => ledger.validateMarkPaidInput({ method: 'CASH', paidAt: 'not a date' }, now))).toBe('INVALID_PAID_AT');
    expect(code(() => ledger.validateMarkPaidInput({ method: 'CASH', paidAt: 12345 }, now))).toBe('INVALID_PAID_AT');
    expect(code(() => ledger.validateMarkPaidInput({ method: 'CASH', paidAt: '1985-01-01T00:00:00Z' }, now))).toBe('INVALID_PAID_AT');
    // empty string and null mean "not provided"
    expect(ledger.validateMarkPaidInput({ method: 'CASH', paidAt: '' }, now).paidAt).toEqual(now);
    expect(ledger.validateMarkPaidInput({ method: 'CASH', paidAt: null }, now).paidAt).toEqual(now);
  });

  it('reference: trimmed, blank becomes null, 120 chars ok, 121 rejected, non-string rejected', () => {
    expect(ledger.validateMarkPaidInput({ method: 'CHECK', reference: '  1042  ' }, now).reference).toBe('1042');
    expect(ledger.validateMarkPaidInput({ method: 'CHECK', reference: '   ' }, now).reference).toBeNull();
    expect(ledger.validateMarkPaidInput({ method: 'CHECK', reference: 'a'.repeat(120) }, now).reference).toHaveLength(120);
    expect(code(() => ledger.validateMarkPaidInput({ method: 'CHECK', reference: 'a'.repeat(121) }, now))).toBe('REFERENCE_TOO_LONG');
    expect(code(() => ledger.validateMarkPaidInput({ method: 'CHECK', reference: 1042 }, now))).toBe('INVALID_REFERENCE');
  });

  it('reference: 9 or more digits (account, routing or card style numbers) is refused, short codes are fine', () => {
    for (const bad of ['123456789', '1234 5678 9012 3456', '021-000-021', 'acct 000123456789']) {
      expect(code(() => ledger.validateMarkPaidInput({ method: 'BANK_TRANSFER', reference: bad }, now))).toBe('REFERENCE_LOOKS_SENSITIVE');
    }
    for (const ok of ['12345678', 'CHK-1042', 'sq_conf_A1B2C3', '2026-09-29']) {
      expect(ledger.validateMarkPaidInput({ method: 'CHECK', reference: ok }, now).reference).toBe(ok);
    }
  });

  it('note: 1000 chars ok, 1001 rejected, non-string rejected, blank becomes null', () => {
    expect(ledger.validateMarkPaidInput({ method: 'CASH', note: 'n'.repeat(1000) }, now).note).toHaveLength(1000);
    expect(code(() => ledger.validateMarkPaidInput({ method: 'CASH', note: 'n'.repeat(1001) }, now))).toBe('NOTE_TOO_LONG');
    expect(code(() => ledger.validateMarkPaidInput({ method: 'CASH', note: {} }, now))).toBe('INVALID_NOTE');
    expect(ledger.validateMarkPaidInput({ method: 'CASH', note: '  ' }, now).note).toBeNull();
  });
});

describe('normalizeLegacyMethodInput and requireReason', () => {
  it('maps VENMO to OTHER with a note suffix, ACH to BANK_TRANSFER, passes ledger values, rejects the rest', () => {
    expect(ledger.normalizeLegacyMethodInput('venmo')).toEqual({ method: 'OTHER', noteSuffix: 'Paid via Venmo' });
    expect(ledger.normalizeLegacyMethodInput('ACH')).toEqual({ method: 'BANK_TRANSFER', noteSuffix: null });
    expect(ledger.normalizeLegacyMethodInput('check')).toEqual({ method: 'CHECK', noteSuffix: null });
    expect(catchErr(() => ledger.normalizeLegacyMethodInput('bitcoin'))).toMatchObject({ status: 400, code: 'INVALID_METHOD' });
    expect(catchErr(() => ledger.normalizeLegacyMethodInput(undefined))).toMatchObject({ code: 'INVALID_METHOD' });
  });

  it('requireReason trims, requires text and caps at 500 characters', () => {
    expect(ledger.requireReason('  wrong amount ')).toBe('wrong amount');
    expect(catchErr(() => ledger.requireReason(''))).toMatchObject({ code: 'REASON_REQUIRED' });
    expect(catchErr(() => ledger.requireReason('   '))).toMatchObject({ code: 'REASON_REQUIRED' });
    expect(catchErr(() => ledger.requireReason(undefined))).toMatchObject({ code: 'REASON_REQUIRED' });
    expect(ledger.requireReason('r'.repeat(500))).toHaveLength(500);
    expect(catchErr(() => ledger.requireReason('r'.repeat(501)))).toMatchObject({ code: 'REASON_TOO_LONG' });
  });
});

describe('legacy status normalization', () => {
  it('payout statuses: ledger values pass through, legacy values map on read', () => {
    expect(ledger.normalizePayoutStatus('PENDING')).toEqual({ status: 'PENDING', legacy: false });
    expect(ledger.normalizePayoutStatus('ON_HOLD')).toEqual({ status: 'ON_HOLD', legacy: false });
    expect(ledger.normalizePayoutStatus('PAID')).toEqual({ status: 'PAID', legacy: false });
    expect(ledger.normalizePayoutStatus('VOID')).toEqual({ status: 'VOID', legacy: false });
    expect(ledger.normalizePayoutStatus('MANUAL_CASH_CHECK')).toEqual({ status: 'PENDING', legacy: true });
    expect(ledger.normalizePayoutStatus('COMPLETED')).toEqual({ status: 'PAID', legacy: true });
    expect(ledger.normalizePayoutStatus('SIMULATED')).toEqual({ status: 'VOID', legacy: true });
    for (const s of ['PROCESSING', 'FAILED', 'PARTIAL', 'WHATEVER', null, undefined]) {
      expect(ledger.normalizePayoutStatus(s as any)).toEqual({ status: 'LEGACY', legacy: true });
    }
  });

  it('batch statuses: COMPLETED with every payout SIMULATED is a TEST_RUN, other COMPLETED is PAID', () => {
    expect(ledger.normalizeBatchStatus('COMPLETED', ['SIMULATED', 'SIMULATED'])).toEqual({ status: 'TEST_RUN', legacy: true });
    expect(ledger.normalizeBatchStatus('COMPLETED', ['SIMULATED', 'COMPLETED'])).toEqual({ status: 'PAID', legacy: true });
    expect(ledger.normalizeBatchStatus('COMPLETED', [])).toEqual({ status: 'PAID', legacy: true });
    expect(ledger.normalizeBatchStatus('DRAFT')).toEqual({ status: 'DRAFT', legacy: false });
    expect(ledger.normalizeBatchStatus('PARTIALLY_PAID')).toEqual({ status: 'PARTIALLY_PAID', legacy: false });
    for (const s of ['PARTIAL', 'PROCESSING', 'FAILED']) expect(ledger.normalizeBatchStatus(s)).toEqual({ status: 'LEGACY', legacy: true });
  });

  it('a stored legacy payout without lines serializes as legacy and never as owed', () => {
    const s = ledger.serializePayout({ id: 'p1', consignorId: 'c1', status: 'MANUAL_CASH_CHECK', netPayout: D(10), items: [] });
    expect(s.status).toBe('PENDING');
    expect(s.legacy).toBe(true);
    expect(s.rawStatus).toBe('MANUAL_CASH_CHECK');
    expect(s.netPayout).toBe('10.00');
  });

  it('a legacy SIMULATED payout in a batch shows as VOID and the batch as TEST_RUN', () => {
    const b = ledger.serializeBatch({
      id: 'b1',
      status: 'COMPLETED',
      payouts: [{ id: 'p1', consignorId: 'c1', status: 'SIMULATED', netPayout: D(5), items: [], consignor: { name: 'A' } }],
    });
    expect(b.status).toBe('TEST_RUN');
    expect(b.payouts[0].status).toBe('VOID');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('markPayoutPaid', () => {
  const input = (over: any = {}) => ledger.validateMarkPaidInput({ method: 'CASH', paidAt: paidAtIso(), ...over });
  const mark = (payoutId: string, over: any = {}, extra: any = {}) =>
    ledger.markPayoutPaid(db, { workspaceId: ws.workspaceId, payoutId, actorUserId: ws.userId, input: input(over), ...extra });
  const batchOf = (id: string) => fake.store.consignorSettlementBatch.find((b: any) => b.id === id);

  it('is blocked while the run is a DRAFT', async () => {
    const { batch } = await makeRun();
    await expect(mark(payoutsOf(batch.id)[0].id)).rejects.toMatchObject({ status: 409, code: 'BATCH_NOT_APPROVED' });
    expect(payoutsOf(batch.id)[0].status).toBe('PENDING');
  });

  it('records the payment in full with actor, method, reference, processor MANUAL and an audit event', async () => {
    const { batch } = await makeApprovedRun();
    const p = payoutsOf(batch.id)[0];
    const paidAt = paidAtIso();
    const r = await mark(p.id, { method: 'CHECK', reference: '1042', paidAt, note: 'Left at front desk' });
    expect(r.noop).toBe(false);
    const row = fake.store.consignorPayout.find((x: any) => x.id === p.id);
    expect(row).toMatchObject({ status: 'PAID', method: 'CHECK', paidReference: '1042', paidRecordedByUserId: ws.userId, processor: 'MANUAL', holdReason: null });
    expect(row.paidAt.toISOString()).toBe(paidAt);
    expect(row.paidAmount.toFixed(2)).toBe('25.00'); // recorded in full, equals netPayout
    expect(row.notes).toContain('Left at front desk');
    const ev = eventsOf(p.id, 'MARKED_PAID');
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ actorUserId: ws.userId, fromStatus: 'PENDING', toStatus: 'PAID', method: 'CHECK', reference: '1042', workspaceId: ws.workspaceId });
    expect(D(ev[0].amount).toFixed(2)).toBe('25.00');
  });

  it('never touches money rails: no processor other than MANUAL is written', async () => {
    const { batch } = await makeApprovedRun();
    await mark(payoutsOf(batch.id)[0].id);
    expect(fake.store.consignorPayout.every((x: any) => x.processor === undefined || x.processor === 'MANUAL')).toBe(true);
  });

  it('batch status follows its payouts: APPROVED to PARTIALLY_PAID to PAID', async () => {
    const { batch } = await makeApprovedRun({ consignors: 2 });
    const [a, b] = payoutsOf(batch.id);
    expect(batchOf(batch.id).status).toBe('APPROVED');
    await mark(a.id);
    expect(batchOf(batch.id).status).toBe('PARTIALLY_PAID');
    await mark(b.id);
    expect(batchOf(batch.id).status).toBe('PAID');
  });

  it('is idempotent: the same body twice returns noop and writes one event', async () => {
    const { batch } = await makeApprovedRun();
    const p = payoutsOf(batch.id)[0];
    const body = { method: 'CASH', paidAt: paidAtIso(), reference: 'A1' };
    const first = await mark(p.id, body);
    const second = await mark(p.id, body);
    expect(first.noop).toBe(false);
    expect(second.noop).toBe(true);
    expect(eventsOf(p.id, 'MARKED_PAID')).toHaveLength(1);
  });

  it('a retry with a different body is a 409 ALREADY_PAID and changes nothing', async () => {
    const { batch } = await makeApprovedRun();
    const p = payoutsOf(batch.id)[0];
    await mark(p.id, { method: 'CASH', paidAt: paidAtIso() });
    await expect(mark(p.id, { method: 'CHECK', paidAt: paidAtIso(), reference: '77' })).rejects.toMatchObject({ status: 409, code: 'ALREADY_PAID' });
    expect(fake.store.consignorPayout.find((x: any) => x.id === p.id).method).toBe('CASH');
    expect(eventsOf(p.id, 'MARKED_PAID')).toHaveLength(1);
  });

  it('two concurrent identical calls record the payment exactly once', async () => {
    const { batch } = await makeApprovedRun();
    const p = payoutsOf(batch.id)[0];
    const body = { method: 'SQUARE', paidAt: paidAtIso(), reference: 'SQ1' };
    const results = await Promise.all([mark(p.id, body), mark(p.id, body)]);
    expect(results.filter((r) => !r.noop)).toHaveLength(1);
    expect(eventsOf(p.id, 'MARKED_PAID')).toHaveLength(1);
    expect(fake.store.consignorPayout.find((x: any) => x.id === p.id).status).toBe('PAID');
  });

  it('two concurrent calls with different bodies: one wins, the other gets a 409, one event', async () => {
    const { batch } = await makeApprovedRun();
    const p = payoutsOf(batch.id)[0];
    const settled = await Promise.allSettled([
      mark(p.id, { method: 'CASH', paidAt: paidAtIso() }),
      mark(p.id, { method: 'CHECK', paidAt: paidAtIso(), reference: '5' }),
    ]);
    expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(1);
    const rejected = settled.find((s) => s.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ status: 409 });
    expect(eventsOf(p.id, 'MARKED_PAID')).toHaveLength(1);
  });

  it('rejects a partial or wrong amount, accepts the exact total (number or string)', async () => {
    const { batch } = await makeApprovedRun();
    const p = payoutsOf(batch.id)[0];
    await expect(mark(p.id, {}, { amount: 10 })).rejects.toMatchObject({ status: 400, code: 'AMOUNT_MISMATCH' });
    await expect(mark(p.id, {}, { amount: 'abc' })).rejects.toMatchObject({ code: 'AMOUNT_MISMATCH' });
    await expect(mark(p.id, {}, { amount: 25.01 })).rejects.toMatchObject({ code: 'AMOUNT_MISMATCH' });
    expect(fake.store.consignorPayout.find((x: any) => x.id === p.id).status).toBe('PENDING');
    const ok = await mark(p.id, {}, { amount: '25.00' });
    expect(ok.noop).toBe(false);
  });

  it('an ON_HOLD payout can be paid and the hold reason is cleared', async () => {
    const { batch } = await makeApprovedRun();
    const p = payoutsOf(batch.id)[0];
    await ledger.holdPayout(db, { workspaceId: ws.workspaceId, payoutId: p.id, actorUserId: ws.userId, reason: 'Waiting on W-9' });
    const r = await mark(p.id);
    expect(r.noop).toBe(false);
    const row = fake.store.consignorPayout.find((x: any) => x.id === p.id);
    expect(row.status).toBe('PAID');
    expect(row.holdReason).toBeNull();
    expect(eventsOf(p.id, 'MARKED_PAID')[0].fromStatus).toBe('ON_HOLD');
  });

  it('a VOID payout cannot be paid', async () => {
    const { batch } = await makeApprovedRun({ consignors: 2 });
    const p = payoutsOf(batch.id)[0];
    await ledger.voidPayout(db, { workspaceId: ws.workspaceId, payoutId: p.id, actorUserId: ws.userId, reason: 'Wrong consignor' });
    await expect(mark(p.id)).rejects.toMatchObject({ status: 409, code: 'INVALID_STATE' });
  });

  it('a cancelled run cannot take payments', async () => {
    const { batch } = await makeApprovedRun();
    const p = payoutsOf(batch.id)[0];
    await ledger.cancelRun(db, { workspaceId: ws.workspaceId, batchId: batch.id, actorUserId: ws.userId, reason: 'Redo' });
    await expect(mark(p.id)).rejects.toMatchObject({ status: 409 });
    expect(fake.store.consignorPayout.find((x: any) => x.id === p.id).status).toBe('VOID');
  });

  it('cross-workspace payout id is a 404 and nothing is written', async () => {
    const { batch } = await makeApprovedRun();
    const p = payoutsOf(batch.id)[0];
    const other = fake.seedWorkspace({ userId: 'user_2' });
    await expect(ledger.markPayoutPaid(db, { workspaceId: other.workspaceId, payoutId: p.id, actorUserId: 'user_2', input: input() })).rejects.toMatchObject({ status: 404 });
    expect(fake.store.consignorPayout.find((x: any) => x.id === p.id).status).toBe('PENDING');
    expect(eventsOf(p.id, 'MARKED_PAID')).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('undoPayoutPaid', () => {
  const paid = async (consignors = 1) => {
    const { batch } = await makeApprovedRun({ consignors });
    const p = payoutsOf(batch.id)[0];
    await ledger.markPayoutPaid(db, {
      workspaceId: ws.workspaceId,
      payoutId: p.id,
      actorUserId: ws.userId,
      input: ledger.validateMarkPaidInput({ method: 'CHECK', paidAt: paidAtIso(), reference: '901' }),
    });
    return { batch, p };
  };
  const undo = (id: string, reason: any = 'Check bounced') => ledger.undoPayoutPaid(db, { workspaceId: ws.workspaceId, payoutId: id, actorUserId: ws.userId, reason });

  it('returns the payout to PENDING, clears the payment fields and keeps the original in the audit trail', async () => {
    const { batch, p } = await paid();
    const r = await undo(p.id, 'Check bounced');
    expect(r.noop).toBe(false);
    const row = fake.store.consignorPayout.find((x: any) => x.id === p.id);
    expect(row).toMatchObject({ status: 'PENDING', method: null, paidAt: null, paidAmount: null, paidReference: null, paidRecordedAt: null });
    const ev = eventsOf(p.id, 'UNMARKED_PAID');
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ note: 'Check bounced', fromStatus: 'PAID', toStatus: 'PENDING', method: 'CHECK', reference: '901', actorUserId: ws.userId });
    expect(eventsOf(p.id, 'MARKED_PAID')).toHaveLength(1); // original record is never deleted
    expect(fake.store.consignorSettlementBatch.find((b: any) => b.id === batch.id).status).toBe('APPROVED');
  });

  it('the lines stay active, so the items do not become unsettled again', async () => {
    const { p } = await paid();
    await undo(p.id);
    expect(fake.store.consignorPayoutItem.filter((l: any) => l.payoutId === p.id).every((l: any) => l.activeItemKey !== null)).toBe(true);
    const unsettled = await ledger.loadUnsettled(db, { workspaceId: ws.workspaceId });
    expect(unsettled.consignors).toHaveLength(0);
  });

  it('a payout can be paid again after an undo (two MARKED_PAID events in the trail)', async () => {
    const { p } = await paid();
    await undo(p.id);
    await ledger.markPayoutPaid(db, {
      workspaceId: ws.workspaceId,
      payoutId: p.id,
      actorUserId: ws.userId,
      input: ledger.validateMarkPaidInput({ method: 'CASH', paidAt: paidAtIso() }),
    });
    expect(eventsOf(p.id, 'MARKED_PAID')).toHaveLength(2);
    expect(fake.store.consignorPayout.find((x: any) => x.id === p.id).status).toBe('PAID');
  });

  it('requires a reason at the service boundary (requireReason) and is a noop on an unpaid payout', async () => {
    const { batch } = await makeApprovedRun();
    const p = payoutsOf(batch.id)[0];
    const r = await undo(p.id);
    expect(r.noop).toBe(true);
    expect(eventsOf(p.id, 'UNMARKED_PAID')).toHaveLength(0);
    expect(catchErr(() => ledger.requireReason(''))).toMatchObject({ code: 'REASON_REQUIRED' });
  });

  it('cannot un-mark a VOID payout', async () => {
    const { batch } = await makeApprovedRun({ consignors: 2 });
    const p = payoutsOf(batch.id)[0];
    await ledger.voidPayout(db, { workspaceId: ws.workspaceId, payoutId: p.id, actorUserId: ws.userId, reason: 'x' });
    await expect(undo(p.id)).rejects.toMatchObject({ status: 409, code: 'INVALID_STATE' });
  });

  it('cross-workspace is a 404', async () => {
    const { p } = await paid();
    const other = fake.seedWorkspace({ userId: 'user_2' });
    await expect(ledger.undoPayoutPaid(db, { workspaceId: other.workspaceId, payoutId: p.id, actorUserId: 'user_2', reason: 'x' })).rejects.toMatchObject({ status: 404 });
    expect(fake.store.consignorPayout.find((x: any) => x.id === p.id).status).toBe('PAID');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('holdPayout / releasePayout', () => {
  const H = (id: string, reason = 'Waiting on W-9') => ledger.holdPayout(db, { workspaceId: ws.workspaceId, payoutId: id, actorUserId: ws.userId, reason });
  const R = (id: string) => ledger.releasePayout(db, { workspaceId: ws.workspaceId, payoutId: id, actorUserId: ws.userId });

  it('hold moves PENDING to ON_HOLD with the reason and an event; hold twice is a noop', async () => {
    const { batch } = await makeApprovedRun();
    const p = payoutsOf(batch.id)[0];
    const a = await H(p.id);
    const b = await H(p.id);
    expect(a.noop).toBe(false);
    expect(b.noop).toBe(true);
    expect(fake.store.consignorPayout.find((x: any) => x.id === p.id)).toMatchObject({ status: 'ON_HOLD', holdReason: 'Waiting on W-9' });
    expect(eventsOf(p.id, 'HELD')).toHaveLength(1);
    expect(eventsOf(p.id, 'HELD')[0]).toMatchObject({ note: 'Waiting on W-9', fromStatus: 'PENDING', toStatus: 'ON_HOLD' });
  });

  it('a held payout keeps its items out of the unsettled ledger', async () => {
    const { batch } = await makeApprovedRun();
    await H(payoutsOf(batch.id)[0].id);
    expect((await ledger.loadUnsettled(db, { workspaceId: ws.workspaceId })).consignors).toHaveLength(0);
  });

  it('release moves ON_HOLD back to PENDING and clears the reason; release twice is a noop', async () => {
    const { batch } = await makeApprovedRun();
    const p = payoutsOf(batch.id)[0];
    await H(p.id);
    const a = await R(p.id);
    const b = await R(p.id);
    expect(a.noop).toBe(false);
    expect(b.noop).toBe(true);
    expect(fake.store.consignorPayout.find((x: any) => x.id === p.id)).toMatchObject({ status: 'PENDING', holdReason: null });
    expect(eventsOf(p.id, 'RELEASED')).toHaveLength(1);
  });

  it('cannot hold a PAID payout or release a PAID payout', async () => {
    const { batch } = await makeApprovedRun();
    const p = payoutsOf(batch.id)[0];
    await ledger.markPayoutPaid(db, { workspaceId: ws.workspaceId, payoutId: p.id, actorUserId: ws.userId, input: ledger.validateMarkPaidInput({ method: 'CASH', paidAt: paidAtIso() }) });
    await expect(H(p.id)).rejects.toMatchObject({ status: 409, code: 'INVALID_STATE' });
    await expect(R(p.id)).rejects.toMatchObject({ status: 409, code: 'INVALID_STATE' });
  });

  it('cross-workspace is a 404', async () => {
    const { batch } = await makeApprovedRun();
    const p = payoutsOf(batch.id)[0];
    const other = fake.seedWorkspace({ userId: 'user_2' });
    await expect(ledger.holdPayout(db, { workspaceId: other.workspaceId, payoutId: p.id, actorUserId: 'u', reason: 'x' })).rejects.toMatchObject({ status: 404 });
    await expect(ledger.releasePayout(db, { workspaceId: other.workspaceId, payoutId: p.id, actorUserId: 'u' })).rejects.toMatchObject({ status: 404 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('voidPayout', () => {
  const V = (id: string, reason = 'Wrong consignor') => ledger.voidPayout(db, { workspaceId: ws.workspaceId, payoutId: id, actorUserId: ws.userId, reason });

  it('clears the line keys so the items are owed again, records why, and is idempotent', async () => {
    const { batch } = await makeApprovedRun({ consignors: 2 });
    const p = payoutsOf(batch.id)[0];
    const r = await V(p.id);
    expect(r.noop).toBe(false);
    const row = fake.store.consignorPayout.find((x: any) => x.id === p.id);
    expect(row).toMatchObject({ status: 'VOID', voidReason: 'Wrong consignor', voidedByUserId: ws.userId });
    expect(row.voidedAt).toBeInstanceOf(Date);
    expect(fake.store.consignorPayoutItem.filter((l: any) => l.payoutId === p.id).every((l: any) => l.activeItemKey === null)).toBe(true);
    expect(eventsOf(p.id, 'VOIDED')).toHaveLength(1);
    expect((await V(p.id)).noop).toBe(true);
    expect(eventsOf(p.id, 'VOIDED')).toHaveLength(1);
    const unsettled = await ledger.loadUnsettled(db, { workspaceId: ws.workspaceId });
    expect(unsettled.consignors).toHaveLength(1);
    expect(unsettled.consignors[0].consignor.id).toBe(p.consignorId);
  });

  it('voiding one payout of two leaves the run open; voiding the last cancels the run', async () => {
    const { batch } = await makeApprovedRun({ consignors: 2 });
    const [a, b] = payoutsOf(batch.id);
    await V(a.id);
    expect(fake.store.consignorSettlementBatch.find((x: any) => x.id === batch.id).status).toBe('APPROVED');
    await V(b.id);
    const row = fake.store.consignorSettlementBatch.find((x: any) => x.id === batch.id);
    expect(row.status).toBe('CANCELLED');
    expect(row.cancelledReason).toBe('All payouts were voided');
  });

  it('a paid payout must be un-marked first', async () => {
    const { batch } = await makeApprovedRun();
    const p = payoutsOf(batch.id)[0];
    await ledger.markPayoutPaid(db, { workspaceId: ws.workspaceId, payoutId: p.id, actorUserId: ws.userId, input: ledger.validateMarkPaidInput({ method: 'CASH', paidAt: paidAtIso() }) });
    await expect(V(p.id)).rejects.toMatchObject({ status: 409, code: 'PAYOUT_PAID' });
    expect(fake.store.consignorPayoutItem.every((l: any) => l.activeItemKey !== null)).toBe(true);
  });

  it('voids a standalone (no batch) payout, and cross-workspace is a 404', async () => {
    const c = fake.seedConsignor(ws.workspaceId, {});
    fake.seedItem(c.id, { price: 40, saleId: sale.id });
    const { payout } = await ledger.recordDirectPayout(db, {
      workspaceId: ws.workspaceId,
      actorUserId: ws.userId,
      consignorId: c.id,
      input: ledger.validateMarkPaidInput({ method: 'CASH', paidAt: paidAtIso() }),
    });
    const other = fake.seedWorkspace({ userId: 'user_2' });
    await expect(ledger.voidPayout(db, { workspaceId: other.workspaceId, payoutId: payout.id, actorUserId: 'u', reason: 'x' })).rejects.toMatchObject({ status: 404 });
    await expect(V(payout.id)).rejects.toMatchObject({ code: 'PAYOUT_PAID' });
    await ledger.undoPayoutPaid(db, { workspaceId: ws.workspaceId, payoutId: payout.id, actorUserId: ws.userId, reason: 'entered by mistake' });
    const r = await V(payout.id);
    expect(r.noop).toBe(false);
    expect((await ledger.loadUnsettled(db, { workspaceId: ws.workspaceId })).consignors).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('recordDirectPayout', () => {
  const direct = (consignorId: string, over: any = {}) =>
    ledger.recordDirectPayout(db, {
      workspaceId: ws.workspaceId,
      actorUserId: ws.userId,
      consignorId,
      input: ledger.validateMarkPaidInput({ method: 'CASH', paidAt: paidAtIso(), ...over }),
    });

  it('creates a PAID payout with lines and an event in one step, with no batch', async () => {
    const c = fake.seedConsignor(ws.workspaceId, {});
    fake.seedItem(c.id, { price: 20, saleId: sale.id });
    fake.seedItem(c.id, { price: 30, saleId: sale.id });
    const { payout } = await direct(c.id, { reference: 'CHK9' });
    expect(payout).toMatchObject({ status: 'PAID', method: 'CASH', paidReference: 'CHK9', processor: 'MANUAL' });
    expect(payout.settlementBatchId ?? null).toBeNull(); // standalone: belongs to no run
    expect(D(payout.netPayout).toFixed(2)).toBe('25.00');
    expect(D(payout.paidAmount).toFixed(2)).toBe('25.00');
    const lines = fake.store.consignorPayoutItem.filter((l: any) => l.payoutId === payout.id);
    expect(lines).toHaveLength(2);
    expect(lines.every((l: any) => l.activeItemKey === l.itemId)).toBe(true);
    expect(eventsOf(payout.id, 'MARKED_PAID')).toHaveLength(1);
    expect(fake.store.consignorSettlementBatch).toHaveLength(0);
  });

  it('a second call is a 409 NOTHING_OWED and creates nothing', async () => {
    const c = fake.seedConsignor(ws.workspaceId, {});
    fake.seedItem(c.id, { price: 20, saleId: sale.id });
    await direct(c.id);
    await expect(direct(c.id)).rejects.toMatchObject({ status: 409, code: 'NOTHING_OWED' });
    expect(fake.store.consignorPayout).toHaveLength(1);
    expect(fake.store.consignorPayoutItem).toHaveLength(1);
  });

  it('cannot double-pay an item that already sits in a draft run', async () => {
    const { consignors } = await makeRun();
    await expect(direct(consignors[0].id)).rejects.toMatchObject({ status: 409, code: 'NOTHING_OWED' });
    expect(fake.store.consignorPayout).toHaveLength(1);
  });

  it('two concurrent calls create exactly one payout, the loser gets a 409', async () => {
    const c = fake.seedConsignor(ws.workspaceId, {});
    fake.seedItem(c.id, { price: 20, saleId: sale.id });
    fake.seedItem(c.id, { price: 30, saleId: sale.id });
    const settled = await Promise.allSettled([direct(c.id), direct(c.id)]);
    expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(1);
    const lost = settled.find((s) => s.status === 'rejected') as PromiseRejectedResult;
    expect(lost.reason.status).toBe(409);
    expect(['NOTHING_OWED', 'ALREADY_SETTLED']).toContain(lost.reason.code);
    expect(fake.store.consignorPayout).toHaveLength(1);
    expect(fake.store.consignorPayoutItem).toHaveLength(2);
  });

  it('a consignor in another workspace has nothing owed here', async () => {
    const other = fake.seedWorkspace({ userId: 'user_2' });
    const c = fake.seedConsignor(other.workspaceId, {});
    fake.seedItem(c.id, { price: 20 });
    await expect(direct(c.id)).rejects.toMatchObject({ status: 409, code: 'NOTHING_OWED' });
  });

  it('can be scoped to a sale and leaves other sales owed', async () => {
    const sale2 = fake.seedSale(ws.organizerId, 'Fall Sale');
    const c = fake.seedConsignor(ws.workspaceId, {});
    fake.seedItem(c.id, { price: 20, saleId: sale.id });
    fake.seedItem(c.id, { price: 40, saleId: sale2.id });
    const { payout } = await ledger.recordDirectPayout(db, {
      workspaceId: ws.workspaceId,
      actorUserId: ws.userId,
      consignorId: c.id,
      saleId: sale.id,
      input: ledger.validateMarkPaidInput({ method: 'CHECK', paidAt: paidAtIso(), reference: '12' }),
    });
    expect(D(payout.netPayout).toFixed(2)).toBe('10.00');
    expect(payout.saleId).toBe(sale.id);
    const rest = await ledger.loadUnsettled(db, { workspaceId: ws.workspaceId });
    expect(rest.consignors[0].net.toFixed(2)).toBe('20.00');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('csvCell and buildBatchCsv', () => {
  it('neutralizes formula injection with a leading single quote', () => {
    expect(ledger.csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(ledger.csvCell('+1')).toBe("'+1");
    expect(ledger.csvCell('-2')).toBe("'-2");
    expect(ledger.csvCell('@cmd')).toBe("'@cmd");
    expect(ledger.csvCell('\tcmd')).toBe("'\tcmd");
    expect(ledger.csvCell('\rcmd')).toContain("'");
  });

  it('quotes commas, quotes and newlines; leaves plain text and null alone', () => {
    expect(ledger.csvCell('plain')).toBe('plain');
    expect(ledger.csvCell('a,b')).toBe('"a,b"');
    expect(ledger.csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(ledger.csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(ledger.csvCell(null)).toBe('');
    expect(ledger.csvCell(undefined)).toBe('');
    expect(ledger.csvCell(12.5)).toBe('12.5');
  });

  it('an injected consignor name or item title is neutralized inside a full CSV', () => {
    const csv = ledger.buildBatchCsv({
      runNumber: 2,
      sale: { title: 'Spring, Sale' },
      payouts: [
        {
          id: 'payout_abcdefgh12345678',
          status: 'PENDING',
          consignor: { name: '=HYPERLINK("http://x")', email: 'a@example.com' },
          items: [{ titleSnapshot: '@evil', listPrice: 10, priceBeforeMarkdown: null, collectedAmount: 10, ratePct: 50, consignorShare: 5, organizerShare: 5, soldAt: new Date('2026-09-01T00:00:00Z') }],
        },
      ],
    });
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(ledger.CSV_HEADERS.join(','));
    expect(lines[1]).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(lines[1]).toContain(",'@evil,");
    expect(lines[1]).toContain('"Spring, Sale"');
    expect(lines[1]).toContain('Run 2');
    expect(lines[1]).toContain('12345678'.toUpperCase());
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('a legacy payout without lines produces one summary row', () => {
    const csv = ledger.buildBatchCsv({
      runNumber: 1,
      sale: null,
      payouts: [{ id: 'p_legacy0001', status: 'COMPLETED', totalSales: D(100), netPayout: D(60), method: 'VENMO', consignor: { name: 'Old', email: null }, items: [] }],
    });
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('All sales');
    expect(lines[1]).toContain('PAID');
    expect(lines[1]).toContain('60.00');
    expect(lines[1]).toContain('Venmo');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('statements', () => {
  it('period label prefers the sale title, then a date range, then a generic label', () => {
    expect(ledger.periodLabelFor({ sale: { title: 'Spring Sale' } }, [])).toBe('Spring Sale');
    const d1 = new Date('2026-09-01T10:00:00Z');
    const d2 = new Date('2026-09-05T10:00:00Z');
    expect(ledger.periodLabelFor({}, [{ soldAt: d1 }])).toBe('Items sold Sep 1, 2026');
    expect(ledger.periodLabelFor({}, [{ soldAt: d1 }, { soldAt: d2 }])).toBe('Items sold Sep 1, 2026 to Sep 5, 2026');
    expect(ledger.periodLabelFor({}, [])).toBe('Consigned items');
  });

  it('builds a statement with reference, footer, lines, totals, was-price and status labels through the lifecycle', async () => {
    const c = fake.seedConsignor(ws.workspaceId, { name: 'Pat Maker', email: 'pat@example.com' });
    fake.seedItem(c.id, { price: 20, title: 'Marked down lamp', priceBeforeMarkdown: 30, saleId: sale.id });
    fake.seedItem(c.id, { price: 30, title: 'Chair', saleId: sale.id });
    const { batch } = await ledger.createSettlementRun(db, { workspaceId: ws.workspaceId, actorUserId: ws.userId, saleId: sale.id });
    const p = payoutsOf(batch.id)[0];
    const get = () => ledger.buildStatement(db, { workspaceId: ws.workspaceId, payoutId: p.id });

    let st = await get();
    expect(st.reference).toBe(p.id.slice(-8).toUpperCase());
    expect(st.organizerName).toBe('Maple Estate Co');
    expect(st.consignor).toMatchObject({ name: 'Pat Maker', email: 'pat@example.com' });
    expect(st.periodLabel).toBe('Spring Sale');
    expect(st.statusLabel).toBe('Draft, not yet approved');
    expect(st.totals).toEqual({ itemCount: 2, gross: '50.00', consignorShare: '25.00' });
    expect(st.legacy).toBe(false);
    const lamp = st.lines.find((l) => l.title === 'Marked down lamp')!;
    expect(lamp).toMatchObject({ listPrice: '20.00', priceBeforeMarkdown: '30.00', markedDown: true, ratePct: '50.00', consignorShare: '10.00' });
    expect(st.lines.find((l) => l.title === 'Chair')!.markedDown).toBe(false);
    expect(st.footer).toBe(ledger.STATEMENT_FOOTER);

    await ledger.approveRun(db, { workspaceId: ws.workspaceId, batchId: batch.id, actorUserId: ws.userId });
    st = await get();
    expect(st.statusLabel).toBe('Approved, payment pending');

    await ledger.markPayoutPaid(db, {
      workspaceId: ws.workspaceId,
      payoutId: p.id,
      actorUserId: ws.userId,
      input: ledger.validateMarkPaidInput({ method: 'CHECK', paidAt: '2026-09-10T00:00:00Z', reference: '1042' }),
    });
    st = await get();
    expect(st.status).toBe('PAID');
    expect(st.statusLabel).toBe('Paid Sep 10, 2026 by Check (reference 1042)');
    expect(st.methodLabel).toBe('Check');
    expect(st.paidReference).toBe('1042');

    await ledger.undoPayoutPaid(db, { workspaceId: ws.workspaceId, payoutId: p.id, actorUserId: ws.userId, reason: 'x' });
    await ledger.holdPayout(db, { workspaceId: ws.workspaceId, payoutId: p.id, actorUserId: ws.userId, reason: 'x' });
    expect((await get()).statusLabel).toBe('On hold');
    await ledger.releasePayout(db, { workspaceId: ws.workspaceId, payoutId: p.id, actorUserId: ws.userId });
    await ledger.voidPayout(db, { workspaceId: ws.workspaceId, payoutId: p.id, actorUserId: ws.userId, reason: 'x' });
    expect((await get()).statusLabel).toBe('Voided');
  });

  it('statement copy has no forbidden words or em dashes', async () => {
    const { batch } = await makeApprovedRun();
    const st = await ledger.buildStatement(db, { workspaceId: ws.workspaceId, payoutId: payoutsOf(batch.id)[0].id });
    const text = JSON.stringify(st);
    expect(text).not.toMatch(/estate sale/i);
    expect(text).not.toMatch(/\bAI\b/);
    expect(text).not.toContain('\u2014');
  });

  it('a legacy payout without lines builds a statement flagged legacy from its stored totals', async () => {
    const c = fake.seedConsignor(ws.workspaceId, {});
    fake.store.consignorPayout.push({
      id: 'legacy_payout_0001',
      consignorId: c.id,
      saleId: null,
      settlementBatchId: null,
      status: 'COMPLETED',
      totalSales: D(100),
      commissionAmount: D(60),
      netPayout: D(60),
      method: 'VENMO',
      paidAt: new Date('2026-01-05T00:00:00Z'),
      createdAt: new Date('2026-01-05T00:00:00Z'),
    });
    const st = await ledger.buildStatement(db, { workspaceId: ws.workspaceId, payoutId: 'legacy_payout_0001' });
    expect(st.legacy).toBe(true);
    expect(st.status).toBe('PAID');
    expect(st.totals).toEqual({ itemCount: 0, gross: '100.00', consignorShare: '60.00' });
    expect(st.lines).toEqual([]);
    expect(st.methodLabel).toBe('Venmo');
  });

  it('cross-workspace statement is a 404', async () => {
    const { batch } = await makeApprovedRun();
    const other = fake.seedWorkspace({ userId: 'user_2' });
    await expect(ledger.buildStatement(db, { workspaceId: other.workspaceId, payoutId: payoutsOf(batch.id)[0].id })).rejects.toMatchObject({ status: 404 });
  });

  it('payout events list is workspace-scoped, newest first, and 404s across workspaces', async () => {
    const { batch } = await makeApprovedRun();
    const p = payoutsOf(batch.id)[0];
    await ledger.holdPayout(db, { workspaceId: ws.workspaceId, payoutId: p.id, actorUserId: ws.userId, reason: 'x' });
    await ledger.releasePayout(db, { workspaceId: ws.workspaceId, payoutId: p.id, actorUserId: ws.userId });
    const events: any[] = await ledger.listPayoutEvents(db, ws.workspaceId, p.id);
    expect(events.length).toBeGreaterThanOrEqual(3); // created/approved + held + released
    const types = events.map((e) => e.type);
    expect(types.indexOf('RELEASED')).toBeLessThan(types.indexOf('HELD'));
    const other = fake.seedWorkspace({ userId: 'user_2' });
    await expect(ledger.listPayoutEvents(db, other.workspaceId, p.id)).rejects.toMatchObject({ status: 404 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('summaries', () => {
  it('sales summary groups unsettled shares per sale, labels inventory, and counts held items', async () => {
    const sale2 = fake.seedSale(ws.organizerId, 'Fall Sale');
    const c = fake.seedConsignor(ws.workspaceId, {});
    fake.seedItem(c.id, { price: 20, saleId: sale.id });
    fake.seedItem(c.id, { price: 100, saleId: sale2.id });
    fake.seedItem(c.id, { price: 10, saleId: null });
    const refunded = fake.seedItem(c.id, { price: 40, saleId: sale.id });
    fake.seedPurchase(refunded.id, { status: 'REFUNDED' });
    const rows = await ledger.getSalesSummary(db, ws.workspaceId);
    const byId = new Map(rows.map((r: any) => [r.saleId, r]));
    expect(byId.get(sale2.id)).toMatchObject({ saleTitle: 'Fall Sale', unsettledCount: 1, unsettledAmount: '50.00', heldCount: 0 });
    expect(byId.get(sale.id)).toMatchObject({ saleTitle: 'Spring Sale', unsettledCount: 1, unsettledAmount: '10.00', heldCount: 1 });
    expect(byId.get(null)).toMatchObject({ saleTitle: 'Consignment inventory', unsettledCount: 1, unsettledAmount: '5.00' });
    expect(rows[0].saleId).toBe(sale2.id); // largest first
  });

  it('owed-by-consignor map carries owed amount, item count and held count', async () => {
    const a = fake.seedConsignor(ws.workspaceId, { name: 'A' });
    const b = fake.seedConsignor(ws.workspaceId, { name: 'B' });
    fake.seedItem(a.id, { price: 20, saleId: sale.id });
    fake.seedItem(a.id, { price: 30, saleId: sale.id });
    const refunded = fake.seedItem(b.id, { price: 40, saleId: sale.id });
    fake.seedPurchase(refunded.id, { status: 'REFUNDED' });
    const map = await ledger.getOwedByConsignor(db, ws.workspaceId);
    expect(map.get(a.id)).toEqual({ owedAmount: '25.00', owedItemCount: 2, heldItemCount: 0 });
    expect(map.get(b.id)).toEqual({ owedAmount: '0.00', owedItemCount: 0, heldItemCount: 1 });
  });

  it('a consignor whose items sit in a run has no owed entry', async () => {
    const { consignors } = await makeApprovedRun();
    const map = await ledger.getOwedByConsignor(db, ws.workspaceId);
    expect(map.get(consignors[0].id)).toBeUndefined();
  });

  it('annual summary totals only payments recorded as paid inside the year, by consignor and method', async () => {
    const mk = async (name: string, paidAt: string, method: string, price: number) => {
      const c = fake.seedConsignor(ws.workspaceId, { name });
      fake.seedItem(c.id, { price, saleId: null });
      const { payout } = await ledger.recordDirectPayout(db, {
        workspaceId: ws.workspaceId,
        actorUserId: ws.userId,
        consignorId: c.id,
        input: ledger.validateMarkPaidInput({ method, paidAt }),
      });
      return { c, payout };
    };
    const a1 = await mk('Ann', '2026-03-15T00:00:00Z', 'CASH', 40); // 20.00
    await mk('Ann2', '2025-12-31T23:00:00Z', 'CHECK', 100); // outside 2026
    const b = await mk('Bob', '2026-05-01T00:00:00Z', 'SQUARE', 60); // 30.00
    // a second payment to Ann in 2026 by another method
    fake.seedItem(a1.c.id, { price: 10, saleId: null });
    await ledger.recordDirectPayout(db, {
      workspaceId: ws.workspaceId,
      actorUserId: ws.userId,
      consignorId: a1.c.id,
      input: ledger.validateMarkPaidInput({ method: 'CHECK', paidAt: '2026-06-01T00:00:00Z', reference: '5' }),
    });
    // a pending (unpaid) payout must never count
    const pend = await makeApprovedRun();
    expect(pend.batch.id).toBeTruthy();

    const s = await ledger.getAnnualSummary(db, ws.workspaceId, 2026);
    expect(s.year).toBe(2026);
    expect(s.totals).toEqual({ paidTotal: '55.00', payoutCount: 3, consignorCount: 2 });
    const ann = s.consignors.find((r: any) => r.name === 'Ann')!;
    expect(ann).toMatchObject({ paidTotal: '25.00', payoutCount: 2, byMethod: { CASH: '20.00', CHECK: '5.00' } });
    expect(s.consignors.find((r: any) => r.consignorId === b.c.id)!.byMethod).toEqual({ SQUARE: '30.00' });
    expect(s.disclaimer).toMatch(/accountant/);
    expect(s.consignors.map((r: any) => r.name)).toEqual([...s.consignors.map((r: any) => r.name)].sort());
  });

  it('annual summary is workspace-scoped', async () => {
    const other = fake.seedWorkspace({ userId: 'user_2' });
    const c = fake.seedConsignor(other.workspaceId, {});
    fake.seedItem(c.id, { price: 40 });
    await ledger.recordDirectPayout(db, {
      workspaceId: other.workspaceId,
      actorUserId: 'user_2',
      consignorId: c.id,
      input: ledger.validateMarkPaidInput({ method: 'CASH', paidAt: '2026-03-15T00:00:00Z' }),
    });
    const mine = await ledger.getAnnualSummary(db, ws.workspaceId, 2026);
    expect(mine.totals.payoutCount).toBe(0);
  });
});

describe('buildBatchCsv keeps money numeric (P2, 2026-09-29)', () => {
  it('a negative amount is written as a number, not text with a formula-guard apostrophe', () => {
    const csv = ledger.buildBatchCsv({
      runNumber: 1,
      sale: { title: 'S' },
      payouts: [
        {
          id: 'payout_abcdefgh12345678',
          status: 'PENDING',
          consignor: { name: 'C', email: 'c@example.com' },
          items: [{ titleSnapshot: 'Refunded lamp', listPrice: 10, priceBeforeMarkdown: null, collectedAmount: D(-10), ratePct: 50, consignorShare: D(-5), organizerShare: D(-5), soldAt: new Date('2026-09-01T00:00:00Z') }],
        },
      ],
    });
    const line = csv.split('\r\n')[1];
    expect(line).toContain(',-10.00,');
    expect(line).toContain(',-5.00,');
    expect(line).not.toContain("'-");
  });

  it('a summary row for a legacy payout keeps negative totals numeric too', () => {
    const csv = ledger.buildBatchCsv({
      runNumber: 1,
      sale: null,
      payouts: [{ id: 'p_legacy0002', status: 'COMPLETED', totalSales: D(-3), netPayout: D(-2), method: null, consignor: { name: 'Old', email: null }, items: [] }],
    });
    const line = csv.trim().split('\r\n')[1];
    expect(line).toContain('-3.00');
    expect(line).toContain('-2.00');
    expect(line).not.toContain("'-");
  });

  it('text cells are still guarded and csvCell is the shared utils/csvSafe writer', () => {
    expect(ledger.csvCell('-2')).toBe("'-2");
    expect(ledger.csvCell(' =1+1')).toBe("'\u0020=1+1");
    expect(ledger.csvCell('a,b')).toBe('"a,b"');
    expect(ledger.csvCell(-2)).toBe('-2');
  });
});
