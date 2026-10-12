/**
 * (2026-10-12) Automatic Vinted bundle reconciliation, extension API surface:
 *  - GET /extension/pending-sold-checks now carries vintedBundleOrders [{ noticeId, conversationId, priceText, itemCount, emailAt }]
 *  - POST /extension/vinted-bundle-orders/report (reportVintedBundleOrderItems) is scoped to the caller and delegates to
 *    vintedBundleOrderService
 *  - a wardrobe report (reportVintedSold) only closes LEGACY bundle notices (no conversation id)
 * Synthetic data only.
 */
import * as fs from 'fs';
import * as path from 'path';

const mockPrisma: any = {
  organizer: { findUnique: jest.fn() },
  notification: { count: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  item: { findMany: jest.fn() },
  marketplaceListingJob: { findMany: jest.fn() },
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
const mockProcessReport = jest.fn();
jest.mock('../services/vintedSoldDetectionService', () => ({
  processVintedSoldReport: (...a: any[]) => mockProcessReport(...a),
  sanitizeVintedSoldEntries: (raw: any[]) => raw.map((e: any) => ({ vintedId: String(e.vintedId), title: e.title })),
  VINTED_SOLD_MAX_ENTRIES: 100,
  normalizeListingTitle: (t: string) => t,
}));
const mockReportOrder = jest.fn();
jest.mock('../services/vintedBundleOrderService', () => ({ reportVintedBundleOrder: (...a: any[]) => mockReportOrder(...a) }));
jest.mock('../services/messageAutosendService', () => ({ decideMessageAutosend: jest.fn() }));
jest.mock('../services/ebayRateEstimateService', () => ({
  ...jest.requireActual('../services/ebayRateEstimateService'),
  computeCheapestForOrigin: jest.fn(),
}));
jest.mock('../services/poshmarkCategoryResolver', () => ({ resolvePoshmarkCategory: jest.fn() }));
jest.mock('../services/mercariCategoryResolver', () => ({ resolveMercariCategory: jest.fn() }));
jest.mock('../services/grailedCategoryResolver', () => ({ resolveGrailedCategory: jest.fn() }));
jest.mock('../services/craigslistCategoryResolver', () => ({ resolveCraigslistCategory: jest.fn() }));

import { getPendingSoldChecks, reportVintedBundleOrderItems, reportVintedSold } from '../controllers/extensionController';
import { buildBundleNoticeLink } from '../services/vintedBundleSaleService';

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const created = new Date('2026-10-11T23:50:00.000Z');
const bundleNotice = {
  id: 'n1',
  link: buildBundleNoticeLink({ conversationId: '900100200300', itemCount: 5, amountText: '$5.00', attempts: 0 }),
  body: 'Vinted reports a bundle of 5 items sold for $5.00 to duck212. ',
  createdAt: created,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', pausedMarketplaces: [] });
  mockPrisma.notification.count.mockResolvedValue(1);
  mockPrisma.notification.findMany.mockResolvedValue([bundleNotice]);
  mockPrisma.item.findMany.mockResolvedValue([]);
  mockPrisma.marketplaceListingJob.findMany.mockResolvedValue([]);
});

describe('GET pending-sold-checks carries the open bundle orders', () => {
  it('returns vintedBundleOrders in the documented shape, alongside the existing flag', async () => {
    const res = mockRes();
    await getPendingSoldChecks({ user: { id: 'u1' } } as any, res);
    const body = res.json.mock.calls[0][0];
    expect(body.vintedSoldCheckRequested).toBe(true);
    expect(body.vintedBundleOrders).toEqual([
      { noticeId: 'n1', conversationId: '900100200300', priceText: '$5.00', itemCount: 5, emailAt: created.toISOString(), attempts: 0 },
    ]);
    expect(mockPrisma.notification.findMany.mock.calls[0][0].where.userId).toBe('u1');
  });

  it('also returns them on the early-exit shapes (no available items / paused Facebook)', async () => {
    let res = mockRes();
    await getPendingSoldChecks({ user: { id: 'u1' } } as any, res); // item.findMany -> [] => early exit
    expect(res.json.mock.calls[0][0]).toEqual(expect.objectContaining({ items: [], vintedBundleOrders: expect.any(Array) }));
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', pausedMarketplaces: ['FACEBOOK'] });
    res = mockRes();
    await getPendingSoldChecks({ user: { id: 'u1' } } as any, res);
    expect(res.json.mock.calls[0][0]).toEqual(expect.objectContaining({ paused: true, vintedBundleOrders: expect.any(Array) }));
    expect(res.json.mock.calls[0][0].vintedBundleOrders).toHaveLength(1);
  });

  it('is an empty list when there is nothing open', async () => {
    mockPrisma.notification.findMany.mockResolvedValue([]);
    mockPrisma.notification.count.mockResolvedValue(0);
    const res = mockRes();
    await getPendingSoldChecks({ user: { id: 'u1' } } as any, res);
    expect(res.json.mock.calls[0][0].vintedBundleOrders).toEqual([]);
  });
});

describe('POST vinted-bundle-orders/report', () => {
  it('requires authentication, an organizer and a notice id', async () => {
    let res = mockRes();
    await reportVintedBundleOrderItems({ body: { noticeId: 'n1' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(401);
    res = mockRes();
    await reportVintedBundleOrderItems({ user: { id: 'u1' }, body: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    mockPrisma.organizer.findUnique.mockResolvedValue(null);
    res = mockRes();
    await reportVintedBundleOrderItems({ user: { id: 'u1' }, body: { noticeId: 'n1' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockReportOrder).not.toHaveBeenCalled();
  });

  it('delegates scoped to the caller and returns the outcome', async () => {
    mockReportOrder.mockResolvedValue({ status: 'resolved', resolved: 5, itemCount: 5, results: [] });
    const res = mockRes();
    const items = [{ vintedId: '1001', title: 'A' }];
    await reportVintedBundleOrderItems({ user: { id: 'u1' }, body: { noticeId: 'n1', conversationId: '900100200300', items, readFailed: false } } as any, res);
    expect(mockReportOrder).toHaveBeenCalledWith({ userId: 'u1', organizerId: 'org1', noticeId: 'n1', conversationId: '900100200300', items, readFailed: false });
    expect(res.json).toHaveBeenCalledWith({ ok: true, status: 'resolved', resolved: 5, itemCount: 5, results: [] });
  });

  it('passes the optional failReason through to the service', async () => {
    mockReportOrder.mockResolvedValue({ status: 'partial', resolved: 0, itemCount: 5, attempts: 1, fallbackShown: false, results: [] });
    const res = mockRes();
    await reportVintedBundleOrderItems({ user: { id: 'u1' }, body: { noticeId: 'n1', conversationId: '900100200300', items: [], readFailed: true, failReason: 'http_403' } } as any, res);
    expect(mockReportOrder).toHaveBeenCalledWith(expect.objectContaining({ readFailed: true, failReason: 'http_403' }));
  });

  it('maps not-found to 404 and a refusal to 400', async () => {
    mockReportOrder.mockResolvedValueOnce({ status: 'notFound' });
    let res = mockRes();
    await reportVintedBundleOrderItems({ user: { id: 'u1' }, body: { noticeId: 'zzz' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
    mockReportOrder.mockResolvedValueOnce({ status: 'rejected', reason: 'too_many_items' });
    res = mockRes();
    await reportVintedBundleOrderItems({ user: { id: 'u1' }, body: { noticeId: 'n1', items: [] } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ reason: 'too_many_items' }));
  });
});

describe('wardrobe report vs conversation-tracked notices', () => {
  it('a wardrobe sold report closes only LEGACY notices (no conversation id), never a conversation-tracked one', async () => {
    mockProcessReport.mockResolvedValue([{ vintedId: '1', title: 't', result: 'sold', matched: true }]);
    const res = mockRes();
    await reportVintedSold({ user: { id: 'u1' }, body: { items: [{ vintedId: '1', title: 't' }] } } as any, res);
    const where = mockPrisma.notification.updateMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ link: null }, { link: { not: { contains: 'vc=' } } }]);
  });

  it('the route is mounted behind the same auth/tier chain as vinted-sold', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'extension.ts'), 'utf8');
    expect(src).toContain("router.post('/vinted-bundle-orders/report', authenticate, requireOrganizer, requireTier('PRO'), reportVintedBundleOrderItems);");
  });
});
