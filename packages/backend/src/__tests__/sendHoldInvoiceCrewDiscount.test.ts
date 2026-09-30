/**
 * sendHoldInvoice: Square-era gate + Crew Invasion discount (2026-09-29). Prisma and every
 * collaborator are mocked; NOT EXECUTED when written (jest cannot run on the authoring device),
 * CI is the first real run.
 *
 * Covers controllers/posController.ts sendHoldInvoice:
 *   - the gate is the createPaymentLink one: squareOnboarded && squareMerchantId, else 400
 *     SQUARE_NOT_CONNECTED, and it fires BEFORE any item is claimed (no stranded INVOICE_ISSUED)
 *   - the crew discount is computed server-side from item prices, applied before the platform
 *     fee, so the fee is charged on the discounted price
 *   - the redemption is released when the payment link or the invoice row cannot be created
 *   - an explicit bad code is a clear 400 raised before anything is claimed
 *   - a register (cashier) discount is not stacked with the crew discount
 */

var mockPrisma: any = {
  itemReservation: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  holdInvoice: { create: jest.fn(), aggregate: jest.fn() },
  // Money review (2026-09-29): sale-scoped item validation + prior-status snapshot + rollback.
  item: { findMany: jest.fn(), updateMany: jest.fn() },
  // resolvePosDiscount reads the workspace's discount cap for a team member.
  workspaceSettings: { findUnique: jest.fn() },
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

jest.mock('@sentry/node', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));

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

var mockDeleteSquareLink = jest.fn();
jest.mock('../services/squareCheckoutLinkService', () => ({
  createSquareCheckoutLink: jest.fn(),
  deleteSquareCheckoutLink: (...args: any[]) => mockDeleteSquareLink(...args),
}));

var mockResolveActor = jest.fn();
jest.mock('../utils/posAuth', () => ({
  resolveOrganizerOrTeamMember: (...args: any[]) => mockResolveActor(...args),
}));

var mockCommitItemSale = jest.fn();
jest.mock('../services/itemSaleGuard', () => {
  class ItemAlreadyCommittedError extends Error {}
  return {
    commitItemSale: (...args: any[]) => mockCommitItemSale(...args),
    ItemAlreadyCommittedError,
  };
});

jest.mock('../services/holdInvoiceClaim', () => ({
  invoiceableWhere: jest.fn(() => ({})),
  isInvoicedOrClaimed: jest.fn(() => false),
  releaseDeadInvoiceAnchors: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/holdInvoicePaymentRecorder', () => ({
  markHoldInvoicePaid: jest.fn().mockResolvedValue({ recorded: true, alreadyPaid: false, deadInvoice: false }),
}));

var mockCreateSquareCheckout = jest.fn();
jest.mock('../services/holdInvoiceSquareCheckoutHelper', () => ({
  createHoldInvoiceSquareCheckout: (...args: any[]) => mockCreateSquareCheckout(...args),
  generateHoldInvoiceId: jest.fn(() => 'hold-invoice-test-id'),
}));

var mockApplyCrew = jest.fn();
var mockValidateCrew = jest.fn();
var mockReleaseCrew = jest.fn();
var mockLinkCrew = jest.fn();
jest.mock('../services/crewInvasionRedemptionService', () => ({
  applyCrewInvasionDiscount: (...args: any[]) => mockApplyCrew(...args),
  validateCrewInvasionCode: (...args: any[]) => mockValidateCrew(...args),
  releaseCrewInvasionRedemption: (...args: any[]) => mockReleaseCrew(...args),
  linkCrewInvasionRedemptionToInvoice: (...args: any[]) => mockLinkCrew(...args),
}));

jest.mock('../lib/socket', () => ({
  getIO: jest.fn(() => ({ to: jest.fn().mockReturnValue({ emit: jest.fn() }) })),
}));
jest.mock('../lib/notificationService', () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../lib/transactionalEmailService', () => ({
  transactionalEmailService: { emails: { send: jest.fn().mockResolvedValue({ sent: true }) } },
}));
jest.mock('../services/emailTemplateService', () => ({
  buildEmail: jest.fn(() => '<html></html>'),
}));

import { sendHoldInvoice } from '../controllers/posController';
import { calculateInclusiveCommissionCents } from '../utils/feeCalculator';

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const squareActor = (over: any = {}) => ({
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

const makeReq = (body: any = {}) =>
  ({ params: { reservationId: 'res-1' }, body: { deliverVia: 'EMAIL', ...body }, user: { id: 'org-user-1', roles: ['ORGANIZER'] } } as any);

const reservationRow = () => ({
  id: 'res-1',
  itemId: 'item-1',
  userId: 'shopper-1',
  status: 'PENDING',
  invoiceId: null,
  invoiceClaimToken: null,
  invoiceClaimedAt: null,
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  item: { id: 'item-1', title: 'Oak Chair', price: 100, photoUrls: [], sale: { id: 'sale-1', organizerId: 'org-1' } },
  user: { id: 'shopper-1', email: 'shopper@example.com', name: 'Shopper' },
});

const USED_AT = new Date('2026-09-29T12:00:00Z');
const appliedCrew = (discountCents: number) => ({
  applied: true, codeId: 'code-1', code: 'CREW10-AAAA', discountPct: 10, discountCents, usedAt: USED_AT, userId: 'shopper-1',
});

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveActor.mockReset();
  mockCommitItemSale.mockReset();
  mockCommitItemSale.mockResolvedValue(undefined);
  mockCreateSquareCheckout.mockReset();
  mockCreateSquareCheckout.mockResolvedValue({ ok: true, url: 'https://square.link/x', paymentLinkId: 'pl-1', orderId: 'ord-1' });
  mockApplyCrew.mockReset();
  mockApplyCrew.mockResolvedValue({ applied: false });
  mockValidateCrew.mockReset();
  mockReleaseCrew.mockReset();
  mockReleaseCrew.mockResolvedValue(undefined);
  Object.values(mockPrisma).forEach((m: any) => Object.values(m).forEach((fn: any) => fn.mockReset()));
  mockResolveActor.mockResolvedValue(squareActor());
  mockPrisma.itemReservation.findUnique.mockResolvedValue(reservationRow());
  mockPrisma.itemReservation.findMany.mockResolvedValue([]);
  mockPrisma.itemReservation.update.mockResolvedValue({});
  mockPrisma.itemReservation.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.holdInvoice.create.mockImplementation(async ({ data }: any) => ({ ...data, expiresAt: data.expiresAt }));
  mockPrisma.holdInvoice.aggregate.mockResolvedValue({ _sum: { cashAmountCents: 0 } });
  // The sale-scoped lookup: only ids that belong to sale-1 / org-1 come back. item-9 is another tenant's.
  mockPrisma.item.findMany.mockImplementation(async ({ where }: any) =>
    (where.id.in as string[])
      .filter((id) => id !== 'item-9')
      .map((id) => ({ id, price: id === 'item-1' ? 100 : 80, status: 'RESERVED' }))
  );
  mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.workspaceSettings.findUnique.mockResolvedValue(null);
  mockCheckPermission.mockReset();
  mockCheckPermission.mockResolvedValue(true);
  mockCapExceeded.mockReset();
  mockCapExceeded.mockResolvedValue(false);
  mockDeleteSquareLink.mockReset();
  mockDeleteSquareLink.mockResolvedValue({ ok: true, cancelledOrderId: 'ord-1' });
});

describe('sendHoldInvoice Square-era gate', () => {
  it('rejects an organizer with no Square account: 400 SQUARE_NOT_CONNECTED, nothing claimed', async () => {
    mockResolveActor.mockResolvedValue(squareActor({ squareOnboarded: false, squareMerchantId: null, stripeConnectId: 'acct_123' }));
    const res = makeRes();
    await sendHoldInvoice(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].code).toBe('SQUARE_NOT_CONNECTED');
    expect(mockCommitItemSale).not.toHaveBeenCalled();
    expect(mockPrisma.itemReservation.findUnique).not.toHaveBeenCalled();
  });

  it('rejects squareOnboarded without a merchant id', async () => {
    mockResolveActor.mockResolvedValue(squareActor({ squareMerchantId: null }));
    const res = makeRes();
    await sendHoldInvoice(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].code).toBe('SQUARE_NOT_CONNECTED');
  });

  it('no longer asks the resolver to accept "any" processor (requireStripe false)', async () => {
    const res = makeRes();
    await sendHoldInvoice(makeReq(), res);
    expect(mockResolveActor.mock.calls[0][2]).toEqual({ requireStripe: false });
  });

  it('a Square organizer proceeds to create the invoice', async () => {
    const res = makeRes();
    await sendHoldInvoice(makeReq(), res);
    expect(mockCreateSquareCheckout).toHaveBeenCalledTimes(1);
    expect(mockPrisma.holdInvoice.create).toHaveBeenCalledTimes(1);
    expect(res.json.mock.calls[0][0].status).toBe('SENT');
  });
});

describe('sendHoldInvoice Crew Invasion discount', () => {
  it('without a crew code the price and fee are unchanged', async () => {
    const res = makeRes();
    await sendHoldInvoice(makeReq(), res);
    const args = mockCreateSquareCheckout.mock.calls[0][0];
    expect(args.amountCents).toBe(10000);
    expect(args.appFeeCents).toBe(calculateInclusiveCommissionCents(10000, 'SIMPLE', 'ONLINE'));
    expect(res.json.mock.calls[0][0].crewInvasionDiscount).toBeNull();
  });

  it('applies 10 percent server-side and charges the platform fee on the discounted price', async () => {
    mockApplyCrew.mockResolvedValue(appliedCrew(1000));
    const res = makeRes();
    await sendHoldInvoice(makeReq(), res);

    const applyArgs = mockApplyCrew.mock.calls[0][0];
    expect(applyArgs.saleId).toBe('sale-1');
    expect(applyArgs.shopperUserId).toBe('shopper-1');
    expect(applyArgs.eligibleBaseCents).toBe(10000); // from Item.price, never a client amount
    expect(applyArgs.chargeableTotalCents).toBe(10000);
    expect(applyArgs.otherDiscountCents).toBe(0);

    const linkArgs = mockCreateSquareCheckout.mock.calls[0][0];
    expect(linkArgs.amountCents).toBe(9000);
    expect(linkArgs.appFeeCents).toBe(calculateInclusiveCommissionCents(9000, 'SIMPLE', 'ONLINE'));

    const invoiceData = mockPrisma.holdInvoice.create.mock.calls[0][0].data;
    expect(invoiceData.totalAmount).toBe(9000);
    expect(invoiceData.platformFeeAmount).toBe(calculateInclusiveCommissionCents(9000, 'SIMPLE', 'ONLINE'));

    const body = res.json.mock.calls[0][0];
    expect(body.totalAmountCents).toBe(9000);
    expect(body.crewInvasionDiscount).toEqual({ code: 'CREW10-AAAA', discountPct: 10, amountOffCents: 1000 });
    expect(mockReleaseCrew).not.toHaveBeenCalled(); // invoice exists: code stays consumed
    expect(mockLinkCrew).toHaveBeenCalledTimes(1); // and the member's redemption is linked to the invoice
  });

  it('cash that covers more than the discounted total clamps to it and skips the payment link', async () => {
    mockApplyCrew.mockResolvedValue(appliedCrew(1000));
    const res = makeRes();
    await sendHoldInvoice(makeReq({ cashAmountCents: 20000 }), res);
    // cash clamps to the discounted total (9000); nothing left on the card, so no payment link
    expect(mockCreateSquareCheckout).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].status).toBe('PAID');
    expect(res.json.mock.calls[0][0].cashAmountCents).toBe(9000);
  });

  it('prices merged held items from the database, only for holds of this shopper at this sale', async () => {
    mockApplyCrew.mockResolvedValue({ applied: false });
    mockPrisma.itemReservation.findMany.mockResolvedValue([{ itemId: 'item-2', item: { price: 80 } }]);
    const res = makeRes();
    await sendHoldInvoice(
      makeReq({ miscItems: [{ id: 'm1', itemId: 'item-2', title: 'Lamp', amount: 50 }, { id: 'm2', title: 'Custom fee', amount: 5 }] }),
      res
    );
    const q = mockPrisma.itemReservation.findMany.mock.calls[0][0];
    expect(q.where.itemId).toEqual({ in: ['item-2'] });
    expect(q.where.userId).toBe('shopper-1');
    expect(q.where.item).toEqual({ saleId: 'sale-1' });
    // base = $100 anchor + min($80 list, $50 billed) = $150. The $5 ad hoc line is not eligible.
    expect(mockApplyCrew.mock.calls[0][0].eligibleBaseCents).toBe(15000);
    expect(mockApplyCrew.mock.calls[0][0].chargeableTotalCents).toBe(15500);
  });

  it('passes a register discount as otherDiscountCents so it is not stacked', async () => {
    const res = makeRes();
    await sendHoldInvoice(makeReq({ miscItems: [{ id: 'd1', title: 'Cashier discount', amount: -3 }] }), res);
    const applyArgs = mockApplyCrew.mock.calls[0][0];
    expect(applyArgs.otherDiscountCents).toBe(300);
    expect(applyArgs.chargeableTotalCents).toBe(9700);
  });

  it('releases the redemption when the Square payment link cannot be created', async () => {
    mockApplyCrew.mockResolvedValue(appliedCrew(1000));
    mockCreateSquareCheckout.mockResolvedValue({ ok: false, message: 'declined' });
    const res = makeRes();
    await sendHoldInvoice(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(402);
    expect(mockReleaseCrew).toHaveBeenCalledWith('code-1', USED_AT, 'shopper-1');
  });

  it('releases the redemption when the payment link call throws', async () => {
    mockApplyCrew.mockResolvedValue(appliedCrew(1000));
    mockCreateSquareCheckout.mockRejectedValue(new Error('network'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = makeRes();
    await sendHoldInvoice(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockReleaseCrew).toHaveBeenCalledWith('code-1', USED_AT, 'shopper-1');
    spy.mockRestore();
  });

  it('releases the redemption when the invoice row cannot be created', async () => {
    mockApplyCrew.mockResolvedValue(appliedCrew(1000));
    mockPrisma.holdInvoice.create.mockRejectedValue(new Error('db down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = makeRes();
    await sendHoldInvoice(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockReleaseCrew).toHaveBeenCalledWith('code-1', USED_AT, 'shopper-1');
    spy.mockRestore();
  });

  it('an explicit bad code is a clear 400 before any item is claimed', async () => {
    mockValidateCrew.mockResolvedValue({
      ok: false,
      rejection: { status: 400, code: 'CREW_CODE_EXPIRED', message: 'That crew discount code has expired.' },
    });
    const res = makeRes();
    await sendHoldInvoice(makeReq({ crewInvasionCode: 'CREW10-AAAA' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'That crew discount code has expired.', code: 'CREW_CODE_EXPIRED' });
    expect(mockCommitItemSale).not.toHaveBeenCalled();
    expect(mockApplyCrew).not.toHaveBeenCalled();
  });

  it('a valid explicit code is forwarded to the redemption step', async () => {
    mockValidateCrew.mockResolvedValue({ ok: true, code: { id: 'code-1', code: 'CREW10-AAAA', discountPct: 10 } });
    mockApplyCrew.mockResolvedValue(appliedCrew(1000));
    const res = makeRes();
    await sendHoldInvoice(makeReq({ crewInvasionCode: 'CREW10-AAAA' }), res);
    expect(mockApplyCrew.mock.calls[0][0].providedCode).toBe('CREW10-AAAA');
    expect(res.json.mock.calls[0][0].crewInvasionDiscount.amountOffCents).toBe(1000);
  });
});

// ---------------------------------------------------------------------------------------------
// Money review (2026-09-29): P1-4/5 cross-tenant scope, P1-6/8 line pricing + discount permission,
// P1-7 rollback / compensation, P2 cash exposure cap.
// ---------------------------------------------------------------------------------------------

const teamMember = (over: any = {}) =>
  squareActor({ actorKind: 'TEAM_MEMBER', workspaceId: 'ws-1', workspaceRole: 'CASHIER', ...over });

describe('sendHoldInvoice cross-tenant scope (P1-4/5)', () => {
  it('a merged itemId that is not an item of this sale and organizer is a 404 and nothing is claimed', async () => {
    const res = makeRes();
    await sendHoldInvoice(makeReq({ miscItems: [{ id: 'm1', itemId: 'item-9', title: 'Other tenant item', amount: 50 }] }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].code).toBe('ITEM_NOT_FOUND');
    expect(mockCommitItemSale).not.toHaveBeenCalled();
    expect(mockCreateSquareCheckout).not.toHaveBeenCalled();
    const q = mockPrisma.item.findMany.mock.calls[0][0];
    expect(q.where.saleId).toBe('sale-1');
    expect(q.where.sale).toEqual({ organizerId: 'org-1' });
    expect(q.where.id.in).toEqual(['item-1', 'item-9']);
  });

  it('the held item cannot also be listed as an extra line', async () => {
    const res = makeRes();
    await sendHoldInvoice(makeReq({ miscItems: [{ id: 'm1', itemId: 'item-1', title: 'Again', amount: 100 }] }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockCommitItemSale).not.toHaveBeenCalled();
  });

  it('the reservation stamp for a merged item is scoped to the sale', async () => {
    const res = makeRes();
    await sendHoldInvoice(makeReq({ miscItems: [{ id: 'm1', itemId: 'item-2', title: 'Lamp', amount: 80 }] }), res);
    expect(res.json.mock.calls[0][0].status).toBe('SENT');
    const stamp = mockPrisma.itemReservation.updateMany.mock.calls[0][0];
    expect(stamp.where.itemId).toEqual({ in: ['item-2'] });
    expect(stamp.where.item).toEqual({ saleId: 'sale-1' });
  });
});

describe('sendHoldInvoice line pricing (P1-6/8)', () => {
  it('rejects a misc amount that is not a whole number of cents, before claiming anything', async () => {
    const res = makeRes();
    await sendHoldInvoice(makeReq({ miscItems: [{ id: 'm1', title: 'Fee', amount: 1.005 }] }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].code).toBe('INVALID_MISC_AMOUNT');
    expect(mockCommitItemSale).not.toHaveBeenCalled();
  });

  it('rejects NaN and absurd misc amounts', async () => {
    for (const amount of [Number.NaN, 1e9, Infinity]) {
      const res = makeRes();
      await sendHoldInvoice(makeReq({ miscItems: [{ id: 'm1', title: 'Fee', amount }] }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(mockCommitItemSale).not.toHaveBeenCalled();
  });

  it('rejects a total of zero or less (a negative line that wipes out the invoice)', async () => {
    const res = makeRes();
    await sendHoldInvoice(makeReq({ miscItems: [{ id: 'd1', title: 'Discount', amount: -100 }] }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].code).toBe('INVOICE_TOTAL_INVALID');
    expect(mockCommitItemSale).not.toHaveBeenCalled();
  });

  it('a team member without the discount permission cannot invoice with a negative line: 403', async () => {
    mockResolveActor.mockResolvedValue(teamMember());
    mockCheckPermission.mockResolvedValue(false);
    const res = makeRes();
    await sendHoldInvoice(makeReq({ miscItems: [{ id: 'd1', title: 'Discount', amount: -30 }] }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockCommitItemSale).not.toHaveBeenCalled();
    expect(mockCreateSquareCheckout).not.toHaveBeenCalled();
  });

  it('a team member without the permission cannot bill a merged item below its list price either', async () => {
    mockResolveActor.mockResolvedValue(teamMember());
    mockCheckPermission.mockResolvedValue(false);
    const res = makeRes();
    await sendHoldInvoice(makeReq({ miscItems: [{ id: 'm1', itemId: 'item-2', title: 'Lamp', amount: 10 }] }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockCommitItemSale).not.toHaveBeenCalled();
  });

  it('a team member WITH the permission may discount, within the workspace cap', async () => {
    mockResolveActor.mockResolvedValue(teamMember());
    mockCheckPermission.mockResolvedValue(true);
    mockPrisma.workspaceSettings.findUnique.mockResolvedValue({ staffDiscountCapType: 'FIXED', staffDiscountCapValue: 5 });
    const res = makeRes();
    await sendHoldInvoice(makeReq({ miscItems: [{ id: 'd1', title: 'Discount', amount: -3 }] }), res);
    expect(res.json.mock.calls[0][0].status).toBe('SENT');
    expect(mockCreateSquareCheckout.mock.calls[0][0].amountCents).toBe(9700);
  });

  it('a team member over the workspace cap is a 400', async () => {
    mockResolveActor.mockResolvedValue(teamMember());
    mockPrisma.workspaceSettings.findUnique.mockResolvedValue({ staffDiscountCapType: 'FIXED', staffDiscountCapValue: 5 });
    const res = makeRes();
    await sendHoldInvoice(makeReq({ miscItems: [{ id: 'd1', title: 'Discount', amount: -30 }] }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockCommitItemSale).not.toHaveBeenCalled();
  });

  it('a positive extra line (no discount involved) needs no permission for a team member', async () => {
    mockResolveActor.mockResolvedValue(teamMember());
    mockCheckPermission.mockResolvedValue(false);
    const res = makeRes();
    await sendHoldInvoice(makeReq({ miscItems: [{ id: 'm1', title: 'Delivery', amount: 25 }] }), res);
    expect(res.json.mock.calls[0][0].status).toBe('SENT');
    expect(mockCreateSquareCheckout.mock.calls[0][0].amountCents).toBe(12500);
  });

  it('escapes shopper-visible text in the invoice email body', async () => {
    const { buildEmail } = jest.requireMock('../services/emailTemplateService');
    buildEmail.mockClear();
    const res = makeRes();
    await sendHoldInvoice(makeReq({ miscItems: [{ id: 'm1', title: '<script>alert(1)</script>', amount: 5 }] }), res);
    const body = buildEmail.mock.calls[0][0].body as string;
    expect(body).not.toContain('<script>');
    expect(body).toContain('&lt;script&gt;');
  });
});

describe('sendHoldInvoice cash exposure cap (P2)', () => {
  it('a cash leg that would push the organizer over the $100 cap is a 400 before anything is claimed', async () => {
    mockCapExceeded.mockResolvedValue(true);
    const res = makeRes();
    await sendHoldInvoice(makeReq({ cashAmountCents: 4000 }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].code).toBe('CASH_FEE_EXPOSURE_CAP_EXCEEDED');
    expect(mockCommitItemSale).not.toHaveBeenCalled();
    expect(mockCreateSquareCheckout).not.toHaveBeenCalled();
  });

  it('counts the cash legs of other pending hold invoices toward the cap', async () => {
    mockPrisma.holdInvoice.aggregate.mockResolvedValue({ _sum: { cashAmountCents: 5000 } });
    const res = makeRes();
    await sendHoldInvoice(makeReq({ cashAmountCents: 4000 }), res);
    const { cashCommissionOn } = jest.requireActual('../services/cashFeeService');
    expect(mockCapExceeded).toHaveBeenCalledTimes(1);
    const arg = mockCapExceeded.mock.calls[0][0];
    expect(arg.organizerId).toBe('org-1');
    expect(arg.commission).toBeCloseTo(cashCommissionOn(40, 0.08) + cashCommissionOn(50, 0.08), 6);
  });

  it('a fully-cash invoice is also checked against the cap', async () => {
    mockCapExceeded.mockResolvedValue(true);
    const res = makeRes();
    await sendHoldInvoice(makeReq({ cashAmountCents: 20000 }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockCommitItemSale).not.toHaveBeenCalled();
  });

  it('no cash leg means the cap is never consulted', async () => {
    const res = makeRes();
    await sendHoldInvoice(makeReq(), res);
    expect(mockCapExceeded).not.toHaveBeenCalled();
  });
});

describe('sendHoldInvoice rollback and compensation (P1-7)', () => {
  const revertCalls = () =>
    mockPrisma.item.updateMany.mock.calls.map((c: any[]) => ({ id: c[0].where.id, guard: c[0].where.status, to: c[0].data.status }));

  it('a declined Square link puts the held item back to the status it had and releases the crew code', async () => {
    mockApplyCrew.mockResolvedValue(appliedCrew(1000));
    mockCreateSquareCheckout.mockResolvedValue({ ok: false, message: 'declined' });
    const res = makeRes();
    await sendHoldInvoice(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(402);
    expect(revertCalls()).toEqual([{ id: 'item-1', guard: 'INVOICE_ISSUED', to: 'RESERVED' }]);
    expect(mockReleaseCrew).toHaveBeenCalledTimes(1);
    expect(mockPrisma.holdInvoice.create).not.toHaveBeenCalled();
  });

  it('reverts a merged item too, and restores an AVAILABLE item as AVAILABLE', async () => {
    mockPrisma.item.findMany.mockImplementation(async ({ where }: any) =>
      (where.id.in as string[]).map((id) => ({ id, price: id === 'item-1' ? 100 : 80, status: id === 'item-2' ? 'AVAILABLE' : 'RESERVED' }))
    );
    mockCreateSquareCheckout.mockRejectedValue(new Error('network'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = makeRes();
    await sendHoldInvoice(makeReq({ miscItems: [{ id: 'm1', itemId: 'item-2', title: 'Lamp', amount: 80 }] }), res);
    spy.mockRestore();
    expect(res.status).toHaveBeenCalledWith(400);
    const reverts = revertCalls();
    expect(reverts).toHaveLength(2);
    expect(reverts).toEqual(expect.arrayContaining([
      { id: 'item-1', guard: 'INVOICE_ISSUED', to: 'RESERVED' },
      { id: 'item-2', guard: 'INVOICE_ISSUED', to: 'AVAILABLE' },
    ]));
  });

  it('a merged item that loses the claim race rolls back the already-claimed anchor and answers 409', async () => {
    const { ItemAlreadyCommittedError } = jest.requireMock('../services/itemSaleGuard');
    mockCommitItemSale.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new ItemAlreadyCommittedError('gone'));
    const res = makeRes();
    await sendHoldInvoice(makeReq({ miscItems: [{ id: 'm1', itemId: 'item-2', title: 'Lamp', amount: 80 }] }), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(revertCalls()).toEqual([{ id: 'item-1', guard: 'INVOICE_ISSUED', to: 'RESERVED' }]);
    expect(mockCreateSquareCheckout).not.toHaveBeenCalled();
  });

  it('an invoice row that cannot be saved cancels the live Square link and reverts the items exactly once', async () => {
    mockPrisma.holdInvoice.create.mockRejectedValue(new Error('db down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = makeRes();
    await sendHoldInvoice(makeReq(), res);
    spy.mockRestore();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockDeleteSquareLink).toHaveBeenCalledWith({ organizerId: 'org-1', paymentLinkId: 'pl-1' });
    // idempotent: the failure path AND the outer catch both run rollbackClaims, the revert happens once
    expect(revertCalls()).toEqual([{ id: 'item-1', guard: 'INVOICE_ISSUED', to: 'RESERVED' }]);
    expect(mockReleaseCrew).not.toHaveBeenCalled(); // no crew code in this request
  });

  it('a link that also fails to cancel is reported to Sentry and the items are still reverted', async () => {
    mockPrisma.holdInvoice.create.mockRejectedValue(new Error('db down'));
    mockDeleteSquareLink.mockResolvedValue({ ok: false, code: 'INTERNAL_SERVER_ERROR', message: 'x' });
    const Sentry = jest.requireMock('@sentry/node');
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = makeRes();
    await sendHoldInvoice(makeReq(), res);
    spy.mockRestore();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(Sentry.captureException).toHaveBeenCalled();
    expect(revertCalls()).toHaveLength(1);
  });

  it('a successful invoice never reverts anything', async () => {
    const res = makeRes();
    await sendHoldInvoice(makeReq(), res);
    expect(res.json.mock.calls[0][0].status).toBe('SENT');
    expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
    expect(mockDeleteSquareLink).not.toHaveBeenCalled();
  });

  it('a failure AFTER the invoice row exists leaves the items to the invoice (no revert)', async () => {
    mockPrisma.itemReservation.update.mockRejectedValue(new Error('stamp failed'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = makeRes();
    await sendHoldInvoice(makeReq(), res);
    spy.mockRestore();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
    expect(mockDeleteSquareLink).not.toHaveBeenCalled();
  });
});
