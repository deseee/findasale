/**
 * QR payment link with a bulk lot (ADR-136 Addendum A, roadmap #659): posPaymentLinkRecorder.recordPosPaymentLinkSale.
 *
 * The link row carries the priced lot lines (POSPaymentLink.bulkLines). When the link is paid the recorder takes the cards
 * inside the SAME transaction that flips the link to COMPLETED and writes the Purchase rows. Proved here (Prisma, Square and
 * the cross-channel hooks are mocks; no payment or marketplace call is ever made):
 *   - the lot's cards come out with one guarded decrement for the whole quantity, in the transaction, and the Purchase row
 *     carries the cards and the server's priced amount (never Item.price, which is the price per 1,000)
 *   - a mixed link (lot plus ordinary item, two lots) records every row; lots are taken in item id order
 *   - a lot that sold out between the quote and the payment is refunded by ITS OWN priced share (not by Item.price), the rest of
 *     the link is recorded; when it is the whole link, the whole payment is refunded
 *   - a lot with no stored card count is NEVER sold as one unit: the whole payment is refunded and nothing is sold
 *   - a repeat delivery of the same payment (already COMPLETED, or a lost flip race) takes no cards and refunds nothing
 *   - the flag being off at payment time does not stop recording a payment that already went through
 */
const mockCaptureMessage = jest.fn();
jest.mock('@sentry/node', () => ({ captureMessage: (...a: any[]) => mockCaptureMessage(...a), captureException: jest.fn() }));
const mockNotificationCreate = jest.fn();
jest.mock('../lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    organizer: { findUnique: jest.fn() },
    item: { findMany: jest.fn() },
    notification: { create: (...a: any[]) => mockNotificationCreate(...a) },
  },
}));
jest.mock('../services/itemStockService', () => {
  class InsufficientStockError extends Error {
    constructor(...a: any[]) {
      super(String(a[0] ?? 'oversold'));
      this.name = 'InsufficientStockError';
    }
  }
  return { sellItemUnits: jest.fn(), sellItemUnitsInTransaction: jest.fn(), InsufficientStockError };
});
jest.mock('../controllers/ebayController', () => ({ endEbayListingIfExists: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/shopifyService', () => ({ markShopifyItemSold: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/marketplace/discogsListingConnector', () => ({ withdrawDiscogsListingIfExists: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/marketplace/reverbConnector', () => ({ withdrawReverbListingIfExists: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/marketplace/etsyConnector', () => ({ withdrawEtsyListingIfExists: jest.fn().mockResolvedValue('skipped') }));
jest.mock('../services/facebookNudgeService', () => ({ notifyFacebookExportedItemSold: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/marketplaceStockSyncService', () => ({ syncMarketplaceStock: jest.fn().mockResolvedValue(undefined) }));
const mockCreateNotification = jest.fn().mockResolvedValue(undefined);
jest.mock('../lib/notificationService', () => ({ createNotification: (...a: any[]) => mockCreateNotification(...a) }));
jest.mock('../services/stripeConnectService', () => ({ shouldUseDirectCharge: jest.fn().mockResolvedValue(false) }));
jest.mock('../utils/stripe', () => ({ getStripe: () => ({ paymentLinks: { update: jest.fn().mockResolvedValue({}) } }) }));
jest.mock('../services/squareCheckoutLinkService', () => ({ deleteSquareCheckoutLink: jest.fn().mockResolvedValue({ ok: true }) }));
const mockRefund = jest.fn();
jest.mock('../services/squareDeadInvoiceRefundService', () => ({
  refundSquarePaymentForDeadInvoice: (...a: any[]) => mockRefund(...a),
  squareDeadInvoiceAutoRefundDisabled: () => false,
}));
jest.mock('../lib/transactionalEmailService', () => ({ transactionalEmailService: { emails: { send: jest.fn().mockResolvedValue(undefined) } } }));

import { prisma } from '../lib/prisma';
import { sellItemUnits, sellItemUnitsInTransaction, InsufficientStockError } from '../services/itemStockService';
import { syncMarketplaceStock } from '../services/marketplaceStockSyncService';
import { endEbayListingIfExists } from '../controllers/ebayController';
import { recordPosPaymentLinkSale } from '../services/posPaymentLinkRecorder';

const db: any = prisma;
const flush = () => new Promise((r) => setImmediate(r));

const ITEMS = [
  { id: 'lot1', title: 'MTG commons', price: 8, saleId: 'sale_1', ownerOrg: 'org_1' },
  { id: 'lot2', title: 'MTG uncommons', price: 12, saleId: 'sale_1', ownerOrg: 'org_1' },
  { id: 'single1', title: 'Lightning Bolt', price: 2, saleId: 'sale_1', ownerOrg: 'org_1' },
];
const LINE1 = { itemId: 'lot1', cards: 1500, cents: 1200, pricePerThousandCents: 800 };
const LINE2 = { itemId: 'lot2', cards: 500, cents: 600, pricePerThousandCents: 1200 };

const link = (over: any = {}) => ({
  id: 'link_1', organizerId: 'org_1', saleId: 'sale_1', processor: 'SQUARE', stripePaymentLinkId: null,
  squarePaymentLinkId: 'sq_1', status: 'ACTIVE', amount: 1200, itemIds: ['lot1'], bulkLines: [LINE1],
  chargeType: 'DESTINATION', stripeAccountId: null, isSplitPayment: false, cashAmountCents: null, cardAmountCents: null, ...over,
});

function makeTx(l: any, lotIds: string[] = ['lot1', 'lot2']) {
  const purchases: any[] = [];
  const tx: any = {
    pOSPaymentLink: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUnique: jest.fn().mockResolvedValue(l), update: jest.fn().mockResolvedValue({}) },
    sale: { findUnique: jest.fn().mockResolvedValue({ organizerId: l.organizerId, organizer: { subscriptionTier: 'SIMPLE', stripeConnectId: null, referralDiscountExpiry: null } }) },
    item: {
      findMany: jest.fn().mockImplementation(async ({ where }: any) =>
        ITEMS.filter((it) => where.id.in.includes(it.id) && (where.saleId === undefined || it.saleId === where.saleId) && (where.sale === undefined || it.ownerOrg === where.sale.organizerId))
      ),
    },
    itemBulkLot: { findMany: jest.fn().mockImplementation(async ({ where }: any) => lotIds.filter((id) => where.itemId.in.includes(id)).map((itemId) => ({ itemId }))) },
    purchase: { create: jest.fn().mockImplementation(async ({ data }: any) => { purchases.push(data); return { id: `pur_${purchases.length}` }; }) },
    cashFeeAccrual: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    organizer: { update: jest.fn().mockResolvedValue({}) },
  };
  return { tx, purchases };
}

/** Lots sell via the in-transaction decrement; ids listed here throw the real oversold error. */
const oversellLots = (...ids: string[]) =>
  (sellItemUnitsInTransaction as jest.Mock).mockImplementation(async (_tx: any, id: string, cards: number) => {
    if (ids.includes(id)) throw new (InsufficientStockError as any)(`no cards left in ${id}`);
    return { fullySoldOut: false, remainingStock: 100 - cards };
  });

let lastTx: any;
const run = async (l: any, lotIds?: string[]) => {
  const { tx, purchases } = makeTx(l, lotIds);
  lastTx = tx;
  db.$transaction.mockImplementation(async (cb: any) => cb(tx));
  const res = await recordPosPaymentLinkSale(l, { source: 'webhook', processor: 'SQUARE', externalPaymentId: 'sqpay_1' });
  await flush();
  return { res, purchases };
};

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.CARD_BULK_LOTS_ENABLED;
  db.organizer.findUnique.mockResolvedValue({ userId: 'user_1' });
  mockNotificationCreate.mockResolvedValue({});
  mockRefund.mockResolvedValue({ attempted: true, refunded: true, reason: 'REFUNDED_PARTIAL', refundId: 'ref_1' });
  (sellItemUnits as jest.Mock).mockResolvedValue({ fullySoldOut: true, remainingStock: 0 });
  oversellLots();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('recordPosPaymentLinkSale, a paid link that holds a bulk lot', () => {
  it('takes 1,500 cards with one guarded decrement inside the transaction and records the priced amount with the cards', async () => {
    process.env.CARD_BULK_LOTS_ENABLED = 'true';
    const { res, purchases } = await run(link());
    expect(res.recorded).toBe(true);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(sellItemUnitsInTransaction).toHaveBeenCalledTimes(1);
    const [txArg, itemId, cards] = (sellItemUnitsInTransaction as jest.Mock).mock.calls[0];
    expect(txArg).toBe(lastTx); // the recorder's own transaction client, so a rollback gives the cards back
    expect([itemId, cards]).toEqual(['lot1', 1500]);
    expect(sellItemUnits).not.toHaveBeenCalled(); // never "one unit" of a lot
    expect(purchases).toHaveLength(1);
    expect(purchases[0]).toMatchObject({ itemId: 'lot1', amount: 12, bulkQuantity: 1500, status: 'PAID', source: 'POS', processor: 'SQUARE', squarePaymentId: 'sqpay_1' });
    expect(res.purchaseIds).toEqual(['pur_1']);
    expect(res.oversoldItemIds).toEqual([]);
    expect(mockRefund).not.toHaveBeenCalled();
    // A partial sale revises the quantity listed elsewhere and does not withdraw the lot.
    expect(syncMarketplaceStock).toHaveBeenCalledWith('lot1', { fullySoldOut: false, remainingStock: -1400 });
    expect(endEbayListingIfExists).not.toHaveBeenCalled();
  });

  it('records a payment that already went through even if the flag has been turned off since', async () => {
    delete process.env.CARD_BULK_LOTS_ENABLED;
    const { res, purchases } = await run(link());
    expect(res.recorded).toBe(true);
    expect(purchases[0].bulkQuantity).toBe(1500);
    expect(sellItemUnitsInTransaction).toHaveBeenCalledWith(expect.anything(), 'lot1', 1500);
  });

  it('computes the platform fee on the priced cents, not on Item.price (8 dollars per 1,000)', async () => {
    const { purchases } = await run(link());
    // SIMPLE tier online rate on $12.00. If Item.price (8) had been used the fee would be computed on $8.00.
    const fee12 = purchases[0].platformFeeAmount;
    const { purchases: p2 } = await run(link({ id: 'link_2', amount: 800, itemIds: ['lot1'], bulkLines: [{ ...LINE1, cards: 1000, cents: 800 }] }));
    expect(fee12).toBeGreaterThan(p2[0].platformFeeAmount);
    expect(fee12 / 12).toBeCloseTo(p2[0].platformFeeAmount / 8, 2);
  });

  it('mixed link: the lot at its priced amount and an ordinary item at its price, both recorded, the single sold as one unit', async () => {
    const { res, purchases } = await run(link({ amount: 1400, itemIds: ['lot1', 'single1'] }));
    expect(res.recorded).toBe(true);
    expect(purchases.map((p) => [p.itemId, p.amount, p.bulkQuantity])).toEqual([
      ['lot1', 12, 1500],
      ['single1', 2, undefined],
    ]);
    expect(sellItemUnits).toHaveBeenCalledTimes(1);
    expect((sellItemUnits as jest.Mock).mock.calls[0].slice(0, 2)).toEqual(['single1', 1]);
  });

  it('two lots on one link are taken in item id order whatever order the link lists them', async () => {
    const { purchases } = await run(link({ amount: 1800, itemIds: ['lot2', 'lot1'], bulkLines: [LINE2, LINE1] }));
    expect((sellItemUnitsInTransaction as jest.Mock).mock.calls.map((c) => c[1])).toEqual(['lot1', 'lot2']);
    expect(purchases.map((p) => [p.itemId, p.amount, p.bulkQuantity]).sort()).toEqual([
      ['lot1', 12, 1500],
      ['lot2', 6, 500],
    ]);
  });

  it('the last cards sold withdraw the lot from the other channels', async () => {
    (sellItemUnitsInTransaction as jest.Mock).mockResolvedValue({ fullySoldOut: true, remainingStock: 0 });
    await run(link());
    expect(endEbayListingIfExists).toHaveBeenCalledWith('lot1');
    expect(syncMarketplaceStock).not.toHaveBeenCalled();
  });

  it('split tender: the cash leg is spread by the priced amounts (12.00 and 2.00), not by Item.price', async () => {
    // 14.00 sale = 9.80 card + 4.20 cash. Weights 1200:200 give cash shares 3.60 and 0.60.
    const { purchases } = await run(link({ amount: 980, itemIds: ['lot1', 'single1'], isSplitPayment: true, cashAmountCents: 420, cardAmountCents: 980 }));
    const byItem = Object.fromEntries(purchases.map((p) => [p.itemId, p]));
    expect(byItem.lot1.cashLegAmount).toBeCloseTo(3.6, 2);
    expect(byItem.single1.cashLegAmount).toBeCloseTo(0.6, 2);
  });
});

describe('recordPosPaymentLinkSale, a lot that sold out before the payment was recorded', () => {
  it('the lot alone: the whole payment is refunded, no Purchase row, no cards taken, no "payment received" notice', async () => {
    oversellLots('lot1');
    const { res, purchases } = await run(link());
    expect(res.recorded).toBe(true);
    expect(res.oversoldItemIds).toEqual(['lot1']);
    expect(purchases).toHaveLength(0);
    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect(mockRefund.mock.calls[0][0]).toMatchObject({ paymentId: 'sqpay_1', organizerId: 'org_1', expectedAmountCents: 1200, kind: 'oversold:pos-link:link_1' });
    expect(mockRefund.mock.calls[0][0].refundAmountCents).toBeUndefined(); // full refund
    expect(res.oversoldSettlement).toMatchObject({ status: 'REFUNDED', refundCents: 1200, fullRefund: true });
    expect(mockCreateNotification.mock.calls.map((c) => c[0].type)).not.toContain('payment_received');
  });

  it('mixed link: only the lot\'s own priced share (12.00 of 14.00) is refunded and the single is still recorded', async () => {
    oversellLots('lot1');
    const { res, purchases } = await run(link({ amount: 1400, itemIds: ['lot1', 'single1'] }));
    expect(purchases.map((p) => p.itemId)).toEqual(['single1']);
    expect(mockRefund.mock.calls[0][0]).toMatchObject({ refundAmountCents: 1200, expectedAmountCents: 1400 });
    expect(res.oversoldSettlement).toMatchObject({ status: 'REFUNDED', refundCents: 1200, fullRefund: false });
    expect(res.oversoldItemIds).toEqual(['lot1']);
  });

  it('two lots, one sold out: that lot\'s share is refunded and the other lot is recorded with its cards', async () => {
    oversellLots('lot2');
    const { res, purchases } = await run(link({ amount: 1800, itemIds: ['lot1', 'lot2'], bulkLines: [LINE1, LINE2] }));
    expect(purchases.map((p) => [p.itemId, p.bulkQuantity])).toEqual([['lot1', 1500]]);
    expect(mockRefund.mock.calls[0][0]).toMatchObject({ refundAmountCents: 600, expectedAmountCents: 1800 });
    expect(res.oversoldSettlement).toMatchObject({ refundCents: 600, fullRefund: false });
  });

  it('a refund that cannot be issued automatically becomes a manual-refund notice, and the rest still recorded', async () => {
    mockRefund.mockResolvedValue({ attempted: true, refunded: false, reason: 'REFUND_FAILED (BAD_REQUEST)' });
    oversellLots('lot1');
    const { res } = await run(link({ amount: 1400, itemIds: ['lot1', 'single1'] }));
    expect(res.oversoldSettlement?.status).toBe('MANUAL');
    expect(mockNotificationCreate.mock.calls[0][0].data.body).toContain('$12.00');
  });

  it('an error that is not "sold out" aborts the whole transaction (the link stays unrecorded for the retry)', async () => {
    (sellItemUnitsInTransaction as jest.Mock).mockRejectedValue(new Error('connection reset'));
    await expect(run(link())).rejects.toThrow('connection reset');
    expect(mockRefund).not.toHaveBeenCalled();
  });
});

describe('recordPosPaymentLinkSale, a lot with no stored card count', () => {
  it('is never sold as one unit: the payment is refunded in full and nothing is sold or recorded', async () => {
    const { res, purchases } = await run(link({ bulkLines: null, itemIds: ['lot1', 'single1'], amount: 1400 }));
    expect(sellItemUnitsInTransaction).not.toHaveBeenCalled();
    expect(sellItemUnits).not.toHaveBeenCalled();
    expect(purchases).toHaveLength(0);
    expect(res.oversoldItemIds.sort()).toEqual(['lot1', 'single1']);
    expect(res.oversoldSettlement).toMatchObject({ status: 'REFUNDED', fullRefund: true, refundCents: 1400 });
    expect(mockCaptureMessage).toHaveBeenCalledWith(expect.stringContaining('no stored card count'), expect.anything());
  });

  it('a damaged stored value is treated the same way', async () => {
    const { res } = await run(link({ bulkLines: [{ itemId: 'lot1', cards: 0, cents: 1200 }, 'junk'] }));
    expect(sellItemUnitsInTransaction).not.toHaveBeenCalled();
    expect(res.oversoldSettlement).toMatchObject({ fullRefund: true });
  });
});

describe('recordPosPaymentLinkSale, repeat deliveries of one payment', () => {
  it('a second delivery for an already COMPLETED link takes no cards and refunds nothing', async () => {
    const res = await recordPosPaymentLinkSale(link({ status: 'COMPLETED' }), { source: 'webhook', processor: 'SQUARE', externalPaymentId: 'sqpay_1' });
    expect(res.alreadyCompleted).toBe(true);
    expect(sellItemUnitsInTransaction).not.toHaveBeenCalled();
    expect(mockRefund).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('two deliveries racing: the one that loses the guarded flip to COMPLETED takes no cards', async () => {
    const l = link();
    const { tx, purchases } = makeTx(l);
    tx.pOSPaymentLink.updateMany.mockResolvedValue({ count: 0 });
    db.$transaction.mockImplementation(async (cb: any) => cb(tx));
    const res = await recordPosPaymentLinkSale(l, { source: 'reconcile', processor: 'SQUARE', externalPaymentId: 'sqpay_1' });
    expect(res.recorded).toBe(false);
    expect(sellItemUnitsInTransaction).not.toHaveBeenCalled();
    expect(purchases).toHaveLength(0);
    expect(mockRefund).not.toHaveBeenCalled();
  });
});
