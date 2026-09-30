/**
 * POS cancelPaymentRequest (2026-09-30, fix agent F): the cancel is a compare-and-swap on the status
 * (PENDING / ACCEPTED), so a shopper confirm that wins the race is never overwritten with CANCELLED.
 * A lost race answers 409. Run: pnpm --filter backend test -- posCancelPaymentRequest
 */

jest.mock('../lib/prisma', () => ({
  prisma: {
    pOSPaymentRequest: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
  },
}));
jest.mock('../utils/posAuth', () => ({ resolveOrganizerOrTeamMember: jest.fn() }));
jest.mock('@sentry/node', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));
jest.mock('../lib/socket', () => ({ getIO: jest.fn(() => ({ to: () => ({ emit: jest.fn() }) })) }));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/squarePosPaymentAdapter', () => ({}));
jest.mock('../services/stripePosPaymentAdapter', () => ({}));
jest.mock('../services/squareRefundService', () => ({ refundFailedPosFulfillment: jest.fn() }));
jest.mock('../services/squarePurchaseEngagementService', () => ({ fireSquarePurchaseEngagement: jest.fn() }));
jest.mock('../services/posDiscountService', () => ({ resolvePosDiscount: jest.fn() }));
jest.mock('../lib/transactionalEmailService', () => ({ transactionalEmailService: { send: jest.fn() } }));
jest.mock('../controllers/ebayController', () => ({ endEbayListingIfExists: jest.fn() }));
jest.mock('../services/shopifyService', () => ({ markShopifyItemSold: jest.fn() }));
jest.mock('../services/marketplace/discogsListingConnector', () => ({ withdrawDiscogsListingIfExists: jest.fn() }));
jest.mock('../services/marketplace/reverbConnector', () => ({ withdrawReverbListingIfExists: jest.fn() }));
jest.mock('../services/facebookNudgeService', () => ({ notifyFacebookExportedItemSold: jest.fn() }));
jest.mock('../services/marketplaceStockSyncService', () => ({ syncMarketplaceStock: jest.fn() }));
jest.mock('../services/itemStockService', () => ({ sellItemUnits: jest.fn(), InsufficientStockError: class extends Error {} }));
jest.mock('../services/connectAccountGuard', () => ({ isPayoutFlaggedForReview: jest.fn() }));
jest.mock('../services/checkoutGuard', () => ({
  assertCheckoutAllowed: jest.fn(),
  recordSuspectedSignal: jest.fn(),
  CheckoutGuardError: class CheckoutGuardError extends Error {},
}));

import { prisma } from '../lib/prisma';
import { resolveOrganizerOrTeamMember } from '../utils/posAuth';
import { cancelPaymentRequest } from '../controllers/posPaymentController';

const db: any = prisma;

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const call = async (body: any = {}) => {
  const res = makeRes();
  await cancelPaymentRequest({ params: { id: 'req1' }, body, user: { id: 'owner1' } } as any, res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
  (resolveOrganizerOrTeamMember as jest.Mock).mockResolvedValue({ id: 'org1' });
  db.pOSPaymentRequest.findUnique.mockResolvedValue({
    id: 'req1',
    organizerId: 'org1',
    status: 'ACCEPTED',
    shopperUserId: 'shopper1',
    totalAmountCents: 5000,
  });
  db.pOSPaymentRequest.updateMany.mockResolvedValue({ count: 1 });
});

describe('cancelPaymentRequest', () => {
  it('cancels with a compare-and-swap on PENDING / ACCEPTED', async () => {
    const res = await call({ reason: 'Wrong amount' });
    expect(db.pOSPaymentRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'req1', status: { in: ['PENDING', 'ACCEPTED'] } },
      data: { status: 'CANCELLED', declineReason: 'Wrong amount' },
    });
    expect(db.pOSPaymentRequest.update).not.toHaveBeenCalled(); // no unguarded write
    expect(res.json.mock.calls[0][0]).toMatchObject({ requestId: 'req1', status: 'CANCELLED' });
  });

  it('answers 409 when a concurrent confirm already moved the request (never overwrites it)', async () => {
    db.pOSPaymentRequest.updateMany.mockResolvedValue({ count: 0 });
    db.pOSPaymentRequest.findUnique
      .mockResolvedValueOnce({ id: 'req1', organizerId: 'org1', status: 'ACCEPTED', shopperUserId: 'shopper1', totalAmountCents: 5000 })
      .mockResolvedValueOnce({ status: 'PAID' });
    const res = await call();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0]).toMatchObject({ code: 'PAYMENT_REQUEST_STATE_CHANGED', status: 'PAID' });
    expect(db.pOSPaymentRequest.update).not.toHaveBeenCalled();
  });

  it('still rejects a request that is already PAID up front', async () => {
    db.pOSPaymentRequest.findUnique.mockResolvedValue({ id: 'req1', organizerId: 'org1', status: 'PAID', shopperUserId: 'shopper1', totalAmountCents: 5000 });
    const res = await call();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.pOSPaymentRequest.updateMany).not.toHaveBeenCalled();
  });
});
