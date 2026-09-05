/**
 * ADR-115 Phase 2 — POST /api/stripe/purchases/:id/buy-shipping-label (payoutController.buyShippingLabel).
 *
 * shippingLabelService's real Shippo calls are mocked (its own contract is covered by
 * shippingLabelService.test.ts) so these tests isolate the controller's real job: ownership
 * scoping (no IDOR across organizers), guard conditions (deliveryMethod/status/address/
 * idempotency), and that a successful purchase is persisted onto the real Purchase row.
 * Real Postgres backs every DB assertion, matching this suite's own precedent
 * (nativeCheckoutShippingDestination.test.ts mocks its one external service boundary the
 * same way, for the same reason).
 */

import { prisma } from '../lib/prisma';

var mockBuyCheapestLabel = jest.fn();
jest.mock('../services/shippingLabelService', () => {
  const actual = jest.requireActual('../services/shippingLabelService');
  return {
    ...actual,
    buyCheapestLabel: mockBuyCheapestLabel,
  };
});

import { buyShippingLabel } from '../controllers/payoutController';

const makeMockRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const FAKE_LABEL_RESULT = {
  rates: [{ rateId: 'rate_1', provider: 'USPS', serviceName: 'Ground Advantage', amountCents: 1001, currency: 'USD', estimatedDays: 5 }],
  label: {
    transactionId: 'txn_1',
    trackingNumber: 'TRACK123',
    trackingUrl: 'https://tools.usps.com/track/TRACK123',
    labelUrl: 'https://deliver.goshippo.com/txn_1.pdf',
    carrier: 'USPS',
    costCents: 1001,
  },
};

describe('ADR-115 Phase 2 — buyShippingLabel', () => {
  let orgUser: any;
  let organizer: any;
  let otherOrgUser: any;
  let otherOrganizer: any;
  let shopper: any;
  let sale: any;
  let item: any;

  beforeAll(async () => {
    orgUser = await prisma.user.create({
      data: {
        id: 'shiplabel-org-user',
        email: 'shiplabel-organizer@findasale.test',
        name: 'Ship Label Organizer',
        password: 'hashed_password',
        role: 'ORGANIZER',
        roles: ['ORGANIZER'],
        phone: '+12695550100',
      },
    });
    organizer = await prisma.organizer.create({
      data: {
        userId: orgUser.id,
        businessName: 'Ship Label Estate Sales',
        address: '219 E Michigan Ave, Paw Paw, MI 49079',
        phone: '+12695550100',
      },
    });
    otherOrgUser = await prisma.user.create({
      data: {
        id: 'shiplabel-other-org-user',
        email: 'shiplabel-other-organizer@findasale.test',
        name: 'Other Organizer',
        password: 'hashed_password',
        role: 'ORGANIZER',
        roles: ['ORGANIZER'],
      },
    });
    otherOrganizer = await prisma.organizer.create({
      data: {
        userId: otherOrgUser.id,
        businessName: 'A Different Organizer',
        address: '1 Other St, Other City, OH 43000',
      },
    });
    shopper = await prisma.user.create({
      data: {
        id: 'shiplabel-shopper',
        email: 'shiplabel-shopper@findasale.test',
        name: 'Ship Label Shopper',
        password: 'hashed_password',
        role: 'USER',
        roles: ['USER'],
      },
    });
    sale = await prisma.sale.create({
      data: {
        organizerId: organizer.id,
        title: 'Ship Label Sale',
        description: 'ADR-115 Phase 2 fixture',
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
    item = await prisma.item.create({
      data: {
        saleId: sale.id,
        title: 'Ship Label Item',
        description: 'Fixture',
        price: 25.0,
        status: 'AVAILABLE',
        category: 'Collectibles',
        shippingAvailable: true,
        shippingPrice: 10.0,
        packageWeightOz: 16,
        packageLengthIn: 10,
        packageWidthIn: 8,
        packageHeightIn: 4,
        embedding: [],
      },
    });
  });

  afterAll(async () => {
    await prisma.purchase.deleteMany({ where: { itemId: item.id } }).catch(() => {});
    await prisma.item.delete({ where: { id: item.id } }).catch(() => {});
    await prisma.sale.delete({ where: { id: sale.id } }).catch(() => {});
    await prisma.organizer.delete({ where: { id: organizer.id } }).catch(() => {});
    await prisma.organizer.delete({ where: { id: otherOrganizer.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: orgUser.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: otherOrgUser.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: shopper.id } }).catch(() => {});
    await prisma.$disconnect();
  });

  afterEach(async () => {
    mockBuyCheapestLabel.mockReset();
    await prisma.purchase.deleteMany({ where: { itemId: item.id } });
  });

  const makeShipPurchase = async (overrides: Partial<Parameters<typeof prisma.purchase.create>[0]['data']> = {}) =>
    prisma.purchase.create({
      data: {
        itemId: item.id,
        saleId: sale.id,
        userId: shopper.id,
        amount: 35.0,
        status: 'PAID',
        deliveryMethod: 'SHIP',
        buyerEmail: 'shopper@example.com',
        shippingAddressLine1: '123 Rodeo Dr',
        shippingCity: 'Beverly Hills',
        shippingState: 'CA',
        shippingZip: '90210',
        shippingCountry: 'US',
        ...overrides,
      },
    });

  it('(a) happy path: buys a label and persists the result on the Purchase row', async () => {
    mockBuyCheapestLabel.mockResolvedValueOnce(FAKE_LABEL_RESULT);
    const purchase = await makeShipPurchase();

    const req: any = { user: { id: orgUser.id, role: 'ORGANIZER' }, params: { id: purchase.id } };
    const res = makeMockRes();
    await buyShippingLabel(req, res);

    expect(mockBuyCheapestLabel).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        shippingLabelUrl: FAKE_LABEL_RESULT.label.labelUrl,
        shippingTrackingNumber: FAKE_LABEL_RESULT.label.trackingNumber,
        shippingCarrier: 'USPS',
        shippingLabelCostCents: 1001,
      })
    );

    const updated = await prisma.purchase.findUnique({ where: { id: purchase.id } });
    expect(updated!.shippingLabelUrl).toBe(FAKE_LABEL_RESULT.label.labelUrl);
    expect(updated!.shippingLabelPurchasedAt).not.toBeNull();
  });

  // findasale-hacker fix, 2026-09-05: the naive read-then-write idempotency check is
  // TOCTOU-unsafe -- two concurrent requests could both read shippingLabelPurchasedAt=null
  // before either writes, buying two real labels. buyShippingLabel now claims the row via an
  // atomic `updateMany` (WHERE shippingLabelPurchasedAt IS NULL) before ever calling Shippo.
  // This test exercises the REAL race against the real Postgres test DB, not a mock -- two
  // genuinely concurrent calls to the controller for the SAME fresh purchase.
  it('(a2) concurrency: two simultaneous requests for the same order only buy ONE label', async () => {
    mockBuyCheapestLabel.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(FAKE_LABEL_RESULT), 20)));
    const purchase = await makeShipPurchase();

    const req1: any = { user: { id: orgUser.id, role: 'ORGANIZER' }, params: { id: purchase.id } };
    const res1 = makeMockRes();
    const req2: any = { user: { id: orgUser.id, role: 'ORGANIZER' }, params: { id: purchase.id } };
    const res2 = makeMockRes();

    await Promise.all([buyShippingLabel(req1, res1), buyShippingLabel(req2, res2)]);

    // Exactly one of the two calls actually purchased a label from Shippo.
    expect(mockBuyCheapestLabel).toHaveBeenCalledTimes(1);

    const statuses = [res1.status.mock.calls[0]?.[0], res2.status.mock.calls[0]?.[0]].filter(Boolean);
    // One request never called res.status (falls through to res.json(200) on the winner) --
    // the loser got a real 409. Exactly one 409 among the two outcomes.
    expect(statuses.filter((s) => s === 409)).toHaveLength(1);

    const updated = await prisma.purchase.findUnique({ where: { id: purchase.id } });
    expect(updated!.shippingLabelUrl).toBe(FAKE_LABEL_RESULT.label.labelUrl);
  });

  it('(b) cross-organizer IDOR: a different organizer cannot buy a label for this purchase', async () => {
    const purchase = await makeShipPurchase();

    const req: any = { user: { id: otherOrgUser.id, role: 'ORGANIZER' }, params: { id: purchase.id } };
    const res = makeMockRes();
    await buyShippingLabel(req, res);

    expect(mockBuyCheapestLabel).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);

    const untouched = await prisma.purchase.findUnique({ where: { id: purchase.id } });
    expect(untouched!.shippingLabelPurchasedAt).toBeNull();
  });

  it('(c) idempotency: refuses to buy a second label once one already exists', async () => {
    const purchase = await makeShipPurchase({ shippingLabelPurchasedAt: new Date(), shippingLabelUrl: 'https://existing.example/label.pdf' } as any);

    const req: any = { user: { id: orgUser.id, role: 'ORGANIZER' }, params: { id: purchase.id } };
    const res = makeMockRes();
    await buyShippingLabel(req, res);

    expect(mockBuyCheapestLabel).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('(d) guard: refuses a LOCAL_PICKUP purchase', async () => {
    const purchase = await makeShipPurchase({ deliveryMethod: 'LOCAL_PICKUP', shippingAddressLine1: null, shippingCity: null, shippingState: null, shippingZip: null } as any);

    const req: any = { user: { id: orgUser.id, role: 'ORGANIZER' }, params: { id: purchase.id } };
    const res = makeMockRes();
    await buyShippingLabel(req, res);

    expect(mockBuyCheapestLabel).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('(e) guard: refuses a purchase missing a full street address', async () => {
    const purchase = await makeShipPurchase({ shippingAddressLine1: null } as any);

    const req: any = { user: { id: orgUser.id, role: 'ORGANIZER' }, params: { id: purchase.id } };
    const res = makeMockRes();
    await buyShippingLabel(req, res);

    expect(mockBuyCheapestLabel).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('(f) surfaces a Shippo-side failure as a 502 with the real messages, without writing partial state', async () => {
    const { ShippingLabelPurchaseError } = jest.requireActual('../services/shippingLabelService');
    mockBuyCheapestLabel.mockRejectedValueOnce(
      new ShippingLabelPurchaseError('Shippo could not issue a label', [{ source: 'USPS', code: 'sender_info_missing', text: 'Seller email and phone number required for USPS.' }])
    );
    const purchase = await makeShipPurchase();

    const req: any = { user: { id: orgUser.id, role: 'ORGANIZER' }, params: { id: purchase.id } };
    const res = makeMockRes();
    await buyShippingLabel(req, res);

    expect(res.status).toHaveBeenCalledWith(502);
    const untouched = await prisma.purchase.findUnique({ where: { id: purchase.id } });
    expect(untouched!.shippingLabelPurchasedAt).toBeNull();
  });
});
