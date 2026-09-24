/**
 * reverbSoldSyncCron.ts -- unit tests (2026-09-23). Order shape follows reverb-api.com/docs/retrieve-orders
 * (GET /api/my/orders/selling/all -> orders[].order_number, .status, .product_id = listing id),
 * normalized by reverbConnector's normalizeReverbOrder.
 */

jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../../lib/prisma', () => ({ prisma: {} }));
jest.mock('../../utils/cronGuard', () => ({ cronGuard: (_o: any, fn: any) => fn }));
jest.mock('../../lib/notificationService', () => ({ createNotification: jest.fn() }));
jest.mock('../../services/marketplace/reverbConnector', () => ({ fetchRecentReverbSellerOrders: jest.fn() }));
jest.mock('../../services/facebookNativeSaleService', () => ({
  commitFacebookNativeSale: jest.fn(async () => ({ ok: true, alreadyCommitted: false })),
}));

import {
  syncReverbSoldItemsForOrganizer,
  matchReverbOrdersToItems,
  isVoidReverbOrderStatus,
  REVERB_ORDER_LOOKBACK_DAYS,
} from '../reverbSoldSyncCron';
import { commitFacebookNativeSale } from '../../services/facebookNativeSaleService';

const ITEMS = [
  { id: 'item_amp', title: 'Samick LA15R guitar amp', saleId: 'sale_1', reverbListingId: '101889751' },
  { id: 'item_pedal', title: 'Boss DS-1 pedal', saleId: null, reverbListingId: '101889000' },
];

describe('matchReverbOrdersToItems', () => {
  it('matches by Reverb listing id and ignores cancelled and refunded orders', () => {
    const orders = [
      { orderNumber: '1', status: 'cancelled', listingId: '101889000' },
      { orderNumber: '2', status: 'refunded', listingId: '101889000' },
      { orderNumber: '3', status: 'paid', listingId: '101889751' },
      { orderNumber: '4', status: 'paid', listingId: '999' },
    ];
    expect(matchReverbOrdersToItems(orders, ITEMS)).toEqual([{ itemId: 'item_amp', orderNumber: '3' }]);
  });
  it('matches each item once even if two orders name it', () => {
    const orders = [
      { orderNumber: 'a', status: 'paid', listingId: '101889751' },
      { orderNumber: 'b', status: 'shipped', listingId: '101889751' },
    ];
    expect(matchReverbOrdersToItems(orders, ITEMS)).toEqual([{ itemId: 'item_amp', orderNumber: 'a' }]);
  });
  it('does not treat an unpaid or pending order as a sale yet', () => {
    const orders = [
      { orderNumber: 'u', status: 'unpaid', listingId: '101889751' },
      { orderNumber: 'p', status: 'payment_pending', listingId: '101889751' },
    ];
    expect(matchReverbOrdersToItems(orders, ITEMS)).toEqual([]);
  });
  it('knows the void statuses', () => {
    expect(isVoidReverbOrderStatus('cancelled')).toBe(true);
    expect(isVoidReverbOrderStatus('refunded')).toBe(true);
    expect(isVoidReverbOrderStatus('received')).toBe(false);
  });
});

describe('syncReverbSoldItemsForOrganizer', () => {
  it('makes no API call when nothing is live on Reverb', async () => {
    const fetchOrders = jest.fn();
    const r = await syncReverbSoldItemsForOrganizer('org_1', { loadListedItems: async () => [], fetchOrders });
    expect(fetchOrders).not.toHaveBeenCalled();
    expect(r.sold).toEqual([]);
  });

  it('does nothing without an active Reverb connection', async () => {
    const commitSale = jest.fn();
    const r = await syncReverbSoldItemsForOrganizer('org_1', { loadListedItems: async () => ITEMS, fetchOrders: async () => null, commitSale });
    expect(commitSale).not.toHaveBeenCalled();
    expect(r.checkedOrders).toBe(0);
  });

  it('asks for a bounded lookback window', async () => {
    const fetchOrders = jest.fn(async () => []);
    const now = new Date('2026-09-23T12:00:00.000Z');
    await syncReverbSoldItemsForOrganizer('org_1', { loadListedItems: async () => ITEMS, fetchOrders, now: () => now });
    const since = (fetchOrders.mock.calls[0] as any[])[1] as Date;
    expect(now.getTime() - since.getTime()).toBe(REVERB_ORDER_LOOKBACK_DAYS * 86400000);
  });

  it('commits a real Reverb sale once and notifies; a repeat is counted as alreadySold', async () => {
    const orders = [{ orderNumber: '555', status: 'paid', listingId: '101889751' }];
    const commitSale = jest.fn().mockResolvedValueOnce({ alreadyCommitted: false }).mockResolvedValueOnce({ alreadyCommitted: true });
    const notify = jest.fn(async () => undefined);
    const deps = { loadListedItems: async () => ITEMS, fetchOrders: async () => orders, commitSale, notify };
    const first = await syncReverbSoldItemsForOrganizer('org_1', deps);
    expect(first.sold).toEqual([{ itemId: 'item_amp', orderNumber: '555' }]);
    expect(commitSale).toHaveBeenCalledWith('item_amp');
    expect(notify).toHaveBeenCalledTimes(1);
    const second = await syncReverbSoldItemsForOrganizer('org_1', deps);
    expect(second.sold).toEqual([]);
    expect(second.alreadySold).toBe(1);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("default commit goes through commitFacebookNativeSale with soldVia REVERB and skipWithdraw ['REVERB']", async () => {
    const orders = [{ orderNumber: '9', status: 'paid', listingId: '101889000' }];
    await syncReverbSoldItemsForOrganizer('org_1', { loadListedItems: async () => ITEMS, fetchOrders: async () => orders, notify: async () => undefined });
    expect(commitFacebookNativeSale as jest.Mock).toHaveBeenCalledWith('item_pedal', 'REVERB', { skipWithdraw: ['REVERB'] });
  });
});
