/**
 * Split-tender controller behavior (posPaymentController.ts, 2026-09-29): manualCardPayment and
 * createPaymentRequest validation + the manual-card charge math.
 *
 * NOT EXECUTED when written (no working jest/tsc on the dev machine). Run before merging:
 *   pnpm --filter backend test -- posSplitTenderControllers
 *
 * Prisma is mocked (no database). Only the seams these paths call are mocked: Square adapter,
 * organizer auth, discount resolution, the cash-fee service's DB-touching functions (its pure
 * validators stay real via requireActual), Sentry, sockets, email and marketplace hooks. NO REAL
 * PAYMENT is ever attempted: createAndCapturePayment is a jest.fn().
 *
 * Covers:
 *   manualCardPayment
 *     - card is charged the REMAINDER plus the CNP surcharge, fee on the card leg only
 *     - cash covering the whole total is refused (400 CASH_COVERS_TOTAL) before any Square call
 *     - fractional / oversized cash refused (400 INVALID_SPLIT_AMOUNT)
 *     - register total disagreeing with the server total refused (409 TOTAL_MISMATCH)
 *     - card leg below the minimum refused (400 CARD_AMOUNT_TOO_SMALL)
 *     - cash-fee exposure cap refused (400) before any Square call
 *     - the cash leg is accrued once, keyed by the Square payment id (MANUAL_CARD)
 *     - a failed accrual does NOT fail the sale (card already charged) and is flagged
 *   confirmPaymentRequest (split request, Square)
 *     - the PAID flip and the cash-leg accrual happen in ONE transaction (accrual receives tx)
 *     - a concurrent confirm that lost the guarded flip does not accrue and does not re-record
 *     - a failing accrual rolls the flip back and returns a loud 500 {charged:true} plus Sentry
 *   createPaymentRequest
 *     - non-integer / zero / over-bound totals -> 400 INVALID_AMOUNT
 *     - cash + card not equal to total -> 400 SPLIT_SUM_MISMATCH (exact, no 1 cent tolerance)
 *     - cash >= total -> 400 CASH_COVERS_TOTAL
 */

jest.mock('../lib/prisma', () => {
  const p: any = {
    sale: { findUnique: jest.fn() },
    item: { findMany: jest.fn() },
    purchase: { findMany: jest.fn(), create: jest.fn() },
    user: { findUnique: jest.fn() },
    organizer: { findUnique: jest.fn() },
    pOSPaymentRequest: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  };
  return { prisma: p };
});

var mockCreateAndCapturePayment = jest.fn();
var mockPreflightAccountStatus = jest.fn();
var mockResolveOrganizer = jest.fn();
var mockResolveDiscount = jest.fn();
var mockWouldExceedCap = jest.fn();
var mockApplyDebt = jest.fn();
var mockAccrueSplit = jest.fn();

jest.mock('../services/squarePosPaymentAdapter', () => ({
  preflightAccountStatus: (...a: any[]) => mockPreflightAccountStatus(...a),
  createAndCapturePayment: (...a: any[]) => mockCreateAndCapturePayment(...a),
  createAndCaptureSandboxPayment: jest.fn(),
}));
jest.mock('../services/stripePosPaymentAdapter', () => ({}));
jest.mock('../utils/posAuth', () => ({
  resolveOrganizerOrTeamMember: (...a: any[]) => mockResolveOrganizer(...a),
}));
jest.mock('../services/posDiscountService', () => ({
  resolvePosDiscount: (...a: any[]) => mockResolveDiscount(...a),
}));
jest.mock('../services/cashFeeService', () => ({
  ...jest.requireActual('../services/cashFeeService'),
  wouldExceedCashFeeExposureCap: (...a: any[]) => mockWouldExceedCap(...a),
  applyCashDebtToAppFee: (...a: any[]) => mockApplyDebt(...a),
  accrueSplitCashLegOnce: (...a: any[]) => mockAccrueSplit(...a),
  settleCashDebtCollection: jest.fn().mockResolvedValue(undefined),
  accrueCashFeeBalance: jest.fn().mockResolvedValue(0),
}));
jest.mock('@sentry/node', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));
jest.mock('../lib/socket', () => ({
  getIO: jest.fn(() => ({ to: jest.fn().mockReturnValue({ emit: jest.fn() }) })),
}));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../lib/transactionalEmailService', () => ({
  transactionalEmailService: { sendPosReceipt: jest.fn().mockResolvedValue(undefined), send: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../services/xpService', () => ({
  awardXp: jest.fn().mockResolvedValue(undefined),
  applyHuntPassMultiplier: jest.fn((n: number) => n),
  XP_AWARDS: {},
}));
jest.mock('../services/achievementService', () => ({ checkAndAward: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../controllers/ebayController', () => ({ endEbayListingIfExists: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/shopifyService', () => ({ markShopifyItemSold: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/marketplace/discogsListingConnector', () => ({ withdrawDiscogsListingIfExists: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/marketplace/reverbConnector', () => ({ withdrawReverbListingIfExists: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/facebookNudgeService', () => ({ notifyFacebookExportedItemSold: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/marketplaceStockSyncService', () => ({ syncMarketplaceStock: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/itemStockService', () => ({
  sellItemUnits: jest.fn().mockResolvedValue(undefined),
  InsufficientStockError: class InsufficientStockError extends Error {},
}));
jest.mock('../services/connectAccountGuard', () => ({ isPayoutFlaggedForReview: jest.fn().mockResolvedValue(false) }));
jest.mock('../services/checkoutGuard', () => ({
  assertCheckoutAllowed: jest.fn().mockResolvedValue(undefined),
  recordSuspectedSignal: jest.fn().mockResolvedValue(undefined),
  CheckoutGuardError: class CheckoutGuardError extends Error {},
}));

import { prisma } from '../lib/prisma';
import { manualCardPayment, createPaymentRequest, confirmPaymentRequest } from '../controllers/posPaymentController';

const db: any = prisma;

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

const organizer = {
  id: 'org1',
  ownerUserId: 'owner1',
  userId: 'owner1',
  subscriptionTier: 'SIMPLE',
  referralDiscountExpiry: null,
  squareOnboarded: true,
  squareMerchantId: 'merchant1',
  squareLocationId: 'loc1',
  cashFeeBalance: 0,
};

beforeEach(() => {
  jest.resetAllMocks();
  mockResolveOrganizer.mockResolvedValue(organizer);
  mockResolveDiscount.mockResolvedValue({ ok: true, discountAmountCents: 0 });
  mockWouldExceedCap.mockResolvedValue(false);
  mockApplyDebt.mockImplementation(async ({ baseAppFeeCents }: any) => ({ appFeeCents: baseAppFeeCents, debtAppliedCents: 0 }));
  mockAccrueSplit.mockResolvedValue({ accrued: 3.2, duplicate: false });
  mockPreflightAccountStatus.mockResolvedValue({ ok: true, accessToken: 'tok', squareLocationId: 'loc1' });
  mockCreateAndCapturePayment.mockResolvedValue({ ok: true, captured: true, paymentId: 'sq_pay_1' });
  db.sale.findUnique.mockResolvedValue({ id: 'sale1', status: 'PUBLISHED', organizerId: 'org1', organizer: { userId: 'owner1' } });
  // Short-circuits into the idempotent-return branch so tests stop right after the charge.
  db.purchase.findMany.mockResolvedValue([{ id: 'purchase1' }]);
  db.$transaction.mockImplementation(async (cb: any) => cb(db));
  db.pOSPaymentRequest.update.mockResolvedValue({});
});

const manualBody = (over: Record<string, any> = {}) => ({
  sourceId: 'cnon:card-nonce-1',
  saleId: 'sale1',
  items: [{ amount: 100, label: 'Misc' }],
  ...over,
});

describe('manualCardPayment -- split tender', () => {
  it('charges the card the remainder plus CNP surcharge, fee on the card leg only', async () => {
    const res = makeRes();
    await manualCardPayment({ body: manualBody({ cashAmountCents: 4000, expectedTotalCents: 10000 }), headers: {}, user: { id: 'owner1' } } as any, res);

    // card subtotal 6000; CNP = round(6000 * 0.035) + 15 = 225; charge = 6225; SIMPLE in-person 8% of 6000 = 480
    expect(mockCreateAndCapturePayment).toHaveBeenCalledTimes(1);
    const arg = mockCreateAndCapturePayment.mock.calls[0][0];
    expect(arg.amountCents).toBe(6225);
    expect(arg.appFeeCents).toBe(480);

    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({
      success: true,
      isSplitPayment: true,
      cashAmountCents: 4000,
      cardSubtotalCents: 6000,
      totalChargedCents: 6225,
      cashFeeAccrualPending: false,
    });
  });

  it('accrues the cash leg once, keyed by the Square payment id', async () => {
    await manualCardPayment({ body: manualBody({ cashAmountCents: 4000 }), headers: {}, user: { id: 'owner1' } } as any, makeRes());
    expect(mockAccrueSplit).toHaveBeenCalledTimes(1);
    expect(mockAccrueSplit.mock.calls[0][0]).toMatchObject({
      sourceType: 'MANUAL_CARD',
      sourceId: 'sq_pay_1',
      cashAmountCents: 4000,
    });
  });

  it('does not fail the sale when the accrual write fails; flags it instead', async () => {
    mockAccrueSplit.mockRejectedValue(new Error('ledger unavailable'));
    const res = makeRes();
    await manualCardPayment({ body: manualBody({ cashAmountCents: 4000 }), headers: {}, user: { id: 'owner1' } } as any, res);
    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: true, cashFeeAccrualPending: true });
  });

  it('a normal all-card sale charges the full amount and accrues nothing', async () => {
    const res = makeRes();
    await manualCardPayment({ body: manualBody(), headers: {}, user: { id: 'owner1' } } as any, res);
    // 10000 + round(10000 * 0.035) + 15 = 10365
    expect(mockCreateAndCapturePayment.mock.calls[0][0].amountCents).toBe(10365);
    expect(mockAccrueSplit).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0]).toMatchObject({ isSplitPayment: false });
  });

  // CNP surcharge persistence (2026-09-30): each Purchase row records its share of the surcharge charged,
  // allocated over the rows' CARD legs with largest-remainder allocation, so rows sum EXACTLY to the
  // surcharge (cnpFeeCents) and Purchase.amount stays exclusive of it.
  describe('CNP surcharge persisted on the Purchase rows', () => {
    const createdRows = () => db.purchase.create.mock.calls.map((c: any[]) => c[0].data);

    beforeEach(() => {
      db.purchase.findMany.mockResolvedValue([]); // no prior rows for this payment: fall through to creating them
      db.purchase.create.mockImplementation(async () => ({ id: `purchase${db.purchase.create.mock.calls.length}` }));
      // jest.resetAllMocks() (top-level beforeEach) wiped the factory's resolved value; the handler calls .catch on it.
      jest.requireMock('../services/checkoutGuard').recordSuspectedSignal.mockResolvedValue(undefined);
    });

    it('a single all-card row carries the whole surcharge (365 on $100), amount unchanged', async () => {
      const res = makeRes();
      await manualCardPayment({ body: manualBody(), headers: {}, user: { id: 'owner1' } } as any, res);
      const rows = createdRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].cnpSurchargeCents).toBe(365);
      expect(rows[0].amount).toBe(100); // the surcharge is never folded into the sale amount
      expect(res.json.mock.calls[0][0]).toMatchObject({ success: true, cnpFeeCents: 365 });
    });

    it('three rows that do not divide evenly still sum exactly to the surcharge', async () => {
      const res = makeRes();
      await manualCardPayment(
        { body: manualBody({ items: [{ amount: 33.34, label: 'A' }, { amount: 33.33, label: 'B' }, { amount: 33.33, label: 'C' }] }), headers: {}, user: { id: 'owner1' } } as any,
        res
      );
      const rows = createdRows();
      expect(rows).toHaveLength(3);
      const shares = rows.map((r: any) => r.cnpSurchargeCents);
      expect(shares.reduce((a: number, b: number) => a + b, 0)).toBe(365);
      expect(rows.map((r: any) => r.amount)).toEqual([33.34, 33.33, 33.33]);
    });

    it('split tender: the surcharge is weighted by each row\'s card leg (item amount minus its cash share)', async () => {
      const res = makeRes();
      // $60 + $40 rows, $40 cash: cash shares 24/16, card legs 36/24, surcharge on $60 card = 225 -> 135 / 90
      await manualCardPayment(
        { body: manualBody({ items: [{ amount: 60, label: 'A' }, { amount: 40, label: 'B' }], cashAmountCents: 4000, expectedTotalCents: 10000 }), headers: {}, user: { id: 'owner1' } } as any,
        res
      );
      const rows = createdRows();
      expect(rows.map((r: any) => r.cnpSurchargeCents)).toEqual([135, 90]);
      expect(rows.map((r: any) => r.cashLegAmount)).toEqual([24, 16]);
      expect(res.json.mock.calls[0][0]).toMatchObject({ success: true, cnpFeeCents: 225 });
    });
  });

  it('refuses cash that covers the whole total (no double collect), before any Square call', async () => {
    for (const cash of [10000, 15000]) {
      const res = makeRes();
      await manualCardPayment({ body: manualBody({ cashAmountCents: cash }), headers: {}, user: { id: 'owner1' } } as any, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].code).toBe('CASH_COVERS_TOTAL');
    }
    expect(mockPreflightAccountStatus).not.toHaveBeenCalled();
    expect(mockCreateAndCapturePayment).not.toHaveBeenCalled();
  });

  it('refuses fractional or negative cash with INVALID_SPLIT_AMOUNT', async () => {
    for (const cash of [40.5, -100]) {
      const res = makeRes();
      await manualCardPayment({ body: manualBody({ cashAmountCents: cash }), headers: {}, user: { id: 'owner1' } } as any, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].code).toBe('INVALID_SPLIT_AMOUNT');
    }
    expect(mockCreateAndCapturePayment).not.toHaveBeenCalled();
  });

  it('returns 409 TOTAL_MISMATCH when the register total disagrees with the server total', async () => {
    const res = makeRes();
    await manualCardPayment({ body: manualBody({ cashAmountCents: 4000, expectedTotalCents: 9000 }), headers: {}, user: { id: 'owner1' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0]).toMatchObject({ code: 'TOTAL_MISMATCH', serverTotalCents: 10000 });
    expect(mockCreateAndCapturePayment).not.toHaveBeenCalled();
  });

  it('tolerates a 1 cent rounding difference in the register total only', async () => {
    const res = makeRes();
    await manualCardPayment({ body: manualBody({ cashAmountCents: 4000, expectedTotalCents: 10001 }), headers: {}, user: { id: 'owner1' } } as any, res);
    expect(res.status).not.toHaveBeenCalledWith(409);
    expect(mockCreateAndCapturePayment).toHaveBeenCalledTimes(1);
  });

  it('refuses a card leg below the minimum (cash leaves too little to charge)', async () => {
    // total $10.00, cash $9.80 -> card subtotal $0.20, below the $0.50 minimum
    const res = makeRes();
    await manualCardPayment({ body: manualBody({ items: [{ amount: 10 }], cashAmountCents: 980 }), headers: {}, user: { id: 'owner1' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].code).toBe('CARD_AMOUNT_TOO_SMALL');
    expect(mockCreateAndCapturePayment).not.toHaveBeenCalled();
  });

  it('refuses when the cash-fee exposure cap would be exceeded, before any Square call', async () => {
    mockWouldExceedCap.mockResolvedValue(true);
    const res = makeRes();
    await manualCardPayment({ body: manualBody({ cashAmountCents: 4000 }), headers: {}, user: { id: 'owner1' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].code).toBe('CASH_FEE_EXPOSURE_CAP_EXCEEDED');
    expect(mockCreateAndCapturePayment).not.toHaveBeenCalled();
  });
});

describe('createPaymentRequest -- validation (no database reached)', () => {
  const call = async (body: Record<string, any>) => {
    const res = makeRes();
    await createPaymentRequest(
      { body: { shopperUserId: 'shopper1', saleId: 'sale1', itemIds: [], ...body }, headers: {}, user: { id: 'owner1' } } as any,
      res
    );
    return res;
  };

  it('rejects fractional, zero, negative and over-bound totals with INVALID_AMOUNT', async () => {
    for (const totalAmountCents of [10000.5, 0, -5, 10_000_001]) {
      const res = await call({ totalAmountCents });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].code).toBe('INVALID_AMOUNT');
    }
    expect(db.sale.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a split whose legs do not add up EXACTLY (one cent off)', async () => {
    const res = await call({ totalAmountCents: 10000, isSplitPayment: true, cashAmountCents: 4000, cardAmountCents: 6001 });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].code).toBe('SPLIT_SUM_MISMATCH');
  });

  it('rejects cash that covers the whole total', async () => {
    const res = await call({ totalAmountCents: 10000, isSplitPayment: true, cashAmountCents: 10000, cardAmountCents: 1 });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].code).toBe('CASH_COVERS_TOTAL');
  });

  it('rejects a split with a missing leg', async () => {
    const res = await call({ totalAmountCents: 10000, isSplitPayment: true, cashAmountCents: 4000 });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].code).toBe('INVALID_SPLIT_AMOUNT');
  });

  it('rejects a split when the cash-fee exposure cap would be exceeded', async () => {
    mockWouldExceedCap.mockResolvedValue(true);
    const res = await call({ totalAmountCents: 10000, isSplitPayment: true, cashAmountCents: 4000, cardAmountCents: 6000 });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].code).toBe('CASH_FEE_EXPOSURE_CAP_EXCEEDED');
    expect(db.sale.findUnique).not.toHaveBeenCalled();
  });
});

describe('confirmPaymentRequest -- exactly-once PAID transition + cash-leg accrual', () => {
  const Sentry = jest.requireMock('@sentry/node');

  const acceptedSplitRequest = {
    id: 'req1',
    status: 'ACCEPTED',
    processor: 'SQUARE',
    shopperUserId: 'shopper1',
    organizerUserId: 'owner1',
    saleId: 'sale1',
    itemIds: [],
    totalAmountCents: 10000,
    cardAmountCents: 6000,
    isSplitPayment: true,
    cashAmountCents: 4000,
    platformFeeCents: 480,
    squarePaymentId: null,
    shopper: { id: 'shopper1', email: 's@example.com', name: 'Shopper' },
    organizer: { id: 'org1', name: 'Org' },
    sale: { id: 'sale1', title: 'Sale' },
  };

  const confirm = async () => {
    const res = makeRes();
    await confirmPaymentRequest(
      { params: { requestId: 'req1' }, body: { sourceId: 'cnon:card-nonce-1' }, headers: {}, user: { id: 'shopper1' } } as any,
      res
    );
    return res;
  };

  beforeEach(() => {
    db.pOSPaymentRequest.findUnique.mockResolvedValue(acceptedSplitRequest);
    db.organizer.findUnique.mockResolvedValue({
      id: 'org1',
      stripeConnectId: null,
      subscriptionTier: 'SIMPLE',
      referralDiscountExpiry: null,
      squareOnboarded: true,
      squareMerchantId: 'merchant1',
      squareLocationId: 'loc1',
    });
  });

  it('accrues the cash leg inside the same transaction as the PAID flip, keyed by the request id', async () => {
    db.pOSPaymentRequest.updateMany.mockResolvedValue({ count: 1 });
    // Stop the handler right after the finalize step (the rest of the function is unrelated
    // purchase recording); it is caught by the handler's outer try/catch.
    db.item.findMany.mockRejectedValue(new Error('stop here'));
    await confirm();

    expect(db.pOSPaymentRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'req1', status: 'ACCEPTED' } })
    );
    expect(mockAccrueSplit).toHaveBeenCalledTimes(1);
    const accrueArg = mockAccrueSplit.mock.calls[0][0];
    expect(accrueArg).toMatchObject({ sourceType: 'POS_PAYMENT_REQUEST', sourceId: 'req1', cashAmountCents: 4000 });
    expect(accrueArg.tx).toBe(db); // the transaction client, not the global one
    expect(mockCreateAndCapturePayment).toHaveBeenCalledTimes(1);
    expect(mockCreateAndCapturePayment.mock.calls[0][0].amountCents).toBe(6000);
  });

  it('a confirm that loses the guarded flip to a concurrent confirm does not accrue or record again', async () => {
    db.pOSPaymentRequest.updateMany.mockResolvedValue({ count: 0 });
    // re-read inside the transaction: the other confirm already made it PAID
    db.pOSPaymentRequest.findUnique
      .mockResolvedValueOnce(acceptedSplitRequest) // handler's initial load
      .mockResolvedValueOnce({ status: 'PAID' }); // in-transaction re-read
    const res = await confirm();

    expect(mockAccrueSplit).not.toHaveBeenCalled();
    expect(db.purchase.create).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: true, message: 'Payment already completed' });
  });

  it('a failing accrual rolls back to ACCEPTED-retryable: loud 500 with charged:true and a Sentry error', async () => {
    db.pOSPaymentRequest.updateMany.mockResolvedValue({ count: 1 });
    mockAccrueSplit.mockRejectedValue(new Error('ledger insert failed'));
    const res = await confirm();

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0]).toMatchObject({ charged: true });
    expect(res.json.mock.calls[0][0].message).toMatch(/Do not pay again/);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException.mock.calls[0][1].tags.area).toBe('pos-payment-request-confirm-finalize');
    expect(db.purchase.create).not.toHaveBeenCalled();
  });

  it('a retried confirm re-uses the persisted Square payment id (no second charge)', async () => {
    db.pOSPaymentRequest.findUnique.mockResolvedValue({ ...acceptedSplitRequest, squarePaymentId: 'sq_pay_1' });
    db.pOSPaymentRequest.updateMany.mockResolvedValue({ count: 1 });
    db.item.findMany.mockRejectedValue(new Error('stop here'));
    await confirm();
    expect(mockCreateAndCapturePayment.mock.calls[0][0].existingSquarePaymentId).toBe('sq_pay_1');
    expect(mockCreateAndCapturePayment.mock.calls[0][0].posRequestId).toBe('req1');
  });
});
