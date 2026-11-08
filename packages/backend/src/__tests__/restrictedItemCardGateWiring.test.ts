/**
 * Restricted-item card gate: WIRING at a real card path (2026-11-06), against a real Postgres (CI findasale_test).
 *
 * Square blocks no class today, so the processor rule table is mocked here to make SQUARE behave like FINIX for
 * JEWELRY. That isolates what this file proves: manualCardPayment (POS manual card entry) re-reads the class from the
 * database, refuses the card charge with the per-item split, never reaches Square when blocked, lets a cashier who put
 * the blocked item in the cash leg through, and honors an organizer card suspension written by the admin service.
 * The gate's own rules are covered in services/restrictedItem/__tests__.
 */
import { prisma } from '../lib/prisma';

var mockPreflightAccountStatus = jest.fn();
var mockCreateAndCapturePayment = jest.fn();

jest.mock('../services/restrictedItem/cardProcessorRules', () => {
  const actual = jest.requireActual('../services/restrictedItem/cardProcessorRules');
  const table = { ...actual.CARD_PROCESSOR_BLOCKED_CLASSES, SQUARE: ['JEWELRY'] };
  return {
    ...actual,
    CARD_PROCESSOR_BLOCKED_CLASSES: table,
    blockedClassesFor: (p: string) => (table as any)[p] ?? actual.blockedClassesFor(p),
    isClassBlockedFor: (p: string, c: string) => c !== 'NONE' && ((table as any)[p] ?? actual.blockedClassesFor(p)).includes(c),
  };
});
jest.mock('../services/squarePosPaymentAdapter', () => ({
  preflightAccountStatus: (...args: any[]) => mockPreflightAccountStatus(...args),
  createAndCapturePayment: (...args: any[]) => mockCreateAndCapturePayment(...args),
}));
jest.mock('../lib/socket', () => ({ getIO: jest.fn(() => ({ to: jest.fn().mockReturnValue({ emit: jest.fn() }) })) }));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../controllers/ebayController', () => ({ endEbayListingIfExists: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/shopifyService', () => ({ markShopifyItemSold: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/facebookNudgeService', () => ({ notifyFacebookExportedItemSold: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/marketplaceStockSyncService', () => ({ syncMarketplaceStock: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/checkoutGuard', () => ({
  assertCheckoutAllowed: jest.fn().mockResolvedValue(undefined),
  recordSuspectedSignal: jest.fn().mockResolvedValue(undefined),
  CheckoutGuardError: class CheckoutGuardError extends Error {},
}));

import { manualCardPayment } from '../controllers/posPaymentController';
import { setOrganizerCardSuspension, type SuspensionTxClient } from '../services/restrictedItem/cardSuspensionService';

const RUN = Math.random().toString(36).slice(2, 8);
const makeRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

async function seed(key: string) {
  const id = `rgw-${RUN}-${key}`;
  const orgUser = await prisma.user.create({
    data: { id: `${id}-u`, email: `${id}@findasale.test`, name: 'Gate Wiring', password: 'x', role: 'ORGANIZER', roles: ['ORGANIZER'] },
  });
  const organizer = await prisma.organizer.create({
    data: {
      userId: orgUser.id,
      businessName: `ZZTEST Gate Wiring ${key}`,
      address: '219 E Michigan Ave, Paw Paw, MI 49079',
      subscriptionTier: 'TEAMS',
      squareOnboarded: true,
      squareMerchantId: `sq-m-${id}`,
      squareLocationId: `sq-l-${id}`,
      cashFeeBalance: 0,
    },
  });
  const sale = await prisma.sale.create({
    data: {
      organizerId: organizer.id,
      title: 'Gate Wiring Sale',
      description: 'fixture',
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
  const mk = (title: string, price: number) =>
    prisma.item.create({
      data: { saleId: sale.id, organizerId: organizer.id, title, description: 'Fixture', price, status: 'AVAILABLE', draftStatus: 'PUBLISHED', embedding: [] },
    });
  const lamp = await mk('Brass Table Lamp', 30);
  const ring = await mk('14k Gold Ring Size 7', 40);
  return { orgUser, organizer, sale, lamp, ring };
}

const reqFor = (orgUser: any, body: any): any => ({
  user: { id: orgUser.id, role: 'ORGANIZER', roles: ['ORGANIZER'], email: orgUser.email },
  body,
});

beforeEach(() => {
  mockPreflightAccountStatus.mockReset();
  mockPreflightAccountStatus.mockResolvedValue({ ok: true, accessToken: 'fake-token' });
  mockCreateAndCapturePayment.mockReset();
  mockCreateAndCapturePayment.mockResolvedValue({ ok: true, paymentId: `sqp-${RUN}-${Math.random()}`, captured: true });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('manualCardPayment is gated by the restricted-item card gate', () => {
  it('a mixed cart charged fully to card is refused with the split, and Square is never called', async () => {
    const { orgUser, sale, lamp, ring } = await seed('mixed');
    const res = makeRes();
    await manualCardPayment(
      reqFor(orgUser, {
        sourceId: 'cnon:test',
        saleId: sale.id,
        items: [
          { itemId: lamp.id, amount: 30, label: lamp.title },
          { itemId: ring.id, amount: 40, label: ring.title },
        ],
      }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(409);
    const body = res.json.mock.calls[0][0];
    expect(body.code).toBe('CARD_PAYMENT_BLOCKED');
    expect(body.split.cardAmountCents).toBe(3000);
    expect(body.split.cashAmountCents).toBe(4000);
    expect(body.split.blockedItems).toEqual([{ itemId: ring.id, amountCents: 4000, restrictedClass: 'JEWELRY', reason: 'RESTRICTED_CLASS' }]);
    expect(mockCreateAndCapturePayment).not.toHaveBeenCalled();
    expect(await prisma.purchase.count({ where: { saleId: sale.id } })).toBe(0);
    const audit = await prisma.restrictedItemAuditLog.findFirst({ where: { itemIds: { has: ring.id }, kind: 'PAYMENT_SPLIT' } });
    expect(audit?.source).toBe('square.pos.manualCard');
    expect(JSON.stringify(audit)).not.toContain('cnon:test');
  });

  it('the same cart with the blocked item in the cash leg goes through, card charged only for the allowed item', async () => {
    const { orgUser, sale, lamp, ring } = await seed('split');
    const res = makeRes();
    await manualCardPayment(
      reqFor(orgUser, {
        sourceId: 'cnon:test',
        saleId: sale.id,
        cashAmountCents: 4000,
        items: [
          { itemId: lamp.id, amount: 30, label: lamp.title },
          { itemId: ring.id, amount: 40, label: ring.title },
        ],
      }),
      res,
    );
    expect(res.status).not.toHaveBeenCalledWith(409);
    expect(mockCreateAndCapturePayment).toHaveBeenCalledTimes(1);
    expect(mockCreateAndCapturePayment.mock.calls[0][0].amountCents).toBe(3000);
  });

  it('the class is re-read from the database: a raw-SQL rename of the lamp into jewelry is caught', async () => {
    const { orgUser, sale, lamp } = await seed('reread');
    await prisma.$executeRaw`UPDATE "Item" SET "title" = 'Pearl Necklace' WHERE "id" = ${lamp.id}`;
    const res = makeRes();
    await manualCardPayment(reqFor(orgUser, { sourceId: 'cnon:test', saleId: sale.id, items: [{ itemId: lamp.id, amount: 30, label: 'x' }] }), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockCreateAndCapturePayment).not.toHaveBeenCalled();
  });

  it('an organizer card suspension refuses every card charge, even an unrestricted item', async () => {
    const { orgUser, organizer, sale, lamp } = await seed('suspended');
    await setOrganizerCardSuspension(prisma as unknown as SuspensionTxClient, { organizerId: organizer.id, suspend: true, reason: 'test hold', adminUserId: 'admin-x' });
    const res = makeRes();
    await manualCardPayment(reqFor(orgUser, { sourceId: 'cnon:test', saleId: sale.id, items: [{ itemId: lamp.id, amount: 30, label: 'x' }] }), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].split.organizerCardSuspended).toBe(true);
    expect(mockCreateAndCapturePayment).not.toHaveBeenCalled();
  });

  it('an organizer cannot lower the class through a Prisma write (mass assignment is stripped)', async () => {
    const { orgUser, sale, ring } = await seed('massassign');
    await prisma.item.update({ where: { id: ring.id }, data: { restrictedClass: 'NONE', restrictedClassOverride: 'NONE' } as any });
    const res = makeRes();
    await manualCardPayment(reqFor(orgUser, { sourceId: 'cnon:test', saleId: sale.id, items: [{ itemId: ring.id, amount: 40, label: 'x' }] }), res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
});
