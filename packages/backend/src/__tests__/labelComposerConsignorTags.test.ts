/**
 * Label composer: consignor price tags (2026-10-06).
 * NOT EXECUTED when written (jest cannot run on the authoring device); CI is the first real run.
 * Same mocking style as labelComposerController.test.ts.
 */
export {};

var mockPrisma: any = {
  sale: { findUnique: jest.fn() },
  item: { findMany: jest.fn(), findFirst: jest.fn() },
  organizer: { findUnique: jest.fn() },
  organizerWorkspace: { findFirst: jest.fn() },
  consignor: { findFirst: jest.fn() },
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

var mockPage: any = { setContent: jest.fn(), pdf: jest.fn(), close: jest.fn() };
var mockBrowser: any = {
  isConnected: jest.fn(() => true),
  on: jest.fn(),
  newPage: jest.fn(),
  close: jest.fn(),
};
jest.mock('puppeteer', () => ({
  __esModule: true,
  default: { launch: jest.fn(async () => mockBrowser) },
}));

var mockToDataURL: any = jest.fn(async () => 'data:image/png;base64,AAAA');
jest.mock('qrcode', () => ({ __esModule: true, default: { toDataURL: mockToDataURL } }));

let controller: any;
const ORIGINAL_ENV = { ...process.env };

beforeAll(() => {
  mockPage.setContent.mockResolvedValue(undefined);
  mockPage.pdf.mockResolvedValue(Buffer.from('%PDF-test'));
  mockPage.close.mockResolvedValue(undefined);
  mockBrowser.newPage.mockResolvedValue(mockPage);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  controller = require('../controllers/labelComposerController');
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

function makeRes() {
  const res: any = { headersSent: false };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn();
  res.end = jest.fn();
  return res;
}

function organizerReq(userId: string, extra: any = {}) {
  return {
    user: { id: userId, roles: ['ORGANIZER'], role: 'ORGANIZER' },
    params: { saleId: 'sale1' },
    query: {},
    body: {},
    ...extra,
  };
}

function saleOwnedBy(userId: string) {
  return {
    id: 'sale1',
    title: 'Spring Sale',
    organizerId: 'org1',
    startDate: new Date('2026-04-17T12:00:00Z'),
    endDate: new Date('2026-04-19T12:00:00Z'),
    organizer: { userId },
  };
}

beforeEach(() => {
  for (const m of [
    mockPrisma.sale.findUnique,
    mockPrisma.item.findMany,
    mockPrisma.organizer.findUnique,
    mockPrisma.organizerWorkspace.findFirst,
    mockPrisma.consignor.findFirst,
    mockPage.setContent,
    mockPage.pdf,
    mockToDataURL,
  ]) {
    m.mockClear();
  }
  mockToDataURL.mockResolvedValue('data:image/png;base64,AAAA');
  mockPrisma.sale.findUnique.mockReset();
  mockPrisma.organizer.findUnique.mockReset();
  mockPrisma.organizerWorkspace.findFirst.mockReset();
  mockPrisma.consignor.findFirst.mockReset();
  mockPrisma.sale.findUnique.mockResolvedValue(saleOwnedBy('u1'));
  mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', subscriptionTier: 'TEAMS' });
  mockPrisma.organizerWorkspace.findFirst.mockResolvedValue({ id: 'ws1' });
  mockPrisma.consignor.findFirst.mockResolvedValue({ id: 'con1', archivedAt: null });
  process.env.POS_CONSIGNOR_TAGS_ENABLED = 'true';
  process.env.POS_TAG_SIGNING_SECRET = 'test-composer-secret';
  process.env.NODE_ENV = 'test';
});

async function createBatch(userId: string, body: any) {
  const res = makeRes();
  await controller.createLabelBatch(organizerReq(userId, { body }), res);
  return res;
}

async function printBatch(userId: string, batchId: string) {
  const res = makeRes();
  await controller.printLabelBatch(organizerReq(userId, { params: { saleId: 'sale1', batchId } }), res);
  return res;
}

const PRESET_ROW = { qty: 2, price: 5, source: { kind: 'preset' } };

describe('createLabelBatch: consignor gate order', () => {
  it('rejects a malformed consignorId with 400 CONSIGNOR_INVALID', async () => {
    const res = await createBatch('u1', { consignorId: 'bad id!', items: [PRESET_ROW] });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'CONSIGNOR_INVALID' }));
    expect(mockPrisma.consignor.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a non-string consignorId with 400', async () => {
    const res = await createBatch('u1', { consignorId: 42, items: [PRESET_ROW] });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('403 TEAMS_REQUIRED for a non-TEAMS organizer, before any consignor lookup', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', subscriptionTier: 'PRO' });
    const res = await createBatch('u1', { consignorId: 'con1', items: [PRESET_ROW] });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'TEAMS_REQUIRED' }));
    expect(mockPrisma.consignor.findFirst).not.toHaveBeenCalled();
  });

  it('503 when the feature flag is off', async () => {
    process.env.POS_CONSIGNOR_TAGS_ENABLED = 'false';
    const res = await createBatch('u1', { consignorId: 'con1', items: [PRESET_ROW] });
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'TAG_SIGNING_NOT_CONFIGURED' }));
  });

  it('503 in production with no signing secret (fail closed)', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.POS_TAG_SIGNING_SECRET;
    const res = await createBatch('u1', { consignorId: 'con1', items: [PRESET_ROW] });
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('404 for a consignor outside the sale owner workspace', async () => {
    mockPrisma.consignor.findFirst.mockResolvedValue(null);
    const res = await createBatch('u1', { consignorId: 'foreign', items: [PRESET_ROW] });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'CONSIGNOR_NOT_FOUND' }));
    expect(mockPrisma.consignor.findFirst.mock.calls[0][0].where).toEqual({ id: 'foreign', workspaceId: 'ws1' });
  });

  it('404 when the owner has no workspace at all', async () => {
    mockPrisma.organizerWorkspace.findFirst.mockResolvedValue(null);
    const res = await createBatch('u1', { consignorId: 'con1', items: [PRESET_ROW] });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('409 CONSIGNOR_ARCHIVED for an archived consignor', async () => {
    mockPrisma.consignor.findFirst.mockResolvedValue({ id: 'con1', archivedAt: new Date() });
    const res = await createBatch('u1', { consignorId: 'con1', items: [PRESET_ROW] });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'CONSIGNOR_ARCHIVED' }));
  });

  it('resolves the workspace from the SALE owner, not the caller', async () => {
    await createBatch('u1', { consignorId: 'con1', items: [PRESET_ROW] });
    expect(mockPrisma.organizer.findUnique.mock.calls[0][0].where).toEqual({ id: 'org1' });
  });

  it('a foreign sale is still 403 before any consignor work', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue(saleOwnedBy('someone-else'));
    const res = await createBatch('u1', { consignorId: 'con1', items: [PRESET_ROW] });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockPrisma.organizer.findUnique).not.toHaveBeenCalled();
  });
});

describe('createLabelBatch: tag price bounds', () => {
  it('rejects a $0.00 preset price when a consignor is chosen', async () => {
    const res = await createBatch('u1', { consignorId: 'con1', items: [{ qty: 1, price: 0, source: { kind: 'preset' } }] });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('accepts a normal preset price', async () => {
    const res = await createBatch('u1', { consignorId: 'con1', items: [PRESET_ROW] });
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(403);
  });
});

describe('printLabelBatch: QR payload', () => {
  async function createdBatchId(body: any): Promise<string> {
    const res = await createBatch('u1', body);
    const payload = res.json.mock.calls[0][0];
    return payload.batchId as string;
  }

  function qrUrls(): string[] {
    return mockToDataURL.mock.calls.map((c: any[]) => c[0] as string);
  }

  it('preset labels with a consignor carry c, n and s; QR uses level M, margin 4', async () => {
    const batchId = await createdBatchId({ consignorId: 'con1', items: [PRESET_ROW] });
    await printBatch('u1', batchId);
    const urls = qrUrls();
    expect(urls.length).toBeGreaterThanOrEqual(2);
    for (const u of urls) {
      const q = new URL(u).searchParams;
      expect(q.get('c')).toBe('con1');
      expect(q.get('n')).toBeTruthy();
      expect(q.get('s')).toBeTruthy();
    }
    const nonces = new Set(urls.map((u) => new URL(u).searchParams.get('n')));
    expect(nonces.size).toBe(urls.length); // one nonce per sticker
    const opts = mockToDataURL.mock.calls[0][1];
    expect(opts.errorCorrectionLevel).toBe('M');
    expect(opts.margin).toBe(4);
  });

  it('leftover-fill labels carry the consignor tag too', async () => {
    const batchId = await createdBatchId({ consignorId: 'con1', leftoverFill: 3, items: [PRESET_ROW] });
    await printBatch('u1', batchId);
    const urls = qrUrls();
    expect(urls.length).toBeGreaterThan(2);
    for (const u of urls) expect(new URL(u).searchParams.get('s')).toBeTruthy();
  });

  it('without a consignor the QR is the plain add-misc link (no c/n/s)', async () => {
    const batchId = await createdBatchId({ items: [PRESET_ROW] });
    await printBatch('u1', batchId);
    for (const u of qrUrls()) {
      const q = new URL(u).searchParams;
      expect(q.get('action')).toBe('add-misc');
      expect(q.get('c')).toBeNull();
      expect(q.get('s')).toBeNull();
    }
  });

  it('the printed signature verifies, and fails if the price is altered', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const svc = require('../services/consignorTagService');
    const batchId = await createdBatchId({ consignorId: 'con1', items: [{ qty: 1, price: 7.5, source: { kind: 'preset' } }] });
    await printBatch('u1', batchId);
    const q = new URL(qrUrls()[0]).searchParams;
    const fields = { saleId: 'sale1', consignorId: 'con1', priceCents: 750, nonce: q.get('n') };
    expect(svc.verifyTag({ ...fields, sig: q.get('s') })).toBe(true);
    expect(svc.verifyTag({ ...fields, priceCents: 75, sig: q.get('s') })).toBe(false);
  });

  it('a different organizer cannot print the batch (same 404 as a missing batch)', async () => {
    const batchId = await createdBatchId({ consignorId: 'con1', items: [PRESET_ROW] });
    const res = makeRes();
    await controller.printLabelBatch(
      { user: { id: 'u2', roles: ['ORGANIZER'], role: 'ORGANIZER' }, params: { saleId: 'sale1', batchId }, query: {}, body: {} },
      res
    );
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('an anonymous caller gets 403 from the organizer gate', async () => {
    const res = makeRes();
    await controller.createLabelBatch({ user: undefined, params: { saleId: 'sale1' }, query: {}, body: { items: [PRESET_ROW] } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
