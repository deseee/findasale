/**
 * Crews public endpoints (2026-09-29, data minimization): getCrew / getCrewLeaderboard / getCrewFeed /
 * listCrews must never return a member's real user id (unless their collector passport is public),
 * full name, or profile slug (same condition); names are "First L.". Founder tools (remove, transfer)
 * accept the opaque id and resolve it inside that crew's members only.
 */
var mockPrisma: any = {
  crew: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  crewMember: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), deleteMany: jest.fn(), update: jest.fn() },
  collectorPassport: { findMany: jest.fn() },
  uGCPhoto: { findMany: jest.fn() },
  $transaction: jest.fn(),
};
const txClient: any = {
  crew: { updateMany: jest.fn(), update: jest.fn() },
  crewMember: { findUnique: jest.fn(), deleteMany: jest.fn(), update: jest.fn() },
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../services/xpService', () => ({ spendXp: jest.fn(), getSpendableXp: jest.fn(), XP_SINKS: { CREW_CREATION: 500 } }));

import {
  getCrew,
  getCrewLeaderboard,
  getCrewFeed,
  listCrews,
  removeMember,
  transferFounder,
} from '../controllers/crewController';
import { opaqueUserId } from '../utils/opaqueUserId';

function makeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const USERS: Record<string, any> = {
  // u1 and u2 opted in to a public name (notificationPrefs.showNameInGoingList); u3 did not.
  u1: { id: 'u1', name: 'Frank Founder', profileSlug: 'frank', guildXp: 900, explorerRank: 'SCOUT', email: 'frank@example.com', notificationPrefs: { showNameInGoingList: true } },
  u2: { id: 'u2', name: 'Jane Doe', profileSlug: 'jane-d', guildXp: 500, explorerRank: 'SCOUT', notificationPrefs: { showNameInGoingList: true } },
  u3: { id: 'u3', name: 'Bob Smith', profileSlug: 'bobby', guildXp: 100, explorerRank: 'INITIATE' },
};
const memberRow = (uid: string, role = 'MEMBER') => ({ userId: uid, role, joinedAt: new Date('2026-09-01'), user: USERS[uid] });
const crewRow = () => ({
  id: 'c1', name: 'Crew One', slug: 'crew-one', description: 'd', isPublic: true, memberCount: 3, createdAt: new Date('2026-09-01'),
  founder: USERS.u1,
  members: [memberRow('u1', 'FOUNDER'), memberRow('u2'), memberRow('u3')],
});

function deepReset(o: any) {
  Object.values(o).forEach((v: any) => {
    if (typeof v === 'function' && v.mockReset) v.mockReset();
    else if (v && typeof v === 'object') deepReset(v);
  });
}
beforeEach(() => {
  process.env.JWT_SECRET = 'test-secret';
  deepReset(mockPrisma);
  deepReset(txClient);
  mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(txClient));
  // u2 has a PUBLIC collector passport; u1 and u3 do not
  mockPrisma.collectorPassport.findMany.mockResolvedValue([{ userId: 'u2' }]);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

const dump = (v: unknown) => JSON.stringify(v);

describe('getCrew (public)', () => {
  it('returns First L. names, opaque ids for private members and real ids only for public passports', async () => {
    mockPrisma.crew.findUnique.mockResolvedValue(crewRow());
    const res = makeRes();
    await getCrew({ params: { crewId: 'c1' } } as any, res);
    const body = res.json.mock.calls[0][0];
    const text = dump(body);

    // no full names, no email, no real ids/slugs of private members
    expect(text).not.toContain('Frank Founder');
    expect(text).not.toContain('Jane Doe');
    expect(text).not.toContain('Bob Smith');
    expect(text).not.toContain('frank@example.com');
    expect(text).not.toContain('"u1"');
    expect(text).not.toContain('"u3"');
    expect(text).not.toContain('frank"');
    expect(text).not.toContain('bobby');

    expect(body.founder.name).toBe('Frank F.');
    expect(body.founder.id).toBe(opaqueUserId('u1'));
    expect(body.founder.profileSlug).toBeNull();
    expect(body.founder.profilePublic).toBe(false);

    const jane = body.members.find((m: any) => m.user.name === 'Jane D.');
    expect(jane.userId).toBe('u2'); // public passport: the profile page resolves this id
    expect(jane.user.id).toBe('u2');
    expect(jane.user.profileSlug).toBe('jane-d');
    expect(jane.user.profilePublic).toBe(true);
    expect(jane.memberRef).toBe(opaqueUserId('u2')); // founder tools always use the opaque ref

    const bob = body.members.find((m: any) => m.userId === opaqueUserId('u3'));
    expect(bob.user.name).toBe('Explorer'); // did not opt in to a public name
    expect(bob.user.profileSlug).toBeNull();
    expect(text).not.toContain('notificationPrefs'); // the gate input is never returned
  });

  it('a member whose account name is an email address shows as Explorer, even when opted in', async () => {
    const row = crewRow();
    row.members[1] = memberRow('u2');
    USERS.u2 = { ...USERS.u2, name: 'jane.doe@example.com' };
    try {
      mockPrisma.crew.findUnique.mockResolvedValue({ ...row, members: [memberRow('u1', 'FOUNDER'), memberRow('u2'), memberRow('u3')] });
      const res = makeRes();
      await getCrew({ params: { crewId: 'c1' } } as any, res);
      const text = dump(res.json.mock.calls[0][0]);
      expect(text).not.toContain('jane.doe@example.com');
      expect(text).not.toContain('@');
    } finally {
      USERS.u2 = { ...USERS.u2, name: 'Jane Doe' };
    }
  });

  it('anonymous viewer is not a member; a signed-in member gets viewer role and isSelf', async () => {
    mockPrisma.crew.findUnique.mockResolvedValue(crewRow());
    const anon = makeRes();
    await getCrew({ params: { crewId: 'c1' } } as any, anon);
    expect(anon.json.mock.calls[0][0].viewer).toEqual({ isMember: false, role: null });
    expect(anon.json.mock.calls[0][0].members.some((m: any) => m.isSelf)).toBe(false);

    const me = makeRes();
    await getCrew({ params: { crewId: 'c1' }, user: { id: 'u3' } } as any, me);
    const body = me.json.mock.calls[0][0];
    expect(body.viewer).toEqual({ isMember: true, role: 'MEMBER' });
    expect(body.members.filter((m: any) => m.isSelf)).toHaveLength(1);
    expect(body.members.find((m: any) => m.isSelf).user.name).toBe('Explorer'); // the viewer did not opt in: even their own public row hides the name
    expect(dump(body)).not.toContain('Bob Smith');
  });

  it('404s an unknown crew', async () => {
    mockPrisma.crew.findUnique.mockResolvedValue(null);
    const res = makeRes();
    await getCrew({ params: { crewId: 'nope' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('getCrewLeaderboard (public)', () => {
  it('ranks members with the same public-safe identity shape', async () => {
    mockPrisma.crew.findUnique.mockResolvedValue({ id: 'c1', name: 'Crew One' });
    mockPrisma.crewMember.findMany.mockResolvedValue([memberRow('u1', 'FOUNDER'), memberRow('u2'), memberRow('u3')]);
    const res = makeRes();
    await getCrewLeaderboard({ params: { crewId: 'c1' }, user: { id: 'u1' } } as any, res);
    const body = res.json.mock.calls[0][0];
    const text = dump(body);
    expect(text).not.toContain('Frank Founder');
    expect(text).not.toContain('Jane Doe');
    expect(text).not.toContain('"u1"');
    expect(text).not.toContain('"u3"');
    expect(body.members.map((m: any) => m.rank)).toEqual([1, 2, 3]);
    expect(body.members[0].isSelf).toBe(true);
    expect(body.members[0].userId).toBe(opaqueUserId('u1'));
    expect(body.members[1].userId).toBe('u2');
    expect(body.members[1].user.guildXp).toBe(500);
  });
});

describe('getCrewFeed (public)', () => {
  it('photo authors carry opaque ids and First L. names', async () => {
    mockPrisma.crew.findUnique.mockResolvedValue({ id: 'c1', name: 'Crew One' });
    mockPrisma.crewMember.findMany.mockResolvedValue([{ userId: 'u2' }, { userId: 'u3' }]);
    mockPrisma.uGCPhoto.findMany.mockResolvedValue([
      { id: 1, photoUrl: 'p1', caption: null, likesCount: 2, createdAt: new Date(), user: { id: 'u2', name: 'Jane Doe', profileSlug: 'jane-d', explorerRank: 'SCOUT', notificationPrefs: { showNameInGoingList: true } } },
      { id: 2, photoUrl: 'p2', caption: 'hi', likesCount: 0, createdAt: new Date(), user: { id: 'u3', name: 'Bob Smith', profileSlug: 'bobby', explorerRank: 'INITIATE' } },
    ]);
    const res = makeRes();
    await getCrewFeed({ params: { crewId: 'c1' } } as any, res);
    const body = res.json.mock.calls[0][0];
    const text = dump(body);
    expect(text).not.toContain('Jane Doe');
    expect(text).not.toContain('Bob Smith');
    expect(text).not.toContain('"u3"');
    expect(text).not.toContain('bobby');
    expect(body.photos[0].user).toMatchObject({ id: 'u2', name: 'Jane D.', profileSlug: 'jane-d', profilePublic: true });
    expect(body.photos[1].user).toMatchObject({ id: opaqueUserId('u3'), name: 'Explorer', profileSlug: null, profilePublic: false });
  });
});

describe('listCrews (public)', () => {
  it('founder is First L. with an opaque id unless public', async () => {
    mockPrisma.crew.count.mockResolvedValue(1);
    mockPrisma.crew.findMany.mockResolvedValue([
      { id: 'c1', name: 'Crew One', slug: 's', description: null, memberCount: 3, createdAt: new Date(), founder: { id: 'u1', name: 'Frank Founder', notificationPrefs: { showNameInGoingList: true } } },
    ]);
    const res = makeRes();
    await listCrews({ query: {} } as any, res);
    const body = res.json.mock.calls[0][0];
    expect(dump(body)).not.toContain('Frank Founder');
    expect(dump(body)).not.toContain('"u1"');
    expect(body.crews[0].founder).toEqual({ id: opaqueUserId('u1'), name: 'Frank F.', profilePublic: false });
    expect(body.crews[0].isMember).toBe(false);
  });
});

describe('founder tools accept the opaque id', () => {
  const authed = (extra: any) => ({ user: { id: 'u1' }, body: {}, params: {}, ...extra });

  it('removeMember: founder removes a member by opaque ref (resolved inside this crew)', async () => {
    mockPrisma.crewMember.findUnique
      .mockResolvedValueOnce({ role: 'FOUNDER' }) // caller
      .mockResolvedValueOnce({ role: 'MEMBER' }); // target
    mockPrisma.crewMember.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u3' }]);
    txClient.crewMember.deleteMany.mockResolvedValue({ count: 1 });
    txClient.crew.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.crew.findUnique.mockResolvedValue({ memberCount: 1 });
    const res = makeRes();
    await removeMember(authed({ params: { crewId: 'c1', userId: opaqueUserId('u3') } }) as any, res);
    expect(txClient.crewMember.deleteMany).toHaveBeenCalledWith({ where: { crewId: 'c1', userId: 'u3' } });
    expect(res.json).toHaveBeenCalledWith({ success: true, crewId: 'c1', memberCount: 1 });
  });

  it('removeMember: an opaque ref that is not in this crew is a 404 for the founder', async () => {
    mockPrisma.crewMember.findUnique.mockResolvedValueOnce({ role: 'FOUNDER' });
    mockPrisma.crewMember.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u3' }]);
    const res = makeRes();
    await removeMember(authed({ params: { crewId: 'c1', userId: opaqueUserId('stranger') } }) as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(txClient.crewMember.deleteMany).not.toHaveBeenCalled();
  });

  it('removeMember: a plain member cannot remove another member even with a valid opaque ref, but can remove themselves', async () => {
    mockPrisma.crewMember.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u3' }]);
    mockPrisma.crewMember.findUnique.mockResolvedValueOnce({ role: 'MEMBER' });
    const other = makeRes();
    await removeMember(authed({ user: { id: 'u3' }, params: { crewId: 'c1', userId: opaqueUserId('u1') } }) as any, other);
    expect(other.status).toHaveBeenCalledWith(403);

    mockPrisma.crewMember.findUnique.mockResolvedValueOnce({ role: 'MEMBER' }).mockResolvedValueOnce({ role: 'MEMBER' });
    txClient.crewMember.deleteMany.mockResolvedValue({ count: 1 });
    txClient.crew.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.crew.findUnique.mockResolvedValue({ memberCount: 1 });
    const self = makeRes();
    await removeMember(authed({ user: { id: 'u3' }, params: { crewId: 'c1', userId: opaqueUserId('u3') } }) as any, self);
    expect(txClient.crewMember.deleteMany).toHaveBeenCalledWith({ where: { crewId: 'c1', userId: 'u3' } });
  });

  it('transferFounder: resolves the opaque ref inside the crew and answers with an opaque id', async () => {
    mockPrisma.crewMember.findUnique.mockResolvedValueOnce({ id: 'm1', role: 'FOUNDER' });
    mockPrisma.crewMember.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u3' }]);
    txClient.crewMember.findUnique
      .mockResolvedValueOnce({ id: 'm1', role: 'FOUNDER' })
      .mockResolvedValueOnce({ id: 'm3', role: 'MEMBER' });
    const res = makeRes();
    await transferFounder(authed({ params: { crewId: 'c1' }, body: { userId: opaqueUserId('u3') } }) as any, res);
    expect(txClient.crew.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { founderUserId: 'u3' } });
    expect(res.json).toHaveBeenCalledWith({ success: true, crewId: 'c1', founderUserId: opaqueUserId('u3') });
    expect(dump(res.json.mock.calls[0][0])).not.toContain('"u3"');
  });

  it('transferFounder: a non-founder gets 403 before any roster lookup result is revealed', async () => {
    mockPrisma.crewMember.findUnique.mockResolvedValueOnce({ id: 'm3', role: 'MEMBER' });
    const res = makeRes();
    await transferFounder(authed({ user: { id: 'u3' }, params: { crewId: 'c1' }, body: { userId: opaqueUserId('u2') } }) as any, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockPrisma.crewMember.findMany).not.toHaveBeenCalled();
  });

  it('transferFounder: an opaque ref for a non-member is 404 and nothing is written', async () => {
    mockPrisma.crewMember.findUnique.mockResolvedValueOnce({ id: 'm1', role: 'FOUNDER' });
    mockPrisma.crewMember.findMany.mockResolvedValue([{ userId: 'u1' }]);
    const res = makeRes();
    await transferFounder(authed({ params: { crewId: 'c1' }, body: { userId: opaqueUserId('stranger') } }) as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(txClient.crew.update).not.toHaveBeenCalled();
  });
});
