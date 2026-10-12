/**
 * markItemRemovalSkipped stale-skip guard (2026-10-12). A skip report for an item+platform whose newest
 * non-SKIPPED job row is REMOVE/REMOVED must write nothing and answer { ok: true, alreadyRemoved: true };
 * a still-listed item (newest non-skipped row POST/POSTED) still records the skip; the Resync bypass
 * (confirmedGone) and the verifyOnly short-circuit are unchanged. Mocked Prisma, synthetic data, no network.
 * NOT EXECUTED locally (jest cannot run on the authoring machine); CI ci-typecheck.yml is the gate.
 */
const mockOrganizerFindUnique = jest.fn();
const mockItemFindFirst = jest.fn();
const mockJobFindFirst = jest.fn();
const mockJobFindMany = jest.fn();
const mockJobCount = jest.fn();
const mockJobCreate = jest.fn();

jest.mock('../lib/prisma', () => ({
  prisma: {
    organizer: { findUnique: (...a: unknown[]) => mockOrganizerFindUnique(...a) },
    item: { findFirst: (...a: unknown[]) => mockItemFindFirst(...a) },
    marketplaceListingJob: {
      findFirst: (...a: unknown[]) => mockJobFindFirst(...a),
      findMany: (...a: unknown[]) => mockJobFindMany(...a),
      count: (...a: unknown[]) => mockJobCount(...a),
      create: (...a: unknown[]) => mockJobCreate(...a),
    },
  },
}));
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
  ...jest.requireActual('../services/ebayRateEstimateService'),
  computeCheapestForOrigin: jest.fn(),
}));
jest.mock('../services/poshmarkCategoryResolver', () => ({ resolvePoshmarkCategory: jest.fn() }));
jest.mock('../services/mercariCategoryResolver', () => ({ resolveMercariCategory: jest.fn() }));
jest.mock('../services/grailedCategoryResolver', () => ({ resolveGrailedCategory: jest.fn() }));
jest.mock('../services/craigslistCategoryResolver', () => ({ resolveCraigslistCategory: jest.fn() }));

import { markItemRemovalSkipped } from '../controllers/extensionController';

const mkRes = () => {
  const res: any = { statusCode: 200, body: undefined };
  res.status = jest.fn((c: number) => { res.statusCode = c; return res; });
  res.json = jest.fn((b: any) => { res.body = b; return res; });
  return res;
};
const mkReq = (body: Record<string, unknown>) => ({ user: { id: 'u1' }, params: { id: 'item1' }, body }) as any;

beforeEach(() => {
  [mockOrganizerFindUnique, mockItemFindFirst, mockJobFindFirst, mockJobFindMany, mockJobCount, mockJobCreate].forEach((m) => m.mockReset());
  mockOrganizerFindUnique.mockResolvedValue({ id: 'org1' });
  mockItemFindFirst.mockResolvedValue({ id: 'item1' });
  mockJobCount.mockResolvedValue(0);
  mockJobCreate.mockResolvedValue({});
  mockJobFindMany.mockResolvedValue([]);
});

describe('markItemRemovalSkipped stale-skip guard', () => {
  it('skip after REMOVE/REMOVED returns alreadyRemoved and writes nothing', async () => {
    mockJobFindFirst.mockResolvedValue({ action: 'REMOVE', status: 'REMOVED' });
    const res = mkRes();
    await markItemRemovalSkipped(mkReq({ platform: 'FACEBOOK', reason: 'no_confident_title_match' }), res);
    expect(res.body).toEqual({ ok: true, alreadyRemoved: true });
    expect(mockJobCreate).not.toHaveBeenCalled();
    expect(mockJobCount).not.toHaveBeenCalled();
    // guard looks past REMOVE/SKIPPED rows, scoped to item + platform, newest first
    expect(mockJobFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { itemId: 'item1', platform: 'FACEBOOK', NOT: { action: 'REMOVE', status: 'SKIPPED' } },
      orderBy: { createdAt: 'desc' },
    }));
  });

  it('skip on a still-listed item (newest non-skipped row POST/POSTED) still records', async () => {
    mockJobFindFirst.mockResolvedValue({ action: 'POST', status: 'POSTED' });
    mockJobCount.mockResolvedValue(2);
    const res = mkRes();
    await markItemRemovalSkipped(mkReq({ platform: 'POSHMARK', reason: 'no_confident_title_match' }), res);
    expect(res.body).toEqual({ ok: true });
    expect(mockJobCreate).toHaveBeenCalledTimes(1);
    expect(mockJobCreate.mock.calls[0][0].data).toMatchObject({
      itemId: 'item1', action: 'REMOVE', status: 'SKIPPED', platform: 'POSHMARK', attemptCount: 3, lastErrorMessage: 'no_confident_title_match',
    });
  });

  it('skip with no prior job rows at all still records (existing behavior)', async () => {
    mockJobFindFirst.mockResolvedValue(null);
    const res = mkRes();
    await markItemRemovalSkipped(mkReq({ reason: 'x' }), res); // platform defaults to FACEBOOK
    expect(res.body).toEqual({ ok: true });
    expect(mockJobCreate.mock.calls[0][0].data).toMatchObject({ platform: 'FACEBOOK', status: 'SKIPPED', attemptCount: 1 });
  });

  it('Resync confirmedGone bypasses the guard and still writes the REMOVED row', async () => {
    const res = mkRes();
    await markItemRemovalSkipped(mkReq({ platform: 'MERCARI', reason: 'listing_not_found', confirmedGone: true }), res);
    expect(res.body).toEqual({ ok: true, resolved: true });
    expect(mockJobFindFirst).not.toHaveBeenCalled();
    expect(mockJobCreate.mock.calls[0][0].data).toMatchObject({ action: 'REMOVE', status: 'REMOVED', platform: 'MERCARI' });
  });

  it('verifyOnly still short-circuits without a write or a guard lookup', async () => {
    const res = mkRes();
    await markItemRemovalSkipped(mkReq({ platform: 'VINTED', reason: 'verify_still_live', verifyOnly: true }), res);
    expect(res.body).toEqual({ ok: true, verified: true });
    expect(mockJobCreate).not.toHaveBeenCalled();
    expect(mockJobFindFirst).not.toHaveBeenCalled();
  });

  it('a lone listing_not_found skip on a still-listed item records a SKIPPED row (3-strike streak not met)', async () => {
    mockJobFindFirst.mockResolvedValue({ action: 'POST', status: 'POSTED' });
    mockJobFindMany.mockResolvedValue([{ action: 'POST', status: 'POSTED', lastErrorMessage: null }, { action: 'POST', status: 'POSTED', lastErrorMessage: null }]);
    const res = mkRes();
    await markItemRemovalSkipped(mkReq({ platform: 'POSHMARK', reason: 'listing_not_found' }), res);
    expect(res.body).toEqual({ ok: true });
    expect(mockJobCreate.mock.calls[0][0].data).toMatchObject({ status: 'SKIPPED', lastErrorMessage: 'listing_not_found' });
  });
});
