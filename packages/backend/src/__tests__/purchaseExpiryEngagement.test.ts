/**
 * purchaseExpiryJob stranded-PAID reclaim now awards engagement (2026-09-29). Before this, a PENDING
 * purchase whose webhook was missed was flipped to PAID by the reclaim job but earned no purchase XP,
 * milestones, referral reward, badge, achievement or Sale Passport stamp.
 *
 * Proves: the Stripe reclaim and the Square reclaim each fire the shared engagement service ONCE per
 * payment group, for the first row that has a real shopper; a guest-only group fires nothing; a lost
 * race (webhook won, updateMany count 0), an abandoned PaymentIntent and a still-open Square order fire
 * nothing; and a failure scheduling the award never breaks the reclaim.
 */

jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('@sentry/node', () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));
jest.mock('../utils/cronGuard', () => ({ cronGuard: (_o: unknown, fn: unknown) => fn }));
jest.mock('../lib/prisma', () => ({
  prisma: {
    purchase: { findMany: jest.fn(), updateMany: jest.fn() },
    item: { findMany: jest.fn() },
    sale: { findMany: jest.fn() },
  },
}));
const mockRetrieve = jest.fn();
jest.mock('../utils/stripe', () => ({
  getStripe: () => ({ paymentIntents: { retrieve: mockRetrieve } }),
  getTestStripe: () => ({ paymentIntents: { retrieve: mockRetrieve } }),
}));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/squarePurchaseEngagementService', () => ({ fireSquarePurchaseEngagement: jest.fn() }));
jest.mock('../services/squareCheckoutLinkService', () => ({ getSquareOrderPaymentStatus: jest.fn() }));

import { prisma } from '../lib/prisma';
import { fireSquarePurchaseEngagement } from '../services/squarePurchaseEngagementService';
import { getSquareOrderPaymentStatus } from '../services/squareCheckoutLinkService';
import { fireReclaimEngagement, reclaimStalePurchases } from '../jobs/purchaseExpiryJob';

const db: any = prisma;
const fire = fireSquarePurchaseEngagement as jest.Mock;

const row = (over: any) => ({
  id: 'p1',
  stripePaymentIntentId: null,
  processor: 'STRIPE',
  saleId: 'sale_1',
  squareOrderId: null,
  squarePaymentLinkId: null,
  isTestTransaction: false,
  stripeAccountId: null,
  userId: 'u1',
  itemId: 'i1',
  createdAt: new Date('2026-09-29T00:00:00Z'),
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.PURCHASE_EXPIRY_RECLAIM_DISABLED;
  db.item.findMany.mockResolvedValue([]);
  db.sale.findMany.mockResolvedValue([{ id: 'sale_1', organizerId: 'org_1' }]);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('fireReclaimEngagement', () => {
  it('fires once, for the first row that has a shopper', () => {
    fireReclaimEngagement(['g1', 'p2', 'p3'], [null, 'u2', 'u3']);
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire).toHaveBeenCalledWith('p2');
  });

  it('fires nothing for a guest-only group', () => {
    fireReclaimEngagement(['g1', 'g2'], [null, null]);
    expect(fire).not.toHaveBeenCalled();
  });

  it('swallows a failure scheduling the award', () => {
    fire.mockImplementationOnce(() => { throw new Error('boom'); });
    expect(() => fireReclaimEngagement(['p1'], ['u1'])).not.toThrow();
  });
});

describe('reclaimStalePurchases, Stripe stranded-PAID', () => {
  const twoRowCart = [
    row({ id: 'p1', stripePaymentIntentId: 'pi_1', userId: 'u1', itemId: 'i1' }),
    row({ id: 'p2', stripePaymentIntentId: 'pi_1', userId: 'u1', itemId: 'i2' }),
  ];

  it('awards engagement once for the whole cart after flipping it to PAID', async () => {
    db.purchase.findMany.mockResolvedValue(twoRowCart);
    mockRetrieve.mockResolvedValue({ status: 'succeeded' });
    db.purchase.updateMany.mockResolvedValue({ count: 2 });
    await reclaimStalePurchases();
    expect(db.purchase.updateMany).toHaveBeenCalledWith({
      where: { stripePaymentIntentId: 'pi_1', status: 'PENDING' },
      data: { status: 'PAID' },
    });
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire).toHaveBeenCalledWith('p1');
  });

  it('awards nothing when the webhook won the race (updateMany count 0)', async () => {
    db.purchase.findMany.mockResolvedValue(twoRowCart);
    mockRetrieve.mockResolvedValue({ status: 'succeeded' });
    db.purchase.updateMany.mockResolvedValue({ count: 0 });
    await reclaimStalePurchases();
    expect(fire).not.toHaveBeenCalled();
  });

  it('awards nothing for an abandoned PaymentIntent (flipped to FAILED)', async () => {
    db.purchase.findMany.mockResolvedValue(twoRowCart);
    mockRetrieve.mockResolvedValue({ status: 'canceled' });
    db.purchase.updateMany.mockResolvedValue({ count: 2 });
    await reclaimStalePurchases();
    expect(db.purchase.updateMany.mock.calls[0][0].data).toEqual({ status: 'FAILED' });
    expect(fire).not.toHaveBeenCalled();
  });

  it('awards nothing for a guest checkout (no userId on any row)', async () => {
    db.purchase.findMany.mockResolvedValue([row({ id: 'p9', stripePaymentIntentId: 'pi_9', userId: null })]);
    mockRetrieve.mockResolvedValue({ status: 'succeeded' });
    db.purchase.updateMany.mockResolvedValue({ count: 1 });
    await reclaimStalePurchases();
    expect(fire).not.toHaveBeenCalled();
  });
});

describe('reclaimStalePurchases, Square stranded-PAID', () => {
  const sq = () => row({ id: 'p5', processor: 'SQUARE', squareOrderId: 'ord_1', userId: 'u5', itemId: 'i5' });

  it('awards engagement once after flipping a paid Square order to PAID', async () => {
    db.purchase.findMany.mockResolvedValue([sq()]);
    (getSquareOrderPaymentStatus as jest.Mock).mockResolvedValue({ ok: true, paid: true, state: 'COMPLETED', paymentId: 'sqp_1' });
    db.purchase.updateMany.mockResolvedValue({ count: 1 });
    await reclaimStalePurchases();
    expect(db.purchase.updateMany).toHaveBeenCalledWith({
      where: { squareOrderId: 'ord_1', status: 'PENDING' },
      data: { status: 'PAID', squarePaymentId: 'sqp_1' },
    });
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire).toHaveBeenCalledWith('p5');
  });

  it('awards nothing when the webhook won the race, the order was canceled, or it is still open', async () => {
    db.purchase.findMany.mockResolvedValue([sq()]);
    (getSquareOrderPaymentStatus as jest.Mock).mockResolvedValue({ ok: true, paid: true, state: 'COMPLETED', paymentId: 'sqp_1' });
    db.purchase.updateMany.mockResolvedValue({ count: 0 });
    await reclaimStalePurchases();
    (getSquareOrderPaymentStatus as jest.Mock).mockResolvedValue({ ok: true, paid: false, state: 'CANCELED' });
    db.purchase.updateMany.mockResolvedValue({ count: 1 });
    await reclaimStalePurchases();
    (getSquareOrderPaymentStatus as jest.Mock).mockResolvedValue({ ok: true, paid: false, state: 'OPEN' });
    await reclaimStalePurchases();
    expect(fire).not.toHaveBeenCalled();
  });
});
