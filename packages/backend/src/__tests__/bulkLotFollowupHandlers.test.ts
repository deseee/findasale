/**
 * Bulk lot follow-up handlers (ADR-136 Addendum B, roadmap #659): envelope, gate, ownership.
 *
 * WHAT THIS PROVES:
 *   - every route answers 404 BULK_DISABLED with the flag off and changes nothing
 *   - the organizer comes from the logged-in account: another organizer's lot or hold is the same 404 as a missing one
 *   - adjust, sales, refund preview, holds (place, list, release, convert) and the shopper routes use the { success, data } envelope
 *     and the { success: false, error, code } error shape, with only safe extras
 *   - refund preview gives the exact cents for N cards of one sale and refuses too many, zero and a sale of another lot
 *   - the shopper hold route needs a public lot on a published sale, and a shopper cannot release someone else's hold
 *   - a stock change tells the eBay reconcile hook, and a hook that throws never fails the request
 */
import { createBulkLotFollowupHandlers } from '../controllers/bulkLotFollowupHandlers';
import { FakeDb, fakeSell } from './__fixtures__/bulkLotFollowupFakes';

let db: any;
let lotId: string;
let notified: string[];
let calls: { place: number };

function build(env: Record<string, string> = { CARD_BULK_LOTS_ENABLED: 'true' }, over: Record<string, any> = {}) {
  const fake = new FakeDb();
  db = fake;
  db.organizer = { findUnique: async ({ where }: any) => (where.userId === 'u_org' ? { id: 'org1', userId: 'u_org', subscriptionTier: 'PRO', squareOnboarded: false, squareMerchantId: null } : where.userId === 'u_other' ? { id: 'org2', userId: 'u_other', subscriptionTier: 'PRO', squareOnboarded: false, squareMerchantId: null } : null) };
  db.sale = { findUnique: async ({ where }: any) => (where.id === 'sale1' ? { id: 'sale1', status: 'PUBLISHED' } : null) };
  lotId = fake.addLot({ stockTotal: 10000, stockSold: 0 }).id;
  notified = [];
  calls = { place: 0 };
  return createBulkLotFollowupHandlers({
    db,
    env,
    publicFilter: {},
    resolveActor: async (req: any, res: any) => {
      const id = req.user?.id === 'u_org' ? 'org1' : req.user?.id === 'u_other' ? 'org2' : null;
      if (!id) {
        res.status(401).json({ success: false, error: 'Sign in', code: 'UNAUTHORIZED' });
        return null;
      }
      return { id };
    },
    sell: fakeSell(fake) as any,
    markPaid: async () => ({} as any),
    createSquareLink: async () => ({ ok: false } as any),
    deleteSquareLink: async () => ({ ok: true }),
    feeFor: () => 0,
    afterStockChange: (id: string, why: string) => void notified.push(`${id}:${why}`),
    now: () => new Date(Date.UTC(2026, 9, 5, 12, 0, 0)),
    ...over,
  } as any);
}

function call(handler: (req: any, res: any) => Promise<unknown>, reqInit: { user?: any; params?: any; body?: any; query?: any }) {
  let status = 200;
  let body: any;
  const res: any = { status: (s: number) => ((status = s), res), json: (b: any) => ((body = b), res) };
  return handler({ user: undefined, params: {}, body: {}, query: {}, ...reqInit }, res).then(() => ({ status, body }));
}

const ORG = { id: 'u_org' };
const OTHER = { id: 'u_other' };

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('the gate', () => {
  it('answers 404 BULK_DISABLED on every route with the flag off and writes nothing', async () => {
    const h = build({});
    const routes: Array<[string, any]> = [
      ['adjust', { user: ORG, params: { itemId: lotId }, body: { reason: 'DAMAGE', cards: 5 } }],
      ['adjustments', { user: ORG, params: { itemId: lotId } }],
      ['sales', { user: ORG, params: { itemId: lotId } }],
      ['refundPreview', { user: ORG, params: { itemId: lotId }, body: { purchaseId: 'p', cards: 1 } }],
      ['listHolds', { user: ORG, params: { itemId: lotId } }],
      ['placeOrganizerHold', { user: ORG, params: { itemId: lotId }, body: { quantity: 10 } }],
      ['releaseOrganizerHold', { user: ORG, params: { holdId: 'h' } }],
      ['convertHold', { user: ORG, params: { holdId: 'h' }, body: { method: 'CASH' } }],
      ['placeShopperHold', { user: ORG, params: { itemId: lotId }, body: { quantity: 10 } }],
      ['myHolds', { user: ORG }],
      ['releaseShopperHold', { user: ORG, params: { holdId: 'h' } }],
    ];
    for (const [name, init] of routes) {
      const r = await call((h as any)[name], init);
      expect([name, r.status, r.body.code]).toEqual([name, 404, 'BULK_DISABLED']);
    }
    expect(db.stock(lotId).sold).toBe(0);
    expect(db.bulkLotAdjustment.rows).toHaveLength(0);
    expect(db.bulkLotHold.rows).toHaveLength(0);
  });

  it('answers 401 for a signed-out caller on every organizer and shopper route that needs one', async () => {
    const h = build();
    for (const name of ['adjust', 'placeOrganizerHold', 'releaseOrganizerHold', 'convertHold', 'placeShopperHold', 'myHolds', 'releaseShopperHold'] as const) {
      const r = await call(h[name] as any, { params: { itemId: lotId, holdId: 'h' }, body: {} });
      expect([name, r.status]).toEqual([name, 401]);
    }
    expect((await call(h.adjustments as any, { params: { itemId: lotId } })).status).toBe(401);
  });

  it('answers 403 when the account is not an organizer', async () => {
    const h = build();
    const r = await call(h.adjust as any, { user: { id: 'u_shopper' }, params: { itemId: lotId }, body: { reason: 'DAMAGE', cards: 1 } });
    expect(r).toMatchObject({ status: 403, body: { success: false, code: 'FORBIDDEN' } });
  });
});

describe('adjust and history', () => {
  it('adjusts, wraps the result in the envelope, notifies the eBay hook, and lists the history', async () => {
    const h = build();
    const r = await call(h.adjust as any, { user: ORG, params: { itemId: lotId }, body: { reason: 'RECOUNT', cards: 9000 } });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.adjustment).toMatchObject({ beforeCount: 10000, afterCount: 9000, reason: 'RECOUNT' });
    expect(notified).toEqual([`${lotId}:adjust`]);
    const list = await call(h.adjustments as any, { user: ORG, params: { itemId: lotId } });
    expect(list.body.data.adjustments).toHaveLength(1);
  });

  it('answers another organizer with the same 404 as a missing lot', async () => {
    const h = build();
    const other = await call(h.adjust as any, { user: OTHER, params: { itemId: lotId }, body: { reason: 'DAMAGE', cards: 1 } });
    const missing = await call(h.adjust as any, { user: ORG, params: { itemId: 'nope' }, body: { reason: 'DAMAGE', cards: 1 } });
    expect(other.status).toBe(404);
    expect(other.body).toEqual(missing.body);
    expect(db.stock(lotId).total).toBe(10000);
  });

  it('answers a bad body with 400 BULK_VALIDATION and the issues', async () => {
    const h = build();
    const r = await call(h.adjust as any, { user: ORG, params: { itemId: lotId }, body: { reason: 'RECOUNT', cards: 'many' } });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ success: false, code: 'BULK_VALIDATION' });
    expect(Array.isArray(r.body.issues)).toBe(true);
  });

  it('a hook that throws never fails the request', async () => {
    const h = build({ CARD_BULK_LOTS_ENABLED: 'true' }, { afterStockChange: () => { throw new Error('ebay down'); } });
    const r = await call(h.adjust as any, { user: ORG, params: { itemId: lotId }, body: { reason: 'DAMAGE', cards: 10 } });
    expect(r.status).toBe(200);
  });
});

describe('sales and refund preview', () => {
  function addSale(over: Record<string, any> = {}) {
    db.purchase.rows.push({ id: 'p1', itemId: lotId, amount: 12, bulkQuantity: 1500, bulkRefundedQuantity: 0, refundedAmount: 0, status: 'PAID', source: 'POS_CASH', createdAt: new Date(), ...over });
  }

  it('lists the sale rows with the cards still out', async () => {
    const h = build();
    addSale({ bulkRefundedQuantity: 500, refundedAmount: 4 });
    const r = await call(h.sales as any, { user: ORG, params: { itemId: lotId } });
    expect(r.body.data.sales).toEqual([expect.objectContaining({ purchaseId: 'p1', amountCents: 1200, refundedCents: 400, soldCards: 1500, returnedCards: 500, outstandingCards: 1000 })]);
  });

  it('gives the exact money for N cards of one sale', async () => {
    const h = build();
    addSale();
    const r = await call(h.refundPreview as any, { user: ORG, params: { itemId: lotId }, body: { purchaseId: 'p1', cards: 500 } });
    expect(r.body.data).toMatchObject({ cards: 500, cents: 400, amount: 4, isFull: false, returnedAfter: 500 });
  });

  it('refuses too many cards, zero, extra fields, a sale of another lot, and another organizer', async () => {
    const h = build();
    addSale();
    const codes: string[] = [];
    for (const body of [{ purchaseId: 'p1', cards: 1501 }, { purchaseId: 'p1', cards: 0 }, { purchaseId: 'p1', cards: 5, amount: 1 }, { purchaseId: 'nope', cards: 5 }]) {
      codes.push((await call(h.refundPreview as any, { user: ORG, params: { itemId: lotId }, body })).body.code);
    }
    expect(codes).toEqual(['BULK_REFUND_TOO_MANY', 'BULK_REFUND_BAD_CARDS', 'BULK_VALIDATION', 'BULK_NOT_FOUND']);
    const otherLot = db.addLot({ id: 'lotX' });
    db.purchase.rows[0].itemId = otherLot.id;
    expect((await call(h.refundPreview as any, { user: ORG, params: { itemId: lotId }, body: { purchaseId: 'p1', cards: 5 } })).body.code).toBe('BULK_NOT_FOUND');
    expect((await call(h.refundPreview as any, { user: OTHER, params: { itemId: lotId }, body: { purchaseId: 'p1', cards: 5 } })).status).toBe(404);
  });
});

describe('holds', () => {
  it('an organizer places, lists and releases a hold, and each stock change notifies the hook', async () => {
    const h = build();
    const placed = await call(h.placeOrganizerHold as any, { user: ORG, params: { itemId: lotId }, body: { quantity: 1500, customerName: 'Sam' } });
    expect(placed.status).toBe(201);
    expect(placed.body.data).toMatchObject({ quantity: 1500, lineCents: 1200, status: 'ACTIVE' });
    expect(db.stock(lotId).left).toBe(8500);
    const listed = await call(h.listHolds as any, { user: ORG, params: { itemId: lotId } });
    expect(listed.body.data.holds).toHaveLength(1);
    const released = await call(h.releaseOrganizerHold as any, { user: ORG, params: { holdId: placed.body.data.id } });
    expect(released.body.data.released).toBe(true);
    expect(db.stock(lotId).left).toBe(10000);
    expect(notified).toEqual([`${lotId}:hold placed`, `${lotId}:hold released`]);
  });

  it('a hold over what is on hand is refused with the cards left and nothing taken', async () => {
    const h = build();
    const r = await call(h.placeOrganizerHold as any, { user: ORG, params: { itemId: lotId }, body: { quantity: 20000 } });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.body.success).toBe(false);
    expect(db.stock(lotId).sold).toBe(0);
  });

  it('another organizer cannot release or convert a hold', async () => {
    const h = build();
    const placed = await call(h.placeOrganizerHold as any, { user: ORG, params: { itemId: lotId }, body: { quantity: 100 } });
    const id = placed.body.data.id;
    const rel = await call(h.releaseOrganizerHold as any, { user: OTHER, params: { holdId: id } });
    expect(rel.status).toBe(404);
    const conv = await call(h.convertHold as any, { user: OTHER, params: { holdId: id }, body: { method: 'CASH' } });
    expect(conv.status).toBe(404);
    expect(db.bulkLotHold.rows[0].status).toBe('ACTIVE');
  });

  it('a Square conversion without Square set up is refused and the hold stays active', async () => {
    const h = build();
    const placed = await call(h.placeOrganizerHold as any, { user: ORG, params: { itemId: lotId }, body: { quantity: 100 } });
    const r = await call(h.convertHold as any, { user: ORG, params: { holdId: placed.body.data.id }, body: { method: 'SQUARE' } });
    expect(r.body).toMatchObject({ success: false, code: 'BULK_HOLD_SQUARE_UNAVAILABLE' });
    expect(db.bulkLotHold.rows[0].status).toBe('ACTIVE');
  });
});

describe('shopper routes', () => {
  it('a shopper holds cards of a public lot, sees the hold, and releases only their own', async () => {
    const h = build();
    const placed = await call(h.placeShopperHold as any, { user: { id: 'u_shop1' }, params: { itemId: lotId }, body: { quantity: 500 } });
    expect(placed.status).toBe(201);
    expect(placed.body.data).toMatchObject({ quantity: 500, status: 'ACTIVE' });
    const mine = await call(h.myHolds as any, { user: { id: 'u_shop1' } });
    expect(mine.body.data.holds).toHaveLength(1);
    const theirs = await call(h.myHolds as any, { user: { id: 'u_shop2' } });
    expect(theirs.body.data.holds).toHaveLength(0);
    const stranger = await call(h.releaseShopperHold as any, { user: { id: 'u_shop2' }, params: { holdId: placed.body.data.id } });
    expect(stranger.status).toBe(404);
    expect(db.bulkLotHold.rows[0].status).toBe('ACTIVE');
    const own = await call(h.releaseShopperHold as any, { user: { id: 'u_shop1' }, params: { holdId: placed.body.data.id } });
    expect(own.body.data.released).toBe(true);
    expect(db.stock(lotId).sold).toBe(0);
  });

  it('refuses a hold on a lot whose sale is not published', async () => {
    const h = build();
    db.sale = { findUnique: async () => ({ id: 'sale1', status: 'DRAFT' }) };
    const r = await call(h.placeShopperHold as any, { user: { id: 'u_shop1' }, params: { itemId: lotId }, body: { quantity: 5 } });
    expect(r.status).toBe(404);
    expect(db.bulkLotHold.rows).toHaveLength(0);
  });
});
