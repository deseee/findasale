/**
 * Weekly digest carry-over (2026-10-25). The digest is sent on the Gmail (Workspace) rail via
 * lib/emailService; once the Gmail daily quota guard throws QuotaExceededError, the run stops and the unsent remainder is sent by the Saturday/Sunday
 * catch-up runs of the same edition. Recipients already reached get an EmailAutomationLog marker
 * ('weekly_digest:<Friday date>') and are skipped by later runs. Prisma, the rail, suppression and
 * unsubscribe links are mocks: no database or email is touched.
 */
var mockSend = jest.fn();
jest.mock('../lib/emailService', () => {
  class QuotaExceededError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'QuotaExceededError';
    }
  }
  return { emailService: { emails: { send: (...a: any[]) => mockSend(...a) } }, QuotaExceededError };
});
jest.mock('../services/suppressionService', () => ({
  suppressionService: { isSuppressed: jest.fn().mockResolvedValue(false) },
}));
jest.mock('../controllers/unsubscribeController', () => ({
  buildUnsubscribeLinks: jest.fn().mockResolvedValue({
    webUrl: 'https://finda.sale/unsubscribe?t=x',
    listUnsubscribeHeader: '<https://finda.sale/api/unsubscribe?t=x>',
  }),
}));
var mockMarkers: Array<{ userId: string; automationKey: string }> = [];
var mockUsers: any[] = [];
var mockSales: any[] = [];
jest.mock('../lib/prisma', () => ({
  prisma: {
    sale: { findMany: jest.fn(async () => mockSales) },
    user: { findMany: jest.fn(async () => mockUsers) },
    emailAutomationLog: {
      findMany: jest.fn(async ({ where }: any) => mockMarkers.filter((m) => m.automationKey === where.automationKey)),
      create: jest.fn(async ({ data }: any) => { mockMarkers.push(data); return data; }),
    },
  },
}));

import { sendWeeklyDigest, weeklyDigestEditionKey } from '../controllers/notificationController';

const sale = (id: string, lat: number, lng: number) => ({
  id,
  title: `Sale ${id}`,
  address: '1 Main St',
  city: 'Paw Paw',
  state: 'MI',
  zip: '49079',
  lat,
  lng,
  startDate: new Date(Date.now() + 2 * 86400000),
  endDate: new Date(Date.now() + 3 * 86400000),
  photoUrls: [],
  organizer: { businessName: 'Org', timezone: 'America/Detroit' },
});

const user = (id: string, opts: { near?: boolean; lastVisit?: string | null; optOut?: boolean } = {}) => ({
  id,
  email: `${id}@example.com`,
  name: `User ${id}`,
  notificationPrefs: opts.optOut ? { emailWeeklyDigest: false } : {},
  lastVisitDate: opts.lastVisit ? new Date(opts.lastVisit) : null,
  savedSearches: opts.near ? [{ filters: { lat: 42.2, lng: -85.9, radius: 20 } }] : [],
});

const sentTo = () => mockSend.mock.calls.map((c) => c[0].to as string);

describe('weeklyDigestEditionKey', () => {
  it('maps Friday, Saturday and Sunday to the same edition (the Friday UTC date)', () => {
    expect(weeklyDigestEditionKey(new Date('2026-10-23T09:00:00Z'))).toBe('weekly_digest:2026-10-23'); // Fri
    expect(weeklyDigestEditionKey(new Date('2026-10-24T09:00:00Z'))).toBe('weekly_digest:2026-10-23'); // Sat
    expect(weeklyDigestEditionKey(new Date('2026-10-25T09:00:00Z'))).toBe('weekly_digest:2026-10-23'); // Sun
    expect(weeklyDigestEditionKey(new Date('2026-10-29T09:00:00Z'))).toBe('weekly_digest:2026-10-23'); // Thu
    expect(weeklyDigestEditionKey(new Date('2026-10-30T09:00:00Z'))).toBe('weekly_digest:2026-10-30'); // next Fri
  });
});

describe('sendWeeklyDigest carry-over', () => {
  beforeEach(() => {
    process.env.GMAIL_CLIENT_ID = 'x';
    process.env.GMAIL_CLIENT_SECRET = 'x';
    process.env.GMAIL_REFRESH_TOKEN = 'x';
    mockMarkers = [];
    mockSend.mockReset();
    // Sale 'near' sits inside the near-user's saved-search radius; 'far' is elsewhere.
    mockSales = [sale('far', 40.0, -80.0), sale('near', 42.2, -85.9)];
    mockUsers = [
      user('u-a', { lastVisit: '2026-10-01T00:00:00Z' }),
      user('u-b', { lastVisit: '2026-10-20T00:00:00Z' }),
      user('u-c', { near: true }),
      user('u-d', { optOut: true }),
    ];
  });

  it('sends on the Gmail rail with unsubscribe header and orders near-sale recipients first, then most recently active', async () => {
    mockSend.mockResolvedValue({ id: 'm' });
    await sendWeeklyDigest();
    expect(sentTo()).toEqual(['u-c@example.com', 'u-b@example.com', 'u-a@example.com']); // u-d opted out
    for (const call of mockSend.mock.calls) {
      expect(call[0].from).toBe('find@outreach.finda.sale');
      expect(call[0].listUnsubscribe).toBe('<https://finda.sale/api/unsubscribe?t=x>');
      expect(call[0].retryOnRateLimit).toBe(true);
      expect(call[0].jobName).toBe('weeklyDigest');
    }
    expect(mockMarkers.map((m) => m.userId)).toEqual(['u-c', 'u-b', 'u-a']);
  });

  it('stops at the Gmail daily quota and the next run sends only the remainder', async () => {
    // Run 1 (Friday): first send accepted, then the quota guard throws.
    const { QuotaExceededError } = jest.requireMock('../lib/emailService');
    mockSend.mockResolvedValueOnce({ id: 'm1' }).mockRejectedValue(new QuotaExceededError('Daily Gmail quota exceeded'));
    await sendWeeklyDigest();
    expect(sentTo()).toEqual(['u-c@example.com', 'u-b@example.com']); // stopped after the first refusal
    expect(mockMarkers.map((m) => m.userId)).toEqual(['u-c']);

    // Run 2 (catch-up): quota available again.
    mockSend.mockReset();
    mockSend.mockResolvedValue({ id: 'm' });
    await sendWeeklyDigest();
    expect(sentTo()).toEqual(['u-b@example.com', 'u-a@example.com']);
    expect(mockMarkers.map((m) => m.userId)).toEqual(['u-c', 'u-b', 'u-a']);

    // Run 3: nothing pending -> no sends.
    mockSend.mockReset();
    await sendWeeklyDigest();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('leaves thrown and rail-skipped recipients unmarked so the next run retries them', async () => {
    mockSend
      .mockResolvedValueOnce({ id: 'm1' })
      .mockRejectedValueOnce(new Error('Gmail: boom'))
      .mockResolvedValueOnce(undefined); // rail dropped the recipient (hard-suppressed / blocked domain)
    await sendWeeklyDigest();
    expect(mockMarkers.map((m) => m.userId)).toEqual(['u-c']);
    mockSend.mockReset();
    mockSend.mockResolvedValue({ id: 'm' });
    await sendWeeklyDigest();
    expect(sentTo()).toEqual(['u-b@example.com', 'u-a@example.com']);
  });
});
