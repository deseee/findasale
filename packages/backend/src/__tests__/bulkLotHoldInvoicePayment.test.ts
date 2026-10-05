/**
 * bulkLotHoldInvoicePayment (ADR-136 Addendum B, roadmap #659): a bulk lot line on a hold invoice settles against its
 * BulkLotHold, not as one unit.
 *
 * WHAT THIS PROVES (a lot of 10,000 cards at $8 per 1,000, a hold of 1,500 cards = $12.00):
 *   - an ACTIVE hold is converted (the cards already left the lot): the hold flips ACTIVE to CONVERTED, NO second stock
 *     decrement is made, and the Purchase row carries bulkQuantity = 1,500 and the hold's snapshot amount
 *   - a hold whose cards were already given back (EXPIRED) is re-reserved: the guarded decrement runs for exactly the held
 *     cards and the hold becomes CONVERTED
 *   - a lot line with no hold on the invoice is never sold as one unit: no Purchase row, no decrement
 *   - the Purchase row's hold gets its purchaseId
 * The DB, processors and cross-channel hooks are mocks.
 */
jest.mock('@sentry/node', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));
jest.mock('../lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    holdInvoice: { findUnique: jest.fn() },
    item: { findMany: jest.fn() },
    itemReservation: { findMany: jest.fn() },
    itemBulkLot: { findMany: jest.fn() },
  },
}));
jest.mock('../lib/socket', () => ({ getIO: jest.fn(() => ({})) }));
jest.mock('../services/liveFeedService', () => ({ pushEvent: jest.fn() }));
jest.mock('../services/itemStockService', () => {
  class InsufficientStockError extends Error {}
  return { sellItemUnits: jest.fn(), InsufficientStockError };
});
jest.mock('../controllers/ebayController', () => ({ endEbayListingIfExists: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/shopifyService', () => ({ markShopifyItemSold: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/marketplace/discogsListingConnector', () => ({ withdrawDiscogsListingIfExists: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/marketplace/reverbConnector', () => ({ withdrawReverbListingIfExists: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/marketplace/etsyConnector', () => ({ withdrawEtsyListingIfExists: jest.fn().mockResolvedValue('skipped') }));
jest.mock('../services/facebookNudgeService', () => ({ notifyFacebookExportedItemSold: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/marketplaceStockSyncService', () => ({ syncMarketplaceStock: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../lib/transactionalEmailService', () => ({ transactionalEmailService: { emails: { send: jest.fn().mockResolvedValue(undefined) } } }));
jest.mock('../services/stripeConnectService', () => ({ shouldUseDirectCharge: jest.fn().mockResolvedValue(false) }));
jest.mock('../services/squarePurchaseEngagementService', () => ({ fireSquarePurchaseEngagement: jest.fn() }));
jest.mock('../services/xpService', () => ({ awardXp: jest.fn().mockResolvedValue({}), XP_AWARDS: {} }));

import { prisma } from '../lib/prisma';
import { sellItemUnits, InsufficientStockError } from '../services/itemStockService';
import { markHoldInvoicePaid } from '../services/holdInvoicePaymentRecorder';

const db: any = prisma;
const flush = () => new Promise((r) => setImmediate(r));

const LOT = { id: 'lot1', title: 'Commons', price: 8 };

const invoice = (over: any = {}) => ({
  id: 'inv_1',
  status: 'PENDING',
  saleId: 'sale_1',
  shopperUserId: null,
  organizerUserId: 'ou1',
  itemIds: ['lot1'],
  totalAmount: 1200,
  platformFeeAmount: 0,
  cashAmountCents: 1200,
  chargeType: null,
  stripeAccountId: null,
  guestEmail: null,
  guestName: 'Sam',
  shippingAddressLine1: null,
  sale: { id: 'sale_1', organizerId: 'org_1', title: 'Card Show' },
  shopper: null,
  organizer: { id: 'ou1', email: 'o@example.com', name: 'Org' },
  ...over,
});

function makeTx(holds: any[], opts: { flipCount?: number } = {}) {
  const purchases: any[] = [];
  const holdUpdates: any[] = [];
  const tx: any = {
    holdInvoice: {
      updateMany: jest.fn().mockResolvedValue({ count: opts.flipCount ?? 1 }),
      findUnique: jest.fn().mockResolvedValue({ status: 'PAID' }),
    },
    itemReservation: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    item: { findUnique: jest.fn().mockResolvedValue({ stockTotal: 10000, stockSold: 1500 }) },
    bulkLotHold: {
      findMany: jest.fn().mockResolvedValue(holds),
      updateMany: jest.fn().mockImplementation(async (arg: any) => {
        holdUpdates.push(arg);
        const target = holds.find((h) => h.id === arg.where.id);
        const allowed = !arg.where.status || (typeof arg.where.status === 'string' ? target?.status === arg.where.status : (arg.where.status.in as string[]).includes(target?.status));
        if (target && allowed && arg.data.status) target.status = arg.data.status;
        return { count: target && allowed ? 1 : 0 };
      }),
    },
    purchase: {
      create: jest.fn().mockImplementation(async ({ data }: any) => {
        purchases.push(data);
        return { id: `pur_${purchases.length}` };
      }),
    },
    notification: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    organizer: {
      findUnique: jest.fn().mockResolvedValue({ id: 'org_1', subscriptionTier: 'SIMPLE', referralDiscountExpiry: null }),
      update: jest.fn().mockResolvedValue({}),
    },
    cashFeeAccrual: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  return { tx, purchases, holdUpdates };
}

async function run(inv: any, tx: any) {
  db.holdInvoice.findUnique.mockResolvedValue(inv);
  db.item.findMany.mockResolvedValue([LOT]);
  db.itemReservation.findMany.mockResolvedValue([]);
  db.itemBulkLot.findMany.mockResolvedValue([{ itemId: 'lot1' }]);
  db.$transaction.mockImplementation(async (cb: any) => cb(tx));
  const res = await markHoldInvoicePaid('inv_1', { processor: 'STRIPE', externalPaymentId: null }, { source: 'pos-cash' });
  await flush();
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  (sellItemUnits as jest.Mock).mockResolvedValue({ fullySoldOut: false, remainingStock: 5000 });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('hold invoice with a bulk lot line, ACTIVE hold', () => {
  it('converts the hold, makes no second stock decrement, and records the cards and the snapshot amount', async () => {
    const hold = { id: 'h1', itemId: 'lot1', quantity: 1500, lineCents: 1200, status: 'ACTIVE' };
    const { tx, purchases } = makeTx([hold]);
    const res = await run(invoice(), tx);
    expect(res.recorded).toBe(true);
    expect(sellItemUnits).not.toHaveBeenCalled();
    expect(hold.status).toBe('CONVERTED');
    expect(purchases).toHaveLength(1);
    expect(purchases[0].bulkQuantity).toBe(1500);
    expect(Math.round(purchases[0].amount * 100)).toBe(1200);
  });

  it('stamps the hold with the Purchase row it became', async () => {
    const hold = { id: 'h1', itemId: 'lot1', quantity: 1500, lineCents: 1200, status: 'ACTIVE' };
    const { tx, holdUpdates } = makeTx([hold]);
    await run(invoice(), tx);
    expect(holdUpdates.some((u) => u.where.id === 'h1' && u.data.purchaseId === 'pur_1')).toBe(true);
  });

  it('prices the row at the hold snapshot even if the lot price changed since', async () => {
    const hold = { id: 'h1', itemId: 'lot1', quantity: 1500, lineCents: 1200, status: 'ACTIVE' };
    db.item.findMany.mockResolvedValue([{ ...LOT, price: 20 }]);
    const { tx, purchases } = makeTx([hold]);
    db.holdInvoice.findUnique.mockResolvedValue(invoice());
    db.itemBulkLot.findMany.mockResolvedValue([{ itemId: 'lot1' }]);
    db.$transaction.mockImplementation(async (cb: any) => cb(tx));
    await markHoldInvoicePaid('inv_1', { processor: 'STRIPE', externalPaymentId: null }, { source: 'pos-cash' });
    await flush();
    expect(Math.round(purchases[0].amount * 100)).toBe(1200);
  });
});

describe('hold invoice with a bulk lot line, hold already given back', () => {
  it('re-reserves exactly the held cards and converts the hold', async () => {
    const hold = { id: 'h1', itemId: 'lot1', quantity: 1500, lineCents: 1200, status: 'EXPIRED' };
    const { tx, purchases } = makeTx([hold]);
    await run(invoice(), tx);
    expect(sellItemUnits).toHaveBeenCalledTimes(1);
    expect((sellItemUnits as jest.Mock).mock.calls[0].slice(0, 2)).toEqual(['lot1', 1500]);
    expect(hold.status).toBe('CONVERTED');
    expect(purchases[0].bulkQuantity).toBe(1500);
  });

  it('a re-reserve that finds too few cards sells nothing and writes no Purchase row', async () => {
    const hold = { id: 'h1', itemId: 'lot1', quantity: 1500, lineCents: 1200, status: 'RELEASED' };
    (sellItemUnits as jest.Mock).mockRejectedValue(new InsufficientStockError('short'));
    const { tx, purchases } = makeTx([hold]);
    await run(invoice(), tx);
    expect(purchases).toHaveLength(0);
    expect(hold.status).toBe('RELEASED');
  });
});

describe('hold invoice with a bulk lot line, no hold on the invoice', () => {
  it('never sells the lot as one unit', async () => {
    const { tx, purchases } = makeTx([]);
    await run(invoice(), tx);
    expect(purchases).toHaveLength(0);
    expect(sellItemUnits).not.toHaveBeenCalled();
  });
});
