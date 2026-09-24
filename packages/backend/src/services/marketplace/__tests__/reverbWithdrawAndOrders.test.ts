/**
 * reverbConnector.ts -- withdrawReverbListingIfExists (withdraw-on-SOLD) and the seller-order
 * normalizer/fetcher used by reverbSoldSyncCron (2026-09-23). fetch is mocked; nothing hits Reverb.
 */

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    item: { findUnique: jest.fn(), update: jest.fn(async () => ({})) },
    marketplaceAccount: { findFirst: jest.fn(), update: jest.fn(async () => ({})) },
  },
}));
jest.mock('../../../utils/tokenCrypto', () => ({ encryptToken: (t: string) => t, decryptToken: (t: string) => t }));

import { prisma } from '../../../lib/prisma';
import { withdrawReverbListingIfExists, normalizeReverbOrder, fetchRecentReverbSellerOrders } from '../reverbConnector';

const p = prisma as any;
const fetchMock = jest.fn();
(global as any).fetch = fetchMock;

function resp(status: number, body: any) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body), json: async () => body };
}

beforeEach(() => {
  jest.clearAllMocks();
  (p.marketplaceAccount.findFirst as jest.Mock).mockResolvedValue({ id: 'acct_1', accessToken: 'tok' });
});

describe('withdrawReverbListingIfExists', () => {
  it('is a no-op (no API call) when the item has no reverbListingId', async () => {
    (p.item.findUnique as jest.Mock).mockResolvedValue({ reverbListingId: null, organizerId: 'org_1', sale: null });
    await withdrawReverbListingIfExists('item_1');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(p.item.update).not.toHaveBeenCalled();
  });

  it("ends the listing with the organizer's token and clears reverbListingId", async () => {
    (p.item.findUnique as jest.Mock).mockResolvedValue({ reverbListingId: '101889751', organizerId: null, sale: { organizerId: 'org_1' } });
    fetchMock.mockResolvedValueOnce(resp(422, { message: 'published' })).mockResolvedValueOnce(resp(200, {}));
    await withdrawReverbListingIfExists('item_1');
    expect(p.marketplaceAccount.findFirst).toHaveBeenCalledWith({ where: { organizerId: 'org_1', platform: 'REVERB', status: 'ACTIVE' } });
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/listings\/101889751$/);
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
    expect(fetchMock.mock.calls[1][1].method).toBe('PUT');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer tok');
    expect(p.item.update).toHaveBeenCalledWith({ where: { id: 'item_1' }, data: { reverbListingId: null, reverbListedAt: null } });
  });

  it('never throws and keeps reverbListingId when Reverb rejects the end', async () => {
    (p.item.findUnique as jest.Mock).mockResolvedValue({ reverbListingId: '5', organizerId: 'org_1', sale: null });
    fetchMock.mockResolvedValueOnce(resp(404, {})).mockResolvedValueOnce(resp(500, { message: 'down' }));
    await expect(withdrawReverbListingIfExists('item_1')).resolves.toBeUndefined();
    expect(p.item.update).not.toHaveBeenCalled();
  });

  it('never throws when there is no active Reverb connection', async () => {
    (p.item.findUnique as jest.Mock).mockResolvedValue({ reverbListingId: '5', organizerId: 'org_1', sale: null });
    (p.marketplaceAccount.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(withdrawReverbListingIfExists('item_1')).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('seller orders', () => {
  it('normalizes product_id, falling back to the listing link', () => {
    expect(normalizeReverbOrder({ order_number: '777', status: 'paid', product_id: 101889751 })).toEqual({ orderNumber: '777', status: 'paid', listingId: '101889751' });
    expect(normalizeReverbOrder({ order_number: 8, status: 'shipped', _links: { listing: { href: 'https://api.reverb.com/api/listings/42' } } }).listingId).toBe('42');
  });

  it('GETs /my/orders/selling/all with the lookback window and follows pages', async () => {
    fetchMock
      .mockResolvedValueOnce(resp(200, { total_pages: 2, orders: [{ order_number: '1', status: 'paid', product_id: 11 }] }))
      .mockResolvedValueOnce(resp(200, { total_pages: 2, orders: [{ order_number: '2', status: 'cancelled', product_id: 12 }] }));
    const since = new Date('2026-09-09T00:00:00.000Z');
    const out = await fetchRecentReverbSellerOrders('org_1', since);
    expect(out).toEqual([
      { orderNumber: '1', status: 'paid', listingId: '11' },
      { orderNumber: '2', status: 'cancelled', listingId: '12' },
    ]);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/my/orders/selling/all?');
    expect(url).toContain('updated_start_date=2026-09-09T00%3A00%3A00.000Z');
    expect(fetchMock.mock.calls[0][1].headers['Accept-Version']).toBe('3.0');
    expect(fetchMock.mock.calls[0][1].method).toBeUndefined();
  });

  it('returns null without an active connection', async () => {
    (p.marketplaceAccount.findFirst as jest.Mock).mockResolvedValue(null);
    expect(await fetchRecentReverbSellerOrders('org_1', new Date())).toBeNull();
  });
});
