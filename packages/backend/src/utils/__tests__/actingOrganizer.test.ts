/**
 * resolveActingOrganizer + requireRetagAccess (2026-09-29, Patrick D3/D6). NOT EXECUTED when
 * written (jest cannot run on the authoring device); CI is the first real run.
 */
const mockFindManyMembers = jest.fn();
const mockCheckPermission = jest.fn();

jest.mock('../../lib/prisma', () => ({
  prisma: { workspaceMember: { findMany: (...a: any[]) => mockFindManyMembers(...a) } },
}));
jest.mock('../../services/workspacePermissionService', () => ({
  checkPermission: (...a: any[]) => mockCheckPermission(...a),
}));

import { resolveActingOrganizer, requireRetagAccess } from '../actingOrganizer';

const ownerReq = (tier: string | null) => ({
  user: { id: 'u_owner', organizerProfile: { id: 'org_1', userId: 'u_owner', subscriptionTier: tier } },
}) as any;

const staffReq = () => ({ user: { id: 'u_staff' } }) as any;

const membership = (over: any = {}) => ({
  workspaceId: 'ws_1',
  role: 'MEMBER',
  graceRemovedAt: null,
  workspace: { owner: { id: 'org_owner', userId: 'u_owner_of_ws', subscriptionTier: 'TEAMS' } },
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('resolveActingOrganizer', () => {
  it('owner on SIMPLE is resolved without touching the membership table', async () => {
    const r = await resolveActingOrganizer(ownerReq('SIMPLE'));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.actor).toMatchObject({
        organizerId: 'org_1',
        ownerUserId: 'u_owner',
        subscriptionTier: 'SIMPLE',
        actorKind: 'OWNER',
        workspaceId: null,
        role: null,
      });
    }
    expect(mockFindManyMembers).not.toHaveBeenCalled();
  });

  it('owner with a null tier is treated as SIMPLE', async () => {
    const r = await resolveActingOrganizer(ownerReq(null));
    expect(r.ok && r.actor.subscriptionTier).toBe('SIMPLE');
  });

  it('no logged-in user -> NOT_AUTHENTICATED', async () => {
    const r = await resolveActingOrganizer({} as any);
    expect(r).toMatchObject({ ok: false, code: 'NOT_AUTHENTICATED' });
  });

  it('accepted staff of a TEAMS owner resolves to the OWNER organizer', async () => {
    mockFindManyMembers.mockResolvedValue([membership()]);
    const r = await resolveActingOrganizer(staffReq());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.actor).toMatchObject({
        organizerId: 'org_owner',
        ownerUserId: 'u_owner_of_ws',
        subscriptionTier: 'TEAMS',
        actorKind: 'TEAM_MEMBER',
        actingUserId: 'u_staff',
        workspaceId: 'ws_1',
        role: 'MEMBER',
      });
    }
    // Same query shape as posAuth: accepted + linked TeamMember, keyed by userId only.
    const args = mockFindManyMembers.mock.calls[0][0];
    expect(args.where).toEqual({ userId: 'u_staff', acceptedAt: { not: null }, teamMember: { isNot: null } });
  });

  it.each(['SIMPLE', 'PRO'])('staff of a %s owner -> OWNER_NOT_TEAMS', async (tier) => {
    mockFindManyMembers.mockResolvedValue([
      membership({ workspace: { owner: { id: 'org_owner', userId: 'u_o', subscriptionTier: tier } } }),
    ]);
    const r = await resolveActingOrganizer(staffReq());
    expect(r).toMatchObject({ ok: false, code: 'OWNER_NOT_TEAMS' });
  });

  it('staff whose membership has graceRemovedAt set -> STAFF_ACCESS_REVOKED', async () => {
    mockFindManyMembers.mockResolvedValue([membership({ graceRemovedAt: new Date() })]);
    const r = await resolveActingOrganizer(staffReq());
    expect(r).toMatchObject({ ok: false, code: 'STAFF_ACCESS_REVOKED' });
  });

  it('a non-member (no organizer profile, no membership) -> NOT_ORGANIZER', async () => {
    mockFindManyMembers.mockResolvedValue([]);
    const r = await resolveActingOrganizer(staffReq());
    expect(r).toMatchObject({ ok: false, code: 'NOT_ORGANIZER' });
  });

  it('with several memberships, picks the newest one whose owner is on TEAMS and is not revoked', async () => {
    mockFindManyMembers.mockResolvedValue([
      membership({ workspaceId: 'ws_new', workspace: { owner: { id: 'org_simple', userId: 'u_s', subscriptionTier: 'SIMPLE' } } }),
      membership({ workspaceId: 'ws_revoked', graceRemovedAt: new Date() }),
      membership({ workspaceId: 'ws_teams', workspace: { owner: { id: 'org_teams', userId: 'u_t', subscriptionTier: 'TEAMS' } } }),
    ]);
    const r = await resolveActingOrganizer(staffReq());
    expect(r.ok && r.actor.organizerId).toBe('org_teams');
    expect(r.ok && r.actor.workspaceId).toBe('ws_teams');
  });
});

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as any,
    status(c: number) { this.statusCode = c; return this; },
    json(b: any) { this.body = b; return this; },
  };
  return res;
}

describe('requireRetagAccess', () => {
  it('owner (any tier) passes both modes without a permission lookup and gets req.actingOrganizer', async () => {
    for (const mode of ['view', 'mark'] as const) {
      const req = ownerReq('SIMPLE');
      const res = makeRes();
      const next = jest.fn();
      await requireRetagAccess(mode)(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(req.actingOrganizer.organizerId).toBe('org_1');
      expect(req.actingOrganizer.actorKind).toBe('OWNER');
    }
    expect(mockCheckPermission).not.toHaveBeenCalled();
  });

  it('staff with mark_retagged passes mark mode', async () => {
    mockFindManyMembers.mockResolvedValue([membership()]);
    mockCheckPermission.mockResolvedValue(true);
    const req = staffReq();
    const res = makeRes();
    const next = jest.fn();
    await requireRetagAccess('mark')(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(mockCheckPermission).toHaveBeenCalledWith('ws_1', 'MEMBER', 'mark_retagged');
    expect(req.actingOrganizer.organizerId).toBe('org_owner');
  });

  it('staff without mark_retagged gets 403 PERMISSION_DENIED in mark mode', async () => {
    mockFindManyMembers.mockResolvedValue([membership({ role: 'VIEWER' })]);
    mockCheckPermission.mockResolvedValue(false);
    const req = staffReq();
    const res = makeRes();
    const next = jest.fn();
    await requireRetagAccess('mark')(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
    expect(req.actingOrganizer).toBeUndefined();
  });

  it('view mode accepts view_inventory when mark_retagged is missing', async () => {
    mockFindManyMembers.mockResolvedValue([membership({ role: 'VIEWER' })]);
    mockCheckPermission.mockImplementation(async (_w: string, _r: string, perm: string) => perm === 'view_inventory');
    const res = makeRes();
    const next = jest.fn();
    await requireRetagAccess('view')(staffReq(), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(mockCheckPermission).toHaveBeenCalledWith('ws_1', 'VIEWER', 'view_inventory');
  });

  it('maps resolver failures to 403 with codes', async () => {
    const cases: Array<[any[], string]> = [
      [[], 'NOT_ORGANIZER'],
      [[membership({ graceRemovedAt: new Date() })], 'STAFF_ACCESS_REVOKED'],
      [[membership({ workspace: { owner: { id: 'o', userId: 'u', subscriptionTier: 'PRO' } } })], 'OWNER_NOT_TEAMS'],
    ];
    for (const [rows, code] of cases) {
      mockFindManyMembers.mockResolvedValue(rows);
      const res = makeRes();
      const next = jest.fn();
      await requireRetagAccess('mark')(staffReq(), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe(code);
    }
  });

  it('a missing login is 401', async () => {
    const res = makeRes();
    const next = jest.fn();
    await requireRetagAccess('view')({} as any, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('retag handlers and routes stay owner-scoped (source-level checks)', () => {
  // These read the source instead of importing itemController / routes/items (huge import graphs).
  const fs = require('fs');
  const path = require('path');
  const controllerSrc: string = fs.readFileSync(path.join(__dirname, '../../controllers/itemController.ts'), 'utf8');
  const routesSrc: string = fs.readFileSync(path.join(__dirname, '../../routes/items.ts'), 'utf8');

  it('mark-retagged handlers scope every write by the acting organizer id', () => {
    expect(controllerSrc).toMatch(/item\.organizerId !== organizer\.id/);
    expect(controllerSrc).toMatch(/where: \{ id: \{ in: idsToUse \}, organizerId: organizer\.id \}/);
    expect(controllerSrc).toMatch(/const organizer = \{ id: acting\.organizerId \}/);
    const retagRegion = controllerSrc.slice(controllerSrc.indexOf('// Physical Markdown Alert List (2026-09-25, Patrick)'));
    expect(retagRegion.length).toBeGreaterThan(1000);
    expect(retagRegion).not.toMatch(/prisma\.organizer\.findUnique/);
  });

  it('the four retag routes use requireRetagAccess and no requireTier', () => {
    const lines = routesSrc.split('\n').filter((l) => /markdown-retag-queue'|markdown-active'|mark-retagged/.test(l) && /^router\./.test(l));
    expect(lines).toHaveLength(4);
    for (const l of lines) {
      expect(l).toMatch(/requireRetagAccess\('(view|mark)'\)/);
      expect(l).not.toMatch(/requireTier/);
    }
    expect(lines.filter((l) => l.includes("requireRetagAccess('mark')"))).toHaveLength(2);
  });

  it('markdown-config has no route-level tier gate', () => {
    const salesSrc: string = fs.readFileSync(path.join(__dirname, '../../routes/sales.ts'), 'utf8');
    const line = salesSrc.split('\n').find((l) => /^router\.put\('\/:id\/markdown-config'/.test(l)) as string;
    expect(line).toBeDefined();
    expect(line).not.toMatch(/requireTier/);
  });
});
