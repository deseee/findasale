/**
 * vintedBundleSaleService.ts -- unit tests (S-VINTED-BUNDLE-SALE, 2026-10-11).
 */

const mockPrisma: any = {
  marketplaceListingJob: { findMany: jest.fn() },
  organizer: { findUnique: jest.fn() },
  notification: { count: jest.fn(), updateMany: jest.fn() },
};
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));
const mockCreateNotification = jest.fn();
jest.mock('../../lib/notificationService', () => ({ createNotification: (...a: any[]) => mockCreateNotification(...a) }));

import {
  buildVintedBundleNotificationBody,
  sanitizeBuyerHandle,
  listLiveVintedCandidates,
  notifyOrganizerVintedBundleSale,
  hasPendingVintedBundleSale,
  acknowledgeVintedBundleSale,
  VINTED_BUNDLE_NOTIFICATION_TYPE,
  VINTED_BUNDLE_CHECK_WINDOW_MS,
} from '../vintedBundleSaleService';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('buildVintedBundleNotificationBody / sanitizeBuyerHandle', () => {
  it('states the bundle size, amount and buyer, says nothing was marked sold, and lists candidates', () => {
    const body = buildVintedBundleNotificationBody({
      itemCount: 5,
      amountText: '$5.00',
      buyer: 'duck212',
      candidates: [{ itemId: 'a', title: 'Item A' }, { itemId: 'b', title: 'Item B' }],
    });
    expect(body).toContain('bundle of 5 items sold for $5.00 to duck212');
    expect(body).toContain('none were marked sold automatically');
    expect(body).toContain('"Item A"; "Item B"');
    expect(body).toContain('nothing was changed');
  });
  it('works with no candidates and strips hostile buyer text', () => {
    const body = buildVintedBundleNotificationBody({ itemCount: 1, amountText: null, buyer: '<script>x', candidates: [] });
    expect(body).toContain('bundle of 1 item sold to scriptx');
    expect(body).not.toContain('candidates only');
    expect(sanitizeBuyerHandle('   ')).toBeNull();
  });
  it('caps the candidate list', () => {
    const candidates = Array.from({ length: 20 }, (_, i) => ({ itemId: String(i), title: `T${i}` }));
    const body = buildVintedBundleNotificationBody({ itemCount: 5, amountText: null, buyer: null, candidates });
    expect(body).toContain('(+5 more)');
  });
});

describe('listLiveVintedCandidates', () => {
  it('returns only items whose latest non-skipped VINTED row is POST/POSTED, newest first', async () => {
    mockPrisma.marketplaceListingJob.findMany.mockResolvedValue([
      { itemId: 'i1', action: 'POST', status: 'POSTED', createdAt: new Date(5), item: { title: 'One' } },
      { itemId: 'i2', action: 'REMOVE', status: 'REMOVED', createdAt: new Date(4), item: { title: 'Two' } },
      { itemId: 'i2', action: 'POST', status: 'POSTED', createdAt: new Date(3), item: { title: 'Two' } },
      { itemId: 'i3', action: 'REMOVE', status: 'SKIPPED', createdAt: new Date(2), item: { title: 'Three' } },
      { itemId: 'i3', action: 'POST', status: 'POSTED', createdAt: new Date(1), item: { title: 'Three' } },
    ]);
    const r = await listLiveVintedCandidates('org1');
    expect(r).toEqual([{ itemId: 'i1', title: 'One' }, { itemId: 'i3', title: 'Three' }]);
    const where = mockPrisma.marketplaceListingJob.findMany.mock.calls[0][0].where;
    expect(where.platform).toBe('VINTED');
    expect(JSON.stringify(where)).toContain('org1');
  });
  it('requires an organizer id', async () => {
    await expect(listLiveVintedCandidates('')).rejects.toThrow();
  });
});

describe('notifyOrganizerVintedBundleSale', () => {
  it('creates one operational notification of the bundle type and never throws', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({ userId: 'u1' });
    mockPrisma.marketplaceListingJob.findMany.mockResolvedValue([]);
    await notifyOrganizerVintedBundleSale('org1', { itemCount: 5, amountText: '$5.00', buyer: 'duck212' });
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification.mock.calls[0][0]).toEqual(expect.objectContaining({ userId: 'u1', type: VINTED_BUNDLE_NOTIFICATION_TYPE, sendEmail: true }));
    mockPrisma.organizer.findUnique.mockRejectedValue(new Error('db down'));
    await expect(notifyOrganizerVintedBundleSale('org1', { itemCount: 5, amountText: null, buyer: null })).resolves.toBeUndefined();
  });
  it('still notifies when the candidate lookup fails', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({ userId: 'u1' });
    mockPrisma.marketplaceListingJob.findMany.mockRejectedValue(new Error('boom'));
    await notifyOrganizerVintedBundleSale('org1', { itemCount: 2, amountText: null, buyer: null });
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
  });
});

describe('pending flag + acknowledgement', () => {
  it('is pending only for an unread, recent bundle notification', async () => {
    mockPrisma.notification.count.mockResolvedValue(1);
    const now = 1_800_000_000_000;
    expect(await hasPendingVintedBundleSale('u1', now)).toBe(true);
    const where = mockPrisma.notification.count.mock.calls[0][0].where;
    expect(where).toEqual({ userId: 'u1', type: VINTED_BUNDLE_NOTIFICATION_TYPE, read: false, createdAt: { gte: new Date(now - VINTED_BUNDLE_CHECK_WINDOW_MS) } });
    mockPrisma.notification.count.mockResolvedValue(0);
    expect(await hasPendingVintedBundleSale('u1', now)).toBe(false);
  });
  it('fails closed to false on a lookup error', async () => {
    mockPrisma.notification.count.mockRejectedValue(new Error('x'));
    expect(await hasPendingVintedBundleSale('u1')).toBe(false);
  });
  it('acknowledge marks only unread bundle notifications read', async () => {
    await acknowledgeVintedBundleSale('u1');
    expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({ where: { userId: 'u1', type: VINTED_BUNDLE_NOTIFICATION_TYPE, read: false }, data: { read: true } });
  });
});
