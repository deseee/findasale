/**
 * Public hub landing page data (roadmap #40a, ADR-014 Amendment A, 2026-10-23): GET /api/hubs/:slug now returns a
 * CONFIRMED-vendor directory (booth number + vendor name only) and the hub's published FLEA_MARKET sale.
 *  - the vendor query never selects email / phone / user / payment fields, and filters CONFIRMED, non-house, non-deleted
 *  - the linked sale is matched by organizer + FLEA_MARKET + public visibility, then event date, then venue distance,
 *    then "only one", and returns null when ambiguous; only id, title and dates leave the server (no address or pin)
 *
 * Run: pnpm --filter backend test -- hubPublicLanding
 */

const mockPrisma: any = {
  saleHub: { findFirst: jest.fn() },
  vendorBooth: { findMany: jest.fn() },
  sale: { findMany: jest.fn() },
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../middleware/auth', () => ({}));

import { getHub, getPublicHubVendors, findHubPublicSale } from '../controllers/hubController';

const mkRes = () => {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const NOW = new Date('2026-10-23T12:00:00Z');
const hubPin = { lat: 42.2, lng: -85.9 };
const sale = (id: string, over: any = {}) => ({
  id,
  title: `Sale ${id}`,
  startDate: new Date('2026-10-24T00:00:00Z'),
  endDate: new Date('2026-10-25T00:00:00Z'),
  isOngoing: false,
  lat: hubPin.lat,
  lng: hubPin.lng,
  ...over,
});

beforeEach(() => jest.clearAllMocks());

describe('getPublicHubVendors', () => {
  it('selects booth number and vendor name only, CONFIRMED / non-house / non-deleted', async () => {
    mockPrisma.vendorBooth.findMany.mockResolvedValue([]);
    await getPublicHubVendors('hub1');
    const args = mockPrisma.vendorBooth.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ hubId: 'hub1', status: 'CONFIRMED', deletedAt: null, isHubOwnerBooth: false });
    expect(args.select).toEqual({ boothNumber: true, vendorName: true });
  });

  it('sorts by booth number naturally and drops blank names', async () => {
    mockPrisma.vendorBooth.findMany.mockResolvedValue([
      { boothNumber: '10', vendorName: 'Ten' },
      { boothNumber: '2', vendorName: ' Two ' },
      { boothNumber: '3', vendorName: '   ' },
    ]);
    expect(await getPublicHubVendors('hub1')).toEqual([
      { boothNumber: '2', vendorName: 'Two' },
      { boothNumber: '10', vendorName: 'Ten' },
    ]);
  });
});

describe('findHubPublicSale', () => {
  const hub = { organizerId: 'org1', ...hubPin, saleDate: null as Date | null };

  it('only considers the organizer published, live FLEA_MARKET sales past early access', async () => {
    mockPrisma.sale.findMany.mockResolvedValue([]);
    expect(await findHubPublicSale(hub, NOW)).toBeNull();
    const { where } = mockPrisma.sale.findMany.mock.calls[0][0];
    expect(where).toMatchObject({ organizerId: 'org1', saleType: 'FLEA_MARKET', status: 'PUBLISHED', deletedAt: null });
    expect(where.AND).toEqual([
      { OR: [{ isOngoing: true }, { endDate: { gte: NOW } }] },
      { OR: [{ publishedAt: null }, { publishedAt: { lte: NOW } }] },
    ]);
  });

  it('prefers the sale covering the hub event date and returns no location fields', async () => {
    mockPrisma.sale.findMany.mockResolvedValue([
      sale('a', { startDate: new Date('2026-10-24T00:00:00Z'), endDate: new Date('2026-10-24T00:00:00Z') }),
      sale('b', { startDate: new Date('2026-11-07T00:00:00Z'), endDate: new Date('2026-11-08T00:00:00Z') }),
    ]);
    const picked = await findHubPublicSale({ ...hub, saleDate: new Date('2026-11-07T15:00:00Z') }, NOW);
    expect(picked?.id).toBe('b');
    expect(Object.keys(picked as object).sort()).toEqual(['endDate', 'id', 'isOngoing', 'startDate', 'title']);
  });

  it('falls back to the nearest sale at the venue (within 2 km)', async () => {
    mockPrisma.sale.findMany.mockResolvedValue([
      sale('far', { lat: 42.5, lng: -85.9 }),
      sale('near', { lat: 42.201, lng: -85.9 }),
    ]);
    expect((await findHubPublicSale(hub, NOW))?.id).toBe('near');
  });

  it('returns null when sales are elsewhere and ambiguous', async () => {
    mockPrisma.sale.findMany.mockResolvedValue([sale('x', { lat: 43, lng: -84 }), sale('y', { lat: 44, lng: -83 })]);
    expect(await findHubPublicSale(hub, NOW)).toBeNull();
  });

  it('does not link a single sale whose pin is clearly at another venue', async () => {
    mockPrisma.sale.findMany.mockResolvedValue([sale('x', { lat: 43, lng: -84 })]);
    expect(await findHubPublicSale(hub, NOW)).toBeNull();
  });

  it('links the only sale when it has no pin to compare', async () => {
    mockPrisma.sale.findMany.mockResolvedValue([sale('only', { lat: null, lng: null })]);
    expect((await findHubPublicSale(hub, NOW))?.id).toBe('only');
  });
});

describe('getHub', () => {
  it('returns vendors and the linked sale without vendor contact fields', async () => {
    mockPrisma.saleHub.findFirst.mockResolvedValue({
      id: 'hub1',
      name: 'Hub',
      slug: 'hub',
      description: null,
      organizerId: 'org1',
      ...hubPin,
      saleDate: null,
      eventName: null,
      address: '1 Market St',
      phone: null,
      contactEmail: null,
      hoursText: null,
      organizer: { businessName: 'Org', profilePhoto: null },
      _count: { vendorBooths: 2 },
    });
    mockPrisma.vendorBooth.findMany.mockResolvedValue([{ boothNumber: '1', vendorName: 'Alice' }]);
    mockPrisma.sale.findMany.mockResolvedValue([sale('s1')]);
    const res = mkRes();
    await getHub({ params: { slug: 'hub' } } as any, res);
    const body = res.json.mock.calls[0][0];
    expect(body.hub.vendors).toEqual([{ boothNumber: '1', vendorName: 'Alice' }]);
    expect(body.hub.sale).toMatchObject({ id: 's1', title: 'Sale s1' });
    expect(JSON.stringify(body.hub.vendors)).not.toMatch(/email|phone|userId/i);
    expect(body.hub.sale).not.toHaveProperty('lat');
  });

  it('still 404s an unknown or closed hub without querying vendors or sales', async () => {
    mockPrisma.saleHub.findFirst.mockResolvedValue(null);
    const res = mkRes();
    await getHub({ params: { slug: 'nope' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockPrisma.vendorBooth.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.sale.findMany).not.toHaveBeenCalled();
  });
});
