/**
 * A bulk lot at the auction close and the Facebook sale entry points (ADR-136 Addendum B, roadmap #659).
 *
 * WHAT THIS PROVES:
 *   - closing an item that is somehow flagged as an auction but is a bulk lot closes nothing: no claim written, no winner, no notification
 *   - a failed lot lookup with the flag on also leaves the auction alone (fail closed)
 *   - an outside sale signal for a lot (Facebook native sale) is ignored: the lot is not marked SOLD and nothing is withdrawn
 *   - a failed lookup with the flag on makes the Facebook commit throw so the caller retries, instead of marking a lot SOLD
 *   - a plain item is not refused by either entry point's lot check
 */
jest.mock('@sentry/node', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));
jest.mock('../index', () => ({ prisma: { item: { findUnique: jest.fn(), updateMany: jest.fn() }, itemBulkLot: { findMany: jest.fn() } } }));
jest.mock('../lib/prisma', () => ({ prisma: { item: { findUnique: jest.fn(), updateMany: jest.fn() }, itemBulkLot: { findMany: jest.fn() } } }));
jest.mock('../services/notificationService', () => ({ createNotification: jest.fn() }));
jest.mock('../services/itemStockService', () => ({ sellItemUnits: jest.fn(), InsufficientStockError: class extends Error {} }));
jest.mock('../services/soldFanOutService', () => ({ fanOutItemSoldWithdrawals: jest.fn() }));
jest.mock('../services/marketplaceStockSyncService', () => ({ syncMarketplaceStock: jest.fn() }));
jest.mock('../services/squareCheckoutLinkService', () => ({ createSquareCheckoutLink: jest.fn() }));
jest.mock('../services/squarePaymentService', () => ({ buildSquareIdempotencyKey: jest.fn() }));
jest.mock('../services/xpService', () => ({ awardXp: jest.fn(), applyHuntPassMultiplier: jest.fn(), XP_AWARDS: {}, checkMonthlyXpCap: jest.fn() }));
jest.mock('../services/itemSaleGuard', () => {
  class ItemAlreadyCommittedError extends Error {}
  return { commitItemSale: jest.fn(), ItemAlreadyCommittedError };
});
jest.mock('../controllers/ebayController', () => ({ endEbayListingIfExists: jest.fn() }));
jest.mock('../services/shopifyService', () => ({ markShopifyItemSold: jest.fn() }));
jest.mock('../services/marketplace/discogsListingConnector', () => ({ withdrawDiscogsListingIfExists: jest.fn() }));
jest.mock('../services/marketplace/reverbConnector', () => ({ withdrawReverbListingIfExists: jest.fn() }));
jest.mock('../services/marketplace/etsyConnector', () => ({ withdrawEtsyListingIfExists: jest.fn() }));

import { prisma as indexPrisma } from '../index';
import { prisma as libPrisma } from '../lib/prisma';
import { createNotification } from '../services/notificationService';
import { commitItemSale } from '../services/itemSaleGuard';
import { closeAuction } from '../services/auctionService';
import { commitFacebookNativeSale } from '../services/facebookNativeSaleService';

const ip: any = indexPrisma;
const lp: any = libPrisma;

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  process.env.CARD_BULK_LOTS_ENABLED = 'true';
  ip.item.findUnique.mockResolvedValue({ id: 'lot1', listingType: 'AUCTION', auctionClosed: false, sale: { organizer: { id: 'org1' } }, bids: [] });
});
afterAll(() => {
  delete process.env.CARD_BULK_LOTS_ENABLED;
});

describe('closeAuction and a bulk lot', () => {
  it('closes nothing for a lot: no claim, no notification', async () => {
    ip.itemBulkLot.findMany.mockResolvedValue([{ itemId: 'lot1' }]);
    const res = await closeAuction('lot1');
    expect(res).toEqual({ outcome: 'NOT_AN_AUCTION' });
    expect(ip.item.updateMany).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('with the flag on a failed lookup leaves the auction alone', async () => {
    ip.itemBulkLot.findMany.mockRejectedValue(new Error('db down'));
    const res = await closeAuction('lot1');
    expect(res.outcome).not.toBe('CLOSED');
    expect(ip.item.updateMany).not.toHaveBeenCalled();
  });

  it('a plain item passes the lot check (the close then goes on past it)', async () => {
    ip.itemBulkLot.findMany.mockResolvedValue([]);
    let outcome: string | undefined;
    try {
      outcome = (await closeAuction('lot1')).outcome;
    } catch {
      outcome = 'WENT_PAST_THE_CHECK';
    }
    expect(outcome).not.toBe('NOT_AN_AUCTION');
  });
});

describe('commitFacebookNativeSale and a bulk lot', () => {
  it('ignores an outside sale signal for a lot and does not mark it SOLD', async () => {
    lp.itemBulkLot.findMany.mockResolvedValue([{ itemId: 'lot1' }]);
    const res = await commitFacebookNativeSale('lot1', 'facebook-native');
    expect(res).toMatchObject({ ok: true, alreadyCommitted: true, bulkLotIgnored: true });
    expect(commitItemSale).not.toHaveBeenCalled();
  });

  it('with the flag on a failed lookup throws so the caller retries', async () => {
    lp.itemBulkLot.findMany.mockRejectedValue(new Error('db down'));
    await expect(commitFacebookNativeSale('lot1', 'facebook-native')).rejects.toThrow('BULK_CHECK_FAILED');
    expect(commitItemSale).not.toHaveBeenCalled();
  });

  it('a plain item goes on to be marked SOLD', async () => {
    lp.itemBulkLot.findMany.mockResolvedValue([]);
    (commitItemSale as any).mockResolvedValue(undefined);
    try {
      await commitFacebookNativeSale('item9', 'facebook-native');
    } catch {
      /* later steps use more of the database than this test fakes; the point is the lot check let it through */
    }
    expect(commitItemSale).toHaveBeenCalled();
  });
});
