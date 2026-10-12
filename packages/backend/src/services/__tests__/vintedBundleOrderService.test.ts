/**
 * vintedBundleOrderService.ts -- tests for automatic Vinted bundle reconciliation (2026-10-12).
 * Synthetic data only. Drives the REAL matcher (processVintedSoldReport) with injected loaders/committer.
 */

const mockPrisma: any = {
  notification: { findFirst: jest.fn(), updateMany: jest.fn(async () => ({ count: 1 })), update: jest.fn(async () => ({})) },
  marketplaceListingJob: { findMany: jest.fn(async () => []) },
  organizer: { findUnique: jest.fn() },
};
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../../lib/notificationService', () => ({ createNotification: jest.fn() }));
jest.mock('../facebookNativeSaleService', () => ({ commitFacebookNativeSale: jest.fn(), isMultiStockItem: jest.fn(async () => false) }));

import { reportVintedBundleOrder } from '../vintedBundleOrderService';
import { buildBundleNoticeLink, buildVintedBundleNotificationBody, parseBundleNoticeLink, VINTED_BUNDLE_AUTO_MAX_ATTEMPTS } from '../vintedBundleSaleService';

const CONV = '900100200300';
const notice = (over: Record<string, any> = {}) => ({
  id: 'n1',
  read: false,
  link: buildBundleNoticeLink({ conversationId: CONV, itemCount: 3, amountText: '$5.00', attempts: 0 }),
  body: buildVintedBundleNotificationBody({ itemCount: 3, amountText: '$5.00', buyer: 'duck212' }),
  ...over,
});

// Organizer items "i1..i4" with Vinted ids recorded on i1..i3 (a title-only fourth item has no Vinted id on record).
const ITEMS = [
  { id: 'i1', title: 'Alpha Widget Large', status: 'AVAILABLE' },
  { id: 'i2', title: 'Bravo Gadget Medium', status: 'AVAILABLE' },
  { id: 'i3', title: 'Charlie Gizmo Small', status: 'AVAILABLE' },
  { id: 'i4', title: 'Delta Thing Extra', status: 'AVAILABLE' },
];
const JOBS = [
  { itemId: 'i1', remoteListingId: '1001' },
  { itemId: 'i2', remoteListingId: '1002' },
  { itemId: 'i3', remoteListingId: '1003' },
];

function soldDeps(commitImpl?: (itemId: string) => { alreadyCommitted: boolean }) {
  const commitSale = jest.fn(async (itemId: string) => (commitImpl ? commitImpl(itemId) : { alreadyCommitted: false }));
  return {
    commitSale,
    deps: {
      soldDeps: {
        loadCandidateItems: async () => ITEMS,
        loadVintedJobs: async () => JOBS,
        closeVintedListingRecord: async () => true,
        commitSale,
        getItemStatus: async () => 'SOLD',
      },
    },
  };
}

const args = (items: any, over: Record<string, any> = {}) => ({ userId: 'u1', organizerId: 'org1', noticeId: 'n1', conversationId: CONV, items, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  mockPrisma.notification.findFirst.mockResolvedValue(notice());
});

describe('reportVintedBundleOrder', () => {
  it('maps the reported Vinted item ids to the organizer\'s items (titles may differ), commits each, and closes the notice when all resolve', async () => {
    const { commitSale, deps } = soldDeps();
    const r = await reportVintedBundleOrder(
      args([
        { vintedId: '1001', title: 'alpha widget (renamed on Vinted)' },
        { vintedId: '1002', title: 'completely different' },
        { vintedId: '1003', title: 'x' },
      ]),
      deps,
    );
    expect(r.status).toBe('resolved');
    expect(commitSale.mock.calls.map((c: any[]) => [c[0], c[1], c[2]])).toEqual([
      ['i1', 'VINTED', '1001'],
      ['i2', 'VINTED', '1002'],
      ['i3', 'VINTED', '1003'],
    ]);
    expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({ where: { id: 'n1', read: false }, data: { read: true } });
  });

  it('partial resolution (one id unknown) commits the matches but keeps the notice OPEN and counts an attempt', async () => {
    const { commitSale, deps } = soldDeps();
    const r = await reportVintedBundleOrder(
      args([
        { vintedId: '1001', title: 'Alpha Widget Large' },
        { vintedId: '1002', title: 'Bravo Gadget Medium' },
        { vintedId: '9999', title: 'Not ours' },
      ]),
      deps,
    );
    expect(r).toEqual(expect.objectContaining({ status: 'partial', resolved: 2, itemCount: 3, attempts: 1, fallbackShown: false }));
    expect(commitSale).toHaveBeenCalledTimes(2);
    expect(mockPrisma.notification.updateMany).not.toHaveBeenCalled();
    expect(parseBundleNoticeLink(mockPrisma.notification.update.mock.calls[0][0].data.link).attempts).toBe(1);
  });

  it('fewer items reported than the email says (partial read) keeps the notice open', async () => {
    const { deps } = soldDeps();
    const r = await reportVintedBundleOrder(args([{ vintedId: '1001', title: 'Alpha Widget Large' }]), deps);
    expect(r).toEqual(expect.objectContaining({ status: 'partial', resolved: 1, itemCount: 3 }));
    expect(mockPrisma.notification.updateMany).not.toHaveBeenCalled();
  });

  it('is idempotent: a repeat of an already-sold bundle counts alreadySold as resolved and closes the notice', async () => {
    const { deps } = soldDeps(() => ({ alreadyCommitted: true }));
    const r = await reportVintedBundleOrder(
      args([{ vintedId: '1001', title: 'a' }, { vintedId: '1002', title: 'b' }, { vintedId: '1003', title: 'c' }]),
      deps,
    );
    expect(r.status).toBe('resolved');
  });

  it('a retry where the multi-unit sales were already counted per Vinted id resolves the notice (alreadyCounted -> alreadySold)', async () => {
    const commitSale = jest.fn(async () => ({ alreadyCommitted: true, alreadyCounted: true, noopReason: 'no_live_posted_row' }));
    const deps = { soldDeps: { loadCandidateItems: async () => ITEMS, loadVintedJobs: async () => JOBS, closeVintedListingRecord: async () => false, commitSale, getItemStatus: async () => 'AVAILABLE' } };
    const r = await reportVintedBundleOrder(
      args([{ vintedId: '1001', title: 'a' }, { vintedId: '1002', title: 'b' }, { vintedId: '1003', title: 'c' }]),
      deps,
    );
    expect(r.status).toBe('resolved');
    // The bundle path marks its commits as coming from a fresh order.
    expect(commitSale).toHaveBeenCalledWith('i1', 'VINTED', '1001', { trustedOrder: true });
  });

  it('passes the notice creation time to the committer and resolves when the email path already closed the sale (closed_by_email_sale)', async () => {
    const createdAt = new Date('2026-10-12T10:00:00Z');
    mockPrisma.notification.findFirst.mockResolvedValue(notice({ createdAt }));
    const commitSale = jest.fn(async () => ({ alreadyCommitted: true, alreadyCounted: true, noopReason: 'closed_by_email_sale' }));
    const deps = { soldDeps: { loadCandidateItems: async () => ITEMS, loadVintedJobs: async () => JOBS, closeVintedListingRecord: async () => false, commitSale, getItemStatus: async () => 'AVAILABLE' } };
    const r: any = await reportVintedBundleOrder(
      args([{ vintedId: '1001', title: 'a' }, { vintedId: '1002', title: 'b' }, { vintedId: '1003', title: 'c' }]),
      deps,
    );
    expect(r.status).toBe('resolved');
    expect(r.results.every((x: any) => x.result === 'alreadySold' && x.reason === 'closed_by_email_sale')).toBe(true);
    expect(commitSale).toHaveBeenCalledWith('i1', 'VINTED', '1001', { trustedOrder: true, orderCreatedAt: createdAt });
  });

  it('PARTIAL log line lists every entry with result, via, reason, itemId and itemStatus', async () => {
    const log = console.log as jest.Mock;
    const commitSale = jest.fn(async () => ({ alreadyCommitted: true, noopReason: 'relist_after_sale_guard' }));
    const deps = { soldDeps: { loadCandidateItems: async () => ITEMS, loadVintedJobs: async () => JOBS, closeVintedListingRecord: async () => false, commitSale, getItemStatus: async () => 'AVAILABLE' } };
    await reportVintedBundleOrder(args([{ vintedId: '1001', title: 'Alpha Widget Large' }, { vintedId: '9999', title: 'Not ours' }]), deps);
    const line = log.mock.calls.find((c: any[]) => String(c[0]).includes('PARTIAL'))!;
    const payload = JSON.parse(line[1]);
    expect(payload.entries).toEqual([
      { vintedId: '1001', title: 'Alpha Widget Large', result: 'notAvailable', via: 'remoteId', reason: 'relist_after_sale_guard', itemId: 'i1', itemStatus: 'AVAILABLE' },
      { vintedId: '9999', title: 'Not ours', result: 'notFound', via: null, reason: 'no_match', itemId: null, itemStatus: null },
    ]);
  });

  it('a notice that is already closed is a no-op (nothing is committed)', async () => {
    mockPrisma.notification.findFirst.mockResolvedValue(notice({ read: true }));
    const { commitSale, deps } = soldDeps();
    expect(await reportVintedBundleOrder(args([{ vintedId: '1001', title: 'a' }]), deps)).toEqual({ status: 'alreadyResolved' });
    expect(commitSale).not.toHaveBeenCalled();
  });

  it('refuses a report naming MORE items than the email\'s bundle count (nothing is committed)', async () => {
    const { commitSale, deps } = soldDeps();
    const r = await reportVintedBundleOrder(
      args([1001, 1002, 1003, 9999].map((n) => ({ vintedId: String(n), title: 'x' }))),
      deps,
    );
    expect(r).toEqual({ status: 'rejected', reason: 'too_many_items' });
    expect(commitSale).not.toHaveBeenCalled();
    expect(mockPrisma.notification.updateMany).not.toHaveBeenCalled();
  });

  it('only the caller\'s own notice is found (scoped by user id and type), and a different conversation id is refused', async () => {
    const { deps } = soldDeps();
    await reportVintedBundleOrder(args([{ vintedId: '1001', title: 'a' }]), deps);
    expect(mockPrisma.notification.findFirst.mock.calls[0][0].where).toEqual({ id: 'n1', userId: 'u1', type: 'vinted_bundle_sale_pending' });
    mockPrisma.notification.findFirst.mockResolvedValue(null);
    expect(await reportVintedBundleOrder(args([{ vintedId: '1001', title: 'a' }]), deps)).toEqual({ status: 'notFound' });
    mockPrisma.notification.findFirst.mockResolvedValue(notice());
    expect(await reportVintedBundleOrder(args([{ vintedId: '1001', title: 'a' }], { conversationId: '123456789' }), deps)).toEqual({ status: 'rejected', reason: 'conversation_mismatch' });
  });

  it('a legacy notice without a conversation id cannot be reported against', async () => {
    mockPrisma.notification.findFirst.mockResolvedValue(notice({ link: '/organizer/vinted-bundle' }));
    const { deps } = soldDeps();
    expect(await reportVintedBundleOrder(args([{ vintedId: '1001', title: 'a' }], { conversationId: null }), deps)).toEqual({ status: 'rejected', reason: 'no_conversation' });
  });

  it('a failed read (readFailed) commits nothing and counts the attempt; the last allowed attempt shows the fallback wording', async () => {
    const { commitSale, deps } = soldDeps();
    mockPrisma.notification.findFirst.mockResolvedValue(
      notice({ link: buildBundleNoticeLink({ conversationId: CONV, itemCount: 3, amountText: '$5.00', attempts: VINTED_BUNDLE_AUTO_MAX_ATTEMPTS - 1 }) }),
    );
    const r = await reportVintedBundleOrder(args([], { readFailed: true }), deps);
    expect(r).toEqual(expect.objectContaining({ status: 'partial', resolved: 0, attempts: VINTED_BUNDLE_AUTO_MAX_ATTEMPTS, fallbackShown: true }));
    expect(commitSale).not.toHaveBeenCalled();
    expect(mockPrisma.notification.update.mock.calls[0][0].data.body).toContain('Vinted bundle page');
  });

  it('ignores malformed entries (non-numeric ids) and de-duplicates', async () => {
    const { commitSale, deps } = soldDeps();
    const r = await reportVintedBundleOrder(
      args([{ vintedId: '1001', title: 'a' }, { vintedId: '1001', title: 'dup' }, { vintedId: 'abc', title: 'bad' }, null]),
      deps,
    );
    expect(commitSale).toHaveBeenCalledTimes(1);
    expect(r.status).toBe('partial');
  });

  it('requires a user and organizer (never an unscoped lookup)', async () => {
    await expect(reportVintedBundleOrder({ userId: '', organizerId: 'o', noticeId: 'n1', items: [] })).rejects.toThrow();
    await expect(reportVintedBundleOrder({ userId: 'u', organizerId: '', noticeId: 'n1', items: [] })).rejects.toThrow();
  });
});
