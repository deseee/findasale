/**
 * Auto queue settings endpoint (2026-10-23). The web card's toggles could never save: the routes lived on the
 * Bearer-only /api/extension router and a cookie PATCH got 401 BEARER_REQUIRED. They now live at
 * /api/organizers/me/auto-queue-settings (cookie + CSRF, organizer-only, PRO). Also covers the optional test limits
 * and the paused list the card shows. Adversarial checks: own settings only (organizer from the session, never the
 * body), no mass assignment (unknown keys rejected, nothing written), invalid values rejected.
 * Mocked Prisma, synthetic data, no network.
 */
import fs from 'fs';
import path from 'path';

const mockOrganizerFindUnique = jest.fn();
const mockOrganizerUpdate = jest.fn();
const mockLimitFindUnique = jest.fn();
const mockLimitUpsert = jest.fn();

jest.mock('../lib/prisma', () => ({
  prisma: {
    organizer: {
      findUnique: (...a: unknown[]) => mockOrganizerFindUnique(...a),
      update: (...a: unknown[]) => mockOrganizerUpdate(...a),
    },
    organizerAutoQueueLimit: {
      findUnique: (...a: unknown[]) => mockLimitFindUnique(...a),
      upsert: (...a: unknown[]) => mockLimitUpsert(...a),
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

import { getAutoQueueSettings, patchAutoQueueSettings } from '../controllers/extensionController';

const mkRes = () => {
  const res: any = { statusCode: 200, body: undefined };
  res.status = jest.fn((c: number) => { res.statusCode = c; return res; });
  res.json = jest.fn((b: any) => { res.body = b; return res; });
  return res;
};
const mkReq = (body: unknown) => ({ user: { id: 'u1' }, params: {}, body }) as any;

beforeEach(() => {
  [mockOrganizerFindUnique, mockOrganizerUpdate, mockLimitFindUnique, mockLimitUpsert].forEach((m) => m.mockReset());
  mockOrganizerFindUnique.mockImplementation(async (args: any) => {
    if (args.where.userId) return args.where.userId === 'u1' ? { id: 'org1' } : null;
    return { id: 'org1', mercariAutoListEnabled: true, poshmarkAutoListEnabled: false, pausedMarketplaces: ['FACEBOOK', 'GUMTREE_AU', 'BOGUS'] };
  });
  mockOrganizerUpdate.mockResolvedValue({ id: 'org1' });
  mockLimitFindUnique.mockResolvedValue(null);
  mockLimitUpsert.mockResolvedValue({});
});

describe('GET auto queue settings', () => {
  it('returns settings, the sanitized paused list and no limits by default, for the session organizer', async () => {
    const res = mkRes();
    await getAutoQueueSettings(mkReq(undefined), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.settings.MERCARI).toBe(true);
    expect(res.body.settings.POSHMARK).toBe(false);
    expect(res.body.paused).toEqual(['FACEBOOK', 'GUMTREE_AU']);
    expect(res.body.limits).toEqual({ maxNewPerRun: null, onlyItemIds: [] });
    expect(res.body.limitsAvailable).toBe(true);
    expect(mockOrganizerFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1' } }));
    expect(mockLimitFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { organizerId: 'org1' } }));
  });

  it('treats a missing limits table (migration not applied) as no limits', async () => {
    mockLimitFindUnique.mockRejectedValue(Object.assign(new Error('The table `public.OrganizerAutoQueueLimit` does not exist'), { code: 'P2021' }));
    const res = mkRes();
    await getAutoQueueSettings(mkReq(undefined), res);
    expect(res.body.limitsAvailable).toBe(false);
    expect(res.body.limits).toEqual({ maxNewPerRun: null, onlyItemIds: [] });
  });

  it('404s when the session user has no organizer profile', async () => {
    const res = mkRes();
    await getAutoQueueSettings({ user: { id: 'someone-else' }, body: {} } as any, res);
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH auto queue settings', () => {
  it('saves a toggle for the session organizer only', async () => {
    const res = mkRes();
    await patchAutoQueueSettings(mkReq({ settings: { MERCARI: false } }), res);
    expect(res.statusCode).toBe(200);
    expect(mockOrganizerUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'org1' }, data: { mercariAutoListEnabled: false } }));
    expect(mockLimitUpsert).not.toHaveBeenCalled();
  });

  it('rejects mass assignment: any other top-level key, nothing written', async () => {
    for (const body of [
      { settings: { MERCARI: true }, organizerId: 'victim' },
      { settings: { MERCARI: true }, subscriptionTier: 'TEAMS' },
      { userId: 'u2' },
    ]) {
      const res = mkRes();
      await patchAutoQueueSettings(mkReq(body), res);
      expect(res.statusCode).toBe(400);
    }
    expect(mockOrganizerUpdate).not.toHaveBeenCalled();
    expect(mockLimitUpsert).not.toHaveBeenCalled();
  });

  it('rejects non-boolean settings, unknown limit keys and bad limit values, nothing written', async () => {
    for (const body of [
      { settings: { MERCARI: 'yes' } },
      { settings: { subscriptionTier: true } },
      { limits: { maxNewPerRun: 0 } },
      { limits: { maxNewPerRun: 2.5 } },
      { limits: { maxNewPerRun: 501 } },
      { limits: { onlyItemIds: 'abc' } },
      { limits: { onlyItemIds: ['<script>'] } },
      { limits: { organizerId: 'victim' } },
      { settings: { MERCARI: true }, limits: { maxNewPerRun: -1 } },
      {},
      [],
    ]) {
      const res = mkRes();
      await patchAutoQueueSettings(mkReq(body), res);
      expect(res.statusCode).toBe(400);
    }
    expect(mockOrganizerUpdate).not.toHaveBeenCalled();
    expect(mockLimitUpsert).not.toHaveBeenCalled();
  });

  it('saves test limits keyed to the session organizer', async () => {
    mockLimitFindUnique.mockResolvedValue({ maxNewPerRun: 3, onlyItemIds: ['cmur2km2002dfno33bc4ii06r'] });
    const res = mkRes();
    await patchAutoQueueSettings(mkReq({ limits: { maxNewPerRun: 3, onlyItemIds: ['cmur2km2002dfno33bc4ii06r', 'cmur2km2002dfno33bc4ii06r'] } }), res);
    expect(res.statusCode).toBe(200);
    expect(mockLimitUpsert).toHaveBeenCalledWith({
      where: { organizerId: 'org1' },
      create: { organizerId: 'org1', maxNewPerRun: 3, onlyItemIds: ['cmur2km2002dfno33bc4ii06r'] },
      update: { maxNewPerRun: 3, onlyItemIds: ['cmur2km2002dfno33bc4ii06r'] },
    });
    expect(res.body.limits).toEqual({ maxNewPerRun: 3, onlyItemIds: ['cmur2km2002dfno33bc4ii06r'] });
  });

  it('answers 503 for limits when the table is not migrated yet', async () => {
    mockLimitUpsert.mockRejectedValue(Object.assign(new Error('missing'), { code: 'P2021' }));
    const res = mkRes();
    await patchAutoQueueSettings(mkReq({ limits: { maxNewPerRun: 3 } }), res);
    expect(res.statusCode).toBe(503);
  });
});

describe('route placement', () => {
  const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  it('lives on the cookie organizers router with organizer + PRO gates', () => {
    const org = read('routes/organizers.ts');
    expect(org).toMatch(/router\.get\('\/me\/auto-queue-settings', authenticate, requireOrganizer, requireTier\('PRO'\), getAutoQueueSettings\)/);
    expect(org).toMatch(/router\.patch\('\/me\/auto-queue-settings', authenticate, requireOrganizer, requireTier\('PRO'\), patchAutoQueueSettings\)/);
    // registered before the public '/:id' route so it is never shadowed
    expect(org.indexOf("'/me/auto-queue-settings'")).toBeLessThan(org.indexOf("router.get('/:id'"));
  });
  it('is gone from the Bearer-only extension router', () => {
    expect(read('routes/extension.ts')).not.toMatch(/router\.(get|patch)\('\/auto-queue-settings'/);
  });
  it('the web card calls the new endpoint', () => {
    const card = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'frontend', 'components', 'AutoQueueCard.tsx'), 'utf8');
    expect(card).toContain("'/organizers/me/auto-queue-settings'");
    expect(card).not.toContain('/extension/auto-queue-settings');
  });
});
