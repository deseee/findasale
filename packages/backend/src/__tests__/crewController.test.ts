/**
 * Shopper Crews: controller + validation rules (2026-09-29). NOT EXECUTED when written (jest
 * cannot run on the authoring device); CI is the first real run. Prisma and xpService are
 * mocked; $transaction hands the callback a distinct `txClient` so the suite can prove the XP
 * spend, the crew row and the founding membership all happen inside ONE transaction.
 */

const txClient: any = {
  crew: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  crewMember: {
    count: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
    update: jest.fn(),
  },
  crewInvasionCode: { deleteMany: jest.fn() },
};

// `var` (not `const`): jest.mock factories are hoisted above these declarations.
var mockPrisma: any = {
  crew: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  crewMember: {
    count: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  user: { findUnique: jest.fn() },
  collectorPassport: { findMany: jest.fn() },
  uGCPhoto: { findMany: jest.fn() },
  $transaction: jest.fn(async (cb: any) => cb(txClient)),
};

jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

var mockSpendXp = jest.fn();
var mockGetSpendableXp = jest.fn();
jest.mock('../services/xpService', () => ({
  spendXp: (...args: any[]) => mockSpendXp(...args),
  getSpendableXp: (...args: any[]) => mockGetSpendableXp(...args),
  XP_SINKS: { CREW_CREATION: 500 },
}));

import {
  createCrew,
  joinCrew,
  leaveCrew,
  removeMember,
  transferFounder,
  disbandCrew,
  getCrewFeed,
} from '../controllers/crewController';
import { opaqueUserId } from '../utils/opaqueUserId';
import {
  validateCrewName,
  validateCrewDescription,
  slugifyCrewName,
  MAX_CREW_MEMBERS,
  MAX_CREWS_PER_USER,
} from '../services/crewService';

function makeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}
const authed = (extra: any = {}) => ({ user: { id: 'u1', guildXp: 900 }, body: {}, params: {}, query: {}, ...extra });

function deepReset(obj: any) {
  Object.values(obj).forEach((v: any) => {
    if (typeof v === 'function' && (v as any).mockReset) (v as any).mockReset();
    else if (v && typeof v === 'object') deepReset(v);
  });
}

beforeEach(() => {
  deepReset(txClient);
  deepReset(mockPrisma);
  mockSpendXp.mockReset();
  mockGetSpendableXp.mockReset();
  mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(txClient));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('crew name and description validation', () => {
  it('trims, collapses spaces and slugifies', () => {
    const r = validateCrewName('  Grand   Rapids  Hunters ');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe('Grand Rapids Hunters');
      expect(r.value.slug).toBe('grand-rapids-hunters');
    }
  });

  it('enforces 3 to 30 characters', () => {
    expect(validateCrewName('ab').ok).toBe(false);
    expect(validateCrewName('abc').ok).toBe(true);
    expect(validateCrewName('a'.repeat(30)).ok).toBe(true);
    expect(validateCrewName('a'.repeat(31)).ok).toBe(false);
    expect(validateCrewName(undefined).ok).toBe(false);
    expect(validateCrewName(42 as any).ok).toBe(false);
  });

  it('rejects disallowed characters', () => {
    expect(validateCrewName('Crew <b>x</b>').ok).toBe(false);
    expect(validateCrewName('Crew!!!').ok).toBe(false);
    expect(validateCrewName("Bob's Finds & Co.").ok).toBe(true);
  });

  it('blocks offensive terms as whole words only', () => {
    expect(validateCrewName('Shit Finders').ok).toBe(false);
    expect(validateCrewName('sh1t crew').ok).toBe(false);
    expect(validateCrewName('Scunthorpe Hunters').ok).toBe(true);
    expect(validateCrewName('Grape Pickers').ok).toBe(true);
  });

  it('blocks names that imitate FindA.Sale staff', () => {
    expect(validateCrewName('FindA.Sale Official').ok).toBe(false);
    expect(validateCrewName('Find A Sale Fans').ok).toBe(false);
    expect(validateCrewName('Admin Crew').ok).toBe(false);
  });

  it('slugifyCrewName strips accents, apostrophes and punctuation', () => {
    expect(slugifyCrewName("Café Bob's Finds & Co.")).toBe('cafe-bobs-finds-and-co');
  });

  it('validates the description', () => {
    expect(validateCrewDescription(undefined)).toEqual({ ok: true, value: null });
    expect(validateCrewDescription('   ')).toEqual({ ok: true, value: null });
    expect(validateCrewDescription('x'.repeat(501)).ok).toBe(false);
    expect(validateCrewDescription('<script>x</script>Vintage lovers')).toEqual({ ok: true, value: 'Vintage lovers' });
    expect(validateCrewDescription(5 as any).ok).toBe(false);
  });
});

describe('createCrew', () => {
  const happy = () => {
    mockPrisma.crewMember.count.mockResolvedValue(0);
    mockPrisma.crew.findFirst.mockResolvedValue(null);
    mockGetSpendableXp.mockResolvedValue(900);
    txClient.crewMember.count.mockResolvedValue(0);
    txClient.crew.findFirst.mockResolvedValue(null);
    mockSpendXp.mockResolvedValue(true);
    txClient.crew.create.mockResolvedValue({
      id: 'c1', name: 'Mid Century Hunters', slug: 'mid-century-hunters', description: null,
      isPublic: true, memberCount: 1, createdAt: new Date(),
    });
    txClient.crewMember.create.mockResolvedValue({});
    mockPrisma.user.findUnique.mockResolvedValue({ guildXp: 400 });
  };

  it('spends XP, creates the crew and the founder membership in ONE transaction', async () => {
    happy();
    const res = makeRes();
    await createCrew(authed({ body: { name: 'Mid Century Hunters' } }) as any, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    // The 5th argument to spendXp is the interactive-transaction client, not the base prisma.
    expect(mockSpendXp).toHaveBeenCalledWith('u1', 500, 'CREW_CREATION', expect.any(Object), txClient);
    expect(txClient.crew.create).toHaveBeenCalledTimes(1);
    expect(txClient.crewMember.create).toHaveBeenCalledWith({
      data: { crewId: 'c1', userId: 'u1', role: 'FOUNDER' },
    });
    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({ xpSpent: 500, remainingXp: 400 });
  });

  it('returns 409 for a duplicate name BEFORE any XP is spent', async () => {
    happy();
    mockPrisma.crew.findFirst.mockResolvedValue({ id: 'existing' });
    const res = makeRes();
    await createCrew(authed({ body: { name: 'Mid Century Hunters' } }) as any, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].code).toBe('CREW_NAME_TAKEN');
    expect(mockSpendXp).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('checks the name case-insensitively', async () => {
    happy();
    const res = makeRes();
    await createCrew(authed({ body: { name: 'Mid Century Hunters' } }) as any, res);
    const where = mockPrisma.crew.findFirst.mock.calls[0][0].where;
    expect(where.OR[0].name).toEqual({ equals: 'Mid Century Hunters', mode: 'insensitive' });
    expect(where.OR[1]).toEqual({ slug: 'mid-century-hunters' });
  });

  it('returns 400 (not 500) when the spendable balance is short, without spending', async () => {
    happy();
    mockGetSpendableXp.mockResolvedValue(120);
    const res = makeRes();
    await createCrew(authed({ body: { name: 'Mid Century Hunters' } }) as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0]).toMatchObject({ code: 'INSUFFICIENT_XP', required: 500, spendable: 120 });
    expect(mockSpendXp).not.toHaveBeenCalled();
  });

  it('returns 400 and creates nothing when spendXp reports insufficient balance inside the transaction', async () => {
    happy();
    mockSpendXp.mockResolvedValue(false);
    const res = makeRes();
    await createCrew(authed({ body: { name: 'Mid Century Hunters' } }) as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(txClient.crew.create).not.toHaveBeenCalled();
  });

  it('enforces the 3-crew cap with a 409', async () => {
    happy();
    mockPrisma.crewMember.count.mockResolvedValue(MAX_CREWS_PER_USER);
    const res = makeRes();
    await createCrew(authed({ body: { name: 'Mid Century Hunters' } }) as any, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].code).toBe('CREW_LIMIT_REACHED');
    expect(mockSpendXp).not.toHaveBeenCalled();
  });

  it('maps a lost unique-index race (P2002) to 409 and never reports a 500', async () => {
    happy();
    txClient.crew.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    const res = makeRes();
    await createCrew(authed({ body: { name: 'Mid Century Hunters' } }) as any, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].code).toBe('CREW_NAME_TAKEN');
  });

  it('rejects invalid input with 400 and requires auth', async () => {
    const res1 = makeRes();
    await createCrew(authed({ body: { name: 'x' } }) as any, res1);
    expect(res1.status).toHaveBeenCalledWith(400);

    const res2 = makeRes();
    await createCrew({ body: { name: 'Mid Century Hunters' } } as any, res2);
    expect(res2.status).toHaveBeenCalledWith(401);
    expect(mockSpendXp).not.toHaveBeenCalled();
  });
});

describe('joinCrew', () => {
  const setup = () => {
    mockPrisma.crew.findUnique.mockResolvedValue({ id: 'c1', isPublic: true, memberCount: 5 });
    txClient.crewMember.findUnique.mockResolvedValue(null);
    txClient.crewMember.count.mockResolvedValue(1);
    txClient.crew.updateMany.mockResolvedValue({ count: 1 });
    txClient.crewMember.create.mockResolvedValue({});
    txClient.crew.findUnique.mockResolvedValue({ memberCount: 6 });
  };

  it('joins instantly and returns the fresh count', async () => {
    setup();
    const res = makeRes();
    await joinCrew(authed({ params: { crewId: 'c1' } }) as any, res);
    expect(res.json).toHaveBeenCalledWith({ success: true, crewId: 'c1', memberCount: 6 });
    expect(txClient.crew.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', memberCount: { lt: MAX_CREW_MEMBERS } },
      data: { memberCount: { increment: 1 } },
    });
  });

  it('refuses a full crew with 409 and does not add the member', async () => {
    setup();
    txClient.crew.updateMany.mockResolvedValue({ count: 0 });
    const res = makeRes();
    await joinCrew(authed({ params: { crewId: 'c1' } }) as any, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].code).toBe('CREW_FULL');
    expect(txClient.crewMember.create).not.toHaveBeenCalled();
  });

  it('refuses when already a member (409) or at the crew cap (409)', async () => {
    setup();
    txClient.crewMember.findUnique.mockResolvedValue({ id: 'm' });
    const res1 = makeRes();
    await joinCrew(authed({ params: { crewId: 'c1' } }) as any, res1);
    expect(res1.status).toHaveBeenCalledWith(409);
    expect(res1.json.mock.calls[0][0].code).toBe('ALREADY_MEMBER');

    setup();
    txClient.crewMember.count.mockResolvedValue(MAX_CREWS_PER_USER);
    const res2 = makeRes();
    await joinCrew(authed({ params: { crewId: 'c1' } }) as any, res2);
    expect(res2.status).toHaveBeenCalledWith(409);
    expect(res2.json.mock.calls[0][0].code).toBe('CREW_LIMIT_REACHED');
  });

  it('404s for an unknown crew', async () => {
    mockPrisma.crew.findUnique.mockResolvedValue(null);
    const res = makeRes();
    await joinCrew(authed({ params: { crewId: 'nope' } }) as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('leaveCrew / removeMember', () => {
  it('a founder cannot leave (must transfer or disband)', async () => {
    mockPrisma.crewMember.findUnique.mockResolvedValue({ id: 'm1', role: 'FOUNDER' });
    const res = makeRes();
    await leaveCrew(authed({ params: { crewId: 'c1' } }) as any, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].code).toBe('FOUNDER_MUST_TRANSFER_OR_DISBAND');
    expect(txClient.crewMember.deleteMany).not.toHaveBeenCalled();
  });

  it('a member can leave and the count is decremented in the same transaction', async () => {
    mockPrisma.crewMember.findUnique.mockResolvedValue({ id: 'm1', role: 'MEMBER' });
    txClient.crewMember.deleteMany.mockResolvedValue({ count: 1 });
    txClient.crew.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.crew.findUnique.mockResolvedValue({ memberCount: 4 });
    const res = makeRes();
    await leaveCrew(authed({ params: { crewId: 'c1' } }) as any, res);
    expect(res.json).toHaveBeenCalledWith({ success: true, crewId: 'c1', memberCount: 4 });
    expect(txClient.crew.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { memberCount: { decrement: 1 } } }),
    );
  });

  it('removeMember: founder cannot remove self, member cannot remove others, founder can remove a member', async () => {
    // Member references are resolved inside the crew's own member list (2026-09-29: roster ids are opaque).
    mockPrisma.crewMember.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);
    // founder removing self
    mockPrisma.crewMember.findUnique.mockResolvedValueOnce({ role: 'FOUNDER' });
    const r1 = makeRes();
    await removeMember(authed({ params: { crewId: 'c1', userId: 'u1' } }) as any, r1);
    expect(r1.status).toHaveBeenCalledWith(409);

    // plain member removing someone else
    mockPrisma.crewMember.findUnique.mockResolvedValueOnce({ role: 'MEMBER' });
    const r2 = makeRes();
    await removeMember(authed({ params: { crewId: 'c1', userId: 'u2' } }) as any, r2);
    expect(r2.status).toHaveBeenCalledWith(403);

    // founder removing a member
    mockPrisma.crewMember.findUnique
      .mockResolvedValueOnce({ role: 'FOUNDER' })
      .mockResolvedValueOnce({ role: 'MEMBER' });
    txClient.crewMember.deleteMany.mockResolvedValue({ count: 1 });
    txClient.crew.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.crew.findUnique.mockResolvedValue({ memberCount: 3 });
    const r3 = makeRes();
    await removeMember(authed({ params: { crewId: 'c1', userId: 'u2' } }) as any, r3);
    expect(r3.json).toHaveBeenCalledWith({ success: true, crewId: 'c1', memberCount: 3 });
  });
});

describe('transferFounder / disbandCrew', () => {
  it('only the founder can transfer, and the target must be a member', async () => {
    mockPrisma.crewMember.findUnique.mockResolvedValueOnce({ id: 'm1', role: 'MEMBER' });
    const r1 = makeRes();
    await transferFounder(authed({ params: { crewId: 'c1' }, body: { userId: 'u2' } }) as any, r1);
    expect(r1.status).toHaveBeenCalledWith(403);

    // founder, but u2 is not in this crew's member list
    mockPrisma.crewMember.findUnique.mockResolvedValueOnce({ id: 'm1', role: 'FOUNDER' });
    mockPrisma.crewMember.findMany.mockResolvedValue([{ userId: 'u1' }]);
    const r2 = makeRes();
    await transferFounder(authed({ params: { crewId: 'c1' }, body: { userId: 'u2' } }) as any, r2);
    expect(r2.status).toHaveBeenCalledWith(404);
  });

  it('transfer swaps roles and the crew founderUserId together', async () => {
    mockPrisma.crewMember.findUnique.mockResolvedValueOnce({ id: 'm1', role: 'FOUNDER' });
    mockPrisma.crewMember.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);
    txClient.crewMember.findUnique
      .mockResolvedValueOnce({ id: 'm1', role: 'FOUNDER' })
      .mockResolvedValueOnce({ id: 'm2', role: 'MEMBER' });
    const res = makeRes();
    await transferFounder(authed({ params: { crewId: 'c1' }, body: { userId: 'u2' } }) as any, res);
    expect(txClient.crewMember.update).toHaveBeenCalledWith({ where: { id: 'm2' }, data: { role: 'FOUNDER' } });
    expect(txClient.crewMember.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { role: 'MEMBER' } });
    expect(txClient.crew.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { founderUserId: 'u2' } });
    // The response carries the opaque id, never the target's real user id.
    expect(res.json).toHaveBeenCalledWith({ success: true, crewId: 'c1', founderUserId: opaqueUserId('u2') });
  });

  it('disband needs the founder and the exact crew name', async () => {
    mockPrisma.crew.findUnique.mockResolvedValue({ id: 'c1', name: 'Mid Century Hunters', founderUserId: 'u9' });
    const r1 = makeRes();
    await disbandCrew(authed({ params: { crewId: 'c1' }, body: { confirmName: 'Mid Century Hunters' } }) as any, r1);
    expect(r1.status).toHaveBeenCalledWith(403);

    mockPrisma.crew.findUnique.mockResolvedValue({ id: 'c1', name: 'Mid Century Hunters', founderUserId: 'u1' });
    const r2 = makeRes();
    await disbandCrew(authed({ params: { crewId: 'c1' }, body: { confirmName: 'wrong' } }) as any, r2);
    expect(r2.status).toHaveBeenCalledWith(400);
    expect(txClient.crew.delete).not.toHaveBeenCalled();

    const r3 = makeRes();
    await disbandCrew(authed({ params: { crewId: 'c1' }, body: { confirmName: 'mid century hunters' } }) as any, r3);
    expect(txClient.crewInvasionCode.deleteMany).toHaveBeenCalledWith({ where: { crewId: 'c1' } });
    expect(txClient.crew.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    expect(r3.json).toHaveBeenCalledWith({ success: true, crewId: 'c1' });
  });
});

describe('getCrewFeed', () => {
  it('only returns APPROVED photos from crew members', async () => {
    mockPrisma.crew.findUnique.mockResolvedValue({ id: 'c1', name: 'X' });
    mockPrisma.crewMember.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);
    mockPrisma.uGCPhoto.findMany.mockResolvedValue([]);
    const res = makeRes();
    await getCrewFeed({ params: { crewId: 'c1' } } as any, res);
    const where = mockPrisma.uGCPhoto.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ userId: { in: ['u1', 'u2'] }, status: 'APPROVED' });
  });
});
