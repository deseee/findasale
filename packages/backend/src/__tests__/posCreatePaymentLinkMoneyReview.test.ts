/**
 * POST /api/pos/payment-links (createPaymentLink) and createPaymentLinkInternal: money review
 * (2026-09-29). Prisma, Square and the permission service are mocked; nothing here touches a real
 * database or a real Square call.
 *
 *   - P1-4/5: every itemId must be an item of THIS sale and organizer (404 otherwise), in the
 *     handler AND in the shared internal that batchUpdateHolds also calls
 *   - P1-6/8: the link cannot charge less than the catalog price of its items unless the discount is
 *     authorized (permission + workspace cap) and the catalog floor holds; whole-cent amounts;
 *     expiresInSeconds bounds (60 seconds to 7 days)
 *   - a POSPaymentLink row that cannot be saved cancels the live Square link instead of orphaning it
 */

jest.mock('@sentry/node', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));

var mockPrisma: any = {
  sale: { findUnique: jest.fn() },
  item: { findMany: jest.fn() },
  pOSPaymentLink: { create: jest.fn() },
  workspaceSettings: { findUnique: jest.fn() },
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

var mockResolveActor = jest.fn();
jest.mock('../utils/posAuth', () => ({
  resolveOrganizerOrTeamMember: (...args: any[]) => mockResolveActor(...args),
}));

var mockCheckPermission = jest.fn();
jest.mock('../services/workspacePermissionService', () => ({
  checkPermission: (...args: any[]) => mockCheckPermission(...args),
}));

var mockCapExceeded = jest.fn();
jest.mock('../services/cashFeeService', () => ({
  ...jest.requireActual('../services/cashFeeService'),
  resolveCashCommissionRate: jest.fn().mockResolvedValue(0.08),
  wouldExceedCashFeeExposureCap: (...args: any[]) => mockCapExceeded(...args),
}));

var mockCreateLink = jest.fn();
var mockDeleteLink = jest.fn();
jest.mock('../services/squareCheckoutLinkService', () => ({
  createSquareCheckoutLink: (...args: any[]) => mockCreateLink(...args),
  deleteSquareCheckoutLink: (...args: any[]) => mockDeleteLink(...args),
}));

jest.mock('../lib/socket', () => ({ getIO: jest.fn(() => ({})) }));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../lib/transactionalEmailService', () => ({
  transactionalEmailService: { emails: { send: jest.fn().mockResolvedValue({ sent: true }) } },
}));
jest.mock('../services/holdInvoicePaymentRecorder', () => ({ markHoldInvoicePaid: jest.fn() }));

import { createPaymentLink, createPaymentLinkInternal, PaymentLinkItemScopeError } from '../controllers/posController';

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const actor = (over: any = {}) => ({
  id: 'org-1',
  ownerUserId: 'org-user-1',
  subscriptionTier: 'SIMPLE',
  stripeConnectId: null,
  squareOnboarded: true,
  squareMerchantId: 'merchant-1',
  squareLocationId: 'loc-1',
  actorKind: 'ORGANIZER',
  actingUserId: 'org-user-1',
  ...over,
});
const teamMember = (over: any = {}) => actor({ actorKind: 'TEAM_MEMBER', workspaceId: 'ws-1', workspaceRole: 'CASHIER', ...over });

const makeReq = (body: any = {}) => ({ body: { saleId: 'sale-1', itemIds: ['i1'], amount: 100, ...body }, user: { id: 'org-user-1' } } as any);

const PRICES: Record<string, number> = { i1: 100, i2: 40, i9: 500 };

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveActor.mockReset();
  mockResolveActor.mockResolvedValue(actor());
  mockCheckPermission.mockReset();
  mockCheckPermission.mockResolvedValue(true);
  mockCapExceeded.mockReset();
  mockCapExceeded.mockResolvedValue(false);
  Object.values(mockPrisma).forEach((m: any) => Object.values(m).forEach((fn: any) => fn.mockReset()));
  mockPrisma.sale.findUnique.mockResolvedValue({ organizerId: 'org-1' });
  // Only ids of sale-1 / org-1 resolve. i9 is another tenant's item.
  mockPrisma.item.findMany.mockImplementation(async ({ where }: any) =>
    (where.id.in as string[]).filter((id) => id !== 'i9').map((id) => ({ id, title: `Item ${id}`, price: PRICES[id] ?? 10 }))
  );
  mockPrisma.workspaceSettings.findUnique.mockResolvedValue(null);
  mockPrisma.pOSPaymentLink.create.mockImplementation(async ({ data }: any) => ({ id: data.id, ...data }));
  mockCreateLink.mockReset();
  mockCreateLink.mockResolvedValue({ ok: true, url: 'https://square.link/pl', paymentLinkId: 'pl-1', orderId: 'ord-1' });
  mockDeleteLink.mockReset();
  mockDeleteLink.mockResolvedValue({ ok: true, cancelledOrderId: 'ord-1' });
});

describe('createPaymentLink item scope (P1-4/5)', () => {
  it('an item id from another tenant is a 404 and no Square link is created', async () => {
    const res = makeRes();
    await createPaymentLink(makeReq({ itemIds: ['i1', 'i9'], amount: 600 }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].code).toBe('ITEM_NOT_FOUND');
    expect(mockCreateLink).not.toHaveBeenCalled();
    expect(mockPrisma.pOSPaymentLink.create).not.toHaveBeenCalled();
  });

  it('looks items up by id, sale AND organizer', async () => {
    await createPaymentLink(makeReq(), makeRes());
    const q = mockPrisma.item.findMany.mock.calls[0][0];
    expect(q.where.saleId).toBe('sale-1');
    expect(q.where.sale).toEqual({ organizerId: 'org-1' });
  });

  it('rejects duplicate or non-string item ids', async () => {
    for (const itemIds of [['i1', 'i1'], [123 as any], ['']]) {
      const res = makeRes();
      await createPaymentLink(makeReq({ itemIds }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(mockCreateLink).not.toHaveBeenCalled();
  });

  it('createPaymentLinkInternal throws PaymentLinkItemScopeError for an item outside the sale scope (batchUpdateHolds path)', async () => {
    await expect(
      createPaymentLinkInternal({
        organizerId: 'org-1',
        stripeConnectId: null,
        subscriptionTier: 'SIMPLE',
        saleId: 'sale-1',
        itemIds: ['i1', 'i9'],
        amount: 600,
        squareOnboarded: true,
        squareMerchantId: 'merchant-1',
      })
    ).rejects.toBeInstanceOf(PaymentLinkItemScopeError);
    expect(mockCreateLink).not.toHaveBeenCalled();
    const q = mockPrisma.item.findMany.mock.calls[0][0];
    expect(q.where.sale).toEqual({ organizerId: 'org-1' });
  });
});

describe('createPaymentLink catalog floor and discount permission (P1-6/8)', () => {
  it('a link for a $100 item cannot be created for $1 with no discount', async () => {
    const res = makeRes();
    await createPaymentLink(makeReq({ amount: 1 }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].code).toBe('TOTAL_BELOW_CATALOG_FLOOR');
    expect(mockCreateLink).not.toHaveBeenCalled();
  });

  it('the 1 cent rounding tolerance still applies', async () => {
    const res = makeRes();
    await createPaymentLink(makeReq({ amount: 99.99 }), res);
    expect(res.json.mock.calls[0][0].linkId).toBeDefined();
  });

  it('an organizer may apply an authorized fixed discount, and the link charges the discounted amount', async () => {
    const res = makeRes();
    await createPaymentLink(makeReq({ amount: 80, discountType: 'FIXED', discountValue: 20 }), res);
    expect(res.json.mock.calls[0][0].amount).toBe(80);
    expect(mockCreateLink.mock.calls[0][0].amountCents).toBe(8000);
  });

  it('a discount larger than what the amount reflects is not allowed to undercut: 80 charged with only a 10 discount fails', async () => {
    const res = makeRes();
    await createPaymentLink(makeReq({ amount: 80, discountType: 'FIXED', discountValue: 10 }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockCreateLink).not.toHaveBeenCalled();
  });

  it('a team member without the discount permission is refused (403)', async () => {
    mockResolveActor.mockResolvedValue(teamMember());
    mockCheckPermission.mockResolvedValue(false);
    const res = makeRes();
    await createPaymentLink(makeReq({ amount: 80, discountType: 'FIXED', discountValue: 20 }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockCreateLink).not.toHaveBeenCalled();
  });

  it('a team member with the permission but over the workspace cap is refused', async () => {
    mockResolveActor.mockResolvedValue(teamMember());
    mockPrisma.workspaceSettings.findUnique.mockResolvedValue({ staffDiscountCapType: 'PERCENT', staffDiscountCapValue: 10 });
    const res = makeRes();
    await createPaymentLink(makeReq({ amount: 50, discountType: 'PERCENT', discountValue: 50 }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockCreateLink).not.toHaveBeenCalled();
  });

  it('a split link compares card + cash against the floor', async () => {
    const res = makeRes();
    await createPaymentLink(makeReq({ amount: 60, cashAmountCents: 4000 }), res);
    expect(res.json.mock.calls[0][0].isSplitPayment).toBe(true);
  });

  it('a split link whose card + cash is below the catalog price is refused', async () => {
    const res = makeRes();
    await createPaymentLink(makeReq({ amount: 20, cashAmountCents: 1000 }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockCreateLink).not.toHaveBeenCalled();
  });

  it('an ad hoc link with no items (collect a payment) has no catalog floor', async () => {
    const res = makeRes();
    await createPaymentLink(makeReq({ itemIds: [], amount: 12.5 }), res);
    expect(res.json.mock.calls[0][0].amount).toBe(12.5);
    expect(mockPrisma.item.findMany).not.toHaveBeenCalled();
  });

  it('a fractional-cent amount is still rejected', async () => {
    const res = makeRes();
    await createPaymentLink(makeReq({ itemIds: [], amount: 10.005 }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('createPaymentLink expiresInSeconds (P1-6/8)', () => {
  it.each([59, 604801, 1.5, -5, '3600', Number.NaN])('rejects %p', async (bad) => {
    const res = makeRes();
    await createPaymentLink(makeReq({ expiresInSeconds: bad as any }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].code).toBe('INVALID_EXPIRY');
    expect(mockCreateLink).not.toHaveBeenCalled();
  });

  it('accepts the bounds and stores the requested expiry on the link row', async () => {
    for (const secs of [60, 7 * 24 * 60 * 60]) {
      mockPrisma.pOSPaymentLink.create.mockClear();
      const before = Date.now();
      const res = makeRes();
      await createPaymentLink(makeReq({ expiresInSeconds: secs }), res);
      expect(res.json.mock.calls[0][0].linkId).toBeDefined();
      const expiresAt = mockPrisma.pOSPaymentLink.create.mock.calls[0][0].data.expiresAt as Date;
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + secs * 1000);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + secs * 1000);
    }
  });

  it('omitted keeps the 24 hour default', async () => {
    const before = Date.now();
    await createPaymentLink(makeReq(), makeRes());
    const expiresAt = mockPrisma.pOSPaymentLink.create.mock.calls[0][0].data.expiresAt as Date;
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 24 * 3600 * 1000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 24 * 3600 * 1000);
  });
});

describe('createPaymentLinkInternal orphaned link cleanup', () => {
  const opts = {
    organizerId: 'org-1',
    stripeConnectId: null,
    subscriptionTier: 'SIMPLE',
    saleId: 'sale-1',
    itemIds: ['i1'],
    amount: 100,
    squareOnboarded: true,
    squareMerchantId: 'merchant-1',
  };

  it('cancels the Square link when the POSPaymentLink row cannot be saved, then rethrows', async () => {
    mockPrisma.pOSPaymentLink.create.mockRejectedValue(new Error('db down'));
    await expect(createPaymentLinkInternal(opts)).rejects.toThrow('db down');
    expect(mockDeleteLink).toHaveBeenCalledWith({ organizerId: 'org-1', paymentLinkId: 'pl-1' });
  });

  it('a link that cannot be cancelled is reported to Sentry, and the original error still surfaces', async () => {
    mockPrisma.pOSPaymentLink.create.mockRejectedValue(new Error('db down'));
    mockDeleteLink.mockResolvedValue({ ok: false, code: 'INTERNAL_SERVER_ERROR', message: 'x' });
    const Sentry = jest.requireMock('@sentry/node');
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(createPaymentLinkInternal(opts)).rejects.toThrow('db down');
    spy.mockRestore();
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it('a normal creation never cancels anything', async () => {
    const result = await createPaymentLinkInternal(opts);
    expect(result.linkId).toBeDefined();
    expect(mockDeleteLink).not.toHaveBeenCalled();
  });
});
