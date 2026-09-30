/**
 * reservationController release paths, Square (money review P0-2, 2026-09-29).
 * releaseInvoice, releaseInvoiceById and releasePaymentLink used to flip a Square invoice/link to
 * CANCELLED and hand the items back to inventory without asking Square whether it was paid and without
 * cancelling the payment link, so the shopper could still pay it afterwards. Each now runs the shared
 * release gate FIRST:
 *   PAID  -> record the sale, answer 409, release nothing
 *   RETRY -> answer 502, invoice/link left in place
 *   CLEAR -> the release goes ahead (gate ran before the status flip)
 * The gate itself (holdInvoiceSquareRelease) has its own suite and is a mock here.
 */

const order: string[] = [];

var mockPrisma: any = {
  itemReservation: { findUnique: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  holdInvoice: { findUnique: jest.fn(), update: jest.fn() },
  organizer: { findUnique: jest.fn() },
  workspaceMember: { findFirst: jest.fn() },
  pOSPaymentLink: { findFirst: jest.fn() },
  item: { updateMany: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

var mockGate = jest.fn();
var mockRecordFromGate = jest.fn();
jest.mock('../services/holdInvoiceSquareRelease', () => ({
  prepareSquareInvoiceForRelease: (...a: any[]) => mockGate(...a),
  recordSquarePaidInvoiceFromGate: (...a: any[]) => mockRecordFromGate(...a),
}));
var mockRecordLink = jest.fn();
jest.mock('../services/posPaymentLinkRecorder', () => ({ recordPosPaymentLinkSale: (...a: any[]) => mockRecordLink(...a) }));
var mockReclaim = jest.fn();
jest.mock('../jobs/posStrandedSaleReconcileCron', () => ({ manuallyReclaimPosPaymentLink: (...a: any[]) => mockReclaim(...a) }));

var mockReleaseForInvoice = jest.fn();
jest.mock('../services/crewInvasionRedemptionService', () => ({
  applyCrewInvasionDiscount: jest.fn(),
  releaseCrewInvasionRedemption: jest.fn(),
  linkCrewInvasionRedemptionToInvoice: jest.fn(),
  releaseCrewInvasionRedemptionsForInvoice: (...a: any[]) => mockReleaseForInvoice(...a),
  countCrewDiscountEligibleShoppers: jest.fn(),
}));
var mockExpire = jest.fn();
jest.mock('../utils/expireCheckoutSession', () => ({
  expireCheckoutSessionSafely: (...a: any[]) => mockExpire(...a),
  retrieveCheckoutSessionAcrossAccounts: jest.fn(),
}));
jest.mock('../controllers/posController', () => ({ createPaymentLinkInternal: jest.fn() }));
jest.mock('../services/itemSaleGuard', () => {
  class ItemAlreadyCommittedError extends Error {}
  return { commitItemSale: jest.fn().mockResolvedValue(undefined), ItemAlreadyCommittedError };
});
jest.mock('../services/crewInvasionService', () => ({ checkCrewInvasion: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/loyaltyService', () => ({ awardStamp: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/paymentEligibilityService', () => ({ assertSaleCanAcceptPayment: jest.fn().mockResolvedValue({ blocked: false }) }));
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

import { releaseInvoice, releaseInvoiceById, releasePaymentLink } from '../controllers/reservationController';

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

function txMock() {
  return {
    holdInvoice: { updateMany: jest.fn().mockImplementation(async () => { order.push('tx:flip'); return { count: 1 }; }) },
    item: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    itemReservation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    notification: { create: jest.fn().mockResolvedValue({}) },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  order.length = 0;
  mockGate.mockImplementation(async () => { order.push('gate'); return { outcome: 'CLEAR', detail: 'link cancelled' }; });
  mockRecordFromGate.mockResolvedValue(true);
  mockRecordLink.mockResolvedValue({ recorded: true, alreadyCompleted: false });
  mockReleaseForInvoice.mockResolvedValue(1);
  mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(txMock()));
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('releaseInvoice, Square invoice', () => {
  const invoice = (over: any = {}) => ({
    id: 'inv_1', status: 'PENDING', shopperUserId: 'shopper-1', organizerUserId: 'org-user',
    itemIds: ['i1'], stripeSessionId: null, stripeAccountId: null, totalAmount: 1350,
    processor: 'SQUARE', squareOrderId: 'order_1', squarePaymentLinkId: 'link_1', squarePaymentId: null, ...over,
  });
  const reservationRow = (inv: any) => ({
    id: 'res_1', userId: 'shopper-1',
    item: { id: 'i1', title: 'Lamp', sale: { organizer: { id: 'org_1', stripeConnectId: null } } },
    invoice: null, invoiceRel: inv, user: { id: 'shopper-1', email: 's@example.com', name: 'Sam' },
  });
  const req = () => ({ params: { id: 'res_1' }, user: { id: 'shopper-1' } } as any);

  it('runs the gate (with the sale organizer) BEFORE the status flip, then releases', async () => {
    mockPrisma.itemReservation.findUnique.mockResolvedValue(reservationRow(invoice()));
    mockPrisma.organizer.findUnique.mockResolvedValue(null);
    const res = makeRes();
    await releaseInvoice(req(), res);
    expect(mockGate).toHaveBeenCalledTimes(1);
    expect(mockGate.mock.calls[0][0]).toEqual(expect.objectContaining({ organizerId: 'org_1' }));
    expect(order).toEqual(['gate', 'tx:flip']);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Invoice released and hold reactivated' }));
  });

  it('a paid Square invoice is recorded and NOT released (409)', async () => {
    mockGate.mockResolvedValue({ outcome: 'PAID', paymentId: 'sqpay_1', detail: 'order COMPLETED' });
    mockPrisma.itemReservation.findUnique.mockResolvedValue(reservationRow(invoice()));
    mockPrisma.organizer.findUnique.mockResolvedValue(null);
    const res = makeRes();
    await releaseInvoice(req(), res);
    expect(mockRecordFromGate).toHaveBeenCalledWith('inv_1', expect.objectContaining({ outcome: 'PAID' }), expect.any(String));
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockReleaseForInvoice).not.toHaveBeenCalled();
  });

  it('a link Square could not confirm cancelled leaves the invoice in place (502)', async () => {
    mockGate.mockResolvedValue({ outcome: 'RETRY', detail: 'Square unreachable' });
    mockPrisma.itemReservation.findUnique.mockResolvedValue(reservationRow(invoice()));
    mockPrisma.organizer.findUnique.mockResolvedValue(null);
    const res = makeRes();
    await releaseInvoice(req(), res);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockRecordFromGate).not.toHaveBeenCalled();
  });

  it('a non-Square invoice never touches the Square gate', async () => {
    mockPrisma.itemReservation.findUnique.mockResolvedValue(reservationRow(invoice({ processor: 'STRIPE' })));
    mockPrisma.organizer.findUnique.mockResolvedValue(null);
    await releaseInvoice(req(), makeRes());
    expect(mockGate).not.toHaveBeenCalled();
  });
});

describe('releaseInvoiceById, Square invoice', () => {
  const invoice = (over: any = {}) => ({
    id: 'inv_9', status: 'PENDING', shopperUserId: 'shopper-1', organizerUserId: 'org-user', reservationId: null,
    reservations: [], itemIds: [], stripeSessionId: null, stripeAccountId: null, totalAmount: 5000,
    processor: 'SQUARE', squareOrderId: 'order_9', squarePaymentLinkId: 'link_9', squarePaymentId: null,
    sale: { organizer: { id: 'org_1', stripeConnectId: null } }, ...over,
  });
  const req = () => ({ params: { invoiceId: 'inv_9' }, user: { id: 'org-user' } } as any);

  it('gate first, then the guarded flip', async () => {
    mockPrisma.holdInvoice.findUnique.mockResolvedValue(invoice());
    const res = makeRes();
    await releaseInvoiceById(req(), res);
    expect(mockGate.mock.calls[0][0]).toEqual(expect.objectContaining({ organizerId: 'org_1' }));
    expect(order).toEqual(['gate', 'tx:flip']);
  });

  it('paid: recorded, 409, nothing released', async () => {
    mockGate.mockResolvedValue({ outcome: 'PAID', paymentId: 'sqpay_9', detail: 'order COMPLETED' });
    mockPrisma.holdInvoice.findUnique.mockResolvedValue(invoice());
    const res = makeRes();
    await releaseInvoiceById(req(), res);
    expect(mockRecordFromGate).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('ambiguous: 502 and the invoice stays PENDING', async () => {
    mockGate.mockResolvedValue({ outcome: 'RETRY', detail: 'cancel refused' });
    mockPrisma.holdInvoice.findUnique.mockResolvedValue(invoice());
    const res = makeRes();
    await releaseInvoiceById(req(), res);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('releasePaymentLink, Square payment link', () => {
  const link = (over: any = {}) => ({
    id: 'link_row_1', processor: 'SQUARE', status: 'ACTIVE', organizerId: 'org_1',
    squareOrderId: 'order_L', squarePaymentLinkId: 'plink_L', ...over,
  });
  const req = () => ({ params: { id: 'res_1' }, user: { id: 'org-user' } } as any);

  beforeEach(() => {
    mockPrisma.itemReservation.findUnique.mockResolvedValue({ id: 'res_1', item: { id: 'i1', sale: { organizer: { id: 'org_1' } } } });
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org_1' });
    mockPrisma.pOSPaymentLink.findFirst.mockResolvedValue(link());
    mockReclaim.mockImplementation(async () => { order.push('reclaim'); return { outcome: 'released', itemsReleased: 1 }; });
  });

  it('cancels the Square link (gate) BEFORE the reclaim flips the row', async () => {
    const res = makeRes();
    await releasePaymentLink(req(), res);
    expect(mockGate.mock.calls[0][0].invoice).toEqual(
      expect.objectContaining({ processor: 'SQUARE', squareOrderId: 'order_L', squarePaymentLinkId: 'plink_L' })
    );
    expect(mockGate.mock.calls[0][0].organizerId).toBe('org_1');
    expect(order).toEqual(['gate', 'reclaim']);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ itemsReleased: 1 }));
  });

  it('a link Square shows as paid is recorded as a sale and NOT reclaimed (409)', async () => {
    mockGate.mockResolvedValue({ outcome: 'PAID', paymentId: 'sqpay_L', detail: 'order COMPLETED' });
    const res = makeRes();
    await releasePaymentLink(req(), res);
    expect(mockRecordLink).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'link_row_1' }),
      expect.objectContaining({ processor: 'SQUARE', externalPaymentId: 'sqpay_L' })
    );
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockReclaim).not.toHaveBeenCalled();
  });

  it('a recorder failure on the paid path still refuses the release', async () => {
    mockGate.mockResolvedValue({ outcome: 'PAID', paymentId: null, detail: 'order COMPLETED' });
    mockRecordLink.mockRejectedValue(new Error('db down'));
    const res = makeRes();
    await releasePaymentLink(req(), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockReclaim).not.toHaveBeenCalled();
  });

  it('an ambiguous cancel leaves the link ACTIVE (502) and reclaims nothing', async () => {
    mockGate.mockResolvedValue({ outcome: 'RETRY', detail: 'Square refused' });
    const res = makeRes();
    await releasePaymentLink(req(), res);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(mockReclaim).not.toHaveBeenCalled();
  });

  it('a Stripe-era link is untouched by the Square gate', async () => {
    mockPrisma.pOSPaymentLink.findFirst.mockResolvedValue(link({ processor: 'STRIPE' }));
    await releasePaymentLink(req(), makeRes());
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockReclaim).toHaveBeenCalledTimes(1);
  });
});
