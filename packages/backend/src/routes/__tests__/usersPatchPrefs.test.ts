/**
 * PATCH /api/users/me notificationPrefs shallow merge (2026-09-29). Prisma and auth are mocks; the real
 * router runs behind a real express server. NOT EXECUTED when written (jest cannot run on the authoring
 * machine); CI is the first real run.
 */
import express from 'express';
import type { AddressInfo } from 'net';

const mockUserFindUnique = jest.fn();
const mockUserUpdate = jest.fn();
jest.mock('../../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => mockUserFindUnique(...a),
      update: (...a: unknown[]) => mockUserUpdate(...a),
    },
  },
}));
jest.mock('../../middleware/auth', () => ({
  authenticate: (req: any, res: any, next: any) => {
    const raw = req.headers['x-test-user'];
    if (!raw) return res.status(401).json({ message: 'Authentication required' });
    req.user = JSON.parse(raw as string);
    next();
  },
}));
jest.mock('../../controllers/userController', () => {
  const ok = (_req: any, res: any) => res.status(200).json({ ok: true });
  return {
    getPurchases: ok, getFavorites: ok, getUserProfile: ok, getLeaderboard: ok, getPublicShopperProfile: ok,
    getBadges: ok, activateHuntPassTrial: ok, getUserQRData: ok, deleteAccount: ok, exportMyData: ok,
  };
});
jest.mock('../../controllers/brandFollowController', () => {
  const ok = (_req: any, res: any) => res.status(200).json({ ok: true });
  return { getBrandFollows: ok, addBrandFollow: ok, removeBrandFollow: ok };
});
jest.mock('../../controllers/addressController', () => {
  const ok = (_req: any, res: any) => res.status(200).json({ ok: true });
  return { listMyAddresses: ok, createMyAddress: ok, updateMyAddress: ok, deleteMyAddress: ok, getCheckoutAddressDefaults: ok };
});
jest.mock('../../services/xpService', () => ({ spendXp: jest.fn(), getSpendableXp: jest.fn() }));

import router from '../users';

async function patchMe(body: unknown) {
  const app = express();
  app.use(express.json());
  app.use('/api/users', router);
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/users/me`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-test-user': JSON.stringify({ id: 'u1', roles: ['USER'] }) },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  } finally {
    server.close();
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockUserFindUnique.mockResolvedValue({ notificationPrefs: { emailWeeklyDigest: true, emailFlashDeals: false, pushSalesNearMe: true } });
  mockUserUpdate.mockImplementation(async ({ data }: any) => ({ id: 'u1', ...data }));
});

describe('PATCH /users/me notificationPrefs', () => {
  it('merges incoming keys into the existing prefs instead of replacing them', async () => {
    const res = await patchMe({ notificationPrefs: { emailWeeklyDigest: false } });
    expect(res.status).toBe(200);
    const data = (mockUserUpdate.mock.calls[0][0] as any).data;
    expect(data.notificationPrefs).toEqual({ emailWeeklyDigest: false, emailFlashDeals: false, pushSalesNearMe: true });
  });

  it('an explicit null deletes that key and leaves the rest', async () => {
    await patchMe({ notificationPrefs: { pushSalesNearMe: null } });
    const data = (mockUserUpdate.mock.calls[0][0] as any).data;
    expect(data.notificationPrefs).toEqual({ emailWeeklyDigest: true, emailFlashDeals: false });
    expect('pushSalesNearMe' in data.notificationPrefs).toBe(false);
  });

  it('starts from an empty object when the user has no stored prefs', async () => {
    mockUserFindUnique.mockResolvedValue({ notificationPrefs: null });
    await patchMe({ notificationPrefs: { emailFlashDeals: true } });
    expect((mockUserUpdate.mock.calls[0][0] as any).data.notificationPrefs).toEqual({ emailFlashDeals: true });
  });

  it('rejects arrays and strings with 400 and writes nothing', async () => {
    expect((await patchMe({ notificationPrefs: [1, 2] })).status).toBe(400);
    expect((await patchMe({ notificationPrefs: 'off' })).status).toBe(400);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it('does not touch notificationPrefs when the field is not sent', async () => {
    await patchMe({ purchasesVisible: true });
    expect(mockUserFindUnique).not.toHaveBeenCalled();
    expect((mockUserUpdate.mock.calls[0][0] as any).data).toEqual({ purchasesVisible: true });
  });
});
