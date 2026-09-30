/**
 * reservationController (2026-09-29), Crew Invasion per-member redemption:
 *   - releaseInvoice / releaseInvoiceById give the member's redemption back when an UNPAID invoice is
 *     cancelled, after the cancel transaction committed, and never for a refused or already-paid one
 *   - batchUpdateHolds CHECKOUT_LINK never applies the crew discount (a payment link can span several
 *     shoppers and is recorded at list price), says so in the response, and points the organizer at
 *     the per-shopper hold invoice when a shopper in the batch had a discount available
 * Prisma and every collaborator are mocks.
 */

const order: string[] = [];

var mockPrisma: any = {
  itemReservation: { findUnique: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  holdInvoice: { findUnique: jest.fn(), update: jest.fn() },
  organizer: { findUnique: jest.fn() },
  workspaceMember: { findFirst: jest.fn() },
  item: { updateMany: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

var mockReleaseForInvoice = jest.fn();
var mockApplyCrew = jest.fn();
var mockCountEligible = jest.fn();
jest.mock('../services/crewInvasionRedemptionService', () => ({
  applyCrewInvasionDiscount: (...a: any[]) => mockApplyCrew(...a),
  releaseCrewInvasionRedemption: jest.fn(),
  linkCrewInvasionRedemptionToInvoice: jest.fn(),
  releaseCrewInvasionRedemptionsForInvoice: (...a: any[]) => mockReleaseForInvoice(...a),
  countCrewDiscountEligibleShoppers: (...a: any[]) => mockCountEligible(...a),
}));

var mockExpire = jest.fn();
jest.mock('../utils/expireCheckoutSession', () => ({
  expireCheckoutSessionSafely: (...a: any[]) => mockExpire(...a),
  retrieveCheckoutSessionAcrossAccounts: jest.fn(),
}));
var mockCreateLink = jest.fn();
jest.mock('../controllers/posController', () => ({ createPaymentLinkInternal: (...a: any[]) => mockCreateLink(...a) }));
// Money review P1-13 (2026-09-29): CHECKOUT_LINK claims each item through commitItemSale before creating the link.
jest.mock('../services/itemSaleGuard', () => {
  class ItemAlreadyCommittedError extends Error {}
  return { commitItemSale: jest.fn().mockResolvedValue(undefined), ItemAlreadyCommittedError };
});
jest.mock('../services/crewInvasionService', () => ({ checkCrewInvasion: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/loyaltyService', () => ({ awardStamp: jest.fn().mockResolvedValue(undefined) }));
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
jest.mock('../services/holdInvoiceSquareCheckoutHelper', () => ({
  createHoldInvoiceSquareCheckout: jest.fn(),
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
jest.mock('../lib/socket', () => ({ getIO: jest.fn(() => ({ to: jest.fn().mockReturnValue({ emit: jest.fn() }) })) }));

import { releaseInvoice, releaseInvoiceById, batchUpdateHolds } from '../controllers/reservationController';

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

function txMock() {
  return {
    // Money review P0-2 (2026-09-29): the cancel flip is now a guarded updateMany (WHERE status = PENDING).
    holdInvoice: { updateMany: jest.fn().mockImplementation(async () => { order.push('tx:cancel'); return { count: 1 }; }) },
    item: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    itemReservation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    notification: { create: jest.fn().mockResolvedValue({}) },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  order.length = 0;
  mockReleaseForInvoice.mockImplementation(async () => { order.push('release'); return 1; });
  mockExpire.mockResolvedValue({ stillPayable: false, state: 'EXPIRED' });
  mockPrisma.$transaction.mockImplementation(async (cb: any) => { const r = await cb(txMock()); order.push('tx:commit'); return r; });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('releaseInvoice: crew redemption restore', () => {
  const invoice = (over: any = {}) => ({
    id: 'inv_1', status: 'PENDING', shopperUserId: 'shopper-1', organizerUserId: 'org-user',
    itemIds: ['i1'], stripeSessionId: null, stripeAccountId: null, totalAmount: 1350, ...over,
  });
  const reservationRow = (inv: any) => ({
    id: 'res_1', userId: 'shopper-1',
    item: { id: 'i1', title: 'Lamp', sale: { organizer: { id: 'org_1', stripeConnectId: null } } },
    invoice: null, invoiceRel: inv, user: { id: 'shopper-1', email: 's@example.com', name: 'Sam' },
  });
  const req = (userId = 'shopper-1') => ({ params: { id: 'res_1' }, user: { id: userId } } as any);

  it('the shopper cancelling their own unpaid payment request gives the discount back, after the commit', async () => {
    mockPrisma.itemReservation.findUnique.mockResolvedValue(reservationRow(invoice()));
    mockPrisma.organizer.findUnique.mockResolvedValue(null);
    const res = makeRes();
    await releaseInvoice(req(), res);
    expect(mockReleaseForInvoice).toHaveBeenCalledTimes(1);
    expect(mockReleaseForInvoice).toHaveBeenCalledWith('inv_1');
    expect(order).toEqual(['tx:cancel', 'tx:commit', 'release']);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Invoice released and hold reactivated' }));
  });

  it('does not restore for a caller who is neither the shopper nor the sale organizer (403)', async () => {
    mockPrisma.itemReservation.findUnique.mockResolvedValue(reservationRow(invoice()));
    mockPrisma.organizer.findUnique.mockResolvedValue(null);
    const res = makeRes();
    await releaseInvoice(req('stranger'), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockReleaseForInvoice).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not restore for an invoice that is no longer PENDING (already paid or cancelled, 409)', async () => {
    mockPrisma.itemReservation.findUnique.mockResolvedValue(reservationRow(invoice({ status: 'PAID' })));
    mockPrisma.organizer.findUnique.mockResolvedValue(null);
    const res = makeRes();
    await releaseInvoice(req(), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockReleaseForInvoice).not.toHaveBeenCalled();
  });

  it('does not restore when Stripe says the session was already paid (409, payment kept)', async () => {
    mockPrisma.itemReservation.findUnique.mockResolvedValue(reservationRow(invoice({ stripeSessionId: 'cs_1' })));
    mockPrisma.organizer.findUnique.mockResolvedValue(null);
    mockExpire.mockResolvedValue({ stillPayable: false, state: 'PAID' });
    const res = makeRes();
    await releaseInvoice(req(), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockReleaseForInvoice).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not restore when the payment link could not be closed (502, request left in place)', async () => {
    mockPrisma.itemReservation.findUnique.mockResolvedValue(reservationRow(invoice({ stripeSessionId: 'cs_1' })));
    mockPrisma.organizer.findUnique.mockResolvedValue(null);
    mockExpire.mockResolvedValue({ stillPayable: true, state: 'OPEN' });
    const res = makeRes();
    await releaseInvoice(req(), res);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(mockReleaseForInvoice).not.toHaveBeenCalled();
  });
});

describe('releaseInvoiceById: crew redemption restore', () => {
  const invoice = (over: any = {}) => ({
    id: 'inv_9', status: 'PENDING', shopperUserId: 'shopper-1', organizerUserId: 'org-user', reservationId: null,
    reservations: [], itemIds: [], stripeSessionId: null, stripeAccountId: null, totalAmount: 5000,
    sale: { organizer: { id: 'org_1', stripeConnectId: null } }, ...over,
  });
  const req = (userId = 'org-user') => ({ params: { invoiceId: 'inv_9' }, user: { id: userId } } as any);

  it('the organizer cancelling an unpaid register invoice gives the discount back, after the commit', async () => {
    mockPrisma.holdInvoice.findUnique.mockResolvedValue(invoice());
    const res = makeRes();
    await releaseInvoiceById(req(), res);
    expect(mockReleaseForInvoice).toHaveBeenCalledWith('inv_9');
    expect(order).toEqual(['tx:cancel', 'tx:commit', 'release']);
  });

  it('does not restore for a stranger (403) or a non-PENDING invoice (409)', async () => {
    mockPrisma.holdInvoice.findUnique.mockResolvedValue(invoice());
    mockPrisma.organizer.findUnique.mockResolvedValue(null);
    mockPrisma.workspaceMember.findFirst.mockResolvedValue(null);
    const r1 = makeRes();
    await releaseInvoiceById(req('stranger'), r1);
    expect(r1.status).toHaveBeenCalledWith(403);
    mockPrisma.holdInvoice.findUnique.mockResolvedValue(invoice({ status: 'PAID' }));
    const r2 = makeRes();
    await releaseInvoiceById(req(), r2);
    expect(r2.status).toHaveBeenCalledWith(409);
    expect(mockReleaseForInvoice).not.toHaveBeenCalled();
  });
});

describe('batchUpdateHolds CHECKOUT_LINK: crew discount is never applied to a payment link', () => {
  const hold = (id: string, itemId: string, price: number, userId: string, crewOn = true) => ({
    id, userId, expiresAt: new Date(Date.now() + 3600_000),
    user: { id: userId, name: userId, email: `${userId}@example.com` },
    item: { id: itemId, title: `Item ${itemId}`, saleId: 'sale_1', price, sale: { organizerId: 'org_1', crewInvasionEnabled: crewOn } },
  });
  const req = () => ({
    user: { id: 'org-user', roles: ['ORGANIZER'] },
    body: { ids: ['r1', 'r2'], action: 'markSold', settlementMode: 'CHECKOUT_LINK' },
  } as any);

  beforeEach(() => {
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org_1', stripeConnectId: null, subscriptionTier: 'SIMPLE', squareOnboarded: true, squareMerchantId: 'm1' });
    mockCreateLink.mockResolvedValue({ linkId: 'link_1', paymentLinkUrl: 'https://pay.example/l', qrCodeDataUrl: 'data:image/png;base64,x', amount: 30 });
    mockPrisma.item.updateMany.mockResolvedValue({ count: 2 });
    mockCountEligible.mockResolvedValue(0);
  });

  it('single shopper with a crew discount available: link is at FULL price, no redemption taken, response says so', async () => {
    mockPrisma.itemReservation.findMany.mockResolvedValue([hold('r1', 'i1', 20, 'u1'), hold('r2', 'i2', 10, 'u1')]);
    mockCountEligible.mockResolvedValue(1);
    const res = makeRes();
    await batchUpdateHolds(req(), res);
    expect(mockApplyCrew).not.toHaveBeenCalled();
    expect(mockCreateLink.mock.calls[0][0].amount).toBe(30);
    const body = res.json.mock.calls[0][0];
    expect(body.crewDiscountApplied).toBe(false);
    expect(body.crewDiscountNote).toMatch(/A shopper in this batch has a Crew Invasion discount available/);
    expect(body.crewDiscountNote).toMatch(/full price/);
    expect(body.crewDiscountNote).not.toMatch(/—/); // no em dash
    expect(mockCountEligible).toHaveBeenCalledWith('sale_1', ['u1', 'u1']);
  });

  it('multi-shopper batch: full price, and the note counts how many shoppers could use their own invoice', async () => {
    mockPrisma.itemReservation.findMany.mockResolvedValue([hold('r1', 'i1', 20, 'u1'), hold('r2', 'i2', 10, 'u2')]);
    mockCountEligible.mockResolvedValue(2);
    const res = makeRes();
    await batchUpdateHolds(req(), res);
    expect(mockApplyCrew).not.toHaveBeenCalled();
    expect(mockCreateLink.mock.calls[0][0].amount).toBe(30);
    expect(res.json.mock.calls[0][0].crewDiscountNote).toMatch(/2 shoppers in this batch have a Crew Invasion discount available/);
  });

  it('no note when nobody in the batch has a discount, but the response still states none was applied', async () => {
    mockPrisma.itemReservation.findMany.mockResolvedValue([hold('r1', 'i1', 20, 'u1'), hold('r2', 'i2', 10, 'u2')]);
    const res = makeRes();
    await batchUpdateHolds(req(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.crewDiscountApplied).toBe(false);
    expect(body.crewDiscountNote).toBeUndefined();
    expect(body.amount).toBe(30);
  });

  it('does not even look for crew discounts when the sale has Crew Invasion off', async () => {
    mockPrisma.itemReservation.findMany.mockResolvedValue([hold('r1', 'i1', 20, 'u1', false), hold('r2', 'i2', 10, 'u1', false)]);
    const res = makeRes();
    await batchUpdateHolds(req(), res);
    expect(mockCountEligible).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].crewDiscountNote).toBeUndefined();
  });
});
