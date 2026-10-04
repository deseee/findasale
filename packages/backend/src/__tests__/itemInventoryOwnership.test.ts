/**
 * item-inventory :itemId ownership (hacker pass, Wave 1 fix A).
 * NOT EXECUTED when written (jest cannot run on the authoring device); CI is the first real run.
 *
 * GET /api/item-inventory/:itemId/price-history, GET /api/item-inventory/:itemId/pricing-advice and
 * DELETE /api/item-inventory/:itemId used to hand any PRO organizer's itemId straight to a service that never
 * checked the caller. The handlers now load the item and resolve its owner first. A non-owner (sale item of
 * another organizer, saleless inventory item of another organizer, or no owner at all) and a missing item
 * get the same 404 body, and the service is never called. Owners keep the existing behavior.
 */
const mockItemFindUnique = jest.fn();
const mockOrganizerFindFirst = jest.fn();
const mockPrisma = {
  item: { findUnique: (...a: any[]) => mockItemFindUnique(...a) },
  organizer: { findFirst: (...a: any[]) => mockOrganizerFindFirst(...a) },
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

const mockGetPriceHistory = jest.fn();
const mockGetPricingSuggestion = jest.fn();
const mockRemoveFromInventory = jest.fn();
jest.mock('../services/itemInventoryService', () => ({
  addToInventory: jest.fn(),
  removeFromInventory: (...a: any[]) => mockRemoveFromInventory(...a),
  pullFromInventory: jest.fn(),
  getInventoryItems: jest.fn(),
  getPriceHistory: (...a: any[]) => mockGetPriceHistory(...a),
  getPricingSuggestion: (...a: any[]) => mockGetPricingSuggestion(...a),
}));

import {
  getItemPriceHistory,
  getItemPricingAdvice,
  removeItemFromInventory,
} from '../controllers/itemInventoryController';

const CALLER = 'user_caller';

const mkRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mkReq = (query: Record<string, unknown> = {}, userId: string | undefined = CALLER, itemId = 'item_1') =>
  ({
    params: { itemId },
    query,
    body: {},
    user: userId ? { id: userId, organizerProfile: { id: 'org_caller' } } : undefined,
  }) as any;

const organizer = (id: string, userId: string) => ({ id, userId, subscriptionTier: 'PRO', lat: null, lng: null });

const ownSaleItem = () => ({ id: 'item_1', organizerId: 'org_caller', saleId: 'sale_1', sale: { organizer: organizer('org_caller', CALLER) } });
const foreignSaleItem = () => ({ id: 'item_1', organizerId: 'org_x', saleId: 'sale_9', sale: { organizer: organizer('org_x', 'user_x') } });
const inventoryItem = (organizerId: string | null) => ({ id: 'item_1', organizerId, saleId: null, sale: null });

const NOT_FOUND = { message: 'Item not found' };

beforeEach(() => {
  jest.clearAllMocks();
  mockItemFindUnique.mockReset();
  mockOrganizerFindFirst.mockReset();
  mockGetPriceHistory.mockReset().mockResolvedValue([{ id: 'h1' }]);
  mockGetPricingSuggestion.mockReset().mockResolvedValue({ suggested: 10, min: 9, max: 11 });
  mockRemoveFromInventory.mockReset().mockResolvedValue({ id: 'item_1', inInventory: false });
});

describe.each([
  ['price-history', getItemPriceHistory, {}, () => mockGetPriceHistory],
  ['pricing-advice', getItemPricingAdvice, { saleId: 'sale_1' }, () => mockGetPricingSuggestion],
  ['remove', removeItemFromInventory, {}, () => mockRemoveFromInventory],
] as Array<[string, (req: any, res: any) => Promise<void>, Record<string, unknown>, () => jest.Mock]>)(
  '%s ownership',
  (_name, handler, query, service) => {
    it('loads the item with organizerId, saleId and the sale organizer before touching the service', async () => {
      mockItemFindUnique.mockResolvedValue(ownSaleItem());
      await handler(mkReq(query), mkRes());
      expect(mockItemFindUnique).toHaveBeenCalledTimes(1);
      const arg = mockItemFindUnique.mock.calls[0][0];
      expect(arg.where).toEqual({ id: 'item_1' });
      expect(arg.select.organizerId).toBe(true);
      expect(arg.select.saleId).toBe(true);
      expect(arg.select.sale.select.organizer.select).toEqual({
        id: true,
        userId: true,
        subscriptionTier: true,
        lat: true,
        lng: true,
      });
    });

    it('owner of a sale item is served (service called)', async () => {
      mockItemFindUnique.mockResolvedValue(ownSaleItem());
      const res = mkRes();
      await handler(mkReq(query), res);
      expect(service()).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalledWith(404);
    });

    it('owner of a saleless inventory item is served (organizer looked up by id AND userId)', async () => {
      mockItemFindUnique.mockResolvedValue(inventoryItem('org_caller'));
      mockOrganizerFindFirst.mockResolvedValue(organizer('org_caller', CALLER));
      const res = mkRes();
      await handler(mkReq(query), res);
      expect(mockOrganizerFindFirst.mock.calls[0][0].where).toEqual({ id: 'org_caller', userId: CALLER });
      expect(service()).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalledWith(404);
    });

    it("another organizer's sale item: 404, same body as a missing item, service never called", async () => {
      mockItemFindUnique.mockResolvedValue(foreignSaleItem());
      const res = mkRes();
      await handler(mkReq(query), res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(NOT_FOUND);
      expect(service()).not.toHaveBeenCalled();
    });

    it("another organizer's saleless inventory item: 404, service never called", async () => {
      mockItemFindUnique.mockResolvedValue(inventoryItem('org_x'));
      mockOrganizerFindFirst.mockResolvedValue(null); // no organizer with that id belongs to the caller
      const res = mkRes();
      await handler(mkReq(query), res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(NOT_FOUND);
      expect(service()).not.toHaveBeenCalled();
    });

    it('a saleless item with no organizer at all is denied with 404', async () => {
      mockItemFindUnique.mockResolvedValue(inventoryItem(null));
      const res = mkRes();
      await handler(mkReq(query), res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(NOT_FOUND);
      expect(service()).not.toHaveBeenCalled();
    });

    it('a missing item gets the identical 404 body', async () => {
      mockItemFindUnique.mockResolvedValue(null);
      const res = mkRes();
      await handler(mkReq(query), res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(NOT_FOUND);
      expect(service()).not.toHaveBeenCalled();
    });

    it('a database error during the ownership load is never an implicit allow', async () => {
      mockItemFindUnique.mockRejectedValue(new Error('db down'));
      const res = mkRes();
      await handler(mkReq(query), res);
      expect(service()).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalledWith(200);
      expect(res.status).toHaveBeenCalledTimes(1);
    });
  },
);

describe('input guards are unchanged', () => {
  it('price-history without an organizer profile is 401 and nothing is loaded', async () => {
    const res = mkRes();
    await getItemPriceHistory(mkReq({}, undefined), res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockItemFindUnique).not.toHaveBeenCalled();
  });

  it('pricing-advice without saleId is 400 and nothing is loaded', async () => {
    const res = mkRes();
    await getItemPricingAdvice(mkReq({}), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockItemFindUnique).not.toHaveBeenCalled();
  });

  it('owner responses keep their shape', async () => {
    mockItemFindUnique.mockResolvedValue(ownSaleItem());
    const h = mkRes();
    await getItemPriceHistory(mkReq({}), h);
    expect(h.json).toHaveBeenCalledWith({ history: [{ id: 'h1' }] });
    const a = mkRes();
    await getItemPricingAdvice(mkReq({ saleId: 'sale_1' }), a);
    expect(a.json).toHaveBeenCalledWith({ suggestion: { suggested: 10, min: 9, max: 11 } });
    const r = mkRes();
    await removeItemFromInventory(mkReq({}), r);
    expect(r.json).toHaveBeenCalledWith({ item: { id: 'item_1', inInventory: false } });
  });
});
