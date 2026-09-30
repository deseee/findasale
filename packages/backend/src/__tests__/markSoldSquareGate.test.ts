/**
 * reservationController.markSoldAndCreateInvoice, money review P1-13 (2026-09-29):
 *   - the shared eligibility gate is Square-aware: a Square-only organizer (no Stripe account) is passed
 *     the Square onboarding fields so it is no longer blocked, and a Stripe-only one is unchanged
 *   - the INVOICE_ISSUED flip is a conditional updateMany (AVAILABLE/RESERVED only) with a count check:
 *     an item sold or invoiced elsewhere in the meantime aborts the whole transaction, closes the just
 *     created Square link, releases the claim and answers 409 (never a second live link on that item).
 * Prisma and collaborators are mocks.
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
import { assertSaleCanAcceptPayment } from '../services/paymentEligibilityService';
import { deleteSquareCheckoutLink } from '../services/squareCheckoutLinkService';
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


describe('markSoldAndCreateInvoice Square-aware eligibility gate', () => {
  it('passes the Square onboarding fields so a Square-only organizer is not blocked', async () => {
    const res = makeRes();
    await markSoldAndCreateInvoice(makeReq(), res);
    const arg = (assertSaleCanAcceptPayment as jest.Mock).mock.calls[0][0];
    expect(arg.organizerSquareOnboarded).toBe(true);
    expect(arg.organizerSquareMerchantId).toBe('merchant-1');
    expect(arg.organizerStripeConnectId).toBeNull();
    expect(res.status).not.toHaveBeenCalledWith(409);
  });

  it('still surfaces a block from the gate (held sale, unpublished sale)', async () => {
    (assertSaleCanAcceptPayment as jest.Mock).mockResolvedValueOnce({
      blocked: true, status: 409, body: { message: 'This sale is no longer active.', code: 'SALE_NOT_ACTIVE' },
    });
    const res = makeRes();
    await markSoldAndCreateInvoice(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockCreateSquareCheckout).not.toHaveBeenCalled();
  });
});

describe('markSoldAndCreateInvoice item flip guard', () => {
  it('flips only AVAILABLE/RESERVED items to INVOICE_ISSUED', async () => {
    const res = makeRes();
    await markSoldAndCreateInvoice(makeReq(), res);
    expect(txClient.item.updateMany).toHaveBeenCalledTimes(1);
    expect(txClient.item.updateMany.mock.calls[0][0]).toEqual({
      where: { id: { in: ['item-1'] }, status: { in: ['AVAILABLE', 'RESERVED'] } },
      data: { status: 'INVOICE_ISSUED' },
    });
  });

  it('an item that is no longer flippable aborts with 409, closes the Square link and releases the claim', async () => {
    txClient.item.updateMany.mockResolvedValue({ count: 0 }); // sold or invoiced through another channel
    const res = makeRes();
    await markSoldAndCreateInvoice(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].message).toMatch(/no longer available/);
    expect(deleteSquareCheckoutLink).toHaveBeenCalledWith(expect.objectContaining({ paymentLinkId: 'pl-1' }));
    expect(mockPrisma.itemReservation.updateMany).toHaveBeenCalled(); // claim released (invoiceClaimToken cleared)
  });

  it('a partial flip (one of two items lost) also aborts', async () => {
    mockPrisma.itemReservation.findMany.mockResolvedValue([
      { id: 'res-1', expiresAt: new Date(Date.now() + 3600_000), item: { id: 'item-1', price: 100, title: 'Oak Chair' } },
      { id: 'res-2', expiresAt: new Date(Date.now() + 3600_000), item: { id: 'item-2', price: 50, title: 'Lamp' } },
    ]);
    txClient.itemReservation.updateMany.mockResolvedValue({ count: 2 });
    txClient.item.updateMany.mockResolvedValue({ count: 1 });
    const res = makeRes();
    await markSoldAndCreateInvoice(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
});
