/**
 * citiesController (2026-09-29): getCityFinds honours early-access lock, inventory containers and
 * soft-deleted items; getCityDirectory hides claimStatus and NaN-guards limit.
 */
const mockItemFindMany = jest.fn();
const mockOrganizerFindMany = jest.fn();
jest.mock('../lib/prisma', () => ({
  prisma: {
    item: { findMany: (...a: any[]) => mockItemFindMany(...a) },
    organizer: { findMany: (...a: any[]) => mockOrganizerFindMany(...a) },
    metroTopFinds: { findMany: jest.fn() },
  },
}));
jest.mock('../services/xpService', () => ({
  RANK_EARLY_ACCESS_HOURS: { INITIATE: 0, SCOUT: 1, RANGER: 2, SAGE: 4, GRANDMASTER: 6 },
}));

import { getCityFinds, getCityDirectory } from '../controllers/citiesController';

function makeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.set = jest.fn().mockReturnValue(res);
  return res;
}

const candidate = (id: string, publishedAt: Date | null) => ({
  id,
  title: 'Lamp ' + id,
  price: 20,
  originalPrice: null,
  condition: 'USED',
  category: 'Decor',
  photoUrls: ['https://img/' + id],
  saleId: 's-' + id,
  createdAt: new Date('2026-09-20'),
  sale: { id: 's-' + id, title: 'Sale', city: 'Grand Rapids', state: 'MI', publishedAt },
});

beforeEach(() => {
  mockItemFindMany.mockReset();
  mockOrganizerFindMany.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('getCityFinds', () => {
  it('queries with PUBLIC_ITEM_FILTER, excludes inventory containers, soft-deleted items and future publishedAt', async () => {
    mockItemFindMany.mockResolvedValue([]);
    const res = makeRes();
    await getCityFinds({ params: { slug: 'grand-rapids-mi' }, query: {} } as any, res);
    const where = mockItemFindMany.mock.calls[0][0].where;
    expect(where.isActive).toBe(true);
    expect(where.draftStatus).toBe('PUBLISHED');
    expect(where.deletedAt).toBeNull();
    expect(where.sale.isInventoryContainer).toBe(false);
    expect(where.sale.status).toBe('PUBLISHED');
    expect(where.sale.deletedAt).toBeNull();
    expect(where.sale.OR).toEqual([{ publishedAt: null }, { publishedAt: { lte: expect.any(Date) } }]);
    const select = mockItemFindMany.mock.calls[0][0].select;
    expect(select.sale.select.publishedAt).toBe(true);
  });

  it('drops an item whose sale is still inside its early-access window even if the query returned it', async () => {
    const future = new Date(Date.now() + 3 * 3600 * 1000);
    const past = new Date(Date.now() - 3600 * 1000);
    mockItemFindMany.mockResolvedValue([candidate('locked', future), candidate('open', past), candidate('scraped', null)]);
    const res = makeRes();
    await getCityFinds({ params: { slug: 'grand-rapids-mi' }, query: {} } as any, res);
    const ids = res.json.mock.calls[0][0].finds.map((f: any) => f.id).sort();
    expect(ids).toEqual(['open', 'scraped']);
  });

  it('does not leak publishedAt into the response', async () => {
    mockItemFindMany.mockResolvedValue([candidate('open', new Date(Date.now() - 1000))]);
    const res = makeRes();
    await getCityFinds({ params: { slug: 'grand-rapids-mi' }, query: {} } as any, res);
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('publishedAt');
  });

  it('400s a bad slug', async () => {
    const res = makeRes();
    await getCityFinds({ params: { slug: 'nope' }, query: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('getCityDirectory', () => {
  const org = (claimStatus: string) => ({
    id: 'o-' + claimStatus, businessName: 'B', address: '1 Main, Grand Rapids, MI', website: null,
    googleRating: 4.5, googleRatingCount: 10, businessCategory: 'x', claimStatus,
  });

  it('never returns claimStatus; derives a claimable boolean instead', async () => {
    mockOrganizerFindMany.mockResolvedValue([org('UNCLAIMED'), org('INVITED'), org('CLAIMED')]);
    const res = makeRes();
    await getCityDirectory({ params: { slug: 'grand-rapids-mi' }, query: {} } as any, res);
    const body = res.json.mock.calls[0][0];
    expect(JSON.stringify(body)).not.toContain('claimStatus');
    expect(body.organizers.map((o: any) => o.claimable)).toEqual([true, true, false]);
  });

  it('NaN-guards and clamps limit', async () => {
    mockOrganizerFindMany.mockResolvedValue([]);
    await getCityDirectory({ params: { slug: 'grand-rapids-mi' }, query: { limit: 'abc' } } as any, makeRes());
    expect(mockOrganizerFindMany.mock.calls[0][0].take).toBe(8);
    await getCityDirectory({ params: { slug: 'grand-rapids-mi' }, query: { limit: '9999' } } as any, makeRes());
    expect(mockOrganizerFindMany.mock.calls[1][0].take).toBe(24);
    await getCityDirectory({ params: { slug: 'grand-rapids-mi' }, query: { limit: '-5' } } as any, makeRes());
    expect(mockOrganizerFindMany.mock.calls[2][0].take).toBe(1);
  });
});
