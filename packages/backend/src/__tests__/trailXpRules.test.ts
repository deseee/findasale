/**
 * Security fixes (2026-11-04, findings #188/#189) with the game designer's locked trail XP rules:
 *   1. stop XP is a server constant of 3 (client baseXp ignored on addStop; legacy stop.baseXp ignored at check-in)
 *   2. minStopsRequired / maxStops clamped to 3..7 on create (maxStops >= minStopsRequired)
 *   3. the trail's organizer and their workspace team may check in but earn 0 XP and no completion bonus
 *   4. check-in refused for a stop of another trail (404), an inactive trail, a private trail (unless owner),
 *      and an impossible jump since the user's previous trail check-in (QR-scan speed thresholds)
 *   5. at most 150 trail XP per user per UTC day; past the cap check-ins still count but award 0
 * Plus the legit path: a normal shopper completing a 3-stop trail earns 3 + 3 + 3 + 40.
 *
 * The database is a small in-memory model; awardXp is recorded, not executed.
 */
export {};

type Row = Record<string, any>;
const db: {
  stops: Row[];
  trails: Row[];
  checkIns: Row[];
  points: Row[];
  completions: Row[];
  organizers: Row[];
  teamUserIds: Set<string>;
} = { stops: [], trails: [], checkIns: [], points: [], completions: [], organizers: [], teamUserIds: new Set() };

let clock = 0;
const mockPrisma: any = {
  trailStop: {
    findUnique: jest.fn(async ({ where }: any) => db.stops.find((s) => s.id === where.id) ?? null),
    create: jest.fn(async ({ data }: any) => { const row = { id: `stop${db.stops.length + 1}`, ...data }; db.stops.push(row); return row; }),
  },
  treasureTrail: {
    findUnique: jest.fn(async ({ where }: any) => {
      const t = db.trails.find((x) => x.id === where.id);
      return t ? { ...t, stops: db.stops.filter((s) => s.trailId === t.id).map((s) => ({ order: s.order ?? 0 })) } : null;
    }),
    create: jest.fn(async ({ data }: any) => ({ id: 'new-trail', ...data, stops: [] })),
    update: jest.fn(async () => ({})),
  },
  organizer: {
    findUnique: jest.fn(async ({ where }: any) => {
      const o = db.organizers.find((x) => x.userId === where.userId);
      return o ? { id: o.id, sales: [{ id: 'sale1' }] } : null;
    }),
  },
  workspaceMember: {
    findFirst: jest.fn(async ({ where }: any) => (where.OR.some((c: any) => c.userId && db.teamUserIds.has(c.userId)) ? { id: 'wm1' } : null)),
  },
  trailCheckIn: {
    findUnique: jest.fn(async ({ where }: any) => {
      const k = where.trailId_stopId_userId;
      return db.checkIns.find((c) => c.trailId === k.trailId && c.stopId === k.stopId && c.userId === k.userId) ?? null;
    }),
    findFirst: jest.fn(async ({ where, orderBy }: any) => {
      const rows = db.checkIns.filter((c) => c.userId === where.userId && (!where.trailId || c.trailId === where.trailId));
      if (rows.length === 0) return null;
      const sorted = [...rows].sort((a, b) => a.checkedInAt - b.checkedInAt);
      return orderBy.checkedInAt === 'desc' ? sorted[sorted.length - 1] : sorted[0];
    }),
    findMany: jest.fn(async ({ where }: any) => db.checkIns.filter((c) => c.trailId === where.trailId && c.userId === where.userId)),
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `ci${db.checkIns.length + 1}`, checkedInAt: new Date(Date.now() + clock++), ...data };
      db.checkIns.push(row);
      return row;
    }),
  },
  pointsTransaction: {
    aggregate: jest.fn(async ({ where }: any) => ({
      _sum: {
        points: db.points
          .filter((p) => p.userId === where.userId && where.type.in.includes(p.type) && p.createdAt >= where.createdAt.gte)
          .reduce((s, p) => s + p.points, 0),
      },
    })),
  },
  trailCompletion: {
    findUnique: jest.fn(async ({ where }: any) => db.completions.find((c) => c.trailId === where.trailId_userId.trailId && c.userId === where.trailId_userId.userId) ?? null),
    create: jest.fn(async ({ data }: any) => { db.completions.push(data); return data; }),
  },
  user: { findUnique: jest.fn(async () => ({ guildXp: 500 })) },
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

const mockAwardXp = jest.fn(async (userId: string, type: string, points: number) => {
  db.points.push({ userId, type, points, createdAt: new Date() });
  return {};
});
jest.mock('../services/xpService', () => ({
  awardXp: (...a: any[]) => (mockAwardXp as any)(...a),
  applyHuntPassMultiplier: jest.fn(async (_u: string, base: number) => base),
  spendXp: jest.fn(async () => true),
  getSpendableXp: jest.fn(async () => 500),
}));
jest.mock('../services/referralTrancheService', () => ({ referralTrancheService: { recordTrailCompletion: jest.fn(async () => undefined) } }));
jest.mock('../services/qrScanGuardService', () => ({ qrScanConfig: () => ({ maxSpeedMps: 70, minSpeedCheckDistanceM: 1000 }) }));
jest.mock('../lib/publicSaleGate', () => ({ GATE_ORGANIZER_SELECT: {}, gateSalesForViewer: jest.fn() }));
jest.mock('../lib/saleLocationPrivacy', () => ({ redactSaleLocation: jest.fn() }));

import { checkInAtStop, addStop, createTrail } from '../controllers/trailController';

const HERE = { latitude: 42.2178, longitude: -85.8911 }; // Paw Paw, MI
const FAR = { latitude: 41.8781, longitude: -87.6298 }; // Chicago, ~170 km away

const makeRes = () => {
  const res: any = { statusCode: 200, body: undefined };
  res.status = jest.fn((c: number) => { res.statusCode = c; return res; });
  res.json = jest.fn((b: unknown) => { res.body = b; return res; });
  return res;
};
const checkIn = async (userId: string, trailId: string, stopId: string, at = HERE) => {
  const res = makeRes();
  await checkInAtStop({ params: { trailId, stopId }, body: { ...at }, user: { id: userId } } as any, res);
  return res;
};
const pointsFor = (userId: string) => db.points.filter((p) => p.userId === userId).map((p) => `${p.type}:${p.points}`);

beforeEach(() => {
  jest.clearAllMocks();
  clock = 0;
  db.stops = [
    { id: 's1', trailId: 't1', ...HERE, baseXp: 3, order: 0 },
    { id: 's2', trailId: 't1', ...HERE, baseXp: 3, order: 1 },
    { id: 's3', trailId: 't1', ...HERE, baseXp: 1000000, order: 2 }, // legacy row from before the clamp
    { id: 'other-stop', trailId: 't2', ...HERE, baseXp: 3, order: 0 },
  ];
  db.trails = [
    { id: 't1', organizerId: 'org1', userId: 'owner-user', minStopsRequired: 3, windowDays: 7, isActive: true, isPublic: true },
    { id: 't2', organizerId: 'org1', userId: 'owner-user', minStopsRequired: 3, windowDays: 7, isActive: true, isPublic: true },
    { id: 't-off', organizerId: 'org1', userId: 'owner-user', minStopsRequired: 3, windowDays: 7, isActive: false, isPublic: true },
    { id: 't-private', organizerId: 'org1', userId: 'owner-user', minStopsRequired: 3, windowDays: 7, isActive: true, isPublic: false },
  ];
  db.stops.push({ id: 'off-stop', trailId: 't-off', ...HERE, baseXp: 3 }, { id: 'priv-stop', trailId: 't-private', ...HERE, baseXp: 3 });
  db.checkIns = [];
  db.points = [];
  db.completions = [];
  db.organizers = [{ id: 'org1', userId: 'owner-user' }];
  db.teamUserIds = new Set(['staff-user']);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('legit path', () => {
  it('a normal shopper completing a 3-stop trail earns 3 + 3 + 3 + 40', async () => {
    const r1 = await checkIn('shopper', 't1', 's1');
    const r2 = await checkIn('shopper', 't1', 's2');
    const r3 = await checkIn('shopper', 't1', 's3');
    expect([r1.body.xpAwarded, r2.body.xpAwarded, r3.body.xpAwarded]).toEqual([3, 3, 3]);
    expect(r3.body).toEqual(expect.objectContaining({ completionTriggered: true, completionBonusXp: 40 }));
    expect(pointsFor('shopper')).toEqual(['TRAIL_STOP_CHECKIN:3', 'TRAIL_STOP_CHECKIN:3', 'TRAIL_STOP_CHECKIN:3', 'TRAIL_COMPLETION:40']);
    expect(db.completions[0]).toEqual(expect.objectContaining({ completionBonusXp: 40, totalXpEarned: 49 }));
    expect(pointsFor('org1')).toEqual(['TRAIL_COMPLETION:15']); // the organizer's per-completion reward is unchanged
  });
});

describe('rule 1: stop XP is a server constant of 3', () => {
  it('addStop ignores a client baseXp', async () => {
    const res = makeRes();
    await addStop({ params: { trailId: 't1' }, body: { stopName: 'Diner', latitude: '42.2', longitude: '-85.9', baseXp: 1000000 }, user: { id: 'owner-user' } } as any, res);
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.trailStop.create.mock.calls[0][0].data.baseXp).toBe(3);
  });

  it('a legacy stop row holding a huge baseXp still pays 3', async () => {
    const res = await checkIn('shopper', 't1', 's3');
    expect(res.body.xpAwarded).toBe(3);
    expect(db.checkIns[0].baseXpAwarded).toBe(3);
  });
});

describe('rule 2: stop counts clamped to 3..7', () => {
  const create = async (body: Record<string, unknown>) => {
    const res = makeRes();
    await createTrail({ body: { saleId: 'sale1', name: 'Trail', ...body }, user: { id: 'owner-user' } } as any, res);
    return mockPrisma.treasureTrail.create.mock.calls.at(-1)[0].data;
  };
  it('clamps out-of-range values and keeps maxStops >= minStopsRequired', async () => {
    expect(await create({ minStopsRequired: 1, maxStops: 50 })).toEqual(expect.objectContaining({ minStopsRequired: 3, maxStops: 7 }));
    expect(await create({ minStopsRequired: 6, maxStops: 4 })).toEqual(expect.objectContaining({ minStopsRequired: 6, maxStops: 6 }));
    expect(await create({})).toEqual(expect.objectContaining({ minStopsRequired: 3, maxStops: 7 }));
  });
});

describe("rule 3: the trail's organizer and team earn nothing", () => {
  it('the owner can check in and complete but earns 0 XP and no bonus, and no organizer reward fires', async () => {
    for (const s of ['s1', 's2', 's3']) {
      const res = await checkIn('owner-user', 't1', s);
      expect(res.statusCode).toBe(200);
      expect(res.body.xpAwarded).toBe(0);
    }
    expect(db.checkIns.map((c) => c.baseXpAwarded)).toEqual([0, 0, 0]);
    expect(db.completions[0]).toEqual(expect.objectContaining({ completionBonusXp: 0, totalXpEarned: 0 }));
    expect(mockAwardXp).not.toHaveBeenCalled();
  });

  it("a member of the organizer's workspace team earns 0 XP", async () => {
    const res = await checkIn('staff-user', 't1', 's1');
    expect(res.statusCode).toBe(200);
    expect(res.body.xpAwarded).toBe(0);
    expect(mockAwardXp).not.toHaveBeenCalled();
  });
});

describe('rule 4: check-in guards', () => {
  it('refuses a stop that belongs to another trail (404, nothing recorded)', async () => {
    const res = await checkIn('shopper', 't1', 'other-stop');
    expect(res.statusCode).toBe(404);
    expect(db.checkIns).toHaveLength(0);
    expect(mockAwardXp).not.toHaveBeenCalled();
  });

  it('refuses an inactive trail', async () => {
    const res = await checkIn('shopper', 't-off', 'off-stop');
    expect(res.statusCode).toBe(400);
    expect(db.checkIns).toHaveLength(0);
  });

  it('refuses a private trail for a shopper but lets the owner walk it', async () => {
    expect((await checkIn('shopper', 't-private', 'priv-stop')).statusCode).toBe(404);
    const owner = await checkIn('owner-user', 't-private', 'priv-stop');
    expect(owner.statusCode).toBe(200);
    expect(owner.body.xpAwarded).toBe(0);
  });

  it('refuses an impossible jump since the previous trail check-in', async () => {
    db.stops.push({ id: 'far-stop', trailId: 't2', ...FAR, baseXp: 3 });
    expect((await checkIn('shopper', 't1', 's1')).statusCode).toBe(200);
    const res = await checkIn('shopper', 't2', 'far-stop', FAR); // ~170 km a moment later
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('IMPLAUSIBLE_MOVEMENT');
    expect(db.checkIns).toHaveLength(1);
  });
});

describe('rule 5: 150 trail XP per UTC day', () => {
  it('awards only what is left of the cap, then 0, while check-ins still count toward completion', async () => {
    db.points.push({ userId: 'shopper', type: 'TRAIL_COMPLETION', points: 146, createdAt: new Date() });
    const r1 = await checkIn('shopper', 't1', 's1');
    const r2 = await checkIn('shopper', 't1', 's2');
    const r3 = await checkIn('shopper', 't1', 's3');
    expect([r1.body.xpAwarded, r2.body.xpAwarded, r3.body.xpAwarded]).toEqual([3, 1, 0]);
    expect(r3.body.completionTriggered).toBe(true);
    expect(r3.body.completionBonusXp).toBe(0);
    expect(db.completions).toHaveLength(1);
    const today = db.points.filter((p) => p.userId === 'shopper').reduce((s, p) => s + p.points, 0);
    expect(today).toBe(150);
  });

  it('XP earned before today does not count against the cap', async () => {
    db.points.push({ userId: 'shopper', type: 'TRAIL_COMPLETION', points: 500, createdAt: new Date(Date.now() - 2 * 86400000) });
    const res = await checkIn('shopper', 't1', 's1');
    expect(res.body.xpAwarded).toBe(3);
  });
});
