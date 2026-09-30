/**
 * Syndication feed tests (2026-09-29): #459 GET /api/syndication/sale/:saleId and the bundle it serves.
 * Covers public-only visibility (PUBLISHED, not deleted, PUBLIC_ITEM_FILTER items, early-access lock),
 * that organizer phone and organizer street address never appear, and route validation, caching and 404s.
 * NOT EXECUTED when written (jest cannot run on the authoring device); CI is the first real run.
 */
const mockSaleFindFirst = jest.fn();

jest.mock('../lib/prisma', () => ({ prisma: { sale: { findFirst: (...a: any[]) => mockSaleFindFirst(...a) } } }));
jest.mock('express-rate-limit', () => ({ __esModule: true, default: () => (_req: any, _res: any, next: any) => next() }));
jest.mock('../middleware/rateLimitShared', () => ({ createRateLimitStore: () => undefined }));
// rankService -> xpService -> notificationService pulls in email and push; not needed here.
jest.mock('../services/notificationService', () => ({ createNotification: jest.fn() }));

import router from '../routes/syndication';
import { generateSyndicationBundle, SyndicationNotAvailableError, SYNDICATION_MAX_ITEMS } from '../services/syndicationFormatterService';

const baseSale = (over: Record<string, any> = {}) => ({
  id: 'sale1',
  title: 'Big Weekend Sale',
  description: 'Lots of things',
  startDate: new Date('2026-10-03T14:00:00Z'),
  endDate: new Date('2026-10-04T22:00:00Z'),
  isOngoing: false,
  address: '12 Oak Street',
  city: 'Denver',
  state: 'CO',
  zip: '80202',
  lat: 39.7,
  lng: -104.9,
  photoUrls: [],
  tags: [],
  status: 'PUBLISHED',
  saleType: 'ESTATE',
  isOnlineOnly: false,
  notes: 'Ring the back bell',
  publishedAt: new Date('2026-09-20T00:00:00Z'),
  organizer: {
    id: 'org1',
    businessName: 'Oak Estate Co',
    bio: null,
    tagline: null,
    yearFounded: null,
    website: 'https://oak.example',
    profilePhoto: null,
    facebook: null,
    instagram: null,
    avgRating: null,
    totalReviews: 0,
    totalSales: 3,
    verificationStatus: 'NONE',
  },
  items: [
    {
      id: 'i1',
      title: 'Oak table',
      description: null,
      price: 120,
      category: 'Furniture',
      condition: 'USED',
      status: 'AVAILABLE',
      photoUrls: [],
      shippingAvailable: false,
      shippingPrice: null,
      currency: 'USD',
    },
  ],
  ...over,
});

describe('generateSyndicationBundle', () => {
  beforeEach(() => mockSaleFindFirst.mockReset());

  it('queries only public data: PUBLISHED, not deleted, not an inventory container, public items only', async () => {
    mockSaleFindFirst.mockResolvedValue(baseSale());
    await generateSyndicationBundle('sale1');
    const args = mockSaleFindFirst.mock.calls[0][0];
    expect(args.where).toEqual({ id: 'sale1', status: 'PUBLISHED', deletedAt: null, isInventoryContainer: false });
    expect(args.select.items.where).toMatchObject({ isActive: true, draftStatus: 'PUBLISHED', status: { notIn: ['GRACE_LOCKED'] } });
    expect(args.select.items.take).toBe(SYNDICATION_MAX_ITEMS);
  });

  it('never selects organizer phone or organizer street address', async () => {
    mockSaleFindFirst.mockResolvedValue(baseSale());
    await generateSyndicationBundle('sale1');
    const orgSelect = mockSaleFindFirst.mock.calls[0][0].select.organizer.select;
    expect(orgSelect.phone).toBeUndefined();
    expect(orgSelect.address).toBeUndefined();
  });

  it('does not leak organizer phone or address even if the row carries them', async () => {
    const sale = baseSale();
    (sale.organizer as any).phone = '555-0100';
    (sale.organizer as any).address = '99 Private Lane';
    mockSaleFindFirst.mockResolvedValue(sale);
    const bundle = await generateSyndicationBundle('sale1');
    const json = JSON.stringify(bundle);
    expect(json).not.toContain('555-0100');
    expect(json).not.toContain('99 Private Lane');
    expect(bundle.org.telephone).toBeUndefined();
    expect(bundle.org.address).toBeUndefined();
    expect(bundle.event.organizer.telephone).toBeUndefined();
  });

  it('includes the sale street address, which the public sale page already shows', async () => {
    mockSaleFindFirst.mockResolvedValue(baseSale());
    const bundle = await generateSyndicationBundle('sale1');
    expect((bundle.event.location as any).streetAddress).toBe('12 Oak Street');
  });

  it('omits the street address for online-only sales', async () => {
    mockSaleFindFirst.mockResolvedValue(baseSale({ isOnlineOnly: true }));
    const bundle = await generateSyndicationBundle('sale1');
    expect((bundle.event.location as any)['@type']).toBe('VirtualLocation');
    expect(bundle.dataCommons.location.address.streetAddress).toBe('');
  });

  it('omits latitude/longitude for online-only sales but keeps them for physical sales', async () => {
    mockSaleFindFirst.mockResolvedValue(baseSale({ isOnlineOnly: true }));
    const online = await generateSyndicationBundle('sale1');
    expect(online.dataCommons.location.geo).toBeUndefined();
    expect(JSON.stringify(online)).not.toContain('39.7');
    expect(JSON.stringify(online)).not.toContain('-104.9');

    mockSaleFindFirst.mockResolvedValue(baseSale());
    const physical = await generateSyndicationBundle('sale1');
    expect(physical.dataCommons.location.geo).toEqual({ '@type': 'GeoCoordinates', latitude: 39.7, longitude: -104.9 });
  });

  it('throws SyndicationNotAvailableError when the sale is missing or not public', async () => {
    mockSaleFindFirst.mockResolvedValue(null);
    await expect(generateSyndicationBundle('nope')).rejects.toBeInstanceOf(SyndicationNotAvailableError);
  });

  it('treats a sale still inside its early-access window as unavailable to anonymous consumers', async () => {
    mockSaleFindFirst.mockResolvedValue(baseSale({ publishedAt: new Date('2026-10-10T00:00:00Z') }));
    await expect(generateSyndicationBundle('sale1', new Date('2026-10-01T00:00:00Z'))).rejects.toBeInstanceOf(
      SyndicationNotAvailableError
    );
  });

  it('emits one Product per public item', async () => {
    mockSaleFindFirst.mockResolvedValue(baseSale());
    const bundle = await generateSyndicationBundle('sale1');
    expect(bundle.items).toHaveLength(1);
    expect(bundle.items[0].name).toBe('Oak table');
  });
});

describe('GET /sale/:saleId route', () => {
  const layer = (router as any).stack.find((l: any) => l.route?.path === '/sale/:saleId');
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;

  const mkRes = () => {
    const res: any = { headers: {} as Record<string, string> };
    res.set = jest.fn((k: string, v: string) => {
      res.headers[k] = v;
      return res;
    });
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => mockSaleFindFirst.mockReset());

  it('serves the bundle with cache headers and noindex', async () => {
    mockSaleFindFirst.mockResolvedValue(baseSale());
    const res = mkRes();
    await handler({ params: { saleId: 'sale1' } }, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ event: expect.any(Object), items: expect.any(Array) }));
    expect(res.headers['Cache-Control']).toContain('public');
    expect(res.headers['Cache-Control']).toContain('s-maxage');
    expect(res.headers['X-Robots-Tag']).toBe('noindex');
  });

  it('400s on a malformed id before touching the database', async () => {
    const res = mkRes();
    await handler({ params: { saleId: '../../etc/passwd' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSaleFindFirst).not.toHaveBeenCalled();
  });

  it('404s with a short cache for a sale that is not available', async () => {
    mockSaleFindFirst.mockResolvedValue(null);
    const res = mkRes();
    await handler({ params: { saleId: 'sale1' } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.headers['Cache-Control']).toBe('public, max-age=60');
  });

  it('500s with no-store on an unexpected error', async () => {
    mockSaleFindFirst.mockRejectedValue(new Error('db down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = mkRes();
    await handler({ params: { saleId: 'sale1' } }, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.headers['Cache-Control']).toBe('no-store');
    spy.mockRestore();
  });
});
