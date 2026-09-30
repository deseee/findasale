/**
 * squareBillingChargeJob frozen-migration pass (2026-09-29): organizers with a scheduled cancellation
 * must be skipped by the 01:00 UTC frozen pass (they are handled at 02:00 UTC by tierGraceService and
 * must get the "plan has ended" notice, not the "no Square card" text). NOT EXECUTED when written.
 */
const mockOrgFindMany = jest.fn();
const mockOrgUpdateMany = jest.fn();

jest.mock('../lib/prisma', () => ({
  prisma: {
    organizer: {
      findMany: (...a: any[]) => mockOrgFindMany(...a),
      updateMany: (...a: any[]) => mockOrgUpdateMany(...a),
    },
  },
}));
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: jest.fn() } }));
jest.mock('../utils/cronGuard', () => ({ cronGuard: (_o: any, fn: any) => fn }));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn() }));
jest.mock('../lib/syncTier', () => ({ notifyAutoMarkdownsPaused: jest.fn() }));
jest.mock('../services/squareBillingService', () => ({
  SQUARE_TIER_PRICE_CENTS: {},
  HUNT_PASS_PRICE_CENTS: 499,
  BILLING_INTERVAL_DAYS: 30,
  computeNextRetryAt: jest.fn(),
  computeGraceEndsAt: jest.fn(),
  chargeStoredCard: jest.fn(),
}));

import { processFrozenMigrationDeadlines, NOT_SCHEDULED_FOR_CANCELLATION } from '../jobs/squareBillingChargeJob';

describe('processFrozenMigrationDeadlines scheduled-cancel exclusion', () => {
  beforeEach(() => jest.clearAllMocks());

  it('excludes scheduled_for_cancellation organizers but keeps NULL subscriptionStatus rows', async () => {
    mockOrgFindMany.mockResolvedValueOnce([]);
    await processFrozenMigrationDeadlines();
    const where = mockOrgFindMany.mock.calls[0][0].where;
    expect(where.billingProcessor).toBeNull();
    expect(where.OR).toEqual([{ subscriptionStatus: null }, { subscriptionStatus: { not: 'scheduled_for_cancellation' } }]);
    expect(NOT_SCHEDULED_FOR_CANCELLATION.OR).toEqual(where.OR);
  });

  it('applies the same exclusion in the per-organizer conditional guard so a late cancel is not downgraded here', async () => {
    mockOrgFindMany.mockResolvedValueOnce([{ id: 'o1', userId: 'u1', businessName: 'Biz', user: { email: 'a@b.c', name: 'A' } }]);
    mockOrgUpdateMany.mockResolvedValueOnce({ count: 0 }); // guard did not match (organizer scheduled cancel meanwhile)
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await processFrozenMigrationDeadlines();
    const guardWhere = mockOrgUpdateMany.mock.calls[0][0].where;
    expect(guardWhere.id).toBe('o1');
    expect(guardWhere.OR).toEqual(NOT_SCHEDULED_FOR_CANCELLATION.OR);
    expect(mockOrgUpdateMany).toHaveBeenCalledTimes(1); // no downgrade writes after a failed guard
    log.mockRestore();
  });
});
