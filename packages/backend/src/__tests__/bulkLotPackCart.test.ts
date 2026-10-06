/**
 * Packs in a hub cart and in shopper holds (ADR-136 Addendum E, roadmap #659).
 *
 * WHAT THIS PROVES (lot: 10,000 cards at $8 per 1,000 sold in 1,000-card packs, so one pack is $8.00; a plain item at $20.00 is in the cart)
 *   - a pack line is priced by the server (N x the pack price), takes N x 1,000 cards, and adds its cents to the cart
 *   - a wrong client total, too many packs, and a bad count each reject only their own line
 *   - two carts racing for the last pack: exactly one gets it, the lot is never oversold
 *   - the line belongs to the lot's own booth, so another vendor's cashier can sell it and the settle writes the Purchase for that booth
 *   - removing a pack line, or cancelling the cart, gives the cards back exactly once
 *   - settling a pack line writes the Purchase with bulkQuantity = cards, once, even on a retried finalize
 *   - a cart that closed meanwhile rolls the whole add back
 *   - a shopper hold on a pack lot is whole packs and priced as packs; an organizer hold stays free quantity
 *   - a lot with no pack size keeps the free quantity behavior exactly (the legacy line still works)
 */
import { listCartLotLines, releaseAllCartLotLines, removeCartLotLines, reserveCartLotLines, settleCartLotLine } from '../services/bulkLot/bulkLotBoothCartService';
import { toCartLotRequests } from '../services/bulkLot/bulkLotPackService';
import { placeBulkHold } from '../services/bulkLot/bulkLotHoldService';
import { fakeSell } from './__fixtures__/bulkLotFollowupFakes';
import { PackFakeDb } from './__fixtures__/bulkLotPackFakes';

let db: PackFakeDb;
let lot: string;

class CartNotOpenError extends Error {}

function openCart(id = 'cart1', status = 'PENDING') {
  db.boothCartTransaction.rows.push({ id, status, totalCents: 2000 });
}
function applyAdd(cartId = 'cart1') {
  return (tx: any, added: { totalCents: number }) =>
    tx.boothCartTransaction.updateMany({ where: { id: cartId, status: 'PENDING' }, data: { totalCents: { increment: added.totalCents } } }).then((r: any) => {
      if (r.count !== 1) throw new CartNotOpenError('cart closed');
    });
}
function itemFor(id: string) {
  const r = db.item.rows.find((x) => x.id === id)!;
  return { id: r.id, price: r.price, status: r.status, stockTotal: r.stockTotal, stockSold: r.stockSold };
}
function packReqs(lines: Array<{ itemId: string; packs?: number; amount?: number | null }>, booth = 'boothLot') {
  return toCartLotRequests({
    lots: lines.map((l) => ({ item: itemFor(l.itemId), vendorBoothId: booth })),
    freeRequests: [],
    packRequests: lines.map((l) => ({ itemId: l.itemId, packs: l.packs ?? 1, amount: l.amount ?? null })),
    packSizes: db.packs,
  });
}
const add = (cartId: string, requests: any[]) => reserveCartLotLines(db as any, { sell: fakeSell(db) }, { cartId, requests }, applyAdd(cartId));

beforeEach(() => {
  db = new PackFakeDb();
  lot = db.addPackLot({ title: 'Commons', price: 8, stockTotal: 10000 }, 1000).id;
  openCart();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('adding pack lines to a hub cart', () => {
  it('prices N packs on the server, takes the cards, and adds the cents to the cart', async () => {
    const res = await add('cart1', packReqs([{ itemId: lot, packs: 2, amount: 16 }]));
    expect(res.rejected).toEqual([]);
    expect(res.added).toHaveLength(1);
    expect(res.added[0]).toMatchObject({ itemId: lot, quantity: 2000, lineCents: 1600, pricePerThousandCents: 800, vendorBoothId: 'boothLot', status: 'RESERVED' });
    expect(db.stock(lot).sold).toBe(2000);
    expect(db.boothCartTransaction.rows[0].totalCents).toBe(2000 + 1600);
  });

  it('rejects a wrong client total, too many packs and a bad count, each alone, and takes the good line', async () => {
    const lot2 = db.addPackLot({ title: 'Rares', price: 20, stockTotal: 3000 }, 1000).id;
    const reqs = [
      ...packReqs([{ itemId: lot, packs: 1, amount: 7.99 }]),
      ...packReqs([{ itemId: lot2, packs: 4 }]),
      ...packReqs([{ itemId: lot, packs: 0 }]),
    ];
    // a fresh good line for lot2 with 2 packs
    reqs.push(...packReqs([{ itemId: lot2, packs: 2, amount: 40 }]));
    const res = await add('cart1', reqs);
    expect(res.rejected.map((r) => [r.itemId, r.code])).toEqual([[lot, 'PRICE_CHANGED'], [lot2, 'INSUFFICIENT_STOCK'], [lot, 'BULK_PACK_COUNT']]);
    expect(res.added).toHaveLength(1);
    expect(res.added[0]).toMatchObject({ itemId: lot2, quantity: 2000, lineCents: 4000 });
    expect(db.stock(lot).sold).toBe(0);
    expect(db.stock(lot2).sold).toBe(2000);
    expect(db.boothCartTransaction.rows[0].totalCents).toBe(6000);
  });

  it('only whole packs fit: 1,700 cards left is one pack, not two', async () => {
    db.item.rows.find((x) => x.id === lot)!.stockSold = 8300;
    const one = await add('cart1', packReqs([{ itemId: lot, packs: 1 }]));
    expect(one.added).toHaveLength(1);
    const two = await add('cart1', packReqs([{ itemId: lot, packs: 1 }]));
    expect(two.rejected).toEqual([{ itemId: lot, code: 'INSUFFICIENT_STOCK' }]);
    expect(db.stock(lot).left).toBe(700);
  });

  it('two carts racing for the last pack: exactly one gets it and the lot is never oversold', async () => {
    const last = db.addPackLot({ title: 'Last', price: 8, stockTotal: 1000 }, 1000).id;
    openCart('cartB');
    // Both carts read the lot BEFORE either takes the pack (the snapshots both show one pack left), then race to take it.
    const reqA = packReqs([{ itemId: last, packs: 1 }]);
    const reqB = packReqs([{ itemId: last, packs: 1 }]);
    const a = add('cart1', reqA);
    const b = add('cartB', reqB);
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.added.length + rb.added.length).toBe(1);
    expect(ra.rejected.length + rb.rejected.length).toBe(1);
    const lost = ra.added.length === 0 ? ra : rb;
    expect(lost.rejected[0].code).toBe('INSUFFICIENT_STOCK');
    expect(db.stock(last)).toMatchObject({ sold: 1000, left: 0, status: 'SOLD' });
    expect(db.boothCartBulkLine.rows.filter((l) => l.itemId === last)).toHaveLength(1);
  });

  it('a cart that closed meanwhile rolls the whole add back', async () => {
    db.boothCartTransaction.rows[0].status = 'IN_PROGRESS';
    await expect(add('cart1', packReqs([{ itemId: lot, packs: 3 }]))).rejects.toBeInstanceOf(CartNotOpenError);
    expect(db.stock(lot).sold).toBe(0);
    expect(db.boothCartBulkLine.rows).toHaveLength(0);
  });

  it('a mixed cart: a pack line and a free quantity line on a lot with no pack size', async () => {
    const plain = db.addLot({ title: 'Plain', price: 5, stockTotal: 5000 }).id;
    const requests = toCartLotRequests({
      lots: [
        { item: itemFor(lot), vendorBoothId: 'boothLot' },
        { item: itemFor(plain), vendorBoothId: 'boothLot' },
      ],
      freeRequests: [{ itemId: plain, quantity: 1500, amount: 7.5 }],
      packRequests: [{ itemId: lot, packs: 1, amount: null }],
      packSizes: db.packs,
    });
    const res = await add('cart1', requests);
    expect(res.rejected).toEqual([]);
    expect(res.added.map((l) => [l.itemId, l.quantity, l.lineCents])).toEqual([[lot, 1000, 800], [plain, 1500, 750]]);
  });
});

describe('a pack line belongs to the lot owner booth', () => {
  it('another vendor cashier adds it; it is listed under the lot booth and nowhere else', async () => {
    const res = await add('cart1', packReqs([{ itemId: lot, packs: 1 }], 'boothOwner'));
    expect(res.added[0].vendorBoothId).toBe('boothOwner');
    expect((await listCartLotLines(db as any, 'cart1', 'boothOwner')).map((l) => l.quantity)).toEqual([1000]);
    expect(await listCartLotLines(db as any, 'cart1', 'boothCashier')).toEqual([]);
    expect(await listCartLotLines(db as any, 'cart1')).toHaveLength(1);
  });

  it('the settle writes the Purchase for the line with bulkQuantity equal to the cards, once, even when finalize is retried', async () => {
    const res = await add('cart1', packReqs([{ itemId: lot, packs: 3 }], 'boothOwner'));
    const lineId = res.added[0].lineId;
    const make = (tx: any) => tx.purchase.create({ data: { itemId: lot, bulkQuantity: 3000, amount: 24 } });
    const first = await settleCartLotLine(db as any, lineId, make);
    const second = await settleCartLotLine(db as any, lineId, make);
    expect(first).toBeTruthy();
    expect(second).toBeNull();
    expect(db.purchase.rows).toHaveLength(1);
    expect(db.purchase.rows[0].bulkQuantity).toBe(3000);
    expect(db.boothCartBulkLine.rows[0]).toMatchObject({ status: 'SOLD', purchaseId: first });
    expect(db.stock(lot).sold).toBe(3000);
  });
});

describe('removing and cancelling', () => {
  it('removing a pack line gives the cards back and takes its cents off', async () => {
    const res = await add('cart1', packReqs([{ itemId: lot, packs: 2 }]));
    const removed = await removeCartLotLines(db as any, { cartId: 'cart1', itemId: lot, lineId: res.added[0].lineId }, async (tx, r) => {
      await tx.boothCartTransaction.updateMany({ where: { id: 'cart1', status: 'PENDING' }, data: { totalCents: { decrement: r.cents } } });
    });
    expect(removed).toEqual({ lines: 1, cards: 2000, cents: 1600 });
    expect(db.stock(lot).sold).toBe(0);
    expect(db.boothCartTransaction.rows[0].totalCents).toBe(2000);
  });

  it('cancelling the cart gives every reserved pack back once; a second pass gives back nothing', async () => {
    await add('cart1', packReqs([{ itemId: lot, packs: 2 }]));
    await add('cart1', packReqs([{ itemId: lot, packs: 1 }]));
    expect(db.stock(lot).sold).toBe(3000);
    expect(await releaseAllCartLotLines(db as any, 'cart1')).toEqual([lot, lot]);
    expect(db.stock(lot).sold).toBe(0);
    expect(await releaseAllCartLotLines(db as any, 'cart1')).toEqual([]);
    expect(db.stock(lot).sold).toBe(0);
  });

  it('a sold out lot returns to AVAILABLE when its pack goes back', async () => {
    const last = db.addPackLot({ price: 8, stockTotal: 1000 }, 1000).id;
    await add('cart1', packReqs([{ itemId: last, packs: 1 }]));
    expect(db.stock(last).status).toBe('SOLD');
    await releaseAllCartLotLines(db as any, 'cart1');
    expect(db.stock(last)).toMatchObject({ sold: 0, status: 'AVAILABLE' });
  });
});

describe('legacy lots without a pack size are unchanged', () => {
  it('free quantity lines price and reserve exactly as before', async () => {
    const plain = db.addLot({ title: 'Plain', price: 8, stockTotal: 10000 }).id;
    const res = await add(
      'cart1',
      toCartLotRequests({ lots: [{ item: itemFor(plain), vendorBoothId: 'b1' }], freeRequests: [{ itemId: plain, quantity: 1500, amount: 12 }], packRequests: [], packSizes: db.packs })
    );
    expect(res.added[0]).toMatchObject({ quantity: 1500, lineCents: 1200 });
    expect(db.stock(plain).sold).toBe(1500);
  });
});

describe('shopper holds on a pack lot', () => {
  const deps = () => ({ sell: fakeSell(db), now: () => new Date(Date.UTC(2026, 9, 6, 12, 0, 0)) });
  const SHOPPER = { kind: 'SHOPPER' as const, userId: 'u_shop' };
  const ORG = { kind: 'ORGANIZER' as const, organizerId: 'org1', actorUserId: 'u_org' };
  const codeOf = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      return 'NO_ERROR';
    } catch (e: any) {
      return String(e.code ?? e.message);
    }
  };

  it('holds whole packs and prices them as packs', async () => {
    const hold = await placeBulkHold(db as any, deps(), SHOPPER, lot, { quantity: 2000 });
    expect(hold.quantity).toBe(2000);
    expect(hold.lineCents).toBe(1600);
    expect(db.stock(lot).sold).toBe(2000);
  });

  it('refuses a quantity that is not whole packs, or less than one pack', async () => {
    expect(await codeOf(() => placeBulkHold(db as any, deps(), SHOPPER, lot, { quantity: 1500 }))).toBe('BULK_PACK_ONLY');
    expect(await codeOf(() => placeBulkHold(db as any, deps(), SHOPPER, lot, { quantity: 500 }))).toBe('BULK_PACK_ONLY');
    expect(db.stock(lot).sold).toBe(0);
  });

  it('an organizer hold stays free quantity', async () => {
    const hold = await placeBulkHold(db as any, deps(), ORG, lot, { quantity: 1500, customerName: 'Sam' });
    expect(hold.quantity).toBe(1500);
    expect(hold.lineCents).toBe(1200);
  });

  it('a hold on a lot with no pack size is unchanged for a shopper', async () => {
    const plain = db.addLot({ price: 8, stockTotal: 10000 }).id;
    const hold = await placeBulkHold(db as any, deps(), SHOPPER, plain, { quantity: 1500 });
    expect(hold.lineCents).toBe(1200);
  });
});
