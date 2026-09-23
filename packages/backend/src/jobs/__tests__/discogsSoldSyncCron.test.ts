/**
 * discogsSoldSyncCron.ts -- unit tests (2026-09-23). Order shape follows the Discogs API
 * GET /marketplace/orders response (orders[].id, .status, .items[].id = listing id).
 */

jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../../lib/prisma', () => ({ prisma: {} }));
jest.mock('../../utils/cronGuard', () => ({ cronGuard: (_o: any, fn: any) => fn }));
jest.mock('../../lib/notificationService', () => ({ createNotification: jest.fn() }));
jest.mock('../../services/marketplace/discogsListingConnector', () => ({ fetchRecentDiscogsSellerOrders: jest.fn() }));
jest.mock('../../services/facebookNativeSaleService', () => ({ commitFacebookNativeSale: jest.fn() }));

import {
  syncDiscogsSoldItemsForOrganizer,
  matchDiscogsOrdersToItems,
  isCancelledDiscogsOrderStatus,
} from '../discogsSoldSyncCron';

const ITEMS = [
  { id: 'item_rocks', title: 'Aerosmith Rocks LP, Columbia', saleId: 'sale_1', discogsListingId: '4356608142' },
  { id: 'item_other', title: 'Styx Pieces of Eight LP', saleId: null, discogsListingId: '4356600001' },
];

describe('matchDiscogsOrdersToItems', () => {
  it('matches order items by Discogs LISTING id and ignores cancelled orders', () => {
    const orders = [
      { id: '123-1', status: 'Cancelled (Non-Paying Buyer)', items: [{ id: '4356600001' }] },
      { id: '123-2', status: 'Payment Received', items: [{ id: '4356608142' }, { id: '999' }] },
    ];
    expect(matchDiscogsOrdersToItems(orders, ITEMS)).toEqual([{ itemId: 'item_rocks', orderId: '123-2' }]);
  });
  it('matches each item once even if two orders name it', () => {
    const orders = [
      { id: 'a', status: 'New Order', items: [{ id: '4356608142' }] },
      { id: 'b', status: 'Shipped', items: [{ id: '4356608142' }] },
    ];
    expect(matchDiscogsOrdersToItems(orders, ITEMS)).toEqual([{ itemId: 'item_rocks', orderId: 'a' }]);
  });
  it('knows the cancelled statuses', () => {
    expect(isCancelledDiscogsOrderStatus("Cancelled (Per Buyer's Request)")).toBe(true);
    expect(isCancelledDiscogsOrderStatus('Invoice Sent')).toBe(false);
  });
});

describe('syncDiscogsSoldItemsForOrganizer', () => {
  it('makes no API call when nothing is live on Discogs', async () => {
    const fetchOrders = jest.fn();
    const r = await syncDiscogsSoldItemsForOrganizer('org_1', { loadListedItems: async () => [], fetchOrders });
    expect(fetchOrders).not.toHaveBeenCalled();
    expect(r.sold).toEqual([]);
  });

  it('does nothing without an active Discogs connection', async () => {
    const commitSale = jest.fn();
    const r = await syncDiscogsSoldItemsForOrganizer('org_1', { loadListedItems: async () => ITEMS, fetchOrders: async () => null, commitSale });
    expect(commitSale).not.toHaveBeenCalled();
    expect(r.checkedOrders).toBe(0);
  });

  it('commits a real Discogs sale once and notifies; a repeat is counted as alreadySold', async () => {
    const orders = [{ id: '123-2', status: 'New Order', items: [{ id: '4356608142' }] }];
    const commitSale = jest.fn().mockResolvedValueOnce({ alreadyCommitted: false }).mockResolvedValueOnce({ alreadyCommitted: true });
    const notify = jest.fn(async () => undefined);
    const deps = { loadListedItems: async () => ITEMS, fetchOrders: async () => orders, commitSale, notify };
    const first = await syncDiscogsSoldItemsForOrganizer('org_1', deps);
    expect(first.sold).toEqual([{ itemId: 'item_rocks', orderId: '123-2' }]);
    expect(commitSale).toHaveBeenCalledWith('item_rocks');
    expect(notify).toHaveBeenCalledTimes(1);
    const second = await syncDiscogsSoldItemsForOrganizer('org_1', deps);
    expect(second.sold).toEqual([]);
    expect(second.alreadySold).toBe(1);
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
