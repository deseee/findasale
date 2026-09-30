/**
 * tierLapseService (2026-09-29, Patrick D2). NOT EXECUTED when written (jest cannot run on the
 * authoring device); CI is the first real run.
 *
 * Covers computeOrganizerEntitlement (real paid time from the Organizer row) and the fix that
 * keeps Square-billed organizers out of the UserRoleSubscription lapse scan.
 */
const mockFindManyRoleSubs = jest.fn();

jest.mock('../../lib/prisma', () => ({
  prisma: { userRoleSubscription: { findMany: (...a: any[]) => mockFindManyRoleSubs(...a) } },
}));

import { computeOrganizerEntitlement, getLapsedSubscriptions } from '../tierLapseService';

const now = new Date('2026-10-10T12:00:00Z');
const days = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

describe('computeOrganizerEntitlement', () => {
  it('SIMPLE (or unknown) tier has no paid entitlement', () => {
    expect(computeOrganizerEntitlement({ subscriptionTier: 'SIMPLE', subscriptionStatus: 'active', billingCurrentPeriodEnd: days(5) }, now))
      .toEqual({ entitlementEndsAt: null, inDunning: false });
    expect(computeOrganizerEntitlement({}, now)).toEqual({ entitlementEndsAt: null, inDunning: false });
  });

  it('payment failed inside the dunning window keeps the tier until billingGraceEndsAt', () => {
    const r = computeOrganizerEntitlement(
      { subscriptionTier: 'PRO', subscriptionStatus: 'past_due', billingCurrentPeriodEnd: days(-2), billingGraceEndsAt: days(5) },
      now
    );
    expect(r.inDunning).toBe(true);
    expect(r.entitlementEndsAt?.getTime()).toBe(days(5).getTime());
  });

  it('dunning window already over means no entitlement', () => {
    expect(computeOrganizerEntitlement({ subscriptionTier: 'PRO', subscriptionStatus: 'past_due', billingGraceEndsAt: days(-1) }, now))
      .toEqual({ entitlementEndsAt: null, inDunning: false });
  });

  it('active and scheduled_for_cancellation run until billingCurrentPeriodEnd', () => {
    for (const status of ['active', 'scheduled_for_cancellation']) {
      const r = computeOrganizerEntitlement({ subscriptionTier: 'TEAMS', subscriptionStatus: status, billingCurrentPeriodEnd: days(12) }, now);
      expect(r.entitlementEndsAt?.getTime()).toBe(days(12).getTime());
      expect(r.inDunning).toBe(false);
    }
  });

  it('a finished trial or a past period end has no entitlement', () => {
    expect(computeOrganizerEntitlement({ subscriptionTier: 'PRO', subscriptionStatus: 'trialing', trialEndsAt: days(-1), billingCurrentPeriodEnd: days(-1) }, now).entitlementEndsAt).toBeNull();
    expect(computeOrganizerEntitlement({ subscriptionTier: 'PRO', subscriptionStatus: 'active', billingCurrentPeriodEnd: days(-3) }, now).entitlementEndsAt).toBeNull();
  });

  it('a running trial is entitled until the later of trial end and period end', () => {
    const r = computeOrganizerEntitlement({ subscriptionTier: 'PRO', subscriptionStatus: 'trialing', trialEndsAt: days(3), billingCurrentPeriodEnd: days(3) }, now);
    expect(r.entitlementEndsAt?.getTime()).toBe(days(3).getTime());
  });

  it('paid tier with no known end date (frozen, no dates) reports no end date rather than inventing one', () => {
    expect(computeOrganizerEntitlement({ subscriptionTier: 'PRO', subscriptionStatus: 'active' }, now))
      .toEqual({ entitlementEndsAt: null, inDunning: false });
  });

  it('accepts ISO strings for dates', () => {
    const r = computeOrganizerEntitlement({ subscriptionTier: 'PRO', subscriptionStatus: 'active', billingCurrentPeriodEnd: days(4).toISOString() }, now);
    expect(r.entitlementEndsAt?.getTime()).toBe(days(4).getTime());
  });
});

describe('getLapsedSubscriptions', () => {
  it('excludes Square-billed organizers (their lifecycle belongs to squareBillingChargeJob)', async () => {
    mockFindManyRoleSubs.mockResolvedValue([]);
    await getLapsedSubscriptions();
    const where = mockFindManyRoleSubs.mock.calls[0][0].where;
    expect(where.NOT).toEqual({ user: { organizer: { billingProcessor: 'square' } } });
    expect(where.tierLapsedAt).toBeNull();
    expect(where.role).toBe('ORGANIZER');
  });
});
