/**
 * posPaymentLinkRecorder.recordPosPaymentLinkSale, item scope (money review P1-4/5, 2026-09-29).
 * A payment link stores raw itemIds. The recorder used to load and sell whatever ids the link listed,
 * with no sale or organizer filter, so a link created with another tenant's item id sold that item and
 * wrote a PAID Purchase against the foreign sale. Every item query is now pinned to the link's own sale
 * AND organizer; a foreign id is excluded, never sold, and reported to Sentry.
 */

const mockCaptureMessage = jest.fn();
jest.mock('@sentry/node', () => ({ captureMessage: (...a: any[]) => mockCaptureMessage(...a), captureException: jest.fn() }));
jest.mock('../lib/prisma', () => ({
  prisma: { $transaction: jest.fn(), organizer: { findUnique: jest.fn() }, item: { findMany: jest.fn() } },
}));
jest.mock('../services/itemStockService', () => {
  class InsufficientStockError extends Error {}
  return { sellItemUnits: jest.fn(), InsufficientStockError };
});
jest.mock('../controllers/ebayController', () => ({ endEbayListingIfExists: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/shopifyService', () => ({ markShopifyItemSold: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/marketplace/discogsListingConnector', () => ({ withdrawDiscogsListingIfExists: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/marketplace/reverbConnector', () => ({ withdrawReverbListingIfExists: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/marketplace/etsyConnector', () => ({ withdrawEtsyListingIfExists: jest.fn().mockResolvedValue('skipped') })); // ADR-135: soldFanOutService/itemDeletionService now import it
jest.mock('../services/facebookNudgeService', () => ({ notifyFacebookExportedItemSold: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/marketplaceStockSyncService', () => ({ syncMarketplaceStock: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/stripeConnectService', () => ({ shouldUseDirectCharge: jest.fn().mockResolvedValue(false) }));
jest.mock('../utils/stripe', () => ({ getStripe: () => ({ paymentLinks: { update: jest.fn().mockResolvedValue({}) } }) }));
jest.mock('../services/squareCheckoutLinkService', () => ({ deleteSquareCheckoutLink: jest.fn().mockResolvedValue({ ok: true }) }));

import { prisma } from '../lib/prisma';
import { sellItemUnits } from '../services/itemStockService';
import { recordPosPaymentLinkSale } from '../services/posPaymentLinkRecorder';

const db: any = prisma;
const flush = () => new Promise((r) => setImmediate(r));

const link = (over: any = {}) => ({
  id: 'link_1', organizerId: 'org_1', saleId: 'sale_1', processor: 'SQUARE', stripePaymentLinkId: null,
  squarePaymentLinkId: 'sq_1', status: 'ACTIVE', amount: 10000, itemIds: ['mine1', 'mine2', 'foreign'],
  chargeType: 'DESTINATION', stripeAccountId: null, isSplitPayment: false, cashAmountCents: null, cardAmountCents: null, ...over,
});

const ALL_ITEMS = [
  { id: 'mine1', title: 'Lamp', price: 60, saleId: 'sale_1', ownerOrg: 'org_1' },
  { id: 'mine2', title: 'Chair', price: 40, saleId: 'sale_1', ownerOrg: 'org_1' },
  { id: 'foreign', title: 'Their item', price: 500, saleId: 'sale_9', ownerOrg: 'org_9' },
];

/** Answers each item query the way Postgres would: honoring saleId + sale.organizerId when present. */
function makeTx(l: any) {
  const queries: any[] = [];
  const purchases: any[] = [];
  const tx: any = {
    pOSPaymentLink: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue(l),
      update: jest.fn().mockResolvedValue({}),
    },
    sale: {
      findUnique: jest.fn().mockResolvedValue({
        organizerId: l.organizerId,
        organizer: { subscriptionTier: 'SIMPLE', stripeConnectId: null, referralDiscountExpiry: null },
      }),
    },
    item: {
      findMany: jest.fn().mockImplementation(async ({ where }: any) => {
        queries.push(where);
        return ALL_ITEMS.filter(
          (it) =>
            where.id.in.includes(it.id) &&
            (where.saleId === undefined || it.saleId === where.saleId) &&
            (where.sale === undefined || it.ownerOrg === where.sale.organizerId)
        );
      }),
    },
    purchase: {
      create: jest.fn().mockImplementation(async ({ data }: any) => {
        purchases.push(data);
        return { id: `pur_${purchases.length}` };
      }),
    },
    cashFeeAccrual: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    organizer: { update: jest.fn().mockResolvedValue({}) },
  };
  return { tx, queries, purchases };
}

beforeEach(() => {
  jest.clearAllMocks();
  (sellItemUnits as jest.Mock).mockResolvedValue({ fullySoldOut: true, remainingStock: 0 });
  db.organizer.findUnique.mockResolvedValue({ userId: 'user_1' });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('recordPosPaymentLinkSale item scope', () => {
  it('every item query carries the link sale id AND organizer id', async () => {
    const l = link();
    const { tx, queries } = makeTx(l);
    db.$transaction.mockImplementation(async (cb: any) => cb(tx));
    await recordPosPaymentLinkSale(l, { source: 'webhook', processor: 'SQUARE', externalPaymentId: 'sq_pay' });
    await flush();
    expect(queries.length).toBeGreaterThanOrEqual(2);
    queries.forEach((w) => {
      expect(w.saleId).toBe('sale_1');
      expect(w.sale).toEqual({ organizerId: 'org_1' });
    });
  });

  it('a foreign item id is never sold and gets no Purchase row; the link items that are ours still record', async () => {
    const l = link();
    const { tx, purchases } = makeTx(l);
    db.$transaction.mockImplementation(async (cb: any) => cb(tx));
    const res = await recordPosPaymentLinkSale(l, { source: 'webhook', processor: 'SQUARE', externalPaymentId: 'sq_pay' });
    await flush();
    expect(res.recorded).toBe(true);
    const soldIds = (sellItemUnits as jest.Mock).mock.calls.map((c) => c[0]);
    expect(soldIds.sort()).toEqual(['mine1', 'mine2']);
    expect(purchases.map((p) => p.itemId).sort()).toEqual(['mine1', 'mine2']);
    expect(purchases.reduce((s, p) => s + p.amount, 0)).toBe(100); // the $500 foreign item is not in the books
  });

  it('reports the foreign id to Sentry', async () => {
    const l = link();
    const { tx } = makeTx(l);
    db.$transaction.mockImplementation(async (cb: any) => cb(tx));
    await recordPosPaymentLinkSale(l, { source: 'webhook', processor: 'SQUARE', externalPaymentId: 'sq_pay' });
    await flush();
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      expect.stringContaining('outside its sale scope'),
      expect.objectContaining({ level: 'error', extra: expect.objectContaining({ foreignItemIds: ['foreign'] }) })
    );
  });

  it('a link whose items are all in scope reports nothing', async () => {
    const l = link({ itemIds: ['mine1', 'mine2'] });
    const { tx } = makeTx(l);
    db.$transaction.mockImplementation(async (cb: any) => cb(tx));
    await recordPosPaymentLinkSale(l, { source: 'webhook', processor: 'SQUARE', externalPaymentId: 'sq_pay' });
    await flush();
    expect(mockCaptureMessage).not.toHaveBeenCalled();
    expect((sellItemUnits as jest.Mock).mock.calls).toHaveLength(2);
  });
});
