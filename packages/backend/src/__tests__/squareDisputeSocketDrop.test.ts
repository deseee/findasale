/**
 * Square serial-chargeback buyer suspension also revokes sessions and drops live sockets (2026-10-23, security):
 * services/squareRefundService.ts handleSquareDisputeWebhook, dispute.created at the 3rd chargeback.
 * Mock setup mirrors squareDisputeHandling.test.ts.
 *
 * Run: pnpm --filter backend test -- squareDisputeSocketDrop
 */
jest.mock('../lib/socket', () => ({ disconnectUserSockets: jest.fn() }));

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
import { handleSquareDisputeWebhook } from '../services/squareRefundService';
import { disconnectUserSockets } from '../lib/socket';

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

beforeEach(() => {
  jest.clearAllMocks();
  recordedSteps.clear();
  db.purchase.updateMany.mockResolvedValue({ count: 2 });
  db.user.update.mockResolvedValue({});
  db.user.updateMany.mockResolvedValue({ count: 1 });
  db.user.findUnique.mockResolvedValue({ chargebackCount: 1, suspendedAt: null });
  db.platformMetrics.upsert.mockResolvedValue({ chargebackCount: 1, transactionCount: 500 });
});

describe('dispute.created buyer suspension', () => {
  it('bumps tokenVersion and drops the buyer sockets when the 3rd chargeback suspends them', async () => {
    db.purchase.findMany.mockResolvedValue([row('p1', 'PAID')]);
    db.user.findUnique.mockResolvedValue({ chargebackCount: 3, suspendedAt: null });
    await handleSquareDisputeWebhook(evt('dispute.created', 'EVIDENCE_REQUIRED'));
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'buyer_1' },
      data: expect.objectContaining({ suspendReason: 'SERIAL_CHARGEBACKS', tokenVersion: { increment: 1 } }),
    });
    expect(disconnectUserSockets).toHaveBeenCalledWith('buyer_1');
  });

  it('leaves sockets alone below the threshold', async () => {
    db.purchase.findMany.mockResolvedValue([row('p1', 'PAID')]);
    db.user.findUnique.mockResolvedValue({ chargebackCount: 2, suspendedAt: null });
    await handleSquareDisputeWebhook(evt('dispute.created', 'EVIDENCE_REQUIRED'));
    expect(disconnectUserSockets).not.toHaveBeenCalled();
  });
});
