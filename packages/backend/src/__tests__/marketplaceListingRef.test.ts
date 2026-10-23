/**
 * (2026-10-18) Remote listing id + URL on every extension sync queue entry. Synthetic data only; no network, no real database.
 *  - the pure helpers parse each platform's id out of its posted URL and rebuild a stable URL where the platform has one
 *  - markItemListed / markItemAlreadyPostedManually / setItemRemoteListingId store the best reference
 *  - pending-updates (Facebook) and price-sync-queue (all five other platforms) send remoteListingId + remoteListingUrl,
 *    deriving them at response time from whatever an existing row stored (a full URL, or a bare id)
 */
import {
  extractRemoteId, canonicalListingUrl, pickStoredRemoteRef, resolveListingRef, listingRefFields, isPlatformUrl,
} from '../services/marketplaceListingRef';

const mockPrisma: any = {
  organizer: { findUnique: jest.fn() },
  item: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  itemKitComponent: { findMany: jest.fn() },
  marketplaceListingJob: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  pendingListingRemoval: { findMany: jest.fn() },
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

import {
  getPendingUpdates, getPriceSyncQueue, markItemListed, markItemAlreadyPostedManually, setItemRemoteListingId,
} from '../controllers/extensionController';

const POSH = '5f1a2b3c4d5e6f7a8b9c0d1e';

describe('marketplaceListingRef helpers', () => {
  it('parses each platform id from its posted URL', () => {
    expect(extractRemoteId('FACEBOOK', 'https://www.facebook.com/marketplace/item/1234567890123/?ref=x')).toBe('1234567890123');
    expect(extractRemoteId('POSHMARK', `https://poshmark.com/listing/Vintage-Lamp-${POSH}`)).toBe(POSH);
    expect(extractRemoteId('POSHMARK', `https://poshmark.com/listing/${POSH}?x=1`)).toBe(POSH);
    expect(extractRemoteId('MERCARI', 'https://www.mercari.com/us/item/M12345678901/')).toBe('m12345678901');
    expect(extractRemoteId('GRAILED', 'https://www.grailed.com/listings/987654-nike-shirt')).toBe('987654');
    expect(extractRemoteId('CRAIGSLIST', 'https://grandrapids.craigslist.org/atq/d/some-lamp/7712345678.html')).toBe('7712345678');
    expect(extractRemoteId('GUMTREE_AU', 'https://www.gumtree.com.au/s-ad/bondi/lamps/1331234567')).toBe('1331234567');
  });

  it('accepts bare ids of the right shape and rejects the wrong shape or a foreign host', () => {
    expect(extractRemoteId('FACEBOOK', '1234567890')).toBe('1234567890');
    expect(extractRemoteId('FACEBOOK', 'fb123')).toBe('');
    expect(extractRemoteId('POSHMARK', POSH.toUpperCase())).toBe(POSH);
    expect(extractRemoteId('GRAILED', '12')).toBe('12');
    expect(extractRemoteId('GRAILED', 'https://evil.example.com/listings/55')).toBe('');
    expect(extractRemoteId('FACEBOOK', 'https://example.com/marketplace/item/1234567890')).toBe('');
    expect(extractRemoteId('CRAIGSLIST', '')).toBe('');
    expect(extractRemoteId('VINTED', 'https://www.vinted.com/items/123')).toBe('');
    expect(isPlatformUrl('POSHMARK', `https://poshmark.com.au/listing/${POSH}`)).toBe(true);
    expect(isPlatformUrl('POSHMARK', `https://notposhmark.com/listing/${POSH}`)).toBe(false);
  });

  it('rebuilds a canonical URL where the platform has an id-only form', () => {
    expect(canonicalListingUrl('FACEBOOK', '1234567890')).toBe('https://www.facebook.com/marketplace/item/1234567890/');
    expect(canonicalListingUrl('POSHMARK', POSH)).toBe(`https://poshmark.com/listing/${POSH}`);
    expect(canonicalListingUrl('MERCARI', 'm12345678')).toBe('https://www.mercari.com/us/item/m12345678/');
    expect(canonicalListingUrl('GRAILED', '987654')).toBe('https://www.grailed.com/listings/987654');
    expect(canonicalListingUrl('CRAIGSLIST', '7712345678')).toBe('');
    expect(canonicalListingUrl('GUMTREE_AU', '1331234567')).toBe('');
    expect(canonicalListingUrl('MERCARI', 'r1')).toBe('');
  });

  it('pickStoredRemoteRef stores the id, except Craigslist/Gumtree which keep the URL', () => {
    expect(pickStoredRemoteRef('FACEBOOK', { remoteListingId: 'https://www.facebook.com/marketplace/item/1234567890/' })).toBe('1234567890');
    expect(pickStoredRemoteRef('POSHMARK', { remoteListingUrl: `https://poshmark.com/listing/x-${POSH}` })).toBe(POSH);
    expect(pickStoredRemoteRef('MERCARI', { remoteListingId: 'M12345678' })).toBe('m12345678');
    const cl = 'https://grandrapids.craigslist.org/atq/d/lamp/7712345678.html';
    expect(pickStoredRemoteRef('CRAIGSLIST', { remoteListingUrl: cl })).toBe(cl);
    expect(pickStoredRemoteRef('CRAIGSLIST', { remoteListingId: '7712345678' })).toBe('7712345678');
    const gt = 'https://www.gumtree.com.au/s-ad/bondi/lamps/1331234567';
    expect(pickStoredRemoteRef('GUMTREE_AU', { remoteListingId: '1331234567', remoteListingUrl: gt })).toBe(gt);
    expect(pickStoredRemoteRef('GRAILED', {})).toBeNull();
    expect(pickStoredRemoteRef('GRAILED', { remoteListingId: '   ' })).toBeNull();
    // unparseable but reported: kept exactly as before
    expect(pickStoredRemoteRef('FACEBOOK', { remoteListingId: 'opaque-token' })).toBe('opaque-token');
    // a foreign-host URL on Craigslist is not stored as a URL
    expect(pickStoredRemoteRef('CRAIGSLIST', { remoteListingUrl: 'https://evil.example.com/7712345678' })).toBeNull();
  });

  it('resolveListingRef derives id and url from whatever is stored', () => {
    expect(resolveListingRef('FACEBOOK', 'https://www.facebook.com/marketplace/item/1234567890/'))
      .toEqual({ remoteListingId: '1234567890', remoteListingUrl: 'https://www.facebook.com/marketplace/item/1234567890/' });
    expect(resolveListingRef('FACEBOOK', '1234567890'))
      .toEqual({ remoteListingId: '1234567890', remoteListingUrl: 'https://www.facebook.com/marketplace/item/1234567890/' });
    expect(resolveListingRef('GRAILED', '987654')).toEqual({ remoteListingId: '987654', remoteListingUrl: 'https://www.grailed.com/listings/987654' });
    const cl = 'https://grandrapids.craigslist.org/atq/d/lamp/7712345678.html';
    expect(resolveListingRef('CRAIGSLIST', cl)).toEqual({ remoteListingId: '7712345678', remoteListingUrl: cl });
    expect(resolveListingRef('CRAIGSLIST', '7712345678')).toEqual({ remoteListingId: '7712345678', remoteListingUrl: '' });
    // legacy opaque value passes through as the id; an unreadable URL is never passed off as an id
    expect(resolveListingRef('FACEBOOK', 'fb123')).toEqual({ remoteListingId: 'fb123', remoteListingUrl: '' });
    expect(resolveListingRef('FACEBOOK', 'https://www.facebook.com/marketplace/create/item')).toEqual({ remoteListingId: '', remoteListingUrl: 'https://www.facebook.com/marketplace/create/item' });
    expect(resolveListingRef('POSHMARK', null)).toEqual({ remoteListingId: '', remoteListingUrl: '' });
    expect(listingRefFields('POSHMARK', null)).toEqual({});
  });
});

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}
// 2026-10-23: emailVerified, so the verify-to-publish guard on the extension queues (lib/publishGate.ts) lets the queue through.
const req = (extra: Record<string, unknown> = {}) => ({ user: { id: 'u1', emailVerified: true }, query: {}, params: {}, body: {}, ...extra }) as any;

let mainItems: any[] = [];
let extraRows: any[] = [];
let jobRows: any[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  mainItems = [];
  extraRows = [];
  jobRows = [];
  mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', pausedMarketplaces: [] });
  mockPrisma.item.findFirst.mockResolvedValue({ id: 'item1' });
  mockPrisma.item.findUnique.mockResolvedValue({ category: 'Home', ebayCategoryId: null, title: 'Lamp', stockTotal: 1, stockSold: 0 });
  mockPrisma.item.findMany.mockImplementation(async (args: any) => {
    const w = args?.where ?? {};
    if (w.id && w.id.in) return extraRows.filter((r) => w.id.in.includes(r.id));
    if (w.AND) return mainItems;
    return [];
  });
  mockPrisma.marketplaceListingJob.findMany.mockImplementation(async (args: any) => (args?.where?.itemId ? jobRows : []));
  mockPrisma.marketplaceListingJob.findFirst.mockResolvedValue(null);
  mockPrisma.marketplaceListingJob.create.mockResolvedValue({});
  mockPrisma.marketplaceListingJob.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.itemKitComponent.findMany.mockResolvedValue([]);
  mockPrisma.pendingListingRemoval.findMany.mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

describe('POST items/:id/listed stores the best remote reference', () => {
  const call = async (body: Record<string, unknown>, id = 'item1') => {
    const res = mockRes();
    await markItemListed(req({ params: { id }, body }), res);
    return res;
  };

  it('Facebook: the post URL the content script sends is stored as the bare item id', async () => {
    await call({ platform: 'FACEBOOK', remoteListingId: 'https://www.facebook.com/marketplace/item/1234567890/' });
    expect(mockPrisma.marketplaceListingJob.create.mock.calls[0][0].data).toMatchObject({ platform: 'FACEBOOK', remoteListingId: '1234567890' });
  });

  it('Poshmark / Grailed / Mercari: id parsed from remoteListingUrl', async () => {
    await call({ platform: 'POSHMARK', remoteListingUrl: `https://poshmark.com/listing/Lamp-${POSH}` });
    await call({ platform: 'GRAILED', remoteListingUrl: 'https://www.grailed.com/listings/987654-shirt' });
    await call({ platform: 'MERCARI', remoteListingUrl: 'https://www.mercari.com/us/item/m12345678/' });
    const stored = mockPrisma.marketplaceListingJob.create.mock.calls.map((c: any[]) => c[0].data.remoteListingId);
    expect(stored).toEqual([POSH, '987654', 'm12345678']);
  });

  it('Craigslist / Gumtree AU: the real URL is stored so it survives', async () => {
    const cl = 'https://grandrapids.craigslist.org/atq/d/lamp/7712345678.html';
    await call({ platform: 'CRAIGSLIST', remoteListingUrl: cl });
    expect(mockPrisma.marketplaceListingJob.create.mock.calls[0][0].data.remoteListingId).toBe(cl);
  });

  it('no id or URL reported stays null (unchanged behaviour)', async () => {
    await call({ platform: 'POSHMARK', remoteListingId: null });
    expect(mockPrisma.marketplaceListingJob.create.mock.calls[0][0].data.remoteListingId).toBeNull();
  });

  it('a replayed report fills a still-empty id on the live row, set-once, and creates no duplicate', async () => {
    mockPrisma.marketplaceListingJob.findFirst.mockResolvedValue({ id: 'job1', action: 'POST', status: 'POSTED', remoteListingId: null });
    const res = await call({ platform: 'GRAILED', remoteListingUrl: 'https://www.grailed.com/listings/987654' });
    expect(res.json).toHaveBeenCalledWith({ ok: true, deduped: true });
    expect(mockPrisma.marketplaceListingJob.create).not.toHaveBeenCalled();
    expect(mockPrisma.marketplaceListingJob.updateMany).toHaveBeenCalledWith({ where: { id: 'job1', remoteListingId: null }, data: { remoteListingId: '987654' } });
  });

  it('a replay never overwrites an id already recorded', async () => {
    mockPrisma.marketplaceListingJob.findFirst.mockResolvedValue({ id: 'job1', action: 'POST', status: 'POSTED', remoteListingId: '111' });
    await call({ platform: 'GRAILED', remoteListingUrl: 'https://www.grailed.com/listings/987654' });
    expect(mockPrisma.marketplaceListingJob.updateMany).not.toHaveBeenCalled();
  });
});

describe('POST items/:id/mark-posted (manual) stores an optional reference', () => {
  it('stores the id parsed from a supplied URL on the new row', async () => {
    const res = mockRes();
    await markItemAlreadyPostedManually(req({ params: { id: 'item1' }, body: { platform: 'POSHMARK', remoteListingUrl: `https://poshmark.com/listing/${POSH}` } }), res);
    expect(mockPrisma.marketplaceListingJob.create.mock.calls[0][0].data).toMatchObject({ platform: 'POSHMARK', remoteListingId: POSH });
  });
  it('without a reference the row is created exactly as before', async () => {
    const res = mockRes();
    await markItemAlreadyPostedManually(req({ params: { id: 'item1' }, body: { platform: 'POSHMARK' } }), res);
    expect(mockPrisma.marketplaceListingJob.create.mock.calls[0][0].data).not.toHaveProperty('remoteListingId');
  });
});

describe('POST items/:id/remote-listing-id accepts every id-targeted platform', () => {
  const call = async (body: Record<string, unknown>) => {
    const res = mockRes();
    await setItemRemoteListingId(req({ params: { id: 'item1' }, body }), res);
    return res;
  };
  beforeEach(() => {
    mockPrisma.marketplaceListingJob.findFirst
      .mockResolvedValueOnce({ id: 'job1', action: 'POST', status: 'POSTED', remoteListingId: null }) // latest live row
      .mockResolvedValueOnce(null); // no clash
  });

  it('Poshmark id from a URL is validated and written set-once', async () => {
    const res = await call({ platform: 'POSHMARK', remoteListingUrl: `https://poshmark.com/listing/Lamp-${POSH}` });
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(mockPrisma.marketplaceListingJob.updateMany).toHaveBeenCalledWith({ where: { id: 'job1', remoteListingId: null }, data: { remoteListingId: POSH } });
  });

  it('an invalid id for the platform is still a 400', async () => {
    const res = await call({ platform: 'POSHMARK', remoteListingId: 'nope' });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('an unsupported platform is still a 400', async () => {
    const res = await call({ platform: 'EBAY', remoteListingId: '123456789' });
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('GET pending-updates (Facebook) sends id + url', () => {
  const fbPost = (remoteListingId: string | null) =>
    ({ itemId: 'item1', action: 'POST', status: 'POSTED', remoteListingId, createdAt: new Date('2026-10-12T00:00:00Z'), platform: 'FACEBOOK', syncedQuantity: null });
  const setup = () => {
    mainItems = [{ id: 'item1', title: 'Lamp', price: 12, marketplaceListedPrice: 9, stockTotal: null, stockSold: 0 }];
    extraRows = [{ id: 'item1', listingType: 'FIXED', stockTotal: null, stockSold: 0, description: '' }];
  };

  it('a legacy row that stored the full post URL is sent as the bare id plus the url', async () => {
    setup();
    jobRows = [fbPost('https://www.facebook.com/marketplace/item/1234567890/')];
    const res = mockRes();
    await getPendingUpdates(req(), res);
    expect(res.json.mock.calls[0][0].items[0]).toMatchObject({
      id: 'item1', newPrice: 12, remoteListingId: '1234567890', remoteListingUrl: 'https://www.facebook.com/marketplace/item/1234567890/',
    });
  });

  it('a bare id gets a derived url', async () => {
    setup();
    jobRows = [fbPost('1234567890')];
    const res = mockRes();
    await getPendingUpdates(req(), res);
    expect(res.json.mock.calls[0][0].items[0]).toMatchObject({ remoteListingId: '1234567890', remoteListingUrl: 'https://www.facebook.com/marketplace/item/1234567890/' });
  });

  it('fail-closed: a URL with no readable item id is not returned', async () => {
    setup();
    jobRows = [fbPost('https://www.facebook.com/marketplace/create/item')];
    const res = mockRes();
    await getPendingUpdates(req(), res);
    expect(res.json.mock.calls[0][0].items).toEqual([]);
  });
});

describe('GET price-sync-queue sends id + url on every platform that has one', () => {
  const live = (platform: string, remoteListingId: string | null) =>
    ({ itemId: 'item1', action: 'POST', status: 'POSTED', platform, createdAt: new Date('2026-10-12T00:00:00Z'), priceSyncedAt: null, remoteListingId, syncedQuantity: null });
  const cl = 'https://grandrapids.craigslist.org/atq/d/lamp/7712345678.html';

  beforeEach(() => {
    mainItems = [{ id: 'item1', title: 'Lamp', price: 7, priceUpdatedAt: new Date('2026-10-13T00:00:00Z'), stockTotal: null, stockSold: 0 }];
    extraRows = [{ id: 'item1', listingType: 'FIXED', stockTotal: null, stockSold: 0, description: '' }];
  });

  it('Poshmark, Grailed, Mercari, Craigslist, Gumtree AU each carry their id, and a url where one exists', async () => {
    jobRows = [
      live('POSHMARK', POSH), live('GRAILED', '987654'), live('MERCARI', 'm12345678'),
      live('CRAIGSLIST', cl), live('GUMTREE_AU', '1331234567'),
    ];
    const res = mockRes();
    await getPriceSyncQueue(req(), res);
    const q = res.json.mock.calls[0][0].queues;
    expect(q.POSHMARK[0]).toMatchObject({ remoteListingId: POSH, remoteListingUrl: `https://poshmark.com/listing/${POSH}` });
    expect(q.GRAILED[0]).toMatchObject({ remoteListingId: '987654', remoteListingUrl: 'https://www.grailed.com/listings/987654' });
    expect(q.MERCARI[0]).toMatchObject({ remoteListingId: 'm12345678', remoteListingUrl: 'https://www.mercari.com/us/item/m12345678/' });
    expect(q.CRAIGSLIST[0]).toMatchObject({ remoteListingId: '7712345678', remoteListingUrl: cl });
    expect(q.GUMTREE_AU[0].remoteListingId).toBe('1331234567');
    expect(q.GUMTREE_AU[0]).not.toHaveProperty('remoteListingUrl');
  });

  it('a row with no stored reference is still queued (title fallback) except Mercari, which requires one', async () => {
    jobRows = [live('POSHMARK', null), live('GRAILED', null), live('MERCARI', null)];
    const res = mockRes();
    await getPriceSyncQueue(req(), res);
    const q = res.json.mock.calls[0][0].queues;
    expect(q.POSHMARK).toHaveLength(1);
    expect(q.POSHMARK[0]).not.toHaveProperty('remoteListingId');
    expect(q.POSHMARK[0]).not.toHaveProperty('remoteListingUrl');
    expect(q.GRAILED).toHaveLength(1);
    expect(q.MERCARI).toEqual([]);
  });

  it('Mercari can be keyed by a stored URL alone', async () => {
    jobRows = [live('MERCARI', 'https://www.mercari.com/us/item/m12345678/')];
    const res = mockRes();
    await getPriceSyncQueue(req(), res);
    expect(res.json.mock.calls[0][0].queues.MERCARI[0]).toMatchObject({ remoteListingId: 'm12345678' });
  });
});
