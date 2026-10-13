/**
 * Refund SOLD -> AVAILABLE flip guard (refundService.executeVerifiedRefund), single inventory number (2026-10-13).
 * NOT EXECUTED when written (jest cannot run on the authoring device); CI is the first real run.
 *
 * The status flip is one guarded raw UPDATE that only fires when this refund's unit is what took the item from 0 to 1 in stock
 * (stockSold now exactly COALESCE(stockTotal, 1) - 1). A manually SOLD multi-unit item that still showed units left is therefore
 * never reopened by an unrelated old refund. KIT and CONSIGNOR_TAG stay excluded. Same mocking style as consignorTagHubRefund.test.ts.
 */
jest.mock('@sentry/node', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));
jest.mock('../lib/prisma', () => ({
  prisma: {
    purchase: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    itemReservation: { updateMany: jest.fn() },
    item: { updateMany: jest.fn() },
    organizer: { updateMany: jest.fn() },
    user: { findUnique: jest.fn() },
    $executeRaw: jest.fn(),
  },
}));
const mockRefundsCreate = jest.fn();
jest.mock('../utils/stripe', () => ({
  getStripe: () => ({ refunds: { create: (...a: any[]) => mockRefundsCreate(...a) } }),
  isStripeNotConfiguredError: () => false,
}));
jest.mock('../services/vendorBoothSaleNotificationService', () => ({ notifyVendorBoothSaleRefunded: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../lib/transactionalEmailService', () => ({ transactionalEmailService: { emails: { send: jest.fn().mockResolvedValue(undefined) } } }));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));
const mockRecomputeKits = jest.fn().mockResolvedValue(undefined);
jest.mock('../services/itemKitStock', () => ({
  restockKitIfKit: jest.fn().mockResolvedValue(undefined),
  recomputeKitsForComponents: (...a: any[]) => mockRecomputeKits(...a),
}));
const mockSyncItemStock = jest.fn().mockResolvedValue(undefined);
jest.mock('../services/inventoryStockSync', () => ({ syncItemStock: (...a: any[]) => mockSyncItemStock(...a) }));

import { prisma } from '../lib/prisma';
import { executeVerifiedRefund } from '../services/refundService';

const db = prisma as any;
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

function purchase(over: Record<string, any> = {}) {
  return {
    id: 'p1', userId: 'u1', itemId: 'item1', amount: 10, status: 'PAID', createdAt: new Date(), stripePaymentIntentId: 'pi_1',
    stripeAccountId: null, chargeType: null, boothCartTransactionId: null, cashLegAmount: null, platformFeeAmount: null,
    bulkQuantity: null, user: null, sale: null, item: { title: 'Lamp', vendorBooth: null }, ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  db.purchase.updateMany.mockResolvedValue({ count: 1 });
  db.purchase.update.mockResolvedValue({});
  db.itemReservation.updateMany.mockResolvedValue({ count: 0 });
  db.item.updateMany.mockResolvedValue({ count: 1 });
  db.$executeRaw.mockResolvedValue(1);
  mockRefundsCreate.mockResolvedValue({ id: 're_1' });
});

describe('executeVerifiedRefund: the SOLD -> AVAILABLE flip only fires when the refund freed stock from 0', () => {
  it('flips with a guarded UPDATE keyed on stockSold = total - 1, excluding KIT and CONSIGNOR_TAG, then syncs the markets', async () => {
    db.purchase.findUnique.mockResolvedValue(purchase());
    await executeVerifiedRefund('p1', 10, 'organizer');
    await flush();
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
    const [strings, itemId] = db.$executeRaw.mock.calls[0];
    const sql = strings.join('?');
    expect(sql).toContain(`"status" = 'AVAILABLE'`);
    expect(sql).toContain(`"status" = 'SOLD'`);
    expect(sql).toContain(`"listingType" NOT IN ('CONSIGNOR_TAG', 'KIT')`);
    expect(sql).toContain('"stockSold" = COALESCE("stockTotal", 1) - 1');
    expect(sql).not.toContain('"stockSold" < COALESCE("stockTotal", 1)'); // the old, looser guard is gone
    expect(itemId).toBe('item1');
    expect(mockSyncItemStock).toHaveBeenCalledWith('item1', 'refund');
  });

  it('does nothing to the status when no unit was given back (guarded decrement matched no row)', async () => {
    db.item.updateMany.mockResolvedValue({ count: 0 });
    db.purchase.findUnique.mockResolvedValue(purchase());
    await executeVerifiedRefund('p1', 10, 'organizer');
    await flush();
    expect(db.$executeRaw).not.toHaveBeenCalled();
    expect(mockSyncItemStock).not.toHaveBeenCalled();
  });
});
