/**
 * Consignor price tags on the cash / Venmo / Zelle path (processCashSaleCore).
 * NOT EXECUTED when written (jest cannot run on the authoring device); CI is the first real run.
 * Same mocking style as bulkLotCashSale.test.ts. consignorTagService is REAL (signatures are genuinely signed and verified).
 * Proves:
 *   - a tag line mints a photo-less SOLD CONSIGNOR_TAG Item (consignorId, organizerId, saleId, no booth) and writes a Purchase row that carries its itemId, in ONE transaction
 *   - a replay (same clientTransactionId) writes and mints nothing more
 *   - tag lines are outside the discount base and are never discounted
 *   - a tampered price, a foreign consignor and a sale the caller does not own are refused before anything is written
 */
jest.mock('@sentry/node', () => ({ captureException: jest.fn() }));
jest.mock('../middleware/auth', () => ({}));
jest.mock('../utils/posAuth', () => ({ resolveOrganizerOrTeamMember: jest.fn() }));
jest.mock('../lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    purchase: { findMany: jest.fn(), create: jest.fn() },
    item: { findMany: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    itemBulkLot: { findMany: jest.fn() },
    organizer: { findUnique: jest.fn() },
    sale: { findUnique: jest.fn() },
    organizerWorkspace: { findFirst: jest.fn() },
    consignor: { findMany: jest.fn() },
  },
}));
jest.mock('../services/itemStockService', () => {
  class InsufficientStockError extends Error {}
  return { InsufficientStockError, sellItemUnits: jest.fn(), sellItemUnitsInTransaction: jest.fn() };
});
jest.mock('../utils/feeCalculator', () => ({ snapshotForCommissionOnly: jest.fn() }));
jest.mock('../services/cashFeeService', () => ({
  resolveCashCommissionRate: jest.fn(),
  cashCommissionOn: jest.fn(),
  accrueCashFeeBalance: jest.fn(),
}));
jest.mock('../services/posDiscountService', () => ({ resolvePosDiscount: jest.fn() }));
jest.mock('../controllers/ebayController', () => ({ endEbayListingIfExists: jest.fn() }));
jest.mock('../services/shopifyService', () => ({ markShopifyItemSold: jest.fn() }));
jest.mock('../services/marketplace/discogsListingConnector', () => ({ withdrawDiscogsListingIfExists: jest.fn() }));
jest.mock('../services/marketplace/reverbConnector', () => ({ withdrawReverbListingIfExists: jest.fn() }));
jest.mock('../services/facebookNudgeService', () => ({ notifyFacebookExportedItemSold: jest.fn() }));
jest.mock('../services/marketplaceStockSyncService', () => ({ syncMarketplaceStock: jest.fn() }));
jest.mock('../lib/transactionalEmailService', () => ({ transactionalEmailService: { emails: { send: jest.fn() } } }));
jest.mock('../services/checkoutGuard', () => ({ recordSuspectedSignal: jest.fn() }));

import { prisma } from '../lib/prisma';
import { sellItemUnits } from '../services/itemStockService';
import { endEbayListingIfExists } from '../controllers/ebayController';
import { markShopifyItemSold } from '../services/shopifyService';
import { withdrawDiscogsListingIfExists } from '../services/marketplace/discogsListingConnector';
import { withdrawReverbListingIfExists } from '../services/marketplace/reverbConnector';
import { notifyFacebookExportedItemSold } from '../services/facebookNudgeService';
import { syncMarketplaceStock } from '../services/marketplaceStockSyncService';
import { resolvePosDiscount } from '../services/posDiscountService';
import { resolveCashCommissionRate, cashCommissionOn, accrueCashFeeBalance } from '../services/cashFeeService';
import { snapshotForCommissionOnly } from '../utils/feeCalculator';
import { signTag } from '../services/consignorTagService';
import { processCashSaleCore } from '../controllers/cashPaymentController';

const db = prisma as any;
const asMock = (fn: unknown) => fn as jest.Mock;

const ORGANIZER = { id: 'org1', subscriptionTier: 'TEAMS' };
const SINGLE_ROW = { id: 'single1', title: 'Lightning Bolt', status: 'AVAILABLE', draftStatus: null, price: 2.5, stockTotal: null, stockSold: 0 };

let purchases: any[];
let mintedItems: any[];
let txCalls: number;
let lockKeys: string[];

function makeTx() {
  return {
    $executeRaw: jest.fn(async (_s: TemplateStringsArray, key: string) => {
      lockKeys.push(key);
      return 1;
    }),
    purchase: {
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `purchase_${purchases.length + 1}`, ...data };
        purchases.push(row);
        return row;
      }),
    },
    item: {
      findFirst: jest.fn(async ({ where }: any) => mintedItems.find((i) => i.saleId === where.saleId && i.sku === where.sku) ?? null),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `tagitem_${mintedItems.length + 1}`, ...data };
        mintedItems.push(row);
        return { id: row.id };
      }),
    },
    consignor: { findFirst: jest.fn(async () => ({ id: 'con1', archivedAt: null })) },
  };
}

function signedTag(over: Partial<{ saleId: string; consignorId: string; priceCents: number; nonce: string }> = {}) {
  const f = { saleId: 'sale1', consignorId: 'con1', priceCents: 500, nonce: 'nonce1', ...over };
  return { consignorId: f.consignorId, nonce: f.nonce, sig: signTag(f) };
}

beforeEach(() => {
  jest.resetAllMocks();
  process.env.POS_CONSIGNOR_TAGS_ENABLED = 'true';
  process.env.POS_TAG_SIGNING_SECRET = 'cash-test-secret';
  purchases = [];
  mintedItems = [];
  txCalls = 0;
  lockKeys = [];
  db.$transaction.mockImplementation(async (cb: any) => {
    txCalls += 1;
    const snapshot = { p: purchases.slice(), m: mintedItems.slice() };
    try {
      return await cb(makeTx());
    } catch (err) {
      purchases = snapshot.p;
      mintedItems = snapshot.m;
      throw err;
    }
  });
  db.purchase.findMany.mockResolvedValue([]);
  db.purchase.create.mockImplementation(async ({ data }: any) => {
    const row = { id: `purchase_${purchases.length + 1}`, ...data };
    purchases.push(row);
    return row;
  });
  db.item.findMany.mockResolvedValue([SINGLE_ROW]);
  db.itemBulkLot.findMany.mockResolvedValue([]);
  db.organizer.findUnique.mockResolvedValue({ cashFeeBalance: 0, cashFeeBalanceUpdatedAt: null });
  db.sale.findUnique.mockResolvedValue({ id: 'sale1', organizerId: 'org1' });
  db.organizerWorkspace.findFirst.mockResolvedValue({ id: 'ws1' });
  db.consignor.findMany.mockResolvedValue([{ id: 'con1', name: 'Pat', workspaceId: 'ws1', archivedAt: null }]);
  asMock(sellItemUnits).mockResolvedValue({ fullySoldOut: true, remainingStock: 0 });
  asMock(resolvePosDiscount).mockResolvedValue({ ok: true, discountAmountCents: 0, discountType: null, discountValueRaw: null, discountReasonNote: null });
  asMock(resolveCashCommissionRate).mockResolvedValue(0.06);
  asMock(cashCommissionOn).mockImplementation((amount: number, rate: number) => Math.round(amount * rate * 100) / 100);
  asMock(accrueCashFeeBalance).mockResolvedValue(undefined);
  asMock(snapshotForCommissionOnly).mockReturnValue({});
  for (const fn of [endEbayListingIfExists, markShopifyItemSold, withdrawDiscogsListingIfExists, withdrawReverbListingIfExists, notifyFacebookExportedItemSold, syncMarketplaceStock]) {
    asMock(fn).mockResolvedValue(undefined);
  }
});

afterAll(() => {
  delete process.env.POS_CONSIGNOR_TAGS_ENABLED;
  delete process.env.POS_TAG_SIGNING_SECRET;
});

describe('processCashSaleCore, consignor price tag lines', () => {
  it('mints one SOLD CONSIGNOR_TAG item and writes a Purchase row carrying its itemId, in ONE transaction', async () => {
    const result = await processCashSaleCore({
      organizer: ORGANIZER,
      saleId: 'sale1',
      items: [{ amount: 5, consignorTag: signedTag() }],
      cashReceived: 5,
      clientTransactionId: 'ctx-1',
    });

    expect(txCalls).toBe(1);
    expect(mintedItems).toHaveLength(1);
    const item = mintedItems[0];
    expect(item).toMatchObject({
      listingType: 'CONSIGNOR_TAG',
      status: 'SOLD',
      isActive: false,
      stockTotal: 1,
      stockSold: 1,
      consignorId: 'con1',
      saleId: 'sale1',
      organizerId: 'org1',
      price: 5,
      photoUrls: [],
      sku: 'CTAG-ctx-1-nonce1',
    });
    // Single-sale POS: no booth is involved.
    expect(item.vendorBoothId).toBeUndefined();
    expect(purchases).toHaveLength(1);
    expect(purchases[0].itemId).toBe(item.id);
    expect(purchases[0].amount).toBe(5);
    expect(purchases[0].processor).toBe('CASH');
    expect(result.purchaseIds).toEqual(['purchase_1']);
    expect(result.totalAmount).toBe(5);
    expect(result.change).toBe(0);
    // A tag has no stock to sell and no listing to withdraw.
    expect(asMock(sellItemUnits)).not.toHaveBeenCalled();
    expect(lockKeys.some((k) => k.startsWith('ctag:sale1:CTAG-ctx-1-nonce1'))).toBe(true);
  });

  it('a replay with the same clientTransactionId answers from the existing rows and mints nothing more', async () => {
    db.purchase.findMany.mockResolvedValue([{ id: 'purchase_1', amount: 5, platformFeeAmount: 0.3, isTestTransaction: false }]);
    const result = await processCashSaleCore({
      organizer: ORGANIZER,
      saleId: 'sale1',
      items: [{ amount: 5, consignorTag: signedTag() }],
      cashReceived: 5,
      clientTransactionId: 'ctx-1',
    });
    expect(result.replay).toBe(true);
    expect(result.purchaseIds).toEqual(['purchase_1']);
    expect(mintedItems).toHaveLength(0);
    expect(purchases).toHaveLength(0);
    expect(txCalls).toBe(0);
  });

  it('a second run of the SAME sku inside the transaction finds the first item and does not create another', async () => {
    const args = {
      organizer: ORGANIZER,
      saleId: 'sale1',
      items: [{ amount: 5, consignorTag: signedTag() }],
      cashReceived: 5,
      clientTransactionId: 'ctx-1',
    };
    await processCashSaleCore(args);
    await processCashSaleCore(args); // the pre-check finds nothing here (mock), so the mint itself must be idempotent
    expect(mintedItems).toHaveLength(1);
    expect(purchases).toHaveLength(2);
    expect(purchases[1].itemId).toBe(purchases[0].itemId);
  });

  it('tag lines are outside the discount base and never discounted', async () => {
    asMock(resolvePosDiscount).mockResolvedValue({ ok: true, discountAmountCents: 25, discountType: 'PERCENT', discountValueRaw: 10, discountReasonNote: null });
    const result = await processCashSaleCore({
      organizer: ORGANIZER,
      saleId: 'sale1',
      items: [{ itemId: 'single1', amount: 2.5 }, { amount: 5, consignorTag: signedTag() }],
      cashReceived: 10,
      discountType: 'PERCENT',
      discountValue: 10,
      clientTransactionId: 'ctx-2',
    });
    // The discount cap is computed from the catalog item only: $2.50, not $7.50.
    expect(asMock(resolvePosDiscount).mock.calls[0][0].catalogSubtotalCents).toBe(250);
    const tagRow = purchases.find((p) => p.itemId && p.itemId.startsWith('tagitem_'));
    const catalogRow = purchases.find((p) => p.itemId === 'single1');
    expect(tagRow.amount).toBe(5);
    expect(tagRow.discountAmountCents).toBeNull();
    expect(catalogRow.amount).toBe(2.25);
    expect(catalogRow.discountAmountCents).toBe(25);
    expect(result.totalAmount).toBe(7.25);
  });

  it('refuses a tampered price before anything is written', async () => {
    const tag = signedTag({ priceCents: 500 });
    await expect(
      processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ amount: 0.05, consignorTag: tag }], cashReceived: 1, clientTransactionId: 'ctx-3' })
    ).rejects.toMatchObject({ code: 'TAG_SIGNATURE_INVALID' });
    expect(mintedItems).toHaveLength(0);
    expect(purchases).toHaveLength(0);
  });

  it('refuses a consignor of another workspace with a 404 and writes nothing', async () => {
    db.consignor.findMany.mockResolvedValue([]); // the workspace-scoped lookup finds nothing
    await expect(
      processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ amount: 5, consignorTag: signedTag() }], cashReceived: 5 })
    ).rejects.toMatchObject({ code: 'CONSIGNOR_NOT_FOUND', status: 404 });
    expect(purchases).toHaveLength(0);
  });

  it('refuses a sale the caller does not own with a 403 and writes nothing', async () => {
    db.sale.findUnique.mockResolvedValue({ id: 'sale1', organizerId: 'someone-else' });
    await expect(
      processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ amount: 5, consignorTag: signedTag() }], cashReceived: 5 })
    ).rejects.toMatchObject({ code: 'SALE_NOT_OWNED', status: 403 });
    expect(purchases).toHaveLength(0);
  });

  it('refuses a non-TEAMS organizer and a switched-off feature', async () => {
    await expect(
      processCashSaleCore({ organizer: { id: 'org1', subscriptionTier: 'PRO' }, saleId: 'sale1', items: [{ amount: 5, consignorTag: signedTag() }], cashReceived: 5 })
    ).rejects.toMatchObject({ code: 'TEAMS_REQUIRED' });
    process.env.POS_CONSIGNOR_TAGS_ENABLED = 'false';
    await expect(
      processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ amount: 5, consignorTag: signedTag() }], cashReceived: 5 })
    ).rejects.toMatchObject({ code: 'CONSIGNOR_TAGS_DISABLED' });
    expect(purchases).toHaveLength(0);
  });

  it('a TEST transaction validates the tag but never mints an item', async () => {
    await processCashSaleCore({
      organizer: ORGANIZER,
      saleId: 'sale1',
      items: [{ amount: 5, consignorTag: signedTag() }],
      cashReceived: 5,
      isTestTransaction: true,
    });
    expect(mintedItems).toHaveLength(0);
    expect(purchases).toHaveLength(1);
    expect(purchases[0].itemId).toBeNull();
    expect(purchases[0].isTestTransaction).toBe(true);
  });
});
