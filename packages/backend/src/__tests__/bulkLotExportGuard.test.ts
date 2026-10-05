/**
 * ADR-136 Addendum C (roadmap #659): every export, feed and platform send LEAVES BULK LOTS OUT and says so.
 * Covers the pure guard (partition, headers, messages, platform refusal), the controller-facing filter (fails closed
 * with the flag on, open with it off) and a real export handler (the CSV export) with a lot in the sale. No network,
 * no real database.
 */
jest.mock('../index', () => ({ prisma: require('./__fixtures__/exportMocks').mockPrisma }));
jest.mock('../utils/cloudinaryWatermark', () => ({
  getWatermarkedUrl: (u: string) => u,
  getWatermarkedUrlWithQR: (u: string) => u,
  ensureQrCodeAsset: jest.fn().mockResolvedValue(undefined),
}));

import {
  BULK_LOT_EXPORT_REASON,
  allLotsMessage,
  lotRefusalForPlatform,
  partitionBulkLots,
  skippedLotsHeaders,
  skippedLotsSummary,
} from '../services/bulkLot/bulkLotExportGuard';
import { filterBulkLotsForExport, marketplaceLotRefusal } from '../services/bulkLot/bulkLotExportFilter';
import { getCsvExportHandler } from '../controllers/csvExportController';
import { mockPrisma } from './__fixtures__/exportMocks';

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());

const lotDb = (lotIds: string[]) => ({ itemBulkLot: { findMany: async (args: any) => lotIds.filter((id) => args.where.itemId.in.includes(id)).map((itemId) => ({ itemId })) } });
const brokenDb = { itemBulkLot: { findMany: async () => { throw new Error('table missing'); } } };

function mockRes() {
  const res: any = { headers: {} as Record<string, string> };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn((k: string, v: string) => { res.headers[k] = v; });
  res.send = jest.fn();
  return res;
}

const flagOn = () => { process.env.CARD_BULK_LOTS_ENABLED = 'true'; };
const flagOff = () => { delete process.env.CARD_BULK_LOTS_ENABLED; };
afterEach(flagOff);

describe('partitionBulkLots and the messages', () => {
  const items = [{ id: 'a', title: 'Lamp' }, { id: 'lot1', title: 'Bulk commons' }, { id: 'b', title: 'Vase' }];

  it('keeps ordinary items in order and skips lots with a plain reason', async () => {
    const r = await partitionBulkLots(lotDb(['lot1']), items, true);
    expect(r.kept.map((i) => i.id)).toEqual(['a', 'b']);
    expect(r.skipped).toEqual([{ itemId: 'lot1', title: 'Bulk commons', reason: BULK_LOT_EXPORT_REASON }]);
    expect(skippedLotsSummary(r.skipped)).toBe('1 bulk lot was left out of this export. Bulk lots are sold by the card at your counter and on your storefront.');
  });

  it('does nothing when there are no lots (and does not query for an empty list)', async () => {
    const none = await partitionBulkLots(lotDb([]), items, true);
    expect(none.kept).toHaveLength(3);
    expect(none.skipped).toEqual([]);
    expect(skippedLotsSummary([])).toBeNull();
    expect(skippedLotsHeaders([])).toEqual({});
    expect((await partitionBulkLots(brokenDb, [], true)).kept).toEqual([]);
  });

  it('fails closed with the flag on and open with it off when the lookup breaks', async () => {
    await expect(partitionBulkLots(brokenDb, items, true)).rejects.toMatchObject({ code: 'BULK_CHECK_FAILED' });
    const open = await partitionBulkLots(brokenDb, items, false);
    expect(open.kept).toHaveLength(3);
  });

  it('puts the skipped count in response headers and exposes them to the browser', () => {
    const headers = skippedLotsHeaders([{ itemId: 'x', title: 't', reason: 'r' }, { itemId: 'y', title: 't', reason: 'r' }]);
    expect(headers['X-Skipped-Bulk-Lots']).toBe('2');
    expect(headers['Access-Control-Expose-Headers']).toContain('X-Skipped-Bulk-Lots');
    expect(headers['X-Skipped-Bulk-Lots-Reason']).not.toContain(',');
  });

  it('every sentence follows the copy rules', () => {
    const texts = [
      BULK_LOT_EXPORT_REASON,
      allLotsMessage([{ itemId: 'x', title: 't', reason: 'r' }]),
      allLotsMessage([{ itemId: 'x', title: 't', reason: 'r' }, { itemId: 'y', title: 't', reason: 'r' }]),
      skippedLotsSummary([{ itemId: 'x', title: 't', reason: 'r' }]) as string,
      skippedLotsHeaders([{ itemId: 'x', title: 't', reason: 'r' }])['X-Skipped-Bulk-Lots-Reason'],
    ];
    for (const t of texts) {
      expect(t).not.toMatch(/[–—]/);
      expect(t).not.toMatch(/\bAI\b/);
      expect(t).not.toMatch(/estate sale/i);
    }
  });
});

describe('lotRefusalForPlatform', () => {
  it('says plainly that a lot cannot be listed and what to do instead', async () => {
    const r = await lotRefusalForPlatform(lotDb(['lot1']), 'Etsy', ['lot1'], true);
    expect(r).toEqual({
      status: 409,
      code: 'BULK_LOT_NOT_SUPPORTED',
      message: 'Bulk lots cannot be listed on Etsy. They are sold by the card at your counter and on your storefront, and by the bundle on eBay.',
    });
    expect(r!.message).not.toMatch(/[–—]/);
  });
  it('lets ordinary items through, refuses (503) on a failed check with the flag on, passes with it off', async () => {
    expect(await lotRefusalForPlatform(lotDb(['lot1']), 'Etsy', ['plain'], true)).toBeNull();
    expect(await lotRefusalForPlatform(lotDb([]), 'Etsy', [], true)).toBeNull();
    expect(await lotRefusalForPlatform(brokenDb, 'Etsy', ['x'], true)).toMatchObject({ status: 503, code: 'BULK_CHECK_FAILED' });
    expect(await lotRefusalForPlatform(brokenDb, 'Etsy', ['x'], false)).toBeNull();
  });
});

describe('filterBulkLotsForExport', () => {
  const items = [{ id: 'a', title: 'Lamp' }, { id: 'lot1', title: 'Bulk commons' }];

  it('returns the kept items and marks the response', async () => {
    const res = mockRes();
    const split = await filterBulkLotsForExport(items, res, lotDb(['lot1']));
    expect(split!.kept.map((i) => i.id)).toEqual(['a']);
    split!.markResponse(res);
    expect(res.headers['X-Skipped-Bulk-Lots']).toBe('1');
  });

  it('answers 400 when every item is a lot, and does not export', async () => {
    const res = mockRes();
    const split = await filterBulkLotsForExport([items[1]], res, lotDb(['lot1']));
    expect(split).toBeNull();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0]).toMatchObject({ code: 'BULK_LOTS_NOT_EXPORTED' });
  });

  it('with the flag on a failed check answers 503 and exports nothing; with it off the export goes ahead', async () => {
    flagOn();
    const res = mockRes();
    expect(await filterBulkLotsForExport(items, res, brokenDb)).toBeNull();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json.mock.calls[0][0].code).toBe('BULK_CHECK_FAILED');
    flagOff();
    const res2 = mockRes();
    const split = await filterBulkLotsForExport(items, res2, brokenDb);
    expect(split!.kept).toHaveLength(2);
    expect(res2.status).not.toHaveBeenCalled();
  });

  it('marketplaceLotRefusal uses the same rules with an injected client', async () => {
    flagOn();
    expect(await marketplaceLotRefusal('Shopify', ['lot1'], lotDb(['lot1']))).toMatchObject({ status: 409, code: 'BULK_LOT_NOT_SUPPORTED' });
    expect(await marketplaceLotRefusal('Shopify', ['a'], lotDb(['lot1']))).toBeNull();
    expect(await marketplaceLotRefusal('Shopify', ['a'], brokenDb)).toMatchObject({ status: 503 });
  });
});

describe('the CSV export handler leaves lots out', () => {
  const row = (id: string, title: string) => ({ id, title, sku: null, description: '', price: 12, condition: 'USED', category: 'Decor', shippingAvailable: false, shippingPrice: null, status: 'AVAILABLE', photoUrls: [], updatedAt: new Date('2026-09-01T00:00:00Z'), stockTotal: 1, stockSold: 0, qrEmbedEnabled: true, qrAssetReady: true });
  const req = (query: Record<string, unknown>) => ({ user: { id: 'u1', roles: ['ORGANIZER'] }, query } as any);

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', subscriptionTier: 'PRO', removeWatermarkEnabled: false });
    mockPrisma.sale.findUnique.mockResolvedValue({ id: 'sale1', title: 'My Sale', organizerId: 'org1' });
    mockPrisma.item.findMany.mockResolvedValue([row('i1', 'Table lamp'), row('lot1', 'Bulk commons lot')]);
    mockPrisma.itemBulkLot.findMany.mockImplementation(async (args: any) => (args.where.itemId.in.includes('lot1') ? [{ itemId: 'lot1' }] : []));
  });

  it.each(['ebay', 'amazon', 'facebook', 'quickbooks'])('%s export has the lamp, not the lot, and says one lot was left out', async (format) => {
    flagOn();
    const res = mockRes();
    await getCsvExportHandler(req({ saleId: 'sale1', format }), res);
    expect(res.send).toHaveBeenCalledTimes(1);
    const csv = res.send.mock.calls[0][0] as string;
    expect(csv.includes('Table lamp') || csv.includes('i1,SellerSKU')).toBe(true); // the lamp (Amazon rows carry the id, not the title)
    expect(csv).not.toContain('lot1');
    expect(csv).not.toContain('Bulk commons lot');
    expect(res.headers['X-Skipped-Bulk-Lots']).toBe('1');
  });

  it('works the same with the lot flag off (lots made while it was on must never leak)', async () => {
    const res = mockRes();
    await getCsvExportHandler(req({ saleId: 'sale1', format: 'quickbooks' }), res);
    expect(res.send.mock.calls[0][0]).not.toContain('Bulk commons lot');
    expect(res.headers['X-Skipped-Bulk-Lots']).toBe('1');
  });

  it('a sale of only lots answers 400 and sends no file', async () => {
    mockPrisma.item.findMany.mockResolvedValue([row('lot1', 'Bulk commons lot')]);
    const res = mockRes();
    await getCsvExportHandler(req({ saleId: 'sale1', format: 'quickbooks' }), res);
    expect(res.send).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].code).toBe('BULK_LOTS_NOT_EXPORTED');
  });

  it('with the flag on and a failed lookup nothing is exported', async () => {
    flagOn();
    mockPrisma.itemBulkLot.findMany.mockRejectedValue(new Error('down'));
    const res = mockRes();
    await getCsvExportHandler(req({ saleId: 'sale1', format: 'quickbooks' }), res);
    expect(res.send).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('a sale with no lots exports exactly as before and sets no skip headers', async () => {
    mockPrisma.itemBulkLot.findMany.mockResolvedValue([]);
    const res = mockRes();
    await getCsvExportHandler(req({ saleId: 'sale1', format: 'quickbooks' }), res);
    expect(res.send).toHaveBeenCalledTimes(1);
    expect(res.headers['X-Skipped-Bulk-Lots']).toBeUndefined();
  });
});
