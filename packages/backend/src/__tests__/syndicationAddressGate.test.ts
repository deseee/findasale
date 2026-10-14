/**
 * 2026-10-13 public address gate on the syndication feed (GET /api/syndication/sale/:saleId).
 * The feed is anonymous and CDN-cached, so it must carry no street address, no organizer telephone,
 * only coarse (2 decimal) coordinates, no day-of approach notes, and no item still inside an
 * early-access window. The item gate is checked by evaluating the real Prisma where clause the service
 * builds against sample rows (a small evaluator for the operators it uses), not by hand-picked mock returns.
 */
const mockSaleFindFirst = jest.fn();

jest.mock('../lib/prisma', () => ({ prisma: { sale: { findFirst: (...a: any[]) => mockSaleFindFirst(...a) } } }));
jest.mock('../services/notificationService', () => ({ createNotification: jest.fn() }));

import { generateSyndicationBundle } from '../services/syndicationFormatterService';
import { matchesWhere as matches } from './helpers/prismaWhereMatcher';

const NOW = new Date('2026-10-13T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600000);

const item = (id: string, over: Record<string, any> = {}) => ({
  id,
  title: `Item ${id}`,
  description: null,
  price: 10,
  category: 'Furniture',
  condition: 'USED',
  status: 'AVAILABLE',
  photoUrls: [],
  shippingAvailable: false,
  shippingPrice: null,
  currency: 'USD',
  // gate inputs (not selected by the service, but present on the DB row)
  isActive: true,
  draftStatus: 'PUBLISHED',
  listingType: 'FIXED',
  deletedAt: null,
  rarity: 'COMMON',
  createdAt: hoursAgo(48),
  earlyAccessUntil: null,
  isLegendary: false,
  legendaryVisibleAt: null,
  ...over,
});

const dbItems = [
  item('visible'),
  item('embargoed', { earlyAccessUntil: new Date(NOW.getTime() + 3600000) }),
  item('embargoPassed', { earlyAccessUntil: hoursAgo(1) }),
  item('freshRare', { rarity: 'RARE', createdAt: hoursAgo(2) }),
  item('oldRare', { rarity: 'RARE', createdAt: hoursAgo(7) }),
  item('freshLegendary', { rarity: 'LEGENDARY', createdAt: hoursAgo(5) }),
  item('legendaryNotYet', { isLegendary: true, legendaryVisibleAt: new Date(NOW.getTime() + 7200000) }),
  item('draft', { draftStatus: 'DRAFT' }),
];

const saleRow = (over: Record<string, any> = {}) => ({
  id: 'sale1',
  title: 'Weekend Sale',
  description: 'Furniture and tools',
  startDate: new Date('2026-10-17T13:00:00Z'),
  endDate: new Date('2026-10-18T21:00:00Z'),
  isOngoing: false,
  address: '4821 Maple Hollow Drive',
  city: 'Grand Rapids',
  state: 'MI',
  zip: '49503',
  lat: 42.963795,
  lng: -85.670006,
  entranceLat: 42.96401,
  entranceLng: -85.66991,
  entranceNote: 'Side gate by the garage',
  photoUrls: [],
  tags: [],
  status: 'PUBLISHED',
  saleType: 'YARD',
  isOnlineOnly: false,
  notes: 'Park on the left, ring the back bell',
  publishedAt: new Date('2026-10-01T00:00:00Z'),
  prelaunchAt: null,
  organizer: {
    id: 'org1',
    businessName: 'Maple Sales',
    bio: null,
    tagline: null,
    yearFounded: null,
    website: null,
    profilePhoto: null,
    facebook: null,
    instagram: null,
    avgRating: null,
    totalReviews: 0,
    totalSales: 2,
    verificationStatus: 'NONE',
    phone: '(616) 555-0142',
    address: '77 Private Court',
  },
  ...over,
});

/** Emulates the DB: applies the service's own item where/take to the rows above. */
function emulateFindFirst(row: any) {
  return (args: any) => {
    const where = args.select.items.where;
    const items = dbItems.filter((i) => matches(i, where)).slice(0, args.select.items.take);
    return Promise.resolve({ ...row, items });
  };
}

describe('syndication feed: 2026-10-13 public address gate', () => {
  beforeEach(() => mockSaleFindFirst.mockReset());

  it('emits no streetAddress anywhere, even when the row carries one', async () => {
    mockSaleFindFirst.mockImplementation(emulateFindFirst(saleRow()));
    const bundle = await generateSyndicationBundle('sale1', NOW);
    const json = JSON.stringify(bundle);
    expect(json).not.toContain('streetAddress');
    expect(json).not.toContain('Maple Hollow');
    expect(json).not.toContain('Private Court');
    expect(bundle.event.location).toMatchObject({
      '@type': 'PostalAddress',
      addressLocality: 'Grand Rapids',
      addressRegion: 'MI',
      postalCode: '49503',
    });
    expect(bundle.dataCommons.location.address).toMatchObject({
      addressLocality: 'Grand Rapids',
      addressRegion: 'MI',
      postalCode: '49503',
    });
  });

  it('does not select the street address, approach notes or organizer phone/address from the database', async () => {
    mockSaleFindFirst.mockImplementation(emulateFindFirst(saleRow()));
    await generateSyndicationBundle('sale1', NOW);
    const select = mockSaleFindFirst.mock.calls[0][0].select;
    expect(select.address).toBeUndefined();
    expect(select.notes).toBeUndefined();
    expect(select.entranceLat).toBeUndefined();
    expect(select.entranceLng).toBeUndefined();
    expect(select.organizer.select.phone).toBeUndefined();
    expect(select.organizer.select.address).toBeUndefined();
  });

  it('emits no telephone and no approach notes or entrance pin', async () => {
    mockSaleFindFirst.mockImplementation(emulateFindFirst(saleRow()));
    const json = JSON.stringify(await generateSyndicationBundle('sale1', NOW));
    expect(json).not.toContain('telephone');
    expect(json).not.toContain('555-0142');
    expect(json).not.toContain('back bell');
    expect(json).not.toContain('Side gate');
    expect(json).not.toContain('42.96401');
  });

  it('coarsens coordinates to 2 decimals and never emits the exact pin', async () => {
    mockSaleFindFirst.mockImplementation(emulateFindFirst(saleRow()));
    const bundle = await generateSyndicationBundle('sale1', NOW);
    expect(bundle.dataCommons.location.geo).toEqual({ '@type': 'GeoCoordinates', latitude: 42.96, longitude: -85.67 });
    const json = JSON.stringify(bundle);
    expect(json).not.toContain('42.963795');
    expect(json).not.toContain('85.670006');
  });

  it('emits no geo at all for an online-only sale', async () => {
    mockSaleFindFirst.mockImplementation(emulateFindFirst(saleRow({ isOnlineOnly: true })));
    const bundle = await generateSyndicationBundle('sale1', NOW);
    expect(bundle.dataCommons.location.geo).toBeUndefined();
    expect(bundle.event.location['@type']).toBe('VirtualLocation');
  });

  it('excludes items still inside an early-access window and keeps the rest', async () => {
    mockSaleFindFirst.mockImplementation(emulateFindFirst(saleRow()));
    const bundle = await generateSyndicationBundle('sale1', NOW);
    const names = bundle.items.map((p) => p.name).sort();
    expect(names).toEqual(['Item embargoPassed', 'Item oldRare', 'Item visible']);
    const json = JSON.stringify(bundle);
    for (const hidden of ['embargoed', 'freshRare', 'freshLegendary', 'legendaryNotYet', 'draft']) {
      expect(json).not.toContain(`Item ${hidden}"`);
    }
    // The price range and item count are computed from the visible items only.
    expect(bundle.dataCommons.numberOfItems).toBe(3);
  });
});
