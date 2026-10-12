/**
 * vintedBundleSaleService.ts -- unit tests (S-VINTED-BUNDLE-SALE, 2026-10-11).
 */

const mockPrisma: any = {
  marketplaceListingJob: { findMany: jest.fn() },
  organizer: { findUnique: jest.fn() },
  notification: { count: jest.fn(), updateMany: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  item: { findMany: jest.fn() },
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
  listPendingVintedBundleNotices,
  listVintedBundleSelectionOptions,
  VINTED_BUNDLE_PAGE_PATH,
  VINTED_BUNDLE_NOTIFICATION_TYPE,
  VINTED_BUNDLE_CHECK_WINDOW_MS,
  VINTED_BUNDLE_ORDER_WINDOW_MS,
  VINTED_BUNDLE_AUTO_MAX_ATTEMPTS,
  buildBundleNoticeLink,
  parseBundleNoticeLink,
  listOpenVintedBundleOrders,
  listBundleNoticesMissingConversation,
  attachConversationToNotice,
  recordBundleNoticeAttempt,
  acknowledgeLegacyVintedBundleSales,
} from '../vintedBundleSaleService';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('buildVintedBundleNotificationBody / sanitizeBuyerHandle', () => {
  it('automatic wording: states size, amount, buyer, says it reconciles automatically and asks nothing of the organizer', () => {
    const body = buildVintedBundleNotificationBody({ itemCount: 5, amountText: '$5.00', buyer: 'duck212' });
    expect(body).toContain('bundle of 5 items sold for $5.00 to duck212');
    expect(body).toContain('reconciling this bundle automatically');
    expect(body).toContain('nothing for you to do');
    expect(body).not.toContain('tick');
    expect(body).not.toContain('bundle page');
  });
  it('strips hostile buyer text and works for one item', () => {
    const body = buildVintedBundleNotificationBody({ itemCount: 1, amountText: null, buyer: '<script>x' });
    expect(body).toContain('bundle of 1 item sold to scriptx');
    expect(sanitizeBuyerHandle('   ')).toBeNull();
  });
  it('fallback wording mentions the bundle page and lists capped candidates', () => {
    const candidates = Array.from({ length: 20 }, (_, i) => ({ itemId: String(i), title: `T${i}` }));
    const body = buildVintedBundleNotificationBody({ itemCount: 5, amountText: null, buyer: null, candidates, fallback: true });
    expect(body).toContain('could not match every item');
    expect(body).toContain('Vinted bundle page');
    expect(body).toContain('"T0"; "T1"');
    expect(body).toContain('(+5 more)');
  });
});

describe('notice link: conversation id + bundle fields', () => {
  it('round-trips conversation id, item count, price and attempts', () => {
    const link = buildBundleNoticeLink({ conversationId: '900100200300', itemCount: 5, amountText: '$5.00', attempts: 2 });
    expect(link.startsWith(VINTED_BUNDLE_PAGE_PATH + '?')).toBe(true);
    expect(parseBundleNoticeLink(link)).toEqual({ conversationId: '900100200300', itemCount: 5, amountText: '$5.00', attempts: 2 });
  });
  it('rejects a malformed conversation id and omits it from the link', () => {
    const link = buildBundleNoticeLink({ conversationId: 'abc;drop', itemCount: 2 });
    expect(link).not.toContain('vc=');
    expect(parseBundleNoticeLink(link).conversationId).toBeNull();
    expect(parseBundleNoticeLink('/organizer/vinted-bundle?vc=12').conversationId).toBeNull();
  });
  it('a legacy notice (plain page link) has no conversation id; count and price come from its body', () => {
    const body = buildVintedBundleNotificationBody({ itemCount: 2, amountText: '$18.90', buyer: 'booradley90' });
    expect(parseBundleNoticeLink(VINTED_BUNDLE_PAGE_PATH, body)).toEqual({ conversationId: null, itemCount: 2, amountText: '$18.90', attempts: 0 });
    expect(parseBundleNoticeLink(null, 'unrelated')).toEqual({ conversationId: null, itemCount: null, amountText: null, attempts: 0 });
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
  it('creates one in-app notice carrying the conversation id, no email, no candidate lookup, and never throws', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({ userId: 'u1' });
    mockPrisma.notification.findFirst.mockResolvedValue(null);
    await notifyOrganizerVintedBundleSale('org1', { itemCount: 5, amountText: '$5.00', buyer: 'duck212', conversationId: '900100200300' });
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    const arg = mockCreateNotification.mock.calls[0][0];
    expect(arg).toEqual(expect.objectContaining({ userId: 'u1', type: VINTED_BUNDLE_NOTIFICATION_TYPE, sendEmail: false }));
    expect(parseBundleNoticeLink(arg.link)).toEqual({ conversationId: '900100200300', itemCount: 5, amountText: '$5.00', attempts: 0 });
    expect(arg.body).toContain('automatically');
    expect(mockPrisma.marketplaceListingJob.findMany).not.toHaveBeenCalled();
    mockPrisma.organizer.findUnique.mockRejectedValue(new Error('db down'));
    await expect(notifyOrganizerVintedBundleSale('org1', { itemCount: 5, amountText: null, buyer: null })).resolves.toBeUndefined();
  });
  it('is idempotent per conversation: an existing notice for the same conversation id means no second notice', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({ userId: 'u1' });
    mockPrisma.notification.findFirst.mockResolvedValue({ id: 'n1' });
    await notifyOrganizerVintedBundleSale('org1', { itemCount: 5, amountText: '$5.00', buyer: 'duck212', conversationId: '900100200300' });
    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(JSON.stringify(mockPrisma.notification.findFirst.mock.calls[0][0].where)).toContain('vc=900100200300');
  });
  it('without a conversation id it still creates the notice (legacy behaviour, wardrobe check path)', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({ userId: 'u1' });
    await notifyOrganizerVintedBundleSale('org1', { itemCount: 2, amountText: null, buyer: null, conversationId: null });
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(parseBundleNoticeLink(mockCreateNotification.mock.calls[0][0].link).conversationId).toBeNull();
    expect(mockPrisma.notification.findFirst).not.toHaveBeenCalled();
  });
});

describe('open bundle orders for the extension', () => {
  it('serves only unread, recent notices that carry a conversation id, in the pending-sold-checks shape', async () => {
    const now = 1_800_000_000_000;
    const created = new Date(now - 3600_000);
    mockPrisma.notification.findMany.mockResolvedValue([
      { id: 'n1', link: buildBundleNoticeLink({ conversationId: '900100200300', itemCount: 5, amountText: '$5.00', attempts: 1 }), body: 'x', createdAt: created },
      { id: 'n2', link: VINTED_BUNDLE_PAGE_PATH, body: 'Vinted reports a bundle of 2 items sold for $18.90 to b. ', createdAt: created },
    ]);
    const orders = await listOpenVintedBundleOrders('u1', now);
    expect(orders).toEqual([{ noticeId: 'n1', conversationId: '900100200300', priceText: '$5.00', itemCount: 5, emailAt: created.toISOString(), attempts: 1 }]);
    const where = mockPrisma.notification.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ userId: 'u1', type: VINTED_BUNDLE_NOTIFICATION_TYPE, read: false, createdAt: { gte: new Date(now - VINTED_BUNDLE_ORDER_WINDOW_MS) } });
  });
  it('returns [] when the lookup fails', async () => {
    mockPrisma.notification.findMany.mockRejectedValue(new Error('x'));
    expect(await listOpenVintedBundleOrders('u1')).toEqual([]);
  });
});

describe('retroactive conversation id attach', () => {
  const orphan = { id: 'n9', userId: 'u1', link: VINTED_BUNDLE_PAGE_PATH, body: 'Vinted reports a bundle of 2 items sold for $18.90 to booradley90. FindA.Sale ...', createdAt: new Date() };

  it('lists only unread bundle notices that still have no conversation id', async () => {
    mockPrisma.notification.findMany.mockResolvedValue([
      orphan,
      { ...orphan, id: 'n10', link: buildBundleNoticeLink({ conversationId: '900100200300', itemCount: 5 }) },
    ]);
    const r = await listBundleNoticesMissingConversation(1_800_000_000_000);
    expect(r.map((n) => n.id)).toEqual(['n9']);
    expect(mockPrisma.notification.findMany.mock.calls[0][0].where.read).toBe(false);
  });

  it('attaches the id to the existing notice (no new notice), keeping its count and price', async () => {
    mockPrisma.notification.findFirst.mockResolvedValue(null);
    const ok = await attachConversationToNotice(orphan, { conversationId: '900100200301', itemCount: 2, amountText: '$18.90' });
    expect(ok).toBe(true);
    expect(mockCreateNotification).not.toHaveBeenCalled();
    const upd = mockPrisma.notification.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 'n9' });
    expect(parseBundleNoticeLink(upd.data.link)).toEqual({ conversationId: '900100200301', itemCount: 2, amountText: '$18.90', attempts: 0 });
  });

  it('is idempotent: a notice that already has an id, or an id already used, is left alone', async () => {
    const withId = { ...orphan, link: buildBundleNoticeLink({ conversationId: '900100200301', itemCount: 2 }) };
    expect(await attachConversationToNotice(withId, { conversationId: '900100200999', itemCount: 2, amountText: null })).toBe(false);
    mockPrisma.notification.findFirst.mockResolvedValue({ id: 'other' });
    expect(await attachConversationToNotice(orphan, { conversationId: '900100200301', itemCount: 2, amountText: null })).toBe(false);
    expect(await attachConversationToNotice(orphan, { conversationId: 'not-a-number', itemCount: 2, amountText: null })).toBe(false);
    expect(mockPrisma.notification.update).not.toHaveBeenCalled();
  });
});

describe('unresolved attempts and the manual fallback', () => {
  const notice = (attempts: number) => ({
    id: 'n1',
    link: buildBundleNoticeLink({ conversationId: '900100200300', itemCount: 5, amountText: '$5.00', attempts }),
    body: buildVintedBundleNotificationBody({ itemCount: 5, amountText: '$5.00', buyer: 'duck212' }),
  });

  it('counts an attempt in the link and keeps the automatic wording before the limit', async () => {
    const r = await recordBundleNoticeAttempt(notice(0), 'org1');
    expect(r).toEqual({ attempts: 1, fallbackShown: false });
    const data = mockPrisma.notification.update.mock.calls[0][0].data;
    expect(parseBundleNoticeLink(data.link).attempts).toBe(1);
    expect(data.body).toBeUndefined();
  });

  it('switches the notice to the fallback wording (manual page + candidates) on the last allowed attempt, keeping the conversation id', async () => {
    mockPrisma.marketplaceListingJob.findMany.mockResolvedValue([{ itemId: 'i1', action: 'POST', status: 'POSTED', createdAt: new Date(5), item: { title: 'One' } }]);
    const r = await recordBundleNoticeAttempt(notice(VINTED_BUNDLE_AUTO_MAX_ATTEMPTS - 1), 'org1');
    expect(r).toEqual({ attempts: VINTED_BUNDLE_AUTO_MAX_ATTEMPTS, fallbackShown: true });
    const data = mockPrisma.notification.update.mock.calls[0][0].data;
    expect(data.body).toContain('bundle of 5 items sold for $5.00 to duck212');
    expect(data.body).toContain('Vinted bundle page');
    expect(data.body).toContain('"One"');
    expect(parseBundleNoticeLink(data.link).conversationId).toBe('900100200300');
  });

  it('never throws when the update fails', async () => {
    mockPrisma.notification.update.mockRejectedValueOnce(new Error('db'));
    await expect(recordBundleNoticeAttempt(notice(0), 'org1')).resolves.toEqual({ attempts: 0, fallbackShown: false });
  });

  it('the wardrobe path only closes LEGACY notices (no conversation id)', async () => {
    await acknowledgeLegacyVintedBundleSales('u1');
    const arg = mockPrisma.notification.updateMany.mock.calls[0][0];
    expect(arg.where.OR).toEqual([{ link: null }, { link: { not: { contains: 'vc=' } } }]);
    expect(arg.where).toEqual(expect.objectContaining({ userId: 'u1', type: VINTED_BUNDLE_NOTIFICATION_TYPE, read: false }));
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

describe('manual selection page support (2026-10-12)', () => {
  it('the bundle notification still links to the selection page (fallback), with machine fields in the query string', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({ userId: 'u1' });
    await notifyOrganizerVintedBundleSale('org1', { itemCount: 5, amountText: '$5.00', buyer: 'duck212' });
    expect(mockCreateNotification.mock.calls[0][0].link.startsWith(VINTED_BUNDLE_PAGE_PATH)).toBe(true);
    expect(VINTED_BUNDLE_PAGE_PATH).toBe('/organizer/vinted-bundle');
  });

  it('lists only the caller\'s unread, recent bundle notices', async () => {
    mockPrisma.notification.findMany.mockResolvedValue([]);
    const now = 1_800_000_000_000;
    await listPendingVintedBundleNotices('u1', now);
    const args = mockPrisma.notification.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ userId: 'u1', type: VINTED_BUNDLE_NOTIFICATION_TYPE, read: false, createdAt: { gte: new Date(now - 14 * 24 * 60 * 60 * 1000) } });
  });

  it('offers tracked live Vinted items first and the remaining available items under "other", organizer-scoped', async () => {
    mockPrisma.marketplaceListingJob.findMany.mockResolvedValue([
      { itemId: 'i1', action: 'POST', status: 'POSTED', createdAt: new Date(5), item: { title: 'One' } },
    ]);
    mockPrisma.item.findMany.mockResolvedValue([
      { id: 'i1', title: 'One' },
      { id: 'i2', title: 'Dime Tube' },
    ]);
    const r = await listVintedBundleSelectionOptions('org1');
    expect(r.tracked).toEqual([{ itemId: 'i1', title: 'One' }]);
    expect(r.other).toEqual([{ itemId: 'i2', title: 'Dime Tube' }]);
    const where = mockPrisma.item.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('AVAILABLE');
    expect(JSON.stringify(where)).toContain('org1');
    await expect(listVintedBundleSelectionOptions('')).rejects.toThrow();
  });
});
