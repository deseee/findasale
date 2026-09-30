/**
 * squareBillingService (2026-09-29): upgrade proration and the requireCompleted charge mode.
 * The Square client is mocked; no real call can happen.
 */
const mockPaymentsCreate = jest.fn();

jest.mock('square', () => ({ SquareError: class SquareError extends Error { errors?: any[] } }));
jest.mock('../../utils/square', () => ({
  getSquarePlatformClient: () => ({ payments: { create: (...a: any[]) => mockPaymentsCreate(...a) } }),
}));
jest.mock('../squarePaymentService', () => ({
  toSquareMoney: (n: number) => ({ amount: BigInt(n), currency: 'USD' }),
  buildSquareIdempotencyKey: (parts: string[]) => parts.join('|'),
}));

import { computeUpgradeProrationCents, chargeStoredCard, SQUARE_TIER_PRICE_CENTS } from '../squareBillingService';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-10T12:00:00.000Z');

describe('computeUpgradeProrationCents', () => {
  it('full period left charges the whole price difference', () => {
    expect(computeUpgradeProrationCents('PRO', 'TEAMS', new Date(now.getTime() + 30 * DAY), now)).toBe(SQUARE_TIER_PRICE_CENTS.TEAMS - SQUARE_TIER_PRICE_CENTS.PRO);
  });
  it('half the period left charges half the difference', () => {
    expect(computeUpgradeProrationCents('PRO', 'TEAMS', new Date(now.getTime() + 15 * DAY), now)).toBe(2500);
  });
  it('rounds remaining time UP to whole days and never goes below one day', () => {
    expect(computeUpgradeProrationCents('PRO', 'TEAMS', new Date(now.getTime() + 1000), now)).toBe(Math.round(5000 / 30));
    expect(computeUpgradeProrationCents('PRO', 'TEAMS', new Date(now.getTime() + 14 * DAY + 1000), now)).toBe(2500);
  });
  it('caps at one interval even if the period end is further out', () => {
    expect(computeUpgradeProrationCents('PRO', 'TEAMS', new Date(now.getTime() + 90 * DAY), now)).toBe(5000);
  });
  it('is 0 for a period that already ended, a same-tier change, or a downgrade', () => {
    expect(computeUpgradeProrationCents('PRO', 'TEAMS', new Date(now.getTime() - DAY), now)).toBe(0);
    expect(computeUpgradeProrationCents('PRO', 'PRO', new Date(now.getTime() + DAY), now)).toBe(0);
    expect(computeUpgradeProrationCents('TEAMS', 'PRO', new Date(now.getTime() + DAY), now)).toBe(0);
  });
});

describe('chargeStoredCard requireCompleted', () => {
  const params = { customerId: 'c', cardId: 'k', amountCents: 2900, idempotencyParts: ['a'], note: 'n', referenceId: 'r' };
  beforeEach(() => { process.env.SQUARE_PLATFORM_LOCATION_ID = 'LOC'; mockPaymentsCreate.mockReset(); });

  it('COMPLETED is success and reports its status', async () => {
    mockPaymentsCreate.mockResolvedValue({ payment: { id: 'p1', status: 'COMPLETED' } });
    expect(await chargeStoredCard({ ...params, requireCompleted: true })).toEqual({ ok: true, paymentId: 'p1', status: 'COMPLETED' });
  });
  it('APPROVED is refused when requireCompleted is set, and still accepted by default (Hunt Pass behavior unchanged)', async () => {
    mockPaymentsCreate.mockResolvedValue({ payment: { id: 'p2', status: 'APPROVED' } });
    expect((await chargeStoredCard({ ...params, requireCompleted: true })).ok).toBe(false);
    expect((await chargeStoredCard(params)).ok).toBe(true);
  });
  it('FAILED, CANCELED and a missing payment id are never success', async () => {
    for (const payment of [{ id: 'p3', status: 'FAILED' }, { id: 'p4', status: 'CANCELED' }, { status: 'COMPLETED' }, undefined]) {
      mockPaymentsCreate.mockResolvedValue({ payment });
      expect((await chargeStoredCard({ ...params, requireCompleted: true })).ok).toBe(false);
    }
  });
  it('a thrown Square error is a failure with a message, never a success', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockPaymentsCreate.mockRejectedValue(new Error('network'));
    const r = await chargeStoredCard({ ...params, requireCompleted: true });
    expect(r.ok).toBe(false);
    expect((r as any).message).toBe('Card could not be processed. Please try again.');
  });
});
