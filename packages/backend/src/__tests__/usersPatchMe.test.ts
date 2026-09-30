/**
 * PATCH /users/me (2026-09-29): slug + XP in ONE transaction, reserved slugs, teamsOnboardingComplete
 * requires TEAMS and creates the owner WorkspaceMember, boolean validation, merged notificationPrefs cap.
 * The Router is replaced by a capture stub so the real handler can be called directly.
 */
const mockRoutes: any[] = [];
jest.mock('express', () => ({
  Router: () => {
    const r: any = {};
    ['get', 'post', 'put', 'patch', 'delete', 'use'].forEach((m) => {
      r[m] = (p: any, ...h: any[]) => {
        mockRoutes.push({ method: m, path: p, handlers: h });
        return r;
      };
    });
    return r;
  },
}));
jest.mock('../controllers/userController', () => ({
  getPurchases: jest.fn(), getFavorites: jest.fn(), getUserProfile: jest.fn(), getLeaderboard: jest.fn(),
  getPublicShopperProfile: jest.fn(), getBadges: jest.fn(), activateHuntPassTrial: jest.fn(), getUserQRData: jest.fn(),
  deleteAccount: jest.fn(), exportMyData: jest.fn(),
}));
jest.mock('../controllers/brandFollowController', () => ({ getBrandFollows: jest.fn(), addBrandFollow: jest.fn(), removeBrandFollow: jest.fn() }));
jest.mock('../controllers/addressController', () => ({
  listMyAddresses: jest.fn(), createMyAddress: jest.fn(), updateMyAddress: jest.fn(), deleteMyAddress: jest.fn(), getCheckoutAddressDefaults: jest.fn(),
}));
jest.mock('../middleware/auth', () => ({ authenticate: jest.fn() }));
jest.mock('../utils/rankUtils', () => ({ getRankProgressInfo: jest.fn(), getRankBenefits: jest.fn(), RANK_NAMES: {} }));

const mockSpendXp = jest.fn();
const mockGetSpendableXp = jest.fn();
jest.mock('../services/xpService', () => ({
  spendXp: (...a: any[]) => mockSpendXp(...a),
  getSpendableXp: (...a: any[]) => mockGetSpendableXp(...a),
}));

const mockTx: any = {
  user: { findUnique: jest.fn(), update: jest.fn() },
  organizerWorkspace: { create: jest.fn() },
  workspaceMember: { create: jest.fn() },
};
const mockPrisma: any = {
  user: { findUnique: jest.fn(), update: jest.fn() },
  organizer: { findUnique: jest.fn() },
  organizerWorkspace: { findUnique: jest.fn() },
  workspaceMember: { findFirst: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

import { RESERVED_PROFILE_SLUGS } from '../routes/users';
import { MAX_NOTIFICATION_PREFS_BYTES } from '../utils/notificationPrefsMerge';

const patchMe = (): ((req: any, res: any) => Promise<void>) => {
  const r = mockRoutes.find((x) => x.method === 'patch' && x.path === '/me');
  return r.handlers[r.handlers.length - 1];
};

function makeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}
const call = async (body: any, user: any = { id: 'u1' }) => {
  const res = makeRes();
  await patchMe()({ user, body }, res);
  return res;
};

function reset(o: any) {
  Object.values(o).forEach((v: any) => (typeof v === 'function' ? v.mockReset() : reset(v)));
}
beforeEach(() => {
  reset(mockPrisma);
  reset(mockTx);
  mockSpendXp.mockReset();
  mockGetSpendableXp.mockReset();
  mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockTx));
  mockPrisma.user.update.mockResolvedValue({ id: 'u1' });
  mockTx.user.update.mockResolvedValue({ id: 'u1', profileSlug: 'cool-slug' });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('profileSlug', () => {
  it('rejects reserved slugs case-insensitively, before any XP is touched', async () => {
    for (const slug of ['admin', 'Admin', 'API', 'login', 'organizer', 'shopper', 'settings', 'register']) {
      const res = await call({ profileSlug: slug });
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(mockSpendXp).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(RESERVED_PROFILE_SLUGS.has('admin')).toBe(true);
  });

  it('rejects a non-string or over-long slug', async () => {
    expect((await call({ profileSlug: 12345 })).status).toHaveBeenCalledWith(400);
    expect((await call({ profileSlug: 'a'.repeat(51) })).status).toHaveBeenCalledWith(400);
  });

  it('first-time slug: the XP spend and the slug write happen inside ONE transaction (spend gets the tx client)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ profileSlug: null, guildXp: 5000 });
    mockGetSpendableXp.mockResolvedValue(5000);
    mockTx.user.findUnique.mockResolvedValue({ profileSlug: null });
    mockSpendXp.mockResolvedValue(true);
    const res = await call({ profileSlug: 'cool-slug' });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockSpendXp).toHaveBeenCalledTimes(1);
    expect(mockSpendXp.mock.calls[0][0]).toBe('u1');
    expect(mockSpendXp.mock.calls[0][1]).toBe(1500);
    expect(mockSpendXp.mock.calls[0][2]).toBe('PROFILE_SLUG_UNLOCK');
    expect(mockSpendXp.mock.calls[0][4]).toBe(mockTx); // 5th arg is the transaction client
    expect(mockTx.user.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.user.update).not.toHaveBeenCalled(); // no separate, non-transactional write
    expect(res.json).toHaveBeenCalledWith({ id: 'u1', profileSlug: 'cool-slug' });
  });

  it('a taken slug (P2002 inside the transaction) is a 409 and the spend only ever ran on the tx client, so it rolls back', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ profileSlug: null, guildXp: 5000 });
    mockGetSpendableXp.mockResolvedValue(5000);
    mockTx.user.findUnique.mockResolvedValue({ profileSlug: null });
    mockSpendXp.mockResolvedValue(true);
    mockTx.user.update.mockRejectedValue({ code: 'P2002', meta: { target: ['profileSlug'] } });
    const res = await call({ profileSlug: 'taken' });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockSpendXp.mock.calls[0][4]).toBe(mockTx);
  });

  it('a refused spend inside the transaction is a 400 and writes no slug', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ profileSlug: null, guildXp: 5000 });
    mockGetSpendableXp.mockResolvedValue(5000);
    mockTx.user.findUnique.mockResolvedValue({ profileSlug: null });
    mockSpendXp.mockResolvedValue(false);
    const res = await call({ profileSlug: 'cool-slug' });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockTx.user.update).not.toHaveBeenCalled();
  });

  it('not enough spendable XP: 400 before any transaction', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ profileSlug: null, guildXp: 100 });
    mockGetSpendableXp.mockResolvedValue(100);
    const res = await call({ profileSlug: 'cool-slug' });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockSpendXp).not.toHaveBeenCalled();
  });

  it('changing an EXISTING slug is free (no spend, no transaction)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ profileSlug: 'old', guildXp: 0 });
    await call({ profileSlug: 'new-slug' });
    expect(mockSpendXp).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
  });

  it('two racing first-time requests: the slug re-read inside the transaction prevents a second charge', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ profileSlug: null, guildXp: 5000 });
    mockGetSpendableXp.mockResolvedValue(5000);
    mockTx.user.findUnique.mockResolvedValue({ profileSlug: 'already-set-by-other-request' });
    await call({ profileSlug: 'cool-slug' });
    expect(mockSpendXp).not.toHaveBeenCalled();
  });
});

describe('boolean validation', () => {
  it('purchasesVisible must be a boolean', async () => {
    expect((await call({ purchasesVisible: 'false' })).status).toHaveBeenCalledWith(400);
    expect((await call({ purchasesVisible: 0 })).status).toHaveBeenCalledWith(400);
    const ok = await call({ purchasesVisible: false });
    expect(ok.status).not.toHaveBeenCalled();
    expect(mockPrisma.user.update.mock.calls[0][0].data.purchasesVisible).toBe(false);
  });

  it('teamsOnboardingComplete must be a boolean', async () => {
    expect((await call({ teamsOnboardingComplete: 'true' })).status).toHaveBeenCalledWith(400);
    expect((await call({ teamsOnboardingComplete: 1 })).status).toHaveBeenCalledWith(400);
  });
});

describe('teamsOnboardingComplete', () => {
  it('requires TEAMS: a SIMPLE or PRO organizer (or a non-organizer) gets 403 and nothing is written', async () => {
    for (const org of [{ id: 'o1', businessName: 'B', subscriptionTier: 'SIMPLE' }, { id: 'o1', businessName: 'B', subscriptionTier: 'PRO' }, null]) {
      mockPrisma.organizer.findUnique.mockResolvedValue(org);
      const res = await call({ teamsOnboardingComplete: true });
      expect(res.status).toHaveBeenCalledWith(403);
    }
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('TEAMS organizer with no workspace: creates the workspace AND the OWNER member row in one transaction', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org12345678', businessName: 'Oak Estate Co', subscriptionTier: 'TEAMS' });
    mockPrisma.organizerWorkspace.findUnique.mockResolvedValue(null);
    mockTx.organizerWorkspace.create.mockResolvedValue({ id: 'w1' });
    mockPrisma.workspaceMember.findFirst.mockResolvedValue({ id: 'exists-after-tx' });
    const res = await call({ teamsOnboardingComplete: true });
    expect(mockTx.organizerWorkspace.create).toHaveBeenCalledWith({
      data: { name: 'Oak Estate Co', slug: 'oak-estate-co', ownerId: 'org12345678' },
    });
    expect(mockTx.workspaceMember.create).toHaveBeenCalledWith({
      data: { workspaceId: 'w1', organizerId: 'org12345678', role: 'OWNER', acceptedAt: expect.any(Date) },
    });
    expect(mockPrisma.user.update.mock.calls[0][0].data.teamsOnboardingComplete).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('repairs an existing workspace that has no owner member row', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', businessName: 'B', subscriptionTier: 'TEAMS' });
    mockPrisma.organizerWorkspace.findUnique.mockResolvedValue({ id: 'w9' });
    mockPrisma.workspaceMember.findFirst.mockResolvedValue(null);
    mockPrisma.workspaceMember.create.mockResolvedValue({});
    await call({ teamsOnboardingComplete: true });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.workspaceMember.create).toHaveBeenCalledWith({
      data: { workspaceId: 'w9', organizerId: 'org1', role: 'OWNER', acceptedAt: expect.any(Date) },
    });
  });

  it('does not duplicate the owner row when it already exists', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', businessName: 'B', subscriptionTier: 'TEAMS' });
    mockPrisma.organizerWorkspace.findUnique.mockResolvedValue({ id: 'w9' });
    mockPrisma.workspaceMember.findFirst.mockResolvedValue({ id: 'm1' });
    await call({ teamsOnboardingComplete: true });
    expect(mockPrisma.workspaceMember.create).not.toHaveBeenCalled();
  });

  it('setting it to false needs no tier and does not touch workspaces', async () => {
    const res = await call({ teamsOnboardingComplete: false });
    expect(res.status).not.toHaveBeenCalled();
    expect(mockPrisma.organizer.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.user.update.mock.calls[0][0].data.teamsOnboardingComplete).toBe(false);
  });
});

describe('notificationPrefs merged size cap', () => {
  it('rejects a PATCH whose incoming part is small but whose MERGED result exceeds the cap', async () => {
    const big: Record<string, string> = {};
    // ~19 KB of existing keys
    for (let i = 0; i < 19; i++) big['k' + i] = 'x'.repeat(1000);
    mockPrisma.user.findUnique.mockResolvedValue({ notificationPrefs: big });
    const incoming: Record<string, string> = {};
    for (let i = 0; i < 3; i++) incoming['n' + i] = 'y'.repeat(1000);
    expect(JSON.stringify(incoming).length).toBeLessThan(MAX_NOTIFICATION_PREFS_BYTES);
    const res = await call({ notificationPrefs: incoming });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('accepts a normal merge', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ notificationPrefs: { a: true } });
    const res = await call({ notificationPrefs: { b: false } });
    expect(res.status).not.toHaveBeenCalled();
    expect(mockPrisma.user.update.mock.calls[0][0].data.notificationPrefs).toEqual({ a: true, b: false });
  });
});
