/**
 * (2026-10-12) A failed Vinted wardrobe read (single-item sold-check) is logged by the extension as source
 * vintedSoldReadFailed through the existing POST /extension/logs endpoint. Synthetic data only.
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

import * as fs from 'fs';
import * as path from 'path';
import { postExtensionLogs } from '../controllers/extensionController';

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('vintedSoldReadFailed log entries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1' });
    mockPrisma.extensionRuntimeLog.createMany.mockResolvedValue({ count: 1 });
  });

  it('stores source vintedSoldReadFailed with the reason code in message and context', async () => {
    const res = mockRes();
    await postExtensionLogs({
      user: { id: 'u1' },
      body: { logs: [{ level: 'warn', source: 'vintedSoldReadFailed', message: 'vinted sold-check wardrobe read failed: http_403', context: { reason: 'http_403' }, platform: 'vinted' }] },
    } as any, res);
    const rows = mockPrisma.extensionRuntimeLog.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({
      organizerId: 'org1', level: 'warn', source: 'vintedSoldReadFailed', platform: 'vinted', context: { reason: 'http_403' },
    }));
    expect(rows[0].message).toContain('http_403');
    expect(res.json).toHaveBeenCalledWith({ ok: true, accepted: 1, rejected: 0 });
  });

  it('extension wiring: wardrobe read emits the reason codes and background logs the new source', () => {
    const root = path.resolve(__dirname, '../../../../extension');
    const vinted = fs.readFileSync(path.join(root, 'fas-vinted.js'), 'utf8');
    const bg = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
    const start = vinted.indexOf('async function vintSoldReadWardrobe');
    const fn = vinted.slice(start, vinted.indexOf("'incomplete_page_cap'", start) + 30);
    expect(start).toBeGreaterThan(0);
    for (const code of ['timeout', 'network', 'not_logged_in', 'not_json', 'no_items_array', 'unrecognized_item_shape', 'incomplete_page_cap']) {
      expect(fn).toContain("'" + code + "'");
    }
    expect(fn).toContain("'http_' + st");
    expect(vinted).toContain("type: 'reportVintedSold', items: [], readFailed: true");
    expect(bg).toContain("fasLog('warn', 'vintedSoldReadFailed'");
    expect(JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')).version).toBe('1.0.4');
  });
});
