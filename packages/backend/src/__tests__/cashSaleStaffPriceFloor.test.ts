/**
 * Security fix (2026-11-04, finding #13, owner decision): processCashSaleCore trusted the client-sent
 * items[].amount for catalog items, so a TEAM_MEMBER cashier could ring a $40 item up for $0.40 and skip the
 * per-member POS discount permission and cap.
 *
 * WHAT THIS PROVES (real processCashSaleCore, real resolvePosDiscount and checkStaffLinePrices; DB mocked)
 *   - TEAM_MEMBER without apply_pos_discount: a line below the DB price is refused with a clear 400, nothing written
 *   - TEAM_MEMBER without the permission at full price: the sale goes through (legit path)
 *   - TEAM_MEMBER with a 10% cap: 10% off a line goes through, 50% off is refused
 *   - TEAM_MEMBER with a $5 FIXED cap: $5 off in total goes through, $6 off is refused
 *   - the owner (ORGANIZER) keeps the price override the register always gave them
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
    workspaceSettings: { findUnique: jest.fn() },
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
import { CashSaleError, processCashSaleCore } from '../controllers/cashPaymentController';

const db = prisma as any;

const LAMP = { id: 'lamp', title: 'Brass Lamp', status: 'AVAILABLE', draftStatus: null, price: 40, stockTotal: null, stockSold: 0 };
const CHAIR = { id: 'chair', title: 'Oak Chair', status: 'AVAILABLE', draftStatus: null, price: 25, stockTotal: null, stockSold: 0 };

const OWNER = { id: 'org1', subscriptionTier: 'TEAMS', actorKind: 'ORGANIZER' as const, actingUserId: 'owner-user' };
const STAFF = { id: 'org1', subscriptionTier: 'TEAMS', actorKind: 'TEAM_MEMBER' as const, actingUserId: 'staff-user', workspaceId: 'ws1', workspaceRole: 'MEMBER' as any };

let counter = 0;
beforeEach(() => {
  jest.clearAllMocks();
  counter = 0;
  db.purchase.findMany.mockResolvedValue([]);
  db.purchase.create.mockImplementation(async ({ data }: any) => ({ id: `p${++counter}`, ...data }));
  db.item.findMany.mockResolvedValue([LAMP, CHAIR]);
  db.item.updateMany.mockResolvedValue({ count: 1 });
  db.itemBulkLot.findMany.mockResolvedValue([]);
  db.organizer.findUnique.mockResolvedValue({ cashFeeBalance: 0, cashFeeBalanceUpdatedAt: null });
  db.workspaceSettings.findUnique.mockResolvedValue(null);
  db.$transaction.mockImplementation(async (cb: any) => cb(db));
  (sellItemUnits as jest.Mock).mockResolvedValue({ fullySoldOut: true, remainingStock: 0 });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

const sell = (organizer: any, items: Array<{ itemId: string; amount: number }>) =>
  processCashSaleCore({ organizer, saleId: 'sale1', items, cashReceived: 100 });

async function expectRefused(p: Promise<unknown>, message: RegExp) {
  let caught: any;
  try { await p; } catch (e) { caught = e; }
  expect(caught).toBeInstanceOf(CashSaleError);
  expect(caught.statusCode ?? caught.status).toBe(400);
  expect(caught.message).toMatch(message);
  expect(db.purchase.create).not.toHaveBeenCalled();
}

describe('cash register line price floor for team members', () => {
  it('TEAM_MEMBER without discount permission cannot sell below the item price', async () => {
    (checkPermission as jest.Mock).mockResolvedValue(false);
    await expectRefused(sell(STAFF, [{ itemId: 'lamp', amount: 0.4 }]), /"Brass Lamp" must be sold at its price of \$40\.00/);
  });

  it('TEAM_MEMBER without discount permission can sell at full price (legit path)', async () => {
    (checkPermission as jest.Mock).mockResolvedValue(false);
    const result = await sell(STAFF, [{ itemId: 'lamp', amount: 40 }, { itemId: 'chair', amount: 25 }]);
    expect(result.totalAmount).toBe(65);
    expect(db.purchase.create).toHaveBeenCalledTimes(2);
    expect(checkPermission).not.toHaveBeenCalled(); // nothing was lowered, so nothing to authorize
  });

  it('TEAM_MEMBER with a 10% cap can take 10% off a line (within cap)', async () => {
    (checkPermission as jest.Mock).mockResolvedValue(true);
    db.workspaceSettings.findUnique.mockResolvedValue({ staffDiscountCapType: 'PERCENT', staffDiscountCapValue: 10 });
    const result = await sell(STAFF, [{ itemId: 'lamp', amount: 36 }, { itemId: 'chair', amount: 25 }]);
    expect(result.totalAmount).toBe(61);
  });

  it('TEAM_MEMBER with a 10% cap cannot take 50% off a line (over cap)', async () => {
    (checkPermission as jest.Mock).mockResolvedValue(true);
    db.workspaceSettings.findUnique.mockResolvedValue({ staffDiscountCapType: 'PERCENT', staffDiscountCapValue: 10 });
    await expectRefused(sell(STAFF, [{ itemId: 'lamp', amount: 20 }]), /Max discount for your role is 10%\. "Brass Lamp" cannot go below \$36\.00/);
  });

  it('TEAM_MEMBER with a $5 cap: $5 off in total is allowed, $6 off is refused', async () => {
    (checkPermission as jest.Mock).mockResolvedValue(true);
    db.workspaceSettings.findUnique.mockResolvedValue({ staffDiscountCapType: 'FIXED', staffDiscountCapValue: 5 });
    const ok = await sell(STAFF, [{ itemId: 'lamp', amount: 37 }, { itemId: 'chair', amount: 23 }]);
    expect(ok.totalAmount).toBe(60);
    jest.clearAllMocks();
    db.purchase.create.mockImplementation(async ({ data }: any) => ({ id: `p${++counter}`, ...data }));
    await expectRefused(sell(STAFF, [{ itemId: 'lamp', amount: 37 }, { itemId: 'chair', amount: 22 }]), /Max discount for your role is \$5\.00/);
  });

  it('TEAM_MEMBER with the permission and no cap is uncapped, same as the cart discount', async () => {
    (checkPermission as jest.Mock).mockResolvedValue(true);
    const result = await sell(STAFF, [{ itemId: 'lamp', amount: 10 }]);
    expect(result.totalAmount).toBe(10);
  });

  it('the owner keeps the register price override', async () => {
    const result = await sell(OWNER, [{ itemId: 'lamp', amount: 0.4 }]);
    expect(result.totalAmount).toBe(0.4);
    expect(checkPermission).not.toHaveBeenCalled();
  });
});
