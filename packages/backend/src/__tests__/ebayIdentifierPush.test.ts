/**
 * brand / mpn / upc / ean / isbn edit sync to a live eBay listing (2026-10-11). Fixed fixtures only: mocked fetch, no
 * network, no eBay write API, no paid calls. Same harness as ebayFccIdPush.test.ts. NOT EXECUTED when written (jest cannot
 * run on the authoring device); CI is the first real run.
 */

const mockPrisma: any = {
  item: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  organizer: { findUnique: jest.fn() },
  itemCard: { findUnique: jest.fn() },
  itemMarketplacePush: { create: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
};
const mockRefreshToken = jest.fn();
const mockHeal = jest.fn();
const mockEnsureCondition = jest.fn();
const mockAspects = jest.fn();

jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../controllers/ebayController', () => ({
  refreshEbayAccessToken: (...a: unknown[]) => mockRefreshToken(...a),
  resyncItemShippingPolicy: jest.fn(),
}));
jest.mock('../services/ebayPublishService', () => ({
  ebayPublishWithSelfHeal: (...a: unknown[]) => mockHeal(...a),
  ensureConditionValidForCategory: (...a: unknown[]) => mockEnsureCondition(...a),
  getRequiredAspectsForCategory: (...a: unknown[]) => mockAspects(...a),
}));

import { computeEbayPushFields, pushItemToEbay, EBAY_PUSH_FIELDS } from '../services/ebayItemPushService';

const DNA = 'Does Not Apply';

const ITEM_ROW = (over: Record<string, unknown> = {}) => ({
  id: 'i1', title: 'Router', description: 'A router', price: 25, condition: 'USED', conditionGrade: 'B',
  brand: 'NewCo', mpn: 'Z9', upc: null, ean: null, isbn: null, fccId: null, category: 'Electronics', tags: [],
  ebayCategoryId: '44995', ebayCategoryName: 'Routers', ebayOfferId: 'offer1', ebayListingId: 'list1',
  ebayContentDirtyAt: null, status: 'AVAILABLE', ...over,
});

type FetchCall = { url: string; method: string; body?: any };
let fetchCalls: FetchCall[];
let offerCategory = '44995';
let liveProduct: Record<string, unknown>;
const LIVE_PRODUCT = () => ({
  title: 'Old', description: 'Old desc', epid: '777', imageUrls: ['https://img/1.jpg'],
  brand: 'Acme', mpn: 'X1',
  aspects: { Brand: ['Acme'], MPN: ['X1'], Color: ['Black'] } as Record<string, string[]>,
});

beforeEach(() => {
  jest.clearAllMocks();
  Object.values(mockPrisma).forEach((m: any) => Object.values(m).forEach((fn: any) => fn.mockReset?.()));
  mockPrisma.item.findUnique.mockResolvedValue(ITEM_ROW());
  mockPrisma.item.update.mockResolvedValue({});
  mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', ebayPolicyMapping: null });
  mockPrisma.itemCard.findUnique.mockResolvedValue(null);
  mockPrisma.itemMarketplacePush.create.mockResolvedValue({});
  mockPrisma.itemMarketplacePush.findMany.mockResolvedValue([]);
  mockPrisma.itemMarketplacePush.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.itemMarketplacePush.updateMany.mockResolvedValue({ count: 0 });
  mockRefreshToken.mockResolvedValue('tok');
  mockHeal.mockResolvedValue({ published: true, listingId: 'list1', offerId: 'offer1', lastErrorId: null, lastErrorMessage: null });
  mockEnsureCondition.mockImplementation(async (c: string) => c);
  mockAspects.mockResolvedValue([{ name: 'Brand', required: true }, { name: 'MPN', required: false }]);
  offerCategory = '44995';
  liveProduct = LIVE_PRODUCT();
  fetchCalls = [];
  (global as any).fetch = jest.fn(async (url: string, init: any) => {
    const call: FetchCall = { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body) : undefined };
    fetchCalls.push(call);
    const path = decodeURIComponent(url.split('path=')[1] ?? '');
    if (call.method === 'GET' && path.includes('/offer/')) {
      return { ok: true, status: 200, json: async () => ({ sku: 'FAS-i1 2026-10-04', categoryId: offerCategory, pricingSummary: { price: { value: '20', currency: 'USD' } } }) };
    }
    if (call.method === 'GET' && path.includes('/inventory_item/')) {
      return { ok: true, status: 200, json: async () => ({ product: JSON.parse(JSON.stringify(liveProduct)), condition: 'USED_GOOD' }) };
    }
    return { ok: true, status: 204, json: async () => ({}) };
  });
});

const invPut = () => fetchCalls.find((c) => c.method === 'PUT' && decodeURIComponent(c.url).includes('/inventory_item/'));
const push = (fields: any[], trigger: 'SAVE' | 'REPUSH' = 'SAVE') => pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger, fields });

describe('computeEbayPushFields: identifiers', () => {
  it('brand, mpn, upc, ean and isbn are push fields', () => {
    for (const f of ['brand', 'mpn', 'upc', 'ean', 'isbn']) expect((EBAY_PUSH_FIELDS as readonly string[]).includes(f)).toBe(true);
  });
  it('a changed or added value triggers a push (compared after trimming)', () => {
    expect(computeEbayPushFields({ brand: 'Acme' }, { brand: 'NewCo' })).toEqual(['brand']);
    expect(computeEbayPushFields({ mpn: null }, { mpn: ' Z9 ' })).toEqual(['mpn']);
    expect(computeEbayPushFields({ upc: null, ean: null }, { upc: '012345678905', ean: '4006381333931' })).toEqual(['upc', 'ean']);
    expect(computeEbayPushFields({ isbn: null }, { isbn: '9781234567897' })).toEqual(['isbn']);
  });
  it('a clear is a change (upc / ean are removed, the rest are reported)', () => {
    expect(computeEbayPushFields({ upc: '012345678905' }, { upc: null })).toEqual(['upc']);
    expect(computeEbayPushFields({ brand: 'Acme' }, { brand: '' })).toEqual(['brand']);
  });
  it('unchanged (after trimming), blank-to-blank and omitted values do not trigger a push', () => {
    expect(computeEbayPushFields({ brand: 'Acme', mpn: 'X1' }, { brand: ' Acme ', mpn: 'X1' })).toEqual([]);
    expect(computeEbayPushFields({ brand: null, upc: '' }, { brand: '', upc: null })).toEqual([]);
    expect(computeEbayPushFields({ brand: 'Acme' }, {})).toEqual([]);
  });
  it('identifiers are listed after fccId and before shipping', () => {
    expect(computeEbayPushFields({ price: 1, fccId: null, brand: null }, { price: 2, fccId: 'ABC123XYZ', brand: 'Acme' }, { shippingInputsChanged: true }))
      .toEqual(['price', 'fccId', 'brand', 'shipping']);
  });
});

describe('pushItemToEbay: identifiers', () => {
  it('brand-only edit: overwrites Brand, keeps MPN, Color, epid and images, republishes once, hands isbn to the healer', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(ITEM_ROW({ brand: 'NewCo', mpn: null, isbn: '9781234567897' }));
    const out = await push(['brand']);
    expect(out.status).toBe('SUCCESS');
    expect(out.fieldsPushed).toEqual(['brand']);
    const body = invPut()?.body.product;
    expect(body.brand).toBe('NewCo');
    expect(body.aspects).toEqual({ Brand: ['NewCo'], MPN: ['X1'], Color: ['Black'] });
    expect(body.mpn).toBe('X1');
    expect(body.epid).toBe('777');
    expect(body.imageUrls).toEqual(['https://img/1.jpg']);
    expect(body.title).toBe('Old'); // a brand-only push does not touch title or description
    expect(mockHeal).toHaveBeenCalledTimes(1);
    expect(mockHeal.mock.calls[0][0].item).toMatchObject({ brand: 'NewCo', mpn: null, isbn: '9781234567897' });
  });

  it('mpn edit replaces Does Not Apply in product.mpn and the MPN aspect', async () => {
    liveProduct = { ...LIVE_PRODUCT(), mpn: DNA, aspects: { Brand: ['Acme'], MPN: [DNA] } };
    const out = await push(['mpn']);
    expect(out.status).toBe('SUCCESS');
    expect(invPut()?.body.product.mpn).toBe('Z9');
    expect(invPut()?.body.product.aspects).toEqual({ Brand: ['Acme'], MPN: ['Z9'] });
  });

  it('brand set on a listing with no MPN: MPN Does Not Apply is added so the republish does not hit 25002 BrandMPN', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(ITEM_ROW({ brand: 'NewCo', mpn: null }));
    liveProduct = { title: 'Old', aspects: { Color: ['Black'] } };
    const out = await push(['brand']);
    expect(out.status).toBe('SUCCESS');
    expect(invPut()?.body.product).toMatchObject({ brand: 'NewCo', mpn: DNA, aspects: { Color: ['Black'], Brand: ['NewCo'], MPN: [DNA] } });
  });

  it('mpn cleared while a Brand exists writes Does Not Apply', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(ITEM_ROW({ mpn: null }));
    const out = await push(['mpn']);
    expect(out.status).toBe('SUCCESS');
    expect(invPut()?.body.product.mpn).toBe(DNA);
    expect(invPut()?.body.product.aspects.MPN).toEqual([DNA]);
  });

  it('mpn cleared with no Brand: removed when the category does not require MPN', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(ITEM_ROW({ brand: null, mpn: null }));
    liveProduct = { title: 'Old', mpn: 'X1', aspects: { MPN: ['X1'], Color: ['Black'] } };
    const out = await push(['mpn']);
    expect(out.status).toBe('SUCCESS');
    expect('mpn' in invPut()?.body.product).toBe(false);
    expect(invPut()?.body.product.aspects).toEqual({ Color: ['Black'] });
  });

  it('mpn cleared with no Brand: left untouched and reported when the category requires MPN', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(ITEM_ROW({ brand: null, mpn: null }));
    mockAspects.mockResolvedValue([{ name: 'MPN', required: true }]);
    liveProduct = { title: 'Old', mpn: 'X1', aspects: { MPN: ['X1'] } };
    const out = await push(['mpn']);
    expect(out.status).toBe('FAILED');
    expect(out.errorCode).toBe('MPN_CLEAR_SKIPPED');
    expect(invPut()).toBeUndefined();
    expect(mockHeal).not.toHaveBeenCalled();
  });

  it('brand cleared: eBay\'s Brand is never deleted, nothing is sent, and the outcome says so', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(ITEM_ROW({ brand: null }));
    const out = await push(['brand']);
    expect(out.status).toBe('FAILED');
    expect(out.errorCode).toBe('BRAND_CLEAR_SKIPPED');
    expect(out.fieldsPushed).toEqual([]);
    expect(out.errorMessage).toMatch(/Brand/);
    expect(invPut()).toBeUndefined();
    expect(mockHeal).not.toHaveBeenCalled();
  });

  it('brand cleared together with a title edit: the title still pushes (PARTIAL) and Brand stays on eBay', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(ITEM_ROW({ brand: null }));
    const out = await push(['title', 'brand']);
    expect(out.status).toBe('PARTIAL');
    expect(out.fieldsPushed).toEqual(['title']);
    expect(out.errorCode).toBe('BRAND_CLEAR_SKIPPED');
    expect(invPut()?.body.product.title).toBe('Router');
    expect(invPut()?.body.product.brand).toBe('Acme');
    expect(invPut()?.body.product.aspects.Brand).toEqual(['Acme']);
  });

  it('upc and ean are added as one-element arrays', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(ITEM_ROW({ upc: ' 012345678905 ', ean: '4006381333931' }));
    const out = await push(['upc', 'ean']);
    expect(out.status).toBe('SUCCESS');
    expect(invPut()?.body.product.upc).toEqual(['012345678905']);
    expect(invPut()?.body.product.ean).toEqual(['4006381333931']);
  });

  it('clearing upc and ean deletes them from the listing', async () => {
    liveProduct = { ...LIVE_PRODUCT(), upc: ['012345678905'], ean: ['4006381333931'] };
    const out = await push(['upc', 'ean']);
    expect(out.status).toBe('SUCCESS');
    expect('upc' in invPut()?.body.product).toBe(false);
    expect('ean' in invPut()?.body.product).toBe(false);
    expect(mockHeal).toHaveBeenCalledTimes(1);
  });

  it('isbn on a Books listing sets product.isbn and the ISBN aspect', async () => {
    offerCategory = '261186';
    mockPrisma.item.findUnique.mockResolvedValue(ITEM_ROW({ isbn: '9781234567897', ebayCategoryId: '261186' }));
    liveProduct = { ...LIVE_PRODUCT(), isbn: ['9780000000002'], aspects: { Brand: ['Acme'], MPN: ['X1'], ISBN: ['9780000000002'] } };
    const out = await push(['isbn']);
    expect(out.status).toBe('SUCCESS');
    expect(invPut()?.body.product.isbn).toEqual(['9781234567897']);
    expect(invPut()?.body.product.aspects.ISBN).toEqual(['9781234567897']);
  });

  it('isbn cleared on a Books listing is skipped and reported (ISBN is required there)', async () => {
    offerCategory = '261186';
    mockPrisma.item.findUnique.mockResolvedValue(ITEM_ROW({ isbn: null, ebayCategoryId: '261186' }));
    liveProduct = { ...LIVE_PRODUCT(), isbn: ['9780000000002'], aspects: { ISBN: ['9780000000002'] } };
    const out = await push(['isbn']);
    expect(out.status).toBe('FAILED');
    expect(out.errorCode).toBe('ISBN_CLEAR_SKIPPED');
    expect(invPut()).toBeUndefined();
  });

  it('values already identical on eBay: no PUT and no republish, field counts as done', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(ITEM_ROW({ brand: 'Acme', mpn: 'X1' }));
    const out = await push(['brand', 'mpn']);
    expect(out.status).toBe('SUCCESS');
    expect(out.fieldsAttempted).toEqual(['brand', 'mpn']);
    expect(out.fieldsPushed).toEqual([]); // nothing was sent, so nothing is reported as pushed
    expect(fetchCalls.filter((c) => c.method !== 'GET')).toHaveLength(0);
    expect(mockHeal).not.toHaveBeenCalled();
  });

  it('existing aspects that are not identifiers survive an identifier push', async () => {
    liveProduct = { ...LIVE_PRODUCT(), aspects: { brand: ['Acme'], MPN: ['X1'], Color: ['Black'], Size: ['L'], 'FCC ID': ['A1B2C3D4E5'] } };
    const out = await push(['brand']);
    expect(out.status).toBe('SUCCESS');
    expect(invPut()?.body.product.aspects).toEqual({ brand: ['NewCo'], MPN: ['X1'], Color: ['Black'], Size: ['L'], 'FCC ID': ['A1B2C3D4E5'] });
  });

  it('a full "Update eBay now" field list with identifiers makes one inventory PUT and one republish', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(ITEM_ROW({ upc: '012345678905' }));
    const out = await push(['title', 'description', 'condition', 'price', 'brand', 'mpn', 'upc'], 'REPUSH');
    expect(out.status).toBe('SUCCESS');
    expect(fetchCalls.filter((c) => c.method === 'PUT' && decodeURIComponent(c.url).includes('/inventory_item/'))).toHaveLength(1);
    expect(invPut()?.body.product).toMatchObject({ brand: 'NewCo', mpn: 'Z9', upc: ['012345678905'] });
    expect(mockHeal).toHaveBeenCalledTimes(1);
  });
});
