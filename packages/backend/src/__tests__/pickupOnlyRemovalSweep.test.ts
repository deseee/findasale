/**
 * 2026-10-27 (Patrick: "take them off Poshmark and do the pull when marked pickup"). getPendingRemovals' compliance
 * sweep now sees Item.ebayShippingOverride, so an AVAILABLE item marked local pickup only with a live listing on a
 * shipping-only marketplace is served as a POLICY_INELIGIBLE removal for that marketplace only (the extension's
 * existing per-platform removal engine takes it down). Synthetic data only; no network, no real database.
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
let jobRows: any[] = [];
const posted = (id: string, platform: string, remoteListingId: string | null = 'r1') =>
  ({ itemId: id, action: 'POST', status: 'POSTED', lastErrorMessage: null, lastAttemptAt: null, platform, createdAt: new Date('2026-10-20T00:00:00Z'), remoteListingId });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  candidateRows = [];
  jobRows = [];
  mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', pausedMarketplaces: [] });
  mockPrisma.item.findMany.mockImplementation(async (args: any) => {
    const w = args?.where ?? {};
    if (w.id && w.id.in) return candidateRows.filter((r) => w.id.in.includes(r.id));
    return [];
  });
  mockPrisma.marketplaceListingJob.findMany.mockImplementation(async (args: any) => (args?.where?.itemId || args?.where?.item ? jobRows : []));
  mockPrisma.itemKitComponent.findMany.mockResolvedValue([]);
  mockPrisma.pendingListingRemoval.findMany.mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

const speaker = {
  id: 'cmnzf780a0009pf19ru5qppqn', title: 'Celestion G12 speaker cabinet', category: 'Musical Instruments & Gear', ebayCategoryName: null,
  ebayCategoryId: null, draftStatus: 'PUBLISHED', packageWeightOz: null, aiPackageWeightOz: null,
  packageLengthIn: null, packageWidthIn: null, packageHeightIn: null, ebayShippingOverride: 'LOCAL_PICKUP_ONLY',
};

describe('GET pending-removals: pickup-only items come off shipping-only marketplaces', () => {
  it('a pickup-only item live on Poshmark is served as POLICY_INELIGIBLE with the pickup reason', async () => {
    candidateRows = [speaker];
    jobRows = [posted(speaker.id, 'POSHMARK', 'posh123')];
    const res = mockRes();
    await getPendingRemovals(req(), res);
    const entry = res.json.mock.calls[0][0].items.find((i: any) => i.id === speaker.id);
    expect(entry).toBeDefined();
    expect(entry.reason).toBe('POLICY_INELIGIBLE');
    expect(entry.platforms).toEqual(['POSHMARK']);
    expect(entry.listingRefs).toEqual({ POSHMARK: 'posh123' });
    expect(entry.policyReasons).toEqual({ POSHMARK: 'Marked pickup only, and Poshmark only sells with shipping.' });
  });

  it('only the shipping-only listings are pulled; Facebook and Craigslist stay up', async () => {
    candidateRows = [speaker];
    jobRows = [posted(speaker.id, 'FACEBOOK'), posted(speaker.id, 'CRAIGSLIST'), posted(speaker.id, 'POSHMARK'), posted(speaker.id, 'MERCARI'), posted(speaker.id, 'VINTED')];
    const res = mockRes();
    await getPendingRemovals(req(), res);
    const entry = res.json.mock.calls[0][0].items.find((i: any) => i.id === speaker.id);
    expect([...entry.platforms].sort()).toEqual(['MERCARI', 'POSHMARK', 'VINTED']);
    expect(Object.keys(entry.policyReasons).sort()).toEqual(['MERCARI', 'POSHMARK', 'VINTED']);
  });

  it('the same item without the pickup flag is not pulled', async () => {
    candidateRows = [{ ...speaker, ebayShippingOverride: null }];
    jobRows = [posted(speaker.id, 'POSHMARK')];
    const res = mockRes();
    await getPendingRemovals(req(), res);
    expect(res.json.mock.calls[0][0].items.find((i: any) => i.id === speaker.id)).toBeUndefined();
  });

  it('the candidate select loads ebayShippingOverride (without it the sweep could never see the flag)', async () => {
    candidateRows = [speaker];
    jobRows = [posted(speaker.id, 'POSHMARK')];
    await getPendingRemovals(req(), mockRes());
    const call = mockPrisma.item.findMany.mock.calls.find((c: any[]) => c[0]?.where?.id?.in);
    expect(call).toBeDefined();
    expect(call![0].select.ebayShippingOverride).toBe(true);
  });
});
