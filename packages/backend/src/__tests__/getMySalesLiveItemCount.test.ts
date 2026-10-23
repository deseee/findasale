/**
 * getMySales stats.liveItemCount (2026-10-12, guided first-sale flow): counts only the items shoppers
 * can see (same conditions as PUBLIC_ITEM_FILTER), leaves stats.itemCount unchanged, and stays scoped
 * to the signed-in organizer. Prisma is a mock.
 */
const mockOrganizerFindUnique = jest.fn();
const mockSaleFindMany = jest.fn();
const mockGroupBy = jest.fn();
jest.mock('../lib/prisma', () => ({
  prisma: {
    organizer: { findUnique: (...a: any[]) => mockOrganizerFindUnique(...a) },
    sale: { findMany: (...a: any[]) => mockSaleFindMany(...a) },
    itemReservation: { groupBy: (...a: any[]) => mockGroupBy(...a) },
  },
}));

// The controller's import graph pulls in the Sentry SDK; the handler under test never uses it.
jest.mock('@sentry/node', () => new Proxy({ __esModule: true }, { get: (t: any, k: string) => (k in t ? t[k] : jest.fn()) }));

import { getMySales } from '../controllers/saleController';
import { isPublicItem, PUBLIC_ITEM_FILTER } from '../helpers/itemQueries';

function makeRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = jest.fn((c: number) => { res.statusCode = c; return res; });
  res.json = jest.fn((b: unknown) => { res.body = b; return res; });
  return res;
}

const item = (over: Record<string, unknown> = {}) => ({
  id: `i_${Math.random()}`, title: 't', price: 5, status: 'AVAILABLE', organizerDiscountAmount: null,
  draftStatus: 'PUBLISHED', isActive: true, listingType: 'FIXED', ...over,
});

const organizerReq = { user: { id: 'user_a', role: 'ORGANIZER', roles: ['ORGANIZER'] } } as any;

describe('isPublicItem mirrors PUBLIC_ITEM_FILTER', () => {
  it('matches the filter definition field for field', () => {
    expect(PUBLIC_ITEM_FILTER).toEqual({
      isActive: true,
      status: { notIn: ['GRACE_LOCKED'] },
      draftStatus: 'PUBLISHED',
      listingType: { not: 'CONSIGNOR_TAG' },
    });
  });
  it('accepts a live item and rejects each excluded case', () => {
    expect(isPublicItem(item())).toBe(true);
    expect(isPublicItem(item({ isActive: false }))).toBe(false);
    expect(isPublicItem(item({ status: 'GRACE_LOCKED' }))).toBe(false);
    expect(isPublicItem(item({ draftStatus: 'DRAFT' }))).toBe(false);
    expect(isPublicItem(item({ draftStatus: 'PENDING_REVIEW' }))).toBe(false);
    expect(isPublicItem(item({ listingType: 'CONSIGNOR_TAG' }))).toBe(false);
    expect(isPublicItem(item({ status: 'SOLD' }))).toBe(true);
  });
});

describe('getMySales', () => {
  beforeEach(() => {
    mockOrganizerFindUnique.mockReset();
    mockSaleFindMany.mockReset();
    mockGroupBy.mockReset();
    mockOrganizerFindUnique.mockResolvedValue({ id: 'org_a', userId: 'user_a' });
    mockGroupBy.mockResolvedValue([]);
  });

  it('adds liveItemCount next to an unchanged itemCount', async () => {
    mockSaleFindMany.mockResolvedValue([
      {
        id: 's1', title: 'Moving Sale', status: 'DRAFT', qrScanCount: 0,
        items: [item(), item({ draftStatus: 'PENDING_REVIEW' }), item({ isActive: false }), item({ status: 'GRACE_LOCKED' })],
        _count: { items: 4 },
      },
      { id: 's2', title: 'Empty', status: 'PUBLISHED', qrScanCount: 3, items: [], _count: { items: 0 } },
    ]);
    const res = makeRes();
    await getMySales(organizerReq, res);
    const [s1, s2] = res.body.sales;
    // soldItemCount (2026-10-23) drives the "dates have passed, pick new dates" prompt.
    expect(s1.stats).toEqual({ itemCount: 4, liveItemCount: 1, soldItemCount: 0, holdCount: 0, visitorCount: 0 });
    expect(s2.stats).toEqual({ itemCount: 0, liveItemCount: 0, soldItemCount: 0, holdCount: 0, visitorCount: 3 });
  });

  it('queries only the signed-in organizer and selects the fields liveItemCount needs', async () => {
    mockSaleFindMany.mockResolvedValue([]);
    await getMySales(organizerReq, makeRes());
    expect(mockOrganizerFindUnique).toHaveBeenCalledWith({ where: { userId: 'user_a' } });
    const args = mockSaleFindMany.mock.calls[0][0];
    expect(args.where.organizerId).toBe('org_a');
    expect(args.select.items.where).toEqual({ listingType: { not: 'CONSIGNOR_TAG' } });
    expect(args.select.items.select).toMatchObject({ status: true, draftStatus: true, isActive: true, listingType: true });
  });

  it('refuses a non-organizer and an anonymous caller', async () => {
    const shopperRes = makeRes();
    await getMySales({ user: { id: 'u', role: 'USER', roles: ['USER'] } } as any, shopperRes);
    expect(shopperRes.statusCode).toBe(403);
    const anonRes = makeRes();
    await getMySales({} as any, anonRes);
    expect(anonRes.statusCode).toBe(403);
    expect(mockSaleFindMany).not.toHaveBeenCalled();
  });
});
