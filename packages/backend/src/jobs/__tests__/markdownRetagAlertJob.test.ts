/**
 * markdownRetagAlertJob (2026-09-29, Patrick D3). NOT EXECUTED when written (jest cannot run on
 * the authoring device); CI is the first real run.
 *
 * All tiers are alerted (owner only), and the safety fuse counts REAL recipients.
 */
const mockGroupBy = jest.fn();
const mockOrganizerFindMany = jest.fn();
const mockItemFindMany = jest.fn();
const mockCreateNotification = jest.fn();

jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../../utils/cronGuard', () => ({ cronGuard: (_o: any, fn: any) => fn }));
jest.mock('../../index', () => ({
  prisma: {
    item: {
      groupBy: (...a: any[]) => mockGroupBy(...a),
      findMany: (...a: any[]) => mockItemFindMany(...a),
    },
    organizer: { findMany: (...a: any[]) => mockOrganizerFindMany(...a) },
  },
}));
jest.mock('../../lib/notificationService', () => ({
  createNotification: (...a: any[]) => mockCreateNotification(...a),
}));
jest.mock('../../utils/markdownSticker', () => ({
  loadStickerContext: async () => ({}),
  resolveStickerPct: (item: any) => item.pct ?? 20,
}));

import { runMarkdownRetagAlert } from '../markdownRetagAlertJob';

const groups = (n: number) => Array.from({ length: n }, (_v, i) => ({ organizerId: `org_${i}`, _count: { _all: 2 } }));
const orgRows = (n: number, withUser = true) =>
  Array.from({ length: n }, (_v, i) => ({ id: `org_${i}`, userId: withUser ? `user_${i}` : null }));

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.MARKDOWN_RETAG_ALERT_MAX_RECIPIENTS;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  mockItemFindMany.mockResolvedValue([{ pct: 20 }, { pct: 20 }]);
  mockCreateNotification.mockResolvedValue({});
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('runMarkdownRetagAlert', () => {
  it('alerts a SIMPLE-tier organizer (no tier skip any more)', async () => {
    mockGroupBy.mockResolvedValue(groups(1));
    // The organizer query selects only id + userId: tier plays no part in the decision.
    mockOrganizerFindMany.mockResolvedValue([{ id: 'org_0', userId: 'user_0' }]);
    const r = await runMarkdownRetagAlert();
    expect(r).toEqual({ organizers: 1, notified: 1 });
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    const arg = mockCreateNotification.mock.calls[0][0];
    expect(arg.userId).toBe('user_0');
    expect(arg.type).toBe('MARKDOWN_RETAG');
    expect(arg.link).toBe('/organizer/markdown-retag');
    expect(mockOrganizerFindMany.mock.calls[0][0].select).toEqual({ id: true, userId: true });
  });

  it('does not count organizers that have no owner user against the fuse', async () => {
    // 40 queued organizers, but only 5 can actually be contacted: fuse (25) must NOT trip.
    mockGroupBy.mockResolvedValue(groups(40));
    mockOrganizerFindMany.mockResolvedValue([...orgRows(5, true), ...orgRows(40, false).slice(5)]);
    const r = await runMarkdownRetagAlert();
    expect(r.notified).toBe(5);
    expect(r.organizers).toBe(5);
    expect(mockCreateNotification).toHaveBeenCalledTimes(5);
  });

  it('trips the fuse when real recipients exceed the limit, sending nothing', async () => {
    mockGroupBy.mockResolvedValue(groups(26));
    mockOrganizerFindMany.mockResolvedValue(orgRows(26, true));
    const r = await runMarkdownRetagAlert();
    expect(r).toEqual({ organizers: 26, notified: 0 });
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('respects MARKDOWN_RETAG_ALERT_MAX_RECIPIENTS', async () => {
    process.env.MARKDOWN_RETAG_ALERT_MAX_RECIPIENTS = '50';
    mockGroupBy.mockResolvedValue(groups(30));
    mockOrganizerFindMany.mockResolvedValue(orgRows(30, true));
    const r = await runMarkdownRetagAlert();
    expect(r.notified).toBe(30);
  });

  it('does nothing when no organizer has queued items', async () => {
    mockGroupBy.mockResolvedValue([]);
    const r = await runMarkdownRetagAlert();
    expect(r).toEqual({ organizers: 0, notified: 0 });
    expect(mockOrganizerFindMany).not.toHaveBeenCalled();
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('one failing organizer does not stop the rest', async () => {
    mockGroupBy.mockResolvedValue(groups(2));
    mockOrganizerFindMany.mockResolvedValue(orgRows(2, true));
    mockCreateNotification.mockRejectedValueOnce(new Error('smtp down')).mockResolvedValueOnce({});
    const r = await runMarkdownRetagAlert();
    expect(r.notified).toBe(1);
    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
  });
});
