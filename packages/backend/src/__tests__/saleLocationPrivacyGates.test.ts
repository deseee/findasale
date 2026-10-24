/**
 * Public sale privacy gates (2026-10-13, lib/saleLocationPrivacy.ts) as wired into the sale endpoints:
 *  - street address / exact pin / entrance only for signed-in viewers from the day before the start
 *    (owner organizer and admin always),
 *  - anonymous-level item counts on public lists exclude embargoed items,
 *  - PATCH /sales/:id/status refuses an empty publish unless allowEmpty: true,
 *  - GET /sales/:id/calendar.ics treats an expired token as anonymous (lenientOptionalAuthenticate).
 * Prisma is a mock; jsonwebtoken is real.
 */
var mockPrisma: any;
jest.mock('../lib/prisma', () => {
  mockPrisma = {
    user: { findUnique: jest.fn() },
    organizer: { findUnique: jest.fn() },
    sale: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
    item: { count: jest.fn(), groupBy: jest.fn(), findMany: jest.fn(async () => []) },
    workspaceMember: { findFirst: jest.fn() },
  };
  return { prisma: mockPrisma };
});
// The controller's import graph pulls in the Sentry SDK; the handlers under test never use it.
jest.mock('@sentry/node', () => new Proxy({ __esModule: true }, { get: (t: any, k: string) => (k in t ? t[k] : jest.fn()) }));
jest.mock('../services/revalidationService', () => ({
  triggerSaleAndCityRevalidation: jest.fn(() => Promise.resolve()),
  triggerSaleTakedownRevalidation: jest.fn(() => Promise.resolve()),
  debouncedTriggerSaleAndCityRevalidation: jest.fn(),
  citySlugFromCityState: jest.fn(() => null),
}));
jest.mock('../services/commandCenterService', () => ({ invalidateCommandCenterCache: jest.fn(() => Promise.resolve()) }));

import jwt from 'jsonwebtoken';
import {
  redactSalesForViewer,
  saleAddressGateForViewer,
  notEmbargoedForPublicWhere,
  publicScrapedMetadata,
} from '../lib/saleLocationPrivacy';
import { updateSaleStatus, getSalesByCity } from '../controllers/saleController';
import { optionalAuthenticate, lenientOptionalAuthenticate } from '../middleware/auth';
import { PUBLIC_ITEM_FILTER } from '../helpers/itemQueries';

function makeRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = jest.fn((c: number) => { res.statusCode = c; return res; });
  res.json = jest.fn((b: unknown) => { res.body = b; return res; });
  res.setHeader = jest.fn();
  return res;
}

// Date-only start (stored as 00:00:00Z): the address opens on 2026-10-19, the day before.
const SALE = {
  id: 's1',
  startDate: new Date('2026-10-20T00:00:00Z'),
  address: '123 Maple St',
  city: 'Grand Rapids',
  lat: 42.963795,
  lng: -85.670006,
  entranceLat: 42.9639,
  entranceLng: -85.6701,
  entranceNote: 'Side door by the garage',
  organizer: { userId: 'owner_user', timezone: 'America/Detroit', address: '123 Maple St' },
};
const BEFORE_WINDOW = new Date('2026-10-17T15:00:00Z');
const IN_WINDOW = new Date('2026-10-19T15:00:00Z');

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('redactSalesForViewer / saleAddressGateForViewer', () => {
  const redactedShape = {
    address: '',
    lat: 42.96,
    lng: -85.67,
    entranceLat: null,
    entranceLng: null,
    entranceNote: null,
  };

  it('anonymous viewer: city-level only, even inside the window', () => {
    const [out] = redactSalesForViewer([SALE], null, IN_WINDOW);
    expect(out).toMatchObject(redactedShape);
    expect(out.city).toBe('Grand Rapids');
    expect(out.organizer.address).toBe('');
    expect(saleAddressGateForViewer(SALE, 'America/Detroit', null, false, IN_WINDOW)).toEqual({
      visible: false, reason: 'SIGN_IN', revealsOn: '2026-10-19',
    });
  });

  it('signed-in shopper before the day before the start: redacted (NOT_YET)', () => {
    const viewer = { id: 'shopper', role: 'USER' };
    const [out] = redactSalesForViewer([SALE], viewer, BEFORE_WINDOW);
    expect(out).toMatchObject(redactedShape);
    expect(saleAddressGateForViewer(SALE, 'America/Detroit', viewer, false, BEFORE_WINDOW)).toEqual({
      visible: false, reason: 'NOT_YET', revealsOn: '2026-10-19',
    });
  });

  it('signed-in shopper from the day before the start: full address', () => {
    const viewer = { id: 'shopper', role: 'USER' };
    const [out] = redactSalesForViewer([SALE], viewer, IN_WINDOW);
    expect(out).toEqual(SALE);
    expect(saleAddressGateForViewer(SALE, 'America/Detroit', viewer, false, IN_WINDOW)).toEqual({ visible: true });
  });

  it('owner organizer always sees the full address', () => {
    const [out] = redactSalesForViewer([SALE], { id: 'owner_user', role: 'ORGANIZER' }, BEFORE_WINDOW);
    expect(out.address).toBe('123 Maple St');
    expect(out.entranceNote).toBe('Side door by the garage');
  });

  it('admin always sees the full address', () => {
    const [out] = redactSalesForViewer([SALE], { id: 'admin_user', role: 'ADMIN' }, BEFORE_WINDOW);
    expect(out.address).toBe('123 Maple St');
    expect(out.lat).toBe(42.963795);
  });

  it('an online-only sale (no street address, no pin) has nothing to gate', () => {
    expect(saleAddressGateForViewer({ ...SALE, address: '', lat: null, lng: null, entranceLat: null, entranceLng: null }, 'America/Detroit', null, false, BEFORE_WINDOW)).toEqual({ visible: true });
  });

  it('scrapedMetadata keeps display keys only, on every viewer path', () => {
    const meta = { aiEnriched: { summary: 's' }, hours_display: '9-4', lat: 42.261671, lng: -85.238818, apiResponse: { address: '1 Elm St', latitude: 42.261671 } };
    expect(publicScrapedMetadata(meta)).toEqual({ aiEnriched: { summary: 's' }, hours_display: '9-4' });
    expect(publicScrapedMetadata({ apiResponse: { address: 'x' } })).toBeNull();
    const [anon] = redactSalesForViewer([{ ...SALE, scrapedMetadata: meta }], null, IN_WINDOW);
    expect(JSON.stringify(anon)).not.toContain('1 Elm St');
    const [owner] = redactSalesForViewer([{ ...SALE, scrapedMetadata: meta }], { id: 'admin_user', role: 'ADMIN' }, IN_WINDOW);
    expect(JSON.stringify(owner)).not.toContain('apiResponse');
  });

  it('a scraped sale with no street address but an exact pin is still gated (coords coarsened)', () => {
    const scraped = { ...SALE, address: '' };
    expect(saleAddressGateForViewer(scraped, 'America/Detroit', null, false, IN_WINDOW).visible).toBe(false);
    const [out] = redactSalesForViewer([scraped], null, IN_WINDOW);
    expect(out.lat).toBe(42.96);
  });

  it('a select without the address key (map pins) is still gated', () => {
    const { address: _a, ...pinOnly } = SALE;
    expect(saleAddressGateForViewer(pinOnly, 'America/Detroit', null, false, IN_WINDOW).visible).toBe(false);
  });
});

describe('notEmbargoedForPublicWhere', () => {
  it('builds the anonymous-level Prisma fragment relative to now', () => {
    const now = new Date('2026-10-13T12:00:00Z');
    expect(notEmbargoedForPublicWhere(now)).toEqual({
      AND: [
        { OR: [{ earlyAccessUntil: null }, { earlyAccessUntil: { lte: now } }] },
        { NOT: { rarity: 'LEGENDARY', createdAt: { gt: new Date('2026-10-13T00:00:00Z') } } },
        { NOT: { rarity: 'RARE', createdAt: { gt: new Date('2026-10-13T06:00:00Z') } } },
        { NOT: { isLegendary: true, legendaryVisibleAt: { not: null, gt: now } } },
      ],
    });
  });
});

describe('getSalesByCity (public list)', () => {
  beforeEach(() => {
    mockPrisma.sale.findMany.mockReset();
    mockPrisma.sale.count.mockReset().mockResolvedValue(1);
    mockPrisma.item.groupBy.mockReset().mockResolvedValue([]);
  });

  it('redacts the street address, strips gate-only organizer keys and counts only public, non-embargoed items', async () => {
    mockPrisma.sale.findMany.mockResolvedValue([
      {
        id: 's1', title: 'Moving Sale', startDate: new Date(Date.now() - 86400000), endDate: new Date(Date.now() + 86400000),
        address: '123 Maple St', city: 'Grand Rapids', state: 'MI', zip: '49503', lat: 42.963795, lng: -85.670006,
        photoUrls: [], tags: [],
        organizer: { businessName: 'Maple Co', avgRating: 4.5, userId: 'owner_user', timezone: 'America/Detroit' },
        _count: { items: 3 },
      },
    ]);
    const res = makeRes();
    await getSalesByCity({ params: { city: 'grand-rapids' }, query: {} } as any, res);
    const [sale] = res.body.sales;
    expect(sale.address).toBe('');
    expect(sale.lat).toBe(42.96);
    expect(sale.lng).toBe(-85.67);
    expect(sale.city).toBe('Grand Rapids');
    expect(sale.organizer).toEqual({ businessName: 'Maple Co', avgRating: 4.5 });

    const select = mockPrisma.sale.findMany.mock.calls[0][0].select;
    const countWhere = select._count.select.items.where;
    expect(countWhere.AND[0]).toEqual(PUBLIC_ITEM_FILTER);
    expect(countWhere.AND[1].AND).toHaveLength(4);
    expect(select.organizer.select).toMatchObject({ userId: true, timezone: true });
  });
});

describe('updateSaleStatus: empty-sale publish gate', () => {
  const organizerReq = (body: any) => ({
    params: { id: 's1' },
    body,
    // 2026-10-23: publishing needs a verified email (lib/publishGate.ts).
    user: { id: 'owner_user', role: 'ORGANIZER', roles: ['ORGANIZER'], emailVerified: true },
  }) as any;

  beforeEach(() => {
    mockPrisma.sale.findUnique.mockReset().mockResolvedValue({
      id: 's1', organizerId: 'org_1', status: 'ENDED', publishedAt: new Date('2026-09-01T00:00:00Z'),
    });
    mockPrisma.organizer.findUnique.mockReset().mockResolvedValue({ id: 'org_1', userId: 'owner_user', subscriptionTier: 'PRO' });
    mockPrisma.sale.count.mockReset().mockResolvedValue(0);
    mockPrisma.item.count.mockReset();
    mockPrisma.sale.update.mockReset().mockImplementation(({ data }: any) => Promise.resolve({
      id: 's1', organizerId: 'org_1', status: data.status, title: 'Moving Sale', city: 'Grand Rapids', state: 'MI', lat: 42.96, lng: -85.67,
    }));
  });

  it('refuses to publish a sale with zero items without allowEmpty (409 EMPTY_SALE_PUBLISH)', async () => {
    mockPrisma.item.count.mockResolvedValue(0);
    const res = makeRes();
    await updateSaleStatus(organizerReq({ status: 'PUBLISHED' }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      code: 'EMPTY_SALE_PUBLISH',
      itemCount: 0,
      message: 'This sale has no items yet. Confirm to publish it without items.',
    });
    expect(mockPrisma.sale.update).not.toHaveBeenCalled();
    expect(mockPrisma.item.count).toHaveBeenCalledWith({
      where: { saleId: 's1', deletedAt: null, listingType: { not: 'CONSIGNOR_TAG' } },
    });
  });

  it('a truthy but non-boolean allowEmpty is not a confirmation', async () => {
    mockPrisma.item.count.mockResolvedValue(0);
    const res = makeRes();
    await updateSaleStatus(organizerReq({ status: 'PUBLISHED', allowEmpty: 'true' }), res);
    expect(res.statusCode).toBe(409);
  });

  it('publishes an empty sale with allowEmpty: true and logs the structured line', async () => {
    mockPrisma.item.count.mockResolvedValue(0);
    const res = makeRes();
    await updateSaleStatus(organizerReq({ status: 'PUBLISHED', allowEmpty: true }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('PUBLISHED');
    expect(console.log).toHaveBeenCalledWith('[sale-publish] empty publish confirmed saleId=s1 organizerId=org_1');
  });

  it('publishes a sale that has items without needing allowEmpty', async () => {
    mockPrisma.item.count.mockResolvedValue(4);
    const res = makeRes();
    await updateSaleStatus(organizerReq({ status: 'PUBLISHED' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('PUBLISHED');
  });
});

describe('lenientOptionalAuthenticate (calendar.ics)', () => {
  const SECRET = 'unit-test-jwt-secret';
  const sign = (opts: jwt.SignOptions) => jwt.sign({ id: 'u1', tokenVersion: 0 }, SECRET, opts);
  const mkReq = (token?: string) => ({
    cookies: token ? { accessToken: token } : {}, headers: {}, query: {},
    originalUrl: '/api/sales/s1/calendar.ics', url: '/s1/calendar.ics', path: '/s1/calendar.ics',
  }) as any;

  beforeEach(() => {
    process.env.JWT_SECRET = SECRET;
    mockPrisma.user.findUnique.mockReset().mockResolvedValue({
      id: 'u1', role: 'USER', roles: ['USER'], tokenVersion: 0, suspendedAt: null, deletedAt: null,
    });
  });

  it('an expired token is anonymous (next, no user) instead of a 401', async () => {
    const req = mkReq(sign({ expiresIn: -10 }));
    const res = makeRes();
    const next = jest.fn();
    await lenientOptionalAuthenticate(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('a malformed token is anonymous', async () => {
    const req = mkReq('not-a-jwt');
    const next = jest.fn();
    await lenientOptionalAuthenticate(req, makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeUndefined();
  });

  it('a valid token still identifies the viewer', async () => {
    const req = mkReq(sign({ expiresIn: '1h' }));
    const next = jest.fn();
    await lenientOptionalAuthenticate(req, makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user?.id).toBe('u1');
  });

  it('plain optionalAuthenticate keeps answering 401 to an expired token (app routes refresh on it)', async () => {
    const req = mkReq(sign({ expiresIn: -10 }));
    const res = makeRes();
    const next = jest.fn();
    await optionalAuthenticate(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});
