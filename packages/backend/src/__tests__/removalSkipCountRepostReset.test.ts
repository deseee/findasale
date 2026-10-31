/**
 * 2026-10-30: getPendingRemovals counts removal skips only since the item+platform's newest POST/POSTED row
 * (utils/removalSkipStats.ts), so a repost resets the counter for the manual-review flag, the 3-attempt cap, the
 * deterministic-reason stop and the hard stop. Live case: organizer cmnxueoas0005tfv8brnc0kky, Zoom B3 / MXL 770 /
 * Apple Magic Mouse, 94-95 Poshmark skips 2026-09-28..30, REMOVED 2026-09-30, reposted 2026-10-22, still flagged.
 * Synthetic data only; no network, no real database.
 */
const mockPrisma: any = {
  organizer: { findUnique: jest.fn() },
  item: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  itemKitComponent: { findMany: jest.fn() },
  marketplaceListingJob: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
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

import { getPendingRemovals } from '../controllers/extensionController';

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}
const req = () => ({ user: { id: 'u1', emailVerified: true }, query: {}, params: {}, body: {} }) as any;

let candidateRows: any[] = [];
let soldRows: any[] = [];
let jobRows: any[] = [];
const at = (s: string) => new Date(s);
const posted = (id: string, platform: string, when: string) =>
  ({ itemId: id, action: 'POST', status: 'POSTED', lastErrorMessage: null, lastAttemptAt: null, platform, createdAt: at(when), remoteListingId: null, syncedQuantity: null });
const removed = (id: string, platform: string, when: string) =>
  ({ itemId: id, action: 'REMOVE', status: 'REMOVED', lastErrorMessage: 'resync:listing_not_found', lastAttemptAt: at(when), platform, createdAt: at(when), remoteListingId: null, syncedQuantity: null });
const skips = (id: string, platform: string, fromIso: string, n: number, reason = 'no_confident_closet_match') =>
  Array.from({ length: n }, (_, k) => {
    const t = new Date(Date.parse(fromIso) + k * 20 * 60000);
    return { itemId: id, action: 'REMOVE', status: 'SKIPPED', lastErrorMessage: reason, lastAttemptAt: t, platform, createdAt: t, remoteListingId: null, syncedQuantity: null };
  });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  candidateRows = [];
  soldRows = [];
  jobRows = [];
  mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', pausedMarketplaces: [] });
  mockPrisma.item.findMany.mockImplementation(async (args: any) => {
    const w = args?.where ?? {};
    if (w.status === 'SOLD') return soldRows;
    if (w.id && w.id.in) return candidateRows.filter((r) => w.id.in.includes(r.id));
    return [];
  });
  mockPrisma.marketplaceListingJob.findMany.mockImplementation(async (args: any) => {
    const w = args?.where ?? {};
    if (w.itemId?.in) return jobRows.filter((j) => w.itemId.in.includes(j.itemId));
    if (w.item) return jobRows.filter((j) => candidateRows.some((c) => c.id === j.itemId));
    return [];
  });
  mockPrisma.itemKitComponent.findMany.mockResolvedValue([]);
  mockPrisma.pendingListingRemoval.findMany.mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

// Pickup-only, so the AVAILABLE item's Poshmark listing is a POLICY_INELIGIBLE takedown (the compliance path).
const zoom = {
  id: 'cmp1digeb000lxravcnxftuix', title: 'Zoom B3 Multi-Effects Processor, Red, Model B3', category: 'Musical Instruments & Gear',
  ebayCategoryName: null, ebayCategoryId: null, draftStatus: 'PUBLISHED', packageWeightOz: null, aiPackageWeightOz: null,
  packageLengthIn: null, packageWidthIn: null, packageHeightIn: null, ebayShippingOverride: 'LOCAL_PICKUP_ONLY',
};
const history = (id: string) => [
  posted(id, 'POSHMARK', '2026-09-02T10:00:00Z'),
  ...skips(id, 'POSHMARK', '2026-09-28T00:00:00Z', 95),
  removed(id, 'POSHMARK', '2026-09-30T12:00:00Z'),
  posted(id, 'POSHMARK', '2026-10-22T09:00:00Z'),
];

describe('getPendingRemovals: a repost resets the removal skip counter', () => {
  it('compliance path: 95 pre-repost skips do not flag the reposted listing and do not hold it back', async () => {
    candidateRows = [zoom];
    jobRows = history(zoom.id);
    const res = mockRes();
    await getPendingRemovals(req(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.needsManualReview.find((r: any) => r.id === zoom.id)).toBeUndefined();
    const entry = body.items.find((i: any) => i.id === zoom.id);
    expect(entry).toBeDefined();
    expect(entry.platforms).toEqual(['POSHMARK']);
  });

  it('compliance path: 3 skips after the repost flag it again, counting only those 3', async () => {
    candidateRows = [zoom];
    jobRows = [...history(zoom.id), ...skips(zoom.id, 'POSHMARK', '2026-10-29T00:00:00Z', 3)];
    const res = mockRes();
    await getPendingRemovals(req(), res);
    const flagged = res.json.mock.calls[0][0].needsManualReview.find((r: any) => r.id === zoom.id);
    expect(flagged).toBeDefined();
    expect(flagged.skipCount).toBe(3);
    expect(flagged.platforms).toEqual(['POSHMARK']);
  });

  it('SOLD path: old skips before the repost neither flag nor block; new ones do', async () => {
    const mxl = { id: 'cmpbizn7z000j3lq1rjrvn5js', title: 'MXL 770 Condenser Microphone, Professional Studio Kit' };
    soldRows = [mxl];
    jobRows = history(mxl.id);
    let res = mockRes();
    await getPendingRemovals(req(), res);
    let body = res.json.mock.calls[0][0];
    expect(body.needsManualReview.find((r: any) => r.id === mxl.id)).toBeUndefined();
    expect(body.items.find((i: any) => i.id === mxl.id)?.platforms).toEqual(['POSHMARK']);

    jobRows = [...history(mxl.id), ...skips(mxl.id, 'POSHMARK', new Date(Date.now() - 50 * 60000).toISOString(), 3)];
    res = mockRes();
    await getPendingRemovals(req(), res);
    body = res.json.mock.calls[0][0];
    expect(body.needsManualReview.find((r: any) => r.id === mxl.id)?.skipCount).toBe(3);
    // Past the 3-attempt cap and inside the 1h cooldown since the last skip: not re-served yet.
    expect(body.items.find((i: any) => i.id === mxl.id)).toBeUndefined();
  });

  it('SOLD path: the deterministic-reason stop also starts over after a repost', async () => {
    const mouse = { id: 'cmtbhh5hz022ap46d4s9avonn', title: 'Apple Magic Mouse 2 Wireless with Apple Wireless Keyboard Bundle' };
    soldRows = [mouse];
    jobRows = [
      posted(mouse.id, 'CRAIGSLIST', '2026-09-16T00:00:00Z'),
      ...skips(mouse.id, 'CRAIGSLIST', '2026-09-20T00:00:00Z', 2, 'ambiguous_duplicate_title'),
      posted(mouse.id, 'CRAIGSLIST', '2026-10-22T00:00:00Z'),
    ];
    const res = mockRes();
    await getPendingRemovals(req(), res);
    expect(res.json.mock.calls[0][0].items.find((i: any) => i.id === mouse.id)?.platforms).toEqual(['CRAIGSLIST']);
  });
});
