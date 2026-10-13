/**
 * Square rejects customers.create with none of given_name / family_name / company_name /
 * email_address / phone_number (confirmed against the sandbox 2026-10-12). The booth-cart and
 * booth-fee platform customers must always send a name.
 */
export {};
var mockCustomersCreate: any = jest.fn();
var mockCardsCreate: any = jest.fn();
jest.mock('square', () => ({ SquareError: class SquareError extends Error { errors?: any[] } }));
jest.mock('../../lib/prisma', () => ({ prisma: {} }));
jest.mock('../squarePaymentService', () => ({
  toSquareMoney: (n: number) => ({ amount: BigInt(n), currency: 'USD' }),
  buildSquareIdempotencyKey: (parts: string[]) => parts.join('|'),
}));
jest.mock('../../utils/square', () => ({
  getSquarePlatformClient: () => ({ customers: { create: (...a: any[]) => mockCustomersCreate(...a) }, cards: { create: (...a: any[]) => mockCardsCreate(...a) } }),
  getSquareClientForMerchant: () => ({ customers: { create: (...a: any[]) => mockCustomersCreate(...a) } }),
}));

describe('squareVendorBoothCartService customer creation always sends a name', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const svc = require('../squareVendorBoothCartService');
  beforeEach(() => {
    jest.clearAllMocks();
    mockCustomersCreate.mockResolvedValue({ customer: { id: 'c1' } });
    mockCardsCreate.mockResolvedValue({ card: { id: 'k1' } });
  });

  it('createSquareSharedCardForCart', async () => {
    await svc.createSquareSharedCardForCart({ cartTransactionId: 'cart1', sourceId: 'cnon:x' });
    expect(mockCustomersCreate.mock.calls[0][0].companyName).toBe('FindA.Sale booth cart cart1');
  });

  it('createSquareSharedCardForBoothFee', async () => {
    await svc.createSquareSharedCardForBoothFee({ vendorBoothId: 'booth1', sourceId: 'cnon:x' });
    expect(mockCustomersCreate.mock.calls[0][0].companyName).toBe('FindA.Sale booth booth1');
  });
});
