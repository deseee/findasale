/**
 * ADR-110 Track 1 — native (non-eBay) checkout destination-ZIP shipping.
 *
 * WHAT THIS SUITE EXISTS FOR: stripeController.createPaymentIntent used to charge
 * `item.shippingPrice` verbatim whenever `shippingRequested` was true -- a listing-time,
 * buyer-blind number that assumed the destination-blind FedEx surcharge default
 * (FEDEX_DESTINATION_SURCHARGE_UNMAPPED_TIER = 'B') no matter where the buyer actually was.
 * ADR-110 replaces that with a real, server-side recompute keyed on the buyer's own ZIP
 * (repriceNativeShippingForDestination, nativeShippingSuggestionService.ts), falling back to
 * item.shippingPrice ONLY on ShippingHardBlockError (an item the carrier can't price at all).
 *
 * These tests assert the controller's CONTRACT with that repricing function -- ZIP is
 * required and validated, the real result (not the listing-time default) is what gets
 * charged and persisted, the fallback fires on exactly one exception type, and a purchase
 * that never asked for shipping is completely untouched by any of this. The repricing
 * function itself (real FedEx tier lookup, weight table, etc.) already has its own coverage
 * elsewhere (ebayRateEstimateService.ts's rate-table tests) -- it is mocked here so these
 * tests isolate the controller's integration logic, matching this suite's own precedent
 * (cashSaleFee.test.ts mocks the Stripe SDK the same way to isolate reservationController).
 *
 * MOCKING NOTES: stripeController pulls in Stripe, Socket.io, email, eBay/Shopify/FB at
 * import time -- all mocked, none of them are on the code path under test. Real Postgres
 * (see cashSaleFee.test.ts header) backs every DB assertion.
 */

import { prisma } from '../lib/prisma';

// ── Mocks (hoisted by ts-jest above these declarations — `var`, not `const`, deliberately) ──
var mockPaymentIntentsCreate = jest.fn();

jest.mock('../utils/stripe', () => ({
  getStripe: jest.fn(() => ({
    paymentIntents: { create: mockPaymentIntentsCreate },
  })),
  default: jest.fn(),
}));

jest.mock('../lib/transactionalEmailService', () => ({
  transactionalEmailService: { emails: { send: jest.fn().mockResolvedValue({ id: 'mock' }) } },
}));

// Real ShippingHardBlockError class preserved (stripeController imports it from THIS module
// too, and does an `instanceof` check on it) -- only repriceNativeShippingForDestination is
// swapped for a controllable mock.
var mockReprice = jest.fn();
jest.mock('../services/nativeShippingSuggestionService', () => {
  const actual = jest.requireActual('../services/nativeShippingSuggestionService');
  return {
    ...actual,
    repriceNativeShippingForDestination: mockReprice,
  };
});

// ── Imports AFTER the mocks ───────────────────────────────────────────────────────────────
import { createPaymentIntent } from '../controllers/stripeController';
import { ShippingHardBlockError } from '../services/nativeShippingSuggestionService';

const makeMockRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

// NOT an 'acct_test_' prefix -- stripeController gates Connect routing on
// `stripeConnectId && !stripeConnectId.startsWith('acct_test_')` (see stripe.e2e.test.ts's
// identical note; this is the same guard, same reason).
const STRIPE_CONNECT_ID = 'acct_shipdestfee2026';

describe('ADR-110 Track 1 — native checkout destination-ZIP shipping', () => {
  let orgUser: any;
  let organizer: any;
  let shopper: any;
  let sale: any;
  let item: any; // shippingAvailable + packageWeightOz set -- reprice path is reachable
  let itemNoPackage: any; // shippingAvailable but NO packageWeightOz -- reprice is skipped entirely

  const ITEM_PRICE = 45.0;
  const LISTING_TIME_SHIPPING_PRICE = 12.5; // Item.shippingPrice -- the destination-blind fallback

  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake_ship_dest';

    orgUser = await prisma.user.create({
      data: {
        id: 'shipdest-org-user',
        email: 'shipdest-organizer@findasale.test',
        name: 'Ship Destination Organizer',
        password: 'hashed_password',
        role: 'ORGANIZER',
        roles: ['ORGANIZER'],
      },
    });
    organizer = await prisma.organizer.create({
      data: {
        userId: orgUser.id,
        businessName: 'Ship Destination Estate Sales',
        address: '219 E Michigan Ave, Paw Paw, MI 49079',
        stripeConnectId: STRIPE_CONNECT_ID,
        lat: 42.1112,
        lng: -85.8886,
      },
    });
    shopper = await prisma.user.create({
      data: {
        id: 'shipdest-shopper',
        email: 'shipdest-shopper@findasale.test',
        name: 'Ship Destination Shopper',
        password: 'hashed_password',
        role: 'USER',
        roles: ['USER'],
      },
    });
    sale = await prisma.sale.create({
      data: {
        organizerId: organizer.id,
        title: 'Ship Destination Sale',
        description: 'ADR-110 Track 1 fixture',
        address: '219 E Michigan Ave',
        city: 'Paw Paw',
        state: 'MI',
        zip: '49079',
        lat: 42.1112,
        lng: -85.8886,
        startDate: new Date(Date.now() - 86400000),
        endDate: new Date(Date.now() + 86400000),
        status: 'PUBLISHED',
        saleType: 'ESTATE',
      },
    });
    item = await prisma.item.create({
      data: {
        saleId: sale.id,
        title: 'Ship Destination Item',
        description: 'Fixture',
        price: ITEM_PRICE,
        status: 'AVAILABLE',
        category: 'Collectibles',
        shippingAvailable: true,
        shippingPrice: LISTING_TIME_SHIPPING_PRICE,
        shippingPriceSource: 'ORGANIZER',
        packageWeightOz: 24,
        packageLengthIn: 10,
        packageWidthIn: 8,
        packageHeightIn: 6,
        packageType: 'BOX',
        embedding: [], // NOT NULL, no DB default (migration 20260307153530 drops it)
      },
    });
    itemNoPackage = await prisma.item.create({
      data: {
        saleId: sale.id,
        title: 'Ship Destination Item (no package data)',
        description: 'Fixture -- shippingAvailable with no packageWeightOz on file',
        price: 20.0,
        status: 'AVAILABLE',
        category: 'Collectibles',
        shippingAvailable: true,
        shippingPrice: 6.0,
        shippingPriceSource: 'ORGANIZER',
        embedding: [],
      },
    });
  });

  afterAll(async () => {
    await prisma.checkoutEvidence.deleteMany({ where: { purchase: { itemId: { in: [item.id, itemNoPackage.id] } } } }).catch(() => {});
    await prisma.purchase.deleteMany({ where: { itemId: { in: [item.id, itemNoPackage.id] } } }).catch(() => {});
    await prisma.item.deleteMany({ where: { id: { in: [item.id, itemNoPackage.id] } } }).catch(() => {});
    await prisma.sale.delete({ where: { id: sale.id } }).catch(() => {});
    await prisma.organizer.delete({ where: { id: organizer.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: orgUser.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: shopper.id } }).catch(() => {});
    delete process.env.STRIPE_SECRET_KEY;
    await prisma.$disconnect();
  });

  afterEach(async () => {
    mockReprice.mockReset();
    mockPaymentIntentsCreate.mockReset();
    // Restore item.status to AVAILABLE and clear any Purchase rows between tests -- each test
    // creates its own PaymentIntent id, so stale PENDING rows from a prior test never collide,
    // but a leftover row would still pollute the "no shipping fields written" assertions.
    await prisma.purchase.deleteMany({ where: { itemId: { in: [item.id, itemNoPackage.id] } } });
    await prisma.item.update({ where: { id: item.id }, data: { status: 'AVAILABLE' } });
    await prisma.item.update({ where: { id: itemNoPackage.id }, data: { status: 'AVAILABLE' } });
  });

  it('(a) valid ZIP: recomputes to the real per-destination price, not the listing-time default', async () => {
    const REAL_SHIPPING_COST = 19.99; // deliberately different from LISTING_TIME_SHIPPING_PRICE
    mockReprice.mockResolvedValueOnce({ shippingCost: REAL_SHIPPING_COST, tier: 'clean' });
    mockPaymentIntentsCreate.mockResolvedValueOnce({
      id: 'pi_shipdest_valid_zip',
      client_secret: 'pi_shipdest_valid_zip_secret',
    });

    const req: any = {
      user: { id: shopper.id, role: 'USER' },
      body: { itemId: item.id, shippingRequested: true, shippingZip: '90210' },
    };
    const res = makeMockRes();
    await createPaymentIntent(req, res);

    // The repricing function was actually called -- with the buyer's real ZIP, not the
    // listing-time default -- and its result (not item.shippingPrice) is what got charged.
    expect(mockReprice).toHaveBeenCalledTimes(1);
    expect(mockReprice.mock.calls[0][1]).toBe('90210');

    const piArgs = mockPaymentIntentsCreate.mock.calls.at(-1)[0];
    const expectedCents = Math.round((ITEM_PRICE + REAL_SHIPPING_COST) * 100);
    expect(piArgs.amount).toBe(expectedCents);

    const payload = res.json.mock.calls[0][0];
    expect(payload.shippingCost).toBeCloseTo(REAL_SHIPPING_COST, 2);
    expect(payload.shippingCost).not.toBeCloseTo(LISTING_TIME_SHIPPING_PRICE, 2);

    const purchase = await prisma.purchase.findFirst({ where: { itemId: item.id } });
    expect(purchase).not.toBeNull();
    expect(purchase!.shippingZip).toBe('90210');
    expect(purchase!.shippingFedexSurchargeTier).toBe('clean');
  });

  it('(b) missing/invalid ZIP: 400 with a buyer-facing message, no PaymentIntent, no Purchase row', async () => {
    // Missing entirely
    const reqMissing: any = {
      user: { id: shopper.id, role: 'USER' },
      body: { itemId: item.id, shippingRequested: true },
    };
    const resMissing = makeMockRes();
    await createPaymentIntent(reqMissing, resMissing);
    expect(resMissing.status).toHaveBeenCalledWith(400);
    expect(resMissing.json.mock.calls[0][0].message).toMatch(/zip/i);
    expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
    expect(mockReprice).not.toHaveBeenCalled();

    // Present but malformed
    const reqInvalid: any = {
      user: { id: shopper.id, role: 'USER' },
      body: { itemId: item.id, shippingRequested: true, shippingZip: 'not-a-zip' },
    };
    const resInvalid = makeMockRes();
    await createPaymentIntent(reqInvalid, resInvalid);
    expect(resInvalid.status).toHaveBeenCalledWith(400);
    expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
    expect(mockReprice).not.toHaveBeenCalled();

    const purchase = await prisma.purchase.findFirst({ where: { itemId: item.id } });
    expect(purchase).toBeNull();
  });

  it('(c) shippingRequested=false: completely unaffected -- $0 shipping, no shipping fields written, repricer never called', async () => {
    mockPaymentIntentsCreate.mockResolvedValueOnce({
      id: 'pi_shipdest_not_requested',
      client_secret: 'pi_shipdest_not_requested_secret',
    });

    const req: any = {
      user: { id: shopper.id, role: 'USER' },
      // shippingZip supplied anyway -- must be ignored entirely when shippingRequested is falsy.
      body: { itemId: item.id, shippingZip: '90210' },
    };
    const res = makeMockRes();
    await createPaymentIntent(req, res);

    expect(mockReprice).not.toHaveBeenCalled();

    const piArgs = mockPaymentIntentsCreate.mock.calls.at(-1)[0];
    expect(piArgs.amount).toBe(Math.round(ITEM_PRICE * 100));

    const payload = res.json.mock.calls[0][0];
    expect(payload.shippingCost).toBe(0);

    const purchase = await prisma.purchase.findFirst({ where: { itemId: item.id } });
    expect(purchase).not.toBeNull();
    expect(purchase!.shippingZip).toBeNull();
    expect(purchase!.shippingAddressLine1).toBeNull();
    expect(purchase!.shippingFedexSurchargeTier).toBeNull();
  });

  it('(d) ShippingHardBlockError from the repricer: falls back to item.shippingPrice without failing checkout', async () => {
    mockReprice.mockRejectedValueOnce(new ShippingHardBlockError('exceeds carrier limits for every modeled carrier'));
    mockPaymentIntentsCreate.mockResolvedValueOnce({
      id: 'pi_shipdest_hardblock',
      client_secret: 'pi_shipdest_hardblock_secret',
    });

    const req: any = {
      user: { id: shopper.id, role: 'USER' },
      body: { itemId: item.id, shippingRequested: true, shippingZip: '90210' },
    };
    const res = makeMockRes();
    await createPaymentIntent(req, res);

    expect(mockReprice).toHaveBeenCalledTimes(1);
    // Checkout was NOT blocked -- a PaymentIntent was still created.
    expect(mockPaymentIntentsCreate).toHaveBeenCalledTimes(1);

    const piArgs = mockPaymentIntentsCreate.mock.calls.at(-1)[0];
    const expectedCents = Math.round((ITEM_PRICE + LISTING_TIME_SHIPPING_PRICE) * 100);
    expect(piArgs.amount).toBe(expectedCents);

    const payload = res.json.mock.calls[0][0];
    expect(payload.shippingCost).toBeCloseTo(LISTING_TIME_SHIPPING_PRICE, 2);

    const purchase = await prisma.purchase.findFirst({ where: { itemId: item.id } });
    expect(purchase).not.toBeNull();
    expect(purchase!.shippingZip).toBe('90210'); // ZIP itself still recorded -- only the PRICE fell back
    expect(purchase!.shippingFedexSurchargeTier).toBeNull(); // no real tier was ever resolved
  });

  it('an item with no packageWeightOz on file skips the repricer and uses item.shippingPrice directly', async () => {
    mockPaymentIntentsCreate.mockResolvedValueOnce({
      id: 'pi_shipdest_no_package',
      client_secret: 'pi_shipdest_no_package_secret',
    });

    const req: any = {
      user: { id: shopper.id, role: 'USER' },
      body: { itemId: itemNoPackage.id, shippingRequested: true, shippingZip: '90210' },
    };
    const res = makeMockRes();
    await createPaymentIntent(req, res);

    // Nothing real to reprice from (no weight on file) -- fail safe to the listing price
    // rather than quoting off a fabricated 0oz package.
    expect(mockReprice).not.toHaveBeenCalled();

    const payload = res.json.mock.calls[0][0];
    expect(payload.shippingCost).toBeCloseTo(6.0, 2);
  });
});
