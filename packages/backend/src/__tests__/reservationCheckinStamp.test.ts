/**
 * reservationController.checkinAtSale: Sale Passport stamp (2026-09-29). Prisma and the loyalty
 * service are mocked; NOT EXECUTED when written (jest cannot run on the authoring device), CI is
 * the first real run.
 *
 * checkinAtSale is the second check-in path (saleController.checkInToSale is the first). After a
 * successful check-in it must award the ATTEND_SALE stamp with the same call shape and
 * idempotency key (refId = saleId) as the first path, and a stamp failure must never change the
 * response.
 */

var mockPrisma: any = {
  sale: { findUnique: jest.fn() },
  saleCheckin: { upsert: jest.fn() },
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

var mockAwardStamp = jest.fn();
jest.mock('../services/loyaltyService', () => ({
  awardStamp: (...args: any[]) => mockAwardStamp(...args),
}));

jest.mock('../services/crewInvasionService', () => ({
  checkCrewInvasion: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../lib/socket', () => ({
  getIO: jest.fn(() => ({ to: jest.fn().mockReturnValue({ emit: jest.fn() }) })),
}));

import { checkinAtSale } from '../controllers/reservationController';

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const makeReq = (body: any = { saleId: 'sale-1', latitude: 42.2, longitude: -85.9 }) =>
  ({ body, user: { id: 'shopper-1' } } as any);

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.sale.findUnique.mockReset();
  mockPrisma.saleCheckin.upsert.mockReset();
  mockAwardStamp.mockReset();
  mockAwardStamp.mockResolvedValue(undefined);
  mockPrisma.sale.findUnique.mockResolvedValue({ id: 'sale-1' });
  mockPrisma.saleCheckin.upsert.mockResolvedValue({ id: 'ci-1', saleId: 'sale-1', userId: 'shopper-1' });
});

describe('reservationController.checkinAtSale passport stamp', () => {
  it('awards ATTEND_SALE with refId = saleId (idempotent, same shape as the other check-in path)', async () => {
    const res = makeRes();
    await checkinAtSale(makeReq(), res);
    expect(mockAwardStamp).toHaveBeenCalledTimes(1);
    expect(mockAwardStamp).toHaveBeenCalledWith('shopper-1', 'ATTEND_SALE', 'sale-1', 'sale-1');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ id: 'ci-1', saleId: 'sale-1', userId: 'shopper-1' });
  });

  it('a stamp failure never changes the response', async () => {
    mockAwardStamp.mockRejectedValue(new Error('passport down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = makeRes();
    await checkinAtSale(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(201);
    spy.mockRestore();
  });

  it('awards nothing when the sale does not exist', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue(null);
    const res = makeRes();
    await checkinAtSale(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockAwardStamp).not.toHaveBeenCalled();
  });

  it('awards nothing on a bad request', async () => {
    const res = makeRes();
    await checkinAtSale(makeReq({ saleId: 'sale-1' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockAwardStamp).not.toHaveBeenCalled();
  });

  it('awards nothing for an unauthenticated caller', async () => {
    const res = makeRes();
    await checkinAtSale({ body: { saleId: 'sale-1', latitude: 1, longitude: 2 } } as any, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockAwardStamp).not.toHaveBeenCalled();
  });
});
