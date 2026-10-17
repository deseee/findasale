/**
 * (2026-10-17) Automatic failure diagnostics: FAS_EDIT_DIAG / FAS_FLOW_DIAG entries through POST /extension/logs keep a larger
 * context, are scrubbed again, and are emitted as one greppable stdout line. Synthetic data only.
 */
const mockPrisma: any = {
  organizer: { findUnique: jest.fn() },
  extensionRuntimeLog: { createMany: jest.fn() },
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
  normalizeListingTitle: (t: string) => t,
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

import { postExtensionLogs } from '../controllers/extensionController';

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('FAS_EDIT_DIAG automatic diagnostics', () => {
  let logSpy: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1' });
    mockPrisma.extensionRuntimeLog.createMany.mockResolvedValue({ count: 1 });
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => logSpy.mockRestore());

  const bigCtx = () => ({ code: 'verify_mismatch', platform: 'POSHMARK', snapshots: [{ buttons: Array.from({ length: 200 }, (_, i) => 'Button ' + i) }], note: 'owner@example.com https://x.com/a?csrf=SECRET1&b=2' });

  it('stores a large FAS_EDIT_DIAG context (over the 2000 cap), scrubs it again, and logs one prefixed JSON line', async () => {
    const ctx = bigCtx();
    expect(JSON.stringify(ctx).length).toBeGreaterThan(2000);
    const res = mockRes();
    await postExtensionLogs({ user: { id: 'u1' }, body: { logs: [{ level: 'warn', source: 'FAS_EDIT_DIAG', message: 'POSHMARK verify_mismatch', context: ctx, platform: 'POSHMARK', itemId: 'it1' }] } } as any, res);
    const row = mockPrisma.extensionRuntimeLog.createMany.mock.calls[0][0].data[0];
    expect(row.context).toBeDefined();
    const j = JSON.stringify(row.context);
    expect(j).not.toContain('owner@example.com');
    expect(j).not.toContain('SECRET1');
    expect(j).toContain('Button 199');
    const lines = logSpy.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('FAS_EDIT_DIAG '));
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0].slice('FAS_EDIT_DIAG '.length));
    expect(parsed).toEqual(expect.objectContaining({ organizerId: 'org1', platform: 'POSHMARK', itemId: 'it1' }));
    expect(parsed.diag.code).toBe('verify_mismatch');
  });

  it('keeps the 2000 cap for ordinary sources and does not print them', async () => {
    const res = mockRes();
    await postExtensionLogs({ user: { id: 'u1' }, body: { logs: [{ level: 'info', source: 'resyncListings', message: 'x', context: bigCtx() }] } } as any, res);
    expect(mockPrisma.extensionRuntimeLog.createMany.mock.calls[0][0].data[0].context).toBeUndefined();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('drops contexts above the diagnostic cap', async () => {
    const res = mockRes();
    await postExtensionLogs({ user: { id: 'u1' }, body: { logs: [{ level: 'warn', source: 'FAS_FLOW_DIAG', message: 'x', context: { blob: 'a'.repeat(17000) } }] } } as any, res);
    expect(mockPrisma.extensionRuntimeLog.createMany.mock.calls[0][0].data[0].context).toBeUndefined();
  });
});
