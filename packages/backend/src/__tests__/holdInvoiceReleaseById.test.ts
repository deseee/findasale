/**
 * releaseInvoiceById (POST /reservations/invoice/:invoiceId/release) — coverage for the
 * reservation-less POS-cart HoldInvoice cancel path added 2026-08-23.
 *
 * BUG THIS CLOSES: posController.createCombinedInvoice omits HoldInvoice.reservationId
 * (and skips the ItemReservation.invoiceId write) whenever a POS-cart invoice is built
 * with zero held reservations behind it (a register cart made entirely of miscItems).
 * The existing POST /reservations/:id/release-invoice (releaseInvoice) is keyed on an
 * ItemReservation id, so it can never address such an invoice — getMyInvoices already
 * reported `canCancel: false` for exactly this case, and no endpoint could act on it.
 * releaseInvoiceById cancels the HoldInvoice directly by its own id instead.
 *
 * These tests assert against the real database (same pattern as
 * cashSaleFee.test.ts / reservation.integration.test.ts) — everything Stripe-shaped is
 * mocked since these fixtures use stripeSessionId: null (the 100%-cash-split path,
 * which never creates a Stripe Checkout Session), so the Stripe mock is never actually
 * invoked by the assertions below; it exists purely so importing the controller module
 * (which imports ../utils/stripe transitively) does not reach out to a real Stripe key.
 */

import { prisma } from '../lib/prisma';

// ── Mocks (hoisted by ts-jest above these declarations — `var`, not `const`, deliberately) ──
jest.mock('../utils/stripe', () => ({
  getStripe: jest.fn(() => ({
    checkout: { sessions: { retrieve: jest.fn(), expire: jest.fn() } },
  })),
  default: jest.fn(),
}));
jest.mock('../lib/socket', () => ({ getIO: jest.fn(() => null) }));
jest.mock('../services/liveFeedService', () => ({ pushEvent: jest.fn() }));
jest.mock('../services/saleStatusService', () => ({ pushSaleStatus: jest.fn() }));
jest.mock('../services/saleAlertEmailService', () => ({
  sendHoldPlacedAlert: jest.fn().mockResolvedValue(undefined),
  sendHoldPlacedToShopper: jest.fn().mockResolvedValue(undefined),
  sendHoldStatusToShopper: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/fraudDetectionService', () => ({
  checkForFraud: jest.fn().mockResolvedValue(undefined),
  calculateConfidenceScore: jest.fn().mockResolvedValue(100),
}));
jest.mock('../controllers/ebayController', () => ({
  endEbayListingIfExists: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/shopifyService', () => ({
  markShopifyItemSold: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/facebookNudgeService', () => ({
  notifyFacebookExportedItemSold: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/marketplaceStockSyncService', () => ({
  syncMarketplaceStock: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/crewInvasionService', () => ({
  checkCrewInvasion: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../lib/emailService', () => ({
  emailService: { emails: { send: jest.fn().mockResolvedValue({ id: 'mock' }) } },
}));
jest.mock('../services/suppressionService', () => ({
  suppressionService: { isHardSuppressed: jest.fn().mockResolvedValue(false) },
}));
jest.mock('../lib/notificationService', () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../controllers/posController', () => ({
  createPaymentLinkInternal: jest.fn(),
}));
jest.mock('../services/stripeConnectService', () => ({
  shouldUseDirectCharge: jest.fn().mockResolvedValue(false),
  getAccountStatus: jest.fn().mockResolvedValue({ chargesEnabled: true }),
}));
jest.mock('../services/checkoutGuard', () => ({
  assertCheckoutAllowed: jest.fn().mockResolvedValue(undefined),
  recordSuspectedSignal: jest.fn().mockResolvedValue(undefined),
  CheckoutGuardError: class CheckoutGuardError extends Error {},
}));

// ── Imports AFTER the mocks ───────────────────────────────────────────────────────────────
import { releaseInvoiceById } from '../controllers/reservationController';

const makeMockRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('releaseInvoiceById — reservation-less POS-cart HoldInvoice cancel path', () => {
  let orgAUser: any;
  let organizerA: any;
  let shopperA: any;
  let saleA: any;

  let orgBUser: any;
  let organizerB: any;
  let shopperB: any;

  let teamMemberUser: any;

  const KEY = 'rel-by-id';

  beforeAll(async () => {
    orgAUser = await prisma.user.create({
      data: {
        id: `${KEY}-org-a-user`,
        email: `${KEY}-org-a@findasale.test`,
        name: 'Organizer A',
        password: 'hashed_password',
        role: 'ORGANIZER',
        roles: ['ORGANIZER'],
      },
    });
    organizerA = await prisma.organizer.create({
      data: {
        userId: orgAUser.id,
        businessName: 'Organizer A Estate Sales',
        address: '219 E Michigan Ave, Paw Paw, MI 49079',
        stripeConnectId: `acct_${KEY}A`,
      },
    });
    saleA = await prisma.sale.create({
      data: {
        organizerId: organizerA.id,
        title: `${KEY} Sale A`,
        description: 'Fixture sale for releaseInvoiceById tests',
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
    shopperA = await prisma.user.create({
      data: {
        id: `${KEY}-shopper-a`,
        email: `${KEY}-shopper-a@findasale.test`,
        name: 'Shopper A',
        password: 'hashed_password',
        role: 'USER',
      },
    });

    // An unrelated organizer + shopper, to prove neither can touch Organizer A's invoice.
    orgBUser = await prisma.user.create({
      data: {
        id: `${KEY}-org-b-user`,
        email: `${KEY}-org-b@findasale.test`,
        name: 'Organizer B',
        password: 'hashed_password',
        role: 'ORGANIZER',
        roles: ['ORGANIZER'],
      },
    });
    organizerB = await prisma.organizer.create({
      data: {
        userId: orgBUser.id,
        businessName: 'Organizer B Estate Sales',
        address: '1 Other St, Kalamazoo, MI 49001',
      },
    });
    shopperB = await prisma.user.create({
      data: {
        id: `${KEY}-shopper-b`,
        email: `${KEY}-shopper-b@findasale.test`,
        name: 'Shopper B',
        password: 'hashed_password',
        role: 'USER',
      },
    });

    // A TEAM_MEMBER on Organizer A's workspace, register staff who should be able to
    // cancel an invoice they (or a colleague) created from the POS register.
    teamMemberUser = await prisma.user.create({
      data: {
        id: `${KEY}-team-member`,
        email: `${KEY}-team-member@findasale.test`,
        name: 'Register Staff',
        password: 'hashed_password',
        role: 'USER',
      },
    });
    const workspace = await prisma.organizerWorkspace.create({
      data: {
        name: 'Organizer A Workspace',
        slug: `${KEY}-workspace`,
        ownerId: organizerA.id,
      },
    });
    const workspaceMember = await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: teamMemberUser.id,
        role: 'MEMBER',
        acceptedAt: new Date(),
      },
    });
    await prisma.teamMember.create({
      data: { workspaceMemberId: workspaceMember.id, role: 'MEMBER' },
    });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({
      where: { userId: { in: [shopperA.id, orgAUser.id, shopperB.id, orgBUser.id, teamMemberUser.id] } },
    });
    await prisma.holdInvoice.deleteMany({ where: { saleId: saleA.id } });
    await prisma.itemReservation.deleteMany({ where: { item: { saleId: saleA.id } } });
    await prisma.item.deleteMany({ where: { saleId: saleA.id } });
    await prisma.teamMember.deleteMany({
      where: { workspaceMember: { workspace: { ownerId: organizerA.id } } },
    });
    await prisma.workspaceMember.deleteMany({ where: { workspace: { ownerId: organizerA.id } } });
    await prisma.organizerWorkspace.deleteMany({ where: { ownerId: organizerA.id } });
    await prisma.sale.deleteMany({ where: { organizerId: organizerA.id } });
    await prisma.organizer.deleteMany({ where: { id: { in: [organizerA.id, organizerB.id] } } });
    await prisma.user.deleteMany({
      where: { id: { in: [orgAUser.id, shopperA.id, orgBUser.id, shopperB.id, teamMemberUser.id] } },
    });
  });

  /** Build a fresh reservation-less POS-cart invoice (misc-items-only register cart). */
  const seedInvoice = async (suffix: string) =>
    prisma.holdInvoice.create({
      data: {
        shopperUserId: shopperA.id,
        organizerUserId: orgAUser.id,
        saleId: saleA.id,
        status: 'PENDING',
        totalAmount: 1500,
        platformFeeAmount: 150,
        itemIds: [],
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        invoiceMode: 'QUICK',
        cashAmountCents: 1500,
        cardAmountCents: 0,
        stripeSessionId: null,
        // reservationId intentionally omitted -- this is the exact shape
        // posController.createCombinedInvoice produces when heldReservations is empty.
      },
    });

  it('lets the invoice\'s own shopper cancel it, and marks it CANCELLED', async () => {
    const invoice = await seedInvoice('shopper-arm');
    const req: any = { user: { id: shopperA.id }, params: { invoiceId: invoice.id } };
    const res = makeMockRes();

    await releaseInvoiceById(req, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(res.status).not.toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invoice released', invoiceId: invoice.id })
    );

    const updated = await prisma.holdInvoice.findUnique({ where: { id: invoice.id } });
    expect(updated?.status).toBe('CANCELLED');
    expect(updated?.releasedAt).toBeTruthy();
  });

  it('lets the owning organizer cancel it directly (organizerUserId match)', async () => {
    const invoice = await seedInvoice('organizer-arm');
    const req: any = { user: { id: orgAUser.id }, params: { invoiceId: invoice.id } };
    const res = makeMockRes();

    await releaseInvoiceById(req, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    const updated = await prisma.holdInvoice.findUnique({ where: { id: invoice.id } });
    expect(updated?.status).toBe('CANCELLED');
  });

  it('lets an accepted TEAM_MEMBER on the organizer\'s workspace cancel it', async () => {
    const invoice = await seedInvoice('team-member-arm');
    const req: any = { user: { id: teamMemberUser.id }, params: { invoiceId: invoice.id } };
    const res = makeMockRes();

    await releaseInvoiceById(req, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    const updated = await prisma.holdInvoice.findUnique({ where: { id: invoice.id } });
    expect(updated?.status).toBe('CANCELLED');
  });

  it('refuses an unrelated organizer with 403 and leaves the invoice PENDING', async () => {
    const invoice = await seedInvoice('wrong-organizer');
    const req: any = { user: { id: orgBUser.id }, params: { invoiceId: invoice.id } };
    const res = makeMockRes();

    await releaseInvoiceById(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    const untouched = await prisma.holdInvoice.findUnique({ where: { id: invoice.id } });
    expect(untouched?.status).toBe('PENDING');
  });

  it('refuses a random, unrelated shopper with 403 and leaves the invoice PENDING', async () => {
    const invoice = await seedInvoice('wrong-shopper');
    const req: any = { user: { id: shopperB.id }, params: { invoiceId: invoice.id } };
    const res = makeMockRes();

    await releaseInvoiceById(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    const untouched = await prisma.holdInvoice.findUnique({ where: { id: invoice.id } });
    expect(untouched?.status).toBe('PENDING');
  });

  it('refuses an anonymous (unauthenticated) caller with 401', async () => {
    const invoice = await seedInvoice('anonymous');
    const req: any = { user: undefined, params: { invoiceId: invoice.id } };
    const res = makeMockRes();

    await releaseInvoiceById(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    const untouched = await prisma.holdInvoice.findUnique({ where: { id: invoice.id } });
    expect(untouched?.status).toBe('PENDING');
  });

  it('404s on an invoice id that does not exist', async () => {
    const req: any = { user: { id: shopperA.id }, params: { invoiceId: 'does-not-exist' } };
    const res = makeMockRes();

    await releaseInvoiceById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('refuses (409) an invoice that DOES have a reservation link, pointing the caller at the hold-based path instead', async () => {
    const item = await prisma.item.create({
      data: {
        embedding: [],
        title: `${KEY} held item`,
        saleId: saleA.id,
        status: 'INVOICE_ISSUED',
        price: 15,
      },
    });
    const reservation = await prisma.itemReservation.create({
      data: {
        itemId: item.id,
        userId: shopperA.id,
        status: 'INVOICE_ISSUED',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
    const invoice = await prisma.holdInvoice.create({
      data: {
        reservationId: reservation.id,
        shopperUserId: shopperA.id,
        organizerUserId: orgAUser.id,
        saleId: saleA.id,
        status: 'PENDING',
        totalAmount: 1500,
        platformFeeAmount: 150,
        itemIds: [item.id],
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        stripeSessionId: null,
      },
    });

    const req: any = { user: { id: shopperA.id }, params: { invoiceId: invoice.id } };
    const res = makeMockRes();

    await releaseInvoiceById(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    const untouched = await prisma.holdInvoice.findUnique({ where: { id: invoice.id } });
    expect(untouched?.status).toBe('PENDING');
  });
});
