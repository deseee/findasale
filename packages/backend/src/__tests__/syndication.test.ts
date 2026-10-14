/**
 * Syndication feed tests (2026-09-29): #459 GET /api/syndication/sale/:saleId and the bundle it serves.
 * Covers public-only visibility (PUBLISHED, not deleted, PUBLIC_ITEM_FILTER items, early-access lock),
 * that organizer phone and organizer street address never appear, and route validation, caching and 404s.
 * NOT EXECUTED when written (jest cannot run on the authoring device); CI is the first real run.
 * 2026-10-12 security pass: adds non-PUBLISHED / soft-deleted sales, item visibility gates (DRAFT, Hunt Pass
 * rarity window, Legendary, embargo, prelaunch), organizer phone/address absence, URL scheme filtering,
 * script-safe JSON escaping, draft-vs-missing 404 parity and GET-only registration.
 */
const mockSaleFindFirst = jest.fn();

jest.mock('../lib/prisma', () => ({ prisma: { sale: { findFirst: (...a: any[]) => mockSaleFindFirst(...a) } } }));
jest.mock('express-rate-limit', () => ({ __esModule: true, default: () => (_req: any, _res: any, next: any) => next() }));
jest.mock('../middleware/rateLimitShared', () => ({ createRateLimitStore: () => undefined }));
// rankService -> xpService -> notificationService pulls in email and push; not needed here.
jest.mock('../services/notificationService', () => ({ createNotification: jest.fn() }));

import router, { toScriptSafeJson } from '../routes/syndication';
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
    expect((bundle.org as any).telephone).toBeUndefined();
    expect((bundle.org as any).address).toBeUndefined();
    expect((bundle.event.organizer as any).telephone).toBeUndefined();
    expect(json).not.toContain('telephone');
  });

  // 2026-10-13 address gate: the feed is anonymous and cached, so it is location by city / region / postal only.
  it('never includes the sale street address (city, region and postal code only)', async () => {
    mockSaleFindFirst.mockResolvedValue(baseSale());
    const bundle = await generateSyndicationBundle('sale1');
    expect(mockSaleFindFirst.mock.calls[0][0].select.address).toBeUndefined();
    expect(bundle.event.location).toEqual({
      '@type': 'PostalAddress',
      addressLocality: 'Denver',
      addressRegion: 'CO',
      postalCode: '80202',
      addressCountry: 'US',
    });
    expect((bundle.dataCommons.location.address as any).streetAddress).toBeUndefined();
    expect(JSON.stringify(bundle)).not.toContain('Oak Street');
  });

  it('omits the location for online-only sales', async () => {
    mockSaleFindFirst.mockResolvedValue(baseSale({ isOnlineOnly: true }));
    const bundle = await generateSyndicationBundle('sale1');
    expect((bundle.event.location as any)['@type']).toBe('VirtualLocation');
    expect((bundle.dataCommons.location.address as any).streetAddress).toBeUndefined();
  });

  it('omits latitude/longitude for online-only sales and coarsens them for physical sales', async () => {
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

  // ── Security pass 2026-10-12 ────────────────────────────────────────────────
  // Emulates the database: the row is only returned when it satisfies the where clause's status gate.
  const findFirstHonoringStatus = (row: any) => (args: any) =>
    Promise.resolve(args.where.status === row.status && row.deletedAt == null ? row : null);

  it.each(['DRAFT', 'ENDED', 'CANCELLED', 'ARCHIVED'])('a %s sale is not syndicated', async (status) => {
    mockSaleFindFirst.mockImplementation(findFirstHonoringStatus(baseSale({ status })));
    await expect(generateSyndicationBundle('sale1')).rejects.toBeInstanceOf(SyndicationNotAvailableError);
  });

  it('a soft-deleted PUBLISHED sale is not syndicated', async () => {
    mockSaleFindFirst.mockImplementation(findFirstHonoringStatus(baseSale({ deletedAt: new Date() })));
    await expect(generateSyndicationBundle('sale1')).rejects.toBeInstanceOf(SyndicationNotAvailableError);
  });

  it('excludes DRAFT items and every non-public item class in the items query', async () => {
    mockSaleFindFirst.mockResolvedValue(baseSale());
    const now = new Date('2026-10-12T12:00:00Z');
    await generateSyndicationBundle('sale1', now);
    const where = mockSaleFindFirst.mock.calls[0][0].select.items.where;
    // DRAFT / PENDING_REVIEW items never match draftStatus: 'PUBLISHED'.
    expect(where.draftStatus).toBe('PUBLISHED');
    expect(where.isActive).toBe(true);
    expect(where.deletedAt).toBeNull();
    expect(where.listingType).toEqual({ not: 'CONSIGNOR_TAG' });
    const gates = JSON.stringify(where.AND);
    // Hunt Pass rarity window (6h RARE / 12h LEGENDARY), Legendary visibility and the item embargo.
    expect(gates).toContain(new Date(now.getTime() - 6 * 3600 * 1000).toISOString());
    expect(gates).toContain(new Date(now.getTime() - 12 * 3600 * 1000).toISOString());
    expect(gates).toContain('legendaryVisibleAt');
    expect(gates).toContain('earlyAccessUntil');
  });

  it('syndicates no items while the sale is still in its Sage+ prelaunch window', async () => {
    mockSaleFindFirst.mockResolvedValue(baseSale({ prelaunchAt: new Date('2026-10-20T00:00:00Z') }));
    const bundle = await generateSyndicationBundle('sale1', new Date('2026-10-12T00:00:00Z'));
    expect(bundle.items).toHaveLength(0);
    expect(bundle.dataCommons.numberOfItems).toBe(0);
    expect(bundle.event.offers).toBeUndefined();
  });

  it('never outputs an organizer phone or organizer street address anywhere in the bundle', async () => {
    const sale = baseSale();
    Object.assign(sale.organizer as any, { phone: '(616) 555-0199', address: '4 Hidden Hollow Rd' });
    mockSaleFindFirst.mockResolvedValue(sale);
    const json = JSON.stringify(await generateSyndicationBundle('sale1'));
    expect(json).not.toContain('555-0199');
    expect(json).not.toContain('Hidden Hollow');
  });

  it('drops non-http(s) organizer and photo URLs', async () => {
    const sale = baseSale({ photoUrls: ['javascript:alert(1)', 'https://res.cloudinary.com/x/a.jpg'] });
    Object.assign(sale.organizer as any, {
      website: 'javascript:alert(document.cookie)',
      facebook: '@oakestate',
      instagram: 'https://instagram.com/oakestate',
      profilePhoto: 'data:text/html,<script>alert(1)</script>',
    });
    mockSaleFindFirst.mockResolvedValue(sale);
    const bundle = await generateSyndicationBundle('sale1');
    const json = JSON.stringify(bundle);
    expect(json).not.toContain('javascript:');
    expect(json).not.toContain('data:text/html');
    expect(bundle.org.url).toBeUndefined();
    expect(bundle.org.logo).toBeUndefined();
    expect(bundle.org.sameAs).toEqual(['https://instagram.com/oakestate']);
    expect(bundle.event.organizer.url).toBeUndefined();
    expect(bundle.event.image).toEqual(['https://res.cloudinary.com/x/a.jpg']);
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
    res.type = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => mockSaleFindFirst.mockReset());

  it('serves the bundle with cache headers and noindex', async () => {
    mockSaleFindFirst.mockResolvedValue(baseSale());
    const res = mkRes();
    await handler({ params: { saleId: 'sale1' } }, res);
    expect(res.type).toHaveBeenCalledWith('application/json');
    const body = JSON.parse(res.send.mock.calls[0][0]);
    expect(body).toEqual(expect.objectContaining({ event: expect.any(Object), items: expect.any(Array) }));
    expect(res.headers['Cache-Control']).toContain('public');
    expect(res.headers['Cache-Control']).toContain('s-maxage');
    expect(res.headers['X-Robots-Tag']).toBe('noindex');
  });

  it('escapes markup so organizer text cannot break out of an ld+json script block', async () => {
    mockSaleFindFirst.mockResolvedValue(baseSale({ title: '</script><script>alert(1)</script> & more' }));
    const res = mkRes();
    await handler({ params: { saleId: 'sale1' } }, res);
    const raw: string = res.send.mock.calls[0][0];
    expect(raw).not.toContain('<');
    expect(raw).not.toContain('>');
    expect(JSON.parse(raw).event.name).toBe('</script><script>alert(1)</script> & more');
    expect(toScriptSafeJson({ a: '\u2028' })).toBe('{"a":"\\u2028"}');
  });

  it('answers a DRAFT sale id exactly like a nonexistent id (no existence oracle)', async () => {
    mockSaleFindFirst.mockImplementation((args: any) =>
      Promise.resolve(args.where.status === 'DRAFT' ? baseSale({ status: 'DRAFT' }) : null)
    );
    const draftRes = mkRes();
    await handler({ params: { saleId: 'sale1' } }, draftRes);
    const missingRes = mkRes();
    await handler({ params: { saleId: 'doesnotexist' } }, missingRes);
    expect(draftRes.status).toHaveBeenCalledWith(404);
    expect(missingRes.status).toHaveBeenCalledWith(404);
    expect(draftRes.json.mock.calls[0][0]).toEqual(missingRes.json.mock.calls[0][0]);
    expect(draftRes.headers).toEqual(missingRes.headers);
  });

  it('registers GET only', () => {
    const routes = (router as any).stack.filter((l: any) => l.route).map((l: any) => l.route);
    for (const r of routes) {
      expect(Object.keys(r.methods)).toEqual(['get']);
    }
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
