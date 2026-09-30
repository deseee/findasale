/**
 * CSV export: formula-injection neutralisation, itemIds/status filters, tier + ownership gates.
 * Prisma (../index) and the Cloudinary watermark helpers are jest mocks; no network.
 * (Written 2026-09-29 without being executed: jest cannot run on the authoring machine.)
 */

const mockPrisma = {
  organizer: { findUnique: jest.fn() },
  sale: { findUnique: jest.fn() },
  item: { findMany: jest.fn() },
};
jest.mock('../index', () => ({ prisma: mockPrisma }));
jest.mock('../utils/cloudinaryWatermark', () => ({
  getWatermarkedUrl: (u: string) => u,
  getWatermarkedUrlWithQR: (u: string) => u,
  ensureQrCodeAsset: jest.fn().mockResolvedValue(undefined),
}));

import { escapeCsvField, neutralizeCsvFormula, generateCsvExport } from '../services/exportService';
import { getCsvExportHandler, parseItemIdsParam, MAX_EXPORT_ITEM_IDS } from '../controllers/csvExportController';

describe('formula-injection neutralisation', () => {
  it('prefixes a single quote to cells that start with = + - @ tab or CR', () => {
    expect(neutralizeCsvFormula('=HYPERLINK("http://evil","x")')).toBe('\'=HYPERLINK("http://evil","x")');
    expect(neutralizeCsvFormula('+cmd|calc')).toBe("'+cmd|calc");
    expect(neutralizeCsvFormula('-2+3')).toBe("'-2+3");
    expect(neutralizeCsvFormula('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(neutralizeCsvFormula('\t=1+1')).toBe("'\t=1+1");
    expect(neutralizeCsvFormula('\r=1+1')).toBe("'\r=1+1");
  });
  it('leaves normal text and plain signed numbers alone', () => {
    expect(neutralizeCsvFormula('Vintage lamp')).toBe('Vintage lamp');
    expect(neutralizeCsvFormula('-5.00')).toBe('-5.00');
    expect(neutralizeCsvFormula('+12')).toBe('+12');
    expect(neutralizeCsvFormula('19.99')).toBe('19.99');
    expect(neutralizeCsvFormula('')).toBe('');
  });
  it('escapeCsvField neutralises first, then applies CSV quoting', () => {
    expect(escapeCsvField('=1+1,2')).toBe('"\'=1+1,2"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField(-5)).toBe('-5');
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField('line1\rline2')).toBe('"line1\rline2"');
  });
  it('neutralises hostile titles/memos in every export format', () => {
    const item: any = {
      id: 'i1', title: '=cmd|calc', sku: '@evil', description: '+bad', price: 10, condition: 'USED', category: '-cat',
      shippingAvailable: false, shippingPrice: null, status: 'AVAILABLE', photoUrls: [], updatedAt: new Date('2026-09-01T00:00:00Z'),
      stockTotal: 1, stockSold: 0, qrEmbedEnabled: true, qrAssetReady: true,
    };
    const org: any = { id: 'o', subscriptionTier: 'PRO', removeWatermarkEnabled: true };
    for (const format of ['ebay', 'amazon', 'facebook', 'quickbooks'] as const) {
      const csv = generateCsvExport([item], format, org, true);
      const dataLines = csv.split('\n').filter((l) => !l.startsWith('#INFO') && !l.startsWith('"#INFO'));
      const body = dataLines.slice(1).join('\n');
      // no cell may start with a formula trigger; the neutralising quote must be present instead
      expect(body).not.toMatch(/(^|,)[=@+]/m);
      expect(body).toContain("'");
    }
  });
});

describe('parseItemIdsParam', () => {
  it('treats absent / empty as "whole sale"', () => {
    expect(parseItemIdsParam(undefined)).toEqual({ ids: null });
    expect(parseItemIdsParam('')).toEqual({ ids: null });
    expect(parseItemIdsParam(',')).toEqual({ ids: null });
  });
  it('parses comma lists and repeated params, trims and dedupes', () => {
    expect(parseItemIdsParam('a1, b2,a1')).toEqual({ ids: ['a1', 'b2'] });
    expect(parseItemIdsParam(['a1', 'b2,c3'])).toEqual({ ids: ['a1', 'b2', 'c3'] });
  });
  it('rejects invalid ids, non-string entries, and lists over the cap', () => {
    expect(parseItemIdsParam("a1,'; DROP TABLE").code).toBe('INVALID_ITEM_IDS');
    expect(parseItemIdsParam([{ a: 1 } as any]).code).toBe('INVALID_ITEM_IDS');
    const tooMany = Array.from({ length: MAX_EXPORT_ITEM_IDS + 1 }, (_, i) => `id${i}`).join(',');
    expect(parseItemIdsParam(tooMany).code).toBe('TOO_MANY_ITEM_IDS');
  });
});

describe('getCsvExportHandler', () => {
  function mockRes() {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.setHeader = jest.fn();
    res.send = jest.fn();
    return res;
  }
  const req = (query: Record<string, unknown>, user: any = { id: 'u1', roles: ['ORGANIZER'] }) => ({ user, query } as any);
  const itemRow = { id: 'i1', title: 'Lamp', sku: null, description: '', price: 12, condition: 'USED', category: 'Decor', shippingAvailable: false, shippingPrice: null, status: 'AVAILABLE', photoUrls: [], updatedAt: new Date('2026-09-01T00:00:00Z'), stockTotal: 1, stockSold: 0, qrEmbedEnabled: true, qrAssetReady: true };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', subscriptionTier: 'PRO', removeWatermarkEnabled: false });
    mockPrisma.sale.findUnique.mockResolvedValue({ id: 'sale1', title: 'My Sale', organizerId: 'org1' });
    mockPrisma.item.findMany.mockResolvedValue([itemRow]);
  });

  it('honours itemIds and always scopes the query to the caller\'s sale', async () => {
    const res = mockRes();
    await getCsvExportHandler(req({ saleId: 'sale1', format: 'quickbooks', itemIds: 'i1,i2' }), res);
    const where = mockPrisma.item.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ saleId: 'sale1', id: { in: ['i1', 'i2'] } });
    expect(res.send).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
  });

  it('exports the whole sale when no itemIds are sent, and filters by status when asked', async () => {
    await getCsvExportHandler(req({ saleId: 'sale1', format: 'ebay' }), mockRes());
    expect(mockPrisma.item.findMany.mock.calls[0][0].where).toEqual({ saleId: 'sale1' });
    await getCsvExportHandler(req({ saleId: 'sale1', format: 'quickbooks', status: 'available' }), mockRes());
    expect(mockPrisma.item.findMany.mock.calls[1][0].where).toEqual({ saleId: 'sale1', status: 'AVAILABLE' });
  });

  it('400s bad itemIds / status before touching the database', async () => {
    const r1 = mockRes();
    await getCsvExportHandler(req({ saleId: 'sale1', format: 'quickbooks', itemIds: 'bad id!' }), r1);
    expect(r1.status).toHaveBeenCalledWith(400);
    const r2 = mockRes();
    await getCsvExportHandler(req({ saleId: 'sale1', format: 'quickbooks', status: 'HACKED' }), r2);
    expect(r2.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.organizer.findUnique).not.toHaveBeenCalled();
  });

  it('403s SIMPLE accounts with a TIER_REQUIRED code the UI can act on; a PRO tier with the lapse flag still passes (D1/D2)', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', subscriptionTier: 'SIMPLE', removeWatermarkEnabled: false });
    const r1 = mockRes();
    await getCsvExportHandler(req({ saleId: 'sale1', format: 'quickbooks' }), r1);
    expect(r1.status).toHaveBeenCalledWith(403);
    expect(r1.json.mock.calls[0][0]).toMatchObject({ code: 'TIER_REQUIRED', upgradeRequired: true });

    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', subscriptionTier: 'PRO', removeWatermarkEnabled: false });
    // 2026-09-29 lapse policy: PRO/TEAMS features remain until the subscription actually ends, and
    // Organizer.subscriptionTier is the truth (the end-of-period job rewrites it). The lapse flag alone
    // therefore does not lock a still-PRO organizer out; the request proceeds past the tier gate.
    const r2 = mockRes();
    await getCsvExportHandler(req({ saleId: 'sale1', format: 'quickbooks' }, { id: 'u1', roles: ['ORGANIZER'], subscriptionLapsed: true }), r2);
    const tierBlocked = r2.json.mock.calls.some((c: any[]) => c[0] && c[0].code === 'TIER_REQUIRED');
    expect(tierBlocked).toBe(false);
  });

  it('403s a sale owned by someone else', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue({ id: 'sale1', title: 'Theirs', organizerId: 'other' });
    const res = mockRes();
    await getCsvExportHandler(req({ saleId: 'sale1', format: 'quickbooks', itemIds: 'i1' }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockPrisma.item.findMany).not.toHaveBeenCalled();
  });

  it('404s NO_ITEMS when a filtered export matches nothing, but keeps the unfiltered behaviour', async () => {
    mockPrisma.item.findMany.mockResolvedValue([]);
    const filtered = mockRes();
    await getCsvExportHandler(req({ saleId: 'sale1', format: 'quickbooks', itemIds: 'ghost' }), filtered);
    expect(filtered.status).toHaveBeenCalledWith(404);
    expect(filtered.json.mock.calls[0][0].code).toBe('NO_ITEMS');
    const unfiltered = mockRes();
    await getCsvExportHandler(req({ saleId: 'sale1', format: 'quickbooks' }), unfiltered);
    expect(unfiltered.send).toHaveBeenCalled();
  });

  it('403s a non-organizer', async () => {
    const res = mockRes();
    await getCsvExportHandler(req({ saleId: 'sale1', format: 'quickbooks' }, { id: 's1', roles: ['USER'] }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
