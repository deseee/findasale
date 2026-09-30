/**
 * Square dispute handling (2026-09-30, fix agent F): services/squareRefundService.ts handleSquareDisputeWebhook.
 *
 *  - a multi-item POS cart shares ONE Square payment id, so EVERY row of the payment moves together
 *  - dispute.created only flips PAID rows (never REFUNDING, never REFUNDED)
 *  - a WON dispute restores DISPUTED rows to PAID
 *  - LOST / ACCEPTED move DISPUTED rows to DISPUTE_LOST
 *  - a WON dispute also reverses the buyer penalties the opened step applied: chargebackCount (floor 0), a suspension
 *    ONLY if that dispute set it, and the clawed-back XP (restored once, through the XP ledger)
 *  - failures are rethrown so the webhook is retried, and a retry never repeats a side effect
 *
 * Run: pnpm --filter backend test -- squareDisputeHandling
 */

const recordedSteps = new Set<string>();
jest.mock('../lib/prisma', () => ({
  prisma: {
    purchase: { findMany: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn() },
    user: { update: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    platformMetrics: { upsert: jest.fn() },
    processedWebhookEvent: {
      findUnique: jest.fn(async ({ where }: any) => (recordedSteps.has(where.eventId) ? { eventId: where.eventId } : null)),
      create: jest.fn(async ({ data }: any) => {
        if (recordedSteps.has(data.eventId)) throw Object.assign(new Error('dup'), { code: 'P2002' });
        recordedSteps.add(data.eventId);
        return data;
      }),
    },
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
jest.mock('../services/xpService', () => ({ clawBackChargebackXp: jest.fn().mockResolvedValue(10), restoreChargebackXp: jest.fn().mockResolvedValue(10) }));
jest.mock('../services/fraudService', () => ({ recordChargebackIncident: jest.fn().mockResolvedValue(undefined) }));

import { prisma } from '../lib/prisma';
import { createNotification } from '../lib/notificationService';
import { clawBackChargebackXp, restoreChargebackXp } from '../services/xpService';
import { recordChargebackIncident } from '../services/fraudService';
import { handleSquareDisputeWebhook } from '../services/squareRefundService';

const db: any = prisma;

const sale = { id: 'sale_1', organizerId: 'org_1', organizer: { userId: 'org_user', id: 'org_1' } };
const row = (id: string, status: string, over: any = {}) => ({
  id,
  status,
  squarePaymentId: 'sq_pay_1',
  user: { id: 'buyer_1' },
  sale,
  item: { title: `Item ${id}`, sale },
  createdAt: new Date(),
  ...over,
});
const evt = (type: string, state: string): any => ({
  merchant_id: 'm1',
  type,
  event_id: `ev_${type}_${state}`,
  created_at: new Date().toISOString(),
  data: { type: 'dispute', id: 'd1', object: { dispute: { id: 'disp_1', state, disputed_payment: { payment_id: 'sq_pay_1' } } } },
});
const statusWrites = () => db.purchase.updateMany.mock.calls.map((c: any[]) => c[0]);

beforeEach(() => {
  jest.clearAllMocks();
  recordedSteps.clear();
  db.purchase.updateMany.mockResolvedValue({ count: 2 });
  db.user.update.mockResolvedValue({});
  db.user.updateMany.mockResolvedValue({ count: 1 });
  db.user.findUnique.mockResolvedValue({ chargebackCount: 1, suspendedAt: null });
  db.platformMetrics.upsert.mockResolvedValue({ chargebackCount: 1, transactionCount: 500 });
});

describe('dispute.created', () => {
  it('flips ALL PAID rows of the payment id (not one), guarded on PAID', async () => {
    db.purchase.findMany.mockResolvedValue([row('p1', 'PAID'), row('p2', 'PAID')]);
    await handleSquareDisputeWebhook(evt('dispute.created', 'EVIDENCE_REQUIRED'));
    expect(statusWrites()).toEqual([{ where: { squarePaymentId: 'sq_pay_1', status: 'PAID' }, data: { status: 'DISPUTED' } }]);
    // One buyer strike and one organizer notification for the dispute, XP clawed back per row.
    expect(db.user.update).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(clawBackChargebackXp).toHaveBeenCalledTimes(2);
  });

  it('never overwrites REFUNDING or REFUNDED rows (guard is PAID only) and alerts for review', async () => {
    db.purchase.findMany.mockResolvedValue([row('p1', 'PAID'), row('p2', 'REFUNDING'), row('p3', 'REFUNDED')]);
    await handleSquareDisputeWebhook(evt('dispute.created', 'EVIDENCE_REQUIRED'));
    const w = statusWrites()[0];
    expect(w.where.status).toBe('PAID');
    const Sentry = require('@sentry/node');
    expect(Sentry.captureMessage).toHaveBeenCalledWith(expect.stringContaining('already refunding or refunded'), expect.anything());
  });

  it('rethrows on failure so the webhook is retried, and the retry does not repeat completed side effects', async () => {
    db.purchase.findMany.mockResolvedValue([row('p1', 'PAID')]);
    (recordChargebackIncident as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    await expect(handleSquareDisputeWebhook(evt('dispute.created', 'EVIDENCE_REQUIRED'))).rejects.toThrow('db down');
    expect(db.user.update).toHaveBeenCalledTimes(1); // buyer strike ran before the failure

    // Redelivery (rows are now DISPUTED, the claim matches nothing): only the failed step and later ones run.
    db.purchase.findMany.mockResolvedValue([row('p1', 'DISPUTED')]);
    db.purchase.updateMany.mockResolvedValue({ count: 0 });
    await handleSquareDisputeWebhook(evt('dispute.created', 'EVIDENCE_REQUIRED'));
    expect(db.user.update).toHaveBeenCalledTimes(1); // NOT incremented a second time
    expect(recordChargebackIncident).toHaveBeenCalledTimes(2); // the failed step was retried
    expect(clawBackChargebackXp).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(db.platformMetrics.upsert).toHaveBeenCalledTimes(1);
  });
});

describe('dispute.state.updated', () => {
  it('WON restores every DISPUTED row of the payment to PAID', async () => {
    db.purchase.findMany.mockResolvedValue([row('p1', 'DISPUTED'), row('p2', 'DISPUTED')]);
    await handleSquareDisputeWebhook(evt('dispute.state.updated', 'WON'));
    expect(statusWrites()).toEqual([{ where: { squarePaymentId: 'sq_pay_1', status: 'DISPUTED' }, data: { status: 'PAID' } }]);
  });

  it('LOST moves every DISPUTED row to DISPUTE_LOST', async () => {
    db.purchase.findMany.mockResolvedValue([row('p1', 'DISPUTED'), row('p2', 'DISPUTED')]);
    await handleSquareDisputeWebhook(evt('dispute.state.updated', 'LOST'));
    expect(statusWrites()).toEqual([{ where: { squarePaymentId: 'sq_pay_1', status: 'DISPUTED' }, data: { status: 'DISPUTE_LOST' } }]);
  });

  it('ACCEPTED is treated as a loss', async () => {
    db.purchase.findMany.mockResolvedValue([row('p1', 'DISPUTED')]);
    await handleSquareDisputeWebhook(evt('dispute.state.updated', 'ACCEPTED'));
    expect(statusWrites()[0].data).toEqual({ status: 'DISPUTE_LOST' });
  });

  it('a duplicate LOST delivery (all rows already DISPUTE_LOST) is a quiet no-op', async () => {
    db.purchase.findMany.mockResolvedValue([row('p1', 'DISPUTE_LOST')]);
    db.purchase.updateMany.mockResolvedValue({ count: 0 });
    await expect(handleSquareDisputeWebhook(evt('dispute.state.updated', 'LOST'))).resolves.toBeUndefined();
  });

  it('WON / LOST failures are rethrown', async () => {
    db.purchase.findMany.mockResolvedValue([row('p1', 'DISPUTED')]);
    db.purchase.updateMany.mockRejectedValue(new Error('db down'));
    await expect(handleSquareDisputeWebhook(evt('dispute.state.updated', 'WON'))).rejects.toThrow('db down');
    await expect(handleSquareDisputeWebhook(evt('dispute.state.updated', 'LOST'))).rejects.toThrow('db down');
  });

  it('intermediate states (PROCESSING) change nothing', async () => {
    db.purchase.findMany.mockResolvedValue([row('p1', 'DISPUTED')]);
    await handleSquareDisputeWebhook(evt('dispute.state.updated', 'PROCESSING'));
    expect(db.purchase.updateMany).not.toHaveBeenCalled();
  });
});

describe('WON reverses the buyer penalties the opened step applied (2026-09-30)', () => {
  const open = async (rows: any[], chargebackCount: number) => {
    db.purchase.findMany.mockResolvedValue(rows);
    db.user.findUnique.mockResolvedValue({ chargebackCount, suspendedAt: null });
    await handleSquareDisputeWebhook(evt('dispute.created', 'EVIDENCE_REQUIRED'));
    jest.clearAllMocks();
    db.purchase.updateMany.mockResolvedValue({ count: 2 });
    db.user.updateMany.mockResolvedValue({ count: 1 });
    db.platformMetrics.upsert.mockResolvedValue({ chargebackCount: 1, transactionCount: 500 });
  };
  const won = (rows: any[], after: any) => {
    db.purchase.findMany.mockResolvedValue(rows);
    db.user.findUnique.mockResolvedValue(after);
    return handleSquareDisputeWebhook(evt('dispute.state.updated', 'WON'));
  };
  const userWrites = () => db.user.updateMany.mock.calls.map((c: any[]) => c[0]);

  it('decrements chargebackCount with a floor of 0 and restores XP once per clawed-back row', async () => {
    await open([row('p1', 'PAID'), row('p2', 'PAID')], 1);
    await won([row('p1', 'DISPUTED'), row('p2', 'DISPUTED')], { chargebackCount: 0, suspendedAt: null, suspendReason: null });
    const writes = userWrites();
    expect(writes[0]).toEqual({ where: { id: 'buyer_1', chargebackCount: { gt: 0 } }, data: { chargebackCount: { decrement: 1 } } });
    expect(restoreChargebackXp).toHaveBeenCalledTimes(2);
    expect(restoreChargebackXp).toHaveBeenCalledWith('p1', 'buyer_1', 'disp_1');
    expect(restoreChargebackXp).toHaveBeenCalledWith('p2', 'buyer_1', 'disp_1');
    // No suspension was applied by this dispute, so nothing is lifted.
    expect(writes.some((w: any) => w.data && 'suspendedAt' in w.data)).toBe(false);
    expect(recordedSteps.has('square-dispute-step:disp_1:xp-restore:p1')).toBe(true);
    expect(recordedSteps.has('square-dispute-step:disp_1:won-buyer')).toBe(true);
  });

  it('lifts a suspension the dispute logic applied once the count is back under 3', async () => {
    await open([row('p1', 'PAID')], 3); // third strike: suspended by this dispute
    expect(recordedSteps.has('square-dispute-step:disp_1:suspended')).toBe(true);
    await won([row('p1', 'DISPUTED')], { chargebackCount: 2, suspendedAt: new Date(), suspendReason: 'SERIAL_CHARGEBACKS' });
    const lift = userWrites().find((w: any) => w.data && 'suspendedAt' in w.data);
    expect(lift).toEqual({
      where: { id: 'buyer_1', suspendedAt: { not: null }, suspendReason: 'SERIAL_CHARGEBACKS' },
      data: { suspendedAt: null, suspendReason: null },
    });
  });

  it('keeps the suspension while the count is still 3 or more', async () => {
    await open([row('p1', 'PAID')], 3);
    await won([row('p1', 'DISPUTED')], { chargebackCount: 3, suspendedAt: new Date(), suspendReason: 'SERIAL_CHARGEBACKS' });
    expect(userWrites().some((w: any) => w.data && 'suspendedAt' in w.data)).toBe(false);
  });

  it('never lifts a manual admin suspension (different reason), even with the dispute marker present', async () => {
    await open([row('p1', 'PAID')], 3);
    await won([row('p1', 'DISPUTED')], { chargebackCount: 2, suspendedAt: new Date(), suspendReason: 'ADMIN_ACTION' });
    expect(userWrites().some((w: any) => w.data && 'suspendedAt' in w.data)).toBe(false);
  });

  it('never lifts a suspension this dispute did not apply (no suspended marker)', async () => {
    await open([row('p1', 'PAID')], 1); // strike 1: no suspension, no marker
    await won([row('p1', 'DISPUTED')], { chargebackCount: 0, suspendedAt: new Date(), suspendReason: 'SERIAL_CHARGEBACKS' });
    expect(userWrites().some((w: any) => w.data && 'suspendedAt' in w.data)).toBe(false);
  });

  it('a redelivered WON does not decrement or restore XP a second time', async () => {
    await open([row('p1', 'PAID')], 1);
    const after = { chargebackCount: 0, suspendedAt: null, suspendReason: null };
    await won([row('p1', 'DISPUTED')], after);
    await won([row('p1', 'PAID')], after);
    expect(userWrites().filter((w: any) => w.data?.chargebackCount)).toHaveLength(1);
    expect(restoreChargebackXp).toHaveBeenCalledTimes(1);
  });

  it('a WON for a dispute whose opened step never ran (no markers) changes nothing on the buyer', async () => {
    await won([row('p1', 'DISPUTED')], { chargebackCount: 2, suspendedAt: null, suspendReason: null });
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expect(restoreChargebackXp).not.toHaveBeenCalled();
  });

  it('restores XP only for rows that were clawed back', async () => {
    await open([row('p1', 'PAID'), row('p2', 'PAID', { user: null })], 1);
    await won([row('p1', 'DISPUTED'), row('p2', 'DISPUTED', { user: null })], { chargebackCount: 0, suspendedAt: null, suspendReason: null });
    expect(restoreChargebackXp).toHaveBeenCalledTimes(1);
    expect(restoreChargebackXp).toHaveBeenCalledWith('p1', 'buyer_1', 'disp_1');
  });

  it('a failing reversal is rethrown so the webhook retries, and the retry finishes the job', async () => {
    await open([row('p1', 'PAID')], 1);
    const after = { chargebackCount: 0, suspendedAt: null, suspendReason: null };
    (restoreChargebackXp as jest.Mock).mockRejectedValueOnce(new Error('ledger down'));
    await expect(won([row('p1', 'DISPUTED')], after)).rejects.toThrow('ledger down');
    await won([row('p1', 'PAID')], after);
    expect(restoreChargebackXp).toHaveBeenCalledTimes(2);
    expect(userWrites().filter((w: any) => w.data?.chargebackCount)).toHaveLength(1); // decrement ran once
  });
});
