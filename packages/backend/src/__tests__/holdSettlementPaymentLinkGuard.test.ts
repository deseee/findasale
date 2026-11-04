/**
 * 2026-11-04: holds settled twice.
 *
 * A CHECKOUT_LINK settlement moves the held item to INVOICE_ISSUED and creates an ACTIVE payment link,
 * but sets no invoiceId, so Mark Sold -> RECORD used to write a PAID cash Purchase while the shopper
 * could still pay the Square link. And a paid link never closed the hold, so it could be recorded again.
 *
 * WHAT THIS PROVES
 *   - findHoldSettlementConflict: INVOICE_ISSUED or an ACTIVE link covering the item -> PAYMENT_LINK_OPEN;
 *     SOLD, or a COMPLETED link covering an item that is no longer RESERVED -> HOLD_ALREADY_PAID;
 *     a normal RESERVED hold (even with an old completed link for a previous unit) -> no conflict
 *   - batchUpdateHolds markSold RECORD / POS_CART / CHECKOUT_LINK answer 409 with the code and write nothing
 */

const order: string[] = [];

var mockPrisma: any = {
  itemReservation: { findUnique: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  holdInvoice: { findUnique: jest.fn(), update: jest.fn() },
  organizer: { findUnique: jest.fn() },
  workspaceMember: { findFirst: jest.fn() },
  item: { updateMany: jest.fn() },
  // 2026-11-04: batchUpdateHolds markSold reads open/paid payment links (services/holdSettlementGuard.ts).
  pOSPaymentLink: { findMany: jest.fn().mockResolvedValue([]) },
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
// 2026-10-25: non-outreach mail (notifications, hold invoices, auction winners, reminders) rides the Resend rail.
jest.mock('../lib/transactionalEmailService', () => ({ transactionalEmailService: { emails: { send: jest.fn().mockResolvedValue({ sent: true }) } } }));
jest.mock('../lib/emailService', () => ({ emailService: { emails: { send: jest.fn().mockResolvedValue({ sent: true }) } } }));
jest.mock('../services/suppressionService', () => ({ suppressionService: { isHardSuppressed: jest.fn().mockResolvedValue(false) } }));
jest.mock('../lib/socket', () => ({ getIO: jest.fn(() => ({ to: jest.fn().mockReturnValue({ emit: jest.fn() }) })) }));

jest.mock('../services/cashFeeService', () => ({
  resolveCashCommissionRate: jest.fn(async () => 0.06),
  cashCommissionOn: jest.fn(() => 0),
  accrueCashFeeBalance: jest.fn(async () => undefined),
  roundMoney: (n: number) => Math.round(n * 100) / 100,
}));

import { batchUpdateHolds } from '../controllers/reservationController';
import { findHoldSettlementConflict } from '../services/holdSettlementGuard';

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const hold = (id: string, itemId: string, itemStatus: string) => ({
  id, userId: 'u1', status: 'CONFIRMED', expiresAt: new Date(Date.now() + 3600_000), invoiceId: null, invoiceClaimedAt: null,
  user: { id: 'u1', name: 'u1', email: 'u1@example.com', explorerRank: 'INITIATE' },
  item: { id: itemId, title: `Item ${itemId}`, saleId: 'sale_1', price: 20, status: itemStatus, sale: { organizerId: 'org_1', crewInvasionEnabled: false } },
});

describe('findHoldSettlementConflict', () => {
  const db = (links: Array<{ itemIds: string[]; status: string }>) => ({ pOSPaymentLink: { findMany: jest.fn().mockResolvedValue(links) } });

  it('flags an item sitting at INVOICE_ISSUED without a lookup', async () => {
    const d = db([]);
    const c = await findHoldSettlementConflict(d, 'org_1', [hold('r1', 'i1', 'INVOICE_ISSUED')]);
    expect(c?.code).toBe('PAYMENT_LINK_OPEN');
    expect(d.pOSPaymentLink.findMany).not.toHaveBeenCalled();
  });

  it('flags an ACTIVE payment link that covers the held item', async () => {
    const d = db([{ itemIds: ['i9', 'i1'], status: 'ACTIVE' }]);
    expect((await findHoldSettlementConflict(d, 'org_1', [hold('r1', 'i1', 'RESERVED')]))?.code).toBe('PAYMENT_LINK_OPEN');
    expect(d.pOSPaymentLink.findMany.mock.calls[0][0].where).toMatchObject({ organizerId: 'org_1', itemIds: { hasSome: ['i1'] } });
  });

  it('flags a hold whose item was already paid', async () => {
    expect((await findHoldSettlementConflict(db([]), 'org_1', [hold('r1', 'i1', 'SOLD')]))?.code).toBe('HOLD_ALREADY_PAID');
    // Multi-unit item: the paid link sold one unit and the item is AVAILABLE again, but the hold stayed open.
    expect((await findHoldSettlementConflict(db([{ itemIds: ['i1'], status: 'COMPLETED' }]), 'org_1', [hold('r1', 'i1', 'AVAILABLE')]))?.code).toBe('HOLD_ALREADY_PAID');
  });

  it('lets a normal hold through', async () => {
    expect(await findHoldSettlementConflict(db([]), 'org_1', [hold('r1', 'i1', 'RESERVED')])).toBeNull();
    // A live hold keeps its item RESERVED, so an older completed link for another unit does not block it.
    expect(await findHoldSettlementConflict(db([{ itemIds: ['i1'], status: 'COMPLETED' }]), 'org_1', [hold('r1', 'i1', 'RESERVED')])).toBeNull();
  });
});

describe('batchUpdateHolds markSold refuses a hold with a live checkout link', () => {
  const req = (settlementMode: string) => ({
    user: { id: 'org-user', roles: ['ORGANIZER'] },
    body: { ids: ['r1'], action: 'markSold', settlementMode },
  } as any);

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org_1', stripeConnectId: null, subscriptionTier: 'SIMPLE', squareOnboarded: true, squareMerchantId: 'm1' });
    mockPrisma.pOSPaymentLink.findMany.mockResolvedValue([]);
  });

  it.each(['RECORD', 'POS_CART', 'CHECKOUT_LINK'])('%s: 409 PAYMENT_LINK_OPEN while the link is ACTIVE, nothing written', async (mode) => {
    mockPrisma.itemReservation.findMany.mockResolvedValue([hold('r1', 'i1', 'INVOICE_ISSUED')]);
    mockPrisma.pOSPaymentLink.findMany.mockResolvedValue([{ itemIds: ['i1'], status: 'ACTIVE' }]);
    const res = makeRes();
    await batchUpdateHolds(req(mode), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].code).toBe('PAYMENT_LINK_OPEN');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockCreateLink).not.toHaveBeenCalled();
  });

  it('RECORD: 409 HOLD_ALREADY_PAID once the link was paid', async () => {
    mockPrisma.itemReservation.findMany.mockResolvedValue([hold('r1', 'i1', 'AVAILABLE')]);
    mockPrisma.pOSPaymentLink.findMany.mockResolvedValue([{ itemIds: ['i1'], status: 'COMPLETED' }]);
    const res = makeRes();
    await batchUpdateHolds(req('RECORD'), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].code).toBe('HOLD_ALREADY_PAID');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('RECORD: the in-transaction re-check stops a link created after the first check', async () => {
    mockPrisma.itemReservation.findMany.mockResolvedValue([hold('r1', 'i1', 'RESERVED')]);
    const tx = {
      itemReservation: { findMany: jest.fn().mockResolvedValue([hold('r1', 'i1', 'INVOICE_ISSUED')]), updateMany: jest.fn() },
      pOSPaymentLink: { findMany: jest.fn().mockResolvedValue([{ itemIds: ['i1'], status: 'ACTIVE' }]) },
      purchase: { create: jest.fn() },
    };
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(tx));
    const res = makeRes();
    await batchUpdateHolds(req('RECORD'), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].code).toBe('PAYMENT_LINK_OPEN');
    expect(tx.itemReservation.updateMany).not.toHaveBeenCalled();
    expect(tx.purchase.create).not.toHaveBeenCalled();
  });
});
