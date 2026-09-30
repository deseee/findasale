/**
 * Crew hand-off before account deletion (2026-09-29). Uses a plain in-memory fake client passed
 * as the `db` argument; NOT EXECUTED when written (jest cannot run on the authoring device).
 *
 * services/crewService.ts handOffCrewsBeforeUserDeletion: deleting a founder's account would
 * cascade-delete the crew and every membership (schema FK). Run in the same transaction as
 * user.delete, it hands the crew to the longest-standing other member and keeps
 * Crew.memberCount honest for crews the leaving user belonged to.
 */

var mockPrisma: any = {};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../lib/sanitize', () => ({ sanitizeText: (t: string) => t }));

import { handOffCrewsBeforeUserDeletion } from '../services/crewService';

function makeDb(opts: {
  memberships: Array<{ crewId: string; role: string }>;
  founded: Array<{ id: string }>;
  others: Record<string, Array<{ id: string; userId: string }>>; // by crew, already sorted by joinedAt asc
}) {
  return {
    crewMember: {
      findMany: jest.fn().mockResolvedValue(opts.memberships),
      findFirst: jest.fn(async (args: any) => (opts.others[args.where.crewId] ?? [])[0] ?? null),
      update: jest.fn().mockResolvedValue({}),
    },
    crew: {
      findMany: jest.fn().mockResolvedValue(opts.founded),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

describe('handOffCrewsBeforeUserDeletion', () => {
  it('does nothing for a user in no crew', async () => {
    const db = makeDb({ memberships: [], founded: [], others: {} });
    const res = await handOffCrewsBeforeUserDeletion('u1', db);
    expect(res).toEqual({ transferred: 0, decremented: 0 });
    expect(db.crew.update).not.toHaveBeenCalled();
  });

  it('hands a founded crew to the longest-standing other member and decrements the count', async () => {
    const db = makeDb({
      memberships: [{ crewId: 'c1', role: 'FOUNDER' }],
      founded: [{ id: 'c1' }],
      others: { c1: [{ id: 'cm-2', userId: 'u2' }, { id: 'cm-3', userId: 'u3' }] },
    });
    const res = await handOffCrewsBeforeUserDeletion('u1', db);
    expect(res).toEqual({ transferred: 1, decremented: 1 });
    const q = db.crewMember.findFirst.mock.calls[0][0];
    expect(q.where).toEqual({ crewId: 'c1', userId: { not: 'u1' } });
    expect(q.orderBy).toEqual({ joinedAt: 'asc' });
    expect(db.crewMember.update).toHaveBeenCalledWith({ where: { id: 'cm-2' }, data: { role: 'FOUNDER' } });
    expect(db.crew.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { founderUserId: 'u2' } });
    expect(db.crew.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', memberCount: { gt: 1 } },
      data: { memberCount: { decrement: 1 } },
    });
  });

  it('leaves a sole-member crew alone (it cascades away with the account)', async () => {
    const db = makeDb({
      memberships: [{ crewId: 'c1', role: 'FOUNDER' }],
      founded: [{ id: 'c1' }],
      others: { c1: [] },
    });
    const res = await handOffCrewsBeforeUserDeletion('u1', db);
    expect(res).toEqual({ transferred: 0, decremented: 0 });
    expect(db.crew.update).not.toHaveBeenCalled();
    expect(db.crew.updateMany).not.toHaveBeenCalled();
  });

  it('a plain member only decrements the crew count; no founder change', async () => {
    const db = makeDb({
      memberships: [{ crewId: 'c9', role: 'MEMBER' }],
      founded: [],
      others: { c9: [{ id: 'cm-founder', userId: 'u-founder' }] },
    });
    const res = await handOffCrewsBeforeUserDeletion('u1', db);
    expect(res).toEqual({ transferred: 0, decremented: 1 });
    expect(db.crewMember.update).not.toHaveBeenCalled();
    expect(db.crew.update).not.toHaveBeenCalled();
    expect(db.crew.updateMany).toHaveBeenCalledTimes(1);
  });

  it('handles a mix: founds one crew with members, belongs to another', async () => {
    const db = makeDb({
      memberships: [{ crewId: 'c1', role: 'FOUNDER' }, { crewId: 'c2', role: 'MEMBER' }],
      founded: [{ id: 'c1' }],
      others: { c1: [{ id: 'cm-a', userId: 'ua' }], c2: [{ id: 'cm-b', userId: 'ub' }] },
    });
    const res = await handOffCrewsBeforeUserDeletion('u1', db);
    expect(res).toEqual({ transferred: 1, decremented: 2 });
    expect(db.crew.update).toHaveBeenCalledTimes(1);
  });
});
