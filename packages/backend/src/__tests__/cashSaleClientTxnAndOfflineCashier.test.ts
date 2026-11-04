/**
 * 2026-11-04: POS cash sale recorded twice, and the offline replay price-floor gap.
 *
 * WHAT THIS PROVES (real processCashSaleCore, real syncController.batchSync; DB mocked)
 *   - a cash sale with a clientTransactionId is written inside a transaction that takes the per-sale
 *     advisory lock, and a second request with the same id is answered as a replay (no second sale)
 *   - a replay found by the in-transaction re-check (two requests racing) writes nothing
 *   - an offline-queued sale rung up by a TEAM_MEMBER runs the same price floor as the live register:
 *     below the item price without discount permission is refused, at full price it is recorded
 *   - a cashier who is no longer a member of the owner's workspace gets no permission (fails closed)
 *   - the owner's own queued sale, and a legacy entry with no cashier, keep the owner's override
 *   - a test transaction queued offline stays a test transaction when it syncs
 */
jest.mock('@sentry/node', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));
jest.mock('../middleware/auth', () => ({}));
jest.mock('../utils/posAuth', () => ({ resolveOrganizerOrTeamMember: jest.fn() }));
jest.mock('../lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
    sale: { findUnique: jest.fn() },
    purchase: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
    item: { findMany: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    itemBulkLot: { findMany: jest.fn() },
    organizer: { findUnique: jest.fn() },
    workspaceSettings: { findUnique: jest.fn() },
    workspaceMember: { findFirst: jest.fn() },
  },
}));
jest.mock('../services/workspacePermissionService', () => ({ checkPermission: jest.fn() }));
jest.mock('../services/itemStockService', () => {
  class InsufficientStockError extends Error {}
  return { InsufficientStockError, sellItemUnits: jest.fn(), sellItemUnitsInTransaction: jest.fn() };
});
jest.mock('../utils/feeCalculator', () => ({ snapshotForCommissionOnly: jest.fn(() => ({})) }));
jest.mock('../services/cashFeeService', () => ({
  resolveCashCommissionRate: jest.fn(async () => 0.06),
  cashCommissionOn: jest.fn((amount: number, rate: number) => Math.round(amount * rate * 100) / 100),
  accrueCashFeeBalance: jest.fn(async () => undefined),
}));
jest.mock('../controllers/ebayController', () => ({ endEbayListingIfExists: jest.fn(async () => undefined) }));
jest.mock('../services/shopifyService', () => ({ markShopifyItemSold: jest.fn(async () => undefined) }));
jest.mock('../services/marketplace/discogsListingConnector', () => ({ withdrawDiscogsListingIfExists: jest.fn(async () => undefined) }));
jest.mock('../services/marketplace/reverbConnector', () => ({ withdrawReverbListingIfExists: jest.fn(async () => undefined) }));
jest.mock('../services/facebookNudgeService', () => ({ notifyFacebookExportedItemSold: jest.fn(async () => undefined) }));
jest.mock('../services/marketplaceStockSyncService', () => ({ syncMarketplaceStock: jest.fn(async () => undefined) }));
jest.mock('../lib/transactionalEmailService', () => ({ transactionalEmailService: { emails: { send: jest.fn() } } }));
jest.mock('../services/checkoutGuard', () => ({ recordSuspectedSignal: jest.fn() }));

import { prisma } from '../lib/prisma';
import { sellItemUnits } from '../services/itemStockService';
import { checkPermission } from '../services/workspacePermissionService';
import { processCashSaleCore } from '../controllers/cashPaymentController';
import { batchSync, resolveOfflineCashier } from '../controllers/syncController';

const db = prisma as any;
const LAMP = { id: 'lamp', title: 'Brass Lamp', status: 'AVAILABLE', draftStatus: null, price: 40, stockTotal: null, stockSold: 0 };
const OWNER_ORG = { id: 'org1', userId: 'owner-user', subscriptionTier: 'TEAMS' };

let counter = 0;
beforeEach(() => {
  jest.clearAllMocks();
  counter = 0;
  db.purchase.findMany.mockResolvedValue([]);
  db.purchase.findFirst.mockResolvedValue(null);
  db.purchase.create.mockImplementation(async ({ data }: any) => ({ id: `p${++counter}`, amount: data.amount, platformFeeAmount: 0, ...data }));
  db.item.findMany.mockResolvedValue([LAMP]);
  db.item.updateMany.mockResolvedValue({ count: 1 });
  db.itemBulkLot.findMany.mockResolvedValue([]);
  db.organizer.findUnique.mockResolvedValue({ cashFeeBalance: 0, cashFeeBalanceUpdatedAt: null });
  db.workspaceSettings.findUnique.mockResolvedValue(null);
  db.workspaceMember.findFirst.mockResolvedValue(null);
  db.$executeRaw.mockResolvedValue(1);
  db.$transaction.mockImplementation(async (cb: any) => cb(db));
  db.sale.findUnique.mockResolvedValue({ id: 'sale1', organizer: OWNER_ORG });
  (sellItemUnits as jest.Mock).mockResolvedValue({ fullySoldOut: true, remainingStock: 0 });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

const OWNER_ACTOR = { id: 'org1', subscriptionTier: 'TEAMS', actorKind: 'ORGANIZER' as const, actingUserId: 'owner-user' };

describe('live cash sale de-duplicates on clientTransactionId', () => {
  it('writes the sale inside a locked transaction', async () => {
    const r = await processCashSaleCore({ organizer: OWNER_ACTOR, saleId: 'sale1', items: [{ itemId: 'lamp', amount: 40 }], cashReceived: 40, clientTransactionId: 'txn-1' });
    expect(r.replay).toBe(false);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.$executeRaw).toHaveBeenCalledTimes(1); // pg_advisory_xact_lock on the sale key
    expect(db.purchase.create).toHaveBeenCalledTimes(1);
    expect(db.purchase.create.mock.calls[0][0].data.clientTransactionId).toBe('txn-1');
  });

  it('a second request with the same id returns the existing sale and writes nothing', async () => {
    db.purchase.findMany.mockResolvedValue([{ id: 'p-existing', amount: 40, platformFeeAmount: 2.4, isTestTransaction: false }]);
    const r = await processCashSaleCore({ organizer: OWNER_ACTOR, saleId: 'sale1', items: [{ itemId: 'lamp', amount: 40 }], cashReceived: 40, clientTransactionId: 'txn-1' });
    expect(r.replay).toBe(true);
    expect(r.purchaseIds).toEqual(['p-existing']);
    expect(db.purchase.create).not.toHaveBeenCalled();
    expect(sellItemUnits).not.toHaveBeenCalled();
  });

  it('two requests racing: the one that loses the lock answers as a replay', async () => {
    // Pre-check sees nothing (the first request has not committed yet); the in-transaction re-check sees its rows.
    db.purchase.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'p-first', amount: 40, platformFeeAmount: 2.4, isTestTransaction: false }]);
    const r = await processCashSaleCore({ organizer: OWNER_ACTOR, saleId: 'sale1', items: [{ itemId: 'lamp', amount: 40 }], cashReceived: 40, clientTransactionId: 'txn-1' });
    expect(r.replay).toBe(true);
    expect(r.purchaseIds).toEqual(['p-first']);
    expect(db.purchase.create).not.toHaveBeenCalled();
    expect(sellItemUnits).not.toHaveBeenCalled();
  });
});

function syncReq(payload: Record<string, unknown>) {
  return {
    user: { organizerProfile: true, organizer: { id: 'org1' } },
    body: {
      operations: [{ type: 'CHECKOUT_CASH', localId: 'txn-9', saleId: 'sale1', timestamp: new Date().toISOString(), payload: { cashReceived: 100, clientTransactionId: 'txn-9', ...payload } }],
    },
  } as any;
}
async function runSync(r: any): Promise<any> {
  let body: any;
  const res: any = { status: () => res, json: (b: any) => ((body = b), res) };
  await batchSync(r, res);
  return body;
}

describe('offline cash replay applies the team-member price floor', () => {
  it('refuses a below-price line rung up by a team member without discount permission', async () => {
    db.workspaceMember.findFirst.mockResolvedValue({ workspaceId: 'ws1', role: 'MEMBER' });
    (checkPermission as jest.Mock).mockResolvedValue(false);
    const body = await runSync(syncReq({ items: [{ itemId: 'lamp', amount: 0.4 }], cashierUserId: 'staff-user' }));
    expect(body.synced).toHaveLength(0);
    expect(body.failed).toHaveLength(1);
    expect(body.failed[0].error).toMatch(/"Brass Lamp" must be sold at its price of \$40\.00/);
    expect(body.failed[0].retryable).toBe(false);
    expect(db.purchase.create).not.toHaveBeenCalled();
    expect(db.workspaceMember.findFirst.mock.calls[0][0].where).toMatchObject({ userId: 'staff-user', workspace: { ownerId: 'org1' } });
  });

  it('records the team member sale at full price', async () => {
    db.workspaceMember.findFirst.mockResolvedValue({ workspaceId: 'ws1', role: 'MEMBER' });
    (checkPermission as jest.Mock).mockResolvedValue(false);
    const body = await runSync(syncReq({ items: [{ itemId: 'lamp', amount: 40 }], cashierUserId: 'staff-user' }));
    expect(body.failed).toHaveLength(0);
    expect(body.synced).toHaveLength(1);
    expect(db.purchase.create).toHaveBeenCalledTimes(1);
  });

  it('a cashier who left the workspace gets no permission to lower a price', async () => {
    db.workspaceMember.findFirst.mockResolvedValue(null);
    const body = await runSync(syncReq({ items: [{ itemId: 'lamp', amount: 10 }], cashierUserId: 'former-staff' }));
    expect(body.failed).toHaveLength(1);
    expect(body.failed[0].error).toMatch(/Unable to verify discount permission/);
    expect(db.purchase.create).not.toHaveBeenCalled();
  });

  it('the owner keeps the price override, with or without the cashier field', async () => {
    let body = await runSync(syncReq({ items: [{ itemId: 'lamp', amount: 0.4 }], cashierUserId: 'owner-user' }));
    expect(body.synced).toHaveLength(1);
    body = await runSync(syncReq({ items: [{ itemId: 'lamp', amount: 0.4 }] }));
    expect(body.synced).toHaveLength(1);
    expect(checkPermission).not.toHaveBeenCalled();
    expect(db.workspaceMember.findFirst).not.toHaveBeenCalled();
  });

  it('a test transaction queued offline stays a test transaction', async () => {
    await runSync(syncReq({ items: [{ itemId: 'lamp', amount: 40 }], isTestTransaction: true }));
    expect(db.purchase.create).toHaveBeenCalledTimes(1);
    expect(db.purchase.create.mock.calls[0][0].data.isTestTransaction).toBe(true);
    expect(sellItemUnits).not.toHaveBeenCalled();
  });
});

describe('resolveOfflineCashier', () => {
  it('maps the cashier to the right actor', async () => {
    expect(await resolveOfflineCashier(OWNER_ORG, undefined)).toEqual({ id: 'org1', subscriptionTier: 'TEAMS' });
    expect(await resolveOfflineCashier(OWNER_ORG, 'owner-user')).toMatchObject({ actorKind: 'ORGANIZER' });
    db.workspaceMember.findFirst.mockResolvedValue({ workspaceId: 'ws1', role: 'CASHIER' });
    expect(await resolveOfflineCashier(OWNER_ORG, 'staff-user')).toEqual({
      id: 'org1', subscriptionTier: 'TEAMS', actorKind: 'TEAM_MEMBER', actingUserId: 'staff-user', workspaceId: 'ws1', workspaceRole: 'CASHIER',
    });
  });
});
