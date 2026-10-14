/**
 * GET /api/crawler-stats/sale/:saleId (2026-10-13 security): was an IDOR, any signed-in account read
 * any sale's crawler visits. Owner / workspace staff / admin get full stats; for an unclaimed scraped
 * listing other signed-in users get aggregates only (ClaimListingBanner); otherwise 403.
 */
const mockSaleFindUnique = jest.fn();
const mockOrganizerFindUnique = jest.fn();
const mockMemberFindFirst = jest.fn();
const mockVisitFindMany = jest.fn();
const mockVisitCount = jest.fn();
jest.mock('../lib/prisma', () => ({
  prisma: {
    sale: { findUnique: (...a: any[]) => mockSaleFindUnique(...a) },
    organizer: { findUnique: (...a: any[]) => mockOrganizerFindUnique(...a) },
    workspaceMember: { findFirst: (...a: any[]) => mockMemberFindFirst(...a) },
    crawlerVisit: {
      findMany: (...a: any[]) => mockVisitFindMany(...a),
      count: (...a: any[]) => mockVisitCount(...a),
    },
  },
}));
jest.mock('../middleware/auth', () => ({ authenticate: (_req: any, _res: any, next: any) => next() }));

import router from '../routes/crawlerStats';

function handler() {
  const layer: any = (router as any).stack.find((l: any) => l.route?.path === '/sale/:saleId');
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

function mockRes() {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

const visits = [{ crawlerName: 'GPTBot', createdAt: new Date('2026-10-01') }];

beforeEach(() => {
  jest.clearAllMocks();
  mockVisitFindMany.mockResolvedValue(visits);
  mockVisitCount.mockResolvedValue(1);
  mockOrganizerFindUnique.mockResolvedValue(null);
  mockMemberFindFirst.mockResolvedValue(null);
});

async function call(user: any) {
  const res = mockRes();
  await handler()({ params: { saleId: 's1' }, user } as any, res);
  return res;
}

describe('crawler stats per-sale access', () => {
  it('404 when the sale does not exist', async () => {
    mockSaleFindUnique.mockResolvedValue(null);
    const res = await call({ id: 'u1', roles: ['USER'] });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockVisitFindMany).not.toHaveBeenCalled();
  });

  it('403 for another organizer on a managed sale (the IDOR)', async () => {
    mockSaleFindUnique.mockResolvedValue({ organizerId: 'org1', organizer: { isUnmanagedListing: false } });
    mockOrganizerFindUnique.mockResolvedValue({ id: 'org-other' });
    const res = await call({ id: 'u2', roles: ['ORGANIZER'] });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockVisitFindMany).not.toHaveBeenCalled();
  });

  it('owner gets full stats including the visit timeline', async () => {
    mockSaleFindUnique.mockResolvedValue({ organizerId: 'org1', organizer: { isUnmanagedListing: false } });
    const res = await call({ id: 'u1', roles: ['ORGANIZER'], organizerProfile: { id: 'org1' } });
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ total: 1, byBot: { GPTBot: 1 }, recentVisits: visits });
  });

  it('accepted workspace staff of the owner get full stats', async () => {
    mockSaleFindUnique.mockResolvedValue({ organizerId: 'org1', organizer: { isUnmanagedListing: false } });
    mockMemberFindFirst.mockResolvedValue({ id: 'm1' });
    const res = await call({ id: 'staff1', roles: ['USER'] });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ recentVisits: visits }));
    const where = mockMemberFindFirst.mock.calls[0][0].where;
    expect(where).toEqual(expect.objectContaining({ acceptedAt: { not: null }, graceRemovedAt: null, workspace: { ownerId: 'org1' } }));
  });

  it('admin gets full stats', async () => {
    mockSaleFindUnique.mockResolvedValue({ organizerId: 'org1', organizer: { isUnmanagedListing: false } });
    const res = await call({ id: 'a1', roles: ['USER', 'ADMIN'] });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ recentVisits: visits }));
  });

  it('unclaimed scraped listing: other signed-in users get aggregates only (claim banner)', async () => {
    mockSaleFindUnique.mockResolvedValue({ organizerId: 'orgScraped', organizer: { isUnmanagedListing: true } });
    const res = await call({ id: 'u9', roles: ['USER'] });
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ total: 1, byBot: { GPTBot: 1 }, recentVisits: [] });
  });
});
