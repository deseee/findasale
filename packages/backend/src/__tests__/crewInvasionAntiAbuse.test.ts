/**
 * Crew Invasion anti-abuse (Feature #397, 2026-09-29). Prisma, xpService and the socket are
 * mocked; NOT EXECUTED when written (jest cannot run on the authoring device), CI is the first
 * real run.
 *
 * Covers services/crewInvasionService.ts: only QUALIFIED holders (account age, prior real
 * activity elsewhere, not fraud-flagged, not the organizer) count toward the threshold, holders
 * must be distinct users with distinct items, and XP is capped once per user per sale and per
 * user per UTC day (the once-per-crew-per-sale cap is the unique CrewInvasionCode row).
 */

var mockPrisma: any = {
  sale: { findUnique: jest.fn() },
  crewMember: { findMany: jest.fn() },
  crewInvasionCode: { findUnique: jest.fn(), create: jest.fn() },
  itemReservation: { findMany: jest.fn() },
  user: { findMany: jest.fn() },
  purchase: { findMany: jest.fn() },
  saleCheckin: { findMany: jest.fn() },
  pointsTransaction: { findMany: jest.fn() },
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

var mockAwardXp = jest.fn();
jest.mock('../services/xpService', () => ({
  awardXp: (...args: any[]) => mockAwardXp(...args),
  XP_AWARDS: { CREW_INVASION: 75 },
}));

var mockEmit = jest.fn();
var mockTo = jest.fn((_room: string) => ({ emit: mockEmit }));
jest.mock('../lib/socket', () => ({ getIO: () => ({ to: mockTo }) }));

import {
  CREW_INVASION_MIN_ACCOUNT_AGE_DAYS,
  CREW_INVASION_MAX_HOLD_FRAUD_SCORE,
  CREW_INVASION_MAX_XP_AWARDS_PER_USER_PER_DAY,
  CREW_INVASION_XP,
  CREW_INVASION_XP_HOLD_HOURS,
  checkCrewInvasion,
  isQualifiedInvasionMember,
} from '../services/crewInvasionService';

const DAY = 24 * 60 * 60 * 1000;
const OLD = () => new Date(Date.now() - 30 * DAY);
const NEW = () => new Date(Date.now() - 2 * DAY);

interface Scenario {
  organizerUserId?: string;
  holders?: string[]; // users with one hold each
  extraHolds?: Array<{ userId: string; itemId: string }>; // override the hold rows entirely
  created?: Record<string, Date>; // per-user createdAt (default OLD)
  fraudSuspect?: string[];
  paid?: string[]; // users with a prior paid purchase elsewhere
  checkedIn?: string[]; // users with a check-in elsewhere
  xpAtSale?: string[]; // users already paid invasion XP at this sale
  xpToday?: string[]; // users already paid invasion XP today
  enabled?: boolean;
  existingCode?: boolean;
  createError?: any;
}

function setup(sc: Scenario) {
  const holders = sc.holders ?? ['u1', 'u2', 'u3', 'u4'];
  mockPrisma.sale.findUnique.mockResolvedValue({
    id: 'sale-1',
    crewInvasionEnabled: sc.enabled ?? true,
    organizer: { userId: sc.organizerUserId ?? 'org-user' },
  });
  mockPrisma.crewMember.findMany.mockImplementation(async (args: any) => {
    if (args?.where?.crewId) return holders.map((userId) => ({ userId }));
    return [{ crewId: 'crew-1' }]; // the trigger user's crews
  });
  mockPrisma.crewInvasionCode.findUnique.mockResolvedValue(sc.existingCode ? { id: 'existing' } : null);
  if (sc.createError) mockPrisma.crewInvasionCode.create.mockRejectedValue(sc.createError);
  else mockPrisma.crewInvasionCode.create.mockResolvedValue({ id: 'new-code' });
  mockPrisma.itemReservation.findMany.mockResolvedValue(
    sc.extraHolds ?? holders.map((userId, i) => ({ userId, itemId: `item-${i}` }))
  );
  mockPrisma.user.findMany.mockImplementation(async (args: any) =>
    (args.where.id.in as string[]).map((id) => ({
      id,
      createdAt: sc.created?.[id] ?? OLD(),
      fraudSuspect: (sc.fraudSuspect ?? []).includes(id),
    }))
  );
  const paid = sc.paid ?? holders;
  mockPrisma.purchase.findMany.mockResolvedValue(paid.map((userId) => ({ userId })));
  mockPrisma.saleCheckin.findMany.mockResolvedValue((sc.checkedIn ?? []).map((userId) => ({ userId })));
  mockPrisma.pointsTransaction.findMany.mockImplementation(async (args: any) => {
    if (args.where.saleId) return (sc.xpAtSale ?? []).map((userId) => ({ userId }));
    return (sc.xpToday ?? []).map((userId) => ({ userId }));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  Object.values(mockPrisma).forEach((m: any) => Object.values(m).forEach((fn: any) => fn.mockReset()));
  mockAwardXp.mockReset();
  mockAwardXp.mockResolvedValue({ xpAwarded: 75 });
  mockEmit.mockReset();
});

describe('isQualifiedInvasionMember (pure rule)', () => {
  const base = () => ({
    accountCreatedAt: OLD(), now: new Date(), fraudSuspect: false, isSaleOrganizer: false, hasPriorActivity: true,
  });

  it('qualifies an old account with prior activity', () => {
    expect(isQualifiedInvasionMember(base())).toBe(true);
  });

  it('enforces the account-age boundary exactly', () => {
    const now = new Date('2026-09-29T12:00:00Z');
    const exactly = new Date(now.getTime() - CREW_INVASION_MIN_ACCOUNT_AGE_DAYS * DAY);
    const justUnder = new Date(now.getTime() - CREW_INVASION_MIN_ACCOUNT_AGE_DAYS * DAY + 1000);
    expect(isQualifiedInvasionMember({ ...base(), now, accountCreatedAt: exactly })).toBe(true);
    expect(isQualifiedInvasionMember({ ...base(), now, accountCreatedAt: justUnder })).toBe(false);
  });

  it('rejects no prior activity, fraud suspects and the sale organizer', () => {
    expect(isQualifiedInvasionMember({ ...base(), hasPriorActivity: false })).toBe(false);
    expect(isQualifiedInvasionMember({ ...base(), fraudSuspect: true })).toBe(false);
    expect(isQualifiedInvasionMember({ ...base(), isSaleOrganizer: true })).toBe(false);
  });

  it('records the thresholds as constants', () => {
    expect(CREW_INVASION_MIN_ACCOUNT_AGE_DAYS).toBe(7);
    expect(CREW_INVASION_MAX_XP_AWARDS_PER_USER_PER_DAY).toBe(1);
    expect(CREW_INVASION_MAX_HOLD_FRAUD_SCORE).toBe(0.85);
    expect(CREW_INVASION_XP_HOLD_HOURS).toBe(72);
  });
});

describe('checkCrewInvasion', () => {
  it('fires for 4 qualified holders: code created, XP to all four with a 72h hold, all notified', async () => {
    setup({});
    await checkCrewInvasion('sale-1', 'u1');
    expect(mockPrisma.crewInvasionCode.create).toHaveBeenCalledTimes(1);
    expect(mockAwardXp).toHaveBeenCalledTimes(4);
    const [userId, type, amount, ctx] = mockAwardXp.mock.calls[0];
    expect(['u1', 'u2', 'u3', 'u4']).toContain(userId);
    expect(type).toBe('CREW_INVASION');
    expect(amount).toBe(CREW_INVASION_XP);
    expect(ctx.saleId).toBe('sale-1');
    const holdMs = ctx.holdUntil.getTime() - Date.now();
    expect(holdMs).toBeGreaterThan(CREW_INVASION_XP_HOLD_HOURS * 3600 * 1000 - 60000);
    expect(mockEmit).toHaveBeenCalledTimes(4);
    expect(mockEmit.mock.calls[0][0]).toBe('CREW_INVASION_TRIGGERED');
    expect(mockEmit.mock.calls[0][1].xpAwarded).toBe(true);
  });

  it('does nothing when the sale has not opted in', async () => {
    setup({ enabled: false });
    await checkCrewInvasion('sale-1', 'u1');
    expect(mockPrisma.crewInvasionCode.create).not.toHaveBeenCalled();
    expect(mockAwardXp).not.toHaveBeenCalled();
  });

  it('is once per crew per sale: an existing code short-circuits everything', async () => {
    setup({ existingCode: true });
    await checkCrewInvasion('sale-1', 'u1');
    expect(mockPrisma.crewInvasionCode.create).not.toHaveBeenCalled();
    expect(mockAwardXp).not.toHaveBeenCalled();
  });

  it('does not fire on 3 holders', async () => {
    setup({ holders: ['u1', 'u2', 'u3'] });
    await checkCrewInvasion('sale-1', 'u1');
    expect(mockPrisma.crewInvasionCode.create).not.toHaveBeenCalled();
  });

  it('sock puppets: an account younger than 7 days does not count (3 qualified of 4 = no fire)', async () => {
    setup({ created: { u4: NEW() } });
    await checkCrewInvasion('sale-1', 'u1');
    expect(mockPrisma.crewInvasionCode.create).not.toHaveBeenCalled();
    expect(mockAwardXp).not.toHaveBeenCalled();
  });

  it('sock puppets: an account with no prior purchase or check-in elsewhere does not count', async () => {
    setup({ paid: ['u1', 'u2', 'u3'] });
    await checkCrewInvasion('sale-1', 'u1');
    expect(mockPrisma.crewInvasionCode.create).not.toHaveBeenCalled();
  });

  it('a prior check-in elsewhere is enough activity', async () => {
    setup({ paid: ['u1', 'u2', 'u3'], checkedIn: ['u4'] });
    await checkCrewInvasion('sale-1', 'u1');
    expect(mockPrisma.crewInvasionCode.create).toHaveBeenCalledTimes(1);
  });

  it('only counts activity at OTHER sales and non-refunded paid purchases', async () => {
    setup({});
    await checkCrewInvasion('sale-1', 'u1');
    const purchaseWhere = mockPrisma.purchase.findMany.mock.calls[0][0].where;
    expect(purchaseWhere.status).toBe('PAID');
    expect(purchaseWhere.refundedAt).toBeNull();
    expect(purchaseWhere.OR).toEqual([{ saleId: null }, { saleId: { not: 'sale-1' } }]);
    const checkinWhere = mockPrisma.saleCheckin.findMany.mock.calls[0][0].where;
    expect(checkinWhere.saleId).toEqual({ not: 'sale-1' });
  });

  it('fraud-flagged accounts do not count', async () => {
    setup({ fraudSuspect: ['u2'] });
    await checkCrewInvasion('sale-1', 'u1');
    expect(mockPrisma.crewInvasionCode.create).not.toHaveBeenCalled();
  });

  it('the sale organizer\'s own account does not count as a holder', async () => {
    setup({ organizerUserId: 'u4' });
    await checkCrewInvasion('sale-1', 'u1');
    expect(mockPrisma.crewInvasionCode.create).not.toHaveBeenCalled();
  });

  it('holds scored as fraud by the detector are filtered out of the query', async () => {
    setup({});
    await checkCrewInvasion('sale-1', 'u1');
    const where = mockPrisma.itemReservation.findMany.mock.calls[0][0].where;
    expect(where.fraudScore).toEqual({ lt: CREW_INVASION_MAX_HOLD_FRAUD_SCORE });
    expect(where.status).toEqual({ in: ['PENDING', 'CONFIRMED'] });
  });

  it('distinct users with distinct items: one user with many holds is still one holder, and a shared item counts once', async () => {
    setup({
      extraHolds: [
        { userId: 'u1', itemId: 'item-a' },
        { userId: 'u1', itemId: 'item-b' },
        { userId: 'u1', itemId: 'item-c' },
        { userId: 'u2', itemId: 'item-c' }, // same item as u1: not counted for u2
        { userId: 'u3', itemId: 'item-d' },
      ],
    });
    await checkCrewInvasion('sale-1', 'u1');
    expect(mockPrisma.crewInvasionCode.create).not.toHaveBeenCalled();
  });

  it('once per user per sale: a user already paid invasion XP at this sale gets none, but is still notified', async () => {
    setup({ xpAtSale: ['u2'] });
    await checkCrewInvasion('sale-1', 'u1');
    expect(mockAwardXp).toHaveBeenCalledTimes(3);
    expect(mockAwardXp.mock.calls.map((c: any[]) => c[0])).not.toContain('u2');
    expect(mockEmit).toHaveBeenCalledTimes(4);
    const u2Payload = mockEmit.mock.calls.find((c: any[]) => c[1].xpAwarded === false);
    expect(u2Payload).toBeDefined();
  });

  it('per-user daily cap: a user already paid invasion XP today gets none', async () => {
    setup({ xpToday: ['u3'] });
    await checkCrewInvasion('sale-1', 'u1');
    expect(mockAwardXp).toHaveBeenCalledTimes(3);
    expect(mockAwardXp.mock.calls.map((c: any[]) => c[0])).not.toContain('u3');
    const todayQuery = mockPrisma.pointsTransaction.findMany.mock.calls.find((c: any[]) => c[0].where.createdAt);
    expect(todayQuery).toBeDefined();
    expect(todayQuery![0].where.type).toBe('CREW_INVASION');
  });

  it('an unqualified 5th holder still gets the notification (and the discount) but no XP', async () => {
    setup({ holders: ['u1', 'u2', 'u3', 'u4', 'u5'], created: { u5: NEW() } });
    await checkCrewInvasion('sale-1', 'u1');
    expect(mockPrisma.crewInvasionCode.create).toHaveBeenCalledTimes(1);
    expect(mockAwardXp).toHaveBeenCalledTimes(4);
    expect(mockAwardXp.mock.calls.map((c: any[]) => c[0])).not.toContain('u5');
    expect(mockEmit).toHaveBeenCalledTimes(5);
  });

  it('a lost creation race (P2002) pays no XP and notifies no one', async () => {
    setup({ createError: { code: 'P2002' } });
    await checkCrewInvasion('sale-1', 'u1');
    expect(mockAwardXp).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });
});
