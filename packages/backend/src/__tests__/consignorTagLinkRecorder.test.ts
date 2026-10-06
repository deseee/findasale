/**
 * posPaymentLinkRecorder.recordPosPaymentLinkSale with consignor price tags (2026-10-06).
 * NOT EXECUTED when written (jest cannot run on the authoring device); CI is the first real run.
 * Same mocking style as posPaymentLinkRecorderScope.test.ts. consignorTagService is REAL.
 * Proves: the COMPLETED flip, the minted SOLD CONSIGNOR_TAG item and its Purchase row (carrying itemId) land in ONE transaction; a lost
 * flip race or an already-COMPLETED link mints nothing; a tag line never sells stock; the platform fee lands on the tag row.
 */
const mockCaptureMessage = jest.fn();
jest.mock('@sentry/node', () => ({ captureMessage: (...a: any[]) => mockCaptureMessage(...a), captureException: jest.fn() }));
jest.mock('../lib/prisma', () => ({
  prisma: { $transaction: jest.fn(), organizer: { findUnique: jest.fn() }, item: { findMany: jest.fn() }, pOSPaymentLink: { updateMany: jest.fn() } },
}));
jest.mock('../services/itemStockService', () => {
  class InsufficientStockError extends Error {}
  return { sellItemUnits: jest.fn(), sellItemUnitsInTransaction: jest.fn(), InsufficientStockError };
});
jest.mock('../controllers/ebayController', () => ({ endEbayListingIfExists: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/shopifyService', () => ({ markShopifyItemSold: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/marketplace/discogsListingConnector', () => ({ withdrawDiscogsListingIfExists: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/marketplace/reverbConnector', () => ({ withdrawReverbListingIfExists: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/marketplace/etsyConnector', () => ({ withdrawEtsyListingIfExists: jest.fn().mockResolvedValue('skipped') }));
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

const TAG_LINE = { consignorId: 'con1', nonce: 'nonce1', sig: 'stored-sig', priceCents: 500 };

const link = (over: any = {}) => ({
  id: 'link_1', organizerId: 'org_1', saleId: 'sale_1', processor: 'SQUARE', stripePaymentLinkId: null,
  squarePaymentLinkId: 'sq_1', status: 'ACTIVE', amount: 500, itemIds: [] as string[],
  chargeType: 'DESTINATION', stripeAccountId: null, isSplitPayment: false, cashAmountCents: null, cardAmountCents: null,
  consignorLines: [TAG_LINE], ...over,
});

let purchases: any[];
let minted: any[];
let linkUpdates: any[];
let txCalls: number;

function makeTx(l: any, flipCount = 1) {
  return {
    $executeRaw: jest.fn().mockResolvedValue(1),
    pOSPaymentLink: {
      updateMany: jest.fn().mockResolvedValue({ count: flipCount }),
      findUnique: jest.fn().mockResolvedValue(l),
      update: jest.fn().mockImplementation(async (arg: any) => {
        linkUpdates.push(arg.data);
        return {};
      }),
    },
    sale: {
      findUnique: jest.fn().mockResolvedValue({
        organizerId: l.organizerId,
        organizer: { subscriptionTier: 'TEAMS', stripeConnectId: null, referralDiscountExpiry: null },
      }),
    },
    item: {
      findFirst: jest.fn().mockImplementation(async ({ where }: any) => minted.find((i) => i.saleId === where.saleId && i.sku === where.sku) ?? null),
      create: jest.fn().mockImplementation(async ({ data }: any) => {
        const row = { id: `tagitem_${minted.length + 1}`, ...data };
        minted.push(row);
        return { id: row.id };
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    consignor: { findFirst: jest.fn().mockResolvedValue({ id: 'con1', archivedAt: null }) },
    purchase: {
      create: jest.fn().mockImplementation(async ({ data }: any) => {
        const row = { id: `pur_${purchases.length + 1}`, ...data };
        purchases.push(row);
        return row;
      }),
    },
    cashFeeAccrual: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    organizer: { update: jest.fn().mockResolvedValue({}) },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  purchases = [];
  minted = [];
  linkUpdates = [];
  txCalls = 0;
  (sellItemUnits as jest.Mock).mockResolvedValue({ fullySoldOut: true, remainingStock: 0 });
  db.organizer.findUnique.mockResolvedValue({ userId: 'user_1' });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('recordPosPaymentLinkSale, consignor price tag lines', () => {
  it('a tag-only link flips COMPLETED, mints one SOLD tag item and writes its Purchase row carrying itemId, in ONE transaction', async () => {
    const l = link();
    const tx = makeTx(l);
    db.$transaction.mockImplementation(async (cb: any) => {
      txCalls += 1;
      return cb(tx);
    });
    const res = await recordPosPaymentLinkSale(l as any, { source: 'webhook', processor: 'SQUARE', externalPaymentId: 'sq_pay' });
    await flush();

    expect(txCalls).toBe(1);
    expect(tx.pOSPaymentLink.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }));
    expect(res.recorded).toBe(true);
    expect(minted).toHaveLength(1);
    expect(minted[0]).toMatchObject({
      listingType: 'CONSIGNOR_TAG',
      status: 'SOLD',
      consignorId: 'con1',
      saleId: 'sale_1',
      organizerId: 'org_1',
      price: 5,
      sku: 'CTAG-sq_pay-nonce1',
    });
    expect(minted[0].vendorBoothId).toBeUndefined(); // single-sale POS: no booth
    expect(purchases).toHaveLength(1);
    expect(purchases[0]).toMatchObject({ itemId: minted[0].id, amount: 5, status: 'PAID', processor: 'SQUARE', squarePaymentId: 'sq_pay' });
    expect(res.purchaseIds).toEqual(['pur_1']);
    expect(linkUpdates).toContainEqual({ purchaseIds: ['pur_1'] });
    // A tag has no stock and no listing anywhere.
    expect(sellItemUnits).not.toHaveBeenCalled();
  });

  it('the whole platform fee on the payment lands on the tag row (nothing is left on a misc row)', async () => {
    const l = link();
    const tx = makeTx(l);
    db.$transaction.mockImplementation(async (cb: any) => cb(tx));
    await recordPosPaymentLinkSale(l as any, { source: 'webhook', processor: 'SQUARE', externalPaymentId: 'sq_pay' });
    await flush();
    expect(purchases).toHaveLength(1); // misc remainder is 500 - 500 = 0, so no misc row
    expect(purchases[0].platformFeeAmount).toBeGreaterThan(0);
  });

  it('a lost flip race (another path already recorded it) mints nothing and writes nothing', async () => {
    const l = link();
    const tx = makeTx(l, 0);
    db.$transaction.mockImplementation(async (cb: any) => cb(tx));
    const res = await recordPosPaymentLinkSale(l as any, { source: 'reconcile', processor: 'SQUARE', externalPaymentId: 'sq_pay' });
    await flush();
    expect(res.recorded).toBe(false);
    expect(minted).toHaveLength(0);
    expect(purchases).toHaveLength(0);
  });

  it('an already COMPLETED link returns on the fast path before any transaction', async () => {
    const l = link({ status: 'COMPLETED' });
    const res = await recordPosPaymentLinkSale(l as any, { source: 'webhook', processor: 'SQUARE', externalPaymentId: 'sq_pay' });
    expect(res).toMatchObject({ recorded: false, alreadyCompleted: true });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(minted).toHaveLength(0);
  });

  it('re-delivery of the same payment (the sku already exists) reuses the minted item and does not create a second one', async () => {
    const l = link();
    db.$transaction.mockImplementation(async (cb: any) => cb(makeTx(l)));
    await recordPosPaymentLinkSale(l as any, { source: 'webhook', processor: 'SQUARE', externalPaymentId: 'sq_pay' });
    // A second transaction that wins its own flip (the first one rolled back in a real crash) finds the same sku.
    db.$transaction.mockImplementation(async (cb: any) => cb(makeTx(l)));
    await recordPosPaymentLinkSale(l as any, { source: 'reconcile', processor: 'SQUARE', externalPaymentId: 'sq_pay' });
    await flush();
    expect(minted).toHaveLength(1);
  });
});
