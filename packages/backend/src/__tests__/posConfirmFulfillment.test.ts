/**
 * POS confirmPaymentRequest fulfillment (money review P1-9 / P1-10 / P1-12, 2026-09-29).
 *
 *   P1-9   each Purchase row records its share of what was ACTUALLY charged (net of discount), of the
 *          platform fee and of the cash leg, allocated with allocateCentsProportionally, instead of the
 *          list price and the whole cart fee on every row
 *   P1-10  the PAID flip, cash-leg accrual, stock decrement and Purchase rows run in ONE transaction; an
 *          item that is gone after the card was captured rolls it all back, parks the request in
 *          FULFILLMENT_FAILED, auto-refunds through squareRefundService, notifies both sides, and a
 *          repeated confirm resumes the refund (never charges again)
 *   P1-12  fulfillment runs only for the confirm whose compare-and-swap won the first PAID transition
 *
 * Prisma, Square, the refund service, sockets, notifications and every marketplace hook are mocked. NO
 * real payment, no database. Run with
 *   pnpm --filter backend test -- posConfirmFulfillment
 */

jest.mock('../lib/prisma', () => {
  const p: any = {
    item: { findMany: jest.fn() },
    itemReservation: { updateMany: jest.fn() },
    purchase: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
    organizer: { findUnique: jest.fn() },
    pOSPaymentRequest: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  };
  return { prisma: p };
});

var mockCreateAndCapturePayment = jest.fn();
var mockPreflightAccountStatus = jest.fn();
var mockAccrueSplit = jest.fn();
var mockSellItemUnits = jest.fn();
var mockRefundFailed = jest.fn();
var mockCreateNotification = jest.fn();

jest.mock('../services/squarePosPaymentAdapter', () => ({
  preflightAccountStatus: (...a: any[]) => mockPreflightAccountStatus(...a),
  createAndCapturePayment: (...a: any[]) => mockCreateAndCapturePayment(...a),
  createAndCaptureSandboxPayment: jest.fn(),
}));
jest.mock('../services/squareRefundService', () => ({
  refundFailedPosFulfillment: (...a: any[]) => mockRefundFailed(...a),
}));
jest.mock('../services/stripePosPaymentAdapter', () => ({}));
jest.mock('../utils/posAuth', () => ({ resolveOrganizerOrTeamMember: jest.fn() }));
jest.mock('../services/posDiscountService', () => ({ resolvePosDiscount: jest.fn() }));
jest.mock('../services/cashFeeService', () => ({
  ...jest.requireActual('../services/cashFeeService'),
  accrueSplitCashLegOnce: (...a: any[]) => mockAccrueSplit(...a),
}));
jest.mock('@sentry/node', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));
jest.mock('../lib/socket', () => ({ getIO: jest.fn() }));
jest.mock('../lib/notificationService', () => ({ createNotification: (...a: any[]) => mockCreateNotification(...a) }));
jest.mock('../lib/transactionalEmailService', () => ({ transactionalEmailService: { send: jest.fn() } }));
jest.mock('../services/xpService', () => ({ awardXp: jest.fn(), applyHuntPassMultiplier: jest.fn(), XP_AWARDS: {} }));
jest.mock('../services/achievementService', () => ({ checkAndAward: jest.fn() }));
var mockFireEngagement = jest.fn();
jest.mock('../services/squarePurchaseEngagementService', () => ({ fireSquarePurchaseEngagement: (...a: any[]) => mockFireEngagement(...a) }));
jest.mock('../controllers/ebayController', () => ({ endEbayListingIfExists: jest.fn() }));
jest.mock('../services/shopifyService', () => ({ markShopifyItemSold: jest.fn() }));
jest.mock('../services/marketplace/discogsListingConnector', () => ({ withdrawDiscogsListingIfExists: jest.fn() }));
jest.mock('../services/marketplace/reverbConnector', () => ({ withdrawReverbListingIfExists: jest.fn() }));
jest.mock('../services/facebookNudgeService', () => ({ notifyFacebookExportedItemSold: jest.fn() }));
jest.mock('../services/marketplaceStockSyncService', () => ({ syncMarketplaceStock: jest.fn() }));
jest.mock('../services/itemStockService', () => {
  class InsufficientStockError extends Error {}
  return { sellItemUnits: (...a: any[]) => mockSellItemUnits(...a), InsufficientStockError };
});
jest.mock('../services/connectAccountGuard', () => ({ isPayoutFlaggedForReview: jest.fn() }));
jest.mock('../services/checkoutGuard', () => ({
  assertCheckoutAllowed: jest.fn(),
  recordSuspectedSignal: jest.fn(),
  CheckoutGuardError: class CheckoutGuardError extends Error {},
}));

import { prisma } from '../lib/prisma';
import { confirmPaymentRequest } from '../controllers/posPaymentController';

const db: any = prisma;
const Sentry = jest.requireMock('@sentry/node');
const { InsufficientStockError } = jest.requireMock('../services/itemStockService');
const { endEbayListingIfExists } = jest.requireMock('../controllers/ebayController');
const { withdrawDiscogsListingIfExists } = jest.requireMock('../services/marketplace/discogsListingConnector');

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const baseRequest = (over: Record<string, any> = {}) => ({
  id: 'req1',
  status: 'ACCEPTED',
  processor: 'SQUARE',
  shopperUserId: 'shopper1',
  organizerUserId: 'owner1',
  saleId: 'sale1',
  itemIds: ['i1', 'i2'],
  totalAmountCents: 10000,
  cardAmountCents: 10000,
  isSplitPayment: false,
  cashAmountCents: null,
  platformFeeCents: 800,
  squarePaymentId: null,
  discountAmountCents: 0,
  shopper: { id: 'shopper1', email: 's@example.com', name: 'Shopper' },
  organizer: { id: 'org1', name: 'Org' },
  sale: { id: 'sale1', title: 'Sale' },
  ...over,
});

const confirm = async () => {
  const res = makeRes();
  await confirmPaymentRequest(
    { params: { requestId: 'req1' }, body: { sourceId: 'cnon:card-nonce-1' }, headers: {}, user: { id: 'shopper1' } } as any,
    res
  );
  return res;
};

const created = () => db.purchase.create.mock.calls.map((c: any[]) => c[0].data);
const sum = (rows: any[], key: string) => Math.round(rows.reduce((a, r) => a + (r[key] || 0), 0) * 100) / 100;

beforeEach(() => {
  jest.resetAllMocks();
  db.$transaction.mockImplementation(async (cb: any) => cb(db));
  db.organizer.findUnique.mockResolvedValue({
    id: 'org1',
    stripeConnectId: null,
    subscriptionTier: 'SIMPLE',
    referralDiscountExpiry: null,
    squareOnboarded: true,
    squareMerchantId: 'merchant1',
    squareLocationId: 'loc1',
  });
  db.pOSPaymentRequest.findUnique.mockResolvedValue(baseRequest());
  db.pOSPaymentRequest.updateMany.mockResolvedValue({ count: 1 });
  db.pOSPaymentRequest.update.mockResolvedValue({});
  db.purchase.findMany.mockResolvedValue([]);
  db.purchase.create.mockResolvedValue({});
  db.purchase.findFirst.mockResolvedValue({ id: 'pur_first' });
  db.itemReservation.updateMany.mockResolvedValue({ count: 0 });
  db.item.findMany.mockResolvedValue([
    { id: 'i1', price: 60 },
    { id: 'i2', price: 40 },
  ]);
  mockPreflightAccountStatus.mockResolvedValue({ ok: true, accessToken: 'tok', squareLocationId: 'loc1' });
  mockCreateAndCapturePayment.mockResolvedValue({ ok: true, captured: true, paymentId: 'sq_pay_1' });
  mockAccrueSplit.mockResolvedValue({ accrued: 3.2, duplicate: false });
  mockSellItemUnits.mockResolvedValue({ fullySoldOut: true, remainingStock: 0 });
  mockCreateNotification.mockResolvedValue(undefined);
  mockRefundFailed.mockResolvedValue({ status: 'REFUNDED', squareRefundId: 'sqr_1' });
  // resetAllMocks wipes the hook mocks' return values; the controller chains .catch on each.
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

describe('P1-9: rows record what was actually charged', () => {
  it('a discounted two-item sale: row amounts, fees, discounts and cash legs each sum exactly to the sale', async () => {
    // list $100 (60 + 40), $10.00 off -> charged $90.00 of which $30.00 cash; one cart fee of $4.50
    db.pOSPaymentRequest.findUnique.mockResolvedValue(
      baseRequest({
        totalAmountCents: 9000,
        cardAmountCents: 6000,
        isSplitPayment: true,
        cashAmountCents: 3000,
        platformFeeCents: 450,
        discountAmountCents: 1000,
        discountType: 'FIXED',
        discountValueRaw: 1000,
      })
    );
    const res = await confirm();
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: true });

    const rows = created();
    expect(rows).toHaveLength(2);
    expect(rows.map((r: any) => r.amount)).toEqual([54, 36]); // NOT the 60 / 40 list prices
    expect(sum(rows, 'amount')).toBe(90);
    expect(rows.map((r: any) => r.platformFeeAmount)).toEqual([2.7, 1.8]); // NOT 4.50 on every row
    expect(sum(rows, 'platformFeeAmount')).toBe(4.5);
    expect(rows.map((r: any) => r.cashLegAmount)).toEqual([18, 12]);
    expect(rows.map((r: any) => r.discountAmountCents)).toEqual([600, 400]);
    rows.forEach((r: any) => {
      expect(r.source).toBe('POS');
      expect(r.status).toBe('PAID');
      expect(r.processor).toBe('SQUARE');
      expect(r.squarePaymentId).toBe('sq_pay_1');
    });
  });

  it('an odd fee is split by largest remainder with no lost or invented cent', async () => {
    db.item.findMany.mockResolvedValue([
      { id: 'i1', price: 33.33 },
      { id: 'i2', price: 33.33 },
      { id: 'i3', price: 33.34 },
    ]);
    db.pOSPaymentRequest.findUnique.mockResolvedValue(baseRequest({ itemIds: ['i1', 'i2', 'i3'], platformFeeCents: 799 }));
    await confirm();
    const rows = created();
    expect(rows).toHaveLength(3);
    expect(sum(rows, 'amount')).toBe(100);
    expect(sum(rows, 'platformFeeAmount')).toBe(7.99);
  });

  it('records the part of the charge the catalog items do not explain as one misc row', async () => {
    db.pOSPaymentRequest.findUnique.mockResolvedValue(baseRequest({ itemIds: ['i1'], totalAmountCents: 10000, platformFeeCents: 800 }));
    db.item.findMany.mockResolvedValue([{ id: 'i1', price: 60 }]);
    await confirm();
    const rows = created();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ itemId: 'i1', amount: 60 });
    expect(rows[1]).toMatchObject({ itemId: null, amount: 40 });
    expect(sum(rows, 'amount')).toBe(100);
    expect(sum(rows, 'platformFeeAmount')).toBe(8);
  });

  it('a misc-only cart records the whole charge once', async () => {
    db.pOSPaymentRequest.findUnique.mockResolvedValue(baseRequest({ itemIds: [], totalAmountCents: 2500, platformFeeCents: 200 }));
    db.item.findMany.mockResolvedValue([]);
    await confirm();
    const rows = created();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ itemId: null, amount: 25, platformFeeAmount: 2 });
    expect(mockSellItemUnits).not.toHaveBeenCalled();
  });
});

describe('P1-10 / P1-12: atomic, exactly-once fulfillment', () => {
  it('flips PAID, decrements stock and records the rows inside ONE transaction, stock via the transaction client', async () => {
    await confirm();
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(mockSellItemUnits).toHaveBeenCalledTimes(2);
    expect(mockSellItemUnits.mock.calls[0]).toEqual(['i1', 1, db]);
    expect(db.pOSPaymentRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'req1', status: 'ACCEPTED' }, data: expect.objectContaining({ status: 'PAID' }) })
    );
    expect(db.purchase.create).toHaveBeenCalledTimes(2);
  });

  it('cross-channel withdrawals fire only after the transaction committed', async () => {
    await confirm();
    expect(endEbayListingIfExists).toHaveBeenCalledTimes(2);
    expect(withdrawDiscogsListingIfExists).toHaveBeenCalledTimes(2);
  });

  it('a database error mid-fulfillment leaves the request retryable: 500 charged:true, Sentry, and NO cross-channel withdrawals', async () => {
    db.purchase.create.mockRejectedValueOnce(new Error('db blip'));
    const res = await confirm();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0]).toMatchObject({ charged: true });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(endEbayListingIfExists).not.toHaveBeenCalled();
    expect(mockRefundFailed).not.toHaveBeenCalled(); // a transient failure is retried, not refunded
    expect(db.pOSPaymentRequest.updateMany).toHaveBeenCalledTimes(1); // only the (rolled back) flip, never FULFILLMENT_FAILED
  });

  it('a confirm that loses the compare-and-swap does no fulfillment at all', async () => {
    db.pOSPaymentRequest.updateMany.mockResolvedValue({ count: 0 });
    db.pOSPaymentRequest.findUnique.mockResolvedValueOnce(baseRequest()).mockResolvedValueOnce({ status: 'PAID' });
    const res = await confirm();
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: true, message: 'Payment already completed' });
    expect(mockSellItemUnits).not.toHaveBeenCalled();
    expect(db.purchase.create).not.toHaveBeenCalled();
    expect(mockAccrueSplit).not.toHaveBeenCalled();
  });

  it('a replayed confirm on an already PAID request returns early without touching stock or Square', async () => {
    db.pOSPaymentRequest.findUnique.mockResolvedValue(baseRequest({ status: 'PAID' }));
    const res = await confirm();
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: true, message: 'Payment already completed' });
    expect(mockCreateAndCapturePayment).not.toHaveBeenCalled();
    expect(mockSellItemUnits).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('never re-records or re-decrements an item already recorded for this payment (state left by the old non-atomic order)', async () => {
    db.purchase.findMany.mockResolvedValue([{ itemId: 'i1' }]);
    await confirm();
    expect(mockSellItemUnits.mock.calls.map((c: any[]) => c[0])).toEqual(['i2']);
    expect(created().map((r: any) => r.itemId)).toEqual(['i2']);
  });

  it('a split sale accrues the cash leg in the same transaction', async () => {
    db.pOSPaymentRequest.findUnique.mockResolvedValue(
      baseRequest({ isSplitPayment: true, cashAmountCents: 4000, cardAmountCents: 6000 })
    );
    await confirm();
    expect(mockAccrueSplit.mock.calls[0][0].tx).toBe(db);
  });
});

describe('P1-10: an item gone after the card was captured', () => {
  const soldOutOnSecond = () =>
    mockSellItemUnits
      .mockResolvedValueOnce({ fullySoldOut: true, remainingStock: 0 })
      .mockRejectedValueOnce(new InsufficientStockError('none left'));

  it('parks the request FULFILLMENT_FAILED, refunds the card amount, notifies organizer and shopper, answers 409', async () => {
    soldOutOnSecond();
    const res = await confirm();

    expect(db.pOSPaymentRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'req1', status: { in: ['ACCEPTED', 'EXPIRED', 'CANCELLED', 'DECLINED'] } },
      data: { status: 'FULFILLMENT_FAILED' },
    });
    expect(mockRefundFailed).toHaveBeenCalledWith('req1');
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: false, code: 'ITEM_UNAVAILABLE', refunded: true });

    const types = mockCreateNotification.mock.calls.map((c: any[]) => c[0].type);
    expect(types).toEqual(['pos_payment_fulfillment_failed', 'pos_payment_fulfillment_failed_shopper']);
    expect(mockCreateNotification.mock.calls[0][0].userId).toBe('owner1');
    expect(mockCreateNotification.mock.calls[1][0].userId).toBe('shopper1');
    // no success side effects
    expect(endEbayListingIfExists).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).toHaveBeenCalled();
  });

  it('when the refund cannot complete yet it says so, stays retryable, and tells the shopper not to pay again', async () => {
    soldOutOnSecond();
    mockRefundFailed.mockResolvedValue({ status: 'REFUND_PENDING' });
    const res = await confirm();
    expect(res.status).toHaveBeenCalledWith(409);
    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({ refunded: false, refundPending: true });
    expect(body.message).toMatch(/do not pay again/i);
  });

  it('a refund service that throws never escapes the handler', async () => {
    soldOutOnSecond();
    mockRefundFailed.mockRejectedValue(new Error('square down'));
    const res = await confirm();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0]).toMatchObject({ refundPending: true });
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it('a split sale tells everyone the cash part is returned by the organizer', async () => {
    db.pOSPaymentRequest.findUnique.mockResolvedValue(
      baseRequest({ isSplitPayment: true, cashAmountCents: 4000, cardAmountCents: 6000 })
    );
    soldOutOnSecond();
    const res = await confirm();
    expect(res.json.mock.calls[0][0].message).toContain('$40.00');
    expect(mockCreateNotification.mock.calls[1][0].body).toContain('$40.00');
  });

  it('the notification copy has no em dashes and no banned terms', async () => {
    soldOutOnSecond();
    await confirm();
    for (const [arg] of mockCreateNotification.mock.calls) {
      const text = `${arg.title} ${arg.body} ${arg.emailSubject ?? ''}`;
      expect(text).not.toMatch(new RegExp(String.fromCharCode(0x2014)));
      expect(text).not.toMatch(/\bAI\b/);
      expect(text.toLowerCase()).not.toContain('estate sale');
    }
  });

  it('a repeated confirm on a FULFILLMENT_FAILED request resumes the refund and never charges again', async () => {
    db.pOSPaymentRequest.findUnique.mockResolvedValue(baseRequest({ status: 'FULFILLMENT_FAILED', squarePaymentId: 'sq_pay_1' }));
    mockRefundFailed.mockResolvedValue({ status: 'REFUNDED' });
    const res = await confirm();
    expect(mockCreateAndCapturePayment).not.toHaveBeenCalled();
    expect(mockRefundFailed).toHaveBeenCalledWith('req1');
    expect(res.json.mock.calls[0][0]).toMatchObject({ code: 'ITEM_UNAVAILABLE', refunded: true });
    // it does not move the request to FULFILLMENT_FAILED again
    expect(db.pOSPaymentRequest.updateMany).not.toHaveBeenCalled();
    // and it tells the shopper the refund landed (it was pending before)
    expect(mockCreateNotification.mock.calls.map((c: any[]) => c[0].type)).toContain('pos_payment_fulfillment_failed_shopper');
  });

  it('a replay on an already REFUNDED request is a quiet no-op (no duplicate notifications)', async () => {
    db.pOSPaymentRequest.findUnique.mockResolvedValue(baseRequest({ status: 'REFUNDED', squarePaymentId: 'sq_pay_1' }));
    mockRefundFailed.mockResolvedValue({ status: 'REFUNDED' });
    const res = await confirm();
    expect(res.json.mock.calls[0][0]).toMatchObject({ refunded: true });
    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(mockCreateAndCapturePayment).not.toHaveBeenCalled();
  });
});

describe('2026-09-30: an item deleted after the request was created', () => {
  it('a shortfall of surviving items goes down the ITEM_UNAVAILABLE auto-refund path, records nothing and awards nothing', async () => {
    // i2 no longer exists: only i1 comes back, so the $40 would have been absorbed into a misc row.
    db.item.findMany.mockResolvedValue([{ id: 'i1', price: 60 }]);
    const res = await confirm();

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: false, code: 'ITEM_UNAVAILABLE' });
    expect(db.pOSPaymentRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'req1', status: { in: ['ACCEPTED', 'EXPIRED', 'CANCELLED', 'DECLINED'] } },
      data: { status: 'FULFILLMENT_FAILED' },
    });
    expect(mockRefundFailed).toHaveBeenCalledWith('req1');
    expect(mockSellItemUnits).not.toHaveBeenCalled(); // thrown before any stock moved
    expect(db.purchase.create).not.toHaveBeenCalled(); // no misc row absorbing the missing item
    expect(mockFireEngagement).not.toHaveBeenCalled();
  });

  it('no shortfall (every requested item exists) still succeeds', async () => {
    const res = await confirm();
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: true });
    expect(db.purchase.create).toHaveBeenCalledTimes(2);
  });
});

describe('2026-09-30: engagement awards go through the shared, deduped service', () => {
  it('fires fireSquarePurchaseEngagement exactly once with the FIRST purchase id, and no longer awards XP directly', async () => {
    await confirm();
    expect(db.purchase.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { squarePaymentId: 'sq_pay_1', userId: 'shopper1' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
    );
    expect(mockFireEngagement).toHaveBeenCalledTimes(1);
    expect(mockFireEngagement).toHaveBeenCalledWith('pur_first');
    expect(jest.requireMock('../services/xpService').awardXp).not.toHaveBeenCalled();
    expect(jest.requireMock('../services/achievementService').checkAndAward).not.toHaveBeenCalled();
  });

  it('a confirm that loses the compare-and-swap awards nothing', async () => {
    db.pOSPaymentRequest.updateMany.mockResolvedValue({ count: 0 });
    db.pOSPaymentRequest.findUnique.mockResolvedValueOnce(baseRequest()).mockResolvedValueOnce({ status: 'PAID' });
    await confirm();
    expect(mockFireEngagement).not.toHaveBeenCalled();
  });
});
