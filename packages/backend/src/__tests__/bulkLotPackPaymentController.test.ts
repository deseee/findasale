/**
 * Online purchase of a bulk lot pack, through the real controller (ADR-136 Addendum E, roadmap #659).
 * Everything outside the controller is faked: the database (PackFakeDb), Square (createSquareCharge), the refund service, the
 * notification and marketplace services. The fee math, the pack pricing and the checkout core are the real code.
 *
 * WHAT THIS PROVES (lot: 10,000 cards at $8 per 1,000 in 1,000-card packs; PRO online fee 7.5%)
 *   - the amount handed to Square is the server price (N x pack price), never anything from the request, and the response says
 *     what was bought; a logged in buyer earns engagement once, a guest does not
 *   - missing retry token, bad pack count, shipping, coupon, item discount, a wrong displayed total, too many packs and a pack too
 *     cheap to charge are all refused with a code, and Square is never called
 *   - a declined card is a 402 and records nothing; the same retry token again is a replay that charges nothing
 *   - cards that ran out after the charge: nothing recorded, the shared refund service is asked for a full refund (kind online-pack),
 *     and the shopper gets plain words whether the refund went through or needs doing by hand
 *   - a lot with no pack size (or a plain item) is not handled here, so the old refusal path keeps its behavior
 */
jest.mock('../lib/prisma', () => {
  const { PackFakeDb } = require('./__fixtures__/bulkLotPackFakes');
  return { prisma: new PackFakeDb() };
});
jest.mock('@sentry/node', () => ({ captureException: () => undefined, captureMessage: () => undefined }));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn(async () => ({})) }));
jest.mock('../services/receiptService', () => ({ generateReceipt: jest.fn(async () => undefined) }));
jest.mock('../services/paymentDeduplicationService', () => ({
  checkPaymentDuplicate: jest.fn(async () => ({ isDuplicate: false, otherUserIds: [] })),
  storePaymentFingerprint: jest.fn(async () => undefined),
  logPaymentDuplicateWarning: jest.fn(),
}));
jest.mock('../services/itemStockService', () => ({
  sellItemUnitsInTransaction: (tx: any, id: string, units: number) => {
    const { fakeSell } = require('./__fixtures__/bulkLotFollowupFakes');
    return fakeSell(require('../lib/prisma').prisma)(tx, id, units);
  },
}));
jest.mock('../services/soldFanOutService', () => ({ fanOutItemSoldWithdrawals: jest.fn() }));
jest.mock('../services/marketplaceStockSyncService', () => ({ syncMarketplaceStock: jest.fn(async () => undefined) }));
jest.mock('../services/checkoutGuard', () => {
  class CheckoutGuardError extends Error {}
  return {
    assertCheckoutAllowed: jest.fn(async () => undefined),
    assertGuestCheckoutAllowed: jest.fn(async () => undefined),
    recordConfirmedSignal: jest.fn(async () => undefined),
    CheckoutGuardError,
  };
});
jest.mock('../services/squarePaymentEligibilityService', () => ({ assertSaleCanAcceptSquarePayment: jest.fn(async () => ({ blocked: false })) }));
jest.mock('../services/guestCheckoutVelocityGuard', () => ({
  checkGuestCheckoutVelocity: jest.fn(async () => ({ blocked: false })),
  recordGuestCheckoutFailure: jest.fn(async () => undefined),
  hashForVelocity: (v: string) => 'h_' + v,
}));
jest.mock('../utils/getClientIp', () => ({ getClientIp: () => '203.0.113.9' }));
jest.mock('../services/squarePaymentService', () => {
  class SquareOnboardingIncompleteError extends Error {}
  return {
    SquareOnboardingIncompleteError,
    resolveOrganizerSquareAccessToken: jest.fn(async () => 'organizer-token'),
    buildSquareIdempotencyKey: (parts: Array<string | null | undefined>) => parts.filter(Boolean).join('|').slice(0, 45),
    createSquareCharge: jest.fn(),
  };
});
jest.mock('../services/cashFeeService', () => ({
  // the real module supplies allocateCentsProportionally (used by the real computeOversoldSettlement); the three money calls are faked
  allocateCentsProportionally: jest.requireActual('../services/cashFeeService').allocateCentsProportionally,
  applyCashDebtToAppFee: jest.fn(async (a: any) => ({ appFeeCents: a.baseAppFeeCents, debtAppliedCents: 0 })),
  settleCashDebtCollection: jest.fn(async () => undefined),
  releaseCashDebtClaim: jest.fn(async () => undefined),
}));
jest.mock('../services/creatorAffiliateService', () => ({
  recordAffiliateConversion: jest.fn(async () => undefined),
  resolveAffiliateAttribution: jest.fn(async () => null),
}));
jest.mock('../services/squarePurchaseEngagementService', () => ({ fireSquarePurchaseEngagement: jest.fn() }));
jest.mock('../services/bulkLot/bulkLotEbayWiring', () => ({ reconcileBulkLotEbayInBackgroundIfEnabled: jest.fn() }));
jest.mock('../services/oversoldPaymentRefundService', () => {
  const actual = jest.requireActual('../services/oversoldPaymentRefundService');
  return {
    computeOversoldSettlement: actual.computeOversoldSettlement,
    settleOversoldPayment: jest.fn(async (p: any) => ({ status: 'REFUNDED', refundCents: p.settlement.refundCardCents, reason: 'ok', autoRefundDisabled: false })),
    notifyOversoldSettlement: jest.fn(async () => undefined),
  };
});

import { handleBulkPackPayment, tryHandleBulkPackPayment } from '../controllers/bulkLotPackPaymentController';
import { prisma } from '../lib/prisma';
import { createSquareCharge } from '../services/squarePaymentService';
import { settleOversoldPayment, notifyOversoldSettlement } from '../services/oversoldPaymentRefundService';
import { fireSquarePurchaseEngagement } from '../services/squarePurchaseEngagementService';
import { fanOutItemSoldWithdrawals } from '../services/soldFanOutService';
import { syncMarketplaceStock } from '../services/marketplaceStockSyncService';
import { recordGuestCheckoutFailure } from '../services/guestCheckoutVelocityGuard';
import { releaseCashDebtClaim, settleCashDebtCollection } from '../services/cashFeeService';
import { reconcileBulkLotEbayInBackgroundIfEnabled } from '../services/bulkLot/bulkLotEbayWiring';
import { resolveOrganizerSquareAccessToken, SquareOnboardingIncompleteError } from '../services/squarePaymentService';

const db: any = prisma;
db.user = { findUnique: async () => null };
const realPurchaseCreate = db.purchase.create.bind(db.purchase);
const realFindMany = db.itemBulkLot.findMany;

const charge = createSquareCharge as unknown as jest.Mock;
const TOKEN = 'token-aaaa-1111';

const sale = (over: Record<string, any> = {}) => ({
  id: 'sale1',
  status: 'PUBLISHED',
  paymentsHeldAt: null,
  paymentsHeldReason: null,
  zip: '12345',
  organizerId: 'org1',
  organizer: { squareMerchantId: 'm1', squareOnboarded: true, squareLocationId: 'L1', userId: 'orgUser1', referralDiscountExpiry: null, subscriptionTier: 'PRO', ...(over.organizer ?? {}) },
});

let lot: string;

function makeRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (b: any) => {
    res.body = b;
    return res;
  };
  return res;
}
function makeReq(body: Record<string, any>, user: any = { id: 'u1', email: 'u1@example.com', name: 'U One' }) {
  return { body: { itemId: lot, sourceId: 'cnon:card-1', packs: 1, clientToken: TOKEN, ...body }, user: user ?? undefined, headers: {} } as any;
}
async function buy(body: Record<string, any> = {}, user: any = { id: 'u1', email: 'u1@example.com', name: 'U One' }) {
  const res = makeRes();
  await handleBulkPackPayment(makeReq(body, user), res, 1000);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  db.purchase.create = realPurchaseCreate;
  db.itemBulkLot.findMany = realFindMany;
  db.item.rows.length = 0;
  db.purchase.rows.length = 0;
  db.lots.clear();
  db.packs.clear();
  db.rawCalls.length = 0;
  lot = db.addPackLot({ title: 'Commons', price: 8, stockTotal: 10000, listingType: 'FIXED_PRICE', auctionStartPrice: null, organizerDiscountAmount: null, sale: sale() }, 1000).id;
  let n = 0;
  charge.mockImplementation(async () => ({ ok: true, paymentId: `pay_${++n}`, status: 'COMPLETED', cardFingerprint: 'fp_1', riskLevel: null }));
  jest.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { if (process.env.DBG) process.stdout.write('ERR ' + a.map((x: any) => (x && x.stack) || String(x)).join(' ') + '\n'); });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('a normal purchase', () => {
  it('charges the server price, records the sale and answers with what was bought', async () => {
    const res = await buy({ packs: 2, expectedAmount: 16 });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ packs: 2, packSize: 1000, cards: 2000, amountCents: 1600, status: 'PAID', squarePaymentId: 'pay_1' });
    expect(charge).toHaveBeenCalledTimes(1);
    expect(charge.mock.calls[0][0]).toMatchObject({ amountCents: 1600, appFeeCents: 120, sourceId: 'cnon:card-1', locationId: 'L1', referenceId: lot, organizerAccessToken: 'organizer-token' });
    expect(db.purchase.rows).toHaveLength(1);
    expect(db.purchase.rows[0]).toMatchObject({ amount: 16, bulkQuantity: 2000, userId: 'u1', deliveryMethod: 'LOCAL_PICKUP', processor: 'SQUARE' });
    expect(db.stock(lot).sold).toBe(2000);
    expect(res.body.purchaseId).toBe(db.purchase.rows[0].id);
  });

  it('the request cannot change the price: only packs and the retry token matter', async () => {
    const res = await buy({ packs: 1, price: 0.01, amount: 0.01, amountCents: 1, totalCents: 1, cards: 5 });
    expect(res.statusCode).toBe(200);
    expect(charge.mock.calls[0][0].amountCents).toBe(800);
    expect(db.purchase.rows[0].bulkQuantity).toBe(1000);
  });

  it('runs the post sale work: engagement once for a logged in buyer, marketplace sync, eBay reconcile, debt confirmation', async () => {
    await buy({ packs: 1 });
    expect(fireSquarePurchaseEngagement).toHaveBeenCalledTimes(1);
    expect((fireSquarePurchaseEngagement as jest.Mock).mock.calls[0][0]).toBe(db.purchase.rows[0].id);
    expect(syncMarketplaceStock).toHaveBeenCalledWith(lot, { fullySoldOut: false, remainingStock: 9000 });
    expect(fanOutItemSoldWithdrawals).not.toHaveBeenCalled();
    expect(reconcileBulkLotEbayInBackgroundIfEnabled).toHaveBeenCalledWith(lot, 'online pack sale');
    expect(settleCashDebtCollection).toHaveBeenCalledTimes(1);
  });

  it('the last pack withdraws the lot everywhere instead of revising a quantity', async () => {
    db.item.rows.find((x: any) => x.id === lot).stockSold = 9000;
    await buy({ packs: 1 });
    expect(fanOutItemSoldWithdrawals).toHaveBeenCalledWith(lot, 'square_payment');
    expect(syncMarketplaceStock).not.toHaveBeenCalled();
  });

  it('a guest purchase needs an email and a name and earns no engagement', async () => {
    const noEmail = await buy({ packs: 1 }, null);
    expect(noEmail.statusCode).toBe(400);
    const ok = await buy({ packs: 1, guestEmail: 'Guest@Example.com', guestName: 'Gus' }, null);
    expect(ok.statusCode).toBe(200);
    expect(db.purchase.rows[0]).toMatchObject({ userId: null, buyerEmail: 'guest@example.com', guestName: 'Gus' });
    expect(fireSquarePurchaseEngagement).not.toHaveBeenCalled();
    expect(charge.mock.calls[0][0]).toMatchObject({ buyerEmailAddress: 'guest@example.com' });
  });
});

describe('refusals (Square is never called)', () => {
  const refused = async (body: Record<string, any>, status: number, code: string) => {
    const res = await buy(body);
    expect(res.statusCode).toBe(status);
    expect(res.body.code).toBe(code);
    expect(charge).not.toHaveBeenCalled();
    expect(db.purchase.rows).toHaveLength(0);
    expect(db.stock(lot).sold).toBe(0);
  };

  it('no retry token, or a bad one', async () => {
    await refused({ clientToken: undefined }, 400, 'BULK_PACK_RETRY_TOKEN');
    await refused({ clientToken: 'short' }, 400, 'BULK_PACK_RETRY_TOKEN');
  });
  it('a bad pack count', async () => {
    await refused({ packs: 0 }, 400, 'BULK_PACK_COUNT');
    await refused({ packs: 51 }, 400, 'BULK_PACK_COUNT');
    await refused({ packs: 1.5 }, 400, 'BULK_PACK_COUNT');
  });
  it('shipping', async () => {
    await refused({ shippingRequested: true, shippingZip: '90210' }, 400, 'BULK_PACK_PICKUP_ONLY');
  });
  it('a coupon', async () => {
    await refused({ couponCode: 'SAVE10' }, 400, 'BULK_PACK_NO_DISCOUNT');
  });
  it('an item discount', async () => {
    db.item.rows.find((x: any) => x.id === lot).organizerDiscountAmount = 1.5;
    await refused({}, 400, 'BULK_PACK_NO_DISCOUNT');
  });
  it('a displayed total that is not the server price', async () => {
    const res = await buy({ packs: 2, expectedAmount: 15.99 });
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'PRICE_CHANGED', expectedCents: 1600 });
    expect(charge).not.toHaveBeenCalled();
  });
  it('more packs than are left', async () => {
    db.item.rows.find((x: any) => x.id === lot).stockSold = 7500; // 2,500 left: two packs
    const res = await buy({ packs: 3 });
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'INSUFFICIENT_STOCK', packsAvailable: 2, remaining: 2500 });
    expect(charge).not.toHaveBeenCalled();
  });
  it('a pack too cheap to charge', async () => {
    db.item.rows.find((x: any) => x.id === lot).price = 4; // 100-card packs: $0.40
    db.packs.set(lot, 100);
    const res = makeRes();
    await handleBulkPackPayment(makeReq({}), res, 100);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('BULK_PACK_TOO_CHEAP');
    expect(charge).not.toHaveBeenCalled();
  });
  it('a lot that is not for sale', async () => {
    db.item.rows.find((x: any) => x.id === lot).status = 'SOLD';
    const res = await buy({});
    expect(res.statusCode).toBe(409);
    expect(charge).not.toHaveBeenCalled();
  });
  it('an unknown item', async () => {
    const res = await buy({ itemId: 'nope' });
    expect(res.statusCode).toBe(404);
  });
  it('a seller that cannot take card payments', async () => {
    (resolveOrganizerSquareAccessToken as jest.Mock).mockRejectedValueOnce(new SquareOnboardingIncompleteError('not onboarded'));
    const res = await buy({});
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('SELLER_PAYMENTS_UNAVAILABLE');
    expect(charge).not.toHaveBeenCalled();
  });
  it('a missing card token', async () => {
    const res = await buy({ sourceId: '' });
    expect(res.statusCode).toBe(400);
    expect(charge).not.toHaveBeenCalled();
  });
});

describe('declines, replays and lost races', () => {
  it('a declined card is a 402 and records nothing', async () => {
    charge.mockResolvedValueOnce({ ok: false, code: 'GENERIC_DECLINE', message: 'Your card was declined.' });
    const res = await buy({});
    expect(res.statusCode).toBe(402);
    expect(res.body.code).toBe('SQUARE_PAYMENT_DECLINED');
    expect(db.purchase.rows).toHaveLength(0);
    expect(db.stock(lot).sold).toBe(0);
    expect(releaseCashDebtClaim).toHaveBeenCalledTimes(1);
  });

  it('a declined guest card is counted against the guest velocity guard', async () => {
    charge.mockResolvedValueOnce({ ok: false, code: 'GENERIC_DECLINE', message: 'Your card was declined.' });
    await buy({ guestEmail: 'g@example.com', guestName: 'G' }, null);
    expect(recordGuestCheckoutFailure).toHaveBeenCalledTimes(1);
  });

  it('the same retry token twice is one sale: the second call is a replay and charges nothing', async () => {
    const first = await buy({ packs: 1 });
    const second = await buy({ packs: 1, sourceId: 'cnon:card-2' });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.body).toMatchObject({ replay: true, purchaseId: first.body.purchaseId });
    expect(charge).toHaveBeenCalledTimes(1);
    expect(db.purchase.rows).toHaveLength(1);
    expect(db.stock(lot).sold).toBe(1000);
  });

  it('a new retry token is a new order', async () => {
    await buy({ clientToken: 'token-aaaa-1111' });
    await buy({ clientToken: 'token-bbbb-2222' });
    expect(db.purchase.rows).toHaveLength(2);
    expect(db.stock(lot).sold).toBe(2000);
  });

  it('cards that ran out after the charge: nothing recorded, full refund through the shared service, plain words', async () => {
    charge.mockImplementationOnce(async () => {
      db.item.rows.find((x: any) => x.id === lot).stockSold = 9500; // another sale lands while the card is being charged
      return { ok: true, paymentId: 'pay_race', status: 'COMPLETED', cardFingerprint: 'fp_1', riskLevel: null };
    });
    const res = await buy({ packs: 2 });
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'BULK_SOLD_OUT_AFTER_PAYMENT', charged: true, refunded: true, refundCents: 1600, squarePaymentId: 'pay_race' });
    expect(res.body.message).toContain('$16.00');
    expect(db.purchase.rows).toHaveLength(0);
    expect(db.stock(lot).sold).toBe(9500);
    const call = (settleOversoldPayment as jest.Mock).mock.calls[0][0];
    expect(call).toMatchObject({ kind: 'online-pack', refId: 'pay_race', paymentId: 'pay_race', processor: 'SQUARE', cardPaidCents: 1600, organizerProfileId: 'org1' });
    expect(call.settlement.fullRefund).toBe(true);
    expect(call.settlement.refundCardCents).toBe(1600);
    expect(notifyOversoldSettlement).toHaveBeenCalledTimes(1);
    expect(fireSquarePurchaseEngagement).not.toHaveBeenCalled();
  });

  it('when the automatic refund cannot be made, the shopper is told the shop was asked to refund', async () => {
    charge.mockImplementationOnce(async () => {
      db.item.rows.find((x: any) => x.id === lot).stockSold = 9500;
      return { ok: true, paymentId: 'pay_race', status: 'COMPLETED', cardFingerprint: null, riskLevel: null };
    });
    (settleOversoldPayment as jest.Mock).mockResolvedValueOnce({ status: 'MANUAL', refundCents: 800, reason: 'x', autoRefundDisabled: false });
    const res = await buy({ packs: 1 });
    expect(res.body).toMatchObject({ code: 'BULK_SOLD_OUT_AFTER_PAYMENT', charged: true, refunded: false });
    expect(res.body.message).toContain('asked to refund');
  });

  it('an unexpected recording failure with a clean rollback refunds in full and says so', async () => {
    db.purchase.create = async () => {
      throw new Error('connection reset');
    };
    const res = await buy({ packs: 1 });
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ code: 'BULK_RECORD_FAILED', charged: true, refunded: true });
    expect((settleOversoldPayment as jest.Mock).mock.calls[0][0]).toMatchObject({ kind: 'online-pack', refId: 'pay_1' });
    expect(db.stock(lot).sold).toBe(0);
  });
});

describe('what the controller hands on', () => {
  it('does not take over a lot that has no pack size, or an item that is not a lot', async () => {
    const plain = db.addLot({ title: 'Plain', price: 8, stockTotal: 10000, sale: sale() }).id;
    const res = makeRes();
    expect(await tryHandleBulkPackPayment({ body: { itemId: plain, sourceId: 's' } } as any, res)).toBe(false);
    expect(await tryHandleBulkPackPayment({ body: { itemId: 'not-a-lot', sourceId: 's' } } as any, res)).toBe(false);
    expect(await tryHandleBulkPackPayment({ body: {} } as any, res)).toBe(false);
    expect(await tryHandleBulkPackPayment({ body: { itemId: 42 } } as any, res)).toBe(false);
    expect(res.body).toBeUndefined();
    expect(charge).not.toHaveBeenCalled();
  });

  it('takes over a lot that has a pack size and answers the request itself', async () => {
    const res = makeRes();
    const handled = await tryHandleBulkPackPayment(makeReq({ packs: 1 }), res);
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(db.purchase.rows).toHaveLength(1);
  });

  it('falls through when the pack size lookup itself fails (the old refusal repeats its own fail closed check)', async () => {
    const original = db.itemBulkLot.findMany;
    db.itemBulkLot.findMany = async () => {
      throw new Error('column "packSize" does not exist');
    };
    const res = makeRes();
    expect(await tryHandleBulkPackPayment(makeReq({}), res)).toBe(false);
    db.itemBulkLot.findMany = original;
    expect(charge).not.toHaveBeenCalled();
  });
});
