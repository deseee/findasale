/**
 * GET /api/items/:id/price-history owner resolution (item editor unification, Wave 1, B1).
 * NOT EXECUTED when written (jest cannot run on the authoring device); CI is the first real run.
 *
 * Contract: the route is PUBLIC (optionalAuthenticate).
 *  - Sale items keep the existing behavior: owner or admin always see it; everyone else needs a PUBLISHED sale
 *    and a published item, otherwise 404.
 *  - Inventory items (no sale) are private to the owning organizer: anyone else, anonymous callers and admins
 *    included, gets 404 (never 403, never a crash), and the price history is never read for them.
 */
const mockItemFindUnique = jest.fn();
const mockHistoryFindMany = jest.fn();
const mockOrganizerFindFirst = jest.fn();

const mockPrisma = {
  item: { findUnique: (...a: any[]) => mockItemFindUnique(...a) },
  itemPriceHistory: { findMany: (...a: any[]) => mockHistoryFindMany(...a), create: jest.fn() },
  organizer: { findFirst: (...a: any[]) => mockOrganizerFindFirst(...a) },
};

jest.mock('../index', () => ({ prisma: mockPrisma }));
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

import { getPriceHistory } from '../controllers/priceHistoryController';

const OWNER = 'user_owner';
const OTHER_ORGANIZER = 'user_other_org';
const SHOPPER = 'user_shopper';
const ADMIN = 'user_admin';

const HISTORY = [{ id: 'h1', itemId: 'item_1', price: 10, createdAt: new Date('2026-01-01') }];

const mkRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mkReq = (user?: { id: string; role?: string }) =>
  ({ params: { id: 'item_1' }, user } as any);

const saleItem = (overrides: any = {}) => ({
  saleId: 'sale_1',
  organizerId: 'org_owner',
  draftStatus: 'PUBLISHED',
  sale: {
    status: 'PUBLISHED',
    organizerId: 'org_owner',
    organizer: { id: 'org_owner', userId: OWNER, subscriptionTier: 'PRO', lat: null, lng: null },
  },
  ...overrides,
});

const inventoryItem = () => ({
  saleId: null,
  organizerId: 'org_inv',
  draftStatus: 'PUBLISHED',
  sale: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mockHistoryFindMany.mockResolvedValue(HISTORY);
  // Realistic lookup: the row exists only for the real owner's userId.
  mockOrganizerFindFirst.mockImplementation(async (args: any) =>
    args?.where?.id === 'org_inv' && args?.where?.userId === OWNER
      ? { id: 'org_inv', userId: OWNER, subscriptionTier: 'SIMPLE', lat: null, lng: null }
      : null,
  );
});
afterEach(() => jest.restoreAllMocks());

describe('getPriceHistory on a sale item (existing behavior preserved)', () => {
  it('returns 404 when the item does not exist', async () => {
    mockItemFindUnique.mockResolvedValue(null);
    const res = mkRes();
    await getPriceHistory(mkReq(), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('anonymous caller sees history for a published sale and published item', async () => {
    mockItemFindUnique.mockResolvedValue(saleItem());
    const res = mkRes();
    await getPriceHistory(mkReq(), res);
    expect(res.json).toHaveBeenCalledWith(HISTORY);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('shopper and another organizer see history for a published sale and published item', async () => {
    for (const id of [SHOPPER, OTHER_ORGANIZER]) {
      mockItemFindUnique.mockResolvedValue(saleItem());
      const res = mkRes();
      await getPriceHistory(mkReq({ id }), res);
      expect(res.json).toHaveBeenCalledWith(HISTORY);
    }
  });

  it('owner sees history even when the sale is not published', async () => {
    mockItemFindUnique.mockResolvedValue(saleItem({ sale: { ...saleItem().sale, status: 'ENDED' } }));
    const res = mkRes();
    await getPriceHistory(mkReq({ id: OWNER }), res);
    expect(res.json).toHaveBeenCalledWith(HISTORY);
  });

  it('admin sees history even when the sale is not published', async () => {
    mockItemFindUnique.mockResolvedValue(saleItem({ sale: { ...saleItem().sale, status: 'DRAFT' } }));
    const res = mkRes();
    await getPriceHistory(mkReq({ id: ADMIN, role: 'ADMIN' }), res);
    expect(res.json).toHaveBeenCalledWith(HISTORY);
  });

  it('anonymous, shopper and other organizer get 404 when the sale is not published', async () => {
    for (const user of [undefined, { id: SHOPPER }, { id: OTHER_ORGANIZER }]) {
      mockItemFindUnique.mockResolvedValue(saleItem({ sale: { ...saleItem().sale, status: 'DRAFT' } }));
      const res = mkRes();
      await getPriceHistory(mkReq(user), res);
      expect(res.status).toHaveBeenCalledWith(404);
    }
    expect(mockHistoryFindMany).not.toHaveBeenCalled();
  });

  it('non-owners get 404 for an unpublished item on a published sale; the owner still sees it', async () => {
    for (const user of [undefined, { id: SHOPPER }, { id: OTHER_ORGANIZER }]) {
      mockItemFindUnique.mockResolvedValue(saleItem({ draftStatus: 'PENDING_REVIEW' }));
      const res = mkRes();
      await getPriceHistory(mkReq(user), res);
      expect(res.status).toHaveBeenCalledWith(404);
    }
    mockItemFindUnique.mockResolvedValue(saleItem({ draftStatus: 'PENDING_REVIEW' }));
    const ownerRes = mkRes();
    await getPriceHistory(mkReq({ id: OWNER }), ownerRes);
    expect(ownerRes.json).toHaveBeenCalledWith(HISTORY);
  });

  it('never looks an organizer up for a sale item (owner resolves through the sale)', async () => {
    mockItemFindUnique.mockResolvedValue(saleItem());
    await getPriceHistory(mkReq({ id: OTHER_ORGANIZER }), mkRes());
    expect(mockOrganizerFindFirst).not.toHaveBeenCalled();
  });
});

describe('getPriceHistory on an inventory item (saleId null)', () => {
  it('owning organizer gets the history, resolved by organizer id AND userId', async () => {
    mockItemFindUnique.mockResolvedValue(inventoryItem());
    const res = mkRes();
    await getPriceHistory(mkReq({ id: OWNER }), res);
    expect(res.json).toHaveBeenCalledWith(HISTORY);
    expect(res.status).not.toHaveBeenCalled();
    expect(mockOrganizerFindFirst).toHaveBeenCalledTimes(1);
    expect(mockOrganizerFindFirst.mock.calls[0][0].where).toEqual({ id: 'org_inv', userId: OWNER });
  });

  it('another organizer gets 404 and the history is never read', async () => {
    mockItemFindUnique.mockResolvedValue(inventoryItem());
    const res = mkRes();
    await getPriceHistory(mkReq({ id: OTHER_ORGANIZER }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Item not found' });
    expect(mockHistoryFindMany).not.toHaveBeenCalled();
  });

  it('shopper gets 404', async () => {
    mockItemFindUnique.mockResolvedValue(inventoryItem());
    const res = mkRes();
    await getPriceHistory(mkReq({ id: SHOPPER }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockHistoryFindMany).not.toHaveBeenCalled();
  });

  it('anonymous caller gets 404 and no organizer lookup is made', async () => {
    mockItemFindUnique.mockResolvedValue(inventoryItem());
    const res = mkRes();
    await getPriceHistory(mkReq(), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockOrganizerFindFirst).not.toHaveBeenCalled();
    expect(mockHistoryFindMany).not.toHaveBeenCalled();
  });

  it('admin who is not the owner also gets 404 (inventory items are owner-only)', async () => {
    mockItemFindUnique.mockResolvedValue(inventoryItem());
    const res = mkRes();
    await getPriceHistory(mkReq({ id: ADMIN, role: 'ADMIN' }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockHistoryFindMany).not.toHaveBeenCalled();
  });

  it('a saleless item with no organizerId is denied for everyone', async () => {
    mockItemFindUnique.mockResolvedValue({ ...inventoryItem(), organizerId: null });
    const res = mkRes();
    await getPriceHistory(mkReq({ id: OWNER }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockHistoryFindMany).not.toHaveBeenCalled();
  });

  it('a database error during owner resolution answers 500, never an owner and never the data', async () => {
    mockItemFindUnique.mockResolvedValue(inventoryItem());
    mockOrganizerFindFirst.mockRejectedValue(new Error('db down'));
    const res = mkRes();
    await getPriceHistory(mkReq({ id: OWNER }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockHistoryFindMany).not.toHaveBeenCalled();
  });
});
