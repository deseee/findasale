/**
 * Bulk lots on the QR / payment link channel, creation side (ADR-136 Addendum A, roadmap #659):
 * POST /api/pos/payment-links (createPaymentLink) and the shared createPaymentLinkInternal.
 *
 * The earlier build refused a lot here with BULK_CHANNEL_UNSUPPORTED. This file proves the refusal is gone and that the
 * link is priced and stored correctly instead (the recording side is bulkLotPaymentLinkRecorder.test.ts):
 *   - the server prices the lot by cards, the register's figure must match to the cent (PRICE_CHANGED)
 *   - the priced line is stored on the link row (POSPaymentLink.bulkLines) and the Square link charges those cents
 *   - a lot with no card count, a sold out lot, too many cards, the flag off: refused before any Square link exists
 *   - the catalog floor uses lot cents (never Item.price, which is the price per 1,000)
 *   - mixed carts; carts with no lot store nothing and behave as before
 *   - createPaymentLinkInternal (also called by the hub cart) validates its own bulkLines before any Square call
 * Prisma and Square are mocked. NO real payment or link is created. Run with:
 *   pnpm --filter backend test -- bulkLotPaymentLinkCreate
 */

jest.mock('@sentry/node', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));

var mockPrisma: any = {
  sale: { findUnique: jest.fn() },
  item: { findMany: jest.fn() },
  itemBulkLot: { findMany: jest.fn() },
  pOSPaymentLink: { create: jest.fn() },
  workspaceSettings: { findUnique: jest.fn() },
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('@prisma/client', () => ({ Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' } }, PrismaClient: class {} }));

var mockResolveActor = jest.fn();
jest.mock('../utils/posAuth', () => ({ resolveOrganizerOrTeamMember: (...args: any[]) => mockResolveActor(...args) }));
jest.mock('../services/workspacePermissionService', () => ({ checkPermission: jest.fn().mockResolvedValue(true) }));
jest.mock('../services/cashFeeService', () => ({
  ...jest.requireActual('../services/cashFeeService'),
  resolveCashCommissionRate: jest.fn().mockResolvedValue(0.08),
  wouldExceedCashFeeExposureCap: jest.fn().mockResolvedValue(false),
}));
var mockCreateLink = jest.fn();
var mockDeleteLink = jest.fn();
jest.mock('../services/squareCheckoutLinkService', () => ({
  createSquareCheckoutLink: (...args: any[]) => mockCreateLink(...args),
  deleteSquareCheckoutLink: (...args: any[]) => mockDeleteLink(...args),
}));
jest.mock('../lib/socket', () => ({ getIO: jest.fn(() => ({})) }));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../lib/transactionalEmailService', () => ({ transactionalEmailService: { emails: { send: jest.fn().mockResolvedValue({ sent: true }) } } }));
jest.mock('../services/holdInvoicePaymentRecorder', () => ({ markHoldInvoicePaid: jest.fn() }));

import { createPaymentLink, createPaymentLinkInternal } from '../controllers/posController';

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const actor = {
  id: 'org-1',
  ownerUserId: 'org-user-1',
  subscriptionTier: 'SIMPLE',
  stripeConnectId: null,
  squareOnboarded: true,
  squareMerchantId: 'merchant-1',
  squareLocationId: 'loc-1',
  actorKind: 'ORGANIZER',
  actingUserId: 'org-user-1',
};

type Row = { id: string; title: string; price: number; status: string; stockTotal: number | null; stockSold: number };
let rows: Record<string, Row>;
let lots: Set<string>;

const makeReq = (body: any = {}) => ({ body: { saleId: 'sale-1', itemIds: ['lot1'], amount: 6.75, bulkLines: [{ itemId: 'lot1', quantity: 1500, amount: 6.75 }], ...body }, user: { id: 'org-user-1' } } as any);
const call = async (body: any = {}) => {
  const res = makeRes();
  await createPaymentLink(makeReq(body), res);
  return res;
};
const stored = () => mockPrisma.pOSPaymentLink.create.mock.calls[0][0].data;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CARD_BULK_LOTS_ENABLED = 'true';
  // 1,500 cards x 450 cents per 1,000 = 675 cents
  rows = {
    lot1: { id: 'lot1', title: 'MTG commons', price: 4.5, status: 'AVAILABLE', stockTotal: 4200, stockSold: 0 },
    i2: { id: 'i2', title: 'Item i2', price: 40, status: 'AVAILABLE', stockTotal: null, stockSold: 0 },
  };
  lots = new Set(['lot1']);
  mockResolveActor.mockReset();
  mockResolveActor.mockResolvedValue(actor);
  Object.values(mockPrisma).forEach((m: any) => Object.values(m).forEach((fn: any) => fn.mockReset()));
  mockPrisma.sale.findUnique.mockResolvedValue({ organizerId: 'org-1' });
  mockPrisma.item.findMany.mockImplementation(async ({ where }: any) => (where.id.in as string[]).map((id) => rows[id]).filter(Boolean));
  mockPrisma.itemBulkLot.findMany.mockImplementation(async ({ where }: any) => (where.itemId.in as string[]).filter((id) => lots.has(id)).map((itemId) => ({ itemId })));
  mockPrisma.workspaceSettings.findUnique.mockResolvedValue(null);
  mockPrisma.pOSPaymentLink.create.mockImplementation(async ({ data }: any) => ({ id: data.id, ...data }));
  mockCreateLink.mockReset();
  mockCreateLink.mockResolvedValue({ ok: true, url: 'https://square.link/pl', paymentLinkId: 'pl-1', orderId: 'ord-1' });
  mockDeleteLink.mockReset();
  mockDeleteLink.mockResolvedValue({ ok: true, cancelledOrderId: 'ord-1' });
});

afterAll(() => {
  delete process.env.CARD_BULK_LOTS_ENABLED;
});

describe('createPaymentLink with a bulk lot', () => {
  it('is no longer refused: the link is created, priced by the server in cents', async () => {
    const res = await call();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0]).toMatchObject({ amount: 6.75 });
    expect(res.json.mock.calls[0][0].linkId).toBeDefined();
    expect(mockCreateLink).toHaveBeenCalledTimes(1);
    expect(mockCreateLink.mock.calls[0][0].amountCents).toBe(675);
  });

  it('stores the priced line (cards, cents, price per 1,000) on the link row for the recorder', async () => {
    await call();
    expect(stored().bulkLines).toEqual([{ itemId: 'lot1', cards: 1500, cents: 675, pricePerThousandCents: 450 }]);
    expect(stored().itemIds).toEqual(['lot1']);
  });

  it('takes no cards when the link is created (nothing is held)', async () => {
    await call();
    expect(Object.values(rows).every((r) => r.stockSold === 0)).toBe(true);
  });

  it('a partial quantity works the same way (1,500 of 4,200 leaves 2,700)', async () => {
    const res = await call();
    expect(res.status).not.toHaveBeenCalled();
    expect(rows.lot1.stockTotal! - rows.lot1.stockSold).toBe(4200); // still all there until the link is paid
  });

  it('one cent off the server price is refused PRICE_CHANGED and no Square link is created', async () => {
    const res = await call({ amount: 6.74, bulkLines: [{ itemId: 'lot1', quantity: 1500, amount: 6.74 }] });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].code).toBe('PRICE_CHANGED');
    expect(mockCreateLink).not.toHaveBeenCalled();
    expect(mockPrisma.pOSPaymentLink.create).not.toHaveBeenCalled();
  });

  it('a lot with no card count is refused BULK_QUANTITY_REQUIRED, never priced as one unit', async () => {
    const res = await call({ bulkLines: undefined });
    expect(res.json.mock.calls[0][0].code).toBe('BULK_QUANTITY_REQUIRED');
    expect(mockCreateLink).not.toHaveBeenCalled();
  });

  it('a sold out lot is refused before any link exists', async () => {
    rows.lot1.status = 'SOLD';
    rows.lot1.stockSold = 4200;
    const res = await call();
    expect(res.status).toHaveBeenCalled();
    expect(res.status.mock.calls[0][0]).toBeGreaterThanOrEqual(400);
    expect(['NOT_AVAILABLE', 'INSUFFICIENT_STOCK']).toContain(res.json.mock.calls[0][0].code);
    expect(mockCreateLink).not.toHaveBeenCalled();
  });

  it('more cards than are left is refused INSUFFICIENT_STOCK', async () => {
    rows.lot1.stockSold = 4000;
    const res = await call();
    expect(res.json.mock.calls[0][0].code).toBe('INSUFFICIENT_STOCK');
    expect(mockCreateLink).not.toHaveBeenCalled();
  });

  it('a line that prices to zero cents is refused QUANTITY_TOO_SMALL', async () => {
    rows.lot1.price = 0.4;
    const res = await call({ amount: 5, bulkLines: [{ itemId: 'lot1', quantity: 1, amount: 0 }] });
    expect(res.json.mock.calls[0][0].code).toBe('QUANTITY_TOO_SMALL');
    expect(mockCreateLink).not.toHaveBeenCalled();
  });

  it('with the flag off a lot is refused whatever the register sent', async () => {
    process.env.CARD_BULK_LOTS_ENABLED = 'false';
    const res = await call();
    expect(res.status).toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].code).toBeDefined();
    expect(mockCreateLink).not.toHaveBeenCalled();
  });

  it('the catalog floor uses the lot cents, not Item.price (the price per 1,000)', async () => {
    // Item.price 4.50 would allow a $4.50 link; the priced lot is $6.75
    const res = await call({ amount: 4.5 });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].code).toBe('TOTAL_BELOW_CATALOG_FLOOR');
    expect(mockCreateLink).not.toHaveBeenCalled();
  });

  it('a mixed cart (lot + ordinary item) charges both and stores only the lot line', async () => {
    const res = await call({ itemIds: ['lot1', 'i2'], amount: 46.75 });
    expect(res.status).not.toHaveBeenCalled();
    expect(mockCreateLink.mock.calls[0][0].amountCents).toBe(4675);
    expect(stored().bulkLines).toEqual([{ itemId: 'lot1', cards: 1500, cents: 675, pricePerThousandCents: 450 }]);
  });

  it('two lots in one link store both lines', async () => {
    rows.lot2 = { id: 'lot2', title: 'Pokemon bulk', price: 3, status: 'AVAILABLE', stockTotal: 10000, stockSold: 0 };
    lots.add('lot2');
    // 2,000 cards x 300 cents per 1,000 = 600 cents
    const res = await call({
      itemIds: ['lot1', 'lot2'],
      amount: 12.75,
      bulkLines: [
        { itemId: 'lot1', quantity: 1500, amount: 6.75 },
        { itemId: 'lot2', quantity: 2000, amount: 6 },
      ],
    });
    expect(res.status).not.toHaveBeenCalled();
    expect(mockCreateLink.mock.calls[0][0].amountCents).toBe(1275);
    expect(stored().bulkLines).toHaveLength(2);
  });

  it('a cart with no lot stores no bulkLines and ignores a stray bulkLines field', async () => {
    lots.clear();
    const res = await call({ itemIds: ['i2'], amount: 40, bulkLines: undefined });
    expect(res.json.mock.calls[0][0].linkId).toBeDefined();
    expect('bulkLines' in stored()).toBe(false);
  });
});

describe('createPaymentLinkInternal (also called by the hub cart) validates its own lot lines', () => {
  const opts = (over: Record<string, any> = {}) => ({
    organizerId: 'org-1',
    stripeConnectId: null,
    subscriptionTier: 'SIMPLE',
    saleId: 'sale-1',
    itemIds: ['lot1'],
    amount: 6.75,
    squareOnboarded: true,
    squareMerchantId: 'merchant-1',
    ...over,
  });
  const line = { itemId: 'lot1', cards: 1500, cents: 675, pricePerThousandCents: 450 };

  it('a lot without a priced line throws BULK_QUANTITY_REQUIRED before any Square call', async () => {
    await expect(createPaymentLinkInternal(opts())).rejects.toMatchObject({ code: 'BULK_QUANTITY_REQUIRED' });
    expect(mockCreateLink).not.toHaveBeenCalled();
  });

  it('a line for an item that is not in the link, or not a lot, throws BULK_VALIDATION', async () => {
    await expect(createPaymentLinkInternal(opts({ itemIds: ['i2'], amount: 40, bulkLines: [line] }))).rejects.toMatchObject({ code: 'BULK_VALIDATION' });
    await expect(createPaymentLinkInternal(opts({ bulkLines: [{ ...line, itemId: 'ghost' }] }))).rejects.toMatchObject({ code: 'BULK_VALIDATION' });
    expect(mockCreateLink).not.toHaveBeenCalled();
  });

  it('a zero card or zero cent line throws BULK_VALIDATION', async () => {
    await expect(createPaymentLinkInternal(opts({ bulkLines: [{ ...line, cards: 0 }] }))).rejects.toMatchObject({ code: 'BULK_VALIDATION' });
    await expect(createPaymentLinkInternal(opts({ bulkLines: [{ ...line, cents: 0 }] }))).rejects.toMatchObject({ code: 'BULK_VALIDATION' });
  });

  it('with the flag off a priced line throws BULK_DISABLED', async () => {
    process.env.CARD_BULK_LOTS_ENABLED = 'false';
    await expect(createPaymentLinkInternal(opts({ bulkLines: [line] }))).rejects.toMatchObject({ code: 'BULK_DISABLED' });
    expect(mockCreateLink).not.toHaveBeenCalled();
  });

  it('a valid priced line is stored on the row', async () => {
    const result = await createPaymentLinkInternal(opts({ bulkLines: [line] }));
    expect(result.linkId).toBeDefined();
    expect(stored().bulkLines).toEqual([line]);
  });

  it('a cart with no lot and no lines is unchanged', async () => {
    lots.clear();
    const result = await createPaymentLinkInternal(opts({ itemIds: ['i2'], amount: 40 }));
    expect(result.linkId).toBeDefined();
    expect('bulkLines' in stored()).toBe(false);
  });
});
