/**
 * bulkLotHoldService (ADR-136 Addendum B, roadmap #659): hold N cards of a lot.
 *
 * WHAT THIS PROVES (a lot of 10,000 cards at $8 per 1,000, so 1,500 cards = $12.00):
 *   - a hold takes the cards from the lot and snapshots the price; an over-hold is refused and changes nothing
 *   - expiry gives the cards back, exactly once, and never touches a hold whose invoice may still be paid
 *   - release returns the cards once (a second release is a no-op) and a stranger cannot release someone else's hold
 *   - cash conversion records an invoice and settles it; a failed settlement leaves the hold ACTIVE with the cards held
 *   - Square conversion creates the link, saves the invoice PENDING; a failed save cancels the link
 *   - a shopper holds at most one hold per lot
 */
import {
  MAX_ACTIVE_HOLDS_PER_LOT,
  SHOPPER_HOLD_MINUTES,
  convertBulkHold,
  listLotHolds,
  placeBulkHold,
  releaseBulkHold,
  sweepExpiredBulkHolds,
} from '../services/bulkLot/bulkLotHoldService';
import { FakeDb, fakeSell } from './__fixtures__/bulkLotFollowupFakes';

const ORG = { kind: 'ORGANIZER' as const, organizerId: 'org1', actorUserId: 'u_org' };
const OTHER_ORG = { kind: 'ORGANIZER' as const, organizerId: 'org2', actorUserId: 'u_other' };

let db: FakeDb;
let now: Date;
let deps: any;

function setup() {
  db = new FakeDb();
  now = new Date(Date.UTC(2026, 9, 5, 12, 0, 0));
  deps = { sell: fakeSell(db), now: () => now };
}

async function code(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO_ERROR';
  } catch (e: any) {
    return String(e.code ?? e.message);
  }
}

beforeEach(() => {
  setup();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('placeBulkHold', () => {
  it('takes the cards from the lot and snapshots the price', async () => {
    const lot = db.addLot();
    const hold = await placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 1500, customerName: 'Sam' });
    expect(hold.status).toBe('ACTIVE');
    expect(hold.quantity).toBe(1500);
    expect(hold.lineCents).toBe(1200);
    expect(hold.pricePerThousandCents).toBe(800);
    expect(db.stock(lot.id).left).toBe(8500);
  });

  it('expires at the chosen number of hours, 24 by default', async () => {
    const lot = db.addLot();
    const a = await placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 10 });
    const b = await placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 10, hours: 3 });
    expect(new Date(a.expiresAt).getTime() - now.getTime()).toBe(24 * 3600_000);
    expect(new Date(b.expiresAt).getTime() - now.getTime()).toBe(3 * 3600_000);
  });

  it('refuses more cards than are on hand and changes nothing', async () => {
    const lot = db.addLot({ stockTotal: 1000, stockSold: 400 });
    expect(await code(() => placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 601 }))).toBe('INSUFFICIENT_STOCK');
    expect(db.stock(lot.id).sold).toBe(400);
    expect(db.bulkLotHold.rows).toHaveLength(0);
  });

  it('two holds can never claim the same card, and the last cards turn the lot SOLD', async () => {
    const lot = db.addLot({ stockTotal: 100, stockSold: 0 });
    await placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 60 });
    expect(await code(() => placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 41 }))).toBe('INSUFFICIENT_STOCK');
    await placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 40 });
    expect(db.stock(lot.id)).toEqual({ total: 100, sold: 100, status: 'SOLD', left: 0 });
  });

  it('refuses a hold that rounds to less than one cent', async () => {
    const lot = db.addLot({ price: 0.01 });
    expect(await code(() => placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 1 }))).toBe('QUANTITY_TOO_SMALL');
    expect(db.stock(lot.id).sold).toBe(0);
  });

  it('rejects bad input, unknown keys, another organizer, and an item that is not a lot', async () => {
    const lot = db.addLot();
    expect(await code(() => placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 0 }))).toBe('BULK_VALIDATION');
    expect(await code(() => placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 1.5 }))).toBe('BULK_VALIDATION');
    expect(await code(() => placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 5, hours: 200 }))).toBe('BULK_VALIDATION');
    expect(await code(() => placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 5, organizerId: 'x' }))).toBe('BULK_VALIDATION');
    expect(await code(() => placeBulkHold(db as any, deps, OTHER_ORG, lot.id, { quantity: 5 }))).toBe('BULK_NOT_FOUND');
    db.item.rows.push({ id: 'plain', organizerId: 'org1', saleId: 'sale1', price: 5, status: 'AVAILABLE', stockTotal: 1, stockSold: 0 });
    expect(await code(() => placeBulkHold(db as any, deps, ORG, 'plain', { quantity: 5 }))).toBe('BULK_NOT_LOT');
    expect(db.bulkLotHold.rows).toHaveLength(0);
  });

  it('caps the active holds on one lot', async () => {
    const lot = db.addLot({ stockTotal: 100000 });
    for (let i = 0; i < MAX_ACTIVE_HOLDS_PER_LOT; i++) await placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 10 });
    expect(await code(() => placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 10 }))).toBe('BULK_HOLD_LIMIT');
  });

  it('a shopper holds for 2 hours and only one hold per lot', async () => {
    const lot = db.addLot();
    const shopper = { kind: 'SHOPPER' as const, userId: 'shopper1' };
    const hold = await placeBulkHold(db as any, deps, shopper, lot.id, { quantity: 200 });
    expect(new Date(hold.expiresAt).getTime() - now.getTime()).toBe(SHOPPER_HOLD_MINUTES * 60_000);
    expect(hold.mine).toBe(true);
    expect(await code(() => placeBulkHold(db as any, deps, shopper, lot.id, { quantity: 5 }))).toBe('BULK_HOLD_LIMIT');
    // a shopper cannot pass hours
    expect(await code(() => placeBulkHold(db as any, deps, { kind: 'SHOPPER', userId: 's2' }, lot.id, { quantity: 5, hours: 100 }))).toBe('BULK_VALIDATION');
  });
});

describe('sweepExpiredBulkHolds', () => {
  it('gives the cards of an expired hold back, once', async () => {
    const lot = db.addLot();
    await placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 1500, hours: 1 });
    await placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 500, hours: 48 });
    expect(db.stock(lot.id).left).toBe(8000);
    now = new Date(now.getTime() + 2 * 3600_000);
    const first = await sweepExpiredBulkHolds(db as any, deps);
    expect(first.expired).toBe(1);
    expect(db.stock(lot.id).left).toBe(9500);
    const second = await sweepExpiredBulkHolds(db as any, deps);
    expect(second.expired).toBe(0);
    expect(db.stock(lot.id).left).toBe(9500);
    expect(db.bulkLotHold.rows.map((h) => h.status).sort()).toEqual(['ACTIVE', 'EXPIRED']);
  });

  it('a SOLD lot comes back on sale when expiry returns its cards', async () => {
    const lot = db.addLot({ stockTotal: 100 });
    await placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 100, hours: 1 });
    expect(db.stock(lot.id).status).toBe('SOLD');
    now = new Date(now.getTime() + 2 * 3600_000);
    await sweepExpiredBulkHolds(db as any, deps);
    expect(db.stock(lot.id)).toEqual({ total: 100, sold: 0, status: 'AVAILABLE', left: 100 });
  });

  it('leaves a hold whose payment request is still open, releases it once the invoice is dead, never releases a paid one', async () => {
    const lot = db.addLot();
    const pending = await placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 100, hours: 1 });
    const dead = await placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 200, hours: 1 });
    const paid = await placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 300, hours: 1 });
    for (const [h, status] of [[pending, 'PENDING'], [dead, 'CANCELLED'], [paid, 'PAID']] as const) {
      const inv = await db.holdInvoice.create({ data: { status } });
      await db.bulkLotHold.updateMany({ where: { id: h.id }, data: { holdInvoiceId: inv.id } });
    }
    now = new Date(now.getTime() + 2 * 3600_000);
    const res = await sweepExpiredBulkHolds(db as any, deps);
    expect(res).toEqual({ examined: 3, expired: 1, waitingOnInvoice: 1, paidAnomalies: 1 });
    expect(db.stock(lot.id).left).toBe(10000 - 100 - 300);
    const status = Object.fromEntries(db.bulkLotHold.rows.map((h) => [h.id, h.status]));
    expect(status[pending.id]).toBe('ACTIVE');
    expect(status[dead.id]).toBe('EXPIRED');
    expect(status[paid.id]).toBe('ACTIVE');
  });

  it('a failure on one hold does not stop the sweep', async () => {
    const lot = db.addLot();
    await placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 100, hours: 1 });
    await placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 200, hours: 1 });
    now = new Date(now.getTime() + 2 * 3600_000);
    let calls = 0;
    const flaky: any = Object.create(db);
    flaky.$transaction = async (fn: any) => {
      if (++calls === 1) throw new Error('boom');
      return db.$transaction(fn);
    };
    const res = await sweepExpiredBulkHolds(flaky, deps);
    expect(res.expired).toBe(1);
  });
});

describe('releaseBulkHold', () => {
  it('returns the cards once and a second release changes nothing', async () => {
    const lot = db.addLot();
    const hold = await placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 1500 });
    const a = await releaseBulkHold(db as any, deps, ORG, hold.id);
    const b = await releaseBulkHold(db as any, deps, ORG, hold.id);
    expect(a.released).toBe(true);
    expect(b.released).toBe(false);
    expect(db.stock(lot.id).left).toBe(10000);
    expect(db.bulkLotHold.rows[0].status).toBe('RELEASED');
  });

  it("someone else's hold looks missing, and a shopper cannot release a hold the shop invoiced", async () => {
    const lot = db.addLot();
    const hold = await placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 50 });
    expect(await code(() => releaseBulkHold(db as any, deps, OTHER_ORG, hold.id))).toBe('BULK_HOLD_NOT_FOUND');
    expect(await code(() => releaseBulkHold(db as any, deps, { kind: 'SHOPPER', userId: 'x' }, hold.id))).toBe('BULK_HOLD_NOT_FOUND');
    const mine = await placeBulkHold(db as any, deps, { kind: 'SHOPPER', userId: 's1' }, lot.id, { quantity: 20 });
    const inv = await db.holdInvoice.create({ data: { status: 'PENDING' } });
    await db.bulkLotHold.updateMany({ where: { id: mine.id }, data: { holdInvoiceId: inv.id } });
    expect(await code(() => releaseBulkHold(db as any, deps, { kind: 'SHOPPER', userId: 's1' }, mine.id))).toBe('BULK_HOLD_HAS_INVOICE');
  });

  it('refuses to release a hold whose invoice is paid', async () => {
    const lot = db.addLot();
    const hold = await placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 50 });
    const inv = await db.holdInvoice.create({ data: { status: 'PAID' } });
    await db.bulkLotHold.updateMany({ where: { id: hold.id }, data: { holdInvoiceId: inv.id } });
    expect(await code(() => releaseBulkHold(db as any, deps, ORG, hold.id))).toBe('BULK_HOLD_NOT_ACTIVE');
    expect(db.stock(lot.id).left).toBe(9950);
  });

  it('releasing a hold with an unpaid Square link cancels the link and the invoice, and keeps the cards held when Square refuses', async () => {
    const lot = db.addLot();
    const hold = await placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 50 });
    const inv = await db.holdInvoice.create({ data: { status: 'PENDING', squarePaymentLinkId: 'link1' } });
    await db.bulkLotHold.updateMany({ where: { id: hold.id }, data: { holdInvoiceId: inv.id } });
    const fail = { ...deps, deleteSquareLink: jest.fn().mockResolvedValue({ ok: false }) };
    expect(await code(() => releaseBulkHold(db as any, fail, ORG, hold.id))).toBe('BULK_HOLD_LINK_FAILED');
    expect(db.stock(lot.id).left).toBe(9950);
    expect(db.holdInvoice.rows[0].status).toBe('PENDING');
    const good = { ...deps, deleteSquareLink: jest.fn().mockResolvedValue({ ok: true }) };
    const res = await releaseBulkHold(db as any, good, ORG, hold.id);
    expect(res.released).toBe(true);
    expect(good.deleteSquareLink).toHaveBeenCalledWith({ paymentLinkId: 'link1' });
    expect(db.holdInvoice.rows[0].status).toBe('CANCELLED');
    expect(db.stock(lot.id).left).toBe(10000);
  });
});

describe('convertBulkHold, cash', () => {
  const ctx = { organizerId: 'org1', organizerUserId: 'u_org', squareReady: false };

  it('records an invoice for the snapshot amount, settles it, and links the hold', async () => {
    const lot = db.addLot();
    const hold = await placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 1500, customerName: 'Sam' });
    const markPaid = jest.fn().mockResolvedValue({ recorded: true, alreadyPaid: false });
    const res = await convertBulkHold(db as any, { ...deps, markPaid }, ctx, hold.id, { method: 'CASH' });
    expect(res.status).toBe('PAID');
    expect(markPaid).toHaveBeenCalledWith(res.invoiceId, { processor: 'STRIPE', externalPaymentId: null }, { source: 'pos-cash' });
    const inv = db.holdInvoice.rows[0];
    expect(inv.totalAmount).toBe(1200);
    expect(inv.cashAmountCents).toBe(1200);
    expect(inv.itemIds).toEqual([lot.id]);
    expect(inv.guestName).toBe('Sam');
    expect(db.bulkLotHold.rows[0].holdInvoiceId).toBe(res.invoiceId);
  });

  it('a settlement that fails leaves the hold ACTIVE with its cards held and the invoice cancelled', async () => {
    const lot = db.addLot();
    const hold = await placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 1500 });
    const markPaid = jest.fn().mockResolvedValue({ recorded: false, alreadyPaid: false, deadInvoice: true });
    expect(await code(() => convertBulkHold(db as any, { ...deps, markPaid }, ctx, hold.id, { method: 'CASH' }))).toBe('BULK_HOLD_PAYMENT_FAILED');
    expect(db.bulkLotHold.rows[0].status).toBe('ACTIVE');
    expect(db.bulkLotHold.rows[0].holdInvoiceId ?? null).toBeNull();
    expect(db.holdInvoice.rows[0].status).toBe('CANCELLED');
    expect(db.stock(lot.id).left).toBe(8500);
    // and it can be tried again
    const ok = jest.fn().mockResolvedValue({ recorded: true, alreadyPaid: false });
    const res = await convertBulkHold(db as any, { ...deps, markPaid: ok }, ctx, hold.id, { method: 'CASH' });
    expect(res.status).toBe('PAID');
  });

  it('refuses a hold that is not active, one that already has an invoice, another organizer, and bad input', async () => {
    const lot = db.addLot();
    const hold = await placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 100 });
    const markPaid = jest.fn().mockResolvedValue({ recorded: true, alreadyPaid: false });
    expect(await code(() => convertBulkHold(db as any, { ...deps, markPaid }, { ...ctx, organizerId: 'org2' }, hold.id, { method: 'CASH' }))).toBe('BULK_HOLD_NOT_FOUND');
    expect(await code(() => convertBulkHold(db as any, { ...deps, markPaid }, ctx, hold.id, { method: 'CHEQUE' }))).toBe('BULK_VALIDATION');
    await convertBulkHold(db as any, { ...deps, markPaid }, ctx, hold.id, { method: 'CASH' });
    expect(await code(() => convertBulkHold(db as any, { ...deps, markPaid }, ctx, hold.id, { method: 'CASH' }))).toBe('BULK_HOLD_HAS_INVOICE');
    const h2 = await placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 100 });
    await releaseBulkHold(db as any, deps, ORG, h2.id);
    expect(await code(() => convertBulkHold(db as any, { ...deps, markPaid }, ctx, h2.id, { method: 'CASH' }))).toBe('BULK_HOLD_NOT_ACTIVE');
  });
});

describe('convertBulkHold, Square', () => {
  const ctx = { organizerId: 'org1', organizerUserId: 'u_org', squareReady: true };

  it('creates the link, saves a PENDING invoice with the link ids and the fee, and returns the URL', async () => {
    const lot = db.addLot();
    const hold = await placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 1500 });
    const createSquareLink = jest.fn().mockResolvedValue({ ok: true, url: 'https://sq.example/pay', paymentLinkId: 'link1', orderId: 'order1' });
    const res = await convertBulkHold(db as any, { ...deps, markPaid: jest.fn(), createSquareLink, feeCents: (c: number) => Math.round(c * 0.05) }, ctx, hold.id, { method: 'SQUARE' });
    expect(res.status).toBe('PENDING');
    expect(res.paymentUrl).toBe('https://sq.example/pay');
    expect(createSquareLink.mock.calls[0][0]).toMatchObject({ amountCents: 1200, appFeeCents: 60, holdInvoiceId: res.invoiceId });
    const inv = db.holdInvoice.rows[0];
    expect(inv).toMatchObject({ id: res.invoiceId, status: 'PENDING', processor: 'SQUARE', squarePaymentLinkId: 'link1', squareOrderId: 'order1', totalAmount: 1200, platformFeeAmount: 60, cardAmountCents: 1200 });
    expect(db.bulkLotHold.rows[0].holdInvoiceId).toBe(res.invoiceId);
    expect(db.bulkLotHold.rows[0].status).toBe('ACTIVE');
  });

  it('needs Square set up, and a link that cannot be created leaves the hold untouched', async () => {
    const lot = db.addLot();
    const hold = await placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 100 });
    expect(await code(() => convertBulkHold(db as any, { ...deps, markPaid: jest.fn() }, { ...ctx, squareReady: false }, hold.id, { method: 'SQUARE' }))).toBe('BULK_HOLD_SQUARE_UNAVAILABLE');
    const createSquareLink = jest.fn().mockResolvedValue({ ok: false, message: 'no' });
    expect(await code(() => convertBulkHold(db as any, { ...deps, markPaid: jest.fn(), createSquareLink }, ctx, hold.id, { method: 'SQUARE' }))).toBe('BULK_HOLD_PAYMENT_FAILED');
    expect(db.holdInvoice.rows).toHaveLength(0);
    expect(db.bulkLotHold.rows[0].holdInvoiceId ?? null).toBeNull();
  });

  it('a failed invoice save cancels the live link', async () => {
    const lot = db.addLot();
    const hold = await placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 100 });
    const createSquareLink = jest.fn().mockResolvedValue({ ok: true, url: 'u', paymentLinkId: 'link9', orderId: null });
    const deleteSquareLink = jest.fn().mockResolvedValue({ ok: true });
    const broken: any = Object.create(db);
    broken.$transaction = async () => {
      throw new Error('db down');
    };
    expect(await code(() => convertBulkHold(broken, { ...deps, markPaid: jest.fn(), createSquareLink, deleteSquareLink }, ctx, hold.id, { method: 'SQUARE' }))).toBe('db down');
    expect(deleteSquareLink).toHaveBeenCalledWith({ paymentLinkId: 'link9' });
  });
});

describe('listLotHolds', () => {
  it('lists active holds of the caller own lot only', async () => {
    const lot = db.addLot();
    const h = await placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 100 });
    await placeBulkHold(db as any, deps, ORG, lot.id, { quantity: 50 });
    await releaseBulkHold(db as any, deps, ORG, h.id);
    expect((await listLotHolds(db as any, { organizerId: 'org1' }, lot.id)).map((x) => x.quantity)).toEqual([50]);
    expect((await listLotHolds(db as any, { organizerId: 'org1' }, lot.id, ['ACTIVE', 'RELEASED'])).length).toBe(2);
    expect(await code(() => listLotHolds(db as any, { organizerId: 'org2' }, lot.id))).toBe('BULK_NOT_FOUND');
  });
});
