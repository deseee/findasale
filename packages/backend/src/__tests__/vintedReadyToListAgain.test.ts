/**
 * 1.0.76 (2026-10-27): "ready to list on Vinted again". Vinted is drafts only and nothing lists an item there again by itself,
 * so when the newest Vinted row is a sale there (REMOVE/REMOVED, lastErrorMessage 'sold_on_vinted...') and stock remains,
 * GET /items/:id/marketplace-status carries platforms.vinted.readyToListAgain = { unitsLeft } for the item form's note.
 */

const mockPrisma: any = {
  organizer: { findUnique: jest.fn() },
  marketplaceListingJob: { findMany: jest.fn() },
  itemMarketplacePush: { findMany: jest.fn(), count: jest.fn(), groupBy: jest.fn() },
  etsyListing: { findFirst: jest.fn() },
  itemCard: { findUnique: jest.fn() },
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../services/ebayPublishService', () => ({ getAcceptedConditionsForCategory: jest.fn() }));

import {
  vintedReadyToListAgain,
  buildItemMarketplaceStatus,
  getItemMarketplaceStatus,
  ITEM_STATUS_SELECT,
  type MarketplaceJobRow,
} from '../services/itemMarketplaceStatusService';

const T = (n: number) => new Date(Date.UTC(2026, 9, 27, 0, n));
const job = (action: string, status: string, n: number, lastErrorMessage: string | null = null, platform = 'VINTED', itemId = 'i1'): MarketplaceJobRow => ({
  itemId, platform, action, status, createdAt: T(n), lastErrorMessage,
});

function baseInputs(over: Record<string, unknown> = {}): any {
  return {
    item: {
      id: 'i1', title: 'Scarf', category: 'Clothing', ebayCategoryId: null, ebayListingId: null, ebayOfferId: null,
      discogsListingId: null, reverbListingId: null, shopifyListing: null,
      ebaySyncHeldAt: null, ebayHeldFields: [], ebayContentDirtyAt: null, stockTotal: 78, stockSold: 1,
    },
    hasEbayConnection: false, shopifyEnabled: false, subscriptionTier: 'PRO',
    hasActiveDiscogsAccount: false, hasActiveReverbAccount: false, hasActiveEtsyAccount: false,
    extensionPlatformsUsed: { facebook: false, craigslist: false, gumtreeAu: false, grailed: false, poshmark: false, mercari: false, vinted: true },
    jobs: [], pausedMarketplaces: [], recentPushRows: [], failedUnacknowledgedPushCount: 0,
    ...over,
  };
}

describe('vintedReadyToListAgain', () => {
  it('a sale on Vinted with stock left gives the units left', () => {
    const jobs = [job('POST', 'POSTED', 1), job('REMOVE', 'REMOVED', 2, 'sold_on_vinted: 123')];
    expect(vintedReadyToListAgain(jobs, 'i1', { stockTotal: 78, stockSold: 1 })).toBe(77);
  });

  it('null when no stock is left, when the newest row is not a Vinted sale, or the stock was not loaded', () => {
    const sold = [job('POST', 'POSTED', 1), job('REMOVE', 'REMOVED', 2, 'sold_on_vinted')];
    expect(vintedReadyToListAgain(sold, 'i1', { stockTotal: 1, stockSold: 1 })).toBeNull();
    expect(vintedReadyToListAgain(sold, 'i1', { stockTotal: 5 })).toBeNull();
    expect(vintedReadyToListAgain([job('REMOVE', 'REMOVED', 2, 'sold_elsewhere')], 'i1', { stockTotal: 5, stockSold: 1 })).toBeNull();
    expect(vintedReadyToListAgain([job('REMOVE', 'REMOVED', 2, 'sold_on_mercari')], 'i1', { stockTotal: 5, stockSold: 1 })).toBeNull();
    // Listed on Vinted again after the sale: nothing to suggest.
    expect(vintedReadyToListAgain([...sold, job('POST', 'POSTED', 3)], 'i1', { stockTotal: 5, stockSold: 1 })).toBeNull();
    // Another platform's or another item's rows never count.
    expect(vintedReadyToListAgain([job('REMOVE', 'REMOVED', 2, 'sold_on_vinted', 'MERCARI')], 'i1', { stockTotal: 5, stockSold: 1 })).toBeNull();
    expect(vintedReadyToListAgain([job('REMOVE', 'REMOVED', 2, 'sold_on_vinted', 'VINTED', 'other')], 'i1', { stockTotal: 5, stockSold: 1 })).toBeNull();
  });

  it('a failed removal attempt (REMOVE/SKIPPED) after the sale does not hide it', () => {
    const jobs = [job('REMOVE', 'REMOVED', 2, 'sold_on_vinted'), job('REMOVE', 'SKIPPED', 3, 'whatever')];
    expect(vintedReadyToListAgain(jobs, 'i1', { stockTotal: null, stockSold: 0 })).toBe(1);
  });
});

describe('buildItemMarketplaceStatus: platforms.vinted.readyToListAgain', () => {
  it('present with unitsLeft after a Vinted sale with stock left; Vinted itself reads not listed', () => {
    const out = buildItemMarketplaceStatus(baseInputs({ jobs: [job('POST', 'POSTED', 1), job('REMOVE', 'REMOVED', 2, 'sold_on_vinted')] }));
    expect(out.platforms.vinted.readyToListAgain).toEqual({ unitsLeft: 77 });
    expect(out.platforms.vinted.status).not.toBe('listed_needs_manual_update');
    expect((out.platforms.mercari as any).readyToListAgain).toBeUndefined();
  });

  it('absent while Vinted is paused, while it is listed, or with no sale there', () => {
    const sold = [job('POST', 'POSTED', 1), job('REMOVE', 'REMOVED', 2, 'sold_on_vinted')];
    expect(buildItemMarketplaceStatus(baseInputs({ jobs: sold, pausedMarketplaces: ['VINTED'] })).platforms.vinted.readyToListAgain).toBeUndefined();
    expect(buildItemMarketplaceStatus(baseInputs({ jobs: [...sold, job('POST', 'POSTED', 3)] })).platforms.vinted.readyToListAgain).toBeUndefined();
    expect(buildItemMarketplaceStatus(baseInputs()).platforms.vinted.readyToListAgain).toBeUndefined();
  });
});

describe('getItemMarketplaceStatus loads the stock numbers it needs', () => {
  it('ITEM_STATUS_SELECT includes stockTotal and stockSold, and the job read carries lastErrorMessage', async () => {
    expect(ITEM_STATUS_SELECT).toMatchObject({ stockTotal: true, stockSold: true });
    mockPrisma.organizer.findUnique.mockResolvedValue({ ebayConnection: null, shopifyEnabled: false, subscriptionTier: 'PRO', pausedMarketplaces: [], marketplaceAccounts: [] });
    mockPrisma.marketplaceListingJob.findMany
      .mockResolvedValueOnce([job('POST', 'POSTED', 1), job('REMOVE', 'REMOVED', 2, 'sold_on_vinted')])
      .mockResolvedValueOnce([{ platform: 'VINTED' }]);
    mockPrisma.itemMarketplacePush.findMany.mockResolvedValue([]);
    mockPrisma.itemMarketplacePush.count.mockResolvedValue(0);
    mockPrisma.etsyListing.findFirst.mockResolvedValue(null);
    mockPrisma.itemCard.findUnique.mockResolvedValue(null);
    const out = await getItemMarketplaceStatus({ item: baseInputs().item, ownerOrganizerId: 'org1' });
    expect(out.platforms.vinted.readyToListAgain).toEqual({ unitsLeft: 77 });
    const jobQuery = mockPrisma.marketplaceListingJob.findMany.mock.calls[0][0];
    expect(jobQuery.select).toMatchObject({ lastErrorMessage: true });
  });
});
