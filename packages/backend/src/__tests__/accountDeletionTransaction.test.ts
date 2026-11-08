/**
 * Account deletion must hand off crews and delete the user in ONE transaction (2026-09-29):
 * userController.deleteAccount and adminController.purgeUser used a bare prisma.user.delete, which
 * cascaded away a founder's crew / left memberCount stale. Prisma and collaborators are jest mocks.
 * NOT EXECUTED when written (jest cannot run on the authoring machine).
 */
const calls: string[] = [];
const mockTx = {
  user: { delete: jest.fn(async (args: any) => { calls.push(`tx.user.delete:${args.where.id}`); return {}; }) },
};
const mockPrisma: any = {
  $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => fn(mockTx)),
  user: { delete: jest.fn(), findUnique: jest.fn() },
  sale: { count: jest.fn().mockResolvedValue(0) },
  saleHub: { count: jest.fn().mockResolvedValue(0) },
  treasureTrail: { count: jest.fn().mockResolvedValue(0) },
  affiliateLink: { count: jest.fn().mockResolvedValue(0) },
  dispute: { count: jest.fn().mockResolvedValue(0) },
  appraisalAIRequest: { count: jest.fn().mockResolvedValue(0) },
  affiliateReferral: { count: jest.fn().mockResolvedValue(0) },
  referralReward: { count: jest.fn().mockResolvedValue(0) },
  affiliateConversion: { count: jest.fn().mockResolvedValue(0) },
  organizer: { findUnique: jest.fn().mockResolvedValue(null) },
  organizerWorkspace: { count: jest.fn().mockResolvedValue(0) },
  vendorBooth: { count: jest.fn().mockResolvedValue(0) },
  // 2026-11-05 (schema review #3/#4): ledger FKs are RESTRICT, so these block a hard delete too (services/ledgerDeletionGuards.ts).
  holdInvoice: { count: jest.fn().mockResolvedValue(0) },
  consignorPayout: { count: jest.fn().mockResolvedValue(0) },
  consignorPayoutItem: { count: jest.fn().mockResolvedValue(0) },
  consignorSettlementBatch: { count: jest.fn().mockResolvedValue(0) },
};
const mockHandOff = jest.fn(async (userId: string, _db: unknown) => { calls.push(`handoff:${userId}`); return { transferred: 0, decremented: 0 }; });

jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../middleware/auth', () => ({}));
jest.mock('../services/crewService', () => ({ handOffCrewsBeforeUserDeletion: (...a: [string, unknown]) => mockHandOff(...a) }));
jest.mock('../lib/aiCostTracker', () => ({}));
jest.mock('../lib/cloudinaryBandwidthTracker', () => ({}));
jest.mock('../lib/ebayRateLimiter', () => ({}));
jest.mock('../lib/emailService', () => ({ emailService: {} }));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn() }));
jest.mock('../controllers/extensionController', () => ({ MAX_REMOVAL_SKIP_ATTEMPTS: 3 }));
jest.mock('../services/refundService', () => ({ executeVerifiedRefund: jest.fn(), RefundError: class RefundError extends Error {} }));
jest.mock('../services/squareRefundService', () => ({ executeVerifiedSquareRefund: jest.fn() }));
jest.mock('../services/suppressionService', () => ({ suppressionService: {} }));
jest.mock('@sentry/node', () => ({ captureException: jest.fn() }));

import { deleteAccount } from '../controllers/userController';
import { purgeUser } from '../controllers/adminController';

const mkRes = () => {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

beforeEach(() => {
  calls.length = 0;
  jest.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => fn(mockTx));
  mockTx.user.delete.mockImplementation(async (args: any) => { calls.push(`tx.user.delete:${args.where.id}`); return {}; });
  mockHandOff.mockImplementation(async (userId: string) => { calls.push(`handoff:${userId}`); return { transferred: 0, decremented: 0 }; });
  for (const m of ['sale', 'saleHub', 'treasureTrail', 'affiliateLink', 'dispute', 'appraisalAIRequest', 'affiliateReferral', 'referralReward', 'affiliateConversion', 'organizerWorkspace', 'vendorBooth', 'holdInvoice', 'consignorPayout', 'consignorPayoutItem', 'consignorSettlementBatch']) {
    mockPrisma[m].count.mockResolvedValue(0);
  }
  mockPrisma.organizer.findUnique.mockResolvedValue(null);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('userController.deleteAccount', () => {
  const req = () => ({ user: { id: 'u1', email: 'u1@example.com', password: null, organizer: null }, body: {} } as any);

  it('hands off crews then deletes the user inside a single transaction, handoff first', async () => {
    const res = mkRes();
    await deleteAccount(req(), res);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockHandOff).toHaveBeenCalledWith('u1', mockTx);
    expect(calls).toEqual(['handoff:u1', 'tx.user.delete:u1']);
    expect(mockPrisma.user.delete).not.toHaveBeenCalled(); // no bare delete outside the transaction
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('keeps the affiliate commission ledger block: no transaction, no delete', async () => {
    mockPrisma.affiliateConversion.count.mockResolvedValue(2);
    const res = mkRes();
    await deleteAccount(req(), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toContain('creator commission record');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockHandOff).not.toHaveBeenCalled();
  });

  it('keeps the other restrict blockers (referrals, disputes, ...)', async () => {
    mockPrisma.affiliateReferral.count.mockResolvedValue(1);
    mockPrisma.dispute.count.mockResolvedValue(1);
    const res = mkRes();
    await deleteAccount(req(), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks (400, nothing deleted) when the account is the organizer on an invoice or owns consignor ledger rows', async () => {
    mockPrisma.holdInvoice.count.mockResolvedValue(2);
    mockPrisma.consignorSettlementBatch.count.mockResolvedValue(1);
    const res = mkRes();
    await deleteAccount({ user: { id: 'u1', email: 'u1@example.com', password: null, organizer: { id: 'o1' } }, body: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    const msg = res.json.mock.calls[0][0].message;
    expect(msg).toContain('2 invoices');
    expect(msg).toContain('1 consignor settlement batch');
    expect(mockPrisma.holdInvoice.count).toHaveBeenCalledWith({ where: { organizerUserId: 'u1' } });
    expect(mockPrisma.consignorSettlementBatch.count).toHaveBeenCalledWith({ where: { workspace: { ownerId: 'o1' } } });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('a shopper-only account (no organizer) only checks invoices it organized, never the consignor ledger', async () => {
    const res = mkRes();
    await deleteAccount(req(), res);
    expect(mockPrisma.holdInvoice.count).toHaveBeenCalledWith({ where: { organizerUserId: 'u1' } });
    expect(mockPrisma.consignorPayout.count).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('does not delete the user when the crew handoff fails (500, nothing deleted)', async () => {
    mockHandOff.mockRejectedValueOnce(new Error('handoff failed'));
    const res = mkRes();
    await deleteAccount(req(), res);
    expect(mockTx.user.delete).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('still requires the password for password accounts', async () => {
    const res = mkRes();
    await deleteAccount({ user: { id: 'u1', email: 'a@b.c', password: 'hash', organizer: null }, body: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('adminController.purgeUser', () => {
  const user = { id: 'u9', email: 'gone@example.com', deletedAt: new Date('2026-09-01T00:00:00Z') };
  const req = () => ({ params: { userId: 'u9' }, body: { confirmEmail: 'GONE@example.com' }, user: { id: 'admin1' } } as any);
  beforeEach(() => {
    mockPrisma.user.findUnique.mockResolvedValue(user);
  });

  it('hands off crews then purges inside a single transaction, handoff first', async () => {
    const res = mkRes();
    await purgeUser(req(), res);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockHandOff).toHaveBeenCalledWith('u9', mockTx);
    expect(calls).toEqual(['handoff:u9', 'tx.user.delete:u9']);
    expect(mockPrisma.user.delete).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, purgedUserId: 'u9' }));
  });

  it('blocks (409) when invoices or consignor payouts reference the account', async () => {
    mockPrisma.consignorPayout.count.mockResolvedValue(3);
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'o9' });
    const res = mkRes();
    await purgeUser(req(), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ blockedBy: 'Ledger' }));
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('still blocks (409) when AffiliateLink rows reference the account', async () => {
    mockPrisma.affiliateLink.count.mockResolvedValue(1);
    const res = mkRes();
    await purgeUser(req(), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('still requires a soft-deleted account and a matching confirmEmail', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...user, deletedAt: null });
    const res1 = mkRes();
    await purgeUser(req(), res1);
    expect(res1.status).toHaveBeenCalledWith(400);
    mockPrisma.user.findUnique.mockResolvedValue(user);
    const res2 = mkRes();
    await purgeUser({ ...req(), body: { confirmEmail: 'other@example.com' } }, res2);
    expect(res2.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not purge when the crew handoff fails', async () => {
    mockHandOff.mockRejectedValueOnce(new Error('handoff failed'));
    const res = mkRes();
    await purgeUser(req(), res);
    expect(mockTx.user.delete).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
