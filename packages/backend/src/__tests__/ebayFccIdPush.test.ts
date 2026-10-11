/**
 * FCC ID edit sync to a live eBay listing (2026-10-11). Fixed fixtures only: no network, no eBay write API, no
 * paid calls. Covers computeEbayPushFields (fccId edit triggers a push), the shared aspect helper, and
 * pushItemToEbay (aspect added only when the category supports it, empty sends nothing, lookup failure is non-fatal
 * and the other fields still push, existing aspects are preserved).
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
import { applyFccIdAspect, findFccAspectName } from '../utils/ebayFccAspect';

const FCC_SPEC = [{ name: 'Brand' }, { name: 'FCC ID' }];
const NO_FCC_SPEC = [{ name: 'Brand' }, { name: 'Color' }];

const ITEM_ROW = (over: Record<string, unknown> = {}) => ({
  id: 'i1', title: 'Router', description: 'A router', price: 25, condition: 'USED', conditionGrade: 'B',
  brand: 'Acme', mpn: null, fccId: 'ABC123XYZ', category: 'Electronics', tags: [],
  ebayCategoryId: '44995', ebayCategoryName: 'Routers', ebayOfferId: 'offer1', ebayListingId: 'list1',
  ebayContentDirtyAt: null, ...over,
});

type FetchCall = { url: string; method: string; body?: any };
let fetchCalls: FetchCall[];
const OFFER = () => ({ sku: 'FAS-i1 2026-10-04', categoryId: '44995', pricingSummary: { price: { value: '20', currency: 'USD' } } });
const INVENTORY = () => ({ product: { title: 'Old', description: 'Old desc', aspects: { Brand: ['Acme'], Color: ['Black'] } }, condition: 'USED_GOOD' });

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
  mockAspects.mockResolvedValue(FCC_SPEC);
  fetchCalls = [];
  (global as any).fetch = jest.fn(async (url: string, init: any) => {
    const call: FetchCall = { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body) : undefined };
    fetchCalls.push(call);
    const path = decodeURIComponent(url.split('path=')[1] ?? '');
    if (call.method === 'GET' && path.includes('/offer/')) return { ok: true, status: 200, json: async () => OFFER() };
    if (call.method === 'GET' && path.includes('/inventory_item/')) return { ok: true, status: 200, json: async () => INVENTORY() };
    return { ok: true, status: 204, json: async () => ({}) };
  });
});

const invPut = () => fetchCalls.find((c) => c.method === 'PUT' && decodeURIComponent(c.url).includes('/inventory_item/'));

describe('computeEbayPushFields: fccId', () => {
  it('fccId is a push field', () => {
    expect((EBAY_PUSH_FIELDS as readonly string[]).includes('fccId')).toBe(true);
  });
  it('adding or changing a non-empty fccId triggers a push', () => {
    expect(computeEbayPushFields({ fccId: null }, { fccId: 'ABC123XYZ' })).toEqual(['fccId']);
    expect(computeEbayPushFields({ fccId: 'OLD111AAA' }, { fccId: 'abc-123 xyz' })).toEqual(['fccId']);
  });
  it('an unchanged, cleared or omitted fccId does not trigger a push', () => {
    expect(computeEbayPushFields({ fccId: 'ABC123XYZ' }, { fccId: 'ABC123XYZ' })).toEqual([]);
    expect(computeEbayPushFields({ fccId: 'ABC123XYZ' }, { fccId: null })).toEqual([]);
    expect(computeEbayPushFields({ fccId: 'ABC123XYZ' }, { fccId: '  ' })).toEqual([]);
    expect(computeEbayPushFields({ fccId: 'ABC123XYZ' }, {})).toEqual([]);
  });
});

describe('applyFccIdAspect (shared helper)', () => {
  const lookup = async () => FCC_SPEC;
  it('adds the aspect under the taxonomy spelling when the category supports it', async () => {
    const a: Record<string, string[]> = {};
    expect(await applyFccIdAspect(a, 'abc123xyz', '44995', lookup, { overwrite: true })).toMatchObject({ status: 'applied' });
    expect(a).toEqual({ 'FCC ID': ['ABC123XYZ'] });
  });
  it('adds nothing when the category has no FCC ID aspect', async () => {
    const a: Record<string, string[]> = {};
    expect((await applyFccIdAspect(a, 'ABC123XYZ', '1', async () => NO_FCC_SPEC, { overwrite: true })).status).toBe('unsupported');
    expect(a).toEqual({});
  });
  it('empty or junk input sends nothing and does not even look the category up', async () => {
    const spy = jest.fn(lookup);
    for (const v of ['', '   ', null, undefined, '!!!', 42]) {
      expect((await applyFccIdAspect({}, v, '1', spy, { overwrite: true })).status).toBe('empty');
    }
    expect(spy).not.toHaveBeenCalled();
  });
  it('a lookup that throws or returns null is reported, never thrown', async () => {
    expect((await applyFccIdAspect({}, 'ABC123XYZ', '1', async () => { throw new Error('boom'); }, { overwrite: true })).status).toBe('lookup_failed');
    expect((await applyFccIdAspect({}, 'ABC123XYZ', '1', async () => null, { overwrite: true })).status).toBe('lookup_failed');
  });
  it('publish mode keeps an existing key; push mode replaces it and reports unchanged for the same value', async () => {
    const keep = { 'FCC ID': ['KEEP00001'] };
    expect((await applyFccIdAspect(keep, 'ABC123XYZ', '1', lookup, { overwrite: false })).status).toBe('kept_existing');
    expect(keep).toEqual({ 'FCC ID': ['KEEP00001'] });
    const rep = { 'fcc id': ['OLD111AAA'] };
    expect((await applyFccIdAspect(rep, 'ABC123XYZ', '1', lookup, { overwrite: true })).status).toBe('applied');
    expect(rep).toEqual({ 'fcc id': ['ABC123XYZ'] });
    expect((await applyFccIdAspect(rep, 'ABC123XYZ', '1', lookup, { overwrite: true })).status).toBe('unchanged');
  });
  it('findFccAspectName is a case-insensitive exact name match', () => {
    expect(findFccAspectName([{ name: ' fcc id ' }])).toBe(' fcc id ');
    expect(findFccAspectName([{ name: 'FCC ID Number' }])).toBeNull();
    expect(findFccAspectName(null)).toBeNull();
  });
});

describe('pushItemToEbay: fccId', () => {
  it('adds the FCC ID aspect, keeps existing aspects, and republishes', async () => {
    const out = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'SAVE', fields: ['fccId'] });
    expect(out.status).toBe('SUCCESS');
    expect(out.fieldsPushed).toEqual(['fccId']);
    expect(invPut()?.body.product.aspects).toEqual({ Brand: ['Acme'], Color: ['Black'], 'FCC ID': ['ABC123XYZ'] });
    expect(invPut()?.body.product.title).toBe('Old'); // title/description untouched by an fccId-only push
    expect(mockHeal).toHaveBeenCalledTimes(1);
  });

  it('category without an FCC ID aspect: no inventory PUT, no republish, field counts as done', async () => {
    mockAspects.mockResolvedValue(NO_FCC_SPEC);
    const out = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'SAVE', fields: ['fccId'] });
    expect(out.status).toBe('SUCCESS');
    expect(invPut()).toBeUndefined();
    expect(mockHeal).not.toHaveBeenCalled();
  });

  it('empty stored fccId: nothing attempted, no eBay call', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(ITEM_ROW({ fccId: '' }));
    const out = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'SAVE', fields: ['fccId'] });
    expect(out.fieldsAttempted).toEqual([]);
    expect(fetchCalls).toHaveLength(0);
    expect(mockAspects).not.toHaveBeenCalled();
  });

  it('aspect already carrying the same value: no PUT, no republish', async () => {
    (global as any).fetch.mockImplementation(async (url: string, init: any) => {
      const path = decodeURIComponent(url.split('path=')[1] ?? '');
      const method = init?.method ?? 'GET';
      fetchCalls.push({ url, method });
      if (method === 'GET' && path.includes('/offer/')) return { ok: true, status: 200, json: async () => OFFER() };
      if (method === 'GET') return { ok: true, status: 200, json: async () => ({ product: { aspects: { 'FCC ID': ['ABC123XYZ'] } } }) };
      return { ok: true, status: 204, json: async () => ({}) };
    });
    const out = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'SAVE', fields: ['fccId'] });
    expect(out.status).toBe('SUCCESS');
    expect(invPut()).toBeUndefined();
    expect(mockHeal).not.toHaveBeenCalled();
  });

  it('taxonomy lookup failure is non-fatal: the other fields still push, fccId is reported not pushed', async () => {
    mockAspects.mockRejectedValue(new Error('taxonomy down'));
    const out = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'SAVE', fields: ['title', 'fccId'] });
    expect(out.status).toBe('PARTIAL');
    expect(out.fieldsPushed).toEqual(['title']);
    expect(out.errorCode).toBe('FCC_ASPECT_LOOKUP_FAILED');
    expect(invPut()?.body.product.title).toBe('Router');
    expect(invPut()?.body.product.aspects['FCC ID']).toBeUndefined();
    expect(mockHeal).toHaveBeenCalledTimes(1);
  });

  it('title and fccId together go out in a single inventory PUT', async () => {
    const out = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'SAVE', fields: ['title', 'fccId'] });
    expect(out.status).toBe('SUCCESS');
    expect(fetchCalls.filter((c) => c.method === 'PUT')).toHaveLength(1);
    expect(invPut()?.body.product).toMatchObject({ title: 'Router', aspects: { 'FCC ID': ['ABC123XYZ'] } });
  });
});

describe('pushItemToEbay: fccId inside a full "Update eBay now" field list', () => {
  const FULL = ['title', 'description', 'condition', 'price', 'fccId'] as const;
  const liveInventory = (aspects: Record<string, string[]>) => {
    (global as any).fetch.mockImplementation(async (url: string, init: any) => {
      const path = decodeURIComponent(url.split('path=')[1] ?? '');
      const method = init?.method ?? 'GET';
      fetchCalls.push({ url, method, body: init?.body ? JSON.parse(init.body) : undefined });
      if (method === 'GET' && path.includes('/offer/')) return { ok: true, status: 200, json: async () => OFFER() };
      if (method === 'GET') return { ok: true, status: 200, json: async () => ({ product: { title: 'Old', description: 'Old', aspects }, condition: 'USED_GOOD' }) };
      return { ok: true, status: 204, json: async () => ({}) };
    });
  };

  it('FCC ID already on eBay with the same value: aspects are sent back unchanged, still one inventory PUT and one republish', async () => {
    liveInventory({ Brand: ['Acme'], 'FCC ID': ['ABC123XYZ'] });
    const out = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'REPUSH', fields: [...FULL] });
    expect(out.status).toBe('SUCCESS');
    expect(out.fieldsPushed).toEqual([...FULL]);
    expect(fetchCalls.filter((c) => c.method === 'PUT' && decodeURIComponent(c.url).includes('/inventory_item/'))).toHaveLength(1);
    expect(invPut()?.body.product.aspects).toEqual({ Brand: ['Acme'], 'FCC ID': ['ABC123XYZ'] });
    expect(mockHeal).toHaveBeenCalledTimes(1);
  });

  it('fccId requested alone with the same live value: no write of any kind (no PUT, no republish)', async () => {
    liveInventory({ 'FCC ID': ['ABC123XYZ'] });
    const out = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'REPUSH', fields: ['fccId'] });
    expect(out.status).toBe('SUCCESS');
    expect(fetchCalls.filter((c) => c.method !== 'GET')).toHaveLength(0);
    expect(mockHeal).not.toHaveBeenCalled();
  });

  it('a different live value is replaced inside the same single PUT', async () => {
    liveInventory({ Brand: ['Acme'], 'FCC ID': ['OLD111AAA'] });
    const out = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'REPUSH', fields: [...FULL] });
    expect(out.status).toBe('SUCCESS');
    expect(fetchCalls.filter((c) => c.method === 'PUT' && decodeURIComponent(c.url).includes('/inventory_item/'))).toHaveLength(1);
    expect(invPut()?.body.product.aspects['FCC ID']).toEqual(['ABC123XYZ']);
  });

  it('lookup failure inside a full push: PARTIAL, every other field still pushed, FCC ID untouched', async () => {
    liveInventory({ 'FCC ID': ['OLD111AAA'] });
    mockAspects.mockResolvedValue(null);
    const out = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'REPUSH', fields: [...FULL] });
    expect(out.status).toBe('PARTIAL');
    expect(out.fieldsPushed).toEqual(['title', 'description', 'condition', 'price']);
    expect(invPut()?.body.product.aspects['FCC ID']).toEqual(['OLD111AAA']);
  });
});
