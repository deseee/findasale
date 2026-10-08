const mockFindMany = jest.fn();
const mockResync = jest.fn();
const mockRevise = jest.fn();
jest.mock('../../index', () => ({ prisma: { item: { findMany: (...a: any[]) => mockFindMany(...a) } } }));
jest.mock('../../controllers/ebayController', () => ({
  resyncItemShippingPolicy: (...a: any[]) => mockResync(...a),
  reviseNativeListingShippingPolicy: (...a: any[]) => mockRevise(...a),
}));
jest.mock('../../lib/ebayRateLimiter', () => ({ isEbayRateLimited: () => false }));

import { backfillStaleWeightTierPoliciesSweep } from '../backfillStaleWeightTierPolicies';

const row = (id: string) => ({ id, title: `t-${id}`, ebayFulfillmentPolicyId: null, organizerId: 'o1', sale: null });

beforeEach(() => {
  mockFindMany.mockReset();
  mockResync.mockReset();
  mockRevise.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

it('reports a skippedReasons histogram and non-repinned examples with reasons', async () => {
  mockFindMany
    .mockResolvedValueOnce([row('a')]) // offer-based
    .mockResolvedValueOnce([row('b'), row('c'), row('d'), row('e')]); // native
  mockResync.mockResolvedValue({ changed: false, reason: 'already-current' });
  mockRevise
    .mockResolvedValueOnce({ changed: true, reason: 'repinned' })
    .mockResolvedValueOnce({ changed: false, reason: 'no-organizer' })
    .mockResolvedValueOnce({ changed: false, reason: 'no-organizer' })
    .mockRejectedValueOnce(new Error('boom'));

  const r = await backfillStaleWeightTierPoliciesSweep({});
  expect(r.repinned).toBe(1);
  expect(r.nativeRepinned).toBe(1);
  expect(r.skipped).toBe(4);
  expect(r.skippedReasons).toEqual({ 'already-current': 1, 'no-organizer': 2, exception: 1 });
  const skippedEx = r.examples.filter(e => !e.repinned);
  expect(skippedEx).toHaveLength(4);
  expect(skippedEx.find(e => e.itemId === 'c')?.reason).toBe('no-organizer');
  expect(r.examples.find(e => e.itemId === 'b')?.repinned).toBe(true);
});

it('dry run returns an empty skippedReasons and unchanged counters', async () => {
  mockFindMany.mockResolvedValueOnce([row('a')]).mockResolvedValueOnce([row('b')]);
  const r = await backfillStaleWeightTierPoliciesSweep({ dryRun: true });
  expect(r.skippedReasons).toEqual({});
  expect(r.skipped).toBe(0);
  expect(r.candidates).toBe(2);
});

it('scopes an organizerId sweep to both sale items and inventory (no-sale) items', async () => {
  mockFindMany.mockResolvedValue([]);
  await backfillStaleWeightTierPoliciesSweep({ organizerId: 'o1', dryRun: true });
  const where = mockFindMany.mock.calls[0][0].where;
  expect(JSON.stringify(where)).toContain('"saleId":null,"organizerId":"o1"');
});
