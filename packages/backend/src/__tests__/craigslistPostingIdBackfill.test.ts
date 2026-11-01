/**
 * (2026-11-01) Craigslist posting-id backfill, backend side. Synthetic data only; no network, no real database.
 *  - getExtensionItems sends craigslistRemoteListingId on every item: the posting id saved on its live CRAIGSLIST POST/POSTED row
 *    (parsed out of a stored posting URL), or null when that row has none / the item is not live there (craigslistSavedPostingId)
 *  - the extension reports a posting it found by a unique title through the EXISTING POST items/:id/remote-listing-id, which for
 *    Craigslist fills only an empty id on the latest POSTED row, keeps the public posting URL, and never overwrites a different id
 */
import * as fs from 'fs';
import * as path from 'path';

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

import { craigslistSavedPostingId, setItemRemoteListingId } from '../controllers/extensionController';

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}
const req = (extra: Record<string, unknown> = {}) => ({ user: { id: 'u1', emailVerified: true }, query: {}, params: {}, body: {}, ...extra }) as any;
const URL1 = 'https://kalamazoo.craigslist.org/msg/d/paw-paw-profile-pt-500-guitar-tuner/7987135515.html';

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', pausedMarketplaces: [] });
  mockPrisma.item.findFirst.mockResolvedValue({ id: 'item1' });
  mockPrisma.item.findUnique.mockResolvedValue({ id: 'item1', sale: { organizerId: 'org1' }, organizerId: 'org1' });
  mockPrisma.marketplaceListingJob.updateMany.mockResolvedValue({ count: 1 });
});

describe('craigslistSavedPostingId (getExtensionItems field)', () => {
  it('is the id of the live POSTED row, parsed out of a stored URL', () => {
    expect(craigslistSavedPostingId({ action: 'POST', status: 'POSTED', remoteListingId: URL1 })).toBe('7987135515');
    expect(craigslistSavedPostingId({ action: 'POST', status: 'POSTED', remoteListingId: '7980221088' })).toBe('7980221088');
  });
  it('is null when the live row has no id, the item is not live on Craigslist, or the stored value is unreadable', () => {
    expect(craigslistSavedPostingId({ action: 'POST', status: 'POSTED', remoteListingId: null })).toBeNull();
    expect(craigslistSavedPostingId(undefined)).toBeNull();
    expect(craigslistSavedPostingId({ action: 'REMOVE', status: 'REMOVED', remoteListingId: '7980221088' })).toBeNull();
    expect(craigslistSavedPostingId({ action: 'POST', status: 'FAILED', remoteListingId: '7980221088' })).toBeNull();
    expect(craigslistSavedPostingId({ action: 'POST', status: 'POSTED', remoteListingId: 'opaque-token' })).toBeNull();
  });
  it('getExtensionItems selects remoteListingId, keeps it on the latest row and always sends the field (null, never omitted)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'extensionController.ts'), 'utf8').replace(/\/\/[^\n]*/g, '');
    const fn = src.slice(src.indexOf('export const getExtensionItems'), src.indexOf('export const', src.indexOf('export const getExtensionItems') + 10));
    expect(fn).toMatch(/select: \{ itemId: true, action: true, status: true, platform: true, createdAt: true, lastErrorMessage: true, syncedQuantity: true, remoteListingId: true \}/);
    expect(fn).toMatch(/remoteListingId: \(j as any\)\.remoteListingId \?\? null/);
    expect(fn).toMatch(/craigslistRemoteListingId: craigslistSavedPostingId\(latestByItemPlatform\.get\(`\$\{it\.id\}:CRAIGSLIST`\)\)/);
  });
});

describe('POST items/:id/remote-listing-id for a Craigslist posting found by the reconcile scan', () => {
  const call = async (body: Record<string, unknown>) => { const res = mockRes(); await setItemRemoteListingId(req({ params: { id: 'item1' }, body }), res); return res; };

  it('fills the empty id on the latest POSTED row, storing the public posting URL', async () => {
    mockPrisma.marketplaceListingJob.findFirst
      .mockResolvedValueOnce({ id: 'job1', action: 'POST', status: 'POSTED', remoteListingId: null })
      .mockResolvedValueOnce(null);
    const res = await call({ platform: 'CRAIGSLIST', remoteListingId: '7987135515', remoteListingUrl: URL1 });
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(mockPrisma.marketplaceListingJob.updateMany).toHaveBeenCalledWith({ where: { id: 'job1', remoteListingId: null }, data: { remoteListingId: URL1 } });
  });
  it('by id alone stores the id', async () => {
    mockPrisma.marketplaceListingJob.findFirst
      .mockResolvedValueOnce({ id: 'job1', action: 'POST', status: 'POSTED', remoteListingId: null })
      .mockResolvedValueOnce(null);
    await call({ platform: 'CRAIGSLIST', remoteListingId: '7987135515' });
    expect(mockPrisma.marketplaceListingJob.updateMany).toHaveBeenCalledWith({ where: { id: 'job1', remoteListingId: null }, data: { remoteListingId: '7987135515' } });
  });
  it('never overwrites a different saved id (409 already_set); the same id is a no-op', async () => {
    mockPrisma.marketplaceListingJob.findFirst.mockResolvedValueOnce({ id: 'job1', action: 'POST', status: 'POSTED', remoteListingId: 'https://kalamazoo.craigslist.org/a/d/x/7111111111.html' });
    const res = await call({ platform: 'CRAIGSLIST', remoteListingId: '7987135515', remoteListingUrl: URL1 });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].reason).toBe('already_set');
    mockPrisma.marketplaceListingJob.findFirst.mockResolvedValueOnce({ id: 'job1', action: 'POST', status: 'POSTED', remoteListingId: URL1 });
    const same = await call({ platform: 'CRAIGSLIST', remoteListingId: '7987135515' });
    expect(same.json).toHaveBeenCalledWith({ ok: true, unchanged: true });
    expect(mockPrisma.marketplaceListingJob.updateMany).not.toHaveBeenCalled();
  });
  it('refuses when the latest row is not a live posting, or when the posting is saved on another item', async () => {
    mockPrisma.marketplaceListingJob.findFirst.mockResolvedValueOnce({ id: 'job2', action: 'REMOVE', status: 'REMOVED', remoteListingId: null });
    const gone = await call({ platform: 'CRAIGSLIST', remoteListingId: '7987135515' });
    expect(gone.status).toHaveBeenCalledWith(409);
    mockPrisma.marketplaceListingJob.findFirst
      .mockResolvedValueOnce({ id: 'job1', action: 'POST', status: 'POSTED', remoteListingId: null })
      .mockResolvedValueOnce({ id: 'other' });
    const clash = await call({ platform: 'CRAIGSLIST', remoteListingId: '7987135515' });
    expect(clash.status).toHaveBeenCalledWith(409);
    expect(clash.json.mock.calls[0][0].reason).toBe('id_in_use');
    expect(mockPrisma.marketplaceListingJob.updateMany).not.toHaveBeenCalled();
  });
});
