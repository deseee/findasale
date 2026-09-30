/**
 * findRecentCompletedSubscribeCharge (2026-09-29, tier-blind since 2026-09-30): the query is scoped to
 * organizer + COMPLETED + SUBSCRIBE + the `subscribe:` prefix containing the period end + the last 24h, and
 * maps the row (including the tier that was PAID) to the caller's shape.
 */
const mockFindFirst = jest.fn();
jest.mock('../../lib/prisma', () => ({
  prisma: { organizerBillingCharge: { findFirst: (...a: any[]) => mockFindFirst(...a) } },
}));

import { findRecentCompletedSubscribeCharge, SUBSCRIBE_REAPPLY_WINDOW_MS } from '../organizerBillingLedger';

beforeEach(() => jest.clearAllMocks());

describe('findRecentCompletedSubscribeCharge', () => {
  it('queries only COMPLETED SUBSCRIBE rows of this organizer + period end within 24h, with NO tier filter', async () => {
    mockFindFirst.mockResolvedValue(null);
    const now = new Date('2026-09-29T00:10:00.000Z');
    const out = await findRecentCompletedSubscribeCharge({ organizerId: 'org_1', periodEndKey: 'none', now });
    expect(out).toBeNull();
    const arg = mockFindFirst.mock.calls[0][0];
    expect(arg.where.organizerId).toBe('org_1');
    expect(arg.where.kind).toBe('SUBSCRIBE');
    expect(arg.where).not.toHaveProperty('tier');
    expect(arg.where.status).toBe('COMPLETED');
    expect(arg.where.periodKey).toEqual({ startsWith: 'subscribe:', contains: ':none:' });
    expect(arg.where.createdAt.gte.getTime()).toBe(now.getTime() - SUBSCRIBE_REAPPLY_WINDOW_MS);
    expect(SUBSCRIBE_REAPPLY_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
    expect(arg.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('a stored period end is part of the prefix, so an activated plan (moved period end) cannot match', async () => {
    mockFindFirst.mockResolvedValue(null);
    await findRecentCompletedSubscribeCharge({ organizerId: 'org_1', periodEndKey: '2026-09-01T00:00:00.000Z' });
    expect(mockFindFirst.mock.calls[0][0].where.periodKey).toEqual({ startsWith: 'subscribe:', contains: ':2026-09-01T00:00:00.000Z:' });
  });

  it('maps a hit to id, exact periodKey, payment id and the tier + amount that were PAID', async () => {
    mockFindFirst.mockResolvedValue({ id: 'chg_9', periodKey: 'subscribe:none:20260928', squarePaymentId: 'pay_9', tier: 'PRO', amountCents: 2900 });
    expect(await findRecentCompletedSubscribeCharge({ organizerId: 'org_1', periodEndKey: 'none' })).toEqual({
      id: 'chg_9',
      periodKey: 'subscribe:none:20260928',
      paymentId: 'pay_9',
      tier: 'PRO',
      amountCents: 2900,
    });
  });
});
