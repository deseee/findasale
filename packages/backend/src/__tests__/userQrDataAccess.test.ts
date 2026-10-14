/**
 * GET /api/users/qr/:userId (2026-10-13 security): was public and returned any user's email plus every
 * active hold. Now authenticate + controller gate: the shopper themself, an admin, or an organizer /
 * register team member scanning at the POS (holds scoped to that organizer's own sales).
 */
const mockUserFindUnique = jest.fn();
const mockHoldFindMany = jest.fn();
const mockResolveActor = jest.fn();
jest.mock('../lib/prisma', () => ({
  prisma: {
    user: { findUnique: (...a: any[]) => mockUserFindUnique(...a) },
    itemReservation: { findMany: (...a: any[]) => mockHoldFindMany(...a) },
  },
}));
jest.mock('../middleware/auth', () => ({}));
jest.mock('../services/crewService', () => ({ handOffCrewsBeforeUserDeletion: jest.fn() }));
jest.mock('../utils/posAuth', () => ({
  resolveOrganizerOrTeamMember: (...a: any[]) => mockResolveActor(...a),
}));
jest.mock('qrcode', () => ({ toDataURL: jest.fn(async () => 'data:image/png;base64,QR') }), { virtual: true });

import { getUserQRData } from '../controllers/userController';

function mockRes() {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

const hold = {
  id: 'h1',
  status: 'PENDING',
  expiresAt: new Date('2026-10-20T00:00:00Z'),
  item: { id: 'i1', title: 'Lamp', price: 10, saleId: 's1' },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUserFindUnique.mockResolvedValue({ id: 'shopper1', name: 'Sam', email: 'sam@example.com' });
  mockHoldFindMany.mockResolvedValue([hold]);
});

async function call(user: any, userId = 'shopper1') {
  const res = mockRes();
  await getUserQRData({ params: { userId }, user } as any, res);
  return res;
}

describe('getUserQRData access', () => {
  it('401 without a signed-in user, and never reads the user row', async () => {
    const res = await call(undefined);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it('the shopper themself gets their QR image, email and all holds', async () => {
    const res = await call({ id: 'shopper1', roles: ['USER'] });
    expect(mockResolveActor).not.toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.email).toBe('sam@example.com');
    expect(body.qrCodeDataUrl).toBe('data:image/png;base64,QR');
    expect(mockHoldFindMany.mock.calls[0][0].where.item).toBeUndefined();
  });

  it('a different plain shopper is refused (resolver sends 403) and no data is read', async () => {
    mockResolveActor.mockImplementation(async (_req: any, res: any) => {
      res.status(403).json({ message: 'Organizer access required' });
      return null;
    });
    const res = await call({ id: 'other', roles: ['USER'] });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockUserFindUnique).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({ email: expect.anything() }));
  });

  it('a scanning organizer gets what the POS needs, holds scoped to their own sales, no QR image', async () => {
    mockResolveActor.mockResolvedValue({ id: 'org1', actorKind: 'ORGANIZER' });
    const res = await call({ id: 'orgUser', roles: ['USER', 'ORGANIZER'] });
    expect(mockResolveActor.mock.calls[0][2]).toEqual({ requireStripe: false });
    expect(mockHoldFindMany.mock.calls[0][0].where.item).toEqual({ sale: { organizerId: 'org1' } });
    const body = res.json.mock.calls[0][0];
    expect(body).toEqual(expect.objectContaining({ id: 'shopper1', name: 'Sam', email: 'sam@example.com' }));
    expect(body.holds).toHaveLength(1);
    expect(body.qrCodeDataUrl).toBeUndefined();
  });

  it('an admin is not scoped', async () => {
    await call({ id: 'admin1', roles: ['USER', 'ADMIN'] });
    expect(mockResolveActor).not.toHaveBeenCalled();
    expect(mockHoldFindMany.mock.calls[0][0].where.item).toBeUndefined();
  });
});

describe('route wiring', () => {
  it('GET /qr/:userId is behind authenticate', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '../routes/users.ts'), 'utf8');
    expect(src).toMatch(/router\.get\('\/qr\/:userId', authenticate, getUserQRData\)/);
  });
});
