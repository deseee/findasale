/**
 * eBay item push service (item editor unification, Wave 2: U1, U2, U4).
 * Covers: real-change diff, plan builders, sanitization, and pushItemToEbay (success, partial, failed, held,
 * not listed, history rows, prune-to-20, clearing the dirty flag and the hold, acknowledging covered failures).
 */

const mockPrisma: any = {
  item: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  organizer: { findUnique: jest.fn() },
  itemCard: { findUnique: jest.fn() },
  itemMarketplacePush: { create: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
};
const mockRefreshToken = jest.fn();
const mockResync = jest.fn();
const mockHeal = jest.fn();
const mockEnsureCondition = jest.fn();

jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../controllers/ebayController', () => ({
  refreshEbayAccessToken: (...a: unknown[]) => mockRefreshToken(...a),
  resyncItemShippingPolicy: (...a: unknown[]) => mockResync(...a),
}));
jest.mock('../services/ebayPublishService', () => ({
  ebayPublishWithSelfHeal: (...a: unknown[]) => mockHeal(...a),
  ensureConditionValidForCategory: (...a: unknown[]) => mockEnsureCondition(...a),
}));

import {
  computeEbayPushFields,
  buildEbayPlan,
  buildExtensionPlan,
  sanitizePushErrorMessage,
  pushItemToEbay,
  PUSH_HISTORY_LIMIT,
  INTERNAL_ERROR_TEXT,
} from '../services/ebayItemPushService';

const PRISMA_CONNECT_ERROR =
  "\nInvalid `prisma.item.findUnique()` invocation in\n/app/packages/backend/src/services/ebayItemPushService.ts:338:42\n\n" +
  "Can't reach database server at `db.example.invalid:5432`";

const ITEM_ROW = (over: Record<string, unknown> = {}) => ({
  id: 'i1',
  title: 'Brass Lamp',
  description: 'A lamp',
  price: 25,
  condition: 'USED',
  conditionGrade: 'B',
  brand: null,
  mpn: null,
  category: 'Home',
  tags: [],
  ebayCategoryId: '38220',
  ebayCategoryName: 'Lamps',
  ebayOfferId: 'offer1',
  ebayListingId: 'list1',
  ebayContentDirtyAt: null,
  ...over,
});

type FetchCall = { url: string; method: string; body?: any };
let fetchCalls: FetchCall[];
let fetchPlan: (call: FetchCall) => { ok: boolean; status: number; json?: any };

function installFetch() {
  fetchCalls = [];
  (global as any).fetch = jest.fn(async (url: string, init: any) => {
    const call: FetchCall = { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body) : undefined };
    fetchCalls.push(call);
    const r = fetchPlan(call);
    return { ok: r.ok, status: r.status, json: async () => r.json ?? {} };
  });
}

const OFFER = () => ({ sku: 'FAS-i1 2026-10-04', pricingSummary: { price: { value: '20', currency: 'USD' } } });
const INVENTORY = () => ({ product: { title: 'Old', description: 'Old desc', aspects: { Brand: ['Acme'] } }, condition: 'USED_GOOD' });

/** All eBay calls succeed. */
function happyFetch(call: FetchCall) {
  const path = decodeURIComponent(call.url.split('path=')[1] ?? '');
  if (call.method === 'GET' && path.includes('/offer/')) return { ok: true, status: 200, json: OFFER() };
  if (call.method === 'GET' && path.includes('/inventory_item/')) return { ok: true, status: 200, json: INVENTORY() };
  return { ok: true, status: 204 };
}

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
  mockRefreshToken.mockResolvedValue('tok_secret_value');
  mockResync.mockResolvedValue({ changed: true, reason: 'ok' });
  mockHeal.mockResolvedValue({ published: true, listingId: 'list1', offerId: 'offer1', lastErrorId: null, lastErrorMessage: null });
  mockEnsureCondition.mockImplementation(async (c: string) => c);
  fetchPlan = happyFetch;
  installFetch();
});

describe('computeEbayPushFields (real changes, not key presence)', () => {
  const existing = { title: 'Lamp', description: 'D', condition: 'USED', conditionGrade: 'C', price: 20 };

  it('returns nothing when every provided value equals the stored one', () => {
    expect(computeEbayPushFields(existing, { title: 'Lamp', description: 'D', condition: 'USED', conditionGrade: 'C', price: 20 })).toEqual([]);
    expect(computeEbayPushFields(existing, { price: '20.00' })).toEqual([]); // numeric string is the same price
    expect(computeEbayPushFields(existing, {})).toEqual([]);
  });

  it('returns only what changed', () => {
    expect(computeEbayPushFields(existing, { title: 'New', description: 'D', price: 20 })).toEqual(['title']);
    expect(computeEbayPushFields(existing, { price: 21 })).toEqual(['price']);
    expect(computeEbayPushFields(existing, { description: 'E' })).toEqual(['description']);
  });

  it('a price move under half a cent is not a change; a reopen re-sends the unchanged price', () => {
    expect(computeEbayPushFields(existing, { price: 20.004 })).toEqual([]);
    expect(computeEbayPushFields(existing, { price: 20 }, { priceReopen: true })).toEqual(['price']);
    expect(computeEbayPushFields(existing, {}, { priceReopen: true })).toEqual(['price']);
  });

  it('a cleared title or null price is never pushed', () => {
    expect(computeEbayPushFields(existing, { title: '', price: null })).toEqual([]);
  });

  it('condition: a condition change, or a grade change that moves the eBay enum, counts; a same-enum grade change does not', () => {
    expect(computeEbayPushFields(existing, { condition: 'NEW' })).toEqual(['condition']);
    expect(computeEbayPushFields(existing, { conditionGrade: 'A' })).toEqual(['condition']); // C (USED_GOOD) to A (USED_VERY_GOOD)
    expect(computeEbayPushFields({ ...existing, conditionGrade: 'A' }, { conditionGrade: 'B' })).toEqual([]); // both USED_VERY_GOOD
    expect(computeEbayPushFields({ ...existing, condition: null, conditionGrade: null }, { conditionGrade: 'A' })).toEqual([]); // no condition, nothing to push
  });

  it('shipping input changes add the shipping field', () => {
    expect(computeEbayPushFields(existing, {}, { shippingInputsChanged: true })).toEqual(['shipping']);
  });
});

describe('plan builders', () => {
  it('eBay plan: not listed, held, no offer id, no changes, will push', () => {
    expect(buildEbayPlan({ held: false, changedFields: ['price'] })).toEqual({ willPush: false, fields: [], reason: 'not_listed' });
    expect(buildEbayPlan({ ebayOfferId: 'o', held: true, changedFields: ['title'] })).toEqual({ willPush: false, fields: ['title'], reason: 'held' });
    expect(buildEbayPlan({ ebayListingId: 'l', held: false, changedFields: ['title'] })).toEqual({ willPush: false, fields: ['title'], reason: 'no_offer_id' });
    expect(buildEbayPlan({ ebayOfferId: 'o', held: false, changedFields: [] })).toEqual({ willPush: false, fields: [], reason: 'no_changes' });
    expect(buildEbayPlan({ ebayOfferId: 'o', held: false, changedFields: ['price', 'condition'] })).toEqual({ willPush: true, fields: ['price', 'condition'] });
  });

  it('extension plan is prompt-only and needs a relevant field', () => {
    expect(buildExtensionPlan(['VINTED', 'GUMTREE_AU'], ['price'])).toEqual([
      { platform: 'VINTED', message: 'Needs manual update on Vinted', fields: ['price'] },
      { platform: 'GUMTREE_AU', message: 'Needs manual update on Gumtree AU', fields: ['price'] },
    ]);
    expect(buildExtensionPlan(['VINTED'], ['shipping'])).toEqual([]);
    expect(buildExtensionPlan([], ['price'])).toEqual([]);
  });
});

describe('sanitizePushErrorMessage', () => {
  it('never echoes bearer tokens, auth headers, secrets, eBay tokens, URLs or raw JSON', () => {
    const dirty =
      'Failed: Authorization: Bearer v^1.1#i^1#r^0#abcdef0123456789abcdef0123456789 access_token=abc123secret ' +
      'X-Proxy-Secret: topsecret https://finda.sale/api/proxy/ebay?path=/sell/inventory/v1/offer/9 ' +
      '{"errors":[{"errorId":25002,"message":"bad","parameters":{"name":"x"}}]} ' +
      'ZmFrZWJhc2U2NHRva2VuZmFrZWJhc2U2NHRva2VuZmFrZWJhc2U2NA==';
    const out = sanitizePushErrorMessage(dirty) as string;
    expect(out).not.toMatch(/Bearer/i);
    expect(out).not.toContain('v^1.1');
    expect(out).not.toContain('abc123secret');
    expect(out).not.toContain('topsecret');
    expect(out).not.toContain('finda.sale/api');
    expect(out).not.toContain('errorId');
    expect(out).not.toMatch(/[{}]/);
    expect(out).not.toContain('ZmFrZWJhc2U2NHRva2Vu');
    expect(out.length).toBeLessThanOrEqual(500);
  });

  it('keeps a plain human message, truncates to 500, and returns null for empty or non-string input', () => {
    expect(sanitizePushErrorMessage('The item specific Size is missing.')).toBe('The item specific Size is missing.');
    expect(sanitizePushErrorMessage('x '.repeat(600))!.length).toBeLessThanOrEqual(500);
    expect(sanitizePushErrorMessage('')).toBeNull();
    expect(sanitizePushErrorMessage(null)).toBeNull();
    expect(sanitizePushErrorMessage({ token: 'abc' } as any)).toBeNull();
  });
});

describe('pushItemToEbay', () => {
  it('SUCCESS: pushes price and inventory fields, republishes, records one SAVE row, clears the dirty flag', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(ITEM_ROW({ ebayContentDirtyAt: new Date() }));
    const out = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'SAVE', fields: ['price', 'title', 'condition'], dirtyBefore: null });
    expect(out).toEqual({ status: 'SUCCESS', fieldsAttempted: ['price', 'title', 'condition'], fieldsPushed: ['price', 'title', 'condition'], errorCode: null, errorMessage: null });

    const puts = fetchCalls.filter((c) => c.method === 'PUT');
    expect(puts).toHaveLength(2);
    expect(puts[0].body.pricingSummary.price.value).toBe('25'); // offer price
    const inv = puts[1].body;
    expect(inv.product.title).toBe('Brass Lamp');
    expect(inv.condition).toBe('USED_VERY_GOOD'); // USED + grade B, unified table (the old condMap sent USED_GOOD)
    expect(mockEnsureCondition).toHaveBeenCalledWith('USED_VERY_GOOD', '38220'); // desired enum computed BEFORE the category remap
    expect(mockHeal).toHaveBeenCalledTimes(1);

    expect(mockPrisma.itemMarketplacePush.create).toHaveBeenCalledTimes(1);
    const row = mockPrisma.itemMarketplacePush.create.mock.calls[0][0].data;
    expect(row).toMatchObject({ itemId: 'i1', organizerId: 'org1', platform: 'EBAY', trigger: 'SAVE', status: 'SUCCESS', errorCode: null, errorMessage: null });
    expect(mockPrisma.item.updateMany).toHaveBeenCalledWith({
      where: { id: 'i1', OR: [{ ebayContentDirtyAt: null }, { ebayContentDirtyAt: { lte: expect.any(Date) } }] },
      data: { ebayContentDirtyAt: null },
    });
  });

  it('only the fields asked for are sent: a price-only push makes no inventory call', async () => {
    const out = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'SAVE', fields: ['price'] });
    expect(out.status).toBe('SUCCESS');
    expect(fetchCalls.filter((c) => c.url.includes('inventory_item'))).toHaveLength(0);
    expect(mockEnsureCondition).not.toHaveBeenCalled();
  });

  it('description gets the organizer template ({{DESCRIPTION}} replaced everywhere)', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', ebayPolicyMapping: { defaultDescriptionHtml: '<p>{{DESCRIPTION}}</p><hr>{{DESCRIPTION}}' } });
    await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'SAVE', fields: ['description'] });
    const inv = fetchCalls.find((c) => c.method === 'PUT' && c.url.includes('inventory_item'))!.body;
    expect(inv.product.description).toBe('<p>A lamp</p><hr>A lamp');
  });

  it('PARTIAL: price accepted but the inventory item PUT is rejected', async () => {
    fetchPlan = (call) => {
      const path = decodeURIComponent(call.url.split('path=')[1] ?? '');
      if (call.method === 'PUT' && path.includes('/inventory_item/')) return { ok: false, status: 400 };
      return happyFetch(call);
    };
    const out = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'SAVE', fields: ['price', 'title'] });
    expect(out.status).toBe('PARTIAL');
    expect(out.fieldsPushed).toEqual(['price']);
    expect(out.fieldsAttempted).toEqual(['price', 'title']);
    expect(out.errorCode).toBe('INVENTORY_PUT_FAILED');
    expect(out.errorMessage).toContain('HTTP_400');
    expect(mockPrisma.itemMarketplacePush.create.mock.calls[0][0].data.status).toBe('PARTIAL');
    // The dirty flag is NOT cleared: the title never reached eBay.
    expect(mockPrisma.item.update).not.toHaveBeenCalled();
    expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
  });

  it('FAILED: no eBay token', async () => {
    mockRefreshToken.mockResolvedValue(null);
    const out = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'SAVE', fields: ['title'] });
    expect(out).toMatchObject({ status: 'FAILED', fieldsPushed: [], errorCode: 'NO_TOKEN' });
    expect(fetchCalls).toHaveLength(0);
  });

  it('FAILED: the republish does not publish, and eBay text is sanitized (no token or raw payload echoed)', async () => {
    mockHeal.mockResolvedValue({
      published: false, listingId: null, offerId: 'offer1', lastErrorId: '25002',
      lastErrorMessage: 'Bad item. Authorization: Bearer v^1.1#i^1#secrettokenvalue1234567890123456 {"errors":[{"errorId":25002}]}',
    });
    const out = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'SAVE', fields: ['title', 'description'] });
    expect(out.status).toBe('FAILED');
    expect(out.fieldsPushed).toEqual([]); // content is live only once republished
    expect(out.errorCode).toBe('EBAY_25002');
    expect(out.errorMessage).not.toMatch(/Bearer|secrettoken|errorId|[{}]/);
    expect(out.errorMessage!.length).toBeLessThanOrEqual(500);
    const stored = mockPrisma.itemMarketplacePush.create.mock.calls[0][0].data;
    expect(stored.errorMessage).toBe(out.errorMessage);
  });

  it('FAILED: the offer GET fails, so nothing is sent', async () => {
    fetchPlan = (call) => (call.method === 'GET' ? { ok: false, status: 404 } : { ok: true, status: 204 });
    const out = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'SAVE', fields: ['price', 'title'] });
    expect(out).toMatchObject({ status: 'FAILED', errorCode: 'OFFER_GET_FAILED' });
    expect(fetchCalls.filter((c) => c.method === 'PUT')).toHaveLength(0);
  });

  it('FAILED: an exception inside the push is caught, recorded and sanitized (never thrown)', async () => {
    mockPrisma.organizer.findUnique.mockRejectedValue(new Error('db down Bearer abcdefabcdefabcdefabcdefabcdefab12'));
    const out = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'SAVE', fields: ['title'] });
    expect(out.status).toBe('FAILED');
    expect(out.errorCode).toBe('UNEXPECTED');
    expect(out.errorMessage).not.toMatch(/Bearer/i);
  });

  it('SKIPPED_HELD: records a row and makes no eBay call and no item read', async () => {
    const out = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'SAVE', fields: ['title', 'price'], hold: true });
    expect(out).toMatchObject({ status: 'SKIPPED_HELD', fieldsAttempted: ['title', 'price'], fieldsPushed: [], errorCode: 'HELD' });
    expect(fetchCalls).toHaveLength(0);
    expect(mockPrisma.item.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.itemMarketplacePush.create.mock.calls[0][0].data.status).toBe('SKIPPED_HELD');
  });

  it('SKIPPED_NOT_LISTED: recorded for REPUSH, not for SAVE', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(ITEM_ROW({ ebayOfferId: null, ebayListingId: null }));
    const save = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'SAVE', fields: ['title'] });
    expect(save.status).toBe('SKIPPED_NOT_LISTED');
    expect(mockPrisma.itemMarketplacePush.create).not.toHaveBeenCalled();
    const repush = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'REPUSH', fields: ['title'] });
    expect(repush.status).toBe('SKIPPED_NOT_LISTED');
    expect(mockPrisma.itemMarketplacePush.create).toHaveBeenCalledTimes(1);
    expect(fetchCalls).toHaveLength(0);
  });

  it('a listing without an offer id fails with NO_OFFER_ID', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(ITEM_ROW({ ebayOfferId: null }));
    const out = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'REPUSH', fields: ['title'] });
    expect(out).toMatchObject({ status: 'FAILED', errorCode: 'NO_OFFER_ID' });
  });

  it('prunes the item to its newest 20 rows on write', async () => {
    mockPrisma.itemMarketplacePush.findMany.mockResolvedValueOnce([{ id: 'old1' }, { id: 'old2' }]);
    await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'SAVE', fields: ['price'] });
    const pruneQuery = mockPrisma.itemMarketplacePush.findMany.mock.calls[0][0];
    expect(pruneQuery).toMatchObject({ where: { itemId: 'i1' }, orderBy: { createdAt: 'desc' }, skip: PUSH_HISTORY_LIMIT });
    expect(PUSH_HISTORY_LIMIT).toBe(20);
    expect(mockPrisma.itemMarketplacePush.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['old1', 'old2'] } } });
  });

  it('a failed history write never breaks the push', async () => {
    mockPrisma.itemMarketplacePush.create.mockRejectedValue(new Error('table missing'));
    const out = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'SAVE', fields: ['price'] });
    expect(out.status).toBe('SUCCESS');
  });

  it('REPUSH SUCCESS releases the hold; a SAVE success does not touch the hold columns', async () => {
    await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'REPUSH', fields: ['title', 'description', 'condition', 'price'] });
    expect(mockPrisma.item.updateMany).toHaveBeenCalledWith({
      where: { id: 'i1', OR: [{ lastEditedAt: null }, { lastEditedAt: { lte: expect.any(Date) } }] },
      data: { ebaySyncHeldAt: null, ebayHeldFields: [], ebayContentDirtyAt: null },
    });
    mockPrisma.item.updateMany.mockClear();
    await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'SAVE', fields: ['price'] });
    expect(mockPrisma.item.updateMany).not.toHaveBeenCalled(); // price only, nothing dirty
  });

  it('REPUSH PARTIAL keeps the hold', async () => {
    fetchPlan = (call) => (call.method === 'PUT' && call.url.includes('inventory_item') ? { ok: false, status: 500 } : happyFetch(call));
    const out = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'REPUSH', fields: ['title', 'price'] });
    expect(out.status).toBe('PARTIAL');
    const heldClears = mockPrisma.item.updateMany.mock.calls.filter((c: any) => 'ebaySyncHeldAt' in c[0].data);
    expect(heldClears).toHaveLength(0);
  });

  it('an already-dirty item is only cleared when all three content fields are pushed', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(ITEM_ROW({ ebayContentDirtyAt: new Date('2026-10-03') }));
    await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'SAVE', fields: ['description'], dirtyBefore: new Date('2026-10-03') });
    expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
    await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'SAVE', fields: ['title', 'description', 'condition'], dirtyBefore: new Date('2026-10-03') });
    expect(mockPrisma.item.updateMany).toHaveBeenCalledWith({
      where: { id: 'i1', OR: [{ ebayContentDirtyAt: null }, { ebayContentDirtyAt: { lte: expect.any(Date) } }] },
      data: { ebayContentDirtyAt: null },
    });
  });

  it('a success acknowledges earlier failed rows it fully covers (clears the list badge) and leaves others', async () => {
    mockPrisma.itemMarketplacePush.findMany
      .mockResolvedValueOnce([]) // prune query
      .mockResolvedValueOnce([
        { id: 'f1', fieldsAttempted: ['title'] },
        { id: 'f2', fieldsAttempted: ['title', 'condition'] },
      ]);
    await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'SAVE', fields: ['title'] });
    expect(mockPrisma.itemMarketplacePush.updateMany).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.itemMarketplacePush.updateMany.mock.calls[0][0];
    expect(arg.where.id.in).toEqual(['f1']);
    expect(arg.data.acknowledgedAt).toBeInstanceOf(Date);
  });

  it('shipping: runs the policy resync without the offer GET, and a resync error fails only that field', async () => {
    const ok = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'SAVE', fields: ['shipping'] });
    expect(ok).toMatchObject({ status: 'SUCCESS', fieldsPushed: ['shipping'] });
    expect(fetchCalls).toHaveLength(0);
    expect(mockResync).toHaveBeenCalledWith('i1');
    mockResync.mockRejectedValue(new Error('boom'));
    const bad = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'SAVE', fields: ['shipping'] });
    expect(bad).toMatchObject({ status: 'FAILED', errorCode: 'SHIPPING_RESYNC_FAILED' });
  });
});


// ---------------------------------------------------------------------------------------------
// Wave 2 hacker pass: regression tests for the fixes.
describe('hacker pass: sanitizePushErrorMessage', () => {
  const PRISMA_CONNECT =
    "\nInvalid `prisma.item.findUnique()` invocation in\n/app/packages/backend/src/services/ebayItemPushService.ts:338:42\n\n" +
    "  335 \n\u2192 338 const item = await prisma.item.findUnique({\n\nCan't reach database server at `db.example.invalid:5432`";

  it('a database client error, stack frame, SQL or server path is replaced wholesale, never partly echoed', () => {
    const shapes = [
      PRISMA_CONNECT,
      'PrismaClientKnownRequestError: Unique constraint failed on the fields: (`itemId`)',
      'Error: boom\n    at Object.<anonymous> (/app/dist/x.js:10:5)',
      'failed at pushItemToEbay (/srv/api/dist/services/ebayItemPushService.js:338:42)',
      'SELECT * FROM "Item" WHERE id = $1',
      'insert into failed: INSERT INTO "ItemMarketplacePush" ("id") VALUES ($1)',
      'ENOENT: open C:\\Users\\app\\secret.json',
      'code P2002 on the item table',
    ];
    for (const raw of shapes) expect(sanitizePushErrorMessage(raw)).toBe(INTERNAL_ERROR_TEXT);
  });

  it('keeps ordinary English that merely contains select, from, update or at', () => {
    expect(sanitizePushErrorMessage('Please select a category from the list.')).toBe('Please select a category from the list.');
    expect(sanitizePushErrorMessage('Add at least (1) photo and update the title.')).toBe('Add at least (1) photo and update the title.');
  });

  it('removes every URI scheme, not only http(s): a database URL with a password never survives', () => {
    // Fixture URLs are assembled from parts so no connection-string literal sits in the source.
    const dbUrl = ['postgres', 'ql://', 'user', ':hunter2@', 'db.example.invalid', ':5432/appdb'].join('');
    const cacheUrl = ['red', 'is://', ':s3cret@', '10.0.0.5', ':6379/0'].join('');
    const out = sanitizePushErrorMessage('connect ECONNREFUSED ' + dbUrl) as string;
    expect(out).not.toMatch(/hunter2|example|postgres|5432/);
    expect(sanitizePushErrorMessage('cache down: ' + cacheUrl)).not.toMatch(/s3cret|10\.0\.0\.5|6379/);
  });

  it('removes user:password@host, IP addresses and host:port pairs', () => {
    expect(sanitizePushErrorMessage('login failed for admin:pa55w0rd@db.internal')).not.toMatch(/pa55w0rd/);
    const out = sanitizePushErrorMessage('connect ECONNREFUSED 10.0.0.1:443 and db.internal.example.com:5432') as string;
    expect(out).not.toMatch(/10\.0\.0\.1|5432|443/);
    expect(out).toContain('ECONNREFUSED');
  });

  it('removes bare token and secret keys, quoted passwords with spaces, and a whole cookie list', () => {
    expect(sanitizePushErrorMessage('bad request token=abc123 and refresh_token = zzz999')).not.toMatch(/abc123|zzz999/);
    expect(sanitizePushErrorMessage('password: "my secret pass phrase" rejected')).not.toMatch(/secret pass|phrase/);
    expect(sanitizePushErrorMessage('x-proxy-secret: hunter2 more words')).not.toContain('hunter2');
    const cookie = sanitizePushErrorMessage('Cookie: session=abc; csrf=def; theme=dark') as string;
    expect(cookie).not.toMatch(/session=|csrf=|theme=|abc|def/);
    expect(sanitizePushErrorMessage('Set-Cookie: sid=abc123; Path=/; HttpOnly')).not.toMatch(/abc123/);
    expect(sanitizePushErrorMessage('authorization: Digest username="x", response="abc"')).not.toMatch(/Digest|username/);
  });

  it('a Bearer eBay user token is removed whole (no v^1.1 tail left behind)', () => {
    const out = sanitizePushErrorMessage('Authorization: Bearer v^1.1#i^1#r^0#abc... was rejected. Reconnect eBay') as string;
    expect(out).toBe('[redacted] was rejected. Reconnect eBay');
    expect(sanitizePushErrorMessage('Bearer abc.def-ghi== failed. Try again')).toBe('[redacted] failed. Try again');
  });

  it('strips control and bidirectional-override characters', () => {
    const out = sanitizePushErrorMessage('\u202eevil\u200b text\u0000 here\u2066') as string;
    expect(out).toBe('evil text here');
  });

  it('never exceeds 500 characters and is never an object dump', () => {
    expect((sanitizePushErrorMessage('word '.repeat(400)) as string).length).toBeLessThanOrEqual(500);
    expect(sanitizePushErrorMessage({ token: 'abc' } as any)).toBeNull();
  });
});

describe('hacker pass: pushItemToEbay', () => {
  it('a database failure inside the push is recorded as a generic message: no host, port, path or code', async () => {
    mockPrisma.item.findUnique.mockRejectedValue(new Error(PRISMA_CONNECT_ERROR));
    const out = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'REPUSH', fields: ['title'] });
    expect(out.status).toBe('FAILED');
    expect(out.errorCode).toBe('UNEXPECTED');
    expect(out.errorMessage).toBe(INTERNAL_ERROR_TEXT);
    const stored = mockPrisma.itemMarketplacePush.create.mock.calls[0][0].data;
    expect(JSON.stringify(stored)).not.toMatch(/example|5432|prisma|\/app\//);
  });

  it('a failure raised after the eBay calls (here the republish) is sanitized too', async () => {
    mockHeal.mockRejectedValue(new Error('Invalid `prisma.itemCard.findUnique()` invocation in /app/x.ts:1:1'));
    const out = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'REPUSH', fields: ['title'] });
    expect(out.status).toBe('FAILED');
    expect(out.errorMessage).toBe(INTERNAL_ERROR_TEXT);
  });

  it('an error code from outside is only stored in a controlled shape', async () => {
    mockHeal.mockResolvedValue({ published: false, listingId: null, offerId: 'offer1', lastErrorId: "25002'; DROP TABLE x;--", lastErrorMessage: 'rejected' });
    const out = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'REPUSH', fields: ['title'] });
    expect(out.errorCode).toBe('UNKNOWN');
    mockHeal.mockResolvedValue({ published: false, listingId: null, offerId: 'offer1', lastErrorId: '25002', lastErrorMessage: 'rejected' });
    const ok = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'REPUSH', fields: ['title'] });
    expect(ok.errorCode).toBe('EBAY_25002');
  });

  describe('resource-state gate: an item whose eBay offer is already withdrawn is never pushed or republished', () => {
    for (const status of ['SOLD', 'DONATED', 'AUCTION_ENDED']) {
      it(`${status}: no eBay call, no token refresh, no republish; REPUSH and RETRY record it, SAVE records nothing`, async () => {
        mockPrisma.item.findUnique.mockResolvedValue(ITEM_ROW({ status }));
        const save = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'SAVE', fields: ['price', 'title'] });
        expect(save).toMatchObject({ status: 'SKIPPED_NOT_LISTED', errorCode: 'ITEM_NOT_ACTIVE', fieldsPushed: [] });
        expect(mockPrisma.itemMarketplacePush.create).not.toHaveBeenCalled();

        for (const trigger of ['REPUSH', 'RETRY'] as const) {
          mockPrisma.itemMarketplacePush.create.mockClear();
          const out = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger, fields: ['price'] });
          expect(out).toMatchObject({ status: 'SKIPPED_NOT_LISTED', errorCode: 'ITEM_NOT_ACTIVE' });
          expect(mockPrisma.itemMarketplacePush.create.mock.calls[0][0].data).toMatchObject({ trigger, status: 'SKIPPED_NOT_LISTED', errorCode: 'ITEM_NOT_ACTIVE' });
        }
        expect(fetchCalls).toHaveLength(0);
        expect(mockRefreshToken).not.toHaveBeenCalled();
        expect(mockHeal).not.toHaveBeenCalled();
        expect(mockResync).not.toHaveBeenCalled();
        expect(mockPrisma.item.updateMany).not.toHaveBeenCalled(); // and it never releases a hold either
      });
    }

    for (const status of ['AVAILABLE', 'RESERVED', 'INVOICE_ISSUED']) {
      it(`${status}: still live on eBay, so the push proceeds`, async () => {
        mockPrisma.item.findUnique.mockResolvedValue(ITEM_ROW({ status }));
        const out = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'SAVE', fields: ['price'] });
        expect(out.status).toBe('SUCCESS');
        expect(mockHeal).toHaveBeenCalledTimes(1);
      });
    }
  });

  describe('race-safe bookkeeping: a save that lands while the push is in flight keeps its protection', () => {
    // A tiny evaluator for the two where shapes the service uses, so the assertion is on behavior, not on call text.
    const matches = (row: Record<string, any>, where: any): boolean =>
      where.id === row.id &&
      where.OR.some((clause: any) => {
        const [key] = Object.keys(clause);
        const cond = clause[key];
        const v = row[key];
        if (cond === null) return v === null;
        return v !== null && v <= cond.lte;
      });

    it('a REPUSH success does not release the hold when the item was edited after the push began', async () => {
      const row: Record<string, any> = { id: 'i1', lastEditedAt: null, ebaySyncHeldAt: new Date('2026-10-04T10:00:00Z'), ebayHeldFields: ['title'], ebayContentDirtyAt: new Date('2026-10-04T10:00:00Z') };
      mockPrisma.item.updateMany.mockImplementation(async ({ where, data }: any) => {
        if (!matches(row, where)) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      });
      // The organizer saves a new edit (held, so it only grows ebayHeldFields) while the push is on the wire.
      mockPrisma.item.findUnique.mockImplementation(async () => {
        setTimeout(() => undefined, 0);
        return ITEM_ROW();
      });
      mockHeal.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 5));
        row.lastEditedAt = new Date(); // a save landed after the push started
        row.ebayHeldFields = ['title', 'description'];
        return { published: true, listingId: 'list1', offerId: 'offer1', lastErrorId: null, lastErrorMessage: null };
      });
      const out = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'REPUSH', fields: ['title', 'description', 'condition', 'price'] });
      expect(out.status).toBe('SUCCESS');
      expect(row.ebaySyncHeldAt).not.toBeNull(); // the hold stays: the newer edit was never sent
      expect(row.ebayHeldFields).toEqual(['title', 'description']);
      expect(row.ebayContentDirtyAt).not.toBeNull();
    });

    it('a REPUSH success still releases the hold when nothing was edited during the push', async () => {
      const row: Record<string, any> = { id: 'i1', lastEditedAt: new Date('2026-10-04T10:00:00Z'), ebaySyncHeldAt: new Date('2026-10-04T10:00:00Z'), ebayHeldFields: ['title'], ebayContentDirtyAt: new Date('2026-10-04T10:00:00Z') };
      mockPrisma.item.updateMany.mockImplementation(async ({ where, data }: any) => (matches(row, where) ? (Object.assign(row, data), { count: 1 }) : { count: 0 }));
      const out = await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'REPUSH', fields: ['title', 'description', 'condition', 'price'] });
      expect(out.status).toBe('SUCCESS');
      expect(row).toMatchObject({ ebaySyncHeldAt: null, ebayHeldFields: [], ebayContentDirtyAt: null });
    });

    it('a SAVE success clears the dirty flag its own save set, but not one a later save set during the push', async () => {
      const row: Record<string, any> = { id: 'i1', ebayContentDirtyAt: new Date(Date.now() - 1000) }; // set by this save, before the push started
      mockPrisma.item.updateMany.mockImplementation(async ({ where, data }: any) => (matches(row, where) ? (Object.assign(row, data), { count: 1 }) : { count: 0 }));
      await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'SAVE', fields: ['title'], dirtyBefore: null });
      expect(row.ebayContentDirtyAt).toBeNull();

      const racing: Record<string, any> = { id: 'i1', ebayContentDirtyAt: new Date(Date.now() - 1000) };
      mockPrisma.item.updateMany.mockImplementation(async ({ where, data }: any) => (matches(racing, where) ? (Object.assign(racing, data), { count: 1 }) : { count: 0 }));
      mockHeal.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 5));
        racing.ebayContentDirtyAt = new Date(); // a second save marked the item dirty while the first push was running
        return { published: true, listingId: 'list1', offerId: 'offer1', lastErrorId: null, lastErrorMessage: null };
      });
      await pushItemToEbay({ itemId: 'i1', organizerId: 'org1', trigger: 'SAVE', fields: ['title'], dirtyBefore: null });
      expect(racing.ebayContentDirtyAt).not.toBeNull(); // still protected from the pull-sync
    });
  });
});
