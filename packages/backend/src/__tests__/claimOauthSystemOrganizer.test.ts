/**
 * Security fix (2026-11-04, finding #9): POST /api/organizers/:id/claim-oauth could claim the singleton
 * system organizer ("FindA.Sale Directory", user system-scraper@finda.sale) that every unattributed
 * scraped sale is attached to, handing the claimant all of those sales and breaking scraper ingestion.
 *
 * WHAT THIS PROVES
 *   - the system organizer is refused (403 NOT_CLAIMABLE) and nothing is written
 *   - an already-claimed organizer (isClaimed, or claimStatus CLAIMED) is refused (409) and nothing is written
 *   - a real ghost listing is still claimable (legit path), with the optimistic lock on isClaimed/claimStatus
 *   - deliberately NOT asserted: a userId:null condition (ghost organizers always have a synthetic user)
 *
 * Express Router is a recording stub; the handler is invoked directly. Every other import is auto-mocked.
 */

const mockRoutes: Array<{ method: string; path: string; handlers: any[] }> = [];
jest.mock('express', () => {
  const Router = () => {
    const r: any = {};
    for (const m of ['get', 'post', 'put', 'delete', 'patch', 'use']) {
      r[m] = (path: unknown, ...handlers: any[]) => {
        mockRoutes.push({ method: m, path: String(path), handlers });
        return r;
      };
    }
    return r;
  };
  return { __esModule: true, default: { Router }, Router };
});
jest.mock('express-rate-limit', () => ({ __esModule: true, default: () => jest.fn() }));

const mockPrisma: any = {
  $transaction: jest.fn(),
  organizer: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn((a: any) => ({ op: 'organizer.update', a })) },
  user: { update: jest.fn((a: any) => ({ op: 'user.update', a })) },
};
jest.mock('../index', () => ({ __esModule: true, prisma: mockPrisma }));
jest.mock('../lib/prisma', () => ({ __esModule: true, prisma: mockPrisma }));

const mockProxyFactory = () => {
  const target: any = { __esModule: true };
  return new Proxy(target, {
    get: (obj, prop) => {
      if (typeof prop === 'symbol') return undefined;
      if (!(prop in obj)) obj[prop] = jest.fn();
      return obj[prop];
    },
  });
};
jest.mock('../middleware/auth', () => mockProxyFactory());
jest.mock('../middleware/rateLimitShared', () => mockProxyFactory());
jest.mock('../middleware/requireTier', () => ({ __esModule: true, requireTier: () => jest.fn() }));
jest.mock('../controllers/csvExportController', () => mockProxyFactory());
jest.mock('../controllers/donationController', () => mockProxyFactory());
jest.mock('../controllers/exportController', () => mockProxyFactory());
jest.mock('../controllers/extensionController', () => mockProxyFactory());
jest.mock('../controllers/labelComposerController', () => mockProxyFactory());
jest.mock('../controllers/performanceController', () => mockProxyFactory());
jest.mock('../controllers/platformStatsController', () => mockProxyFactory());
jest.mock('../controllers/posTiersController', () => mockProxyFactory());
jest.mock('../controllers/printKitController', () => mockProxyFactory());
jest.mock('../controllers/stripeConnectController', () => mockProxyFactory());
jest.mock('../controllers/watermarkController', () => mockProxyFactory());
jest.mock('../lib/publicSaleGate', () => mockProxyFactory());
jest.mock('../lib/saleLocationPrivacy', () => mockProxyFactory());
jest.mock('../lib/saleProFeatures', () => mockProxyFactory());
jest.mock('../lib/transactionalEmailService', () => mockProxyFactory());
jest.mock('../services/facebookMarketplaceEmailSoldDetection', () => mockProxyFactory());
jest.mock('../services/organizerEmailForwardingService', () => mockProxyFactory());
jest.mock('../services/organizerFollowService', () => mockProxyFactory());
jest.mock('../services/referralService', () => mockProxyFactory());
jest.mock('../services/suppressionService', () => mockProxyFactory());
jest.mock('../utils/audienceAccess', () => mockProxyFactory());

import organizersRouter from '../routes/organizers';

void organizersRouter;

const handler = () => {
  const route = mockRoutes.find((r) => r.method === 'post' && r.path === '/:id/claim-oauth');
  if (!route) throw new Error('claim-oauth not registered');
  return route.handlers[route.handlers.length - 1] as (req: any, res: any) => Promise<unknown>;
};

const makeRes = () => {
  const res: any = { statusCode: 200, body: undefined };
  res.status = jest.fn((c: number) => { res.statusCode = c; return res; });
  res.json = jest.fn((b: unknown) => { res.body = b; return res; });
  return res;
};
const req = () => ({ params: { id: 'org-ghost' }, user: { id: 'user-claimant', email: 'me@example.com', roles: ['USER'], emailVerified: true } });

const ghost = (over: Record<string, unknown> = {}) => ({
  id: 'org-ghost',
  isClaimed: false,
  claimStatus: 'UNCLAIMED',
  isUnmanagedListing: true,
  website: null,
  scrapedEmail: null,
  contactEmail: null,
  user: { email: 'ghost-abc123@scraped.finda.sale' },
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.organizer.findFirst.mockResolvedValue(null);
  mockPrisma.$transaction.mockResolvedValue([]);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /organizers/:id/claim-oauth', () => {
  it('refuses the system catch-all organizer and writes nothing', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue(ghost({ user: { email: 'System-Scraper@FindA.Sale' } }));
    const res = makeRes();
    await handler()(req(), res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'NOT_CLAIMABLE' });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses an organizer that is already claimed (isClaimed)', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue(ghost({ isClaimed: true }));
    const res = makeRes();
    await handler()(req(), res);
    expect(res.statusCode).toBe(409);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses an organizer whose claim status is already CLAIMED', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue(ghost({ claimStatus: 'CLAIMED' }));
    const res = makeRes();
    await handler()(req(), res);
    expect(res.statusCode).toBe(409);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('still lets a user claim a real ghost listing that has a synthetic user (legit path)', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue(ghost());
    const res = makeRes();
    await handler()(req(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ success: true, organizerId: 'org-ghost' }));
    const where = mockPrisma.organizer.update.mock.calls[0][0].where;
    expect(where).toEqual({ id: 'org-ghost', isClaimed: false, claimStatus: { not: 'CLAIMED' } });
    expect(where).not.toHaveProperty('userId');
  });
});
