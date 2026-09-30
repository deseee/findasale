/**
 * Crew Invasion redemption (Feature #397, 2026-09-29), PER-MEMBER model. Prisma is mocked.
 *
 * Covers services/crewInvasionRedemptionService.ts: the discount math (10%, floor, no stacking),
 * finding the shopper's redeemable code (a code THIS member has not redeemed, whatever other crew
 * members did), explicit-code validation with specific 4xx reasons, the per-member atomic redemption
 * (one live redemption per member per code, unique activeKey, released rows can be redeemed again),
 * the fenced release, linking a redemption to its invoice and restoring it when an UNPAID invoice
 * dies, and the combined apply step.
 *
 * The redemption table is simulated statefully (unique activeKey, createMany skipDuplicates) so the
 * "each member gets one use" and "release lets the member redeem again" behaviours are proven, not
 * just the shape of the calls.
 */

// `var` (not `const`): jest.mock factories are hoisted above these declarations.
var mockRows: any[] = [];
var mockPrisma: any = {
  crewMember: { findMany: jest.fn(), findFirst: jest.fn() },
  crewInvasionCode: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  crewInvasionRedemption: {
    findFirst: jest.fn(),
    createMany: jest.fn(),
    updateMany: jest.fn(),
  },
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

import {
  CREW_INVASION_MIN_CHARGE_CENTS,
  computeCrewInvasionDiscountCents,
  findRedeemableCrewInvasionCode,
  validateCrewInvasionCode,
  redeemCrewInvasionCode,
  releaseCrewInvasionRedemption,
  linkCrewInvasionRedemptionToInvoice,
  releaseCrewInvasionRedemptionsForInvoice,
  countCrewDiscountEligibleShoppers,
  applyCrewInvasionDiscount,
  crewRedemptionActiveKey,
  joinedBeforeInvasion,
} from '../services/crewInvasionRedemptionService';

const FUTURE = () => new Date(Date.now() + 30 * 60 * 1000);
const PAST = () => new Date(Date.now() - 60 * 1000);
// Late-joiner rule fixtures: the code (invasion qualification) was created at QUALIFIED; members who joined
// EARLY are in, members who joined LATE are not.
const QUALIFIED = new Date('2026-09-29T10:00:00Z');
const JOINED_EARLY = new Date('2026-09-29T09:00:00Z');
const JOINED_LATE = new Date('2026-09-29T11:00:00Z');

function matches(row: any, where: any): boolean {
  return Object.keys(where).every((k) => {
    const w = where[k];
    if (w && typeof w === 'object' && !(w instanceof Date) && 'not' in w) return row[k] !== w.not;
    if (w instanceof Date) return row[k] instanceof Date && row[k].getTime() === w.getTime();
    return row[k] === w;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRows = [];
  mockPrisma.crewMember.findMany.mockReset();
  mockPrisma.crewMember.findFirst.mockReset();
  mockPrisma.crewInvasionCode.findFirst.mockReset();
  mockPrisma.crewInvasionCode.findMany.mockReset();
  mockPrisma.crewInvasionCode.findUnique.mockReset();
  mockPrisma.crewInvasionRedemption.findFirst.mockReset();
  mockPrisma.crewInvasionRedemption.createMany.mockReset();
  mockPrisma.crewInvasionRedemption.updateMany.mockReset();
  // Stateful redemption table: activeKey is unique among non-null values.
  mockPrisma.crewInvasionRedemption.findFirst.mockImplementation(async ({ where }: any) => mockRows.find((r) => matches(r, where)) ?? null);
  mockPrisma.crewInvasionRedemption.createMany.mockImplementation(async ({ data, skipDuplicates }: any) => {
    let count = 0;
    for (const d of data) {
      const dup = d.activeKey != null && mockRows.some((r) => r.activeKey === d.activeKey);
      if (dup && !skipDuplicates) throw Object.assign(new Error('unique'), { code: 'P2002' });
      if (dup) continue;
      mockRows.push({ id: `red${mockRows.length + 1}`, holdInvoiceId: null, releasedAt: null, ...d });
      count++;
    }
    return { count };
  });
  mockPrisma.crewInvasionRedemption.updateMany.mockImplementation(async ({ where, data }: any) => {
    const hit = mockRows.filter((r) => matches(r, where));
    hit.forEach((r) => Object.assign(r, data));
    return { count: hit.length };
  });
});

describe('computeCrewInvasionDiscountCents', () => {
  it('takes 10 percent of the held-item subtotal', () => {
    expect(computeCrewInvasionDiscountCents({ eligibleBaseCents: 5000, chargeableTotalCents: 5000, discountPct: 10 })).toBe(500);
  });

  it('only discounts held items, never ad hoc misc lines in the same invoice', () => {
    // $10 of held items inside a $15 invoice: discount is 10% of $10, not of $15.
    expect(computeCrewInvasionDiscountCents({ eligibleBaseCents: 1000, chargeableTotalCents: 1500, discountPct: 10 })).toBe(100);
  });

  it('never lets the charge fall below the minimum charge', () => {
    expect(CREW_INVASION_MIN_CHARGE_CENTS).toBeGreaterThanOrEqual(75); // stays above the platform minimum fee
    expect(computeCrewInvasionDiscountCents({ eligibleBaseCents: 105, chargeableTotalCents: 105, discountPct: 10 })).toBe(5);
    expect(computeCrewInvasionDiscountCents({ eligibleBaseCents: 100, chargeableTotalCents: 100, discountPct: 10 })).toBe(0);
    expect(computeCrewInvasionDiscountCents({ eligibleBaseCents: 50, chargeableTotalCents: 50, discountPct: 10 })).toBe(0);
  });

  it('does not stack with another discount: the larger of the two wins', () => {
    // crew 10% of $50 = $5.00. Register already took $3.00 off: only the $2.00 excess is added.
    expect(computeCrewInvasionDiscountCents({ eligibleBaseCents: 5000, chargeableTotalCents: 4700, discountPct: 10, otherDiscountCents: 300 })).toBe(200);
    // Register already took $7.00 off: crew adds nothing.
    expect(computeCrewInvasionDiscountCents({ eligibleBaseCents: 5000, chargeableTotalCents: 4300, discountPct: 10, otherDiscountCents: 700 })).toBe(0);
  });

  it('returns 0 for junk input', () => {
    expect(computeCrewInvasionDiscountCents({ eligibleBaseCents: 0, chargeableTotalCents: 5000, discountPct: 10 })).toBe(0);
    expect(computeCrewInvasionDiscountCents({ eligibleBaseCents: NaN, chargeableTotalCents: 5000, discountPct: 10 })).toBe(0);
    expect(computeCrewInvasionDiscountCents({ eligibleBaseCents: 5000, chargeableTotalCents: -1, discountPct: 10 })).toBe(0);
    expect(computeCrewInvasionDiscountCents({ eligibleBaseCents: 5000, chargeableTotalCents: 5000, discountPct: 0 })).toBe(0);
  });

  it('caps the percentage at 100 and stays inside the floor', () => {
    expect(computeCrewInvasionDiscountCents({ eligibleBaseCents: 5000, chargeableTotalCents: 5000, discountPct: 500 })).toBe(5000 - CREW_INVASION_MIN_CHARGE_CENTS);
  });
});

describe('findRedeemableCrewInvasionCode', () => {
  it('returns null without touching codes when the shopper is in no crew', async () => {
    mockPrisma.crewMember.findMany.mockResolvedValue([]);
    const res = await findRedeemableCrewInvasionCode({ saleId: 'sale-1', shopperUserId: 'u1' });
    expect(res).toBeNull();
    expect(mockPrisma.crewInvasionCode.findMany).not.toHaveBeenCalled();
  });

  it('looks for an unexpired code for this sale in the shopper\'s crews that THIS shopper has not redeemed, sale still opted in', async () => {
    mockPrisma.crewMember.findMany.mockResolvedValue([{ crewId: 'c1', joinedAt: JOINED_EARLY }, { crewId: 'c2', joinedAt: JOINED_EARLY }]);
    mockPrisma.crewInvasionCode.findMany.mockResolvedValue([{ id: 'code-1', code: 'CREW10-AAAA', discountPct: 10, crewId: 'c1', createdAt: QUALIFIED }]);
    const now = new Date('2026-09-29T12:00:00Z');
    const res = await findRedeemableCrewInvasionCode({ saleId: 'sale-1', shopperUserId: 'u1', now });
    expect(res).toEqual({ id: 'code-1', code: 'CREW10-AAAA', discountPct: 10 });
    const where = mockPrisma.crewInvasionCode.findMany.mock.calls[0][0].where;
    expect(where.saleId).toBe('sale-1');
    expect(where.crewId).toEqual({ in: ['c1', 'c2'] });
    expect(where.expiresAt).toEqual({ gt: now });
    expect(where.sale).toEqual({ crewInvasionEnabled: true });
    // per member: only THIS shopper's live redemption hides the code; the legacy crew-wide usedAt is NOT a gate
    expect(where.usedAt).toBeUndefined();
    expect(where.redemptions).toEqual({ none: { userId: 'u1', activeKey: { not: null } } });
  });

  it('returns null when nothing matches', async () => {
    mockPrisma.crewMember.findMany.mockResolvedValue([{ crewId: 'c1', joinedAt: JOINED_EARLY }]);
    mockPrisma.crewInvasionCode.findMany.mockResolvedValue([]);
    expect(await findRedeemableCrewInvasionCode({ saleId: 'sale-1', shopperUserId: 'u1' })).toBeNull();
  });

  it('LATE JOINER: a member who joined the crew after the invasion qualified gets no code', async () => {
    mockPrisma.crewMember.findMany.mockResolvedValue([{ crewId: 'c1', joinedAt: JOINED_LATE }]);
    mockPrisma.crewInvasionCode.findMany.mockResolvedValue([{ id: 'code-1', code: 'CREW10-AAAA', discountPct: 10, crewId: 'c1', createdAt: QUALIFIED }]);
    expect(await findRedeemableCrewInvasionCode({ saleId: 'sale-1', shopperUserId: 'late' })).toBeNull();
  });

  it('a member of two crews gets the code of the crew they joined BEFORE it qualified, not the one they joined late', async () => {
    mockPrisma.crewMember.findMany.mockResolvedValue([{ crewId: 'c1', joinedAt: JOINED_LATE }, { crewId: 'c2', joinedAt: JOINED_EARLY }]);
    mockPrisma.crewInvasionCode.findMany.mockResolvedValue([
      { id: 'code-1', code: 'CREW10-AAAA', discountPct: 10, crewId: 'c1', createdAt: QUALIFIED },
      { id: 'code-2', code: 'CREW10-BBBB', discountPct: 10, crewId: 'c2', createdAt: QUALIFIED },
    ]);
    const res = await findRedeemableCrewInvasionCode({ saleId: 'sale-1', shopperUserId: 'u1' });
    expect(res?.id).toBe('code-2');
  });
});

describe('joinedBeforeInvasion (late-joiner rule)', () => {
  it('is true only when joinedAt is strictly earlier than the qualification moment', () => {
    expect(joinedBeforeInvasion(JOINED_EARLY, QUALIFIED)).toBe(true);
    expect(joinedBeforeInvasion(JOINED_LATE, QUALIFIED)).toBe(false);
    expect(joinedBeforeInvasion(QUALIFIED, QUALIFIED)).toBe(false);
  });

  it('accepts ISO strings and fails closed on missing or unreadable timestamps', () => {
    expect(joinedBeforeInvasion(JOINED_EARLY.toISOString(), QUALIFIED.toISOString())).toBe(true);
    expect(joinedBeforeInvasion(null, QUALIFIED)).toBe(false);
    expect(joinedBeforeInvasion(JOINED_EARLY, undefined)).toBe(false);
    expect(joinedBeforeInvasion('not a date', QUALIFIED)).toBe(false);
  });
});

describe('validateCrewInvasionCode (explicit code -> clear 400 reasons)', () => {
  const baseRow = () => ({
    id: 'code-1', code: 'CREW10-AAAA', discountPct: 10, saleId: 'sale-1', crewId: 'c1',
    usedAt: null, expiresAt: FUTURE(), sale: { crewInvasionEnabled: true }, createdAt: QUALIFIED,
  });
  const early = { id: 'm1', joinedAt: JOINED_EARLY };
  const run = (userId = 'u1') => validateCrewInvasionCode({ codeText: ' crew10-aaaa ', saleId: 'sale-1', shopperUserId: userId });

  it('accepts a valid code (trimmed, case-insensitive)', async () => {
    mockPrisma.crewInvasionCode.findUnique.mockResolvedValue(baseRow());
    mockPrisma.crewMember.findFirst.mockResolvedValue(early);
    const res: any = await run();
    expect(res.ok).toBe(true);
    expect(mockPrisma.crewInvasionCode.findUnique.mock.calls[0][0].where).toEqual({ code: 'CREW10-AAAA' });
  });

  it('rejects an unknown code', async () => {
    mockPrisma.crewInvasionCode.findUnique.mockResolvedValue(null);
    const res: any = await run();
    expect(res.ok).toBe(false);
    expect(res.rejection.status).toBe(400);
    expect(res.rejection.code).toBe('CREW_CODE_INVALID');
    expect(res.rejection.message).toMatch(/not found/i);
  });

  it('rejects blank and oversized input without a query', async () => {
    const blank: any = await validateCrewInvasionCode({ codeText: '   ', saleId: 'sale-1', shopperUserId: 'u1' });
    expect(blank.rejection.code).toBe('CREW_CODE_INVALID');
    const huge: any = await validateCrewInvasionCode({ codeText: 'X'.repeat(200), saleId: 'sale-1', shopperUserId: 'u1' });
    expect(huge.rejection.code).toBe('CREW_CODE_INVALID');
    expect(mockPrisma.crewInvasionCode.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a code for another sale', async () => {
    mockPrisma.crewInvasionCode.findUnique.mockResolvedValue({ ...baseRow(), saleId: 'other-sale' });
    const res: any = await run();
    expect(res.rejection.code).toBe('CREW_CODE_WRONG_SALE');
  });

  it('rejects a code that belongs to a crew the shopper is not in', async () => {
    mockPrisma.crewInvasionCode.findUnique.mockResolvedValue(baseRow());
    mockPrisma.crewMember.findFirst.mockResolvedValue(null);
    const res: any = await run();
    expect(res.rejection.code).toBe('CREW_CODE_NOT_YOURS');
  });

  it('rejects a LATE JOINER (joined the crew after the invasion qualified) with CREW_CODE_LATE_JOINER', async () => {
    mockPrisma.crewInvasionCode.findUnique.mockResolvedValue(baseRow());
    mockPrisma.crewMember.findFirst.mockResolvedValue({ id: 'm9', joinedAt: JOINED_LATE });
    const res: any = await run('late');
    expect(res.ok).toBe(false);
    expect(res.rejection.status).toBe(400);
    expect(res.rejection.code).toBe('CREW_CODE_LATE_JOINER');
    expect(res.rejection.message).toMatch(/before you joined/i);
  });

  it('rejects when THIS member already has a live redemption of the code', async () => {
    mockPrisma.crewInvasionCode.findUnique.mockResolvedValue(baseRow());
    mockPrisma.crewMember.findFirst.mockResolvedValue(early);
    mockRows.push({ id: 'r1', codeId: 'code-1', userId: 'u1', activeKey: 'code-1:u1', releasedAt: null });
    const res: any = await run('u1');
    expect(res.rejection.code).toBe('CREW_CODE_USED');
  });

  it('a crew mate\'s redemption does NOT use the code up for this member (per-member model)', async () => {
    mockPrisma.crewInvasionCode.findUnique.mockResolvedValue({ ...baseRow(), usedAt: new Date() }); // legacy column set: ignored
    mockPrisma.crewMember.findFirst.mockResolvedValue({ id: 'm2', joinedAt: JOINED_EARLY });
    mockRows.push({ id: 'r1', codeId: 'code-1', userId: 'someone-else', activeKey: 'code-1:someone-else', releasedAt: null });
    const res: any = await run('u2');
    expect(res.ok).toBe(true);
  });

  it('a RELEASED redemption (unpaid invoice died) no longer blocks the member', async () => {
    mockPrisma.crewInvasionCode.findUnique.mockResolvedValue(baseRow());
    mockPrisma.crewMember.findFirst.mockResolvedValue(early);
    mockRows.push({ id: 'r1', codeId: 'code-1', userId: 'u1', activeKey: null, releasedAt: new Date() });
    const res: any = await run('u1');
    expect(res.ok).toBe(true);
  });

  it('rejects an expired code', async () => {
    mockPrisma.crewInvasionCode.findUnique.mockResolvedValue({ ...baseRow(), expiresAt: PAST() });
    mockPrisma.crewMember.findFirst.mockResolvedValue(early);
    const res: any = await run();
    expect(res.rejection.code).toBe('CREW_CODE_EXPIRED');
    expect(res.rejection.message).toMatch(/expired/i);
  });

  it('rejects when the organizer has since switched Crew Invasion off', async () => {
    mockPrisma.crewInvasionCode.findUnique.mockResolvedValue({ ...baseRow(), sale: { crewInvasionEnabled: false } });
    mockPrisma.crewMember.findFirst.mockResolvedValue(early);
    const res: any = await run();
    expect(res.rejection.code).toBe('CREW_CODE_DISABLED');
  });
});

describe('redeemCrewInvasionCode / releaseCrewInvasionRedemption (per member)', () => {
  const now = new Date('2026-09-29T12:00:00Z');
  const liveCode = () => mockPrisma.crewInvasionCode.findFirst.mockResolvedValue({ id: 'code-1' });

  it('redeems by inserting one row keyed "<codeId>:<userId>" and returns the redeemedAt fence', async () => {
    liveCode();
    const redeemedAt = await redeemCrewInvasionCode('code-1', 'u1', now);
    expect(redeemedAt).toEqual(now);
    expect(mockPrisma.crewInvasionCode.findFirst).toHaveBeenCalledWith({
      where: { id: 'code-1', expiresAt: { gt: now } },
      select: { id: true },
    });
    expect(mockPrisma.crewInvasionRedemption.createMany).toHaveBeenCalledWith({
      data: [{ codeId: 'code-1', userId: 'u1', activeKey: crewRedemptionActiveKey('code-1', 'u1'), redeemedAt: now }],
      skipDuplicates: true,
    });
    expect(crewRedemptionActiveKey('code-1', 'u1')).toBe('code-1:u1');
  });

  it('EVERY crew member gets one redemption of the same code', async () => {
    liveCode();
    expect(await redeemCrewInvasionCode('code-1', 'u1', now)).not.toBeNull();
    expect(await redeemCrewInvasionCode('code-1', 'u2', now)).not.toBeNull();
    expect(await redeemCrewInvasionCode('code-1', 'u3', now)).not.toBeNull();
    expect(mockRows.map((r) => r.userId)).toEqual(['u1', 'u2', 'u3']);
  });

  it('the SAME member can not redeem twice while the first is live (unique activeKey, no P2002 throw)', async () => {
    liveCode();
    expect(await redeemCrewInvasionCode('code-1', 'u1', now)).toEqual(now);
    expect(await redeemCrewInvasionCode('code-1', 'u1', new Date(now.getTime() + 1000))).toBeNull();
    expect(mockRows).toHaveLength(1);
  });

  it('two simultaneous redemptions by one member: exactly one wins', async () => {
    liveCode();
    const results = await Promise.all([
      redeemCrewInvasionCode('code-1', 'u1', now),
      redeemCrewInvasionCode('code-1', 'u1', now),
    ]);
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    expect(mockRows).toHaveLength(1);
  });

  it('returns null for an expired or deleted code without inserting', async () => {
    mockPrisma.crewInvasionCode.findFirst.mockResolvedValue(null);
    expect(await redeemCrewInvasionCode('code-1', 'u1', now)).toBeNull();
    expect(mockPrisma.crewInvasionRedemption.createMany).not.toHaveBeenCalled();
  });

  it('returns null when the code row vanished between the check and the insert (FK violation)', async () => {
    liveCode();
    mockPrisma.crewInvasionRedemption.createMany.mockRejectedValueOnce(Object.assign(new Error('fk'), { code: 'P2003' }));
    expect(await redeemCrewInvasionCode('code-1', 'u1', now)).toBeNull();
  });

  it('refuses a missing code id or user id', async () => {
    expect(await redeemCrewInvasionCode('', 'u1', now)).toBeNull();
    expect(await redeemCrewInvasionCode('code-1', '', now)).toBeNull();
  });

  it('release frees the member\'s activeKey (row kept for audit) so they can redeem again', async () => {
    liveCode();
    const redeemedAt = (await redeemCrewInvasionCode('code-1', 'u1', now)) as Date;
    await releaseCrewInvasionRedemption('code-1', redeemedAt, 'u1');
    expect(mockRows[0].activeKey).toBeNull();
    expect(mockRows[0].releasedAt).toBeInstanceOf(Date);
    const again = await redeemCrewInvasionCode('code-1', 'u1', new Date(now.getTime() + 5000));
    expect(again).not.toBeNull();
    expect(mockRows).toHaveLength(2); // released row kept, new live row
  });

  it('release is fenced on the exact redeemedAt and member: it can never release a later redemption or another member', async () => {
    liveCode();
    const first = (await redeemCrewInvasionCode('code-1', 'u1', now)) as Date;
    await redeemCrewInvasionCode('code-1', 'u2', now);
    await releaseCrewInvasionRedemption('code-1', new Date(first.getTime() - 1), 'u1'); // stale fence
    expect(mockRows.every((r) => r.activeKey !== null)).toBe(true);
    await releaseCrewInvasionRedemption('code-1', first, 'u1');
    expect(mockRows.find((r) => r.userId === 'u1').activeKey).toBeNull();
    expect(mockRows.find((r) => r.userId === 'u2').activeKey).toBe('code-1:u2');
    expect(mockPrisma.crewInvasionRedemption.updateMany.mock.calls[1][0].where).toEqual({
      codeId: 'code-1', redeemedAt: first, releasedAt: null, userId: 'u1',
    });
  });

  it('never throws when the release itself fails', async () => {
    mockPrisma.crewInvasionRedemption.updateMany.mockRejectedValue(new Error('db down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(releaseCrewInvasionRedemption('code-1', new Date(), 'u1')).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

describe('linkCrewInvasionRedemptionToInvoice / releaseCrewInvasionRedemptionsForInvoice', () => {
  const now = new Date('2026-09-29T12:00:00Z');

  it('links exactly this member\'s live redemption to the invoice', async () => {
    mockRows.push({ id: 'r1', codeId: 'code-1', userId: 'u1', activeKey: 'code-1:u1', redeemedAt: now, releasedAt: null, holdInvoiceId: null });
    mockRows.push({ id: 'r2', codeId: 'code-1', userId: 'u2', activeKey: 'code-1:u2', redeemedAt: now, releasedAt: null, holdInvoiceId: null });
    await linkCrewInvasionRedemptionToInvoice({ codeId: 'code-1', userId: 'u1', usedAt: now, holdInvoiceId: 'inv_1' });
    expect(mockRows[0].holdInvoiceId).toBe('inv_1');
    expect(mockRows[1].holdInvoiceId).toBeNull();
  });

  it('gives the discount back when an UNPAID invoice dies, and only for that invoice', async () => {
    mockRows.push({ id: 'r1', codeId: 'code-1', userId: 'u1', activeKey: 'code-1:u1', releasedAt: null, holdInvoiceId: 'inv_1' });
    mockRows.push({ id: 'r2', codeId: 'code-1', userId: 'u2', activeKey: 'code-1:u2', releasedAt: null, holdInvoiceId: 'inv_2' });
    expect(await releaseCrewInvasionRedemptionsForInvoice('inv_1')).toBe(1);
    expect(mockRows[0].activeKey).toBeNull();
    expect(mockRows[0].releasedAt).toBeInstanceOf(Date);
    expect(mockRows[1].activeKey).toBe('code-1:u2'); // other member's live invoice untouched
  });

  it('is idempotent: a second call restores nothing more', async () => {
    mockRows.push({ id: 'r1', codeId: 'code-1', userId: 'u1', activeKey: 'code-1:u1', releasedAt: null, holdInvoiceId: 'inv_1' });
    expect(await releaseCrewInvasionRedemptionsForInvoice('inv_1')).toBe(1);
    expect(await releaseCrewInvasionRedemptionsForInvoice('inv_1')).toBe(0);
  });

  it('a PAID invoice keeps its redemption because callers never pass it (no row matches an unknown id)', async () => {
    mockRows.push({ id: 'r1', codeId: 'code-1', userId: 'u1', activeKey: 'code-1:u1', releasedAt: null, holdInvoiceId: 'inv_paid' });
    expect(await releaseCrewInvasionRedemptionsForInvoice('inv_other')).toBe(0);
    expect(mockRows[0].activeKey).toBe('code-1:u1');
  });

  it('returns 0 for an empty id and never throws on a DB failure', async () => {
    expect(await releaseCrewInvasionRedemptionsForInvoice('')).toBe(0);
    expect(mockPrisma.crewInvasionRedemption.updateMany).not.toHaveBeenCalled();
    mockPrisma.crewInvasionRedemption.updateMany.mockRejectedValue(new Error('db down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await releaseCrewInvasionRedemptionsForInvoice('inv_1')).toBe(0);
    spy.mockRestore();
  });

  it('link never throws on a DB failure', async () => {
    mockPrisma.crewInvasionRedemption.updateMany.mockRejectedValue(new Error('db down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(linkCrewInvasionRedemptionToInvoice({ codeId: 'c', userId: 'u', usedAt: now, holdInvoiceId: 'i' })).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

describe('applyCrewInvasionDiscount', () => {
  const memberOfC1 = () => mockPrisma.crewMember.findMany.mockResolvedValue([{ crewId: 'c1', joinedAt: JOINED_EARLY }]);
  const codeRow = () => {
    mockPrisma.crewInvasionCode.findMany.mockResolvedValue([{ id: 'code-1', code: 'CREW10-AAAA', discountPct: 10, crewId: 'c1', createdAt: QUALIFIED }]);
    // redeemCrewInvasionCode re-checks the code is still live with a findFirst
    mockPrisma.crewInvasionCode.findFirst.mockResolvedValue({ id: 'code-1' });
  };

  it('auto-applies the shopper\'s active code and records THEIR redemption', async () => {
    memberOfC1();
    codeRow();
    const res: any = await applyCrewInvasionDiscount({
      saleId: 'sale-1', shopperUserId: 'u1', eligibleBaseCents: 10000, chargeableTotalCents: 10000,
    });
    expect(res.applied).toBe(true);
    expect(res.discountCents).toBe(1000);
    expect(res.codeId).toBe('code-1');
    expect(res.userId).toBe('u1');
    expect(res.usedAt).toBeInstanceOf(Date);
    expect(mockRows).toHaveLength(1);
    expect(mockRows[0]).toMatchObject({ codeId: 'code-1', userId: 'u1', activeKey: 'code-1:u1' });
  });

  it('every crew member is discounted once: u1 then u2 both apply, a repeat by u1 does not', async () => {
    memberOfC1();
    codeRow();
    const base = { saleId: 'sale-1', eligibleBaseCents: 10000, chargeableTotalCents: 10000 };
    expect(((await applyCrewInvasionDiscount({ ...base, shopperUserId: 'u1' })) as any).applied).toBe(true);
    expect(((await applyCrewInvasionDiscount({ ...base, shopperUserId: 'u2' })) as any).applied).toBe(true);
    // u1's second attempt finds the code hidden by findFirst in production; here findFirst is a stub,
    // so the unique activeKey is what stops the double redeem
    const again: any = await applyCrewInvasionDiscount({ ...base, shopperUserId: 'u1' });
    expect(again.applied).toBe(false);
    expect(mockRows).toHaveLength(2);
  });

  it('a LATE JOINER is not discounted and nothing is consumed', async () => {
    mockPrisma.crewMember.findMany.mockResolvedValue([{ crewId: 'c1', joinedAt: JOINED_LATE }]);
    codeRow();
    const res: any = await applyCrewInvasionDiscount({
      saleId: 'sale-1', shopperUserId: 'late', eligibleBaseCents: 10000, chargeableTotalCents: 10000,
    });
    expect(res.applied).toBe(false);
    expect(mockPrisma.crewInvasionRedemption.createMany).not.toHaveBeenCalled();
    expect(mockRows).toHaveLength(0);
  });

  it('an explicit code from a LATE JOINER is rejected with CREW_CODE_LATE_JOINER and consumes nothing', async () => {
    mockPrisma.crewInvasionCode.findUnique.mockResolvedValue({
      id: 'code-1', code: 'CREW10-AAAA', discountPct: 10, saleId: 'sale-1', crewId: 'c1',
      usedAt: null, expiresAt: FUTURE(), sale: { crewInvasionEnabled: true }, createdAt: QUALIFIED,
    });
    mockPrisma.crewMember.findFirst.mockResolvedValue({ id: 'm9', joinedAt: JOINED_LATE });
    const res: any = await applyCrewInvasionDiscount({
      saleId: 'sale-1', shopperUserId: 'late', eligibleBaseCents: 10000, chargeableTotalCents: 10000, providedCode: 'CREW10-AAAA',
    });
    expect(res.applied).toBe(false);
    expect(res.rejection.code).toBe('CREW_CODE_LATE_JOINER');
    expect(mockPrisma.crewInvasionRedemption.createMany).not.toHaveBeenCalled();
  });

  it('applies nothing and consumes nothing when the shopper has no code', async () => {
    mockPrisma.crewMember.findMany.mockResolvedValue([]);
    const res: any = await applyCrewInvasionDiscount({
      saleId: 'sale-1', shopperUserId: 'u1', eligibleBaseCents: 10000, chargeableTotalCents: 10000,
    });
    expect(res.applied).toBe(false);
    expect(mockPrisma.crewInvasionRedemption.createMany).not.toHaveBeenCalled();
  });

  it('does not burn the member\'s one use when the computed discount is zero', async () => {
    memberOfC1();
    codeRow();
    const res: any = await applyCrewInvasionDiscount({
      saleId: 'sale-1', shopperUserId: 'u1', eligibleBaseCents: 100, chargeableTotalCents: 100,
    });
    expect(res.applied).toBe(false);
    expect(mockPrisma.crewInvasionRedemption.createMany).not.toHaveBeenCalled();
  });

  it('silently skips (full price) when the same member\'s other invoice redeemed it first', async () => {
    memberOfC1();
    codeRow();
    mockRows.push({ id: 'r1', codeId: 'code-1', userId: 'u1', activeKey: 'code-1:u1', releasedAt: null });
    const res: any = await applyCrewInvasionDiscount({
      saleId: 'sale-1', shopperUserId: 'u1', eligibleBaseCents: 10000, chargeableTotalCents: 10000,
    });
    expect(res.applied).toBe(false);
    expect(res.rejection).toBeUndefined();
  });

  it('after the invoice dies unpaid the member is discounted again on the next invoice', async () => {
    memberOfC1();
    codeRow();
    const first: any = await applyCrewInvasionDiscount({
      saleId: 'sale-1', shopperUserId: 'u1', eligibleBaseCents: 10000, chargeableTotalCents: 10000,
    });
    await linkCrewInvasionRedemptionToInvoice({ codeId: first.codeId, userId: 'u1', usedAt: first.usedAt, holdInvoiceId: 'inv_1' });
    await releaseCrewInvasionRedemptionsForInvoice('inv_1');
    const second: any = await applyCrewInvasionDiscount({
      saleId: 'sale-1', shopperUserId: 'u1', eligibleBaseCents: 10000, chargeableTotalCents: 10000,
    });
    expect(second.applied).toBe(true);
    expect(mockRows).toHaveLength(2);
    expect(mockRows.filter((r) => r.activeKey !== null)).toHaveLength(1);
  });

  it('returns a 400 rejection for a bad explicit code and consumes nothing', async () => {
    mockPrisma.crewInvasionCode.findUnique.mockResolvedValue(null);
    const res: any = await applyCrewInvasionDiscount({
      saleId: 'sale-1', shopperUserId: 'u1', eligibleBaseCents: 10000, chargeableTotalCents: 10000, providedCode: 'NOPE',
    });
    expect(res.applied).toBe(false);
    expect(res.rejection.status).toBe(400);
    expect(res.rejection.code).toBe('CREW_CODE_INVALID');
    expect(mockPrisma.crewInvasionRedemption.createMany).not.toHaveBeenCalled();
  });

  it('reports CREW_CODE_USED when an explicit valid code loses the redemption race', async () => {
    mockPrisma.crewInvasionCode.findUnique.mockResolvedValue({
      id: 'code-1', code: 'CREW10-AAAA', discountPct: 10, saleId: 'sale-1', crewId: 'c1',
      usedAt: null, expiresAt: FUTURE(), sale: { crewInvasionEnabled: true }, createdAt: QUALIFIED,
    });
    mockPrisma.crewMember.findFirst.mockResolvedValue({ id: 'm1', joinedAt: JOINED_EARLY });
    mockPrisma.crewInvasionCode.findFirst.mockResolvedValue({ id: 'code-1' });
    // the validate step sees no live redemption, then the insert loses the race
    mockPrisma.crewInvasionRedemption.findFirst.mockResolvedValue(null);
    mockPrisma.crewInvasionRedemption.createMany.mockResolvedValue({ count: 0 });
    const res: any = await applyCrewInvasionDiscount({
      saleId: 'sale-1', shopperUserId: 'u1', eligibleBaseCents: 10000, chargeableTotalCents: 10000, providedCode: 'CREW10-AAAA',
    });
    expect(res.applied).toBe(false);
    expect(res.rejection.code).toBe('CREW_CODE_USED');
  });

  it('fails safe to full price if the lookup throws', async () => {
    mockPrisma.crewMember.findMany.mockRejectedValue(new Error('db down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res: any = await applyCrewInvasionDiscount({
      saleId: 'sale-1', shopperUserId: 'u1', eligibleBaseCents: 10000, chargeableTotalCents: 10000,
    });
    expect(res.applied).toBe(false);
    spy.mockRestore();
  });
});

describe('countCrewDiscountEligibleShoppers (CHECKOUT_LINK response note)', () => {
  it('counts distinct shoppers who currently have a redeemable code', async () => {
    mockPrisma.crewMember.findMany.mockImplementation(async ({ where }: any) => (where.userId === 'u3' ? [] : [{ crewId: 'c1', joinedAt: JOINED_EARLY }]));
    mockPrisma.crewInvasionCode.findMany.mockResolvedValue([{ id: 'code-1', code: 'X', discountPct: 10, crewId: 'c1', createdAt: QUALIFIED }]);
    expect(await countCrewDiscountEligibleShoppers('sale-1', ['u1', 'u2', 'u2', 'u3'])).toBe(2);
  });

  it('does not count late joiners', async () => {
    mockPrisma.crewMember.findMany.mockImplementation(async ({ where }: any) => [{ crewId: 'c1', joinedAt: where.userId === 'late' ? JOINED_LATE : JOINED_EARLY }]);
    mockPrisma.crewInvasionCode.findMany.mockResolvedValue([{ id: 'code-1', code: 'X', discountPct: 10, crewId: 'c1', createdAt: QUALIFIED }]);
    expect(await countCrewDiscountEligibleShoppers('sale-1', ['u1', 'late'])).toBe(1);
  });

  it('returns 0 for no shoppers and on a lookup failure', async () => {
    expect(await countCrewDiscountEligibleShoppers('sale-1', [])).toBe(0);
    mockPrisma.crewMember.findMany.mockRejectedValue(new Error('db down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await countCrewDiscountEligibleShoppers('sale-1', ['u1'])).toBe(0);
    spy.mockRestore();
  });
});
