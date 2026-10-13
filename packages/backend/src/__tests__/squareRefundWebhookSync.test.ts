/**
 * Square refund.updated webhook sync (dispatched 2026-10-11, health-scout Wave 1 #4 finding):
 * services/squareRefundService.ts syncSquareRefundWebhookStatus.
 *
 *  - non-COMPLETED status: no-op
 *  - no payment_id: no-op
 *  - no matching Purchase row: no-op
 *  - a row already REFUNDING/REFUNDED/DISPUTED, or already partially refunded, or a bulk-lot
 *    row: skipped (not auto-applied), logged for manual review
 *  - a PAID, untouched, non-bulk row with a COMPLETED full refund: flips to REFUNDED, restores
 *    item stock/status, cancels open reservations
 *  - a partial external refund against untouched rows: NOT auto-applied, Sentry-flagged instead
 *  - a DB failure mid-apply rethrows (so the webhook controller marks the delivery FAILED and
 *    Square retries)
 *
 * Run: pnpm --filter backend test -- squareRefundWebhookSync
 */

jest.mock('../lib/prisma', () => ({
  prisma: {
    purchase: { findMany: jest.fn(), updateMany: jest.fn() },
    item: { updateMany: jest.fn() },
    itemReservation: { updateMany: jest.fn() },
    $transaction: jest.fn(async (fn: any) => fn({
      purchase: { updateMany: jest.fn() },
      item: { updateMany: jest.fn() },
      itemReservation: { updateMany: jest.fn() },
      $executeRaw: jest.fn().mockResolvedValue(0),
    })),
  },
}));
jest.mock('@sentry/node', () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));
jest.mock('square', () => ({ SquareClient: jest.fn(), SquareEnvironment: { Production: 'production', Sandbox: 'sandbox' } }));
jest.mock('../services/refundService', () => {
  class RefundError extends Error {}
  return { RefundError };
});
jest.mock('../services/vendorBoothSaleNotificationService', () => ({ notifyVendorBoothSaleRefunded: jest.fn() }));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/squarePaymentService', () => ({ resolveOrganizerSquareAccessToken: jest.fn(), SquareOnboardingIncompleteError: class extends Error {} }));
jest.mock('../services/squareVendorBoothCartService', () => ({ resolveVendorBoothSquareAccessToken: jest.fn(), SquareBoothOnboardingIncompleteError: class extends Error {} }));
jest.mock('../services/cashFeeService', () => ({
  resolveSplitRefund: jest.fn(),
  roundMoney: (n: number) => Math.round(n * 100) / 100,
}));
jest.mock('../services/cashFeeRefundReversalService', () => ({ reverseSplitCashCommissionForRefund: jest.fn() }));
jest.mock('../services/bulkLot/bulkLotRefundService', () => ({
  applyBulkRefundReturn: jest.fn(),
  isBulkRefundError: jest.fn(),
  planExplicitCardRefund: jest.fn(),
  targetCardsForMoney: jest.fn(),
}));
jest.mock('../services/cnpSurcharge', () => ({ resolveCnpSurchargeRefund: jest.fn() }));

import { prisma } from '../lib/prisma';
import * as Sentry from '@sentry/node';
import { syncSquareRefundWebhookStatus } from '../services/squareRefundService';

const db: any = prisma;

const purchaseRow = (over: any = {}) => ({
  id: 'pur_1',
  status: 'PAID',
  amount: 50,
  refundedAmount: null,
  itemId: 'item_1',
  bulkQuantity: null,
  createdAt: new Date(),
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('syncSquareRefundWebhookStatus', () => {
  it('is a no-op when the refund status is not COMPLETED', async () => {
    await syncSquareRefundWebhookStatus({ id: 'r1', status: 'PENDING', payment_id: 'p1', amount_money: { amount: 5000 } });
    expect(db.purchase.findMany).not.toHaveBeenCalled();
  });

  it('is a no-op when there is no payment_id', async () => {
    await syncSquareRefundWebhookStatus({ id: 'r1', status: 'COMPLETED' });
    expect(db.purchase.findMany).not.toHaveBeenCalled();
  });

  it('is a no-op when no Purchase row matches the payment id', async () => {
    db.purchase.findMany.mockResolvedValue([]);
    await syncSquareRefundWebhookStatus({ id: 'r1', status: 'COMPLETED', payment_id: 'p1', amount_money: { amount: 5000 } });
    expect(db.purchase.updateMany).not.toHaveBeenCalled();
  });

  it('flips a PAID, untouched, non-bulk row to REFUNDED and restores item stock on a full external refund', async () => {
    db.purchase.findMany.mockResolvedValue([purchaseRow()]);
    const txPurchaseUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const txItemUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const txReservationUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    const txExecuteRaw = jest.fn().mockResolvedValue(0);
    db.$transaction.mockImplementation(async (fn: any) =>
      fn({
        purchase: { updateMany: txPurchaseUpdateMany },
        item: { updateMany: txItemUpdateMany },
        itemReservation: { updateMany: txReservationUpdateMany },
        $executeRaw: txExecuteRaw,
      })
    );

    await syncSquareRefundWebhookStatus({ id: 'r1', status: 'COMPLETED', payment_id: 'p1', amount_money: { amount: 5000 } });

    expect(txPurchaseUpdateMany).toHaveBeenCalledWith({
      where: { id: 'pur_1', status: 'PAID' },
      data: expect.objectContaining({ status: 'REFUNDED', refundedAmount: 50, refundInitiatedBy: 'square_dashboard' }),
    });
    expect(txItemUpdateMany).toHaveBeenCalled();
    // The SOLD -> AVAILABLE flip is one guarded raw UPDATE: only when this refund's unit took the item from 0 to 1 in stock.
    expect(txExecuteRaw).toHaveBeenCalledTimes(1);
    expect(txExecuteRaw.mock.calls[0][0].join('?')).toMatch(/SET "status" = 'AVAILABLE' WHERE "id" = \? AND "status" = 'SOLD' AND "listingType" NOT IN \('CONSIGNOR_TAG', 'KIT'\) AND "stockSold" = COALESCE\("stockTotal", 1\) - 1/);
    expect(txExecuteRaw.mock.calls[0][1]).toBe('item_1');
    expect(txReservationUpdateMany).toHaveBeenCalled();
  });

  it('does NOT touch a row already past PAID (e.g. REFUNDING -- FindA.Sale-initiated flow already owns it)', async () => {
    db.purchase.findMany.mockResolvedValue([purchaseRow({ status: 'REFUNDING' })]);
    await syncSquareRefundWebhookStatus({ id: 'r1', status: 'COMPLETED', payment_id: 'p1', amount_money: { amount: 5000 } });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('does NOT touch a row that already has a refundedAmount recorded', async () => {
    db.purchase.findMany.mockResolvedValue([purchaseRow({ refundedAmount: 10 })]);
    await syncSquareRefundWebhookStatus({ id: 'r1', status: 'COMPLETED', payment_id: 'p1', amount_money: { amount: 5000 } });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('does NOT auto-apply a bulk-lot row -- flags for manual review instead', async () => {
    db.purchase.findMany.mockResolvedValue([purchaseRow({ bulkQuantity: 4 })]);
    await syncSquareRefundWebhookStatus({ id: 'r1', status: 'COMPLETED', payment_id: 'p1', amount_money: { amount: 5000 } });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('does NOT auto-apply a partial external refund -- Sentry-flags it for manual review', async () => {
    db.purchase.findMany.mockResolvedValue([purchaseRow({ amount: 50 })]);
    await syncSquareRefundWebhookStatus({ id: 'r1', status: 'COMPLETED', payment_id: 'p1', amount_money: { amount: 2000 } }); // $20 of $50
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('partial external refund needs manual review'),
      expect.anything()
    );
  });

  it('rethrows on a DB failure so the webhook controller marks the delivery FAILED (Square retries)', async () => {
    db.purchase.findMany.mockResolvedValue([purchaseRow()]);
    db.$transaction.mockRejectedValue(new Error('db down'));
    await expect(
      syncSquareRefundWebhookStatus({ id: 'r1', status: 'COMPLETED', payment_id: 'p1', amount_money: { amount: 5000 } })
    ).rejects.toThrow('db down');
  });
});
