/**
 * Consignor price tags at the HUB register (vendorBoothCartController).
 * NOT EXECUTED when written (jest cannot run on the authoring device); CI is the first real run.
 *
 * Rule under test (Patrick, 2026-10-06): "An organizer, not the mall, sets whether a piece is consigned." A tag is printed by the organizer
 * who owns the tag's SALE, so it is verified against THAT organizer and sells on THAT organizer's booth in the hub:
 *   - a vendor-organizer's tag resolves to the vendor's CONFIRMED booth
 *   - the hub owner's tag resolves to the house booth
 *   - an organizer with no confirmed booth here is refused (409 TAG_SELLER_NO_BOOTH)
 *   - the booth leg is created, totalled and fee-split like any item leg of that booth (vendor revenue share, cashier bonus, platform fee)
 *   - capture mints the SOLD CONSIGNOR_TAG item with organizerId + vendorBoothId + consignorId + saleId, in one transaction with its Purchase row
 * consignorTagService is REAL (signatures are genuinely signed and verified). Prisma is an in-memory fake of just what these paths touch.
 */
jest.mock('@sentry/node', () => ({ captureException: jest.fn() }));
jest.mock('../middleware/auth', () => ({}));
jest.mock('../middleware/requireBoothAuth', () => ({}));
jest.mock('../lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    saleHub: { findUnique: jest.fn() },
    sale: { findUnique: jest.fn() },
    organizer: { findUnique: jest.fn(), findMany: jest.fn() },
    organizerWorkspace: { findFirst: jest.fn() },
    consignor: { findMany: jest.fn() },
    vendorBooth: { findMany: jest.fn(), findUnique: jest.fn() },
    boothCartTransaction: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    boothCartLeg: { create: jest.fn() },
    item: { findMany: jest.fn() },
    purchase: { create: jest.fn(), count: jest.fn() },
  },
}));
jest.mock('../services/bulkLot/bulkLotConfig', () => ({ isBulkLotsEnabled: () => false }));
jest.mock('../services/bulkLot/bulkLotService', () => ({
  BULK_LOT_MESSAGES: {},
  findBulkLotItemIds: jest.fn(),
  isBulkLotError: () => false,
  parseBulkLineRequests: jest.fn(),
}));
jest.mock('../services/bulkLot/bulkLotBoothCartService', () => ({
  listCartLotLines: jest.fn(async () => []),
  removeCartLotLines: jest.fn(),
  reserveCartLotLines: jest.fn(),
  settleCartLotLine: jest.fn(),
}));
jest.mock('../utils/stripe', () => ({ getStripe: jest.fn() }));
jest.mock('../services/checkoutGuard', () => {
  class CheckoutGuardError extends Error {}
  return { CheckoutGuardError, assertBoothCartCheckoutAllowed: jest.fn() };
});
jest.mock('../controllers/ebayController', () => ({ endEbayListingIfExists: jest.fn() }));
jest.mock('../services/shopifyService', () => ({ markShopifyItemSold: jest.fn() }));
jest.mock('../services/marketplace/discogsListingConnector', () => ({ withdrawDiscogsListingIfExists: jest.fn() }));
jest.mock('../services/marketplace/reverbConnector', () => ({ withdrawReverbListingIfExists: jest.fn() }));
jest.mock('../services/facebookNudgeService', () => ({ notifyFacebookExportedItemSold: jest.fn() }));
jest.mock('../services/itemStockService', () => {
  class InsufficientStockError extends Error {}
  return { InsufficientStockError, sellItemUnits: jest.fn(), sellItemUnitsInTransaction: jest.fn() };
});
jest.mock('../services/marketplaceStockSyncService', () => ({ syncMarketplaceStock: jest.fn() }));
jest.mock('../services/receiptService', () => ({ generateReceipt: jest.fn(), sendBoothCartReceiptEmail: jest.fn() }));
jest.mock('../utils/feeCalculator', () => ({ calculateInclusiveCommissionCents: jest.fn() }));
jest.mock('../services/vendorBoothSaleNotificationService', () => ({ notifyVendorOfBoothSale: jest.fn() }));
jest.mock('../services/houseBoothService', () => ({ getOrCreateHouseBooth: jest.fn() }));
jest.mock('../services/vendorBoothCartLifecycleService', () => ({ releasePendingCartHold: jest.fn() }));
jest.mock('../services/connectAccountGuard', () => ({ isPayoutFlaggedForReview: jest.fn() }));
jest.mock('../services/cashierDiscretionService', () => ({
  computeCashierDiscretionCap: jest.fn(),
  resolveCashierDiscretion: jest.fn(),
  isCashierDiscretionGrantedTo: jest.fn(),
}));
jest.mock('../services/squarePaymentService', () => ({ resolveOrganizerSquareAccessToken: jest.fn() }));
jest.mock('../services/squareConnectService', () => ({ getSquareGrantedScopes: jest.fn(), SQUARE_ADDITIONAL_RECIPIENTS_SCOPE: 'PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS' }));
jest.mock('../services/squareVendorBoothCartService', () => ({
  resolveVendorBoothSquareAccessToken: jest.fn(),
  SquareBoothOnboardingIncompleteError: class extends Error {},
  createSquareSharedCardForCart: jest.fn(),
  authorizeSquareBoothCartLeg: jest.fn(),
  cancelSquareBoothCartLeg: jest.fn(),
  getSquareBoothCartLegStatus: jest.fn(),
  completeSquareBoothCartLeg: jest.fn(),
}));

import { prisma } from '../lib/prisma';
import { getOrCreateHouseBooth } from '../services/houseBoothService';
import { assertBoothCartCheckoutAllowed } from '../services/checkoutGuard';
import { listCartLotLines } from '../services/bulkLot/bulkLotBoothCartService';
import { calculateInclusiveCommissionCents } from '../utils/feeCalculator';
import { generateReceipt, sendBoothCartReceiptEmail } from '../services/receiptService';
import { notifyVendorOfBoothSale } from '../services/vendorBoothSaleNotificationService';
import { sellItemUnits } from '../services/itemStockService';
import { signTag } from '../services/consignorTagService';
import { addBoothCartConsignorTag, captureBoothCartCash, removeBoothCartConsignorTag } from '../controllers/vendorBoothCartController';

const db = prisma as any;
const asMock = (fn: unknown) => fn as jest.Mock;

const HUB = { id: 'hub1', isActive: true, organizerId: 'orgHub' };
const ORGANIZERS: Record<string, any> = {
  orgHub: { id: 'orgHub', userId: 'uHub', subscriptionTier: 'TEAMS' },
  orgVendor: { id: 'orgVendor', userId: 'uVendor', subscriptionTier: 'TEAMS' },
  orgNoBooth: { id: 'orgNoBooth', userId: 'uNoBooth', subscriptionTier: 'TEAMS' },
  orgFree: { id: 'orgFree', userId: 'uFree', subscriptionTier: 'SIMPLE' },
};
const SALES: Record<string, any> = {
  saleHub: { id: 'saleHub', organizerId: 'orgHub' },
  saleVendor: { id: 'saleVendor', organizerId: 'orgVendor' },
  saleNoBooth: { id: 'saleNoBooth', organizerId: 'orgNoBooth' },
  saleFree: { id: 'saleFree', organizerId: 'orgFree' },
};
// consignor id -> { workspace owner organizer id }
const CONSIGNORS: Record<string, any> = {
  conV: { id: 'conV', name: 'Pat Vendor', ownerId: 'orgVendor', archivedAt: null },
  conH: { id: 'conH', name: 'Hannah House', ownerId: 'orgHub', archivedAt: null },
  conN: { id: 'conN', name: 'Nora NoBooth', ownerId: 'orgNoBooth', archivedAt: null },
  conF: { id: 'conF', name: 'Fay Free', ownerId: 'orgFree', archivedAt: null },
};

let booths: any[];
let cart: any;
let legs: any[];
let mintedItems: any[];
let purchases: any[];
let txItemCreateFails: boolean;

function boothRow(over: Record<string, any>) {
  return {
    hubId: 'hub1',
    status: 'CONFIRMED',
    isHubOwnerBooth: false,
    revenueSharePercent: 0,
    stripeAccountId: null,
    hub: { organizer: { id: 'orgHub', squareMerchantId: null, subscriptionTier: 'TEAMS', stripeConnectId: 'acct_hub', stripeOnboarded: true, stripeAccountType: 'standard', squareOnboarded: false, squareLocationId: null } },
    ...over,
  };
}

function matchesWhere(b: any, where: any): boolean {
  if (where?.id?.in && !where.id.in.includes(b.id)) return false;
  if (typeof where?.id === 'string' && where.id !== b.id) return false;
  if (where?.userId?.in && !where.userId.in.includes(b.userId)) return false;
  if (where?.status && b.status !== where.status) return false;
  if (where?.hubId && b.hubId !== where.hubId) return false;
  return true;
}

function applyCartUpdate(data: any) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && 'increment' in (v as any)) cart[k] = Number(cart[k]) + Number((v as any).increment);
    else if (v && typeof v === 'object' && 'decrement' in (v as any)) cart[k] = Number(cart[k]) - Number((v as any).decrement);
    else cart[k] = v;
  }
}

function makeTx() {
  return {
    $executeRaw: jest.fn(async () => 1),
    boothCartTransaction: {
      findFirst: jest.fn(async () => ({ ...cart })),
      update: jest.fn(async ({ data }: any) => {
        applyCartUpdate(data);
        return { ...cart };
      }),
    },
    item: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async ({ where }: any) => mintedItems.find((i) => i.saleId === where.saleId && i.sku === where.sku) ?? null),
      create: jest.fn(async ({ data }: any) => {
        if (txItemCreateFails) throw new Error('db down');
        const row = { id: `tagitem_${mintedItems.length + 1}`, ...data };
        mintedItems.push(row);
        return { id: row.id };
      }),
    },
    consignor: {
      findFirst: jest.fn(async ({ where }: any) => {
        const c = CONSIGNORS[where.id];
        return c && c.ownerId === where.workspace?.ownerId ? { id: c.id, archivedAt: c.archivedAt } : null;
      }),
    },
    purchase: {
      findFirst: jest.fn(async ({ where }: any) => purchases.find((p) => p.itemId === where.itemId && p.boothCartTransactionId === where.boothCartTransactionId) ?? null),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `purchase_${purchases.length + 1}`, ...data };
        purchases.push(row);
        return row;
      }),
    },
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = jest.fn((c: number) => {
    res.statusCode = c;
    return res;
  });
  res.json = jest.fn((b: any) => {
    res.body = b;
    return res;
  });
  return res;
}

const TEAM_AUTH = { type: 'TEAM_MEMBER', teamMemberId: 'tm1', hubId: 'hub1' };

function req(body: any, boothAuth: any = TEAM_AUTH, extraParams: Record<string, string> = {}) {
  return { params: { hubId: 'hub1', cartTransactionId: 'cart1', ...extraParams }, body, boothAuth } as any;
}

function tagBody(over: Partial<{ saleId: string; consignorId: string; priceCents: number; nonce: string }> = {}) {
  const f = { saleId: 'saleVendor', consignorId: 'conV', priceCents: 500, nonce: 'nonceV1', ...over };
  return { saleId: f.saleId, consignorId: f.consignorId, priceCents: f.priceCents, nonce: f.nonce, sig: signTag(f) };
}

beforeEach(() => {
  jest.resetAllMocks();
  process.env.POS_CONSIGNOR_TAGS_ENABLED = 'true';
  process.env.POS_TAG_SIGNING_SECRET = 'hub-test-secret';
  booths = [
    boothRow({ id: 'boothV', userId: 'uVendor', boothNumber: '12', vendorName: 'Vera Vintage', revenueSharePercent: 10, stripeAccountId: 'acct_v' }),
    boothRow({ id: 'boothHouse', userId: 'uHub', boothNumber: 'HOUSE', vendorName: 'The Market', isHubOwnerBooth: true, stripeAccountId: 'acct_hub' }),
    // organizer orgNoBooth's user has only a PENDING (never confirmed) booth here
    boothRow({ id: 'boothPending', userId: 'uNoBooth', boothNumber: '99', vendorName: 'Pending Co', status: 'PENDING' }),
  ];
  cart = {
    id: 'cart1',
    hubId: 'hub1',
    status: 'PENDING',
    boothsRepresented: [] as string[],
    consignorLines: null as any,
    totalAmount: 0,
    cashierBoothId: null,
    cashierTeamMemberId: 'tm1',
  };
  legs = [];
  mintedItems = [];
  purchases = [];
  txItemCreateFails = false;

  db.saleHub.findUnique.mockImplementation(async () => ({ ...HUB }));
  db.sale.findUnique.mockImplementation(async ({ where }: any) => SALES[where.id] ?? null);
  db.organizer.findUnique.mockImplementation(async ({ where }: any) => ORGANIZERS[where.id] ?? null);
  db.organizer.findMany.mockImplementation(async ({ where }: any) => Object.values(ORGANIZERS).filter((o: any) => where.id.in.includes(o.id)));
  db.organizerWorkspace.findFirst.mockImplementation(async ({ where }: any) => ({ id: `ws_${where.ownerId}` }));
  db.consignor.findMany.mockImplementation(async ({ where }: any) =>
    Object.values(CONSIGNORS)
      .filter((c: any) => where.id.in.includes(c.id) && `ws_${c.ownerId}` === where.workspaceId)
      .map((c: any) => ({ id: c.id, name: c.name, workspaceId: `ws_${c.ownerId}`, archivedAt: c.archivedAt }))
  );
  db.vendorBooth.findMany.mockImplementation(async ({ where }: any) => booths.filter((b) => matchesWhere(b, where)));
  db.vendorBooth.findUnique.mockImplementation(async ({ where }: any) => booths.find((b) => b.id === where.id) ?? null);
  db.boothCartTransaction.findFirst.mockImplementation(async () => ({ ...cart }));
  db.boothCartTransaction.findUnique.mockImplementation(async () => ({ consignorLines: cart.consignorLines, hub: { organizerId: HUB.organizerId } }));
  db.boothCartTransaction.update.mockImplementation(async ({ data }: any) => {
    applyCartUpdate(data);
    return { ...cart };
  });
  db.boothCartTransaction.updateMany.mockImplementation(async ({ where, data }: any) => {
    const statuses = typeof where.status === 'string' ? [where.status] : where.status?.in ?? [];
    if (statuses.length && !statuses.includes(cart.status)) return { count: 0 };
    applyCartUpdate(data);
    return { count: 1 };
  });
  db.boothCartLeg.create.mockImplementation(async ({ data }: any) => {
    const row = { id: `leg_${legs.length + 1}`, squarePaymentId: null, processor: 'STRIPE', ...data };
    legs.push(row);
    return row;
  });
  db.item.findMany.mockResolvedValue([]);
  db.purchase.create.mockImplementation(async ({ data }: any) => {
    const row = { id: `purchase_${purchases.length + 1}`, ...data };
    purchases.push(row);
    return row;
  });
  db.purchase.count.mockResolvedValue(0);
  db.$transaction.mockImplementation(async (cb: any) => cb(makeTx()));

  asMock(getOrCreateHouseBooth).mockResolvedValue({ id: 'boothHouse', userId: 'uHub', stripeAccountId: 'acct_hub' });
  asMock(assertBoothCartCheckoutAllowed).mockResolvedValue(undefined);
  asMock(listCartLotLines).mockResolvedValue([]);
  asMock(calculateInclusiveCommissionCents).mockImplementation((amount: number) => Math.round(amount * 0.05));
  asMock(generateReceipt).mockResolvedValue(undefined);
  asMock(sendBoothCartReceiptEmail).mockResolvedValue(undefined);
  asMock(notifyVendorOfBoothSale).mockResolvedValue(undefined);
});

afterAll(() => {
  delete process.env.POS_CONSIGNOR_TAGS_ENABLED;
  delete process.env.POS_TAG_SIGNING_SECRET;
});

describe('hub register: adding a consignor tag resolves the SELLER\'s booth', () => {
  it('a vendor-organizer\'s tag lands on the vendor\'s CONFIRMED booth, with organizerId, saleId and booth stored on the line', async () => {
    const res = makeRes();
    await addBoothCartConsignorTag(req(tagBody()), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.line).toMatchObject({
      nonce: 'nonceV1',
      consignorName: 'Pat Vendor',
      priceCents: 500,
      saleId: 'saleVendor',
      vendorBoothId: 'boothV',
      boothNumber: '12',
      vendorName: 'Vera Vintage',
      isHouseBooth: false,
    });
    expect(cart.boothsRepresented).toEqual(['boothV']);
    expect(Number(cart.totalAmount)).toBe(5);
    expect(cart.consignorLines).toHaveLength(1);
    expect(cart.consignorLines[0]).toMatchObject({ consignorId: 'conV', organizerId: 'orgVendor', saleId: 'saleVendor', vendorBoothId: 'boothV', priceCents: 500 });
    // The vendor has their own confirmed booth, so the house booth is never created for them.
    expect(asMock(getOrCreateHouseBooth)).not.toHaveBeenCalled();
  });

  it('the hub owner\'s own tag resolves to the house booth', async () => {
    const res = makeRes();
    await addBoothCartConsignorTag(req(tagBody({ saleId: 'saleHub', consignorId: 'conH', nonce: 'nonceH1' })), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.line).toMatchObject({ vendorBoothId: 'boothHouse', isHouseBooth: true, consignorName: 'Hannah House', saleId: 'saleHub' });
    expect(cart.consignorLines[0]).toMatchObject({ organizerId: 'orgHub', vendorBoothId: 'boothHouse' });
    expect(cart.boothsRepresented).toEqual(['boothHouse']);
    // The hub owner's house booth is already a CONFIRMED booth of their user, so the lookup finds it directly.
    expect(asMock(getOrCreateHouseBooth)).not.toHaveBeenCalled();
  });

  it('the first hub-owner tag in a hub creates the house booth lazily (same as the hub owner\'s ordinary items do)', async () => {
    const house = booths.find((b) => b.id === 'boothHouse')!;
    booths = booths.filter((b) => b.id !== 'boothHouse');
    asMock(getOrCreateHouseBooth).mockImplementation(async () => {
      booths.push(house);
      return { id: 'boothHouse', userId: 'uHub', stripeAccountId: 'acct_hub' };
    });
    const res = makeRes();
    await addBoothCartConsignorTag(req(tagBody({ saleId: 'saleHub', consignorId: 'conH', nonce: 'nonceH1' })), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.line).toMatchObject({ vendorBoothId: 'boothHouse', isHouseBooth: true });
    expect(asMock(getOrCreateHouseBooth)).toHaveBeenCalledWith('hub1');
  });

  it('is refused (409 TAG_SELLER_NO_BOOTH) when the tag\'s seller has no CONFIRMED booth here, and the cart is untouched', async () => {
    const res = makeRes();
    await addBoothCartConsignorTag(req(tagBody({ saleId: 'saleNoBooth', consignorId: 'conN', nonce: 'nonceN1' })), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('TAG_SELLER_NO_BOOTH');
    expect(res.body.error).toBe("This tag's seller does not have a confirmed booth at this market.");
    expect(cart.boothsRepresented).toEqual([]);
    expect(cart.consignorLines).toBeNull();
    expect(Number(cart.totalAmount)).toBe(0);
  });

  it('a seller whose booth is no longer CONFIRMED is refused the same way', async () => {
    booths.find((b) => b.id === 'boothV')!.status = 'SUSPENDED';
    const res = makeRes();
    await addBoothCartConsignorTag(req(tagBody()), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('TAG_SELLER_NO_BOOTH');
  });

  it('the tag organizer (not the hub owner) must be TEAMS', async () => {
    const res = makeRes();
    await addBoothCartConsignorTag(req(tagBody({ saleId: 'saleFree', consignorId: 'conF', nonce: 'nonceF1' })), res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('TEAMS_REQUIRED');
  });

  it('keeps every earlier guard: forged signature, foreign consignor, archived consignor, duplicate nonce, unknown sale', async () => {
    const forged = { ...tagBody(), priceCents: 100 }; // price changed after signing
    let res = makeRes();
    await addBoothCartConsignorTag(req(forged), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('TAG_SIGNATURE_INVALID');

    // a validly signed tag naming a consignor of ANOTHER organizer's workspace
    res = makeRes();
    await addBoothCartConsignorTag(req(tagBody({ consignorId: 'conH', nonce: 'nonceX' })), res);
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('CONSIGNOR_NOT_FOUND');

    res = makeRes();
    await addBoothCartConsignorTag(req(tagBody({ saleId: 'nope', nonce: 'nonceY' })), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('TAG_INVALID');

    CONSIGNORS.conV.archivedAt = new Date();
    res = makeRes();
    await addBoothCartConsignorTag(req(tagBody({ nonce: 'nonceArch' })), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('CONSIGNOR_ARCHIVED');
    CONSIGNORS.conV.archivedAt = null;

    res = makeRes();
    await addBoothCartConsignorTag(req(tagBody()), res);
    expect(res.statusCode).toBe(200);
    res = makeRes();
    await addBoothCartConsignorTag(req(tagBody()), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('TAG_DUPLICATE');
    expect(cart.consignorLines).toHaveLength(1);
  });

  it('uses booth-cart auth: a BOOTH session may scan into its own cart only', async () => {
    cart.cashierBoothId = 'boothV';
    let res = makeRes();
    await addBoothCartConsignorTag(req(tagBody(), { type: 'BOOTH', vendorBoothId: 'boothV', hubId: 'hub1' }), res);
    expect(res.statusCode).toBe(200);

    res = makeRes();
    await addBoothCartConsignorTag(req(tagBody({ nonce: 'nonceV2' }), { type: 'BOOTH', vendorBoothId: 'someoneElse', hubId: 'hub1' }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('This cart belongs to another cashier');
  });

  it('removing the tag takes its booth back out of the cart when nothing else keeps it there', async () => {
    await addBoothCartConsignorTag(req(tagBody()), makeRes());
    expect(cart.boothsRepresented).toEqual(['boothV']);
    const res = makeRes();
    await removeBoothCartConsignorTag(req({}, TEAM_AUTH, { nonce: 'nonceV1' }), res);
    expect(res.statusCode).toBe(200);
    expect(cart.consignorLines).toEqual([]);
    expect(cart.boothsRepresented).toEqual([]);
    expect(Number(cart.totalAmount)).toBe(0);
  });
});

describe('hub register: cash capture of a tag-only leg on a NON-house booth', () => {
  async function fillVendorTagCart() {
    const res = makeRes();
    await addBoothCartConsignorTag(req(tagBody()), res);
    expect(res.statusCode).toBe(200);
  }

  it('creates the leg for the vendor booth, totals it, splits the fee like any item leg, mints the item with organizerId + vendorBoothId + consignorId', async () => {
    await fillVendorTagCart();
    const res = makeRes();
    await captureBoothCartCash(req({ cashReceivedCents: 1000 }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, itemsSold: 1, totalCents: 500, cashReceivedCents: 1000, changeCents: 500 });

    // one leg, on the vendor's booth, carrying the tag's $5.00
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ vendorBoothId: 'boothV', amountCents: 500, rail: 'CASH', status: 'CAPTURED', stripeAccountId: 'acct_v' });
    // Assisted checkout (a team member cashiered), vendor booth with a 10% revenue share:
    //   mall share = 10% of 500 = 50c, cashier bonus = 15% of 500 = 75c, hub-side cut = 125c; platform fee (mocked 5%) = 25c.
    expect(Number(legs[0].hubOwnerShareAmount)).toBeCloseTo(1.25, 5);
    expect(legs[0].cashierBonusCents).toBe(75);
    expect(legs[0].platformFeeCents).toBe(25);

    // the minted SOLD tag item belongs to the tag's organizer and the vendor's booth
    expect(mintedItems).toHaveLength(1);
    expect(mintedItems[0]).toMatchObject({
      listingType: 'CONSIGNOR_TAG',
      status: 'SOLD',
      isActive: false,
      stockTotal: 1,
      stockSold: 1,
      consignorId: 'conV',
      organizerId: 'orgVendor', // NOT the hub owner
      vendorBoothId: 'boothV',
      saleId: 'saleVendor',
      price: 5,
      photoUrls: [],
      sku: 'CTAG-cart1-nonceV1',
    });
    // its Purchase row carries the item and the cart, written in the same transaction
    expect(purchases).toHaveLength(1);
    expect(purchases[0]).toMatchObject({ itemId: mintedItems[0].id, boothCartTransactionId: 'cart1', amount: 5, userId: null, status: 'PAID', source: 'POS' });
    // no stock to sell and no listing to withdraw for a tag
    expect(asMock(sellItemUnits)).not.toHaveBeenCalled();
    expect(cart.status).toBe('COMPLETED');
    expect(asMock(notifyVendorOfBoothSale)).toHaveBeenCalledWith('leg_1');
  });

  it('self-checkout by the vendor\'s own booth waives the mall cut and the cashier bonus; the platform fee stays', async () => {
    cart.cashierBoothId = 'boothV';
    const added = makeRes();
    await addBoothCartConsignorTag(req(tagBody(), { type: 'BOOTH', vendorBoothId: 'boothV', hubId: 'hub1' }), added);
    expect(added.statusCode).toBe(200);
    const res = makeRes();
    await captureBoothCartCash(req({ cashReceivedCents: 500 }, { type: 'BOOTH', vendorBoothId: 'boothV', hubId: 'hub1' }), res);
    expect(res.statusCode).toBe(200);
    expect(legs[0].hubOwnerShareAmount).toBeNull();
    expect(legs[0].cashierBonusCents).toBe(0);
    expect(legs[0].platformFeeCents).toBe(25);
  });

  it('a hub owner\'s tag rides the house booth leg: platform fee only, no mall cut, minted on the house booth with the hub owner as organizer', async () => {
    await addBoothCartConsignorTag(req(tagBody({ saleId: 'saleHub', consignorId: 'conH', nonce: 'nonceH1' })), makeRes());
    const res = makeRes();
    await captureBoothCartCash(req({ cashReceivedCents: 500 }), res);
    expect(res.statusCode).toBe(200);
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ vendorBoothId: 'boothHouse', amountCents: 500, cashierBonusCents: 0, platformFeeCents: 25 });
    expect(legs[0].hubOwnerShareAmount).toBeNull();
    expect(mintedItems[0]).toMatchObject({ organizerId: 'orgHub', vendorBoothId: 'boothHouse', consignorId: 'conH', saleId: 'saleHub' });
  });

  it('a vendor tag and a house tag in one cart make TWO legs (one per booth), each totalled on its own', async () => {
    await addBoothCartConsignorTag(req(tagBody()), makeRes());
    await addBoothCartConsignorTag(req(tagBody({ saleId: 'saleHub', consignorId: 'conH', nonce: 'nonceH1', priceCents: 300 })), makeRes());
    expect(Number(cart.totalAmount)).toBe(8);
    const res = makeRes();
    await captureBoothCartCash(req({ cashReceivedCents: 800 }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.totalCents).toBe(800);
    expect(legs.map((l) => [l.vendorBoothId, l.amountCents]).sort()).toEqual([
      ['boothHouse', 300],
      ['boothV', 500],
    ]);
    expect(mintedItems.map((i) => i.vendorBoothId).sort()).toEqual(['boothHouse', 'boothV']);
  });

  it('refuses checkout (403, cart stays open, nothing written) when the seller\'s booth stopped being theirs after the scan', async () => {
    await fillVendorTagCart();
    booths.find((b) => b.id === 'boothV')!.status = 'SUSPENDED';
    const res = makeRes();
    await captureBoothCartCash(req({ cashReceivedCents: 500 }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toContain('can no longer be used');
    expect(cart.status).toBe('PENDING');
    expect(legs).toHaveLength(0);
    expect(mintedItems).toHaveLength(0);
    expect(purchases).toHaveLength(0);
  });

  it('refuses checkout when the tag organizer\'s TEAMS tier lapsed after the scan', async () => {
    await fillVendorTagCart();
    ORGANIZERS.orgVendor.subscriptionTier = 'SIMPLE';
    try {
      const res = makeRes();
      await captureBoothCartCash(req({ cashReceivedCents: 500 }), res);
      expect(res.statusCode).toBe(403);
      expect(legs).toHaveLength(0);
    } finally {
      ORGANIZERS.orgVendor.subscriptionTier = 'TEAMS';
    }
  });

  it('keeps crediting a consignor archived after the scan (allowArchived at mint, refuseArchived off at the re-check)', async () => {
    await fillVendorTagCart();
    CONSIGNORS.conV.archivedAt = new Date();
    try {
      const res = makeRes();
      await captureBoothCartCash(req({ cashReceivedCents: 500 }), res);
      expect(res.statusCode).toBe(200);
      expect(mintedItems[0]).toMatchObject({ consignorId: 'conV' });
    } finally {
      CONSIGNORS.conV.archivedAt = null;
    }
  });

  it('if the mint fails after capture it logs loudly and still writes an item-less Purchase row, so the money is recorded', async () => {
    await fillVendorTagCart();
    txItemCreateFails = true;
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const res = makeRes();
      await captureBoothCartCash(req({ cashReceivedCents: 500 }), res);
      expect(res.statusCode).toBe(200);
      expect(res.body.itemsSold).toBe(1);
      expect(mintedItems).toHaveLength(0);
      expect(purchases).toHaveLength(1);
      expect(purchases[0]).toMatchObject({ itemId: null, amount: 5, boothCartTransactionId: 'cart1' });
      expect(err.mock.calls.some((c) => String(c[0]).includes('CONSIGNOR TAG MINT FAILED'))).toBe(true);
    } finally {
      err.mockRestore();
    }
  });

  it('a cart whose only line is a tag is not "empty" and a short cash tender is refused against the tag total', async () => {
    await fillVendorTagCart();
    const res = makeRes();
    await captureBoothCartCash(req({ cashReceivedCents: 499 }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.totalCents).toBe(500);
    expect(legs).toHaveLength(0);
  });
});
