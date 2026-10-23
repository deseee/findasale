/**
 * Organizer street address on GET /sales/:id (Patrick-approved 2026-10-23).
 * organizer.address follows the same gate as organizer.phone: only the sale's owner organizer or an admin sees it.
 * Anonymous callers, signed-in shoppers (even inside the sale-address window) and workspace staff get ''.
 * The sale-level street address keeps its own gate (signed in, from the day before start; staff always).
 * Prisma is a mock.
 */
var mockPrisma: any;
jest.mock('../lib/prisma', () => {
  mockPrisma = {
    organizer: { findUnique: jest.fn() },
    sale: { findUnique: jest.fn() },
    review: { aggregate: jest.fn() },
    workspaceMember: { findFirst: jest.fn() },
  };
  return { prisma: mockPrisma };
});
jest.mock('@sentry/node', () => new Proxy({ __esModule: true }, { get: (t: any, k: string) => (k in t ? t[k] : jest.fn()) }));
jest.mock('../services/revalidationService', () => ({
  triggerSaleAndCityRevalidation: jest.fn(() => Promise.resolve()),
  debouncedTriggerSaleAndCityRevalidation: jest.fn(),
  citySlugFromCityState: jest.fn(() => null),
}));
jest.mock('../services/commandCenterService', () => ({ invalidateCommandCenterCache: jest.fn(() => Promise.resolve()) }));

import { getSale } from '../controllers/saleController';

function makeRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = jest.fn((c: number) => { res.statusCode = c; return res; });
  res.json = jest.fn((b: unknown) => { res.body = b; return res; });
  res.send = jest.fn((b: unknown) => { res.body = b; return res; });
  res.setHeader = jest.fn();
  return res;
}

// The sale is running right now, so the sale-address window is open for any signed-in viewer.
function sale(over: Record<string, any> = {}): any {
  const now = Date.now();
  return {
    id: 's1', title: 'Maple Street Sale', description: 'Lamps', status: 'PUBLISHED', deletedAt: null,
    publishedAt: null, organizerId: 'org_owner', address: '123 Maple St', city: 'Grand Rapids', state: 'MI', zip: '49503',
    lat: 42.963795, lng: -85.670006, entranceLat: null, entranceLng: null, entranceNote: null, notes: null,
    startDate: new Date(now - 60 * 60 * 1000), endDate: new Date(now + 24 * 60 * 60 * 1000), updatedAt: new Date(),
    items: [],
    organizer: {
      id: 'org_owner', userId: 'owner_user', businessName: 'Maple Co', phone: '555-0100', address: '9 Private Home Rd',
      timezone: 'America/Detroit', subscriptionTier: 'SIMPLE', removeWatermarkEnabled: false, user: { userBadges: [] },
    },
    ...over,
  };
}

const OWNER = { id: 'owner_user', role: 'ORGANIZER', roles: ['ORGANIZER'] };
const ADMIN = { id: 'admin_user', role: 'ADMIN', roles: ['ADMIN'] };
const SHOPPER = { id: 'shopper_user', role: 'USER', roles: ['USER'] };
const STAFF = { id: 'staff_user', role: 'USER', roles: ['USER'] };

beforeEach(() => {
  for (const m of Object.values(mockPrisma) as any[]) for (const fn of Object.values(m) as any[]) (fn as jest.Mock).mockReset();
  mockPrisma.review.aggregate.mockResolvedValue({ _avg: { rating: null }, _count: 0 });
  mockPrisma.organizer.findUnique.mockImplementation(async ({ where }: any) => (where.userId === 'owner_user' ? { id: 'org_owner' } : null));
  mockPrisma.workspaceMember.findFirst.mockImplementation(async ({ where }: any) =>
    where.workspace?.ownerId === 'org_owner' && where.OR?.some((c: any) => c.userId === 'staff_user') ? { id: 'wm1' } : null);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const run = async (user?: any, over: Record<string, any> = {}) => {
  mockPrisma.sale.findUnique.mockResolvedValue(sale(over));
  const res = makeRes();
  await getSale({ params: { id: 's1' }, user } as any, res);
  return res;
};

describe('GET /sales/:id organizer.address gate', () => {
  it('anonymous caller: no organizer address, no phone', async () => {
    const res = await run(undefined);
    expect(res.statusCode).toBe(200);
    expect(res.body.organizer.address).toBe('');
    expect(res.body.organizer).not.toHaveProperty('phone');
    expect(JSON.stringify(res.body)).not.toContain('9 Private Home Rd');
  });

  it('signed-in shopper inside the sale-address window: sale address shown, organizer address still hidden', async () => {
    const res = await run(SHOPPER);
    expect(res.body.address).toBe('123 Maple St');
    expect(res.body.organizer.address).toBe('');
    expect(JSON.stringify(res.body)).not.toContain('9 Private Home Rd');
  });

  it('workspace staff: sale address shown, organizer address hidden (same as phone)', async () => {
    const res = await run(STAFF);
    expect(res.body.address).toBe('123 Maple St');
    expect(res.body.organizer.address).toBe('');
    expect(res.body.organizer).not.toHaveProperty('phone');
  });

  it('owner organizer: organizer address and phone returned', async () => {
    const res = await run(OWNER);
    expect(res.body.organizer.address).toBe('9 Private Home Rd');
    expect(res.body.organizer.phone).toBe('555-0100');
  });

  it('admin: organizer address and phone returned', async () => {
    const res = await run(ADMIN);
    expect(res.body.organizer.address).toBe('9 Private Home Rd');
    expect(res.body.organizer.phone).toBe('555-0100');
  });
});
