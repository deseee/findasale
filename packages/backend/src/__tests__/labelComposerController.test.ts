/**
 * Label composer: card style and the four defect fixes (ADR-134 section 6.3 and 6.5, batch B6).
 * NOT EXECUTED when written (jest cannot run on the authoring device); CI is the first real run.
 * Prisma, puppeteer and qrcode are mocked. The controller is required inside beforeAll (after the
 * mocks are assigned) because it warms a puppeteer browser at import time.
 */
export {};

// `var` (not `const`): jest.mock factories are hoisted above these declarations.
var mockPrisma: any = {
  sale: { findUnique: jest.fn() },
  item: { findMany: jest.fn(), findFirst: jest.fn() },
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

var mockPage: any = {
  setContent: jest.fn(),
  pdf: jest.fn(),
  close: jest.fn(),
};
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

jest.mock('qrcode', () => ({
  __esModule: true,
  default: { toDataURL: jest.fn(async () => 'data:image/png;base64,AAAA') },
}));

let controller: any;

beforeAll(() => {
  mockPage.setContent.mockResolvedValue(undefined);
  mockPage.pdf.mockResolvedValue(Buffer.from('%PDF-test'));
  mockPage.close.mockResolvedValue(undefined);
  mockBrowser.newPage.mockResolvedValue(mockPage);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  controller = require('../controllers/labelComposerController');
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

function saleOwnedBy(userId: string, title = 'Spring Sale') {
  return {
    id: 'sale1',
    title,
    startDate: new Date('2026-04-17T12:00:00Z'),
    endDate: new Date('2026-04-19T12:00:00Z'),
    organizer: { userId },
  };
}

const CARD_ROW = {
  cardName: 'Black Lotus',
  setCode: 'lea',
  collectorNumber: '232',
  finish: 'NONFOIL',
  conditionCode: null,
  grader: 'PSA',
  grade: '10',
};

beforeEach(() => {
  mockPrisma.sale.findUnique.mockReset();
  mockPrisma.item.findMany.mockReset();
  mockPrisma.item.findFirst.mockReset();
  mockPage.setContent.mockClear();
  mockPage.pdf.mockClear();
  mockBrowser.newPage.mockClear();
  mockPrisma.sale.findUnique.mockResolvedValue(saleOwnedBy('u1'));
});

async function createBatch(userId: string, body: any) {
  const res = makeRes();
  await controller.createLabelBatch(organizerReq(userId, { body }), res);
  return res;
}

async function printBatch(userId: string, batchId: string) {
  const res = makeRes();
  await controller.printLabelBatch(organizerReq(userId, { params: { batchId } }), res);
  return res;
}

function lastHtml(): string {
  const calls = mockPage.setContent.mock.calls;
  return calls[calls.length - 1][0] as string;
}

describe('createLabelBatch: sale and item access (defect 1, IDOR)', () => {
  it('rejects a sale the caller does not own', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue(saleOwnedBy('someone-else'));
    const res = await createBatch('u1', { items: [{ qty: 1, source: { kind: 'item', itemId: 'i1' } }] });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockPrisma.item.findMany).not.toHaveBeenCalled();
  });

  it('scopes the item lookup to the authorized sale', async () => {
    mockPrisma.item.findMany.mockResolvedValue([
      { id: 'i1', title: 'Mine', price: 5, roomTag: null, card: null },
    ]);
    await createBatch('u1', { items: [{ qty: 1, source: { kind: 'item', itemId: 'i1' } }] });
    const arg = mockPrisma.item.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ id: { in: ['i1'] }, saleId: 'sale1' });
  });

  it('returns 404 when an item id belongs to another sale or organizer (not found in this sale)', async () => {
    mockPrisma.item.findMany.mockResolvedValue([]); // the scoped query finds nothing
    const res = await createBatch('u1', { items: [{ qty: 1, source: { kind: 'item', itemId: 'other-orgs-item' } }] });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'ITEM_NOT_IN_SALE' }));
  });

  it('rejects the whole batch when only some item ids are in the sale', async () => {
    mockPrisma.item.findMany.mockResolvedValue([{ id: 'i1', title: 'Mine', price: 5, roomTag: null, card: null }]);
    const res = await createBatch('u1', {
      items: [
        { qty: 1, source: { kind: 'item', itemId: 'i1' } },
        { qty: 1, source: { kind: 'item', itemId: 'foreign' } },
      ],
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('createLabelBatch: price is read server-side (defect 2)', () => {
  it('ignores a client-sent price for item rows and uses the database price', async () => {
    mockPrisma.item.findMany.mockResolvedValue([{ id: 'i1', title: 'Mine', price: 12.5, roomTag: null, card: null }]);
    const res = await createBatch('u1', {
      items: [{ price: 0.01, qty: 2, source: { kind: 'item', itemId: 'i1' } }],
    });
    const payload = res.json.mock.calls[0][0];
    expect(payload.tags.map((t: any) => t.price)).toEqual([12.5, 12.5]);
  });

  it('ignores a client-sent name and room too (title and room come from the database)', async () => {
    mockPrisma.item.findMany.mockResolvedValue([{ id: 'i1', title: 'Real title', price: 3, roomTag: 'Garage', card: null }]);
    const res = await createBatch('u1', {
      items: [{ price: 3, qty: 1, name: 'Fake', room: 'Fake room', source: { kind: 'item', itemId: 'i1', name: 'Fake' } }],
    });
    const tag = res.json.mock.calls[0][0].tags[0];
    expect(tag.name).toBe('Real title');
    expect(tag.room).toBe('Garage');
  });

  it('keeps a null database price as null (prints PRICE?) and reports the item', async () => {
    mockPrisma.item.findMany.mockResolvedValue([{ id: 'i1', title: 'No price yet', price: null, roomTag: null, card: null }]);
    const res = await createBatch('u1', { items: [{ price: 99, qty: 1, source: { kind: 'item', itemId: 'i1' } }] });
    const payload = res.json.mock.calls[0][0];
    expect(payload.tags[0].price).toBeNull();
    expect(payload.priceMissingItemIds).toEqual(['i1']);
  });

  it('validates preset prices, which have no database row', async () => {
    for (const bad of [-1, 'abc', 1e9, null, undefined, Number.NaN]) {
      const res = await createBatch('u1', { items: [{ price: bad, qty: 1, source: { kind: 'preset' } }] });
      expect(res.status).toHaveBeenCalledWith(400);
    }
    const ok = await createBatch('u1', { items: [{ price: 2.5, qty: 3, source: { kind: 'preset' } }] });
    expect(ok.status).not.toHaveBeenCalled();
    expect(ok.json.mock.calls[0][0].tags.map((t: any) => t.price)).toEqual([2.5, 2.5, 2.5]);
  });

  it('rejects a malformed row and an unknown label style', async () => {
    const noSource = await createBatch('u1', { items: [{ price: 1, qty: 1 }] });
    expect(noSource.status).toHaveBeenCalledWith(400);
    const badStyle = await createBatch('u1', { labelStyle: 'fancy', items: [{ price: 1, qty: 1, source: { kind: 'preset' } }] });
    expect(badStyle.status).toHaveBeenCalledWith(400);
    const empty = await createBatch('u1', { items: [] });
    expect(empty.status).toHaveBeenCalledWith(400);
  });
});

describe('createLabelBatch: card style', () => {
  it('attaches the database card record for card items and leaves non-card items standard', async () => {
    mockPrisma.item.findMany.mockResolvedValue([
      { id: 'c1', title: 'Card item', price: 100, roomTag: null, card: CARD_ROW },
      { id: 'n1', title: 'Lamp', price: 4, roomTag: null, card: null },
    ]);
    const res = await createBatch('u1', {
      labelStyle: 'card',
      items: [
        { qty: 2, source: { kind: 'item', itemId: 'c1' } },
        { qty: 1, source: { kind: 'item', itemId: 'n1' } },
      ],
    });
    const payload = res.json.mock.calls[0][0];
    expect(payload.labelStyle).toBe('card');
    expect(payload.cardLabelCount).toBe(2);
    expect(payload.tags[0].card).toEqual(expect.objectContaining({ cardName: 'Black Lotus', grader: 'PSA', grade: '10' }));
    expect(payload.tags[2].card).toBeNull();
  });

  it('does not attach card data when the style is standard', async () => {
    mockPrisma.item.findMany.mockResolvedValue([{ id: 'c1', title: 'Card item', price: 100, roomTag: null, card: CARD_ROW }]);
    const res = await createBatch('u1', { items: [{ qty: 1, source: { kind: 'item', itemId: 'c1' } }] });
    expect(res.json.mock.calls[0][0].tags[0].card).toBeNull();
  });
});

describe('getItemsForLabels: card style listing', () => {
  it('lists items with a card record, including unpriced ones, and reports saleHasCards', async () => {
    mockPrisma.item.findMany.mockResolvedValue([
      { id: 'c1', sku: null, title: 'Card item', price: null, category: null, roomTag: null, stockTotal: 4, stockSold: 1, card: CARD_ROW },
    ]);
    mockPrisma.item.findFirst.mockResolvedValue({ id: 'c1' });
    const res = makeRes();
    await controller.getItemsForLabels(organizerReq('u1', { query: { style: 'card' } }), res);
    const where = mockPrisma.item.findMany.mock.calls[0][0].where;
    expect(where.saleId).toBe('sale1');
    expect(where.card).toEqual({ isNot: null });
    expect(where.price).toBeUndefined();
    const payload = res.json.mock.calls[0][0];
    expect(payload.saleHasCards).toBe(true);
    expect(payload.items[0].price).toBeNull();
    expect(payload.items[0].priceMissing).toBe(true);
    expect(payload.items[0].defaultQty).toBe(3); // stockTotal 4 minus stockSold 1
    // Label lines are built by the server so the browser never formats card text
    expect(payload.items[0].labelText).toEqual(
      expect.objectContaining({ price: 'PRICE?', priceMissing: true, name: 'Black Lotus', conditionLine: 'PSA 10' })
    );
  });

  it('default style keeps the priced-only filter and a default count of at least 1', async () => {
    mockPrisma.item.findMany.mockResolvedValue([
      { id: 'n1', sku: 'SKU1', title: 'Lamp', price: 4, category: null, roomTag: null, stockTotal: 1, stockSold: 1, card: null },
    ]);
    mockPrisma.item.findFirst.mockResolvedValue(null);
    const res = makeRes();
    await controller.getItemsForLabels(organizerReq('u1'), res);
    const where = mockPrisma.item.findMany.mock.calls[0][0].where;
    expect(where.price).toEqual({ not: null });
    expect(where.card).toBeUndefined();
    const payload = res.json.mock.calls[0][0];
    expect(payload.saleHasCards).toBe(false);
    expect(payload.items[0].defaultQty).toBe(1);
  });
});

describe('printLabelBatch: ownership (defect 3)', () => {
  it('returns 404 when a different organizer prints the batch', async () => {
    mockPrisma.item.findMany.mockResolvedValue([{ id: 'i1', title: 'Mine', price: 5, roomTag: null, card: null }]);
    const created = await createBatch('u1', { items: [{ qty: 1, source: { kind: 'item', itemId: 'i1' } }] });
    const batchId = created.json.mock.calls[0][0].batchId;

    const intruder = await printBatch('u2', batchId);
    expect(intruder.status).toHaveBeenCalledWith(404);
    expect(intruder.end).not.toHaveBeenCalled();
    expect(mockPage.setContent).not.toHaveBeenCalled();

    const owner = await printBatch('u1', batchId);
    expect(owner.status).not.toHaveBeenCalled();
    expect(owner.end).toHaveBeenCalled();
  });

  it('returns the same 404 for an unknown batch id', async () => {
    const res = await printBatch('u1', 'does-not-exist');
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 403 for a user without the organizer role', async () => {
    const res = makeRes();
    await controller.printLabelBatch(
      { user: { id: 'u1', roles: ['USER'], role: 'USER' }, params: { batchId: 'x' }, query: {}, body: {} },
      res
    );
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('printLabelBatch: HTML escaping (defect 4) and card labels', () => {
  it('escapes the sale title, item name and room tag in the label HTML', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue(saleOwnedBy('u1', '<img src=x onerror=alert(1)>'));
    mockPrisma.item.findMany.mockResolvedValue([
      { id: 'i1', title: '<script>alert(2)</script>', price: 5, roomTag: '"><svg onload=alert(3)>', card: null },
    ]);
    const created = await createBatch('u1', { items: [{ qty: 1, source: { kind: 'item', itemId: 'i1' } }] });
    await printBatch('u1', created.json.mock.calls[0][0].batchId);
    const html = lastHtml();
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<svg');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;script&gt;alert(2)&lt;/script&gt;');
    expect(html).toContain('&quot;&gt;&lt;svg onload=alert(3)&gt;');
  });

  it('prints a graded card label with PSA 10 and escapes a hostile card name', async () => {
    mockPrisma.item.findMany.mockResolvedValue([
      { id: 'c1', title: 'Title', price: 150, roomTag: null, card: { ...CARD_ROW, cardName: '<script>alert(1)</script>' } },
    ]);
    const created = await createBatch('u1', { labelStyle: 'card', items: [{ qty: 1, source: { kind: 'item', itemId: 'c1' } }] });
    await printBatch('u1', created.json.mock.calls[0][0].batchId);
    const html = lastHtml();
    expect(html).toContain('class="card-price">$150.00<');
    expect(html).toContain('PSA 10');
    expect(html).toContain('LEA #232');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<div class="label-sale">');
  });

  it('prints PRICE? for a card item with no price', async () => {
    mockPrisma.item.findMany.mockResolvedValue([
      { id: 'c1', title: 'Title', price: null, roomTag: null, card: { ...CARD_ROW, grader: null, grade: null, conditionCode: 'NM' } },
    ]);
    const created = await createBatch('u1', { labelStyle: 'card', items: [{ qty: 1, source: { kind: 'item', itemId: 'c1' } }] });
    await printBatch('u1', created.json.mock.calls[0][0].batchId);
    const html = lastHtml();
    expect(html).toContain('class="card-price">PRICE?<');
    expect(html).toContain('class="card-cond">NM<');
  });

  it('renders non-card items inside a card-style batch in the standard layout', async () => {
    mockPrisma.item.findMany.mockResolvedValue([
      { id: 'c1', title: 'Card item', price: 10, roomTag: null, card: CARD_ROW },
      { id: 'n1', title: 'Lamp', price: 4, roomTag: null, card: null },
    ]);
    const created = await createBatch('u1', {
      labelStyle: 'card',
      items: [
        { qty: 1, source: { kind: 'item', itemId: 'c1' } },
        { qty: 1, source: { kind: 'item', itemId: 'n1' } },
      ],
    });
    await printBatch('u1', created.json.mock.calls[0][0].batchId);
    const html = lastHtml();
    expect(html).toContain('class="card-price">$10.00<');
    expect(html).toContain('<div class="label-sale">Spring Sale</div>');
    expect(html).toContain('<div class="label-name">Lamp</div>');
  });
});
