/**
 * Label controller HTML escaping and page lockdown (hacker pass, HIGH finding).
 * NOT EXECUTED when written (jest cannot run on the authoring device); CI is the first real run.
 *
 * getSingleItemLabel and getSaleLabels interpolate organizer-typed text into HTML that headless Chrome renders.
 * These tests assert that titles, sale titles, decoded categories, conditions and ids reach page.setContent
 * escaped, that JavaScript is disabled and request interception only lets data: and about:blank through, and
 * that the inline QR image still reaches the HTML.
 */
export {};

// `var` (not `const`): jest.mock factories are hoisted above these declarations.
var mockPrisma: any = {
  item: { findUnique: jest.fn() },
  sale: { findUnique: jest.fn() },
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

var mockResolveOwner: any = jest.fn();
jest.mock('../utils/itemOwner', () => ({ resolveItemOwnerOrganizer: (...args: any[]) => mockResolveOwner(...args) }));

var mockPage: any = {
  setJavaScriptEnabled: jest.fn(),
  setRequestInterception: jest.fn(),
  on: jest.fn(),
  setContent: jest.fn(),
  pdf: jest.fn(),
};
var mockBrowser: any = {
  newPage: jest.fn(),
  close: jest.fn(),
};
jest.mock('puppeteer', () => ({
  __esModule: true,
  default: { launch: jest.fn(async () => mockBrowser) },
}));

jest.mock('qrcode', () => ({
  __esModule: true,
  default: { toDataURL: jest.fn(async () => 'data:image/png;base64,QRPAYLOAD') },
}));

let controller: any;

const makeRes = () => {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((body: unknown) => {
    res.body = body;
    return res;
  });
  res.setHeader = jest.fn();
  res.end = jest.fn();
  return res;
};

const EVIL_TITLE = '<img src=x onerror=1>';
const EVIL_CATEGORY = '&lt;iframe src=http://x&gt;'; // stored entity-encoded; decodeCategory turns it into a tag
const EVIL_SALE = '"><script>alert(1)</script>';
const EVIL_CONDITION = "Good' onmouseover='x";

const sentHtml = (): string => mockPage.setContent.mock.calls[0][0] as string;

beforeAll(() => {
  controller = require('../controllers/labelController');
});

beforeEach(() => {
  jest.clearAllMocks();
  mockBrowser.newPage.mockReset().mockResolvedValue(mockPage);
  mockBrowser.close.mockReset().mockResolvedValue(undefined);
  mockPage.setJavaScriptEnabled.mockReset().mockResolvedValue(undefined);
  mockPage.setRequestInterception.mockReset().mockResolvedValue(undefined);
  mockPage.on.mockReset();
  mockPage.setContent.mockReset().mockResolvedValue(undefined);
  mockPage.pdf.mockReset().mockResolvedValue(Buffer.from('PDF'));
  mockResolveOwner.mockReset().mockResolvedValue({ id: 'org-1', userId: 'user-1' });
});

describe('getSingleItemLabel escaping', () => {
  const item = (over: Record<string, unknown> = {}) => ({
    id: 'item-1',
    title: EVIL_TITLE,
    price: 12.5,
    category: EVIL_CATEGORY,
    condition: EVIL_CONDITION,
    saleId: 'sale-1',
    organizerId: 'org-1',
    sale: { title: EVIL_SALE, organizer: { id: 'org-1', userId: 'user-1', subscriptionTier: 'SIMPLE', lat: null, lng: null } },
    ...over,
  });

  it('escapes the item title, sale title, decoded category and condition in the HTML given to setContent', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(item());
    const res = makeRes();
    await controller.getSingleItemLabel({ params: { id: 'item-1' }, user: { id: 'user-1' } }, res);

    expect(mockPage.setContent).toHaveBeenCalledTimes(1);
    const html = sentHtml();
    expect(html).toContain('&lt;img src=x onerror=1&gt;');
    expect(html).not.toContain('<img src=x onerror=1>');
    // the decoded category (a real tag after decodeCategory) is escaped again
    expect(html).toContain('&lt;iframe src=http://x&gt;');
    expect(html).not.toContain('<iframe');
    // sale title and condition
    expect(html).toContain('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script');
    expect(html).toContain('Good&#39; onmouseover=&#39;x');
    expect(html).not.toContain("onmouseover='x");
    // the only <img> tag left is the QR image carrying the data URL
    expect(html.match(/<img\b/g)).toHaveLength(1);
    expect(html).toContain('<img src="data:image/png;base64,QRPAYLOAD" alt="QR">');
    // numeric price formatting is unchanged
    expect(html).toContain('$12.50');
    expect(res.end).toHaveBeenCalled();
  });

  it('escapes the id interpolated into the label', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(item({ id: '<b>x</b>', sale: null, saleId: null, title: 'Plain' }));
    const res = makeRes();
    // the response headers are mocked here; only the HTML handed to setContent matters
    await controller.getSingleItemLabel({ params: { id: '<b>x</b>' }, user: { id: 'user-1' } }, res);
    const html = sentHtml();
    expect(html).toContain('ID: &lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>x</b>');
  });

  it('shows POA for a missing price and keeps plain text readable', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(item({ title: 'Oak Table & Chairs', price: null, category: null, condition: null, sale: null, saleId: null }));
    await controller.getSingleItemLabel({ params: { id: 'item-1' }, user: { id: 'user-1' } }, makeRes());
    const html = sentHtml();
    expect(html).toContain('Oak Table &amp; Chairs');
    expect(html).toContain('$POA');
    expect(html).not.toContain('label-chips">');
  });

  it('locks the page down before setContent: JavaScript off, interception on, only data: and about:blank allowed', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(item());
    await controller.getSingleItemLabel({ params: { id: 'item-1' }, user: { id: 'user-1' } }, makeRes());

    expect(mockPage.setJavaScriptEnabled).toHaveBeenCalledWith(false);
    expect(mockPage.setRequestInterception).toHaveBeenCalledWith(true);
    const jsOrder = mockPage.setJavaScriptEnabled.mock.invocationCallOrder[0];
    const interceptOrder = mockPage.setRequestInterception.mock.invocationCallOrder[0];
    const contentOrder = mockPage.setContent.mock.invocationCallOrder[0];
    expect(jsOrder).toBeLessThan(contentOrder);
    expect(interceptOrder).toBeLessThan(contentOrder);

    const requestCall = mockPage.on.mock.calls.find((c: any[]) => c[0] === 'request');
    expect(requestCall).toBeDefined();
    const handler = requestCall[1] as (r: any) => void;
    const fakeRequest = (url: string) => ({
      url: () => url,
      abort: jest.fn().mockResolvedValue(undefined),
      continue: jest.fn().mockResolvedValue(undefined),
    });
    for (const allowed of ['data:image/png;base64,AAAA', 'about:blank']) {
      const r = fakeRequest(allowed);
      handler(r);
      expect(r.continue).toHaveBeenCalled();
      expect(r.abort).not.toHaveBeenCalled();
    }
    for (const blocked of ['http://x/', 'https://evil.example/a.png', 'file:///etc/passwd', 'http://169.254.169.254/latest/meta-data/', 'ftp://x/']) {
      const r = fakeRequest(blocked);
      handler(r);
      expect(r.abort).toHaveBeenCalled();
      expect(r.continue).not.toHaveBeenCalled();
    }
  });

  it('still refuses a non-owner before any rendering', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(item());
    mockResolveOwner.mockResolvedValue(null);
    const res = makeRes();
    await controller.getSingleItemLabel({ params: { id: 'item-1' }, user: { id: 'user-2' } }, res);
    expect(res.statusCode).toBe(403);
    expect(mockPage.setContent).not.toHaveBeenCalled();
  });
});

describe('getSaleLabels escaping', () => {
  const sale = () => ({
    id: 'sale-1',
    title: EVIL_SALE,
    organizer: { userId: 'user-1' },
    items: [
      { id: 'i1', title: EVIL_TITLE, price: 5, category: EVIL_CATEGORY, condition: EVIL_CONDITION },
      { id: 'i2', title: 'Lamp', price: null, category: null, condition: null },
    ],
  });

  it('escapes sale title, item titles, decoded categories, conditions and ids on every label', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue(sale());
    const res = makeRes();
    await controller.getSaleLabels({ params: { saleId: 'sale-1' }, user: { id: 'user-1' } }, res);

    expect(mockPage.setContent).toHaveBeenCalledTimes(1);
    const html = sentHtml();
    expect(html).toContain('&lt;img src=x onerror=1&gt;');
    expect(html).not.toContain('<img src=x onerror=1>');
    expect(html).toContain('&lt;iframe src=http://x&gt;');
    expect(html).not.toContain('<iframe');
    expect(html).toContain('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script');
    expect(html).toContain('Good&#39; onmouseover=&#39;x');
    expect(html).toContain('ID: i1');
    expect(html).toContain('Lamp');
    expect(html).toContain('$POA');
    expect(html).toContain('$5.00');
    // exactly one <img> per item (the QR), each with the data URL intact
    expect(html.match(/<img\b/g)).toHaveLength(2);
    expect(html.match(/<img src="data:image\/png;base64,QRPAYLOAD" alt="QR">/g)).toHaveLength(2);
  });

  it('escapes an id interpolated into the sheet', async () => {
    const s = sale();
    s.items[1].id = '"><x>';
    mockPrisma.sale.findUnique.mockResolvedValue(s);
    await controller.getSaleLabels({ params: { saleId: 'sale-1' }, user: { id: 'user-1' } }, makeRes());
    const html = sentHtml();
    expect(html).toContain('ID: &quot;&gt;&lt;x&gt;');
    expect(html).not.toContain('<x>');
  });

  it('locks the page down before setContent', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue(sale());
    await controller.getSaleLabels({ params: { saleId: 'sale-1' }, user: { id: 'user-1' } }, makeRes());
    expect(mockPage.setJavaScriptEnabled).toHaveBeenCalledWith(false);
    expect(mockPage.setRequestInterception).toHaveBeenCalledWith(true);
    expect(mockPage.setJavaScriptEnabled.mock.invocationCallOrder[0]).toBeLessThan(mockPage.setContent.mock.invocationCallOrder[0]);
    expect(mockPage.setRequestInterception.mock.invocationCallOrder[0]).toBeLessThan(mockPage.setContent.mock.invocationCallOrder[0]);
    const requestCall = mockPage.on.mock.calls.find((c: any[]) => c[0] === 'request');
    const handler = requestCall[1] as (r: any) => void;
    const blockedReq = { url: () => 'http://evil.example/x', abort: jest.fn().mockResolvedValue(undefined), continue: jest.fn() };
    handler(blockedReq);
    expect(blockedReq.abort).toHaveBeenCalled();
    expect(blockedReq.continue).not.toHaveBeenCalled();
  });

  it('still refuses another organizer\'s sale', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue(sale());
    const res = makeRes();
    await controller.getSaleLabels({ params: { saleId: 'sale-1' }, user: { id: 'user-2' } }, res);
    expect(res.statusCode).toBe(403);
    expect(mockPage.setContent).not.toHaveBeenCalled();
  });
});
