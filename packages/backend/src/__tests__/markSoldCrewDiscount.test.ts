/**
 * reservationController.markSoldAndCreateInvoice: Crew Invasion redemption (2026-09-29).
 * Prisma and collaborators are mocked; NOT EXECUTED when written (jest cannot run on the
 * authoring device), CI is the first real run.
 *
 * Covers: the shopper's crew discount is applied server-side to the held items' prices BEFORE the
 * platform fee is computed, the invoice carries the discounted total and a discount line, the
 * code is consumed only while an invoice exists (released on every failure path), and an
 * explicit bad code is a clear 400 that also releases the hold claim.
 */

var mockPrisma: any = {
  itemReservation: { findUnique: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  holdInvoice: { findFirst: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

var mockApplyCrew = jest.fn();
var mockReleaseCrew = jest.fn();
var mockLinkCrew = jest.fn();
jest.mock('../services/crewInvasionRedemptionService', () => ({
  applyCrewInvasionDiscount: (...args: any[]) => mockApplyCrew(...args),
  releaseCrewInvasionRedemption: (...args: any[]) => mockReleaseCrew(...args),
  linkCrewInvasionRedemptionToInvoice: (...args: any[]) => mockLinkCrew(...args),
  releaseCrewInvasionRedemptionsForInvoice: jest.fn(),
  countCrewDiscountEligibleShoppers: jest.fn().mockResolvedValue(0),
}));

jest.mock('../services/crewInvasionService', () => ({ checkCrewInvasion: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/loyaltyService', () => ({ awardStamp: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../controllers/posController', () => ({ createPaymentLinkInternal: jest.fn() }));

jest.mock('../services/paymentEligibilityService', () => ({
  assertSaleCanAcceptPayment: jest.fn().mockResolvedValue({ blocked: false }),
}));
jest.mock('../services/holdInvoiceClaim', () => {
  class InvoiceClaimLostError extends Error {}
  return {
    invoiceableWhere: jest.fn(() => ({})),
    isInvoicedOrClaimed: jest.fn(() => false),
    releaseDeadInvoiceAnchors: jest.fn().mockResolvedValue(undefined),
    InvoiceClaimLostError,
  };
});

var mockCreateSquareCheckout = jest.fn();
jest.mock('../services/holdInvoiceSquareCheckoutHelper', () => ({
  createHoldInvoiceSquareCheckout: (...args: any[]) => mockCreateSquareCheckout(...args),
  generateHoldInvoiceId: jest.fn(() => 'hold-invoice-test-id'),
}));
jest.mock('../services/squareCheckoutLinkService', () => ({ deleteSquareCheckoutLink: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/squarePaymentService', () => {
  class SquareOnboardingIncompleteError extends Error {}
  return { SquareOnboardingIncompleteError };
});

jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../lib/emailService', () => ({ emailService: { emails: { send: jest.fn().mockResolvedValue({ sent: true }) } } }));
jest.mock('../services/suppressionService', () => ({ suppressionService: { isHardSuppressed: jest.fn().mockResolvedValue(false) } }));
jest.mock('../lib/socket', () => ({
  getIO: jest.fn(() => ({ to: jest.fn().mockReturnValue({ emit: jest.fn() }) })),
}));

import { markSoldAndCreateInvoice } from '../controllers/reservationController';
import { calculateInclusiveCommissionCents } from '../utils/feeCalculator';

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const makeReq = (body: any = {}) =>
  ({ params: { id: 'res-1' }, body, user: { id: 'org-user-1', roles: ['ORGANIZER'] } } as any);

const USED_AT = new Date('2026-09-29T12:00:00Z');
const appliedCrew = (discountCents: number) => ({
  applied: true, codeId: 'code-1', code: 'CREW10-AAAA', discountPct: 10, discountCents, usedAt: USED_AT, userId: 'shopper-1',
});

const reservationRow = () => ({
  id: 'res-1',
  status: 'PENDING',
  itemId: 'item-1',
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  item: {
    id: 'item-1',
    saleId: 'sale-1',
    title: 'Oak Chair',
    price: 100,
    sale: {
      id: 'sale-1',
      title: 'Big Sale',
      status: 'PUBLISHED',
      paymentsHeldAt: null,
      organizer: {
        id: 'org-1', userId: 'org-user-1', subscriptionTier: 'SIMPLE', stripeConnectId: null,
        squareOnboarded: true, squareMerchantId: 'merchant-1', stripeOnboarded: false,
        user: { id: 'org-user-1', roleSubscriptions: [] },
      },
    },
  },
  user: { id: 'shopper-1', email: 'shopper@example.com', name: 'Shopper' },
});

let txClient: any;

beforeEach(() => {
  jest.clearAllMocks();
  Object.values(mockPrisma).forEach((m: any) => {
    if (typeof m.mockReset === 'function') m.mockReset();
    else Object.values(m).forEach((fn: any) => fn.mockReset());
  });
  mockApplyCrew.mockReset();
  mockApplyCrew.mockResolvedValue({ applied: false });
  mockReleaseCrew.mockReset();
  mockReleaseCrew.mockResolvedValue(undefined);
  mockCreateSquareCheckout.mockReset();
  mockCreateSquareCheckout.mockResolvedValue({ ok: true, url: 'https://square.link/x', paymentLinkId: 'pl-1', orderId: 'ord-1' });

  txClient = {
    holdInvoice: { create: jest.fn(async ({ data }: any) => ({ ...data })) },
    itemReservation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    item: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(txClient));
  mockPrisma.itemReservation.findUnique.mockResolvedValue(reservationRow());
  mockPrisma.itemReservation.findMany.mockResolvedValue([
    { id: 'res-1', expiresAt: new Date(Date.now() + 60 * 60 * 1000), item: { id: 'item-1', price: 100, title: 'Oak Chair' } },
  ]);
  mockPrisma.itemReservation.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.holdInvoice.findFirst.mockResolvedValue(null);
});

describe('markSoldAndCreateInvoice Crew Invasion redemption', () => {
  it('without a crew code the price and fee are unchanged', async () => {
    const res = makeRes();
    await markSoldAndCreateInvoice(makeReq(), res);
    expect(mockCreateSquareCheckout.mock.calls[0][0].amountCents).toBe(10000);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].crewInvasionDiscount).toBeNull();
    expect(mockReleaseCrew).not.toHaveBeenCalled();
  });

  it('discounts the held items server-side and charges the platform fee on the discounted price', async () => {
    mockApplyCrew.mockResolvedValue(appliedCrew(1000));
    const res = makeRes();
    await markSoldAndCreateInvoice(makeReq(), res);

    const applyArgs = mockApplyCrew.mock.calls[0][0];
    expect(applyArgs.saleId).toBe('sale-1');
    expect(applyArgs.shopperUserId).toBe('shopper-1');
    expect(applyArgs.eligibleBaseCents).toBe(10000); // Item.price, never a client amount
    expect(applyArgs.chargeableTotalCents).toBe(10000);

    const link = mockCreateSquareCheckout.mock.calls[0][0];
    expect(link.amountCents).toBe(9000);
    expect(link.appFeeCents).toBe(calculateInclusiveCommissionCents(9000, 'SIMPLE', 'ONLINE'));

    const data = txClient.holdInvoice.create.mock.calls[0][0].data;
    expect(data.totalAmount).toBe(9000);
    expect(data.platformFeeAmount).toBe(calculateInclusiveCommissionCents(9000, 'SIMPLE', 'ONLINE'));

    const body = res.json.mock.calls[0][0];
    expect(res.status).toHaveBeenCalledWith(201);
    expect(body.totalAmount).toBe(90);
    expect(body.subtotalAmount).toBe(100);
    expect(body.crewInvasionDiscount).toEqual({ code: 'CREW10-AAAA', discountPct: 10, amountOff: 10 });
    expect(mockReleaseCrew).not.toHaveBeenCalled(); // invoice exists: the code stays consumed
    expect(mockLinkCrew).toHaveBeenCalledTimes(1); // and the member's redemption is linked to the invoice
  });

  it('forwards an explicit organizer-typed code to the redemption step', async () => {
    mockApplyCrew.mockResolvedValue(appliedCrew(1000));
    const res = makeRes();
    await markSoldAndCreateInvoice(makeReq({ crewInvasionCode: 'CREW10-AAAA' }), res);
    expect(mockApplyCrew.mock.calls[0][0].providedCode).toBe('CREW10-AAAA');
  });

  it('a bad explicit code is a clear 400, releases the hold claim and creates nothing', async () => {
    mockApplyCrew.mockResolvedValue({
      applied: false,
      rejection: { status: 400, code: 'CREW_CODE_EXPIRED', message: 'That crew discount code has expired.' },
    });
    const res = makeRes();
    await markSoldAndCreateInvoice(makeReq({ crewInvasionCode: 'CREW10-AAAA' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'That crew discount code has expired.', code: 'CREW_CODE_EXPIRED' });
    expect(mockCreateSquareCheckout).not.toHaveBeenCalled();
    // the claim taken earlier is released (token-scoped clear of invoiceClaimToken)
    const clears = mockPrisma.itemReservation.updateMany.mock.calls.filter(
      (c: any[]) => c[0].data && c[0].data.invoiceClaimToken === null
    );
    expect(clears.length).toBeGreaterThan(0);
  });

  it('releases the redemption when the Square payment link is declined', async () => {
    mockApplyCrew.mockResolvedValue(appliedCrew(1000));
    mockCreateSquareCheckout.mockResolvedValue({ ok: false, message: 'declined' });
    const res = makeRes();
    await markSoldAndCreateInvoice(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(402);
    expect(mockReleaseCrew).toHaveBeenCalledTimes(1);
    expect(mockReleaseCrew).toHaveBeenCalledWith('code-1', USED_AT, 'shopper-1');
  });

  it('releases the redemption when the payment link call throws', async () => {
    mockApplyCrew.mockResolvedValue(appliedCrew(1000));
    mockCreateSquareCheckout.mockRejectedValue(new Error('network'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = makeRes();
    await markSoldAndCreateInvoice(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockReleaseCrew).toHaveBeenCalledWith('code-1', USED_AT, 'shopper-1');
    spy.mockRestore();
  });

  it('releases the redemption when the invoice transaction fails, exactly once', async () => {
    mockApplyCrew.mockResolvedValue(appliedCrew(1000));
    mockPrisma.$transaction.mockRejectedValue(new Error('db down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = makeRes();
    await markSoldAndCreateInvoice(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockReleaseCrew).toHaveBeenCalledTimes(1);
    expect(mockReleaseCrew).toHaveBeenCalledWith('code-1', USED_AT, 'shopper-1');
    spy.mockRestore();
  });
});
