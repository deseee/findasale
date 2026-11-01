/**
 * (2026-11-01) Poshmark relist after a deliberate, non-sale removal. On 2026-10-29 five damaged Poshmark listings were deleted
 * with the owner's approval and closed with a REMOVE/REMOVED row 'deleted_after_copies_clobber (owner-approved ...; relist
 * fresh)'. Such a row ends the listing without a sale, so GET /extension/autolist-queue must offer the item to Poshmark again
 * once (when the organizer's Poshmark auto queue switch is on). Sold listings, the Resync hold, pickup-only items, items under
 * the $5 Poshmark minimum and a switched-off queue must still get nothing. Item shapes copy the five real items' listing
 * fields (titles, prices, categories, weights); everything else is synthetic.
 */
const mockPrisma: any = {
  organizer: { findUnique: jest.fn() },
  item: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  itemKitComponent: { findMany: jest.fn() },
  sale: { findMany: jest.fn() },
  marketplaceListingJob: { findMany: jest.fn(), findFirst: jest.fn() },
  organizerAutoQueueLimit: { findUnique: jest.fn() },
  extensionRuntimeLog: { findFirst: jest.fn() },
  pendingListingRemoval: { count: jest.fn() },
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn() }));
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
  normalizeListingTitle: (t: string) => String(t || '').toLowerCase().trim(),
}));
jest.mock('../services/vintedBundleOrderService', () => ({ reportVintedBundleOrder: jest.fn() }));
jest.mock('../services/messageAutosendService', () => ({ decideMessageAutosend: jest.fn() }));
jest.mock('../services/ebayRateEstimateService', () => ({
  ...jest.requireActual('../services/ebayRateEstimateService'),
  computeCheapestForOrigin: jest.fn(),
}));
jest.mock('../services/poshmarkCategoryResolver', () => ({ resolvePoshmarkCategory: jest.fn() }));
jest.mock('../services/mercariCategoryResolver', () => ({ resolveMercariCategory: jest.fn() }));
jest.mock('../services/grailedCategoryResolver', () => ({ resolveGrailedCategory: jest.fn() }));
jest.mock('../services/craigslistCategoryResolver', () => ({ resolveCraigslistCategory: jest.fn() }));

import { listingStateForAutoQueue, blocksAutoQueue, type ListingJobRow } from '../services/singleUnitRepost';
import { getAutolistQueue } from '../controllers/extensionController';

const OWNER_DELETE = 'deleted_after_copies_clobber (owner-approved 2026-10-29; relist fresh)';
const at = (iso: string) => new Date(iso);
const post = (iso: string): ListingJobRow => ({ action: 'POST', status: 'POSTED', createdAt: at(iso), lastErrorMessage: null, syncedQuantity: null });
const removed = (iso: string, msg: string | null): ListingJobRow => ({ action: 'REMOVE', status: 'REMOVED', createdAt: at(iso), lastErrorMessage: msg });
const DELETED_AT = '2026-10-29T15:13:24.546Z';

const LP = 'Music';
const LP_LEAF = 'Vinyl Records';
const FITTING = 'Business & Industrial:Building Materials & Supplies:Industrial Plumbing & Fixtures:Pipe Fittings';
const COIN = 'Coins & Paper Money:Coins: US:Dollars:Eisenhower (1971-78)';

const item = (id: string, title: string, price: number, category: string, ebayCategoryName: string | null, weightOz: number, dims: [number, number, number], extra: Record<string, unknown> = {}) => ({
  id, saleId: 's1', title, description: 'd', price,
  category, ebayCategoryName, tags: [], ebayCategoryId: null, condition: 'USED', conditionGrade: null,
  photoUrls: ['https://example.com/a.jpg'], qrEmbedEnabled: false, qrAssetReady: true,
  brand: null, size: null, color: null, material: null, isbn: null,
  packageWeightOz: weightOz, aiPackageWeightOz: null,
  packageLengthIn: dims[0], packageWidthIn: dims[1], packageHeightIn: dims[2], aiPackageDimsJson: null,
  packageConfirmedByOrganizer: true, packageEstimateSource: 'KEYWORD',
  ebayShippingOverride: null, crosslisterFreeShipping: false,
  allowBestOffer: false, bestOfferMinimumAmt: null, bestOfferAutoAcceptAmt: null,
  ...extra,
});

// The five items deleted on 2026-10-29 (listing fields as stored in production).
const FIVE = [
  item('cmtd1gn9x005fh09oalw7jbsm', 'Jefferson Starship Red Octopus Vinyl LP Record, 1975', 6.49, LP, LP_LEAF, 12, [13, 13, 1]),
  item('cmtd1af6y002ah09o6imoporh', 'J. Geils Band Live Full House Vinyl LP, 1972', 11.49, LP, LP_LEAF, 12, [13, 13, 1]),
  item('cmtd14n4x000wh09ohx1ezb2e', 'Crosby, Stills & Nash Vinyl Record, Atlantic Records, 1970s', 11.99, LP, LP_LEAF, 12, [13, 13, 1]),
  item('cmo3euj71009hjqsurxnbbji6', 'John Guest PP0308WP Push-fit Union 90° Elbow, 1/4" OD Push To Connect 10 pack', 15.99, FITTING, null, 3, [10, 8, 6], { packageEstimateSource: 'EBAY_LIVE' }),
  item('cmo3eugon0095jqsuuw4wfl0k', 'John Guest PP0312WP Push-fit Union 90° Elbow, 3/8" OD Push To Connect 7 pack', 18.49, FITTING, null, 3, [10, 8, 6], { packageEstimateSource: 'EBAY_LIVE' }),
];
const POSTED_AT: Record<string, string> = {
  cmtd1gn9x005fh09oalw7jbsm: '2026-08-31T18:09:38.458Z',
  cmtd1af6y002ah09o6imoporh: '2026-09-02T11:42:40.302Z',
  cmtd14n4x000wh09ohx1ezb2e: '2026-09-02T11:46:38.507Z',
  cmo3euj71009hjqsurxnbbji6: '2026-10-14T23:57:37.909Z',
  cmo3eugon0095jqsuuw4wfl0k: '2026-10-14T23:58:40.480Z',
};

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}
const req = () => ({ user: { id: 'u1', emailVerified: true }, query: {}, params: {}, body: {} }) as any;
const job = (itemId: string, r: ListingJobRow, platform = 'POSHMARK') => ({ itemId, platform, ...r });
const organizer = (poshmarkAutoListEnabled: boolean) => ({
  id: 'org1', subscriptionTier: 'TEAMS', removeWatermarkEnabled: true, pausedMarketplaces: ['FACEBOOK', 'GUMTREE_AU'],
  craigslistAutoListEnabled: false, facebookAutoListEnabled: false, gumtreeAuAutoListEnabled: false,
  grailedAutoListEnabled: false, poshmarkAutoListEnabled, mercariAutoListEnabled: false,
});

let mainItems: any[] = [];
let stockRows: any[] = [];
let jobRows: any[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  mockPrisma.organizer.findUnique.mockResolvedValue(organizer(true));
  mockPrisma.item.findMany.mockImplementation(async (args: any) => {
    const w = args?.where ?? {};
    if (w.AND) return mainItems;
    if (w.id && w.id.in) return stockRows.filter((r) => w.id.in.includes(r.id));
    return [];
  });
  mockPrisma.itemKitComponent.findMany.mockResolvedValue([]);
  mockPrisma.sale.findMany.mockResolvedValue([{ id: 's1', title: 'Sale', city: 'Paw Paw', zip: '49079', address: '1 Main St' }]);
  mockPrisma.marketplaceListingJob.findMany.mockImplementation(async () => jobRows);
  mockPrisma.organizerAutoQueueLimit.findUnique.mockResolvedValue({ maxNewPerRun: null, onlyItemIds: [] });
  mockPrisma.extensionRuntimeLog.findFirst.mockResolvedValue(null);
  mockPrisma.pendingListingRemoval.count.mockResolvedValue(0);
});
afterEach(() => jest.restoreAllMocks());

const stock = (id: string, total = 1, sold = 0) => ({ id, listingType: 'FIXED', stockTotal: total, stockSold: sold, description: 'd' });
const poshIds = (body: any) => (body.queues.POSHMARK as any[]).map((e) => e.id).sort();

describe('listingStateForAutoQueue: a deliberate non-sale removal ends the listing', () => {
  it('owner-approved delete / stale record: not listed, so the queue may offer it once', () => {
    for (const msg of [OWNER_DELETE, 'stale_record_closed', null]) {
      const s = listingStateForAutoQueue([post('2026-09-02T00:00:00Z'), removed(DELETED_AT, msg)], 'POSHMARK', 1);
      expect(s).toBe('not_listed');
      expect(blocksAutoQueue(s)).toBe(false);
    }
  });
  it('sold, Resync and a later re-post still block', () => {
    expect(blocksAutoQueue(listingStateForAutoQueue([post('2026-09-02T00:00:00Z'), removed(DELETED_AT, 'sold_on_poshmark')], 'POSHMARK', 0))).toBe(true);
    expect(blocksAutoQueue(listingStateForAutoQueue([post('2026-09-02T00:00:00Z'), removed(DELETED_AT, 'resync:listing_not_found')], 'POSHMARK', 1))).toBe(true);
    // once relisted, the new POST row wins and the item is never offered a second copy
    expect(listingStateForAutoQueue([post('2026-09-02T00:00:00Z'), removed(DELETED_AT, OWNER_DELETE), post('2026-11-01T00:00:00Z')], 'POSHMARK', 1)).toBe('listed');
  });
});

describe('GET /extension/autolist-queue: the five items deleted on 2026-10-29', () => {
  beforeEach(() => {
    mainItems = [...FIVE];
    stockRows = FIVE.map((i) => stock(i.id, i.id === 'cmtd1af6y002ah09o6imoporh' ? 3 : 1));
    jobRows = FIVE.flatMap((i) => [job(i.id, post(POSTED_AT[i.id])), job(i.id, removed(DELETED_AT, OWNER_DELETE))]);
  });

  it('with the Poshmark auto queue switch on, all five are offered to Poshmark, once each, not as a repost after a sale', async () => {
    const res = mockRes();
    await getAutolistQueue(req(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.ok).toBe(true);
    expect(poshIds(body)).toEqual(FIVE.map((i) => i.id).sort());
    for (const e of body.queues.POSHMARK as any[]) expect(e.repostAfterSale).toBeUndefined();
  });

  it('with the switch off (production state since 2026-10-26), Poshmark gets nothing', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue(organizer(false));
    const res = mockRes();
    await getAutolistQueue(req(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.queues.POSHMARK).toEqual([]);
    expect(mockPrisma.item.findMany).not.toHaveBeenCalled();
  });

  it('never relists: a listing that sold (no stock left), a pickup-only item, an item under the $5 minimum, the Resync hold', async () => {
    mainItems = [
      item('sold', 'Fleetwood Mac Rumours Vinyl LP', 12, LP, LP_LEAF, 12, [13, 13, 1]),
      item('pickup', 'Eagles Hotel California Vinyl LP', 12, LP, LP_LEAF, 12, [13, 13, 1], { ebayShippingOverride: 'LOCAL_PICKUP_ONLY' }),
      item('ike', '1971 D Eisenhower Dollar Circulated US Mint Coin Ike', 3.49, COIN, null, 2, [4, 3, 1]),
      item('resync', 'Boston Vinyl LP 1976', 12, LP, LP_LEAF, 12, [13, 13, 1]),
      item('ok', 'Heart Dreamboat Annie Vinyl LP', 12, LP, LP_LEAF, 12, [13, 13, 1]),
    ];
    stockRows = mainItems.map((i) => stock(i.id, 1, 0));
    jobRows = [
      job('sold', post('2026-09-01T00:00:00Z')), job('sold', removed(DELETED_AT, 'sold_on_poshmark')),
      job('pickup', post('2026-09-01T00:00:00Z')), job('pickup', removed(DELETED_AT, OWNER_DELETE)),
      job('ike', post('2026-09-01T00:00:00Z')), job('ike', removed(DELETED_AT, OWNER_DELETE)),
      job('resync', post('2026-09-01T00:00:00Z')), job('resync', removed(DELETED_AT, 'resync:listing_not_found')),
      job('ok', post('2026-09-01T00:00:00Z')), job('ok', removed(DELETED_AT, OWNER_DELETE)),
    ];
    // a one-unit item whose Poshmark listing sold has no stock left in the real flow
    stockRows.find((r) => r.id === 'sold')!.stockSold = 1;
    const res = mockRes();
    await getAutolistQueue(req(), res);
    expect(poshIds(res.json.mock.calls[0][0])).toEqual(['ok']);
  });
});
