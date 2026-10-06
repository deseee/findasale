/**
 * Per-platform listing status service (item editor unification, Wave 2: U3).
 * Covers: newest-row-wins with REMOVE/SKIPPED exclusion, the composed per-platform status, the batched failed-push
 * counts for the Add Items list, and a PARITY test that runs the real extensionController.getExtensionItems against
 * the same job rows and asserts its marketplaceListed* flags equal this service (they must never drift).
 */

const mockPrisma: any = {
  organizer: { findUnique: jest.fn() },
  sale: { findMany: jest.fn() },
  item: { findMany: jest.fn(), update: jest.fn() },
  marketplaceListingJob: { findMany: jest.fn() },
  itemMarketplacePush: { findMany: jest.fn(), count: jest.fn(), groupBy: jest.fn() },
  etsyListing: { findFirst: jest.fn() },
  itemCard: { findUnique: jest.fn() },
};

jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../services/ebayPublishService', () => ({
  ...jest.requireActual('../services/ebayPublishService'),
  getAcceptedConditionsForCategory: jest.fn(),
}));
// extensionController dependencies that are irrelevant to the listed flags.
jest.mock('../utils/cloudinaryWatermark', () => ({
  getWatermarkedUrlWithQR: (u: string) => u,
  ensureQrCodeAsset: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../utils/watermarkPolicy', () => ({ canRemoveWatermark: () => true }));
jest.mock('../controllers/ebayController', () => ({
  applyNeverShippableOverride: jest.fn().mockResolvedValue(null),
  computeEffectivePackageWeight: jest.fn().mockResolvedValue(null),
}));
jest.mock('../services/facebookNativeSaleService', () => ({ commitFacebookNativeSale: jest.fn() }));
jest.mock('../services/vintedSoldDetectionService', () => ({
  processVintedSoldReport: jest.fn(),
  sanitizeVintedSoldEntries: jest.fn(),
  VINTED_SOLD_MAX_ENTRIES: 100,
  normalizeListingTitle: (t: string) => t,
}));
jest.mock('../services/messageAutosendService', () => ({ decideMessageAutosend: jest.fn() }));
jest.mock('../services/ebayRateEstimateService', () => ({
  ...jest.requireActual('../services/ebayRateEstimateService'), // the eligibility registry reads its category tables
  computeCheapestForOrigin: jest.fn(),
}));

import {
  latestJobByItemPlatform,
  listedExtensionPlatformsByItemId,
  buildItemMarketplaceStatus,
  getItemMarketplaceStatus,
  getFailedPushCountsByItemId,
  EXTENSION_PLATFORMS,
  type MarketplaceJobRow,
} from '../services/itemMarketplaceStatusService';
import { getExtensionItems } from '../controllers/extensionController';
import { getAcceptedConditionsForCategory } from '../services/ebayPublishService';

const T = (n: number) => new Date(Date.UTC(2026, 9, 1, 0, n));
const job = (itemId: string, platform: string, action: string, status: string, n: number): MarketplaceJobRow => ({
  itemId, platform, action, status, createdAt: T(n),
});

describe('latestJobByItemPlatform and listedExtensionPlatformsByItemId (newest row wins)', () => {
  it('POST/POSTED newest means listed', () => {
    const listed = listedExtensionPlatformsByItemId([job('a', 'FACEBOOK', 'POST', 'POSTED', 1)]);
    expect([...(listed.get('a') ?? [])]).toEqual(['FACEBOOK']);
  });

  it('a newer REMOVE/REMOVED row ends the listing, and a newer POST/POSTED after it relists it', () => {
    const removed = listedExtensionPlatformsByItemId([
      job('a', 'CRAIGSLIST', 'POST', 'POSTED', 1),
      job('a', 'CRAIGSLIST', 'REMOVE', 'REMOVED', 2),
    ]);
    expect(removed.get('a')).toBeUndefined();
    const relisted = listedExtensionPlatformsByItemId([
      job('a', 'MERCARI', 'POST', 'POSTED', 1),
      job('a', 'MERCARI', 'REMOVE', 'REMOVED', 2),
      job('a', 'MERCARI', 'POST', 'POSTED', 3),
    ]);
    expect(relisted.get('a')!.has('MERCARI')).toBe(true);
  });

  it('REMOVE/SKIPPED rows are excluded: a failed removal attempt does not end the listing', () => {
    const rows = [job('a', 'VINTED', 'POST', 'POSTED', 1), job('a', 'VINTED', 'REMOVE', 'SKIPPED', 2)];
    expect(latestJobByItemPlatform(rows).get('a:VINTED')!.action).toBe('POST');
    expect(listedExtensionPlatformsByItemId(rows).get('a')!.has('VINTED')).toBe(true);
  });

  it('a newer non-POSTED POST row (queued or failed) means not listed; rows are independent per platform and item', () => {
    const rows = [
      job('a', 'POSHMARK', 'POST', 'POSTED', 1),
      job('a', 'POSHMARK', 'POST', 'QUEUED', 2),
      job('a', 'GRAILED', 'POST', 'POSTED', 1),
      job('b', 'GRAILED', 'POST', 'POSTED', 1),
    ];
    const listed = listedExtensionPlatformsByItemId(rows);
    expect([...listed.get('a')!]).toEqual(['GRAILED']);
    expect([...listed.get('b')!]).toEqual(['GRAILED']);
  });
});

function baseInputs(over: Record<string, unknown> = {}): any {
  return {
    item: {
      id: 'i1', title: 'Lamp', category: 'Home', ebayCategoryId: null, ebayListingId: null, ebayOfferId: null,
      discogsListingId: null, reverbListingId: null, shopifyListing: null,
      ebaySyncHeldAt: null, ebayHeldFields: [], ebayContentDirtyAt: null,
    },
    hasEbayConnection: true, shopifyEnabled: false, subscriptionTier: 'PRO',
    hasActiveDiscogsAccount: false, hasActiveReverbAccount: false, hasActiveEtsyAccount: false,
    extensionPlatformsUsed: { facebook: true, craigslist: false, gumtreeAu: false, grailed: false, poshmark: false, mercari: false, vinted: true },
    jobs: [], pausedMarketplaces: [], recentPushRows: [], failedUnacknowledgedPushCount: 0,
    ...over,
  };
}

describe('buildItemMarketplaceStatus', () => {
  it('eBay: live with ids, eligible with a category, none without; extension listed means listed_needs_manual_update', () => {
    const live = buildItemMarketplaceStatus(baseInputs({
      item: { ...baseInputs().item, ebayListingId: 'L1', ebayOfferId: 'O1' },
      jobs: [job('i1', 'VINTED', 'POST', 'POSTED', 1)],
    }));
    expect(live.platforms.ebay).toMatchObject({ status: 'live', ids: { listingId: 'L1', offerId: 'O1' }, heldAt: null });
    expect(live.platforms.vinted.status).toBe('listed_needs_manual_update');
    expect(live.platforms.facebook.status).toBe('eligible');
    expect(live.platforms.mercari.status).toBe('none'); // never used by this organizer

    const eligible = buildItemMarketplaceStatus(baseInputs({ item: { ...baseInputs().item, ebayCategoryId: '38220' } }));
    expect(eligible.platforms.ebay.status).toBe('eligible');
    expect(buildItemMarketplaceStatus(baseInputs()).platforms.ebay.status).toBe('none');
  });

  it('a held eBay item is paused and carries heldAt, held fields and the dirty flag', () => {
    const heldAt = new Date('2026-10-04T10:00:00Z');
    const dirty = new Date('2026-10-04T10:05:00Z');
    const out = buildItemMarketplaceStatus(baseInputs({
      item: { ...baseInputs().item, ebayListingId: 'L1', ebayOfferId: 'O1', ebaySyncHeldAt: heldAt, ebayHeldFields: ['title'], ebayContentDirtyAt: dirty },
    }));
    expect(out.platforms.ebay.status).toBe('paused');
    expect(out.platforms.ebay.heldAt).toEqual(heldAt);
    expect(out.ebayHold).toEqual({ heldAt, heldFields: ['title'], contentDirtyAt: dirty });
  });

  it('an organizer-paused extension marketplace shows paused; discogs, reverb, etsy and shopify read their ids', () => {
    const out = buildItemMarketplaceStatus(baseInputs({
      item: { ...baseInputs().item, discogsListingId: 'D1', reverbListingId: 'R1', shopifyListing: { id: 'S1' } },
      shopifyEnabled: true, hasActiveDiscogsAccount: true, hasActiveReverbAccount: true, hasActiveEtsyAccount: true,
      pausedMarketplaces: ['FACEBOOK'], etsyListingState: 'ACTIVE', etsyListingId: 'E1',
    }));
    expect(out.platforms.facebook.status).toBe('paused');
    expect(out.platforms.discogs).toMatchObject({ status: 'live', ids: { listingId: 'D1' } });
    expect(out.platforms.reverb).toMatchObject({ ids: { listingId: 'R1' } });
    expect(out.platforms.etsy.ids).toEqual({ listingId: 'E1' });
    expect(out.platforms.etsy.status).toBe('live'); // ACTIVE listing, even if the age rule no longer passes (flagged ineligible)
  });

  it('exposes the last push outcome without organizerId or itemId', () => {
    const row = {
      id: 'p1', trigger: 'SAVE', status: 'FAILED', fieldsAttempted: ['price'], fieldsPushed: [],
      errorCode: 'HTTP_400', errorMessage: 'bad', startedAt: T(1), finishedAt: T(2), acknowledgedAt: null,
      organizerId: 'SECRET_ORG', itemId: 'i1',
    };
    const out = buildItemMarketplaceStatus(baseInputs({ recentPushRows: [row], failedUnacknowledgedPushCount: 1 }));
    expect(out.platforms.ebay.lastPush).toMatchObject({ id: 'p1', status: 'FAILED', acknowledged: false });
    expect(out.failedUnacknowledgedPushCount).toBe(1);
    expect(JSON.stringify(out)).not.toContain('SECRET_ORG');
  });
});

describe('getItemMarketplaceStatus (queries are scoped to the owner organizer)', () => {
  it('scopes every organizer-owned read to the owner id', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({
      ebayConnection: { id: 'c' }, shopifyEnabled: false, subscriptionTier: 'PRO', pausedMarketplaces: [], marketplaceAccounts: [],
    });
    mockPrisma.marketplaceListingJob.findMany.mockResolvedValue([]);
    mockPrisma.itemMarketplacePush.findMany.mockResolvedValue([]);
    mockPrisma.itemMarketplacePush.count.mockResolvedValue(0);
    mockPrisma.etsyListing.findFirst.mockResolvedValue(null);
    mockPrisma.itemCard.findUnique.mockResolvedValue(null);
    await getItemMarketplaceStatus({
      item: { id: 'i1', category: 'Home', ebayCategoryId: null, ebayListingId: null, discogsListingId: null, reverbListingId: null, shopifyListing: null } as any,
      ownerOrganizerId: 'orgOWNER',
    });
    expect(mockPrisma.organizer.findUnique.mock.calls[0][0].where).toEqual({ id: 'orgOWNER' });
    expect(mockPrisma.itemMarketplacePush.findMany.mock.calls[0][0].where).toMatchObject({ itemId: 'i1', organizerId: 'orgOWNER' });
    expect(mockPrisma.itemMarketplacePush.count.mock.calls[0][0].where).toMatchObject({ itemId: 'i1', organizerId: 'orgOWNER' });
    expect(mockPrisma.etsyListing.findFirst.mock.calls[0][0].where).toMatchObject({ itemId: 'i1', organizerId: 'orgOWNER' });
  });
});

describe('getItemMarketplaceStatus ebayAcceptedConditions (category-aware condition preview)', () => {
  const mockAccepted = getAcceptedConditionsForCategory as jest.Mock;
  const baseItem = {
    id: 'i1', category: 'Music', ebayCategoryId: '22669', ebayListingId: 'L1', ebayOfferId: 'O1',
    discogsListingId: null, reverbListingId: null, shopifyListing: null,
  };
  const run = (over: Record<string, unknown> = {}) => getItemMarketplaceStatus({ item: { ...baseItem, ...over } as any, ownerOrganizerId: 'org1' });

  beforeEach(() => {
    mockAccepted.mockReset();
    mockPrisma.organizer.findUnique.mockResolvedValue({
      ebayConnection: { id: 'c' }, shopifyEnabled: false, subscriptionTier: 'PRO', pausedMarketplaces: [], marketplaceAccounts: [],
    });
    mockPrisma.marketplaceListingJob.findMany.mockResolvedValue([]);
    mockPrisma.itemMarketplacePush.findMany.mockResolvedValue([]);
    mockPrisma.itemMarketplacePush.count.mockResolvedValue(0);
    mockPrisma.etsyListing.findFirst.mockResolvedValue(null);
    mockPrisma.itemCard.findUnique.mockResolvedValue(null);
  });

  it('returns the accepted enums of the item category as an array', async () => {
    mockAccepted.mockResolvedValue(new Set(['NEW', 'NEW_OTHER', 'USED_EXCELLENT', 'FOR_PARTS_OR_NOT_WORKING']));
    const out = await run();
    expect(mockAccepted).toHaveBeenCalledWith('22669');
    expect(out.ebayAcceptedConditions).toEqual(['NEW', 'NEW_OTHER', 'USED_EXCELLENT', 'FOR_PARTS_OR_NOT_WORKING']);
  });

  it('is null with no category or when the item is not on eBay, without calling eBay', async () => {
    expect((await run({ ebayCategoryId: null })).ebayAcceptedConditions).toBeNull();
    expect((await run({ ebayListingId: null, ebayOfferId: null })).ebayAcceptedConditions).toBeNull();
    expect(mockAccepted).not.toHaveBeenCalled();
  });

  it('is null (and the endpoint still succeeds) when the lookup returns null, an empty set, or throws', async () => {
    mockAccepted.mockResolvedValueOnce(null);
    expect((await run()).ebayAcceptedConditions).toBeNull();
    mockAccepted.mockResolvedValueOnce(new Set());
    expect((await run()).ebayAcceptedConditions).toBeNull();
    mockAccepted.mockRejectedValueOnce(new Error('eBay down'));
    const out = await run();
    expect(out.ebayAcceptedConditions).toBeNull();
    expect(out.itemId).toBe('i1');
  });
});

describe('getFailedPushCountsByItemId (one batched query)', () => {
  beforeEach(() => mockPrisma.itemMarketplacePush.groupBy.mockReset());

  it('makes exactly one groupBy for the whole page, scoped to the organizer and unacknowledged FAILED/PARTIAL', async () => {
    mockPrisma.itemMarketplacePush.groupBy.mockResolvedValue([{ itemId: 'a', _count: { _all: 2 } }, { itemId: 'c', _count: { _all: 1 } }]);
    const counts = await getFailedPushCountsByItemId(['a', 'b', 'c'], 'org1');
    expect(mockPrisma.itemMarketplacePush.groupBy).toHaveBeenCalledTimes(1);
    expect(mockPrisma.itemMarketplacePush.groupBy.mock.calls[0][0].where).toMatchObject({
      itemId: { in: ['a', 'b', 'c'] }, organizerId: 'org1', status: { in: ['FAILED', 'PARTIAL'] }, acknowledgedAt: null,
    });
    expect(counts.get('a')).toBe(2);
    expect(counts.get('b')).toBeUndefined();
  });

  it('no items means no query, and a database error yields an empty map instead of failing the list', async () => {
    expect((await getFailedPushCountsByItemId([], 'org1')).size).toBe(0);
    expect(mockPrisma.itemMarketplacePush.groupBy).not.toHaveBeenCalled();
    mockPrisma.itemMarketplacePush.groupBy.mockRejectedValue(new Error('no table'));
    expect((await getFailedPushCountsByItemId(['a'], 'org1')).size).toBe(0);
  });
});

describe('parity with extensionController.getExtensionItems (marketplaceListed* flags)', () => {
  const FLAG: Record<string, string> = {
    FACEBOOK: 'marketplaceListedFacebook',
    CRAIGSLIST: 'marketplaceListedCraigslist',
    GUMTREE_AU: 'marketplaceListedGumtreeAu',
    POSHMARK: 'marketplaceListedPoshmark',
    MERCARI: 'marketplaceListedMercari',
    VINTED: 'marketplaceListedVinted',
    GRAILED: 'marketplaceListedGrailed',
  };

  const itemRow = (id: string) => ({
    id, saleId: 's1', title: `Item ${id}`, description: 'd', price: null, category: 'Home', condition: 'USED',
    photoUrls: [], qrEmbedEnabled: false, qrAssetReady: true, createdAt: new Date(),
    ebayCategoryName: null, brand: null, size: null, color: null, material: null, isbn: null,
    packageWeightOz: 10, aiPackageWeightOz: null, ebayShippingOverride: null, shippingAvailable: false,
    shippingPrice: null, shippingPriceConfirmedByOrganizer: false, crosslisterFreeShipping: false,
    allowBestOffer: false, bestOfferMinimumAmt: null, bestOfferAutoAcceptAmt: null,
    ebayCategoryId: null, packageConfirmedByOrganizer: true, packageLengthIn: null, packageWidthIn: null,
    packageHeightIn: null, packageType: null, aiPackageDimsJson: null, aiPackageConfidence: null, packageEstimateSource: 'ORGANIZER',
  });

  it('both implementations agree on every platform for a matrix of job histories', async () => {
    const jobs: MarketplaceJobRow[] = [
      job('A', 'FACEBOOK', 'POST', 'POSTED', 1),
      job('B', 'CRAIGSLIST', 'POST', 'POSTED', 1), job('B', 'CRAIGSLIST', 'REMOVE', 'REMOVED', 2),
      job('C', 'MERCARI', 'POST', 'POSTED', 1), job('C', 'MERCARI', 'REMOVE', 'REMOVED', 2), job('C', 'MERCARI', 'POST', 'POSTED', 3),
      job('D', 'VINTED', 'POST', 'POSTED', 1), job('D', 'VINTED', 'REMOVE', 'SKIPPED', 2),
      job('E', 'POSHMARK', 'POST', 'POSTED', 1), job('E', 'POSHMARK', 'POST', 'QUEUED', 2),
      job('F', 'GRAILED', 'POST', 'POSTED', 1), job('F', 'GUMTREE_AU', 'POST', 'POSTED', 2), job('F', 'FACEBOOK', 'REMOVE', 'REMOVED', 3),
    ];
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', userId: 'u1', user: { email: 'o@x.com' }, pausedMarketplaces: [] });
    mockPrisma.sale.findMany.mockResolvedValue([{ id: 's1', title: 'Sale', city: null, zip: null, address: null, markdownEnabled: false, markdownFloor: null }]);
    mockPrisma.item.findMany.mockResolvedValue(['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(itemRow));
    mockPrisma.marketplaceListingJob.findMany.mockResolvedValue(jobs);

    let body: any;
    const res: any = { status: () => res, json: (b: any) => { body = b; return res; } };
    await getExtensionItems({ user: { id: 'u1' } } as any, res);
    expect(body?.items).toHaveLength(7);

    const serviceListed = listedExtensionPlatformsByItemId(jobs);
    for (const it of body.items) {
      for (const platform of EXTENSION_PLATFORMS) {
        expect({ item: it.id, platform, listed: it[FLAG[platform]] }).toEqual({
          item: it.id,
          platform,
          listed: serviceListed.get(it.id)?.has(platform) ?? false,
        });
      }
    }
    // Sanity: the matrix really exercises both outcomes.
    expect(body.items.find((i: any) => i.id === 'C').marketplaceListedMercari).toBe(true);
    expect(body.items.find((i: any) => i.id === 'B').marketplaceListedCraigslist).toBe(false);
    expect(body.items.find((i: any) => i.id === 'D').marketplaceListedVinted).toBe(true);
    expect(body.items.find((i: any) => i.id === 'E').marketplaceListedPoshmark).toBe(false);
  });
});
