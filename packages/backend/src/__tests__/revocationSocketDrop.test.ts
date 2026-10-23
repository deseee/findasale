/**
 * Live sockets are dropped whenever a user's sessions are revoked or re-scoped (2026-10-23, security).
 * A socket joined before a suspension / role change / tier change keeps receiving the user's personal-room events
 * (POS payment requests, hold invoices, cart shares) unless it is disconnected. Covers:
 *  - lib/dropUserSockets: calls lib/socket disconnectUserSockets, no-op without a user id, never throws
 *  - fraudController.suspendOrganizer: now bumps tokenVersion AND drops sockets
 *  - fraudService.recordChargebackIncident serial-chargeback suspension: drops sockets
 *  - adminController.updateUserRole / updateOrganizerTier: drop sockets after the tokenVersion bump
 *  - syncTier: drops sockets on a real tier change only (not on every same-tier renewal webhook)
 *  - tierGraceService.downgradeScheduledCancelFrozenOrganizers: drops sockets for each downgraded organizer
 *
 * Run: pnpm --filter backend test -- revocationSocketDrop
 */

const mockDisconnect = jest.fn();
jest.mock('../lib/socket', () => ({ disconnectUserSockets: (...a: unknown[]) => mockDisconnect(...a) }));

const mockPrisma: any = {
  user: { update: jest.fn(), findUnique: jest.fn(), count: jest.fn(), updateMany: jest.fn() },
  organizer: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  fraudSignal: { findFirst: jest.fn(), create: jest.fn(), count: jest.fn() },
  purchase: { findUnique: jest.fn() },
  userRoleSubscription: { updateMany: jest.fn() },
  markdownCycle: { count: jest.fn() },
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../middleware/auth', () => ({}));
jest.mock('../services/fraudDetectionService', () => ({ getSaleFraudSignals: jest.fn(), reviewSignal: jest.fn() }));
jest.mock('../services/crewService', () => ({ handOffCrewsBeforeUserDeletion: jest.fn() }));
jest.mock('../lib/aiCostTracker', () => ({}));
jest.mock('../lib/cloudinaryBandwidthTracker', () => ({}));
jest.mock('../lib/ebayRateLimiter', () => ({}));
jest.mock('../lib/emailService', () => ({ emailService: {} }));
jest.mock('../controllers/extensionController', () => ({ MAX_REMOVAL_SKIP_ATTEMPTS: 3 }));
jest.mock('../services/refundService', () => ({ executeVerifiedRefund: jest.fn(), RefundError: class RefundError extends Error {} }));
jest.mock('../services/squareRefundService', () => ({ executeVerifiedSquareRefund: jest.fn() }));
jest.mock('../services/suppressionService', () => ({ suppressionService: {} }));
jest.mock('@sentry/node', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));

import { dropUserSockets } from '../lib/dropUserSockets';
import { suspendOrganizer } from '../controllers/fraudController';
import { recordChargebackIncident } from '../services/fraudService';
import { updateUserRole, updateOrganizerTier } from '../controllers/adminController';
import { syncTier } from '../lib/syncTier';
import { downgradeScheduledCancelFrozenOrganizers } from '../services/tierGraceService';

const mkRes = () => {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};
const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  jest.clearAllMocks();
  mockDisconnect.mockImplementation(() => undefined);
});

describe('lib/dropUserSockets', () => {
  it('disconnects the user room through lib/socket', async () => {
    await dropUserSockets('u1', 'test');
    expect(mockDisconnect).toHaveBeenCalledWith('u1');
  });

  it('is a no-op without a user id', async () => {
    await dropUserSockets(null);
    await dropUserSockets(undefined);
    await dropUserSockets('');
    expect(mockDisconnect).not.toHaveBeenCalled();
  });

  it('never throws when the socket layer fails', async () => {
    mockDisconnect.mockImplementation(() => {
      throw new Error('boom');
    });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(dropUserSockets('u1')).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

describe('fraudController.suspendOrganizer', () => {
  it('bumps tokenVersion and drops the organizer user sockets', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', userId: 'u_org', user: { id: 'u_org' } });
    mockPrisma.user.update.mockResolvedValue({ suspendedAt: new Date(), suspendReason: 'fraud' });
    const res = mkRes();
    await suspendOrganizer({ user: { role: 'ADMIN' }, params: { id: 'org1' }, body: { reason: 'fraud' } } as any, res);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u_org' }, data: expect.objectContaining({ tokenVersion: { increment: 1 } }) })
    );
    expect(mockDisconnect).toHaveBeenCalledWith('u_org');
    expect(res.status).not.toHaveBeenCalled();
  });

  it('does not touch sockets when the caller is not an admin', async () => {
    const res = mkRes();
    await suspendOrganizer({ user: { role: 'ORGANIZER' }, params: { id: 'org1' }, body: { reason: 'x' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockDisconnect).not.toHaveBeenCalled();
  });
});

describe('fraudService serial-chargeback suspension', () => {
  const setup = (chargebacks: number, suspendedAt: Date | null) => {
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', userId: 'u_org', user: { id: 'u_org' } });
    mockPrisma.fraudSignal.findFirst.mockResolvedValue(null);
    mockPrisma.purchase.findUnique.mockResolvedValue({ itemId: 'i1', item: { saleId: 's1' } });
    mockPrisma.fraudSignal.create.mockResolvedValue({});
    mockPrisma.fraudSignal.count.mockResolvedValue(chargebacks);
    mockPrisma.user.findUnique.mockResolvedValue({ suspendedAt });
    mockPrisma.user.update.mockResolvedValue({});
  };

  it('drops sockets when the third chargeback suspends the organizer', async () => {
    setup(3, null);
    await recordChargebackIncident('org1', 'p1', 'd1');
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ suspendReason: 'SERIAL_CHARGEBACKS', tokenVersion: { increment: 1 } }) })
    );
    expect(mockDisconnect).toHaveBeenCalledWith('u_org');
  });

  it('does nothing to sockets below the threshold or when already suspended', async () => {
    setup(2, null);
    await recordChargebackIncident('org1', 'p1', 'd1');
    setup(4, new Date());
    await recordChargebackIncident('org1', 'p2', 'd2');
    expect(mockDisconnect).not.toHaveBeenCalled();
  });
});

describe('adminController role and tier changes', () => {
  it('updateUserRole drops the user sockets after the tokenVersion bump', async () => {
    mockPrisma.user.update.mockResolvedValue({ id: 'u1', email: 'a@b.c', name: 'A', role: 'ADMIN', createdAt: new Date() });
    const res = mkRes();
    await updateUserRole({ params: { userId: 'u1' }, body: { role: 'ADMIN' }, user: { id: 'admin' } } as any, res);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tokenVersion: { increment: 1 } }) }));
    expect(mockDisconnect).toHaveBeenCalledWith('u1');
  });

  it('updateUserRole does not drop sockets on an invalid role', async () => {
    const res = mkRes();
    await updateUserRole({ params: { userId: 'u1' }, body: { role: 'GOD' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockDisconnect).not.toHaveBeenCalled();
  });

  it('updateOrganizerTier drops the organizer user sockets', async () => {
    mockPrisma.organizer.update.mockResolvedValue({ id: 'org1', subscriptionTier: 'PRO', tokenVersion: 3, businessName: 'B', userId: 'u_org' });
    const res = mkRes();
    await updateOrganizerTier({ params: { organizerId: 'org1' }, body: { tier: 'PRO' }, user: { id: 'admin' } } as any, res);
    expect(mockDisconnect).toHaveBeenCalledWith('u_org');
  });
});

describe('syncTier', () => {
  beforeEach(() => {
    process.env.STRIPE_PRO_MONTHLY_PRICE_ID = 'price_pro';
    mockPrisma.organizer.update.mockImplementation(async (args: any) => (args.select ? { userId: 'u_org' } : {}));
    mockPrisma.markdownCycle.count.mockResolvedValue(0);
  });

  it('drops sockets when the tier actually changes', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({ subscriptionTier: 'SIMPLE' });
    await syncTier('org1', 'active', 'price_pro');
    await flush();
    expect(mockDisconnect).toHaveBeenCalledWith('u_org');
  });

  it('keeps sockets on a same-tier renewal sync', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({ subscriptionTier: 'PRO' });
    await syncTier('org1', 'active', 'price_pro');
    await flush();
    expect(mockDisconnect).not.toHaveBeenCalled();
  });
});

describe('tierGraceService scheduled-cancel downgrade', () => {
  it('drops sockets for each organizer actually downgraded', async () => {
    mockPrisma.organizer.findMany.mockResolvedValue([
      { id: 'org1', userId: 'u1', subscriptionTier: 'PRO' },
      { id: 'org2', userId: 'u2', subscriptionTier: 'TEAMS' },
    ]);
    // org2 lost the race (already changed), so only org1 is downgraded.
    mockPrisma.organizer.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    mockPrisma.userRoleSubscription.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.markdownCycle.count.mockResolvedValue(0);
    await downgradeScheduledCancelFrozenOrganizers(new Date());
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
    expect(mockDisconnect).toHaveBeenCalledWith('u1');
  });
});
