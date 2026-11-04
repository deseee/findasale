/**
 * Security fix (2026-11-04, finding #38): the price sheet PDF interpolated the organizer-typed sale title raw
 * into HTML rendered by headless Chrome (--no-sandbox) with JavaScript on and no request blocking, so a sale
 * title could make the server fetch internal URLs.
 *
 * WHAT THIS PROVES
 *   - the sale title reaches page.setContent HTML-escaped
 *   - lockDownLabelPage runs BEFORE setContent: JavaScript off, request interception on, and only data:
 *     and about:blank requests are allowed through
 *   - the legit path still renders: the inline QR images are in the HTML and a PDF is sent
 *   - another organizer's sale is still refused (403) without launching the browser
 */
export {};

var mockPrisma: any = { sale: { findUnique: jest.fn() } };
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

var mockPage: any = {
  setJavaScriptEnabled: jest.fn(),
  setRequestInterception: jest.fn(),
  on: jest.fn(),
  setContent: jest.fn(),
  pdf: jest.fn(),
};
var mockBrowser: any = { newPage: jest.fn(), close: jest.fn() };
var mockLaunch: any = jest.fn(async () => mockBrowser);
jest.mock('puppeteer', () => ({ __esModule: true, default: { launch: (...a: any[]) => mockLaunch(...a) } }));
jest.mock('qrcode', () => ({
  __esModule: true,
  default: { toDataURL: jest.fn(async () => 'data:image/png;base64,QRPAYLOAD') },
}));

import { getPriceSheet } from '../controllers/printKitController';

const EVIL_SALE = '"><img src="http://169.254.169.254/latest"><script>fetch("http://internal")</script>';

const makeRes = () => {
  const res: any = { statusCode: 200, body: undefined };
  res.status = jest.fn((c: number) => { res.statusCode = c; return res; });
  res.json = jest.fn((b: unknown) => { res.body = b; return res; });
  res.setHeader = jest.fn();
  res.end = jest.fn();
  return res;
};
const req = (userId = 'user-1'): any => ({ user: { id: userId, role: 'ORGANIZER', roles: ['ORGANIZER'] }, params: { saleId: 'sale-1' } });

beforeEach(() => {
  jest.clearAllMocks();
  mockBrowser.newPage.mockResolvedValue(mockPage);
  mockBrowser.close.mockResolvedValue(undefined);
  mockPage.setJavaScriptEnabled.mockResolvedValue(undefined);
  mockPage.setRequestInterception.mockResolvedValue(undefined);
  mockPage.setContent.mockResolvedValue(undefined);
  mockPage.pdf.mockResolvedValue(Buffer.from('PDF'));
  mockPrisma.sale.findUnique.mockResolvedValue({ id: 'sale-1', title: EVIL_SALE, organizer: { userId: 'user-1' } });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('getPriceSheet', () => {
  it('escapes the sale title in the rendered HTML', async () => {
    const res = makeRes();
    await getPriceSheet(req(), res);
    const html = mockPage.setContent.mock.calls[0][0] as string;
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src="http://169.254.169.254');
    expect(html).toContain('&quot;&gt;&lt;img src=&quot;http://169.254.169.254/latest&quot;&gt;');
  });

  it('locks the page down before setContent and only lets data: and about:blank requests through', async () => {
    await getPriceSheet(req(), makeRes());
    expect(mockPage.setJavaScriptEnabled).toHaveBeenCalledWith(false);
    expect(mockPage.setRequestInterception).toHaveBeenCalledWith(true);
    expect(mockPage.setRequestInterception.mock.invocationCallOrder[0]).toBeLessThan(mockPage.setContent.mock.invocationCallOrder[0]);

    const handler = mockPage.on.mock.calls.find((c: any[]) => c[0] === 'request')[1];
    const mkReq = (url: string) => ({ url: () => url, continue: jest.fn(), abort: jest.fn() });
    const internal = mkReq('http://10.0.0.5/admin');
    const dataUrl = mkReq('data:image/png;base64,AAAA');
    handler(internal);
    handler(dataUrl);
    expect(internal.abort).toHaveBeenCalled();
    expect(internal.continue).not.toHaveBeenCalled();
    expect(dataUrl.continue).toHaveBeenCalled();
  });

  it('still renders a normal price sheet (legit path)', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue({ id: 'sale-1', title: 'Smith Family Sale', organizer: { userId: 'user-1' } });
    const res = makeRes();
    await getPriceSheet(req(), res);
    const html = mockPage.setContent.mock.calls[0][0] as string;
    expect(html).toContain('Smith Family Sale');
    expect(html).toContain('data:image/png;base64,QRPAYLOAD');
    expect(res.end).toHaveBeenCalledWith(Buffer.from('PDF'));
  });

  it("refuses another organizer's sale without launching the browser", async () => {
    const res = makeRes();
    await getPriceSheet(req('someone-else'), res);
    expect(res.statusCode).toBe(403);
    expect(mockLaunch).not.toHaveBeenCalled();
  });
});
