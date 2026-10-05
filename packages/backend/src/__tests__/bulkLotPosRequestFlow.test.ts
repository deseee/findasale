/**
 * Bulk lots on the POS card channels that live in posPaymentController.ts (ADR-136 Addendum A, roadmap #659):
 * the phone payment request (createPaymentRequest + confirmPaymentRequest) and the manual card entry.
 *
 * Covers, with every dependency mocked (no database, no Square, no network, NO real payment):
 *   createPaymentRequest      server prices the lot by cards, stores the priced lines, PRICE_CHANGED / missing quantity /
 *                             flag off are refused before a request row exists, the catalog floor uses lot cents
 *   confirmPaymentRequest     cards come out inside the ONE fulfillment transaction, lots first and in item id order;
 *                             a lot gone before the card is charged is refused with "No card was charged";
 *                             a lot lost after capture rolls everything back and goes down the auto-refund path;
 *                             a replay and a lost compare-and-swap change nothing
 *   manualCardPayment         one transaction takes the cards and writes every row; replay; the lost race after capture is
 *                             refunded in full (409 BULK_SOLD_OUT_AFTER_PAYMENT); a failed write rolls the cards back and
 *                             answers 500 BULK_RECORD_FAILED without a refund; mixed cart; legacy carts untouched; receipt wording
 *
 * The transaction mock snapshots the in-memory items and restores them when the callback throws, which is what a real
 * rollback does. The SQL of the guarded decrement needs a real database and is covered elsewhere only by shape.
 * Run with: pnpm --filter backend test -- bulkLotPosRequestFlow
 */

jest.mock('../lib/prisma', () => {
  const p: any = {
    sale: { findUnique: jest.fn() },
    item: { findMany: jest.fn() },
    itemBulkLot: { findMany: jest.fn() },
    itemReservation: { updateMany: jest.fn() },
    purchase: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
    user: { findUnique: jest.fn() },
    organizer: { findUnique: jest.fn() },
    pOSPaymentRequest: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
  };
  return { prisma: p };
});
jest.mock('@prisma/client', () => ({
  Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' } },
  PrismaClient: class {},
}));

var mockCreateAndCapturePayment = jest.fn();
var mockPreflightAccountStatus = jest.fn();
var mockAccrueSplit = jest.fn();
var mockSellItemUnits = jest.fn();
var mockSellInTx = jest.fn();
var mockRefundFailed = jest.fn();
var mockCreateNotification = jest.fn();
var mockResolveOrganizer = jest.fn();
var mockResolveDiscount = jest.fn();
var mockSettleOversold = jest.fn();
var mockNotifyOversold = jest.fn();
var mockEmailSend = jest.fn();
var mockEmit = jest.fn();

jest.mock('../services/squarePosPaymentAdapter', () => ({
  preflightAccountStatus: (...a: any[]) => mockPreflightAccountStatus(...a),
  createAndCapturePayment: (...a: any[]) => mockCreateAndCapturePayment(...a),
  createAndCaptureSandboxPayment: jest.fn(),
}));
jest.mock('../services/squareRefundService', () => ({
  refundFailedPosFulfillment: (...a: any[]) => mockRefundFailed(...a),
}));
jest.mock('../services/stripePosPaymentAdapter', () => ({}));
jest.mock('../utils/posAuth', () => ({ resolveOrganizerOrTeamMember: (...a: any[]) => mockResolveOrganizer(...a) }));
jest.mock('../services/posDiscountService', () => ({ resolvePosDiscount: (...a: any[]) => mockResolveDiscount(...a) }));
jest.mock('../services/cashFeeService', () => ({
  ...jest.requireActual('../services/cashFeeService'),
  accrueSplitCashLegOnce: (...a: any[]) => mockAccrueSplit(...a),
  applyCashDebtToAppFee: jest.fn(async ({ baseAppFeeCents }: any) => ({ appFeeCents: baseAppFeeCents, debtAppliedCents: 0 })),
  settleCashDebtCollection: jest.fn().mockResolvedValue(undefined),
  releaseCashDebtClaim: jest.fn().mockResolvedValue(undefined),
  wouldExceedCashFeeExposureCap: jest.fn().mockResolvedValue(false),
  accrueCashFeeBalance: jest.fn().mockResolvedValue(0),
}));
jest.mock('../services/oversoldPaymentRefundService', () => ({
  ...jest.requireActual('../services/oversoldPaymentRefundService'),
  settleOversoldPayment: (...a: any[]) => mockSettleOversold(...a),
  notifyOversoldSettlement: (...a: any[]) => mockNotifyOversold(...a),
}));
jest.mock('@sentry/node', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));
jest.mock('../lib/socket', () => ({ getIO: jest.fn(() => ({ to: jest.fn().mockReturnValue({ emit: (...a: any[]) => mockEmit(...a) }) })) }));
jest.mock('../lib/notificationService', () => ({ createNotification: (...a: any[]) => mockCreateNotification(...a) }));
jest.mock('../lib/transactionalEmailService', () => ({
  transactionalEmailService: { send: jest.fn(), sendPosReceipt: jest.fn(), emails: { send: (...a: any[]) => mockEmailSend(...a) } },
}));
jest.mock('../services/xpService', () => ({ awardXp: jest.fn(), applyHuntPassMultiplier: jest.fn(), XP_AWARDS: {} }));
jest.mock('../services/achievementService', () => ({ checkAndAward: jest.fn() }));
jest.mock('../services/squarePurchaseEngagementService', () => ({ fireSquarePurchaseEngagement: jest.fn() }));
jest.mock('../controllers/ebayController', () => ({ endEbayListingIfExists: jest.fn() }));
jest.mock('../services/shopifyService', () => ({ markShopifyItemSold: jest.fn() }));
jest.mock('../services/marketplace/discogsListingConnector', () => ({ withdrawDiscogsListingIfExists: jest.fn() }));
jest.mock('../services/marketplace/reverbConnector', () => ({ withdrawReverbListingIfExists: jest.fn() }));
jest.mock('../services/marketplace/etsyConnector', () => ({ withdrawEtsyListingIfExists: jest.fn().mockResolvedValue('skipped') }));
jest.mock('../services/facebookNudgeService', () => ({ notifyFacebookExportedItemSold: jest.fn() }));
jest.mock('../services/marketplaceStockSyncService', () => ({ syncMarketplaceStock: jest.fn() }));
jest.mock('../services/itemStockService', () => {
  class InsufficientStockError extends Error {
    constructor(message?: string) {
      super(message ?? 'insufficient');
      this.name = 'InsufficientStockError';
    }
  }
  return {
    sellItemUnits: (...a: any[]) => mockSellItemUnits(...a),
    sellItemUnitsInTransaction: (...a: any[]) => mockSellInTx(...a),
    InsufficientStockError,
  };
});
jest.mock('../services/connectAccountGuard', () => ({ isPayoutFlaggedForReview: jest.fn().mockResolvedValue(false) }));
jest.mock('../services/checkoutGuard', () => ({
  assertCheckoutAllowed: jest.fn().mockResolvedValue(undefined),
  recordSuspectedSignal: jest.fn().mockResolvedValue(undefined),
  CheckoutGuardError: class CheckoutGuardError extends Error {},
}));

import { prisma } from '../lib/prisma';
import { confirmPaymentRequest, createPaymentRequest, manualCardPayment } from '../controllers/posPaymentController';

const db: any = prisma;
const Sentry = jest.requireMock('@sentry/node');
const { InsufficientStockError } = jest.requireMock('../services/itemStockService');
const { endEbayListingIfExists } = jest.requireMock('../controllers/ebayController');
const { syncMarketplaceStock } = jest.requireMock('../services/marketplaceStockSyncService');
const { releaseCashDebtClaim } = jest.requireMock('../services/cashFeeService');

// ---------------------------------------------------------------------------
// in-memory world
// ---------------------------------------------------------------------------

type World = { items: Record<string, any>; lots: Set<string> };
let world: World;

const lotRow = (id: string, over: Record<string, any> = {}) => ({
  id,
  title: 'MTG commons',
  status: 'AVAILABLE',
  draftStatus: null,
  price: 4.5, // dollars per 1,000 cards => 450 cents per 1,000
  stockTotal: 4200,
  stockSold: 0,
  saleId: 'sale1',
  ...over,
});
const plainRow = (id: string, price: number, over: Record<string, any> = {}) => ({
  id,
  title: `Item ${id}`,
  status: 'AVAILABLE',
  draftStatus: null,
  price,
  stockTotal: null,
  stockSold: 0,
  saleId: 'sale1',
  ...over,
});
// 1,500 cards x 450 cents per 1,000 = 675 cents exactly
const LOT_CENTS_1500 = 675;
const storedLine = (itemId = 'lot1', cards = 1500, cents = LOT_CENTS_1500) => ({ itemId, cards, cents, pricePerThousandCents: 450 });

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.set = jest.fn().mockReturnValue(res);
  return res;
};

const organizer = {
  id: 'org1',
  ownerUserId: 'owner1',
  userId: 'owner1',
  actingUserId: 'owner1',
  subscriptionTier: 'SIMPLE',
  referralDiscountExpiry: null,
  squareOnboarded: true,
  squareMerchantId: 'merchant1',
  squareLocationId: 'loc1',
  cashFeeBalance: 0,
};

const snapshotItems = () => JSON.parse(JSON.stringify(world.items));
const restoreItems = (snap: Record<string, any>) => {
  for (const id of Object.keys(snap)) Object.assign(world.items[id], snap[id]);
};

beforeEach(() => {
  jest.resetAllMocks();
  process.env.CARD_BULK_LOTS_ENABLED = 'true';
  world = { items: { lot1: lotRow('lot1'), i2: plainRow('i2', 40) }, lots: new Set(['lot1']) };

  db.item.findMany.mockImplementation(async ({ where }: any) => (where.id.in as string[]).map((id) => world.items[id]).filter(Boolean));
  db.itemBulkLot.findMany.mockImplementation(async ({ where }: any) =>
    (where.itemId.in as string[]).filter((id) => world.lots.has(id)).map((itemId) => ({ itemId }))
  );
  db.$transaction.mockImplementation(async (cb: any) => {
    const snap = snapshotItems();
    try {
      return await cb(db);
    } catch (err) {
      restoreItems(snap);
      throw err;
    }
  });
  db.$executeRaw.mockResolvedValue(1);
  db.purchase.findMany.mockResolvedValue([]);
  db.purchase.findFirst.mockResolvedValue({ id: 'pur_first' });
  let n = 0;
  db.purchase.create.mockImplementation(async () => ({ id: `pur${++n}` }));
  db.itemReservation.updateMany.mockResolvedValue({ count: 0 });
  db.organizer.findUnique.mockResolvedValue({ ...organizer, stripeConnectId: null });
  db.sale.findUnique.mockResolvedValue({ id: 'sale1', status: 'PUBLISHED', organizerId: 'org1', title: 'Sale', organizer: { userId: 'owner1', isUnmanagedListing: false } });
  db.user.findUnique.mockResolvedValue({ id: 'shopper1', name: 'Shopper', email: 's@example.com' });
  db.pOSPaymentRequest.findFirst.mockResolvedValue(null);
  db.pOSPaymentRequest.create.mockImplementation(async ({ data }: any) => ({ id: 'req_new', ...data }));
  db.pOSPaymentRequest.updateMany.mockResolvedValue({ count: 1 });
  db.pOSPaymentRequest.update.mockResolvedValue({});

  mockResolveOrganizer.mockResolvedValue(organizer);
  mockResolveDiscount.mockResolvedValue({ ok: true, discountAmountCents: 0 });
  mockPreflightAccountStatus.mockResolvedValue({ ok: true, accessToken: 'tok', squareLocationId: 'loc1' });
  mockCreateAndCapturePayment.mockResolvedValue({ ok: true, captured: true, paymentId: 'sq_pay_1' });
  mockAccrueSplit.mockResolvedValue({ accrued: 3.2, duplicate: false });
  mockSellItemUnits.mockResolvedValue({ fullySoldOut: true, remainingStock: 0 });
  mockSellInTx.mockImplementation(async (_tx: any, id: string, units: number) => {
    const it = world.items[id];
    if (!it) throw new Error(`Item ${id} not found`);
    const total = it.stockTotal ?? 1;
    if ((it.stockSold ?? 0) + units > total) throw new InsufficientStockError();
    it.stockSold = (it.stockSold ?? 0) + units;
    if (it.stockSold >= total) it.status = 'SOLD';
    return { fullySoldOut: it.stockSold >= total, remainingStock: total - it.stockSold };
  });
  mockCreateNotification.mockResolvedValue(undefined);
  mockRefundFailed.mockResolvedValue({ status: 'REFUNDED', squareRefundId: 'sqr_1' });
  mockSettleOversold.mockResolvedValue({ status: 'REFUNDED', refundCents: 0 });
  mockNotifyOversold.mockResolvedValue(undefined);
  mockEmailSend.mockResolvedValue(undefined);
  releaseCashDebtClaim.mockResolvedValue(undefined);
  jest.requireMock('../services/cashFeeService').settleCashDebtCollection.mockResolvedValue(undefined);
  jest.requireMock('../services/cashFeeService').wouldExceedCashFeeExposureCap.mockResolvedValue(false);
  jest.requireMock('../services/cashFeeService').applyCashDebtToAppFee.mockImplementation(async ({ baseAppFeeCents }: any) => ({ appFeeCents: baseAppFeeCents, debtAppliedCents: 0 }));
  jest.requireMock('../services/connectAccountGuard').isPayoutFlaggedForReview.mockResolvedValue(false);
  jest.requireMock('../services/checkoutGuard').assertCheckoutAllowed.mockResolvedValue(undefined);
  jest.requireMock('../services/checkoutGuard').recordSuspectedSignal.mockResolvedValue(undefined);
  jest.requireMock('../lib/socket').getIO.mockImplementation(() => ({ to: jest.fn().mockReturnValue({ emit: (...a: any[]) => mockEmit(...a) }) }));
  for (const mod of [
    jest.requireMock('../controllers/ebayController').endEbayListingIfExists,
    jest.requireMock('../services/shopifyService').markShopifyItemSold,
    jest.requireMock('../services/marketplace/discogsListingConnector').withdrawDiscogsListingIfExists,
    jest.requireMock('../services/marketplace/reverbConnector').withdrawReverbListingIfExists,
    jest.requireMock('../services/facebookNudgeService').notifyFacebookExportedItemSold,
    jest.requireMock('../services/marketplaceStockSyncService').syncMarketplaceStock,
    jest.requireMock('../services/achievementService').checkAndAward,
    jest.requireMock('../services/xpService').awardXp,
  ]) {
    mod.mockResolvedValue(undefined);
  }
  jest.requireMock('../services/xpService').applyHuntPassMultiplier.mockImplementation(async (_u: string, n: number) => n);
});

afterAll(() => {
  delete process.env.CARD_BULK_LOTS_ENABLED;
});

const created = () => db.purchase.create.mock.calls.map((c: any[]) => c[0].data);

// ---------------------------------------------------------------------------
// createPaymentRequest
// ---------------------------------------------------------------------------

describe('createPaymentRequest with a bulk lot', () => {
  const call = async (body: Record<string, any>) => {
    const res = makeRes();
    await createPaymentRequest({ body: { shopperUserId: 'shopper1', saleId: 'sale1', itemIds: ['lot1'], totalAmountCents: LOT_CENTS_1500, ...body }, headers: {}, user: { id: 'owner1' } } as any, res);
    return res;
  };
  const lotBody = (over: Record<string, any> = {}) => ({ bulkLines: [{ itemId: 'lot1', quantity: 1500, amount: 6.75 }], ...over });

  it('prices the lot by cards on the server and stores the priced line on the request', async () => {
    const res = await call(lotBody());
    expect(res.status).toHaveBeenCalledWith(201);
    expect(db.pOSPaymentRequest.create).toHaveBeenCalledTimes(1);
    const data = db.pOSPaymentRequest.create.mock.calls[0][0].data;
    expect(data.bulkLines).toEqual([storedLine()]);
    expect(data.itemIds).toEqual(['lot1']);
    expect(data.totalAmountCents).toBe(675);
  });

  it('takes no cards and makes no charge at request time (nothing is held)', async () => {
    await call(lotBody());
    expect(mockSellInTx).not.toHaveBeenCalled();
    expect(mockSellItemUnits).not.toHaveBeenCalled();
    expect(mockCreateAndCapturePayment).not.toHaveBeenCalled();
  });

  it('shows the cards to the shopper ("MTG commons (1,500 cards)")', async () => {
    await call(lotBody());
    const payload = mockEmit.mock.calls[0][1];
    expect(payload.itemNames).toEqual(['MTG commons (1,500 cards)']);
  });

  it('a cart with no lot stores no bulkLines at all', async () => {
    const res = await call({ itemIds: ['i2'], totalAmountCents: 4000 });
    expect(res.status).toHaveBeenCalledWith(201);
    expect('bulkLines' in db.pOSPaymentRequest.create.mock.calls[0][0].data).toBe(false);
  });

  it('a mixed cart stores only the lot line and the register total covers lot plus item', async () => {
    const res = await call({ itemIds: ['lot1', 'i2'], totalAmountCents: 4675, ...lotBody() });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(db.pOSPaymentRequest.create.mock.calls[0][0].data.bulkLines).toEqual([storedLine()]);
  });

  it('one cent off the server price is refused PRICE_CHANGED before any request row exists', async () => {
    const res = await call({ bulkLines: [{ itemId: 'lot1', quantity: 1500, amount: 6.74 }] });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0]).toMatchObject({ code: 'PRICE_CHANGED' });
    expect(db.pOSPaymentRequest.create).not.toHaveBeenCalled();
  });

  it('a lot without a card count is refused, never priced as one unit', async () => {
    const res = await call({ bulkLines: [] });
    expect(res.json.mock.calls[0][0]).toMatchObject({ code: 'BULK_QUANTITY_REQUIRED' });
    expect(db.pOSPaymentRequest.create).not.toHaveBeenCalled();
  });

  it('more cards than are left is refused INSUFFICIENT_STOCK', async () => {
    world.items.lot1.stockSold = 4000; // 200 left
    const res = await call(lotBody());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0]).toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(db.pOSPaymentRequest.create).not.toHaveBeenCalled();
  });

  it('a one-card line that rounds to zero cents is refused QUANTITY_TOO_SMALL', async () => {
    world.items.lot1.price = 0.4; // 40 cents per 1,000: 1 card = 0.04 cents = 0
    const res = await call({ bulkLines: [{ itemId: 'lot1', quantity: 1, amount: 0 }] });
    expect(res.json.mock.calls[0][0]).toMatchObject({ code: 'QUANTITY_TOO_SMALL' });
    expect(db.pOSPaymentRequest.create).not.toHaveBeenCalled();
  });

  it('with the flag off a lot is refused, whatever the register sent', async () => {
    process.env.CARD_BULK_LOTS_ENABLED = 'false';
    const res = await call(lotBody());
    expect(res.status).toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].code).toBeDefined();
    expect(db.pOSPaymentRequest.create).not.toHaveBeenCalled();
  });

  it('the catalog floor uses the lot cents, not Item.price (the price per 1,000)', async () => {
    // Item.price 4.5 would put the floor at 449 cents; the priced lot is 675, so 600 is a lowballed total.
    const res = await call(lotBody({ totalAmountCents: 600 }));
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/does not match catalog pricing/i);
    expect(db.pOSPaymentRequest.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// confirmPaymentRequest
// ---------------------------------------------------------------------------

const baseRequest = (over: Record<string, any> = {}) => ({
  id: 'req1',
  status: 'ACCEPTED',
  processor: 'SQUARE',
  shopperUserId: 'shopper1',
  organizerUserId: 'owner1',
  saleId: 'sale1',
  itemIds: ['lot1', 'i2'],
  totalAmountCents: 4675,
  cardAmountCents: 4675,
  isSplitPayment: false,
  cashAmountCents: null,
  platformFeeCents: 374,
  squarePaymentId: null,
  discountAmountCents: 0,
  bulkLines: [storedLine()],
  shopper: { id: 'shopper1', email: 's@example.com', name: 'Shopper' },
  organizer: { id: 'org1', name: 'Org' },
  sale: { id: 'sale1', title: 'Sale' },
  ...over,
});

const confirm = async () => {
  const res = makeRes();
  await confirmPaymentRequest({ params: { requestId: 'req1' }, body: { sourceId: 'cnon:card-nonce-1' }, headers: {}, user: { id: 'shopper1' } } as any, res);
  return res;
};

describe('confirmPaymentRequest with a bulk lot', () => {
  beforeEach(() => {
    db.pOSPaymentRequest.findUnique.mockResolvedValue(baseRequest());
  });

  it('takes the cards, flips PAID and writes every row in ONE transaction; lot row carries cards and priced amount', async () => {
    const res = await confirm();
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: true });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(mockSellInTx).toHaveBeenCalledTimes(1);
    expect(mockSellInTx.mock.calls[0]).toEqual([db, 'lot1', 1500]);
    expect(world.items.lot1.stockSold).toBe(1500);
    expect(world.items.lot1.status).toBe('AVAILABLE'); // a partial sale leaves the lot on sale

    const rows = created();
    expect(rows).toHaveLength(2);
    const lot = rows.find((r: any) => r.itemId === 'lot1');
    const plain = rows.find((r: any) => r.itemId === 'i2');
    expect(lot).toMatchObject({ bulkQuantity: 1500, amount: 6.75, status: 'PAID', source: 'POS' });
    expect(plain.amount).toBe(40);
    expect('bulkQuantity' in plain).toBe(false);
    expect(Math.round((lot.amount + plain.amount) * 100)).toBe(4675);
  });

  it('lots are taken before ordinary items, ordinary items through the transaction client', async () => {
    const order: string[] = [];
    mockSellInTx.mockImplementation(async (_tx: any, id: string) => {
      order.push(`lot:${id}`);
      return { fullySoldOut: false, remainingStock: 2700 };
    });
    mockSellItemUnits.mockImplementation(async (id: string) => {
      order.push(`item:${id}`);
      return { fullySoldOut: true, remainingStock: 0 };
    });
    await confirm();
    expect(order).toEqual(['lot:lot1', 'item:i2']);
    expect(mockSellItemUnits.mock.calls[0]).toEqual(['i2', 1, db]);
  });

  it('two lots are taken in item id order whatever the order of the stored lines', async () => {
    world.items.lotA = lotRow('lotA', { title: 'Lot A' });
    world.items.lotB = lotRow('lotB', { title: 'Lot B' });
    world.lots.add('lotA').add('lotB');
    db.pOSPaymentRequest.findUnique.mockResolvedValue(
      baseRequest({ itemIds: ['lotB', 'lotA'], totalAmountCents: 1350, cardAmountCents: 1350, platformFeeCents: 108, bulkLines: [storedLine('lotB'), storedLine('lotA')] })
    );
    await confirm();
    expect(mockSellInTx.mock.calls.map((c: any[]) => c[1])).toEqual(['lotA', 'lotB']);
    expect(created().map((r: any) => r.bulkQuantity)).toEqual([1500, 1500]);
  });

  it('marketplace follow-ups for the lot run only after the transaction committed', async () => {
    await confirm();
    expect(syncMarketplaceStock).toHaveBeenCalled(); // a partial sale revises the other channels' count
    expect(endEbayListingIfExists).toHaveBeenCalledWith('i2'); // the single-unit item is still withdrawn
  });

  it('a lot sold out BEFORE the card is charged is refused with "No card was charged"', async () => {
    world.items.lot1.stockSold = 4200;
    world.items.lot1.status = 'SOLD';
    const res = await confirm();
    expect(res.status).toHaveBeenCalledWith(409);
    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({ success: false, charged: false });
    expect(body.message).toMatch(/No card was charged\./);
    expect(mockCreateAndCapturePayment).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.pOSPaymentRequest.updateMany).not.toHaveBeenCalled(); // stays ACCEPTED, retryable after a restock
  });

  it('fewer cards left than the request holds is refused before the charge', async () => {
    world.items.lot1.stockSold = 3000; // 1,200 left, 1,500 wanted
    const res = await confirm();
    expect(res.json.mock.calls[0][0]).toMatchObject({ charged: false, code: 'INSUFFICIENT_STOCK' });
    expect(mockCreateAndCapturePayment).not.toHaveBeenCalled();
  });

  it('a lot with no stored card count is refused before the charge (never sold as one unit)', async () => {
    db.pOSPaymentRequest.findUnique.mockResolvedValue(baseRequest({ bulkLines: null }));
    const res = await confirm();
    expect(res.json.mock.calls[0][0]).toMatchObject({ charged: false, code: 'BULK_QUANTITY_REQUIRED' });
    expect(mockCreateAndCapturePayment).not.toHaveBeenCalled();
    expect(mockSellInTx).not.toHaveBeenCalled();
  });

  it('a damaged stored line is dropped and so counts as missing (refused, not sold as one unit)', async () => {
    db.pOSPaymentRequest.findUnique.mockResolvedValue(baseRequest({ bulkLines: [{ itemId: 'lot1', cards: -5, cents: 'x' }] }));
    const res = await confirm();
    expect(res.json.mock.calls[0][0]).toMatchObject({ charged: false, code: 'BULK_QUANTITY_REQUIRED' });
    expect(mockCreateAndCapturePayment).not.toHaveBeenCalled();
  });

  it('with the flag switched off after the request was made, the stored lot is refused before the charge', async () => {
    process.env.CARD_BULK_LOTS_ENABLED = 'false';
    const res = await confirm();
    expect(res.json.mock.calls[0][0]).toMatchObject({ charged: false });
    expect(res.json.mock.calls[0][0].message).toMatch(/No card was charged\./);
    expect(mockCreateAndCapturePayment).not.toHaveBeenCalled();
  });

  it('the last cards are lost AFTER capture: the transaction rolls back, the request parks FULFILLMENT_FAILED and is auto-refunded', async () => {
    // pre-check passes (cards look available), then another sale takes them before the guarded decrement runs
    mockSellInTx.mockRejectedValueOnce(new InsufficientStockError());
    const res = await confirm();

    expect(mockCreateAndCapturePayment).toHaveBeenCalledTimes(1); // the card WAS charged
    expect(db.purchase.create).not.toHaveBeenCalled(); // nothing recorded
    expect(world.items.lot1.stockSold).toBe(0); // nothing taken
    expect(db.pOSPaymentRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'req1', status: { in: ['ACCEPTED', 'EXPIRED', 'CANCELLED', 'DECLINED'] } },
      data: { status: 'FULFILLMENT_FAILED' },
    });
    expect(mockRefundFailed).toHaveBeenCalledWith('req1');
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: false, code: 'ITEM_UNAVAILABLE', refunded: true });
    expect(mockSellItemUnits).not.toHaveBeenCalled(); // the ordinary item was never touched
    expect(endEbayListingIfExists).not.toHaveBeenCalled();
  });

  it('the second lot sold out gives the first lot back (one transaction), then refunds', async () => {
    world.items.lotA = lotRow('lotA', { title: 'Lot A' });
    world.items.lotB = lotRow('lotB', { title: 'Lot B', stockSold: 4000 }); // only 200 left
    world.lots.add('lotA').add('lotB');
    db.pOSPaymentRequest.findUnique.mockResolvedValue(
      baseRequest({ itemIds: ['lotA', 'lotB'], totalAmountCents: 1350, cardAmountCents: 1350, platformFeeCents: 108, bulkLines: [storedLine('lotA'), storedLine('lotB')] })
    );
    // The pre-check would catch lot B's missing cards, so show it cards until the decrement runs (a race between the two).
    const real = world.items.lotB;
    db.item.findMany.mockImplementation(async ({ where, select }: any) =>
      (where.id.in as string[]).map((id) => (id === 'lotB' && select?.stockSold ? { ...real, stockSold: 0 } : world.items[id])).filter(Boolean)
    );
    const res = await confirm();
    expect(mockSellInTx.mock.calls.map((c: any[]) => c[1])).toEqual(['lotA', 'lotB']);
    expect(world.items.lotA.stockSold).toBe(0); // rolled back with the transaction
    expect(world.items.lotA.status).toBe('AVAILABLE');
    expect(db.purchase.create).not.toHaveBeenCalled();
    expect(mockRefundFailed).toHaveBeenCalledWith('req1');
    expect(res.json.mock.calls[0][0]).toMatchObject({ code: 'ITEM_UNAVAILABLE', refunded: true });
  });

  it('a transient database error while recording leaves the request retryable and takes no cards', async () => {
    db.purchase.create.mockRejectedValueOnce(new Error('db blip'));
    const res = await confirm();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0]).toMatchObject({ charged: true });
    expect(world.items.lot1.stockSold).toBe(0); // the decrement rolled back with the failed write
    expect(mockRefundFailed).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it('a retried confirm after that error records once: the cards are taken exactly once', async () => {
    db.purchase.create.mockRejectedValueOnce(new Error('db blip'));
    await confirm();
    expect(world.items.lot1.stockSold).toBe(0);
    const res = await confirm(); // the request is still ACCEPTED, so the second confirm records it
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: true });
    expect(world.items.lot1.stockSold).toBe(1500); // taken exactly once, not 3,000
  });

  it('a replay on an already PAID request takes no cards and writes nothing', async () => {
    db.pOSPaymentRequest.findUnique.mockResolvedValue(baseRequest({ status: 'PAID' }));
    const res = await confirm();
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: true, message: 'Payment already completed' });
    expect(mockSellInTx).not.toHaveBeenCalled();
    expect(db.purchase.create).not.toHaveBeenCalled();
    expect(mockCreateAndCapturePayment).not.toHaveBeenCalled();
  });

  it('a confirm that loses the compare-and-swap to a concurrent confirm takes no cards', async () => {
    db.pOSPaymentRequest.updateMany.mockResolvedValue({ count: 0 });
    db.pOSPaymentRequest.findUnique.mockResolvedValueOnce(baseRequest()).mockResolvedValueOnce({ status: 'PAID' });
    const res = await confirm();
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: true, message: 'Payment already completed' });
    expect(mockSellInTx).not.toHaveBeenCalled();
    expect(db.purchase.create).not.toHaveBeenCalled();
  });

  it('a cart with no lot behaves exactly as before: no bulk statement, one unit per item', async () => {
    world.lots.clear();
    db.pOSPaymentRequest.findUnique.mockResolvedValue(baseRequest({ itemIds: ['i2'], totalAmountCents: 4000, cardAmountCents: 4000, platformFeeCents: 320, bulkLines: null }));
    await confirm();
    expect(mockSellInTx).not.toHaveBeenCalled();
    expect(mockSellItemUnits.mock.calls[0]).toEqual(['i2', 1, db]);
    expect('bulkQuantity' in created()[0]).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// manualCardPayment
// ---------------------------------------------------------------------------

describe('manualCardPayment with a bulk lot', () => {
  // 1,500 cards = 675 cents; card-not-present surcharge round(675 x 0.035) + 15 = 39; charged 714
  const CHARGED = 714;
  const body = (over: Record<string, any> = {}) => ({
    sourceId: 'cnon:card-nonce-1',
    saleId: 'sale1',
    items: [{ itemId: 'lot1', amount: 6.75, quantity: 1500, label: 'MTG commons' }],
    ...over,
  });
  const run = async (b: Record<string, any> = body()) => {
    const res = makeRes();
    await manualCardPayment({ body: b, headers: {}, user: { id: 'owner1' } } as any, res);
    return res;
  };

  it('charges the server-priced cents and takes the cards + writes the row in ONE transaction', async () => {
    const res = await run();
    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(mockCreateAndCapturePayment.mock.calls[0][0].amountCents).toBe(CHARGED);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(mockSellInTx.mock.calls[0]).toEqual([db, 'lot1', 1500]);
    expect(world.items.lot1.stockSold).toBe(1500);
    const rows = created();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ itemId: 'lot1', amount: 6.75, bulkQuantity: 1500, squarePaymentId: 'sq_pay_1', status: 'PAID' });
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: true, squarePaymentId: 'sq_pay_1', totalChargedCents: CHARGED });
    expect(res.json.mock.calls[0][0].purchaseIds).toHaveLength(1);
  });

  it('serialises on the Square payment id (advisory lock) before recording', async () => {
    await run();
    expect(db.$executeRaw).toHaveBeenCalled();
    const call = db.$executeRaw.mock.calls[0];
    expect(String(call[0].join('?'))).toMatch(/pg_advisory_xact_lock/);
    expect(call[1]).toBe('manual-card:sq_pay_1');
  });

  it('an identical submission already recorded inside the lock is answered as a replay and takes no cards', async () => {
    db.purchase.findMany
      .mockResolvedValueOnce([]) // the pre-read before the transaction
      .mockResolvedValueOnce([{ id: 'prior1' }]); // the re-read inside the lock
    const res = await run();
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: true, purchaseIds: ['prior1'], squarePaymentId: 'sq_pay_1' });
    expect(mockSellInTx).not.toHaveBeenCalled();
    expect(db.purchase.create).not.toHaveBeenCalled();
    expect(world.items.lot1.stockSold).toBe(0);
  });

  it('a payment that was already recorded before this call is a replay: no transaction, no cards', async () => {
    db.purchase.findMany.mockResolvedValue([{ id: 'prior1' }]);
    const res = await run();
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: true, purchaseIds: ['prior1'] });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(mockSellInTx).not.toHaveBeenCalled();
  });

  it('the last cards are lost AFTER capture: nothing recorded, nothing taken, refunded in full, 409 BULK_SOLD_OUT_AFTER_PAYMENT', async () => {
    mockSellInTx.mockRejectedValueOnce(new InsufficientStockError());
    mockSettleOversold.mockResolvedValue({ status: 'REFUNDED', refundCents: CHARGED });
    const res = await run();

    expect(mockCreateAndCapturePayment).toHaveBeenCalledTimes(1);
    expect(db.purchase.create).not.toHaveBeenCalled();
    expect(world.items.lot1.stockSold).toBe(0);
    expect(mockSettleOversold).toHaveBeenCalledTimes(1);
    expect(mockSettleOversold.mock.calls[0][0]).toMatchObject({ kind: 'manual-card', refId: 'sq_pay_1', paymentId: 'sq_pay_1', cardPaidCents: CHARGED, processor: 'SQUARE' });
    expect(mockNotifyOversold).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(409);
    const out = res.json.mock.calls[0][0];
    expect(out).toMatchObject({ success: false, charged: true, refunded: true, code: 'BULK_SOLD_OUT_AFTER_PAYMENT', squarePaymentId: 'sq_pay_1', refundCents: CHARGED });
    expect(out.message).toMatch(/refunded in full/);
    expect(releaseCashDebtClaim).toHaveBeenCalled();
    expect(syncMarketplaceStock).not.toHaveBeenCalled();
  });

  it('when the automatic refund does not complete the message tells the cashier exactly how much to refund by hand', async () => {
    mockSellInTx.mockRejectedValueOnce(new InsufficientStockError());
    mockSettleOversold.mockResolvedValue({ status: 'REFUND_FAILED', refundCents: CHARGED });
    const res = await run();
    const out = res.json.mock.calls[0][0];
    expect(out).toMatchObject({ charged: true, refunded: false, code: 'BULK_SOLD_OUT_AFTER_PAYMENT' });
    expect(out.message).toContain('$7.14');
    expect(out.message).toMatch(/Square dashboard/);
  });

  it('a lot sold out BEFORE the charge is refused and the card is never charged', async () => {
    world.items.lot1.stockSold = 4000; // 200 left
    const res = await run();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0]).toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(mockCreateAndCapturePayment).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('one cent off the server price is refused PRICE_CHANGED before the charge', async () => {
    const res = await run(body({ items: [{ itemId: 'lot1', amount: 6.76, quantity: 1500 }] }));
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0]).toMatchObject({ code: 'PRICE_CHANGED' });
    expect(mockCreateAndCapturePayment).not.toHaveBeenCalled();
  });

  it('a lot sent without a card count is refused before the charge', async () => {
    const res = await run(body({ items: [{ itemId: 'lot1', amount: 4.5 }] }));
    expect(res.json.mock.calls[0][0]).toMatchObject({ code: 'BULK_QUANTITY_REQUIRED' });
    expect(mockCreateAndCapturePayment).not.toHaveBeenCalled();
  });

  it('a failed write after the cards were taken rolls the cards back: 500 BULK_RECORD_FAILED, card charged, no refund', async () => {
    db.purchase.create.mockRejectedValueOnce(new Error('connection reset'));
    const res = await run();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0]).toMatchObject({ code: 'BULK_RECORD_FAILED', squarePaymentId: 'sq_pay_1' });
    expect(res.json.mock.calls[0][0].message).toMatch(/Do not charge the card again/);
    expect(world.items.lot1.stockSold).toBe(0); // rolled back
    expect(mockSettleOversold).not.toHaveBeenCalled(); // a retry of the same submission completes it
    expect(Sentry.captureException).toHaveBeenCalled();
    expect(releaseCashDebtClaim).toHaveBeenCalled();
  });

  it('the retry after that failure records the sale once and takes the cards once', async () => {
    db.purchase.create.mockRejectedValueOnce(new Error('connection reset'));
    await run();
    const res = await run();
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: true });
    expect(world.items.lot1.stockSold).toBe(1500);
  });

  it('a mixed cart: the lot is taken in the transaction, the ordinary item keeps the post-payment update', async () => {
    const order: string[] = [];
    mockSellInTx.mockImplementation(async (_tx: any, id: string, units: number) => {
      order.push(`tx:${id}`);
      world.items[id].stockSold += units;
      return { fullySoldOut: false, remainingStock: 2700 };
    });
    mockSellItemUnits.mockImplementation(async (id: string) => {
      order.push(`after:${id}`);
      return { fullySoldOut: true, remainingStock: 0 };
    });
    const res = await run(body({ items: [{ itemId: 'lot1', amount: 6.75, quantity: 1500 }, { itemId: 'i2', amount: 40 }] }));
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: true });
    expect(order).toEqual(['tx:lot1', 'after:i2']);
    expect(mockSellItemUnits.mock.calls[0]).toEqual(['i2', 1]); // outside the transaction, no tx argument
    const rows = created();
    expect(rows).toHaveLength(2);
    expect(rows.find((r: any) => r.itemId === 'lot1').bulkQuantity).toBe(1500);
    expect('bulkQuantity' in rows.find((r: any) => r.itemId === 'i2')).toBe(false);
    expect(mockCreateAndCapturePayment.mock.calls[0][0].amountCents).toBe(4675 + Math.round(4675 * 0.035) + 15);
  });

  it('a failing post-payment update on the ORDINARY item never undoes the recorded lot sale (alerted instead)', async () => {
    mockSellItemUnits.mockRejectedValue(new Error('stock update down'));
    const res = await run(body({ items: [{ itemId: 'lot1', amount: 6.75, quantity: 1500 }, { itemId: 'i2', amount: 40 }] }));
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: true });
    expect(world.items.lot1.stockSold).toBe(1500);
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it('two lots are taken in item id order and the second sold out gives the first back, then refunds', async () => {
    world.items.lotA = lotRow('lotA', { title: 'Lot A' });
    world.items.lotB = lotRow('lotB', { title: 'Lot B' });
    world.lots.add('lotA').add('lotB');
    // the pre-check sees cards on both lots; the guarded decrement finds lot B's cards gone
    mockSellInTx.mockImplementation(async (_tx: any, id: string, units: number) => {
      if (id === 'lotB') throw new InsufficientStockError();
      world.items[id].stockSold += units;
      return { fullySoldOut: false, remainingStock: 2700 };
    });
    mockSettleOversold.mockResolvedValue({ status: 'REFUNDED', refundCents: 1400 });
    const res = await run(body({ items: [{ itemId: 'lotB', amount: 6.75, quantity: 1500 }, { itemId: 'lotA', amount: 6.75, quantity: 1500 }] }));
    expect(mockSellInTx.mock.calls.map((c: any[]) => c[1])).toEqual(['lotA', 'lotB']);
    expect(world.items.lotA.stockSold).toBe(0); // rolled back with the transaction
    expect(world.items.lotB.stockSold).toBe(0);
    expect(db.purchase.create).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0]).toMatchObject({ code: 'BULK_SOLD_OUT_AFTER_PAYMENT', refunded: true });
  });

  it('a cart with no lot keeps the legacy path byte for byte: no transaction, no bulk statement', async () => {
    world.lots.clear();
    const res = await run(body({ items: [{ itemId: 'i2', amount: 40 }] }));
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: true });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(mockSellInTx).not.toHaveBeenCalled();
    expect(mockSellItemUnits.mock.calls[0]).toEqual(['i2', 1]);
    expect('bulkQuantity' in created()[0]).toBe(false);
  });

  it('a misc custom-amount cart (no item ids) never looks up lots', async () => {
    const res = await run(body({ items: [{ amount: 12, label: 'Misc' }] }));
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: true });
    expect(db.itemBulkLot.findMany).not.toHaveBeenCalled();
  });

  it('the receipt shows the cards and the price per 1,000', async () => {
    await run(body({ buyerEmail: 'buyer@example.com' }));
    expect(mockEmailSend).toHaveBeenCalledTimes(1);
    const html = mockEmailSend.mock.calls[0][0].html as string;
    expect(html).toContain('MTG commons: 1,500 cards at $4.50 per 1,000');
    expect(html).toContain('$6.75');
    expect(html).not.toMatch(new RegExp(String.fromCharCode(0x2014)));
  });

  it('the receipt escapes a lot title that contains markup', async () => {
    world.items.lot1.title = '<b>MTG</b> & more';
    await run(body({ buyerEmail: 'buyer@example.com' }));
    const html = mockEmailSend.mock.calls[0][0].html as string;
    expect(html).toContain('&lt;b&gt;MTG&lt;/b&gt; &amp; more');
    expect(html).not.toContain('<b>MTG</b>');
  });
});
