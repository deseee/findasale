/**
 * Consignor price tags on the card paths: manualCardPayment and createPaymentRequest (2026-10-06).
 * NOT EXECUTED when written (jest cannot run on the authoring device; this suite needs the test database like its siblings
 * posManualCardPayment.test.ts and posPaymentControllerPricing.test.ts, whose mocking and seeding style it copies).
 *   - manual card: a tag-only cart is charged tag cents + the CNP fee, mints one SOLD CONSIGNOR_TAG item whose Purchase row carries its
 *     itemId, a retry on the same Square payment id mints and records nothing twice, the tag is outside the discount base, and a tampered
 *     price / a switched-off feature is refused BEFORE Square is called
 *   - payment request: the verified tag cents are a floor under the client's total (catalog + tag - discount - 1 cent), the stored
 *     request carries the verified lines, and a bad signature creates nothing
 */
import { prisma } from '../lib/prisma';

var mockPreflightAccountStatus = jest.fn();
var mockCreateAndCapturePayment = jest.fn();

jest.mock('../services/squarePosPaymentAdapter', () => ({
  preflightAccountStatus: (...args: any[]) => mockPreflightAccountStatus(...args),
  createAndCapturePayment: (...args: any[]) => mockCreateAndCapturePayment(...args),
}));
jest.mock('../lib/socket', () => ({
  getIO: jest.fn(() => ({ to: jest.fn().mockReturnValue({ emit: jest.fn() }) })),
}));
jest.mock('../lib/notificationService', () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
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
jest.mock('../services/checkoutGuard', () => ({
  assertCheckoutAllowed: jest.fn().mockResolvedValue(undefined),
  recordSuspectedSignal: jest.fn().mockResolvedValue(undefined),
  CheckoutGuardError: class CheckoutGuardError extends Error {},
}));

import { manualCardPayment, createPaymentRequest } from '../controllers/posPaymentController';
import { signTag } from '../services/consignorTagService';

const makeMockRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

const ORIGINAL_ENV = { ...process.env };

describe('consignor price tags on the card paths', () => {
  /** Square-onboarded TEAMS organizer + PUBLISHED sale + AVAILABLE item + workspace + consignor + shopper. */
  const seed = async (key: string, price = 100) => {
    const orgUser = await prisma.user.create({
      data: { id: `ctag-org-user-${key}`, email: `ctag-org-${key}@findasale.test`, name: `Tag Organizer ${key}`, password: 'hashed_password', role: 'ORGANIZER', roles: ['ORGANIZER'] },
    });
    const organizer = await prisma.organizer.create({
      data: {
        userId: orgUser.id,
        businessName: `Tag Sales ${key}`,
        address: '219 E Michigan Ave, Paw Paw, MI 49079',
        subscriptionTier: 'TEAMS',
        squareOnboarded: true,
        squareMerchantId: `sq-merchant-ctag-${key}`,
        squareLocationId: `sq-location-ctag-${key}`,
        cashFeeBalance: 0,
      },
    });
    const sale = await prisma.sale.create({
      data: {
        organizerId: organizer.id,
        title: `Tag Sale ${key}`,
        description: 'Consignor tag fixture',
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
    const item = await prisma.item.create({
      data: { saleId: sale.id, title: `Tag Item ${key}`, description: 'Fixture', price, status: 'AVAILABLE', draftStatus: 'PUBLISHED', category: 'Furniture', embedding: [] },
    });
    const workspace = await prisma.organizerWorkspace.create({ data: { name: `Tag Workspace ${key}`, slug: `ctag-ws-${key}`, ownerId: organizer.id } });
    const consignor = await prisma.consignor.create({ data: { workspaceId: workspace.id, name: `Consignor ${key}`, commissionRate: 60 } });
    const shopper = await prisma.user.create({
      data: { id: `ctag-shopper-${key}`, email: `ctag-shopper-${key}@findasale.test`, name: `Tag Shopper ${key}`, password: 'hashed_password', role: 'USER', roles: ['USER'] },
    });
    const user = { id: orgUser.id, role: 'ORGANIZER', roles: ['ORGANIZER'], email: orgUser.email };
    const tag = (priceCents: number, nonce: string) => ({
      consignorId: consignor.id,
      nonce,
      sig: signTag({ saleId: sale.id, consignorId: consignor.id, priceCents, nonce }),
    });
    return { orgUser, organizer, sale, item, consignor, shopper, user, tag };
  };

  beforeAll(() => {
    process.env.POS_CONSIGNOR_TAGS_ENABLED = 'true';
    process.env.POS_TAG_SIGNING_SECRET = 'card-test-secret';
  });
  beforeEach(() => {
    process.env.POS_CONSIGNOR_TAGS_ENABLED = 'true';
    mockPreflightAccountStatus.mockReset();
    mockPreflightAccountStatus.mockResolvedValue({ ok: true, accessToken: 'fake-square-token-ctag' });
    mockCreateAndCapturePayment.mockReset();
  });
  afterAll(async () => {
    process.env = ORIGINAL_ENV;
    await prisma.$disconnect();
  });

  describe('manualCardPayment', () => {
    it('charges tag cents + the CNP fee, mints one SOLD CONSIGNOR_TAG item and records a Purchase carrying its itemId', async () => {
      const { sale, user, consignor, tag } = await seed('mc-happy');
      mockCreateAndCapturePayment.mockResolvedValueOnce({ ok: true, paymentId: 'sqp_ctag_happy', captured: true });

      const res = makeMockRes();
      await manualCardPayment({ user, body: { sourceId: 'cnon:ctag-happy', saleId: sale.id, items: [{ amount: 5, consignorTag: tag(500, 'mcnonce1') }] } } as any, res);

      expect(res.status).not.toHaveBeenCalledWith(400);
      expect(res.status).not.toHaveBeenCalledWith(403);
      expect(res.status).not.toHaveBeenCalledWith(500);
      const expectedCnp = Math.round(500 * 0.035) + 15;
      expect(mockCreateAndCapturePayment).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 500 + expectedCnp }));
      const body = res.json.mock.calls[0][0];
      expect(body.subtotalCents).toBe(500);
      expect(body.cnpFeeCents).toBe(expectedCnp);
      expect(body.purchaseIds.length).toBe(1);

      const purchase = await prisma.purchase.findUnique({ where: { id: body.purchaseIds[0] } });
      expect(purchase!.status).toBe('PAID');
      expect(purchase!.squarePaymentId).toBe('sqp_ctag_happy');
      expect(purchase!.itemId).not.toBeNull();
      expect(purchase!.amount).toBeCloseTo(5, 2);
      const minted = await prisma.item.findUnique({ where: { id: purchase!.itemId! } });
      expect(minted).toMatchObject({ listingType: 'CONSIGNOR_TAG', status: 'SOLD', isActive: false, consignorId: consignor.id, saleId: sale.id });
      expect(minted!.vendorBoothId).toBeNull(); // single-sale POS: no booth
      expect(minted!.photoUrls).toEqual([]);
    });

    it('a retry that lands on the SAME squarePaymentId records and mints nothing twice', async () => {
      const { sale, user, tag } = await seed('mc-retry');
      mockCreateAndCapturePayment.mockResolvedValue({ ok: true, paymentId: 'sqp_ctag_retry', captured: true });
      const body = { sourceId: 'cnon:ctag-retry', saleId: sale.id, items: [{ amount: 5, consignorTag: tag(500, 'mcnonce2') }] };

      const res1 = makeMockRes();
      await manualCardPayment({ user, body } as any, res1);
      const ids1: string[] = res1.json.mock.calls[0][0].purchaseIds;
      const res2 = makeMockRes();
      await manualCardPayment({ user, body } as any, res2);
      expect(res2.json.mock.calls[0][0].purchaseIds).toEqual(ids1);

      expect((await prisma.purchase.findMany({ where: { squarePaymentId: 'sqp_ctag_retry' } })).length).toBe(1);
      expect((await prisma.item.findMany({ where: { saleId: sale.id, listingType: 'CONSIGNOR_TAG' } })).length).toBe(1);
    });

    it('the tag is outside the discount base: 10% off a $100 item leaves the $5 tag at $5', async () => {
      const { sale, user, item, tag } = await seed('mc-discount', 100);
      mockCreateAndCapturePayment.mockResolvedValueOnce({ ok: true, paymentId: 'sqp_ctag_discount', captured: true });
      const res = makeMockRes();
      await manualCardPayment(
        { user, body: { sourceId: 'cnon:ctag-discount', saleId: sale.id, items: [{ itemId: item.id, amount: 100 }, { amount: 5, consignorTag: tag(500, 'mcnonce3') }], discountType: 'PERCENT', discountValue: 10 } } as any,
        res
      );
      expect(res.status).not.toHaveBeenCalledWith(400);
      const body = res.json.mock.calls[0][0];
      expect(body.subtotalCents).toBe(9000 + 500);
      const rows = await prisma.purchase.findMany({ where: { id: { in: body.purchaseIds } } });
      const tagRow = rows.find((r) => r.itemId && r.itemId !== item.id)!;
      expect(tagRow.amount).toBeCloseTo(5, 2);
      expect(tagRow.discountAmountCents).toBeNull();
      expect(rows.find((r) => r.itemId === item.id)!.discountAmountCents).toBe(1000);
    });

    it('refuses a tampered price with 400 TAG_SIGNATURE_INVALID before Square is called', async () => {
      const { sale, user, tag } = await seed('mc-tamper');
      const res = makeMockRes();
      await manualCardPayment({ user, body: { sourceId: 'cnon:ctag-tamper', saleId: sale.id, items: [{ amount: 0.5, consignorTag: tag(500, 'mcnonce4') }] } } as any, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'TAG_SIGNATURE_INVALID' }));
      expect(mockCreateAndCapturePayment).not.toHaveBeenCalled();
    });

    it('refuses with 403 CONSIGNOR_TAGS_DISABLED when the feature is switched off, before Square is called', async () => {
      const { sale, user, tag } = await seed('mc-off');
      process.env.POS_CONSIGNOR_TAGS_ENABLED = 'false';
      const res = makeMockRes();
      await manualCardPayment({ user, body: { sourceId: 'cnon:ctag-off', saleId: sale.id, items: [{ amount: 5, consignorTag: tag(500, 'mcnonce5') }] } } as any, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockCreateAndCapturePayment).not.toHaveBeenCalled();
    });
  });

  describe('createPaymentRequest lower bound with tag cents', () => {
    const lines = (t: { consignorId: string; nonce: string; sig: string }, amountCents: number) => [{ ...t, amountCents }];

    it('rejects a tag-only total below the verified tag cents (lowball) and creates nothing', async () => {
      const { sale, user, shopper, tag } = await seed('pr-lowball');
      const res = makeMockRes();
      await createPaymentRequest({ user, body: { shopperUserId: shopper.id, saleId: sale.id, itemIds: [], totalAmountCents: 100, consignorLines: lines(tag(500, 'prnonce1'), 500) } } as any, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockPreflightAccountStatus).not.toHaveBeenCalled();
      expect((await prisma.pOSPaymentRequest.findMany({ where: { saleId: sale.id } })).length).toBe(0);
    });

    it('accepts a tag-only total equal to the tag cents and stores the verified lines on the request', async () => {
      const { sale, user, shopper, consignor, tag } = await seed('pr-ok');
      const t = tag(500, 'prnonce2');
      const res = makeMockRes();
      await createPaymentRequest({ user, body: { shopperUserId: shopper.id, saleId: sale.id, itemIds: [], totalAmountCents: 500, consignorLines: lines(t, 500) } } as any, res);
      expect(res.status).toHaveBeenCalledWith(201);
      const stored = await prisma.pOSPaymentRequest.findFirst({ where: { saleId: sale.id } });
      expect((stored as any).consignorLines).toEqual([{ consignorId: consignor.id, nonce: 'prnonce2', sig: t.sig, priceCents: 500 }]);
    });

    it('catalog + tag: a total that covers only the catalog item is rejected, catalog + tag is accepted', async () => {
      const { sale, user, shopper, item, tag } = await seed('pr-mixed', 10);
      const low = makeMockRes();
      await createPaymentRequest({ user, body: { shopperUserId: shopper.id, saleId: sale.id, itemIds: [item.id], totalAmountCents: 1000, consignorLines: lines(tag(500, 'prnonce3'), 500) } } as any, low);
      expect(low.status).toHaveBeenCalledWith(400);

      const ok = makeMockRes();
      await createPaymentRequest({ user, body: { shopperUserId: shopper.id, saleId: sale.id, itemIds: [item.id], totalAmountCents: 1500, consignorLines: lines(tag(500, 'prnonce3'), 500) } } as any, ok);
      expect(ok.status).toHaveBeenCalledWith(201);
    });

    it('a tampered tag price creates nothing (400 TAG_SIGNATURE_INVALID)', async () => {
      const { sale, user, shopper, tag } = await seed('pr-tamper');
      const res = makeMockRes();
      await createPaymentRequest({ user, body: { shopperUserId: shopper.id, saleId: sale.id, itemIds: [], totalAmountCents: 1, consignorLines: lines(tag(500, 'prnonce4'), 1) } } as any, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'TAG_SIGNATURE_INVALID' }));
      expect((await prisma.pOSPaymentRequest.findMany({ where: { saleId: sale.id } })).length).toBe(0);
    });
  });
});
