/**
 * crewService.checkCrewVisitBonus (the 1.25x crew check-in bonus) is no longer farmable by throwaway
 * crews (2026-09-29). It now applies the same account qualification Crew Invasion XP uses
 * (crewQualification.isQualifiedInvasionMember): the checking-in user AND the two other members that
 * already checked in must each be at least 7 days old, not fraudSuspect, not the sale's organizer, and
 * have real prior activity (a non-refunded paid purchase or a check-in) at a DIFFERENT sale.
 *
 * Proves both sides: a crew of real, established shoppers still gets 1.25, and a puppet crew (new
 * accounts, no history, flagged accounts, the organizer) gets 1.0. Prisma is mocked; the qualification
 * code under test is the real implementation.
 */

jest.mock('../lib/prisma', () => ({
  prisma: {
    crewMember: { findMany: jest.fn() },
    sale: { findUnique: jest.fn() },
    pointsTransaction: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
    purchase: { findMany: jest.fn() },
    saleCheckin: { findMany: jest.fn() },
  },
}));
jest.mock('../lib/sanitize', () => ({ sanitizeText: (s: string) => s }));

import { prisma } from '../lib/prisma';
import { checkCrewVisitBonus } from '../services/crewService';

const db: any = prisma;
const DAY = 24 * 60 * 60 * 1000;
const old = () => new Date(Date.now() - 30 * DAY);
const fresh = () => new Date(Date.now() - 1 * DAY);

interface Person { createdAt: Date; fraudSuspect?: boolean; activity?: 'purchase' | 'checkin' | 'none' }

/**
 * crews: crewId -> member ids. visitors: user ids that already checked in to the sale today.
 * people: per-user account facts (defaults: established, prior purchase elsewhere).
 */
function world(opts: { crews: Record<string, string[]>; visitors: string[]; people?: Record<string, Person>; organizerUserId?: string | null }) {
  const person = (id: string): Person => ({ createdAt: old(), fraudSuspect: false, activity: 'purchase', ...(opts.people?.[id] ?? {}) });
  db.crewMember.findMany.mockImplementation(async ({ where }: any) => {
    if (where.userId) {
      return Object.entries(opts.crews).filter(([, m]) => m.includes(where.userId)).map(([crewId]) => ({ crewId }));
    }
    return (opts.crews[where.crewId] ?? []).map((userId) => ({ userId }));
  });
  db.sale.findUnique.mockResolvedValue({ organizer: opts.organizerUserId === undefined ? { userId: 'org-user' } : opts.organizerUserId ? { userId: opts.organizerUserId } : null });
  db.pointsTransaction.findMany.mockImplementation(async ({ where }: any) =>
    // one row per visit, so a member who checked in twice appears twice
    opts.visitors.filter((v) => where.userId.in.includes(v)).map((userId) => ({ userId }))
  );
  db.user.findMany.mockImplementation(async ({ where }: any) =>
    where.id.in.map((id: string) => ({ id, createdAt: person(id).createdAt, fraudSuspect: !!person(id).fraudSuspect }))
  );
  db.purchase.findMany.mockImplementation(async ({ where }: any) =>
    where.userId.in.filter((id: string) => person(id).activity === 'purchase').map((userId: string) => ({ userId }))
  );
  db.saleCheckin.findMany.mockImplementation(async ({ where }: any) =>
    where.userId.in.filter((id: string) => person(id).activity === 'checkin').map((userId: string) => ({ userId }))
  );
}

const CREW = { c1: ['me', 'a', 'b', 'c'] };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('checkCrewVisitBonus: real crews still get the bonus', () => {
  it('1.25 for an established user when two established crew mates already checked in', async () => {
    world({ crews: CREW, visitors: ['a', 'b'] });
    expect(await checkCrewVisitBonus('me', 'sale_1')).toBe(1.25);
  });

  it('prior activity can be a check-in elsewhere instead of a purchase', async () => {
    world({ crews: CREW, visitors: ['a', 'b'], people: { me: { createdAt: old(), activity: 'checkin' }, a: { createdAt: old(), activity: 'checkin' } } });
    expect(await checkCrewVisitBonus('me', 'sale_1')).toBe(1.25);
  });

  it('a third qualified visitor is fine, and one unqualified visitor among three does not block it', async () => {
    world({ crews: CREW, visitors: ['a', 'b', 'c'], people: { c: { createdAt: fresh(), activity: 'none' } } });
    expect(await checkCrewVisitBonus('me', 'sale_1')).toBe(1.25);
  });

  it('qualifies through a second crew when the first one does not', async () => {
    world({ crews: { c1: ['me', 'x', 'y'], c2: ['me', 'a', 'b'] }, visitors: ['a', 'b'] });
    expect(await checkCrewVisitBonus('me', 'sale_1')).toBe(1.25);
  });
});

describe('checkCrewVisitBonus: puppet crews cannot farm it', () => {
  it('1.0 when the user is a brand new account', async () => {
    world({ crews: CREW, visitors: ['a', 'b'], people: { me: { createdAt: fresh() } } });
    expect(await checkCrewVisitBonus('me', 'sale_1')).toBe(1.0);
  });

  it('1.0 when the user has no purchase or check-in at another sale', async () => {
    world({ crews: CREW, visitors: ['a', 'b'], people: { me: { createdAt: old(), activity: 'none' } } });
    expect(await checkCrewVisitBonus('me', 'sale_1')).toBe(1.0);
  });

  it('1.0 when the user is flagged fraudSuspect', async () => {
    world({ crews: CREW, visitors: ['a', 'b'], people: { me: { createdAt: old(), fraudSuspect: true } } });
    expect(await checkCrewVisitBonus('me', 'sale_1')).toBe(1.0);
  });

  it('1.0 when the user is the sale\'s own organizer', async () => {
    world({ crews: CREW, visitors: ['a', 'b'], organizerUserId: 'me' });
    expect(await checkCrewVisitBonus('me', 'sale_1')).toBe(1.0);
  });

  it('1.0 when the two earlier check-ins are throwaway accounts (new, or no history, or flagged)', async () => {
    world({ crews: CREW, visitors: ['a', 'b'], people: { a: { createdAt: fresh() }, b: { createdAt: old(), activity: 'none' } } });
    expect(await checkCrewVisitBonus('me', 'sale_1')).toBe(1.0);
    world({ crews: CREW, visitors: ['a', 'b'], people: { a: { createdAt: old(), fraudSuspect: true } } });
    expect(await checkCrewVisitBonus('me', 'sale_1')).toBe(1.0);
  });

  it('1.0 when only ONE qualified crew mate checked in (the other qualified check-in is missing)', async () => {
    world({ crews: CREW, visitors: ['a', 'b'], people: { b: { createdAt: fresh() } } });
    expect(await checkCrewVisitBonus('me', 'sale_1')).toBe(1.0);
  });

  it('one member checking in twice counts once (distinct users)', async () => {
    world({ crews: CREW, visitors: ['a', 'a'] });
    expect(await checkCrewVisitBonus('me', 'sale_1')).toBe(1.0);
  });

  it('does not run the visit or qualification lookups for the other members when the user themself fails', async () => {
    world({ crews: CREW, visitors: ['a', 'b'], people: { me: { createdAt: fresh() } } });
    await checkCrewVisitBonus('me', 'sale_1');
    expect(db.pointsTransaction.findMany).not.toHaveBeenCalled();
  });
});

describe('checkCrewVisitBonus: unchanged base rules', () => {
  it('1.0 and no queries beyond membership when the user is in no crew', async () => {
    world({ crews: {}, visitors: [] });
    expect(await checkCrewVisitBonus('me', 'sale_1')).toBe(1.0);
    expect(db.sale.findUnique).not.toHaveBeenCalled();
  });

  it('1.0 for a crew of fewer than three members', async () => {
    world({ crews: { c1: ['me', 'a'] }, visitors: ['a'] });
    expect(await checkCrewVisitBonus('me', 'sale_1')).toBe(1.0);
  });

  it('fails safe to 1.0 on a database error', async () => {
    db.crewMember.findMany.mockRejectedValue(new Error('db down'));
    expect(await checkCrewVisitBonus('me', 'sale_1')).toBe(1.0);
  });

  it('only counts check-ins for THIS sale today', async () => {
    world({ crews: CREW, visitors: ['a', 'b'] });
    await checkCrewVisitBonus('me', 'sale_9');
    const where = db.pointsTransaction.findMany.mock.calls[0][0].where;
    expect(where.type).toBe('SALE_CHECKIN');
    expect(where.saleId).toBe('sale_9');
    expect(where.createdAt.gte).toBeInstanceOf(Date);
  });
});
