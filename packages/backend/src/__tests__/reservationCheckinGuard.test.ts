/**
 * reservationController.checkinAtSale anti-spoof guard and idempotency (2026-09-30). It now runs the same
 * services/qrScanGuardService check as saleController.checkInToSale (sale window, rate limits, radius, impossible
 * speed), refuses unpublished sales, and allows ONE check-in per user per sale per day: a repeat returns the existing
 * check-in (no error, no rewrite, no second stamp). Prisma, the loyalty service and Redis are mocks. No network.
 */
var mockPrisma: any = {
  sale: { findUnique: jest.fn() },
  saleCheckin: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../middleware/rateLimitShared', () => ({
  redisIncrWithWindow: jest.fn().mockResolvedValue(null),
  redisGetValue: jest.fn().mockResolvedValue(null),
  redisSetValue: jest.fn().mockResolvedValue(undefined),
}));
var mockAwardStamp = jest.fn();
jest.mock('../services/loyaltyService', () => ({ awardStamp: (...a: any[]) => mockAwardStamp(...a) }));
jest.mock('../services/crewInvasionService', () => ({ checkCrewInvasion: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../lib/socket', () => ({ getIO: jest.fn(() => ({ to: jest.fn().mockReturnValue({ emit: jest.fn() }) })) }));

import { checkinAtSale } from '../controllers/reservationController';
import { __resetQrScanGuardState } from '../services/qrScanGuardService';

const SALE_LAT = 42.2178;
const SALE_LNG = -85.8919;
const HOUR = 60 * 60 * 1000;

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const req = (body: any = {}, over: any = {}) =>
  ({ body: { saleId: 'sale-1', latitude: SALE_LAT, longitude: SALE_LNG, ...body }, user: { id: 'shopper-1' }, ip: '203.0.113.7', ...over }) as any;
const openSale = (over: any = {}) => ({
  id: 'sale-1', status: 'PUBLISHED', lat: SALE_LAT, lng: SALE_LNG,
  startDate: new Date(Date.now() - HOUR), endDate: new Date(Date.now() + 5 * HOUR),
  organizer: { timezone: 'America/Chicago' }, ...over,
});

let warn: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  __resetQrScanGuardState();
  delete process.env.QR_CHECKIN_REQUIRE_LOCATION;
  for (const t of [mockPrisma.sale.findUnique, mockPrisma.saleCheckin.findUnique, mockPrisma.saleCheckin.create, mockPrisma.saleCheckin.update, mockAwardStamp]) t.mockReset();
  mockAwardStamp.mockResolvedValue(undefined);
  mockPrisma.sale.findUnique.mockResolvedValue(openSale());
  mockPrisma.saleCheckin.findUnique.mockResolvedValue(null);
  mockPrisma.saleCheckin.create.mockImplementation(async ({ data }: any) => ({ id: 'ci-1', ...data, checkinAt: new Date() }));
  mockPrisma.saleCheckin.update.mockImplementation(async ({ data }: any) => ({ id: 'ci-1', saleId: 'sale-1', userId: 'shopper-1', ...data }));
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => warn.mockRestore());

describe('checkinAtSale geofence and window (same guard as checkInToSale)', () => {
  it('accepts a check-in at the sale and answers 201 with the check-in row (same shape as before)', async () => {
    const res = makeRes();
    await checkinAtSale(req({ qrScanned: true, qrScanId: 'qr-9' }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0]).toMatchObject({ saleId: 'sale-1', userId: 'shopper-1', latitude: SALE_LAT, longitude: SALE_LNG, qrScanned: true, qrScanId: 'qr-9' });
    expect(mockAwardStamp).toHaveBeenCalledWith('shopper-1', 'ATTEND_SALE', 'sale-1', 'sale-1');
  });

  it('rejects a check-in from far away (403 OUT_OF_RANGE) and records nothing', async () => {
    const res = makeRes();
    await checkinAtSale(req({ latitude: SALE_LAT + 0.5, longitude: SALE_LNG }), res); // about 55 km away
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0]).toMatchObject({ code: 'OUT_OF_RANGE' });
    expect(mockPrisma.saleCheckin.create).not.toHaveBeenCalled();
    expect(mockPrisma.saleCheckin.update).not.toHaveBeenCalled();
    expect(mockAwardStamp).not.toHaveBeenCalled();
  });

  it('rejects outside the sale window (403 SALE_NOT_ACTIVE)', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue(openSale({ startDate: new Date(Date.now() + 48 * HOUR), endDate: new Date(Date.now() + 56 * HOUR) }));
    const res = makeRes();
    await checkinAtSale(req(), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0]).toMatchObject({ code: 'SALE_NOT_ACTIVE' });
    expect(mockAwardStamp).not.toHaveBeenCalled();
  });

  it('rejects an unpublished sale', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue(openSale({ status: 'DRAFT' }));
    const res = makeRes();
    await checkinAtSale(req(), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockPrisma.saleCheckin.create).not.toHaveBeenCalled();
  });

  it('rate limits repeated attempts per user and sale (429)', async () => {
    process.env.QR_SCAN_USER_SALE_MAX_PER_HOUR = '2';
    try {
      const codes: number[] = [];
      for (let i = 0; i < 3; i++) {
        const res = makeRes();
        await checkinAtSale(req(), res);
        codes.push(res.status.mock.calls[0]?.[0] ?? 200);
      }
      expect(codes[2]).toBe(429);
    } finally {
      delete process.env.QR_SCAN_USER_SALE_MAX_PER_HOUR;
    }
  });

  it.each([
    ['a string that is not a number', { latitude: '12abc' }],
    ['latitude out of range', { latitude: 123 }],
    ['longitude missing', { longitude: undefined }],
    ['NaN', { latitude: NaN }],
  ])('400 for %s (coordinates are strict)', async (_label, body) => {
    const res = makeRes();
    await checkinAtSale(req(body), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.sale.findUnique).not.toHaveBeenCalled();
  });

  it('a sale without verified coordinates checks in when the requirement flag is off, and rejects when it is on', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue(openSale({ lat: null, lng: null }));
    const off = makeRes();
    await checkinAtSale(req(), off);
    expect(off.status).toHaveBeenCalledWith(201);

    __resetQrScanGuardState();
    process.env.QR_CHECKIN_REQUIRE_LOCATION = 'true';
    const on = makeRes();
    await checkinAtSale(req(), on);
    expect(on.status).toHaveBeenCalledWith(403);
    expect(on.json.mock.calls[0][0]).toMatchObject({ code: 'SALE_LOCATION_UNVERIFIED' });
  });
});

describe('checkinAtSale: one per user per sale per day, idempotent', () => {
  it('a repeat the same day returns the existing check-in (200), writes nothing and awards no second stamp', async () => {
    const existing = { id: 'ci-0', saleId: 'sale-1', userId: 'shopper-1', latitude: SALE_LAT, longitude: SALE_LNG, qrScanned: false, qrScanId: null, checkinAt: new Date() };
    mockPrisma.saleCheckin.findUnique.mockResolvedValue(existing);
    const res = makeRes();
    await checkinAtSale(req(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(existing);
    expect(mockPrisma.saleCheckin.create).not.toHaveBeenCalled();
    expect(mockPrisma.saleCheckin.update).not.toHaveBeenCalled();
    expect(mockAwardStamp).not.toHaveBeenCalled();
  });

  it('a check-in left from an earlier day is refreshed (new day, new check-in), stamp stays idempotent by saleId', async () => {
    mockPrisma.saleCheckin.findUnique.mockResolvedValue({ id: 'ci-0', saleId: 'sale-1', userId: 'shopper-1', checkinAt: new Date(Date.now() - 48 * HOUR) });
    const res = makeRes();
    await checkinAtSale(req(), res);
    expect(mockPrisma.saleCheckin.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.saleCheckin.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockAwardStamp).toHaveBeenCalledWith('shopper-1', 'ATTEND_SALE', 'sale-1', 'sale-1');
  });

  it('a concurrent double submit (unique violation on create) answers with the winner\'s row, no error', async () => {
    const winner = { id: 'ci-w', saleId: 'sale-1', userId: 'shopper-1', checkinAt: new Date() };
    mockPrisma.saleCheckin.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
    mockPrisma.saleCheckin.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    const res = makeRes();
    await checkinAtSale(req(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(winner);
    expect(mockAwardStamp).not.toHaveBeenCalled();
  });
});
