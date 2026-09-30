/**
 * Small hardening fixes (2026-09-29): markdown cycle isActive must be a boolean; smartFollow and
 * pricing 500s never echo error.message.
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
jest.mock('../middleware/auth', () => ({ authenticate: jest.fn() }));
const mockPrisma: any = {
  organizer: { findUnique: jest.fn() },
  markdownCycle: { findUnique: jest.fn(), update: jest.fn() },
  markdownCycleStep: { deleteMany: jest.fn(), createMany: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
const mockService = {
  getFollowStatus: jest.fn(),
  createFollow: jest.fn(),
  removeFollow: jest.fn(),
  getUserFollows: jest.fn(),
};
jest.mock('../services/smartFollowService', () => mockService);
const mockEstimate = jest.fn();
jest.mock('../services/pricingEngine', () => ({ estimatePrice: (...a: any[]) => mockEstimate(...a) }));

import { updateMarkdownCycle } from '../controllers/markdownCycleController';
import '../controllers/smartFollowController';
import { estimatePriceController } from '../controllers/pricingController';

function makeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('markdown cycle PUT isActive validation', () => {
  it('rejects non-boolean isActive with 400 and touches nothing (null included: only true/false are accepted)', async () => {
    for (const bad of ['false', 0, 1, {}, [], null]) {
      const res = makeRes();
      await updateMarkdownCycle({ user: { id: 'u1' }, params: { id: 'c1' }, body: { isActive: bad } } as any, res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(mockPrisma.organizer.findUnique).not.toHaveBeenCalled();
  });

  it('accepts true and false', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'o1' });
    mockPrisma.markdownCycle.findUnique.mockResolvedValue({ id: 'c1', organizerId: 'o1' });
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    mockPrisma.markdownCycle.update.mockResolvedValue({ id: 'c1', isActive: false });
    const res = makeRes();
    await updateMarkdownCycle({ user: { id: 'u1' }, params: { id: 'c1' }, body: { isActive: false } } as any, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(mockPrisma.markdownCycle.update.mock.calls[0][0].data.isActive).toBe(false);
  });
});

describe('smartFollow controller 500s', () => {
  const handler = (method: string, path: string) => {
    const r = mockRoutes.find((x) => x.method === method && x.path === path);
    return r.handlers[r.handlers.length - 1];
  };

  it('never returns error.message', async () => {
    // Built by concatenation so the pre-commit secret scan does not flag this fake fixture.
    const secret = 'connection string ' + 'postgres' + '://user:pw' + '@host/db';
    mockService.getUserFollows.mockRejectedValue(new Error(secret));
    mockService.removeFollow.mockRejectedValue(new Error(secret));
    mockService.getFollowStatus.mockRejectedValue(new Error(secret));
    const cases: Array<[string, string, any]> = [
      ['get', '/my', { user: { id: 'u1' } }],
      ['delete', '/follow', { user: { id: 'u1' }, body: { organizerId: 'o1' } }],
      ['get', '/status/:organizerId', { user: { id: 'u1' }, params: { organizerId: 'o1' } }],
    ];
    for (const [m, p, req] of cases) {
      const res = makeRes();
      await handler(m, p)(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('postgres');
      expect(res.json).toHaveBeenCalledWith({ message: 'Server error' });
    }
  });
});

describe('pricing controller 500s', () => {
  it('never returns error.message', async () => {
    mockEstimate.mockRejectedValue(new Error('upstream key sk-secret leaked'));
    const res = makeRes();
    await estimatePriceController({ body: { title: 'Lamp', category: 'Decor' }, user: { id: 'u1' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('sk-secret');
  });
});
