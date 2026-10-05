/**
 * Hub cart with bulk lot lines (ADR-136 Addendum B, roadmap #659): a mixed cart prices and reserves on the server.
 *
 * WHAT THIS PROVES (lot A: 10,000 cards at $8 per 1,000; lot B: 1,000 cards at $5 per 1,000; one plain item at $20.00 already in the cart):
 *   - adding lot lines prices each one on the server, takes the cards, and updates the cart total with the lots' cents
 *   - in a mixed request a refused line (price changed, too many cards, bad quantity) is rejected alone and the others still go in
 *   - if the cart is no longer open (checkout started) the whole add rolls back: no card is taken, no line is left behind
 *   - removing a lot line gives the cards back and takes its cents off the cart; a missing line is a 404 and changes nothing
 *   - cancelling or abandoning the cart gives back every reserved line exactly once, and a second pass gives back nothing
 *   - settling a line flips it to SOLD and writes the Purchase in the same transaction; a retried finalize writes no second Purchase
 *   - a failed Purchase write rolls the line back to RESERVED
 */
import { listCartLotLines, releaseAllCartLotLines, removeCartLotLines, reserveCartLotLines, settleCartLotLine } from '../services/bulkLot/bulkLotBoothCartService';
import { FakeDb, fakeSell } from './__fixtures__/bulkLotFollowupFakes';

let db: FakeDb;
let lotA: string;
let lotB: string;

class CartNotOpenError extends Error {}

function openCart(status = 'PENDING') {
  db.boothCartTransaction.rows.push({ id: 'cart1', status, totalCents: 2000 });
}

/** The same shape the controller uses: CAS on PENDING, throw when it matched nothing. */
function applyAdd(tx: any, added: { totalCents: number }) {
  return tx.boothCartTransaction.updateMany({ where: { id: 'cart1', status: 'PENDING' }, data: { totalCents: { increment: added.totalCents } } }).then((r: any) => {
    if (r.count !== 1) throw new CartNotOpenError('cart closed');
  });
}

function req(itemId: string, quantity: unknown, amountDollars: number | null = null, vendorBoothId = 'booth1') {
  const row = db.item.rows.find((x) => x.id === itemId)!;
  return { item: { id: row.id, price: row.price, status: row.status, stockTotal: row.stockTotal, stockSold: row.stockSold }, vendorBoothId, quantity, amountDollars };
}

beforeEach(() => {
  db = new FakeDb();
  lotA = db.addLot({ title: 'Commons', price: 8, stockTotal: 10000 }).id;
  lotB = db.addLot({ title: 'Uncommons', price: 5, stockTotal: 1000 }).id;
  openCart();
});

describe('reserveCartLotLines', () => {
  it('prices on the server, takes the cards, and adds the lots\' cents to the cart', async () => {
    const res = await reserveCartLotLines(db as any, { sell: fakeSell(db) }, { cartId: 'cart1', requests: [req(lotA, 1500, 12), req(lotB, 400)] }, applyAdd);
    expect(res.rejected).toEqual([]);
    expect(res.added.map((l) => [l.itemId, l.quantity, l.lineCents, l.pricePerThousandCents])).toEqual([[lotA, 1500, 1200, 800], [lotB, 400, 200, 500]]);
    expect(db.stock(lotA).sold).toBe(1500);
    expect(db.stock(lotB).sold).toBe(400);
    expect(db.boothCartTransaction.rows[0].totalCents).toBe(2000 + 1200 + 200);
  });

  it('rejects a refused line alone in a mixed request and still takes the others', async () => {
    const res = await reserveCartLotLines(
      db as any,
      { sell: fakeSell(db) },
      { cartId: 'cart1', requests: [req(lotA, 1500, 11.99), req(lotB, 5000), req(lotB, 0), req(lotB, 200)] },
      applyAdd
    );
    expect(res.rejected.map((r) => [r.itemId, r.code])).toEqual([[lotA, 'PRICE_CHANGED'], [lotB, 'INSUFFICIENT_STOCK'], [lotB, 'BAD_QUANTITY']]);
    expect(res.added).toHaveLength(1);
    expect(res.added[0]).toMatchObject({ itemId: lotB, quantity: 200, lineCents: 100 });
    expect(db.stock(lotA).sold).toBe(0);
    expect(db.stock(lotB).sold).toBe(200);
    expect(db.boothCartTransaction.rows[0].totalCents).toBe(2100);
  });

  it('a line the guarded decrement refuses (another sale took the cards first) is rejected, not oversold', async () => {
    const stale = req(lotB, 800); // looked fine when read
    db.item.rows.find((x) => x.id === lotB)!.stockSold = 500; // a register sale landed since
    const res = await reserveCartLotLines(db as any, { sell: fakeSell(db) }, { cartId: 'cart1', requests: [stale, req(lotA, 1000)] }, applyAdd);
    expect(res.rejected).toEqual([{ itemId: lotB, code: 'INSUFFICIENT_STOCK' }]);
    expect(db.stock(lotB).sold).toBe(500);
    expect(res.added).toHaveLength(1);
  });

  it('touches the cart only when something was added', async () => {
    const applied = jest.fn();
    const res = await reserveCartLotLines(db as any, { sell: fakeSell(db) }, { cartId: 'cart1', requests: [req(lotB, 5000)] }, applied);
    expect(res.added).toEqual([]);
    expect(applied).not.toHaveBeenCalled();
  });

  it('rolls everything back when the cart is no longer open', async () => {
    db.boothCartTransaction.rows[0].status = 'CHECKOUT';
    await expect(reserveCartLotLines(db as any, { sell: fakeSell(db) }, { cartId: 'cart1', requests: [req(lotA, 1500), req(lotB, 400)] }, applyAdd)).rejects.toBeInstanceOf(CartNotOpenError);
    expect(db.stock(lotA).sold).toBe(0);
    expect(db.stock(lotB).sold).toBe(0);
    expect(db.boothCartBulkLine.rows).toHaveLength(0);
    expect(db.boothCartTransaction.rows[0].totalCents).toBe(2000);
  });

  it('a real failure (not a refused line) aborts the whole add', async () => {
    const boom = async () => {
      throw new Error('db exploded');
    };
    await expect(reserveCartLotLines(db as any, { sell: boom as any }, { cartId: 'cart1', requests: [req(lotA, 1000)] }, applyAdd)).rejects.toThrow('db exploded');
    expect(db.boothCartBulkLine.rows).toHaveLength(0);
  });
});

describe('removeCartLotLines', () => {
  async function add() {
    return reserveCartLotLines(db as any, { sell: fakeSell(db) }, { cartId: 'cart1', requests: [req(lotA, 1500), req(lotA, 500)] }, applyAdd);
  }
  const applyRemove = (tx: any, removed: { cents: number }) =>
    tx.boothCartTransaction.updateMany({ where: { id: 'cart1', status: 'PENDING' }, data: { totalCents: { decrement: removed.cents } } }).then((r: any) => {
      if (r.count !== 1) throw new CartNotOpenError('cart closed');
    });

  it('removes one line by id and gives its cards and cents back', async () => {
    const { added } = await add();
    const out = await removeCartLotLines(db as any, { cartId: 'cart1', itemId: lotA, lineId: added[0].lineId }, applyRemove);
    expect(out).toEqual({ lines: 1, cards: 1500, cents: 1200 });
    expect(db.stock(lotA).sold).toBe(500);
    expect(db.boothCartTransaction.rows[0].totalCents).toBe(2000 + 1200 + 400 - 1200);
  });

  it('removes every reserved line of the lot when no line id is given', async () => {
    await add();
    const out = await removeCartLotLines(db as any, { cartId: 'cart1', itemId: lotA }, applyRemove);
    expect(out).toMatchObject({ lines: 2, cards: 2000, cents: 1600 });
    expect(db.stock(lotA).sold).toBe(0);
  });

  it('is a 404 for a lot that is not in the cart, and rolls back when the cart closed', async () => {
    await expect(removeCartLotLines(db as any, { cartId: 'cart1', itemId: lotB }, applyRemove)).rejects.toMatchObject({ code: 'BULK_NOT_FOUND' });
    await add();
    db.boothCartTransaction.rows[0].status = 'CHECKOUT';
    await expect(removeCartLotLines(db as any, { cartId: 'cart1', itemId: lotA }, applyRemove)).rejects.toBeInstanceOf(CartNotOpenError);
    expect(db.stock(lotA).sold).toBe(2000);
    expect(db.boothCartBulkLine.rows.every((r) => r.status === 'RESERVED')).toBe(true);
  });
});

describe('releaseAllCartLotLines and listCartLotLines', () => {
  it('gives back every reserved line once, and a second pass gives back nothing', async () => {
    await reserveCartLotLines(db as any, { sell: fakeSell(db) }, { cartId: 'cart1', requests: [req(lotA, 1500), req(lotB, 400)] }, applyAdd);
    expect((await releaseAllCartLotLines(db as any, 'cart1')).sort()).toEqual([lotA, lotB].sort());
    expect(db.stock(lotA).sold).toBe(0);
    expect(db.stock(lotB).sold).toBe(0);
    expect(await releaseAllCartLotLines(db as any, 'cart1')).toEqual([]);
    expect(db.stock(lotA).sold).toBe(0);
  });

  it('reopens a lot that the cart had sold out', async () => {
    await reserveCartLotLines(db as any, { sell: fakeSell(db) }, { cartId: 'cart1', requests: [req(lotB, 1000)] }, applyAdd);
    expect(db.stock(lotB).status).toBe('SOLD');
    await releaseAllCartLotLines(db as any, 'cart1');
    expect(db.stock(lotB)).toMatchObject({ status: 'AVAILABLE', sold: 0 });
  });

  it('lists reserved lines, optionally for one booth, oldest first', async () => {
    await reserveCartLotLines(db as any, { sell: fakeSell(db) }, { cartId: 'cart1', requests: [req(lotA, 1000, null, 'boothA'), req(lotB, 100, null, 'boothB')] }, applyAdd);
    expect((await listCartLotLines(db as any, 'cart1')).map((l) => l.vendorBoothId)).toEqual(['boothA', 'boothB']);
    expect((await listCartLotLines(db as any, 'cart1', 'boothB')).map((l) => l.itemId)).toEqual([lotB]);
  });
});

describe('settleCartLotLine', () => {
  it('writes the Purchase with the line in one transaction and never twice', async () => {
    const { added } = await reserveCartLotLines(db as any, { sell: fakeSell(db) }, { cartId: 'cart1', requests: [req(lotA, 1500)] }, applyAdd);
    const make = jest.fn(async (tx: any) => tx.purchase.create({ data: { itemId: lotA, bulkQuantity: 1500, amount: 12 } }));
    const first = await settleCartLotLine(db as any, added[0].lineId, make);
    expect(first).toBeTruthy();
    expect(db.boothCartBulkLine.rows[0]).toMatchObject({ status: 'SOLD', purchaseId: first });
    expect(await settleCartLotLine(db as any, added[0].lineId, make)).toBeNull();
    expect(make).toHaveBeenCalledTimes(1);
    expect(db.purchase.rows).toHaveLength(1);
    expect(db.stock(lotA).sold).toBe(1500);
  });

  it('a failed Purchase write rolls the line back to RESERVED', async () => {
    const { added } = await reserveCartLotLines(db as any, { sell: fakeSell(db) }, { cartId: 'cart1', requests: [req(lotA, 1500)] }, applyAdd);
    await expect(settleCartLotLine(db as any, added[0].lineId, async () => { throw new Error('write failed'); })).rejects.toThrow('write failed');
    expect(db.boothCartBulkLine.rows[0].status).toBe('RESERVED');
    expect(db.purchase.rows).toHaveLength(0);
  });

  it('a sold line is not given back by a later cart release', async () => {
    const { added } = await reserveCartLotLines(db as any, { sell: fakeSell(db) }, { cartId: 'cart1', requests: [req(lotA, 1500)] }, applyAdd);
    await settleCartLotLine(db as any, added[0].lineId, async (tx: any) => tx.purchase.create({ data: { itemId: lotA } }));
    expect(await releaseAllCartLotLines(db as any, 'cart1')).toEqual([]);
    expect(db.stock(lotA).sold).toBe(1500);
  });
});
