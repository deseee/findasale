/**
 * exportEstatesalesCSV and the ebay/Commerce feed writers neutralise spreadsheet formulas in free text.
 * Prisma, watermark helpers and the export rate limiter are mocks. NOT EXECUTED when written.
 */
const mockSaleFindUnique = jest.fn();
jest.mock('../../lib/prisma', () => ({
  prisma: {
    sale: { findUnique: (...a: unknown[]) => mockSaleFindUnique(...a) },
    user: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue({}) },
  },
}));
jest.mock('../../utils/cloudinaryWatermark', () => ({
  getWatermarkedUrl: (u: string) => u,
  getWatermarkedUrlWithQR: (u: string) => u,
  ensureQrCodeAsset: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../services/exportRateLimitService', () => ({
  checkExportRateLimit: jest.fn().mockResolvedValue({ allowed: true, nextExportDate: null }),
  formatNextExportDate: jest.fn(() => ''),
}));

import * as fs from 'fs';
import * as path from 'path';
import { exportEstatesalesCSV } from '../exportController';

const mkRes = () => {
  const res: any = { sent: undefined as unknown };
  res.setHeader = jest.fn();
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn((body: unknown) => {
    res.sent = body;
    return res;
  });
  return res;
};

const sale = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  organizer: { userId: 'u1' },
  items: [
    {
      id: 'i1',
      title: '=HYPERLINK("http://evil","x")',
      price: 12.5,
      description: '-2+3 is not a lamp',
      category: 'furniture',
      condition: '+cmd|calc',
      photoUrls: ['https://res.cloudinary.com/demo/a,b.jpg'],
      shippingAvailable: true,
      shippingPrice: 5,
      qrEmbedEnabled: false,
      qrAssetReady: true,
    },
  ],
  ...over,
});

describe('exportEstatesalesCSV formula neutralisation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('prefixes formula-looking free text, keeps prices plain, and quotes a URL containing a comma', async () => {
    mockSaleFindUnique.mockResolvedValue(sale());
    const res = mkRes();
    await exportEstatesalesCSV({ params: { saleId: 's1' }, user: { id: 'u1', effectiveTier: 'PRO' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const csv = String(res.sent);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(csv).toContain("'-2+3 is not a lamp");
    expect(csv).toContain("'+cmd|calc");
    expect(csv).toContain('12.50');
    expect(csv).not.toContain("'12.50");
    expect(csv).toContain('"https://res.cloudinary.com/demo/a,b.jpg"');
  });
});

describe('ebayController / exportController source contracts', () => {
  // ebayController is too heavy to import in isolation (nothing in this repo imports it un-mocked), so
  // pin the shared writer at source level instead.
  const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

  it('generateEbayCsv routes every cell through csvCell', () => {
    const src = read('ebayController.ts');
    expect(src).toContain("import { csvCell } from '../utils/csvSafe'");
    expect(src).toContain('const escapeCsvValue = (value: string | number): string => csvCell(value);');
  });

  it('Commerce Manager feeds neutralise title, description and brand', () => {
    const src = read('exportController.ts');
    expect(src.match(/const title = csvCell\(stripHtml\(item\.title\)\);/g)?.length).toBe(2);
    expect(src.match(/csvCell\(brand\),/g)?.length).toBe(2);
  });
});
