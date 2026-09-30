/**
 * finalizeGracePeriod item cap (2026-09-29). The real caps are Number.MAX_SAFE_INTEGER today, so this
 * file mocks the tier limits with a cap of 3 to prove the machinery is safe if a cap ever returns:
 * the cap is applied PER SALE, only AVAILABLE / ACTIVE items count, SOLD / RESERVED / INVOICE_ISSUED
 * (and any other non-live status) are never touched, and the NEWEST items beyond the cap are locked.
 * The old code sliced the pooled items of every sale and would fail the multi-sale and mixed-status
 * cases below.
 */
const mockOrganizerFindUnique = jest.fn();
const mockOrganizerUpdate = jest.fn();
const mockItemUpdateMany = jest.fn();
const mockMemberUpdateMany = jest.fn();
const mockCreateNotification = jest.fn();

jest.mock('../../constants/tierLimits', () => ({
  TIER_LIMITS: {
    SIMPLE: { itemsPerSale: 3 },
    PRO: { itemsPerSale: Number.MAX_SAFE_INTEGER },
    TEAMS: { itemsPerSale: Number.MAX_SAFE_INTEGER },
    ENTERPRISE: { itemsPerSale: Number.MAX_SAFE_INTEGER },
  },
}));
jest.mock('../../lib/prisma', () => ({
  prisma: {
    organizer: {
      findUnique: (...a: any[]) => mockOrganizerFindUnique(...a),
      update: (...a: any[]) => mockOrganizerUpdate(...a),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    item: { updateMany: (...a: any[]) => mockItemUpdateMany(...a) },
    workspaceMember: { updateMany: (...a: any[]) => mockMemberUpdateMany(...a) },
    userRoleSubscription: { updateMany: jest.fn() },
  },
}));
jest.mock('../../lib/notificationService', () => ({
  createNotification: (...a: any[]) => mockCreateNotification(...a),
}));
jest.mock('../../lib/syncTier', () => ({ notifyAutoMarkdownsPaused: jest.fn() }));

import { finalizeGracePeriod, selectItemsOverCap } from '../tierGraceService';

const item = (id: string, status: string, day: number) => ({ id, status, createdAt: new Date(2026, 0, day) });

const organizerWith = (tier: string, sales: any[]) => ({
  id: 'org_1',
  userId: 'user_1',
  subscriptionTier: tier,
  sales,
  workspace: { members: [] },
});

const lockedIds = (): string[] =>
  mockItemUpdateMany.mock.calls.flatMap((c: any[]) => c[0].where.id.in as string[]).sort();

beforeEach(() => {
  jest.clearAllMocks();
  mockItemUpdateMany.mockResolvedValue({ count: 0 });
  mockOrganizerUpdate.mockResolvedValue({});
  mockMemberUpdateMany.mockResolvedValue({ count: 0 });
  mockCreateNotification.mockResolvedValue(undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('finalizeGracePeriod with a finite per-sale cap of 3', () => {
  it('applies the cap per sale: a sale under the cap loses nothing, a sale over it loses only its newest items', async () => {
    mockOrganizerFindUnique.mockResolvedValue(
      organizerWith('SIMPLE', [
        // sale A: 5 available items, cap 3 -> the 2 newest (a4, a5) are locked
        { items: [1, 2, 3, 4, 5].map((n) => item(`a${n}`, 'AVAILABLE', n)) },
        // sale B: 2 available items, under the cap -> nothing locked even though 7 items exist overall
        { items: [1, 2].map((n) => item(`b${n}`, 'AVAILABLE', n + 10)) },
      ])
    );
    const result = await finalizeGracePeriod('org_1');
    expect(lockedIds()).toEqual(['a4', 'a5']);
    expect(result).toEqual({ itemsLocked: 2, staffRemoved: 0 });
    const data = mockItemUpdateMany.mock.calls[0][0].data;
    expect(data.status).toBe('GRACE_LOCKED');
    expect(data.graceLockedReason).toBe('items_over_limit');
  });

  it('only AVAILABLE / ACTIVE items count toward the cap, and SOLD / RESERVED / INVOICE_ISSUED are never locked', async () => {
    mockOrganizerFindUnique.mockResolvedValue(
      organizerWith('SIMPLE', [
        {
          items: [
            item('sold1', 'SOLD', 1),
            item('sold2', 'SOLD', 2),
            item('res1', 'RESERVED', 3),
            item('inv1', 'INVOICE_ISSUED', 4),
            item('don1', 'DONATED', 5),
            item('end1', 'AUCTION_ENDED', 6),
            item('lock1', 'GRACE_LOCKED', 7),
            // 4 live items (newest by createdAt): cap 3 -> only the newest live one is locked
            item('live1', 'AVAILABLE', 8),
            item('live2', 'ACTIVE', 9),
            item('live3', 'AVAILABLE', 10),
            item('live4', 'AVAILABLE', 11),
          ],
        },
      ])
    );
    const result = await finalizeGracePeriod('org_1');
    expect(lockedIds()).toEqual(['live4']);
    for (const untouched of ['sold1', 'sold2', 'res1', 'inv1', 'don1', 'end1', 'lock1']) {
      expect(lockedIds()).not.toContain(untouched);
    }
    expect(result).toEqual({ itemsLocked: 1, staffRemoved: 0 });
    // the write itself is restricted to live statuses, so an item that just sold cannot be locked
    expect(mockItemUpdateMany.mock.calls[0][0].where.status).toEqual({ in: ['AVAILABLE', 'ACTIVE'] });
  });

  it('a sale whose only excess is non-live items (a sold-out sale) is left completely alone', async () => {
    mockOrganizerFindUnique.mockResolvedValue(
      organizerWith('SIMPLE', [
        { items: [1, 2, 3, 4, 5, 6].map((n) => item(`s${n}`, n % 2 ? 'SOLD' : 'RESERVED', n)) },
        { items: [item('ok1', 'AVAILABLE', 20), item('ok2', 'AVAILABLE', 21), item('ok3', 'AVAILABLE', 22)] },
      ])
    );
    const result = await finalizeGracePeriod('org_1');
    expect(mockItemUpdateMany).not.toHaveBeenCalled();
    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(result).toEqual({ itemsLocked: 0, staffRemoved: 0 });
  });

  it('keeps the OLDEST three of each sale and locks the newest, regardless of array order', async () => {
    mockOrganizerFindUnique.mockResolvedValue(
      organizerWith('SIMPLE', [
        { items: [item('x5', 'AVAILABLE', 5), item('x1', 'AVAILABLE', 1), item('x4', 'AVAILABLE', 4), item('x2', 'AVAILABLE', 2), item('x3', 'AVAILABLE', 3)] },
        { items: [item('y4', 'AVAILABLE', 14), item('y1', 'AVAILABLE', 11), item('y3', 'AVAILABLE', 13), item('y2', 'AVAILABLE', 12)] },
      ])
    );
    await finalizeGracePeriod('org_1');
    expect(lockedIds()).toEqual(['x4', 'x5', 'y4']);
  });

  it('a paid tier (no cap) locks nothing however many items there are', async () => {
    mockOrganizerFindUnique.mockResolvedValue(
      organizerWith('PRO', [{ items: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => item(`p${n}`, 'AVAILABLE', n)) }])
    );
    expect(await finalizeGracePeriod('org_1')).toEqual({ itemsLocked: 0, staffRemoved: 0 });
    expect(mockItemUpdateMany).not.toHaveBeenCalled();
  });
});

describe('selectItemsOverCap', () => {
  it('returns nothing for a non-finite or negative cap', () => {
    const sales = [{ items: [item('a', 'AVAILABLE', 1)] }];
    expect(selectItemsOverCap(sales, Infinity)).toEqual([]);
    expect(selectItemsOverCap(sales, -1)).toEqual([]);
    expect(selectItemsOverCap(sales, NaN)).toEqual([]);
  });

  it('a cap of 0 locks every live item but still never a sold one', () => {
    const over = selectItemsOverCap([{ items: [item('a', 'AVAILABLE', 1), item('b', 'SOLD', 2)] }], 0);
    expect(over.map((i) => i.id)).toEqual(['a']);
  });
});
