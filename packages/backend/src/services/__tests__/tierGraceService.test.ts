/**
 * tierGraceService (2026-09-29, Patrick D1/D2/D6). NOT EXECUTED when written (jest cannot run on
 * the authoring device); CI is the first real run.
 *
 * Covers: finalizeGracePeriod only removes staff / locks items when the owner is really off the
 * tier that allowed them (fix 1), clearGracePeriod restores items for any paid tier but staff only
 * on TEAMS and only members that were removed (fix 2), and the DB-only scheduled-cancellation
 * downgrade pass used for organizers without a Square billing schedule (fix 6).
 */
const mockOrganizerFindUnique = jest.fn();
const mockOrganizerFindMany = jest.fn();
const mockOrganizerUpdate = jest.fn();
const mockOrganizerUpdateMany = jest.fn();
const mockItemUpdateMany = jest.fn();
const mockMemberUpdateMany = jest.fn();
const mockRoleSubUpdateMany = jest.fn();
const mockCreateNotification = jest.fn();
const mockNotifyMarkdownsPaused = jest.fn();

jest.mock('../../lib/prisma', () => ({
  prisma: {
    organizer: {
      findUnique: (...a: any[]) => mockOrganizerFindUnique(...a),
      findMany: (...a: any[]) => mockOrganizerFindMany(...a),
      update: (...a: any[]) => mockOrganizerUpdate(...a),
      updateMany: (...a: any[]) => mockOrganizerUpdateMany(...a),
    },
    item: { updateMany: (...a: any[]) => mockItemUpdateMany(...a) },
    workspaceMember: { updateMany: (...a: any[]) => mockMemberUpdateMany(...a) },
    userRoleSubscription: { updateMany: (...a: any[]) => mockRoleSubUpdateMany(...a) },
  },
}));
jest.mock('../../lib/notificationService', () => ({
  createNotification: (...a: any[]) => mockCreateNotification(...a),
}));
jest.mock('../../lib/syncTier', () => ({
  notifyAutoMarkdownsPaused: (...a: any[]) => mockNotifyMarkdownsPaused(...a),
}));

import {
  finalizeGracePeriod,
  clearGracePeriod,
  downgradeScheduledCancelFrozenOrganizers,
} from '../tierGraceService';

const member = (id: string, graceRemovedAt: Date | null = null) => ({ id, graceRemovedAt });

const organizerRow = (tier: string, members: any[] = [], items: any[] = []) => ({
  id: 'org_1',
  userId: 'user_1',
  subscriptionTier: tier,
  sales: [{ items }],
  workspace: { members },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateNotification.mockResolvedValue(undefined);
  mockMemberUpdateMany.mockResolvedValue({ count: 0 });
  mockOrganizerUpdate.mockResolvedValue({});
  mockOrganizerUpdateMany.mockResolvedValue({ count: 1 });
  mockRoleSubUpdateMany.mockResolvedValue({ count: 1 });
  mockNotifyMarkdownsPaused.mockResolvedValue(undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('finalizeGracePeriod', () => {
  it('leaves every staff member in place when the owner is still on TEAMS, and clears the grace markers', async () => {
    mockOrganizerFindUnique.mockResolvedValue(organizerRow('TEAMS', [member('m1'), member('m2')]));
    const result = await finalizeGracePeriod('org_1');
    expect(mockMemberUpdateMany).not.toHaveBeenCalled();
    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(mockOrganizerUpdate).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      data: { graceEndAt: null, graceTierBefore: null },
    });
    expect(result).toEqual({ itemsLocked: 0, staffRemoved: 0 });
  });

  it('removes staff access when the owner is on SIMPLE', async () => {
    mockOrganizerFindUnique.mockResolvedValue(organizerRow('SIMPLE', [member('m1'), member('m2')]));
    const result = await finalizeGracePeriod('org_1');
    expect(mockMemberUpdateMany).toHaveBeenCalledTimes(1);
    const arg = mockMemberUpdateMany.mock.calls[0][0];
    expect(arg.where.id.in).toEqual(['m1', 'm2']);
    expect(arg.data.graceRemovedAt).toBeInstanceOf(Date);
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification.mock.calls[0][0].body).toContain('2 team members lost access');
    expect(mockCreateNotification.mock.calls[0][0].link).toBe('/organizer/subscription');
    expect(result).toEqual({ itemsLocked: 0, staffRemoved: 2 });
  });

  it('removes staff when the owner is on PRO (PRO has no staff seats)', async () => {
    mockOrganizerFindUnique.mockResolvedValue(organizerRow('PRO', [member('m1')]));
    const result = await finalizeGracePeriod('org_1');
    expect(mockMemberUpdateMany).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ itemsLocked: 0, staffRemoved: 1 });
  });

  it('does not overwrite the timestamp of a member who was already removed', async () => {
    mockOrganizerFindUnique.mockResolvedValue(
      organizerRow('SIMPLE', [member('m1', new Date('2026-01-01')), member('m2')])
    );
    await finalizeGracePeriod('org_1');
    expect(mockMemberUpdateMany.mock.calls[0][0].where.id.in).toEqual(['m2']);
  });

  it('locks nothing on SIMPLE today (item cap is MAX_SAFE_INTEGER) and nothing on a paid tier', async () => {
    const items = [1, 2, 3].map((n) => ({ id: `i${n}`, createdAt: new Date(2026, 0, n) }));
    mockOrganizerFindUnique.mockResolvedValue(organizerRow('SIMPLE', [], items));
    expect(await finalizeGracePeriod('org_1')).toEqual({ itemsLocked: 0, staffRemoved: 0 });
    mockOrganizerFindUnique.mockResolvedValue(organizerRow('PRO', [], items));
    expect(await finalizeGracePeriod('org_1')).toEqual({ itemsLocked: 0, staffRemoved: 0 });
    expect(mockItemUpdateMany).not.toHaveBeenCalled();
  });

  it('returns quietly for an unknown organizer', async () => {
    mockOrganizerFindUnique.mockResolvedValue(null);
    expect(await finalizeGracePeriod('missing')).toBeUndefined();
    expect(mockOrganizerUpdate).not.toHaveBeenCalled();
  });
});

describe('clearGracePeriod', () => {
  const lockedRow = (members: any[]) => ({
    id: 'org_1',
    userId: 'user_1',
    sales: [{ items: [{ id: 'i1' }, { id: 'i2' }] }],
    workspace: { members },
  });

  it('restores locked items and only the removed members when re-subscribing to TEAMS', async () => {
    mockOrganizerFindUnique.mockResolvedValue(
      lockedRow([member('m1', new Date('2026-01-01')), member('m2', null)])
    );
    mockMemberUpdateMany.mockResolvedValue({ count: 1 });
    const result = await clearGracePeriod('org_1', 'TEAMS');
    expect(mockItemUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['i1', 'i2'] } },
      data: { status: 'AVAILABLE', graceLockedAt: null, graceLockedReason: null },
    });
    expect(mockMemberUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['m1'] } },
      data: { graceRemovedAt: null, accessRestored: true },
    });
    expect(result).toEqual({ itemsRestored: 2, membersRestored: 1 });
  });

  it('restores items but NOT staff when re-subscribing to PRO (staff need TEAMS)', async () => {
    mockOrganizerFindUnique.mockResolvedValue(lockedRow([member('m1', new Date('2026-01-01'))]));
    const result = await clearGracePeriod('org_1', 'PRO');
    expect(mockItemUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockMemberUpdateMany).not.toHaveBeenCalled();
    expect(result).toEqual({ itemsRestored: 2, membersRestored: 0 });
    expect(mockOrganizerUpdate).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      data: { graceEndAt: null, graceTierBefore: null, graceNotificationsCount: 0 },
    });
  });

  it('without a tier argument keeps the legacy behavior (restore removed staff)', async () => {
    mockOrganizerFindUnique.mockResolvedValue(lockedRow([member('m1', new Date('2026-01-01'))]));
    mockMemberUpdateMany.mockResolvedValue({ count: 1 });
    const result = await clearGracePeriod('org_1');
    expect(result).toEqual({ itemsRestored: 2, membersRestored: 1 });
  });

  it('touches no member rows when nobody was removed', async () => {
    mockOrganizerFindUnique.mockResolvedValue(lockedRow([member('m1', null)]));
    await clearGracePeriod('org_1', 'TEAMS');
    expect(mockMemberUpdateMany).not.toHaveBeenCalled();
  });
});

describe('downgradeScheduledCancelFrozenOrganizers', () => {
  const now = new Date('2026-10-30T02:00:00Z');

  it('scans only scheduled cancellations of paid tiers that are not Square-billed and are due', async () => {
    mockOrganizerFindMany.mockResolvedValue([]);
    const result = await downgradeScheduledCancelFrozenOrganizers(now);
    expect(result).toEqual({ checked: 0, downgraded: 0 });
    const where = mockOrganizerFindMany.mock.calls[0][0].where;
    expect(where.subscriptionStatus).toBe('scheduled_for_cancellation');
    expect(where.subscriptionTier).toEqual({ in: ['PRO', 'TEAMS'] });
    expect(where.billingCurrentPeriodEnd).toEqual({ lte: now });
    expect(where.OR).toEqual([{ billingProcessor: null }, { billingProcessor: { not: 'square' } }]);
  });

  it('downgrades a due organizer to SIMPLE with the same fields downgradeOrganizerToSimple writes, then notifies', async () => {
    mockOrganizerFindMany.mockResolvedValue([{ id: 'org_1', userId: 'user_1', subscriptionTier: 'PRO' }]);
    const result = await downgradeScheduledCancelFrozenOrganizers(now);
    expect(result).toEqual({ checked: 1, downgraded: 1 });
    const upd = mockOrganizerUpdateMany.mock.calls[0][0];
    expect(upd.where).toMatchObject({ id: 'org_1', subscriptionStatus: 'scheduled_for_cancellation' });
    expect(upd.data).toMatchObject({
      subscriptionTier: 'SIMPLE',
      subscriptionStatus: 'canceled',
      billingCurrentPeriodEnd: null,
      billingDunningFailCount: 0,
      billingNextRetryAt: null,
      billingGraceEndsAt: null,
      billingLastFailureReason: null,
      tokenVersion: { increment: 1 },
    });
    expect(mockRoleSubUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', role: 'ORGANIZER' },
      data: { subscriptionTier: 'SIMPLE', subscriptionStatus: null, tierLapsedAt: now },
    });
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockNotifyMarkdownsPaused).toHaveBeenCalledWith('org_1');
    // no member rows and no items are touched by a cancellation downgrade
    expect(mockMemberUpdateMany).not.toHaveBeenCalled();
    expect(mockItemUpdateMany).not.toHaveBeenCalled();
  });

  it('skips an organizer who undid the cancellation between the scan and their turn (conditional update matched nothing)', async () => {
    mockOrganizerFindMany.mockResolvedValue([{ id: 'org_1', userId: 'user_1', subscriptionTier: 'PRO' }]);
    mockOrganizerUpdateMany.mockResolvedValue({ count: 0 });
    const result = await downgradeScheduledCancelFrozenOrganizers(now);
    expect(result).toEqual({ checked: 1, downgraded: 0 });
    expect(mockRoleSubUpdateMany).not.toHaveBeenCalled();
    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(mockNotifyMarkdownsPaused).not.toHaveBeenCalled();
  });

  it('one failing organizer does not stop the rest', async () => {
    mockOrganizerFindMany.mockResolvedValue([
      { id: 'org_bad', userId: 'u_bad', subscriptionTier: 'PRO' },
      { id: 'org_ok', userId: 'u_ok', subscriptionTier: 'TEAMS' },
    ]);
    mockOrganizerUpdateMany
      .mockRejectedValueOnce(new Error('db blip'))
      .mockResolvedValueOnce({ count: 1 });
    const result = await downgradeScheduledCancelFrozenOrganizers(now);
    expect(result).toEqual({ checked: 2, downgraded: 1 });
  });
});
