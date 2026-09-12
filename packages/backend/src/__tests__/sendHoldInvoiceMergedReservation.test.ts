/**
 * sendHoldInvoice — merged item must get the same commit + invoiceId stamp as the anchor
 * (ADR-113, 2026-08-28).
 *
 * WHAT THIS SUITE EXISTS FOR: the 2026-08-25 fix (commit 4f451271b) correctly bundles a
 * merged real item's id into HoldInvoice.itemIds, so markHoldInvoicePaid sells it and creates
 * its Purchase row on payment. But two things the ANCHOR item got were never applied to the
 * MERGED item: (1) commitItemSale -> Item.status flips to INVOICE_ISSUED, and (2) the merged
 * item's own ItemReservation.invoiceId gets stamped. Without both, isInvoicedOrClaimed /
 * invoiceableWhere() (holdInvoiceClaim.ts) never see the merged item as invoiced, so nothing
 * stops a second, independent invoice from being issued against the SAME item while the
 * first invoice is still open -- a real double-invoice race.
 *
 * These tests assert the actual DB state, not the code shape:
 *   - after a real sendHoldInvoice call with one merged real item, BOTH items show
 *     Item.status === 'INVOICE_ISSUED' and BOTH reservations have invoiceId set to the new
 *     HoldInvoice's id
 *   - a second sendHoldInvoice attempt against the MERGED item (as its own anchor) while the
 *     first invoice is still open is rejected 409, not silently allowed (the exact race this
 *     fix closes)
 *
 * Stripe removal (2026-09-12): sendHoldInvoice's card leg no longer creates a Stripe Checkout
 * Session (see sendHoldInvoiceCashCardSplit.test.ts's own header for the full detail) -- a
 * Square-onboarded organizer's card leg now goes through createHoldInvoiceSquareCheckout, a
 * Square Payment Link. This suite is not about fee math (that's the cash/card split suite's
 * job) so createHoldInvoiceSquareCheckout is mocked to a bare success -- what this suite
 * actually verifies (the commit + invoiceId stamp on the merged item, and the second-attempt
 * 409/400) is unaffected by which processor issued the link.
 *
 * MOCKING NOTES: same convention as posCombinedInvoiceFee.test.ts (this controller's sibling
 * test file, covering createCombinedInvoice) -- Square payment-link creation mocked;
 * commitItemSale/itemSaleGuard and resolveOrganizerOrTeamMember are left real (pure DB logic).
 */

import { prisma } from '../lib/prisma';

// -- Mocks (hoisted by ts-jest above these declarations -- `var`, not `const`, deliberately) --
var mockCreateHoldInvoiceSquareCheckout = jest.fn();

jest.mock('../services/holdInvoiceSquareCheckoutHelper', () => {
  const actual = jest.requireActual('../services/holdInvoiceSquareCheckoutHelper');
  return {
    ...actual,
    createHoldInvoiceSquareCheckout: (...args: any[]) => mockCreateHoldInvoiceSquareCheckout(...args),
  };
});

jest.mock('../lib/socket', () => ({
  getIO: jest.fn(() => ({ to: jest.fn().mockReturnValue({ emit: jest.fn() }) })),
}));
jest.mock('../lib/notificationService', () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../lib/transactionalEmailService', () => ({
  transactionalEmailService: { emails: { send: jest.fn().mockResolvedValue(undefined) } },
}));
jest.mock('../services/stripeConnectService', () => ({
  shouldUseDirectCharge: jest.fn().mockResolvedValue(false),
  getAccountStatus: jest.fn().mockResolvedValue({ chargesEnabled: true }),
}));

// -- Imports AFTER the mocks --------------------------------------------------------------
import { sendHoldInvoice } from '../controllers/posController';

const makeMockRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

describe('sendHoldInvoice -- merged item commit + invoiceId stamp (ADR-113)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Each test (and each sendHoldInvoice call within a test) must get its OWN unique
    // mocked Square payment-link id via mockResolvedValueOnce -- HoldInvoice.squarePaymentLinkId
    // is @unique (schema.prisma), and the real Square API always returns a fresh unique id per
    // call, so a shared/default mockResolvedValue() here causes a false P2002 collision the
    // real system could never produce. See sendHoldInvoiceCashCardSplit.test.ts for the
    // established per-test-unique pattern this now follows.
    mockCreateHoldInvoiceSquareCheckout.mockReset();
  });

  /** Build an isolated, Square-onboarded organizer + PUBLISHED sale + 2 AVAILABLE items +
   *  shopper. */
  const seed = async (key: string) => {
    const orgUser = await prisma.user.create({
      data: {
        id: `adr113-org-user-${key}`,
        email: `adr113-org-${key}@findasale.test`,
        name: `ADR113 Organizer ${key}`,
        password: 'hashed_password',
        role: 'ORGANIZER',
        roles: ['ORGANIZER'],
      },
    });
    const organizer = await prisma.organizer.create({
      data: {
        userId: orgUser.id,
        businessName: `ADR113 Estate Sales ${key}`,
        address: '219 E Michigan Ave, Paw Paw, MI 49079',
        subscriptionTier: 'TEAMS',
        squareOnboarded: true,
        squareMerchantId: `sq-merchant-adr113-${key}`,
        squareLocationId: `sq-location-adr113-${key}`,
        cashFeeBalance: 0,
      },
    });
    const sale = await prisma.sale.create({
      data: {
        organizerId: organizer.id,
        title: `ADR113 Sale ${key}`,
        description: 'ADR-113 fixture',
        address: '219 E Michigan Ave',
        city: 'Paw Paw',
        state: 'MI',
        zip: '49079',
        startDate: new Date(Date.now() - 86400000),
        endDate: new Date(Date.now() + 86400000),
        status: 'PUBLISHED',
        saleType: 'ESTATE',
      },
    });
    const shopper = await prisma.user.create({
      data: {
        id: `adr113-shopper-${key}`,
        email: `adr113-shopper-${key}@findasale.test`,
        name: `ADR113 Shopper ${key}`,
        password: 'hashed_password',
        role: 'USER',
        roles: ['USER'],
      },
    });
    const anchorItem = await prisma.item.create({
      data: {
        saleId: sale.id,
        title: `ADR113 Anchor Item ${key}`,
        description: 'Fixture',
        price: 40,
        status: 'RESERVED',
        draftStatus: 'PUBLISHED',
        category: 'Furniture',
        embedding: [],
      },
    });
    const mergedItem = await prisma.item.create({
      data: {
        saleId: sale.id,
        title: `ADR113 Merged Item ${key}`,
        description: 'Fixture',
        price: 20,
        status: 'RESERVED',
        draftStatus: 'PUBLISHED',
        category: 'Furniture',
        embedding: [],
      },
    });
    const anchorHold = await prisma.itemReservation.create({
      data: {
        itemId: anchorItem.id,
        userId: shopper.id,
        status: 'HOLD_IN_CART',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    const mergedHold = await prisma.itemReservation.create({
      data: {
        itemId: mergedItem.id,
        userId: shopper.id,
        status: 'HOLD_IN_CART',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    return { orgUser, organizer, sale, shopper, anchorItem, mergedItem, anchorHold, mergedHold };
  };

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('commits BOTH items to INVOICE_ISSUED and stamps invoiceId on BOTH reservations', async () => {
    const { orgUser, anchorHold, mergedItem, mergedHold } = await seed('commit');

    mockCreateHoldInvoiceSquareCheckout.mockResolvedValueOnce({
      ok: true,
      paymentLinkId: 'sqpl_adr113_commit',
      orderId: 'sqorder_adr113_commit',
      url: 'https://squareup.com/pay/adr113_commit',
      longUrl: null,
    });

    const req: any = {
      user: { id: orgUser.id, role: 'ORGANIZER', roles: ['ORGANIZER'], email: orgUser.email },
      params: { reservationId: anchorHold.id },
      body: {
        deliverVia: 'EMAIL',
        miscItems: [{ id: 'misc-1', itemId: mergedItem.id, title: mergedItem.title, amount: 20 }],
      },
    };
    const res = makeMockRes();
    await sendHoldInvoice(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(409);
    expect(res.status).not.toHaveBeenCalledWith(500);

    const anchorItemAfter = await prisma.item.findUnique({ where: { id: anchorHold.itemId } });
    const mergedItemAfter = await prisma.item.findUnique({ where: { id: mergedItem.id } });
    expect(anchorItemAfter!.status).toBe('INVOICE_ISSUED');
    // Before ADR-113 this was still 'RESERVED' -- the merged item never got committed.
    expect(mergedItemAfter!.status).toBe('INVOICE_ISSUED');

    const anchorHoldAfter = await prisma.itemReservation.findUnique({ where: { id: anchorHold.id } });
    const mergedHoldAfter = await prisma.itemReservation.findUnique({ where: { id: mergedHold.id } });
    expect(anchorHoldAfter!.invoiceId).not.toBeNull();
    // Before ADR-113 this was null -- the merged item's reservation never got stamped.
    expect(mergedHoldAfter!.invoiceId).toBe(anchorHoldAfter!.invoiceId);
  });

  it('rejects a second sendHoldInvoice attempt against the already-invoiced merged item (409)', async () => {
    const { orgUser, anchorHold, mergedItem, mergedHold } = await seed('race');

    // Two distinct payment-link ids queued -- the first call is expected to succeed and hit
    // Square; the second is expected to be rejected by the invoiced-item guard BEFORE ever
    // reaching Square, but a second unique id is queued defensively in case that guard
    // ordering ever changes, so this test can never re-collide on the unique
    // squarePaymentLinkId constraint the way the shared-mock version of this file did.
    mockCreateHoldInvoiceSquareCheckout.mockResolvedValueOnce({
      ok: true,
      paymentLinkId: 'sqpl_adr113_race_1',
      orderId: 'sqorder_adr113_race_1',
      url: 'https://squareup.com/pay/adr113_race_1',
      longUrl: null,
    });
    mockCreateHoldInvoiceSquareCheckout.mockResolvedValueOnce({
      ok: true,
      paymentLinkId: 'sqpl_adr113_race_2',
      orderId: 'sqorder_adr113_race_2',
      url: 'https://squareup.com/pay/adr113_race_2',
      longUrl: null,
    });

    const firstReq: any = {
      user: { id: orgUser.id, role: 'ORGANIZER', roles: ['ORGANIZER'], email: orgUser.email },
      params: { reservationId: anchorHold.id },
      body: {
        deliverVia: 'EMAIL',
        miscItems: [{ id: 'misc-1', itemId: mergedItem.id, title: mergedItem.title, amount: 20 }],
      },
    };
    await sendHoldInvoice(firstReq, makeMockRes());

    // Before ADR-113, mergedItem.status was still AVAILABLE/RESERVED and mergedHold.invoiceId
    // was still null after the first invoice -- so a second, independent invoice attempt using
    // the MERGED item's own hold as its anchor would have gone through unblocked. That's the
    // double-invoice race this fix closes.
    const secondReq: any = {
      user: { id: orgUser.id, role: 'ORGANIZER', roles: ['ORGANIZER'], email: orgUser.email },
      params: { reservationId: mergedHold.id },
      body: { deliverVia: 'EMAIL' },
    };
    const secondRes = makeMockRes();
    await sendHoldInvoice(secondReq, secondRes);

    // isInvoicedOrClaimed() returns 400; a commitItemSale conflict returns 409 -- either is a
    // correct rejection depending on which guard fires first. Before ADR-113 this call would
    // have succeeded (201) since the merged item's Item.status/invoiceId were never set by the
    // first invoice.
    const statusCalls = secondRes.status.mock.calls.map((c: any[]) => c[0]);
    expect(statusCalls.some((code: number) => code === 400 || code === 409)).toBe(true);
    expect(statusCalls).not.toContain(201);
  });
});
