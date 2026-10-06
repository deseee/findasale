/**
 * bulkLotHoldStaffAccess (ADR-136 Addendum D, roadmap #659): team members at the register can place, convert and release holds
 * for the organizer they work for, and for nobody else.
 *
 * WHAT THIS PROVES (the REAL resolver utils/posAuth.resolveOrganizerOrTeamMember runs; only the Prisma client behind it is a fake):
 *   - the organizer works exactly as before (place, list, convert, release; createdByUserId is the organizer's user)
 *   - a team member of organizer A places, converts and releases holds on A's lots; the hold records the TEAM MEMBER as createdByUserId
 *     and the invoice belongs to A's owner (HoldInvoice.organizerUserId is the owner's user id, not the staff user)
 *   - a team member of organizer B gets the same 404 as a missing lot or hold on every hold handler (place, list, release, convert),
 *     and nothing is taken or changed
 *   - a signed-in user with no register access (no TeamMember row, even with a pending workspace invite) is refused with 403 FORBIDDEN
 *     in the bulk lot envelope on every hold handler, and nothing is written
 *   - adjust (recount) is still organizer only: a team member is refused
 *   - with the flag off every hold route answers 404 BULK_DISABLED before the resolver runs, for staff too
 *   - the router lets the three hold routes through to the handler (authenticate only) and keeps adjust, lot edit and bundle routes organizer only
 */
import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('../lib/prisma', () => ({
  prisma: {
    organizer: { findUnique: jest.fn() },
    workspaceMember: { findFirst: jest.fn() },
  },
}));

import { prisma } from '../lib/prisma';
import { resolveOrganizerOrTeamMember } from '../utils/posAuth';
import { createBulkLotFollowupHandlers } from '../controllers/bulkLotFollowupHandlers';
import { FakeDb, fakeSell } from './__fixtures__/bulkLotFollowupFakes';

const p: any = prisma;

// Organizers in the fake directory. ownerUserId is the User that owns the Organizer row.
const ORGANIZERS: Record<string, any> = {
  org1: { id: 'org1', userId: 'u_org', stripeConnectId: null, referralDiscountExpiry: null, subscriptionTier: 'PRO', squareOnboarded: false, squareMerchantId: null, squareLocationId: null },
  org2: { id: 'org2', userId: 'u_org2', stripeConnectId: null, referralDiscountExpiry: null, subscriptionTier: 'PRO', squareOnboarded: false, squareMerchantId: null, squareLocationId: null },
};

// Workspace members. teamMember null is a pending or view-only person: no register access.
const MEMBERS: Record<string, any> = {
  u_staff1: { userId: 'u_staff1', acceptedAt: new Date(), teamMember: { id: 'tm1' }, workspaceId: 'w1', role: 'MEMBER', workspace: { owner: ORGANIZERS.org1 } },
  u_staff2: { userId: 'u_staff2', acceptedAt: new Date(), teamMember: { id: 'tm2' }, workspaceId: 'w2', role: 'MANAGER', workspace: { owner: ORGANIZERS.org2 } },
  u_viewer: { userId: 'u_viewer', acceptedAt: new Date(), teamMember: null, workspaceId: 'w1', role: 'VIEWER', workspace: { owner: ORGANIZERS.org1 } },
  u_pending: { userId: 'u_pending', acceptedAt: null, teamMember: { id: 'tmX' }, workspaceId: 'w1', role: 'MEMBER', workspace: { owner: ORGANIZERS.org1 } },
};

const ORG = { id: 'u_org', roles: ['ORGANIZER'], role: 'ORGANIZER' };
const ORG2 = { id: 'u_org2', roles: ['ORGANIZER'], role: 'ORGANIZER' };
const STAFF1 = { id: 'u_staff1', roles: ['SHOPPER'], role: 'SHOPPER' };
const STAFF2 = { id: 'u_staff2', roles: ['SHOPPER'], role: 'SHOPPER' };
const VIEWER = { id: 'u_viewer', roles: ['SHOPPER'], role: 'SHOPPER' };
const PENDING = { id: 'u_pending', roles: ['SHOPPER'], role: 'SHOPPER' };
const SHOPPER = { id: 'u_shopper', roles: ['SHOPPER'], role: 'SHOPPER' };

let db: any;
let lotA: string;
let lotB: string;
let paid: string[];

function build(env: Record<string, string> = { CARD_BULK_LOTS_ENABLED: 'true' }) {
  const fake = new FakeDb();
  db = fake;
  db.organizer = { findUnique: async ({ where }: any) => Object.values(ORGANIZERS).find((o: any) => o.userId === where.userId) ?? null };
  db.sale = { findUnique: async ({ where }: any) => ({ id: where.id, status: 'PUBLISHED' }) };
  lotA = fake.addLot({ organizerId: 'org1', stockTotal: 10000 }).id;
  lotB = fake.addLot({ organizerId: 'org2', saleId: 'sale2', stockTotal: 10000 }).id;
  paid = [];
  p.organizer.findUnique.mockClear();
  p.workspaceMember.findFirst.mockClear();

  // The Prisma calls utils/posAuth makes, answered from the directory above (the same filters the real query uses).
  p.organizer.findUnique.mockImplementation(async ({ where }: any) => Object.values(ORGANIZERS).find((o: any) => o.userId === where.userId) ?? null);
  p.workspaceMember.findFirst.mockImplementation(async ({ where }: any) => {
    const m = MEMBERS[where.userId];
    if (!m) return null;
    if (where.acceptedAt && where.acceptedAt.not === null && !m.acceptedAt) return null;
    if (where.teamMember && where.teamMember.isNot === null && !m.teamMember) return null;
    return m;
  });

  return createBulkLotFollowupHandlers({
    db,
    env,
    publicFilter: {},
    // The same call the controller wires.
    resolveActor: (req: any, res: any) => resolveOrganizerOrTeamMember(req, res, { requireStripe: false }),
    sell: fakeSell(fake) as any,
    markPaid: async (invoiceId: string) => {
      paid.push(invoiceId);
      return { recorded: true, alreadyPaid: false };
    },
    createSquareLink: async () => ({ ok: false, message: 'no square' }) as any,
    deleteSquareLink: async () => ({ ok: true }),
    feeFor: () => 0,
    now: () => new Date(Date.UTC(2026, 9, 6, 12, 0, 0)),
  } as any);
}

function call(handler: (req: any, res: any) => Promise<unknown>, reqInit: { user?: any; params?: any; body?: any; query?: any }) {
  let status = 200;
  let body: any;
  const res: any = { status: (s: number) => ((status = s), res), json: (b: any) => ((body = b), res) };
  return handler({ user: undefined, params: {}, body: {}, query: {}, ...reqInit }, res).then(() => ({ status, body }));
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('the organizer, unchanged', () => {
  it('places, lists, converts and releases holds on their own lots', async () => {
    const h = build();
    const placed = await call(h.placeOrganizerHold as any, { user: ORG, params: { itemId: lotA }, body: { quantity: 1500, customerName: 'Sam' } });
    expect(placed.status).toBe(201);
    expect(placed.body.data).toMatchObject({ quantity: 1500, lineCents: 1200, status: 'ACTIVE', mine: true });
    expect(db.bulkLotHold.rows[0]).toMatchObject({ organizerId: 'org1', createdByUserId: 'u_org' });
    expect((await call(h.listHolds as any, { user: ORG, params: { itemId: lotA } })).body.data.holds).toHaveLength(1);

    const conv = await call(h.convertHold as any, { user: ORG, params: { holdId: placed.body.data.id }, body: { method: 'CASH' } });
    expect(conv.status).toBe(200);
    expect(conv.body.data.status).toBe('PAID');
    expect(db.holdInvoice.rows[0]).toMatchObject({ organizerUserId: 'u_org', totalAmount: 1200 });

    const second = await call(h.placeOrganizerHold as any, { user: ORG, params: { itemId: lotA }, body: { quantity: 100 } });
    const rel = await call(h.releaseOrganizerHold as any, { user: ORG, params: { holdId: second.body.data.id } });
    expect(rel.body.data.released).toBe(true);
  });
});

describe('a team member of the same organizer', () => {
  it('places a hold on the organizer lot and the history shows the team member', async () => {
    const h = build();
    const placed = await call(h.placeOrganizerHold as any, { user: STAFF1, params: { itemId: lotA }, body: { quantity: 1500, customerName: 'Sam' } });
    expect(placed.status).toBe(201);
    expect(placed.body.data).toMatchObject({ quantity: 1500, status: 'ACTIVE' });
    expect(db.bulkLotHold.rows[0]).toMatchObject({ organizerId: 'org1', createdByUserId: 'u_staff1' });
    expect(db.stock(lotA).left).toBe(8500);
    const listed = await call(h.listHolds as any, { user: STAFF1, params: { itemId: lotA } });
    expect(listed.body.data.holds).toHaveLength(1);
  });

  it('converts a hold to a cash sale: the invoice belongs to the owner and the staff user is not written as the organizer', async () => {
    const h = build();
    const placed = await call(h.placeOrganizerHold as any, { user: STAFF1, params: { itemId: lotA }, body: { quantity: 1500 } });
    const conv = await call(h.convertHold as any, { user: STAFF1, params: { holdId: placed.body.data.id }, body: { method: 'CASH' } });
    expect(conv.status).toBe(200);
    expect(conv.body.data).toMatchObject({ status: 'PAID' });
    expect(db.holdInvoice.rows).toHaveLength(1);
    expect(db.holdInvoice.rows[0].organizerUserId).toBe('u_org');
    expect(db.holdInvoice.rows[0].organizerUserId).not.toBe('u_staff1');
    expect(paid).toEqual([db.holdInvoice.rows[0].id]);
  });

  it('releases a hold and the cards go back to the lot', async () => {
    const h = build();
    const placed = await call(h.placeOrganizerHold as any, { user: STAFF1, params: { itemId: lotA }, body: { quantity: 400 } });
    expect(db.stock(lotA).left).toBe(9600);
    const rel = await call(h.releaseOrganizerHold as any, { user: STAFF1, params: { holdId: placed.body.data.id } });
    expect(rel.status).toBe(200);
    expect(rel.body.data.released).toBe(true);
    expect(db.stock(lotA).left).toBe(10000);
  });

  it('can release a hold the organizer placed, and the organizer can release one the team member placed', async () => {
    const h = build();
    const byOrg = await call(h.placeOrganizerHold as any, { user: ORG, params: { itemId: lotA }, body: { quantity: 100 } });
    const byStaff = await call(h.placeOrganizerHold as any, { user: STAFF1, params: { itemId: lotA }, body: { quantity: 100 } });
    expect((await call(h.releaseOrganizerHold as any, { user: STAFF1, params: { holdId: byOrg.body.data.id } })).body.data.released).toBe(true);
    expect((await call(h.releaseOrganizerHold as any, { user: ORG, params: { holdId: byStaff.body.data.id } })).body.data.released).toBe(true);
  });
});

describe('a team member of another organizer', () => {
  it('gets the same 404 as a missing lot when placing or listing, and nothing is taken', async () => {
    const h = build();
    const other = await call(h.placeOrganizerHold as any, { user: STAFF2, params: { itemId: lotA }, body: { quantity: 100 } });
    const missing = await call(h.placeOrganizerHold as any, { user: STAFF2, params: { itemId: 'nope' }, body: { quantity: 100 } });
    expect(other.status).toBe(404);
    expect(other.body).toEqual(missing.body);
    expect(db.stock(lotA).sold).toBe(0);
    expect(db.bulkLotHold.rows).toHaveLength(0);
    const listed = await call(h.listHolds as any, { user: STAFF2, params: { itemId: lotA } });
    expect(listed.status).toBe(404);
  });

  it('cannot release or convert a hold that belongs to another organizer, and the hold stays active', async () => {
    const h = build();
    const placed = await call(h.placeOrganizerHold as any, { user: ORG, params: { itemId: lotA }, body: { quantity: 100 } });
    const id = placed.body.data.id;
    const rel = await call(h.releaseOrganizerHold as any, { user: STAFF2, params: { holdId: id } });
    const conv = await call(h.convertHold as any, { user: STAFF2, params: { holdId: id }, body: { method: 'CASH' } });
    const gone = await call(h.releaseOrganizerHold as any, { user: STAFF2, params: { holdId: 'nope' } });
    expect(rel.status).toBe(404);
    expect(conv.status).toBe(404);
    expect(rel.body).toEqual(gone.body);
    expect(db.bulkLotHold.rows[0].status).toBe('ACTIVE');
    expect(db.holdInvoice.rows).toHaveLength(0);
    expect(paid).toEqual([]);
    expect(db.stock(lotA).left).toBe(9900);
  });

  it('can still work with its own organizer lots at the same time', async () => {
    const h = build();
    const placed = await call(h.placeOrganizerHold as any, { user: STAFF2, params: { itemId: lotB }, body: { quantity: 100 } });
    expect(placed.status).toBe(201);
    expect(db.bulkLotHold.rows[0]).toMatchObject({ organizerId: 'org2', createdByUserId: 'u_staff2' });
  });

  it('another organizer is refused the same way (an organizer is not staff of every shop)', async () => {
    const h = build();
    const placed = await call(h.placeOrganizerHold as any, { user: ORG, params: { itemId: lotA }, body: { quantity: 100 } });
    expect((await call(h.placeOrganizerHold as any, { user: ORG2, params: { itemId: lotA }, body: { quantity: 100 } })).status).toBe(404);
    expect((await call(h.releaseOrganizerHold as any, { user: ORG2, params: { holdId: placed.body.data.id } })).status).toBe(404);
    expect((await call(h.convertHold as any, { user: ORG2, params: { holdId: placed.body.data.id }, body: { method: 'CASH' } })).status).toBe(404);
    expect(db.bulkLotHold.rows[0].status).toBe('ACTIVE');
  });
});

describe('a signed-in user without register access', () => {
  const NO_ACCESS = [
    ['a workspace member with no register access (no TeamMember row)', VIEWER],
    ['a person whose workspace invite is still pending', PENDING],
    ['a plain shopper account', SHOPPER],
  ] as const;

  for (const [label, user] of NO_ACCESS) {
    it(`is refused with 403 FORBIDDEN on place, release and convert: ${label}`, async () => {
      const h = build();
      const seed = await call(h.placeOrganizerHold as any, { user: ORG, params: { itemId: lotA }, body: { quantity: 100 } });
      const id = seed.body.data.id;
      const results = [
        await call(h.placeOrganizerHold as any, { user, params: { itemId: lotA }, body: { quantity: 100 } }),
        await call(h.releaseOrganizerHold as any, { user, params: { holdId: id } }),
        await call(h.convertHold as any, { user, params: { holdId: id }, body: { method: 'CASH' } }),
      ];
      for (const r of results) expect(r).toMatchObject({ status: 403, body: { success: false, code: 'FORBIDDEN' } });
      expect(typeof results[0].body.error).toBe('string');
      expect(db.bulkLotHold.rows).toHaveLength(1);
      expect(db.bulkLotHold.rows[0].status).toBe('ACTIVE');
      expect(db.stock(lotA).left).toBe(9900);
      expect(db.holdInvoice.rows).toHaveLength(0);
    });
  }

  it('a signed-out request is refused with 403 in the same envelope', async () => {
    const h = build();
    const r = await call(h.placeOrganizerHold as any, { user: undefined, params: { itemId: lotA }, body: { quantity: 100 } });
    expect(r).toMatchObject({ status: 403, body: { success: false, code: 'FORBIDDEN' } });
  });
});

describe('what stays organizer only', () => {
  it('a team member cannot recount or adjust a lot', async () => {
    const h = build();
    const r = await call(h.adjust as any, { user: STAFF1, params: { itemId: lotA }, body: { reason: 'DAMAGE', cards: 10 } });
    expect(r).toMatchObject({ status: 403, body: { success: false, code: 'FORBIDDEN' } });
    expect(db.stock(lotA).total).toBe(10000);
    expect(db.bulkLotAdjustment.rows).toHaveLength(0);
  });

  it('the router keeps adjust, lot create, enable and edit behind requireOrganizer and opens only the three hold routes', () => {
    const src = readFileSync(join(__dirname, '..', 'routes', 'bulkLots.ts'), 'utf8');
    const routeLines = src.split('\n').filter((l) => /^router\.(get|post|patch|put|delete)\(/.test(l));
    const line = (frag: string) => routeLines.find((l) => l.includes(frag)) ?? '';
    for (const frag of ["'/item/:itemId/adjust'", "'/sale/:saleId/items'", "'/item/:itemId/enable'", "router.patch('/item/:itemId'"]) {
      expect([frag, line(frag).includes('requireOrganizer')]).toEqual([frag, true]);
    }
    for (const frag of ["'/item/:itemId/holds'", "'/holds/:holdId/release'", "'/holds/:holdId/convert'"]) {
      const l = routeLines.find((x) => x.startsWith('router.post(') && x.includes(frag)) ?? '';
      expect([frag, l.includes('authenticate'), l.includes('requireOrganizer')]).toEqual([frag, true, false]);
    }
  });
});

describe('the flag', () => {
  it('answers 404 BULK_DISABLED for staff on every hold route and never reaches the resolver', async () => {
    const h = build({});
    for (const [name, init] of [
      ['placeOrganizerHold', { user: STAFF1, params: { itemId: lotA }, body: { quantity: 100 } }],
      ['releaseOrganizerHold', { user: STAFF1, params: { holdId: 'h' } }],
      ['convertHold', { user: STAFF1, params: { holdId: 'h' }, body: { method: 'CASH' } }],
    ] as const) {
      const r = await call((h as any)[name], init);
      expect([name, r.status, r.body.code]).toEqual([name, 404, 'BULK_DISABLED']);
    }
    expect(p.workspaceMember.findFirst).not.toHaveBeenCalled();
    expect(db.bulkLotHold.rows).toHaveLength(0);
    expect(db.stock(lotA).sold).toBe(0);
  });
});
