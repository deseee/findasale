/** friendlyChargeFailureMessage and createPlatformBillingCard customer naming (2026-10-12). */
export {};
var mockCustomersCreate: any = jest.fn();
var mockCardsCreate: any = jest.fn();
jest.mock('square', () => ({ SquareError: class SquareError extends Error { errors?: any[] } }));
jest.mock('../squarePaymentService', () => ({
  toSquareMoney: (n: number) => ({ amount: BigInt(n), currency: 'USD' }),
  buildSquareIdempotencyKey: (parts: string[]) => parts.join('|'),
}));
jest.mock('../../utils/square', () => ({
  getSquarePlatformClient: () => ({ customers: { create: (...a: any[]) => mockCustomersCreate(...a) }, cards: { create: (...a: any[]) => mockCardsCreate(...a) } }),
}));

describe('squareBillingService friendly charge messages and customer naming', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const svc = require('../squareBillingService');

  it('maps known Square codes to friendly text with no raw Square wording', () => {
    for (const code of ['NOT_FOUND', 'CARD_DECLINED', 'GENERIC_DECLINE', 'INSUFFICIENT_FUNDS', 'CARD_EXPIRED', 'NOT_COMPLETED', 'SOMETHING_NEW', undefined]) {
      const m = svc.friendlyChargeFailureMessage(code);
      expect(m.length).toBeGreaterThan(20);
      expect(m).not.toMatch(/did not find|matching card/i);
      expect(m).not.toContain(String.fromCharCode(8212));
    }
  });

  it('createPlatformBillingCard always sends a customer name (Square requires one)', async () => {
    mockCustomersCreate.mockResolvedValue({ customer: { id: 'c1' } });
    mockCardsCreate.mockResolvedValue({ card: { id: 'k1' } });
    await svc.createPlatformBillingCard({ referenceId: 'org1', sourceId: 'cnon:x', note: 'n' });
    expect(mockCustomersCreate.mock.calls[0][0].companyName).toBe('FindA.Sale billing org1');
    await svc.createPlatformBillingCard({ referenceId: 'org1', sourceId: 'cnon:x', note: 'n', displayName: '  Acme Goods ' });
    expect(mockCustomersCreate.mock.calls[1][0].companyName).toBe('Acme Goods');
  });

  it('computeSeatQuote prorates the $20 seat by remaining days and reports the renewal date', () => {
    const now = new Date('2026-10-12T12:00:00.000Z');
    const end = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
    expect(svc.computeSeatQuote(end, now)).toEqual({ amountCents: 1000, renewsOn: end.toISOString(), monthlyCents: 2000 });
    expect(svc.computeSeatQuote(new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000), now).amountCents).toBe(2000);
    expect(svc.computeSeatQuote(new Date(now.getTime() - 1000), now).amountCents).toBe(0);
  });
});
