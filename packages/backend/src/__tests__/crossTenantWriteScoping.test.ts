/**
 * Security fixes (2026-11-04): cross-organizer writes keyed on a bare id.
 *   #195  DELETE /api/sales/:saleId/settlement/expenses/:expenseId  -> scoped to this sale's settlement
 *   #84   PATCH  /api/workspace/:workspaceId/briefing/prep/:taskId    -> task must be on a workspace-owner sale
 *   #84s  POST   /api/workspace/:workspaceId/briefing/prep            -> saleId must be a workspace-owner sale
 *   #142  PUT    /api/sales/:saleId/bundles/:bundleId                 -> bundle must be on this sale
 *   #143  DELETE /api/sales/:saleId/bundles/:bundleId                 -> bundle must be on this sale
 *   #144  bundle itemIds (create and update)                          -> every item must be on this sale
 *
 * Each block proves the foreign id is refused (404 / 400) with nothing written, and that the
 * owner's own legit request still works. Prisma is an in-memory jest stand-in; the sales router is a
 * recording stub so the bundle handlers are called directly.
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

const mockPrisma: any = {
  $transaction: jest.fn(),
  sale: { findFirst: jest.fn() },
  saleSettlement: { findUnique: jest.fn() },
  organizer: { findUnique: jest.fn() },
  organizerWorkspace: { findUnique: jest.fn() },
  prepTask: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  saleChecklist: { findUnique: jest.fn() },
  item: { count: jest.fn() },
  itemBundle: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
};
jest.mock('../lib/prisma', () => ({ __esModule: true, prisma: mockPrisma }));
jest.mock('../index', () => ({ __esModule: true, prisma: mockPrisma }));
jest.mock('@sentry/node', () => ({ captureException: jest.fn() }));
jest.mock('../lib/socket', () => ({ getIO: () => ({ to: () => ({ emit: jest.fn() }) }) }));

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
jest.mock('../middleware/auth', () => ({
  __esModule: true,
  authenticate: jest.fn(),
  optionalAuthenticate: jest.fn(),
  lenientOptionalAuthenticate: jest.fn(),
  requireOrganizer: jest.fn(),
}));
jest.mock('../controllers/arrivalController', () => mockProxyFactory());
jest.mock('../controllers/ebayController', () => mockProxyFactory());
jest.mock('../controllers/exportController', () => mockProxyFactory());
jest.mock('../controllers/heatmapController', () => mockProxyFactory());
jest.mock('../controllers/labelController', () => mockProxyFactory());
jest.mock('../controllers/marketingKitController', () => mockProxyFactory());
jest.mock('../controllers/returnToInventoryController', () => mockProxyFactory());
jest.mock('../controllers/rsvpController', () => mockProxyFactory());
jest.mock('../controllers/saleController', () => mockProxyFactory());
jest.mock('../controllers/saleStatusController', () => mockProxyFactory());
jest.mock('../controllers/squarePaymentController', () => mockProxyFactory());
jest.mock('../helpers/itemQueries', () => mockProxyFactory());
jest.mock('../lib/saleLocationPrivacy', () => mockProxyFactory());
jest.mock('../middleware/requireTier', () => ({ __esModule: true, requireTier: () => jest.fn() }));
jest.mock('../middleware/trackScanLimiter', () => mockProxyFactory());
jest.mock('../services/badgeService', () => mockProxyFactory());
jest.mock('../services/geocodingService', () => mockProxyFactory());
jest.mock('../routes/photoOps', () => ({ __esModule: true, default: {} }));
jest.mock('../routes/ripples', () => ({ __esModule: true, default: {} }));
jest.mock('../routes/treasureHuntQR', () => ({ __esModule: true, default: {} }));

import salesRouter from '../routes/sales';
import { removeExpense } from '../controllers/settlementController';
import { createPrepTask, updatePrepTask } from '../controllers/briefingController';

void salesRouter;

const findHandler = (method: string, path: string) => {
  const route = mockRoutes.find((r) => r.method === method && r.path === path);
  if (!route) throw new Error(`route not registered: ${method} ${path}`);
  return route.handlers[route.handlers.length - 1] as (req: any, res: any) => Promise<unknown>;
};

const makeRes = () => {
  const res: any = { statusCode: 200, body: undefined };
  res.status = jest.fn((c: number) => { res.statusCode = c; return res; });
  res.json = jest.fn((b: unknown) => { res.body = b; return res; });
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

// ---------------------------------------------------------------------------------------------
describe('#195 settlement removeExpense', () => {
  let tx: any;
  beforeEach(() => {
    mockPrisma.sale.findFirst.mockResolvedValue({ id: 'sale-1' });
    mockPrisma.saleSettlement.findUnique.mockResolvedValue({ id: 'set-1', totalRevenue: 100, platformFeeAmount: 10 });
    tx = {
      saleExpense: { updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      saleSettlement: { update: jest.fn().mockResolvedValue({}) },
    };
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(tx));
  });
  const req = (expenseId: string) => ({ params: { saleId: 'sale-1', expenseId }, user: { id: 'user-1' } });

  it("does not delete an expense from another organizer's settlement (404, totals untouched)", async () => {
    tx.saleExpense.updateMany.mockResolvedValue({ count: 0 });
    const res = makeRes();
    await removeExpense(req('exp-foreign') as any, res);
    expect(tx.saleExpense.updateMany).toHaveBeenCalledWith({ where: { id: 'exp-foreign', settlementId: 'set-1' }, data: { deletedAt: expect.any(Date) } });
    expect(res.statusCode).toBe(404);
    expect(tx.saleSettlement.update).not.toHaveBeenCalled();
  });

  it('removes an expense on the caller\'s own settlement and recalculates totals (legit path)', async () => {
    tx.saleExpense.updateMany.mockResolvedValue({ count: 1 });
    tx.saleExpense.findMany.mockResolvedValue([{ amount: 5 }]);
    const res = makeRes();
    await removeExpense(req('exp-1') as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ message: 'Expense removed.' });
    expect(tx.saleSettlement.update).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------------------------
describe('#84 briefing prep tasks', () => {
  beforeEach(() => {
    mockPrisma.organizerWorkspace.findUnique.mockResolvedValue({ ownerId: 'org-1' });
    mockPrisma.prepTask.update.mockResolvedValue({ id: 'task-1', saleId: 'sale-1' });
    mockPrisma.prepTask.create.mockResolvedValue({ id: 'task-new', saleId: 'sale-1' });
  });

  it("updatePrepTask refuses a task on another organizer's sale (404, nothing written)", async () => {
    mockPrisma.prepTask.findFirst.mockResolvedValue(null);
    const res = makeRes();
    await updatePrepTask({ params: { workspaceId: 'ws-1', taskId: 'task-foreign' }, body: { done: true }, user: { id: 'u1' } } as any, res);
    expect(mockPrisma.prepTask.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'task-foreign', sale: { organizerId: 'org-1' } } }));
    expect(res.statusCode).toBe(404);
    expect(mockPrisma.prepTask.update).not.toHaveBeenCalled();
  });

  it("updatePrepTask updates a task on the workspace owner's sale (legit path)", async () => {
    mockPrisma.prepTask.findFirst.mockResolvedValue({ saleId: 'sale-1', checklistItemId: null, done: false });
    const res = makeRes();
    await updatePrepTask({ params: { workspaceId: 'ws-1', taskId: 'task-1' }, body: { done: true }, user: { id: 'u1' } } as any, res);
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.prepTask.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'task-1' } }));
  });

  it("createPrepTask refuses a saleId that is not the workspace owner's (404, nothing created)", async () => {
    mockPrisma.sale.findFirst.mockResolvedValue(null);
    const res = makeRes();
    await createPrepTask({ params: { workspaceId: 'ws-1' }, body: { saleId: 'sale-foreign', title: 'Set up tables' }, user: { id: 'u1' } } as any, res);
    expect(mockPrisma.sale.findFirst).toHaveBeenCalledWith({ where: { id: 'sale-foreign', organizerId: 'org-1' }, select: { id: true } });
    expect(res.statusCode).toBe(404);
    expect(mockPrisma.prepTask.create).not.toHaveBeenCalled();
  });

  it("createPrepTask creates a task on the workspace owner's sale (legit path)", async () => {
    mockPrisma.sale.findFirst.mockResolvedValue({ id: 'sale-1' });
    mockPrisma.prepTask.findFirst.mockResolvedValue(null);
    const res = makeRes();
    await createPrepTask({ params: { workspaceId: 'ws-1' }, body: { saleId: 'sale-1', title: 'Set up tables' }, user: { id: 'u1' } } as any, res);
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.prepTask.create).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------------------------
describe('#142/#143/#144 sale bundles', () => {
  const put = () => findHandler('put', '/:saleId/bundles/:bundleId');
  const del = () => findHandler('delete', '/:saleId/bundles/:bundleId');
  const post = () => findHandler('post', '/:saleId/bundles');
  const req = (params: any, body: any = {}) => ({ params, body, user: { id: 'user-1' } });

  beforeEach(() => {
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org-1' });
    mockPrisma.sale.findFirst.mockResolvedValue({ id: 'sale-1' });
    mockPrisma.itemBundle.update.mockResolvedValue({ id: 'b1' });
    mockPrisma.itemBundle.create.mockResolvedValue({ id: 'b-new' });
  });

  it("PUT refuses a bundle that belongs to another organizer's sale (404, nothing written)", async () => {
    mockPrisma.itemBundle.findFirst.mockResolvedValue(null);
    const res = makeRes();
    await put()(req({ saleId: 'sale-1', bundleId: 'b-foreign' }, { bundlePrice: 1 }), res);
    expect(mockPrisma.itemBundle.findFirst).toHaveBeenCalledWith({ where: { id: 'b-foreign', saleId: 'sale-1' }, select: { id: true } });
    expect(res.statusCode).toBe(404);
    expect(mockPrisma.itemBundle.update).not.toHaveBeenCalled();
  });

  it("PUT refuses itemIds from another organizer's sale (400, nothing written)", async () => {
    mockPrisma.itemBundle.findFirst.mockResolvedValue({ id: 'b1' });
    mockPrisma.item.count.mockResolvedValue(1);
    const res = makeRes();
    await put()(req({ saleId: 'sale-1', bundleId: 'b1' }, { itemIds: ['mine', 'theirs'] }), res);
    expect(mockPrisma.item.count).toHaveBeenCalledWith({ where: { id: { in: ['mine', 'theirs'] }, saleId: 'sale-1' } });
    expect(res.statusCode).toBe(400);
    expect(mockPrisma.itemBundle.update).not.toHaveBeenCalled();
  });

  it('PUT updates the owner\'s own bundle with its own items (legit path)', async () => {
    mockPrisma.itemBundle.findFirst.mockResolvedValue({ id: 'b1' });
    mockPrisma.item.count.mockResolvedValue(2);
    const res = makeRes();
    await put()(req({ saleId: 'sale-1', bundleId: 'b1' }, { bundlePrice: 12, itemIds: ['i1', 'i2'] }), res);
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.itemBundle.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'b1' } }));
  });

  it("DELETE does not deactivate a bundle of another organizer's sale (404)", async () => {
    mockPrisma.itemBundle.updateMany.mockResolvedValue({ count: 0 });
    const res = makeRes();
    await del()(req({ saleId: 'sale-1', bundleId: 'b-foreign' }), res);
    expect(mockPrisma.itemBundle.updateMany).toHaveBeenCalledWith({ where: { id: 'b-foreign', saleId: 'sale-1' }, data: { isActive: false } });
    expect(res.statusCode).toBe(404);
  });

  it("DELETE deactivates the owner's own bundle (legit path)", async () => {
    mockPrisma.itemBundle.updateMany.mockResolvedValue({ count: 1 });
    const res = makeRes();
    await del()(req({ saleId: 'sale-1', bundleId: 'b1' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ message: 'Bundle deactivated' });
  });

  it("POST refuses itemIds from another organizer's sale and creates with the owner's own items", async () => {
    mockPrisma.item.count.mockResolvedValue(0);
    const bad = makeRes();
    await post()(req({ saleId: 'sale-1' }, { title: 'Set', bundlePrice: 5, itemIds: ['theirs'] }), bad);
    expect(bad.statusCode).toBe(400);
    expect(mockPrisma.itemBundle.create).not.toHaveBeenCalled();

    mockPrisma.item.count.mockResolvedValue(2);
    const ok = makeRes();
    await post()(req({ saleId: 'sale-1' }, { title: 'Set', bundlePrice: 5, itemIds: ['i1', 'i2'] }), ok);
    expect(ok.statusCode).toBe(201);
    expect(mockPrisma.itemBundle.create).toHaveBeenCalledTimes(1);
  });
});
