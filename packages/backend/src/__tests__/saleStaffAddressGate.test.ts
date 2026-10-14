/**
 * Sale street address for the organizer's staff, and Sale.notes following the address gate (2026-10-13).
 *  - GET /sales/:id and GET /sales/:id/calendar.ics: any accepted, not grace-removed member of the organizer's
 *    workspace sees the street address (utils/saleStaffAccess isOrganizerStaff); no TEAMS tier or
 *    broadcast_alerts permission needed. Shoppers before the window do not.
 *  - Sale.notes (Day-of approach notes: parking, entrance) is null whenever the address is gated, on
 *    GET /sales/:id and on the public lists (dropApproachNotesWhereGated).
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

import { getSale, generateIcal, dropApproachNotesWhereGated } from '../controllers/saleController';

function makeRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = jest.fn((c: number) => { res.statusCode = c; return res; });
  res.json = jest.fn((b: unknown) => { res.body = b; return res; });
  res.send = jest.fn((b: unknown) => { res.body = b; return res; });
  res.setHeader = jest.fn();
  return res;
}

// Start far in the future: the address window is closed for every non-privileged viewer.
function sale(over: Record<string, any> = {}): any {
  return {
    id: 's1', title: 'Maple Street Sale', description: 'Lots of lamps', status: 'PUBLISHED', deletedAt: null,
    publishedAt: null, organizerId: 'org_owner', address: '123 Maple St', city: 'Grand Rapids', state: 'MI', zip: '49503',
    lat: 42.963795, lng: -85.670006, entranceLat: 42.9639, entranceLng: -85.6701, entranceNote: 'Side door',
    notes: 'Park on Maple, enter through the red door at 123', safetyNotes: 'No strollers upstairs',
    startDate: new Date('2099-06-01T00:00:00Z'), endDate: new Date('2099-06-02T00:00:00Z'), updatedAt: new Date(),
    items: [],
    organizer: {
      id: 'org_owner', userId: 'owner_user', businessName: 'Maple Co', phone: '555', address: '123 Maple St',
      timezone: 'America/Detroit', subscriptionTier: 'SIMPLE', removeWatermarkEnabled: false, user: { userBadges: [] },
    },
    ...over,
  };
}

const STAFF = { id: 'staff_user', role: 'USER', roles: ['USER'] };
const SHOPPER = { id: 'shopper_user', role: 'USER', roles: ['USER'] };
const OWNER = { id: 'owner_user', role: 'ORGANIZER', roles: ['ORGANIZER'] };

beforeEach(() => {
  for (const m of Object.values(mockPrisma) as any[]) for (const fn of Object.values(m) as any[]) (fn as jest.Mock).mockReset();
  mockPrisma.review.aggregate.mockResolvedValue({ _avg: { rating: null }, _count: 0 });
  mockPrisma.organizer.findUnique.mockImplementation(async ({ where }: any) => (where.userId === 'owner_user' ? { id: 'org_owner' } : null));
  // staff_user is a plain accepted MEMBER of org_owner's workspace; the owner is on SIMPLE and the member holds no
  // special permission. resolveAudienceAccess (the old check) denied exactly this person.
  mockPrisma.workspaceMember.findFirst.mockImplementation(async ({ where }: any) =>
    where.workspace?.ownerId === 'org_owner' && where.graceRemovedAt === null && where.OR?.some((c: any) => c.userId === 'staff_user')
      ? { id: 'wm1' } : null);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('GET /sales/:id: staff address + approach notes', () => {
  const run = async (user?: any, over: Record<string, any> = {}) => {
    mockPrisma.sale.findUnique.mockResolvedValue(sale(over));
    const res = makeRes();
    await getSale({ params: { id: 's1' }, user } as any, res);
    return res;
  };

  it('staff member (no TEAMS tier, no broadcast permission): full address, exact pin, notes kept', async () => {
    const res = await run(STAFF);
    expect(res.statusCode).toBe(200);
    expect(res.body.address).toBe('123 Maple St');
    expect(res.body.lat).toBe(42.963795);
    expect(res.body.notes).toBe('Park on Maple, enter through the red door at 123');
    expect(res.body.addressGate).toEqual({ visible: true });
  });

  it('signed-in shopper before the window: address, entrance and approach notes removed', async () => {
    const res = await run(SHOPPER);
    expect(res.body.address).toBe('');
    expect(res.body.lat).toBe(42.96);
    expect(res.body.entranceNote).toBeNull();
    expect(res.body.notes).toBeNull();
    expect(res.body.safetyNotes).toBe('No strollers upstairs'); // safety disclosure stays public
  });

  it('anonymous viewer: notes removed', async () => {
    const res = await run(undefined);
    expect(res.body.notes).toBeNull();
    expect(mockPrisma.workspaceMember.findFirst).not.toHaveBeenCalled();
  });

  it('owner: notes kept, no staff lookup needed', async () => {
    const res = await run(OWNER);
    expect(res.body.notes).toBe('Park on Maple, enter through the red door at 123');
    expect(mockPrisma.workspaceMember.findFirst).not.toHaveBeenCalled();
  });

  it('online-only sale (no street address): notes are not touched', async () => {
    const res = await run(SHOPPER, { address: '' });
    expect(res.body.notes).toBe('Park on Maple, enter through the red door at 123');
  });

  it('a member removed by a downgrade (graceRemovedAt set) is not staff', async () => {
    mockPrisma.workspaceMember.findFirst.mockResolvedValue(null);
    const res = await run(STAFF);
    expect(res.body.address).toBe('');
  });
});

describe('GET /sales/:id/calendar.ics: staff address', () => {
  const run = async (user?: any) => {
    mockPrisma.sale.findUnique.mockResolvedValue(sale());
    const res = makeRes();
    await generateIcal({ params: { id: 's1' }, user } as any, res);
    return String(res.body);
  };
  it('staff get the street address in LOCATION, a shopper before the window does not', async () => {
    expect(await run(STAFF)).toContain('123 Maple St');
    expect(await run(SHOPPER)).not.toContain('123 Maple St');
  });
});

describe('dropApproachNotesWhereGated (public lists)', () => {
  it('nulls notes only where the gate removed a real address', () => {
    const original = [
      { id: 'a', address: '1 A St', notes: 'red door' },
      { id: 'b', address: '2 B St', notes: 'blue door' },
      { id: 'c', address: '', notes: 'online pickup' },
      { id: 'd', address: '4 D St' },
    ];
    const gated = [
      { id: 'a', address: '', notes: 'red door' },
      { id: 'b', address: '2 B St', notes: 'blue door' },
      { id: 'c', address: '', notes: 'online pickup' },
      { id: 'd', address: '' },
    ];
    const out = dropApproachNotesWhereGated(original, gated);
    expect(out.map((s: any) => s.notes)).toEqual([null, 'blue door', 'online pickup', undefined]);
    expect(out[3]).not.toHaveProperty('notes');
  });
});
