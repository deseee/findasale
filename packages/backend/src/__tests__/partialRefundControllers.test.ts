/**
 * Partial refunds must not restore inventory (money review P1-14, 2026-09-29).
 *
 * The three refund entry points (stripeController.createRefund, disputeController.updateDisputeStatus,
 * adminController.bulkRefundPurchases) used to put the item back on sale after ANY refund, so a partial
 * refund (buyer keeps the item) let it be sold a second time. Now:
 *   - the item is restored only when the refund brings the purchase to fully refunded;
 *   - a partial refund keeps the purchase PAID with refundedAmount tracked (squareRefundService), and a
 *     second partial refund is allowed up to the remainder;
 *   - "refund everything" means the whole REMAINING balance.
 *
 * Prisma and every collaborator are mocked (each imported module is replaced with an auto-mocking
 * stand-in, except the refund services, whose contract is what is under test here). NO payment call and
 * no database. Run with
 *   pnpm --filter backend test -- partialRefundControllers
 */

const fs = require('fs');
const path = require('path');

const mockPrisma: any = {
  purchase: { findUnique: jest.fn(), count: jest.fn() },
  item: { update: jest.fn(), updateMany: jest.fn() },
  dispute: { findUnique: jest.fn(), update: jest.fn() },
  user: { findUnique: jest.fn() },
  boothCartTransaction: { findUnique: jest.fn() },
};
const mockExecuteSquare = jest.fn();
const mockExecuteStripe = jest.fn();

class MockRefundError extends Error {
  statusCode: number;
  details?: Record<string, unknown>;
  constructor(message: string, statusCode = 400, details?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

const autoMock = () =>
  new Proxy(
    {},
    {
      get(target: any, key: string) {
        if (key === '__esModule') return true;
        if (key === 'then') return undefined;
        if (!(key in target)) target[key] = jest.fn();
        return target[key];
      },
    }
  );

const overrides: Record<string, () => any> = {
  '../lib/prisma': () => ({ prisma: mockPrisma }),
  '../services/squareRefundService': () => ({ executeVerifiedSquareRefund: (...a: any[]) => mockExecuteSquare(...a) }),
  '../services/refundService': () => ({
    executeVerifiedRefund: (...a: any[]) => mockExecuteStripe(...a),
    RefundError: MockRefundError,
    sendRefundConfirmationEmail: jest.fn(),
    disputeClawbackEnabled: jest.fn(),
  }),
  '../lib/notificationService': () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }),
};

// Replace every import of a controller with a stand-in so its (large) dependency graph never loads.
const loadController = (file: string) => {
  const src: string = fs.readFileSync(path.join(__dirname, '..', 'controllers', `${file}.ts`), 'utf8');
  const specs = new Set<string>();
  for (const m of src.matchAll(/from\s+'([^']+)'/g)) specs.add(m[1]);
  for (const m of src.matchAll(/require\('([^']+)'\)/g)) specs.add(m[1]);
  const builtins = new Set(['crypto', 'fs', 'path', 'url', 'os', 'util', 'stream', 'http', 'https', 'zlib', 'child_process', 'events']);
  jest.resetModules();
  for (const spec of specs) {
    if (builtins.has(spec) || spec.startsWith('node:')) continue;
    const id = spec.startsWith('./') ? `../controllers/${spec.slice(2)}` : spec;
    jest.doMock(id, overrides[id] ?? autoMock, { virtual: !spec.startsWith('.') });
  }
  for (const [id, factory] of Object.entries(overrides)) jest.doMock(id, factory);
  return require(`../controllers/${file}`);
};

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const squareResult = (over: any = {}) => ({
  refundedAmount: 30,
  totalRefundedAmount: 30,
  remainingRefundable: 70,
  isFullRefund: false,
  cashPortionToRefundByHand: 0,
  message: null,
  purchase: { id: 'p1', userId: 'buyer1', amount: 100, itemId: 'item1', user: null, item: { title: 'Lamp' }, sale: null },
  ...over,
});

const purchaseRow = (over: any = {}) => ({
  id: 'p1',
  amount: 100,
  refundedAmount: null,
  processor: 'SQUARE',
  itemId: 'item1',
  userId: 'buyer1',
  boothCartTransactionId: null,
  user: { id: 'buyer1', email: 'b@example.com', name: 'Buyer' },
  item: { title: 'Lamp' },
  sale: { organizer: { userId: 'owner1', businessName: 'Org' } },
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.item.update.mockResolvedValue({});
  mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.purchase.count.mockResolvedValue(0); // no OTHER PAID purchase of the item
  mockPrisma.purchase.findUnique.mockResolvedValue(purchaseRow());
  mockExecuteSquare.mockResolvedValue(squareResult());
  mockExecuteStripe.mockResolvedValue({ refundedAmount: 100, purchase: { id: 'p1', itemId: 'item1', amount: 100 } });
});

describe('stripeController.createRefund', () => {
  const call = async (body: any = {}) => {
    const { createRefund } = loadController('stripeController');
    const res = makeRes();
    await createRefund({ user: { id: 'owner1', roles: ['ORGANIZER'], role: 'ORGANIZER' }, params: { purchaseId: 'p1' }, body } as any, res);
    return res;
  };

  it('a partial Square refund keeps the item OFF the market and reports the balance left', async () => {
    const res = await call({ amount: 30 });
    expect(mockExecuteSquare).toHaveBeenCalledWith('p1', 30, 'organizer');
    expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0]).toMatchObject({ refundAmount: 30, isFullRefund: false, remainingRefundable: 70 });
  });

  it('with no amount it refunds the whole REMAINING balance; completing the balance restores the item', async () => {
    mockPrisma.purchase.findUnique.mockResolvedValue(purchaseRow({ refundedAmount: 30 }));
    mockExecuteSquare.mockResolvedValue(squareResult({ refundedAmount: 70, totalRefundedAmount: 100, remainingRefundable: 0, isFullRefund: true }));
    const res = await call({});
    expect(mockExecuteSquare).toHaveBeenCalledWith('p1', 70, 'organizer');
    expect(mockPrisma.item.updateMany).toHaveBeenCalledWith({ where: { id: 'item1', status: 'SOLD' }, data: { status: 'AVAILABLE' } });
    expect(res.json.mock.calls[0][0]).toMatchObject({ refundAmount: 70, isFullRefund: true, remainingRefundable: 0 });
  });

  it('a second partial refund is allowed up to the remainder and still does not restore the item', async () => {
    mockPrisma.purchase.findUnique.mockResolvedValue(purchaseRow({ refundedAmount: 30 }));
    mockExecuteSquare.mockResolvedValue(squareResult({ refundedAmount: 20, totalRefundedAmount: 50, remainingRefundable: 50, isFullRefund: false }));
    const res = await call({ amount: 20 });
    expect(mockExecuteSquare).toHaveBeenCalledWith('p1', 20, 'organizer');
    expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0]).toMatchObject({ isFullRefund: false, remainingRefundable: 50 });
  });

  it('rejects more than the remaining balance, a bad amount, and an already fully refunded purchase, before any refund call', async () => {
    mockPrisma.purchase.findUnique.mockResolvedValue(purchaseRow({ refundedAmount: 30 }));
    let res = await call({ amount: 70.01 });
    expect(res.status).toHaveBeenCalledWith(400);
    res = await call({ amount: -5 });
    expect(res.status).toHaveBeenCalledWith(400);
    res = await call({ amount: 'abc' });
    expect(res.status).toHaveBeenCalledWith(400);
    mockPrisma.purchase.findUnique.mockResolvedValue(purchaseRow({ refundedAmount: 100 }));
    res = await call({});
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockExecuteSquare).not.toHaveBeenCalled();
  });

  it('a refund the service rejects is relayed and restores nothing', async () => {
    mockExecuteSquare.mockRejectedValue(new MockRefundError('Refund already in progress or not refundable', 400));
    const res = await call({});
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
  });

  it('the legacy Stripe path stays full-refund only (no partial tracking there) and still restores the item', async () => {
    mockPrisma.purchase.findUnique.mockResolvedValue(purchaseRow({ processor: 'STRIPE' }));
    let res = await call({ amount: 30 });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockExecuteStripe).not.toHaveBeenCalled();

    res = await call({});
    expect(mockExecuteStripe).toHaveBeenCalledWith('p1', 100, 'organizer');
    expect(mockPrisma.item.updateMany).toHaveBeenCalledWith({ where: { id: 'item1', status: 'SOLD' }, data: { status: 'AVAILABLE' } });
  });

  it('a full refund does NOT put the item back on sale when another PAID purchase of it exists', async () => {
    mockPrisma.purchase.findUnique.mockResolvedValue(purchaseRow({ refundedAmount: 30 }));
    mockExecuteSquare.mockResolvedValue(squareResult({ refundedAmount: 70, totalRefundedAmount: 100, remainingRefundable: 0, isFullRefund: true }));
    mockPrisma.purchase.count.mockResolvedValue(1);
    await call({});
    expect(mockPrisma.purchase.count).toHaveBeenCalledWith({ where: { itemId: 'item1', id: { not: 'p1' }, status: 'PAID' } });
    expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
  });

  it('an unexpected failure returns a generic message with a code, never the raw error text', async () => {
    mockExecuteSquare.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432 secret-host'));
    const res = await call({});
    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.code).toBe('REFUND_FAILED');
    expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED|secret-host|10\.0\.0\.5/);
  });
});

describe('disputeController.updateDisputeStatus', () => {
  const call = async (refundAmount: number) => {
    const { updateDisputeStatus } = loadController('disputeController');
    const res = makeRes();
    await updateDisputeStatus({ user: { id: 'admin1' }, params: { id: 'd1' }, body: { status: 'resolved', resolution: 'ok', refundAmount } } as any, res);
    return res;
  };
  beforeEach(() => {
    mockPrisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
    mockPrisma.dispute.findUnique.mockResolvedValue({ id: 'd1', orderId: 'p1', buyerId: 'buyer1', saleId: null, itemId: 'item1', buyer: { id: 'buyer1', createdAt: new Date() } });
    mockPrisma.dispute.update.mockResolvedValue({ id: 'd1', status: 'resolved' });
    mockPrisma.purchase.findUnique.mockResolvedValue(purchaseRow());
  });

  it('a partial dispute refund does not put the item back on sale', async () => {
    await call(30);
    expect(mockExecuteSquare).toHaveBeenCalledWith('p1', 30, 'dispute');
    expect(mockPrisma.item.update).not.toHaveBeenCalled();
    expect(mockPrisma.dispute.update).toHaveBeenCalled(); // the dispute is still resolved
  });

  it('a refund that completes the balance restores the item', async () => {
    mockExecuteSquare.mockResolvedValue(squareResult({ refundedAmount: 70, totalRefundedAmount: 100, remainingRefundable: 0, isFullRefund: true }));
    await call(70);
    expect(mockPrisma.item.update).toHaveBeenCalledWith({ where: { id: 'item1' }, data: { status: 'AVAILABLE' } });
  });

  it('the legacy Stripe path restores only when the whole purchase amount was refunded', async () => {
    mockPrisma.purchase.findUnique.mockResolvedValue(purchaseRow({ processor: 'STRIPE' }));
    mockExecuteStripe.mockResolvedValue({ refundedAmount: 40, purchase: { id: 'p1', itemId: 'item1', amount: 100, user: null, item: null, sale: null } });
    await call(40);
    expect(mockPrisma.item.update).not.toHaveBeenCalled();
    mockExecuteStripe.mockResolvedValue({ refundedAmount: 100, purchase: { id: 'p1', itemId: 'item1', amount: 100, user: null, item: null, sale: null } });
    await call(100);
    expect(mockPrisma.item.update).toHaveBeenCalledTimes(1);
  });
});

describe('adminController.bulkRefundPurchases', () => {
  const call = async (ids: string[]) => {
    const { bulkRefundPurchases } = loadController('adminController');
    const res = makeRes();
    await bulkRefundPurchases({ user: { id: 'admin1' }, body: { purchaseIds: ids } } as any, res);
    return res.json.mock.calls[0][0].results;
  };
  const row = (over: any = {}) => ({ amount: 100, itemId: 'item1', processor: 'SQUARE', refundedAmount: null, ...over });

  it('refunds the whole remaining balance of a partly refunded purchase and restores the item once it is complete', async () => {
    mockPrisma.purchase.findUnique.mockResolvedValue(row({ refundedAmount: 30 }));
    mockExecuteSquare.mockResolvedValue(squareResult({ refundedAmount: 70, totalRefundedAmount: 100, remainingRefundable: 0, isFullRefund: true }));
    const results = await call(['p1']);
    expect(mockExecuteSquare).toHaveBeenCalledWith('p1', 70, 'admin', 'requested_by_customer');
    expect(mockPrisma.item.update).toHaveBeenCalledWith({ where: { id: 'item1' }, data: { status: 'AVAILABLE' } });
    expect(results[0]).toMatchObject({ purchaseId: 'p1', success: true, refundedAmount: 70 });
  });

  it('does not restore the item when the refund left a balance', async () => {
    mockPrisma.purchase.findUnique.mockResolvedValue(row());
    mockExecuteSquare.mockResolvedValue(squareResult({ isFullRefund: false }));
    await call(['p1']);
    expect(mockPrisma.item.update).not.toHaveBeenCalled();
  });

  it('reports an already fully refunded purchase without calling the refund service', async () => {
    mockPrisma.purchase.findUnique.mockResolvedValue(row({ refundedAmount: 100 }));
    const results = await call(['p1']);
    expect(results[0]).toMatchObject({ success: false, error: 'This purchase has already been fully refunded' });
    expect(mockExecuteSquare).not.toHaveBeenCalled();
  });

  it('a plain Stripe purchase is refunded in full and its item restored, as before', async () => {
    mockPrisma.purchase.findUnique.mockResolvedValue(row({ processor: 'STRIPE' }));
    await call(['p1']);
    expect(mockExecuteStripe).toHaveBeenCalledWith('p1', 100, 'admin', 'requested_by_customer');
    expect(mockPrisma.item.update).toHaveBeenCalledTimes(1);
  });
});
