/**
 * Bulk lot cash refund end to end through executeVerifiedRefund (ADR-136 Addendum B, roadmap #659).
 *
 * WHAT THIS PROVES (a cash sale of 1,500 cards of a lot for $12.00, platform fee $0.60):
 *   - "take 500 cards back" refunds exactly $4.00, keeps the row PAID, puts exactly 500 cards back, writes one audit row,
 *     and reverses the fee in proportion
 *   - a second refund for the remaining 1,000 cards finishes the row (REFUNDED), returns the other 1,000 cards, and the fee
 *     reversals add up to the whole fee
 *   - a refund whose amount does not match the cards is refused and changes nothing
 *   - a refund racing another (status/amount compare and swap loses) is refused and rolls every write back
 *   - a refund by money alone converts to the matching card count; the whole amount returns every card
 *   - a refund past what is left, and a refund of an already fully refunded row, are refused
 *   - a test transaction gives no stock back
 */
jest.mock('@sentry/node', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));
jest.mock('../lib/prisma', () => ({ prisma: { purchase: { findUnique: jest.fn() }, $transaction: jest.fn() } }));
jest.mock('../utils/stripe', () => ({ getStripe: () => ({ refunds: { create: jest.fn() } }), isStripeNotConfiguredError: () => false }));
jest.mock('../services/vendorBoothSaleNotificationService', () => ({ notifyVendorBoothSaleRefunded: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../controllers/vendorBoothCartController', () => ({ settleHubOwnerReversalForLeg: jest.fn() }));
jest.mock('../lib/transactionalEmailService', () => ({ transactionalEmailService: { emails: { send: jest.fn().mockResolvedValue(undefined) } } }));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/cashFeeService', () => ({ resolveSplitRefund: jest.fn() }));

import { prisma } from '../lib/prisma';
import { executeVerifiedRefund } from '../services/refundService';
import { notifyVendorBoothSaleRefunded } from '../services/vendorBoothSaleNotificationService';
import { FakeDb } from './__fixtures__/bulkLotFollowupFakes';

const p: any = prisma;
let db: FakeDb;
let lotId: string;
let org: Record<string, any>;
let reservationUpdates: number;

function purchaseView(): any {
  const row = db.purchase.rows[0];
  return {
    ...row,
    createdAt: new Date(),
    user: { id: 'u1', email: 'a@b.c', name: 'A' },
    sale: { organizer: { id: 'org1', userId: 'ou1', businessName: 'Cards Co', stripeConnectId: null } },
    item: { title: 'Commons', vendorBooth: null },
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  (notifyVendorBoothSaleRefunded as any).mockResolvedValue(undefined);
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  db = new FakeDb();
  lotId = db.addLot({ stockTotal: 1500, stockSold: 1500, status: 'SOLD' }).id;
  db.purchase.rows.push({
    id: 'p1', userId: 'u1', itemId: lotId, amount: 12, status: 'PAID', processor: 'CASH', stripePaymentIntentId: 'cash_abc', refundedAmount: null,
    platformFeeAmount: 0.6, bulkQuantity: 1500, bulkRefundedQuantity: 0, isTestTransaction: false, boothCartTransactionId: null, cashLegAmount: null,
  });
  org = { cashFeeBalance: 5 };
  reservationUpdates = 0;
  p.purchase.findUnique.mockImplementation(async () => purchaseView());
  p.$transaction.mockImplementation((fn: any) =>
    db.$transaction(async (tx: any) => {
      const wrapped = Object.create(tx);
      wrapped.itemReservation = { updateMany: async () => ((reservationUpdates += 1), { count: 0 }) };
      wrapped.organizer = {
        updateMany: async ({ where, data }: any) => {
          const dec = data.cashFeeBalance?.decrement;
          if (typeof dec === 'number') {
            if (org.cashFeeBalance < where.cashFeeBalance.gte) return { count: 0 };
            org.cashFeeBalance -= dec;
            return { count: 1 };
          }
          org.cashFeeBalance = data.cashFeeBalance;
          return { count: 1 };
        },
      };
      return fn(wrapped);
    })
  );
});

const refund = (amount: number, opts: Record<string, unknown> = {}) => executeVerifiedRefund('p1', amount, 'organizer', undefined, { source: 'ORGANIZER', actorUserId: 'ou1', idempotencyKey: null, ...opts } as any);

describe('cash refund of a bulk lot sale', () => {
  it('500 cards back refunds exactly $4.00, keeps the row PAID, returns 500 cards, writes one audit row, reverses the fee share', async () => {
    const res: any = await refund(4, { bulkCards: 500 });
    expect(res.isFullRefund).toBe(false);
    expect(res.bulk).toEqual({ cardsReturned: 500, cumulativeCards: 500 });
    expect(db.purchase.rows[0]).toMatchObject({ status: 'PAID', refundedAmount: 4, bulkRefundedQuantity: 500 });
    expect(db.stock(lotId)).toMatchObject({ sold: 1000, status: 'AVAILABLE' });
    expect(db.bulkLotRefund.rows).toHaveLength(1);
    expect(db.bulkLotRefund.rows[0]).toMatchObject({ cardsReturned: 500, cents: 400, source: 'ORGANIZER', actorUserId: 'ou1' });
    expect(org.cashFeeBalance).toBeCloseTo(5 - 0.2, 5);
    expect(reservationUpdates).toBe(0);
  });

  it('the second refund finishes the row, returns the rest, and the fee reversals add up to the whole fee', async () => {
    await refund(4, { bulkCards: 500 });
    const res: any = await refund(8, { bulkCards: 1000 });
    expect(res.isFullRefund).toBe(true);
    expect(db.purchase.rows[0]).toMatchObject({ status: 'REFUNDED', refundedAmount: 12, bulkRefundedQuantity: 1500 });
    expect(db.stock(lotId).sold).toBe(0);
    expect(db.bulkLotRefund.rows.map((r) => r.cardsReturned)).toEqual([500, 1000]);
    expect(org.cashFeeBalance).toBeCloseTo(5 - 0.6, 5);
  });

  it('refuses an amount that does not match the cards, and changes nothing', async () => {
    await expect(refund(5, { bulkCards: 500 })).rejects.toMatchObject({ details: expect.objectContaining({ code: 'BULK_REFUND_AMOUNT_MISMATCH', expectedCents: 400 }) });
    expect(db.purchase.rows[0]).toMatchObject({ status: 'PAID', bulkRefundedQuantity: 0 });
    expect(db.stock(lotId).sold).toBe(1500);
    expect(db.bulkLotRefund.rows).toHaveLength(0);
  });

  it('a refund that lost the compare and swap is refused and rolls every write back', async () => {
    // Another refund lands after this one read the row: the amount it carried is now stale.
    p.purchase.findUnique.mockImplementation(async () => {
      const view = purchaseView();
      db.purchase.rows[0].refundedAmount = 1; // another refund wrote first
      return view;
    });
    await expect(refund(4, { bulkCards: 500 })).rejects.toMatchObject({ details: expect.objectContaining({ code: 'REFUND_CONFLICT' }) });
    expect(db.purchase.rows[0].bulkRefundedQuantity).toBe(0);
    expect(db.stock(lotId).sold).toBe(1500);
    expect(db.bulkLotRefund.rows).toHaveLength(0);
  });

  it('a refund by money alone converts to the matching card count', async () => {
    const res: any = await refund(4);
    expect(res.bulk).toEqual({ cardsReturned: 500, cumulativeCards: 500 });
    expect(db.stock(lotId).sold).toBe(1000);
  });

  it('the whole amount returns every card and marks the row REFUNDED', async () => {
    const res: any = await refund(12);
    expect(res.isFullRefund).toBe(true);
    expect(db.purchase.rows[0].bulkRefundedQuantity).toBe(1500);
    expect(db.stock(lotId)).toMatchObject({ sold: 0, status: 'AVAILABLE' });
    expect(reservationUpdates).toBe(1);
  });

  it('refuses more than is left and a row already refunded in full', async () => {
    await refund(4, { bulkCards: 500 });
    await expect(refund(9)).rejects.toMatchObject({ details: expect.objectContaining({ remainingRefundable: 8 }) });
    await refund(8);
    db.purchase.rows[0].status = 'PAID'; // a stale caller that still thinks it can refund
    await expect(refund(1)).rejects.toMatchObject({ details: expect.objectContaining({ code: 'ALREADY_REFUNDED' }) });
    expect(db.stock(lotId).sold).toBe(0);
  });

  it('a test transaction gives no stock back but still records the refund', async () => {
    db.purchase.rows[0].isTestTransaction = true;
    await refund(4, { bulkCards: 500 });
    expect(db.stock(lotId).sold).toBe(1500);
    expect(db.purchase.rows[0].bulkRefundedQuantity).toBe(500);
  });
});
