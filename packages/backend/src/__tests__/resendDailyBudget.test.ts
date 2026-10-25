/**
 * Resend daily headroom guard (2026-10-25) -- lib/transactionalEmailService.ts.
 * The Resend account is on the free plan (100 emails per UTC day). Bulk sends are refused once the
 * day's count reaches RESEND_DAILY_BULK_BUDGET; transactional sends are never blocked by the guard.
 * Resend, Redis, Prisma, suppression, usage tracking and Sentry are mocks: no real email is sent.
 */
const mockResendSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: (...a: any[]) => mockResendSend(...a) } })),
}));
jest.mock('../services/suppressionService', () => ({
  suppressionService: { checkMultipleHard: jest.fn().mockResolvedValue(new Map()) },
}));
jest.mock('../lib/aiCostTracker', () => ({ recordApiUsage: jest.fn().mockResolvedValue(undefined) }));
var mockCaptureMessage = jest.fn();
jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
  captureMessage: (...a: any[]) => mockCaptureMessage(...a),
  addBreadcrumb: jest.fn(),
}));
var mockRedisData = new Map<string, string>();
jest.mock('../lib/redis', () => ({
  redis: {
    get: async (k: string) => (mockRedisData.has(k) ? (mockRedisData.get(k) as string) : null),
    setex: async (k: string, _t: number, v: string) => { mockRedisData.set(k, v); },
    incrBy: async (k: string, by: number) => {
      const next = (parseInt(mockRedisData.get(k) ?? '0', 10) || 0) + by;
      mockRedisData.set(k, String(next));
      return next;
    },
    setNx: async (k: string, _t: number, v: string) => {
      if (mockRedisData.has(k)) return false;
      mockRedisData.set(k, v);
      return true;
    },
  },
}));
var mockUsageFindUnique = jest.fn();
jest.mock('../lib/prisma', () => ({ prisma: { apiUsageLog: { findUnique: (...a: any[]) => mockUsageFindUnique(...a) } } }));

import {
  transactionalEmailService,
  bulkBudgetAllows,
  getResendDailyLimits,
  getResendDailyCount,
  resendQuotaDay,
} from '../lib/transactionalEmailService';

const msg = (extra: Record<string, unknown> = {}) => ({ to: 'a@example.com', subject: 'Hi', html: '<p>x</p>', ...extra });
const todayKey = () => `resend:daily-count:${resendQuotaDay()}`;

describe('Resend daily headroom guard', () => {
  const OLD = { key: process.env.RESEND_API_KEY, cap: process.env.RESEND_DAILY_CAP, bulk: process.env.RESEND_DAILY_BULK_BUDGET };
  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test_key';
    delete process.env.RESEND_DAILY_CAP;
    delete process.env.RESEND_DAILY_BULK_BUDGET;
    mockRedisData.clear();
    mockResendSend.mockReset();
    mockResendSend.mockResolvedValue({ data: { id: 'e1' }, error: null });
    mockUsageFindUnique.mockReset();
    mockUsageFindUnique.mockResolvedValue(null);
  });
  afterAll(() => {
    for (const [name, v] of [['RESEND_API_KEY', OLD.key], ['RESEND_DAILY_CAP', OLD.cap], ['RESEND_DAILY_BULK_BUDGET', OLD.bulk]] as const) {
      if (v === undefined) delete process.env[name];
      else process.env[name] = v;
    }
  });

  describe('budget math', () => {
    it('allows a bulk send only while the count stays within the budget', () => {
      expect(bulkBudgetAllows(0, 1, 70)).toBe(true);
      expect(bulkBudgetAllows(69, 1, 70)).toBe(true);
      expect(bulkBudgetAllows(70, 1, 70)).toBe(false);
      expect(bulkBudgetAllows(68, 3, 70)).toBe(false); // multi-recipient: each address counts
    });

    it('defaults to cap 100 / bulk budget 70 and reads env overrides, clamping the budget to the cap', () => {
      expect(getResendDailyLimits()).toEqual({ cap: 100, bulkBudget: 70 });
      process.env.RESEND_DAILY_CAP = '50';
      process.env.RESEND_DAILY_BULK_BUDGET = '80';
      expect(getResendDailyLimits()).toEqual({ cap: 50, bulkBudget: 50 });
      process.env.RESEND_DAILY_BULK_BUDGET = 'garbage';
      expect(getResendDailyLimits()).toEqual({ cap: 50, bulkBudget: 50 });
    });

    it('uses the UTC calendar day (Resend resets at 00:00 UTC)', () => {
      expect(resendQuotaDay(new Date('2026-10-23T23:59:59Z'))).toBe('2026-10-23');
      expect(resendQuotaDay(new Date('2026-10-24T00:00:00Z'))).toBe('2026-10-24');
    });
  });

  it('sends bulk mail until the budget is reached, then refuses it without calling Resend', async () => {
    process.env.RESEND_DAILY_BULK_BUDGET = '3';
    for (let i = 0; i < 3; i++) {
      expect(await transactionalEmailService.emails.send(msg({ category: 'bulk', jobName: 'weeklyDigest' }))).toEqual({ sent: true });
    }
    const refused = await transactionalEmailService.emails.send(msg({ category: 'bulk', jobName: 'weeklyDigest' }));
    expect(refused).toEqual({ sent: false, reason: 'daily_bulk_budget' });
    expect(mockResendSend).toHaveBeenCalledTimes(3);
    expect(await getResendDailyCount()).toBe(3); // the refused send was not counted
    // One Sentry warning per day, however many refusals follow.
    await transactionalEmailService.emails.send(msg({ category: 'bulk' }));
    const warnings = mockCaptureMessage.mock.calls.filter((c) => /bulk budget/i.test(String(c[0])));
    expect(warnings).toHaveLength(1);
  });

  it('never blocks transactional mail, even past the bulk budget and the plan cap', async () => {
    process.env.RESEND_DAILY_CAP = '5';
    process.env.RESEND_DAILY_BULK_BUDGET = '2';
    for (let i = 0; i < 8; i++) {
      expect(await transactionalEmailService.emails.send(msg({ jobName: 'passwordReset' }))).toEqual({ sent: true });
    }
    expect(mockResendSend).toHaveBeenCalledTimes(8);
    expect(await getResendDailyCount()).toBe(8);
    // ...while bulk is refused at that point.
    expect((await transactionalEmailService.emails.send(msg({ category: 'bulk' }))).reason).toBe('daily_bulk_budget');
  });

  it('counts transactional sends against the bulk budget (the reserve is what is left for transactional)', async () => {
    process.env.RESEND_DAILY_BULK_BUDGET = '2';
    await transactionalEmailService.emails.send(msg());
    await transactionalEmailService.emails.send(msg());
    expect((await transactionalEmailService.emails.send(msg({ category: 'bulk' }))).reason).toBe('daily_bulk_budget');
  });

  it('counts every recipient of a multi-recipient send', async () => {
    await transactionalEmailService.emails.send(msg({ to: ['a@example.com', 'b@example.com', 'c@example.com'] }));
    expect(await getResendDailyCount()).toBe(3);
  });

  it('seeds a missing counter from the durable ApiUsageLog row for the same UTC day', async () => {
    mockUsageFindUnique.mockResolvedValue({ callCount: 69 });
    expect(await transactionalEmailService.emails.send(msg({ category: 'bulk' }))).toEqual({ sent: true });
    expect(mockUsageFindUnique.mock.calls[0][0].where.service_dateKey).toEqual({ service: 'resend:transactional', dateKey: resendQuotaDay() });
    expect(mockRedisData.get(todayKey())).toBe('70');
    expect((await transactionalEmailService.emails.send(msg({ category: 'bulk' }))).reason).toBe('daily_bulk_budget');
  });

  it('releases a bulk reservation when Resend rejects the send', async () => {
    mockResendSend.mockResolvedValueOnce({ data: null, error: { name: 'validation_error', message: 'bad' } });
    await expect(transactionalEmailService.emails.send(msg({ category: 'bulk' }))).rejects.toThrow(/Resend send failed/);
    mockResendSend.mockRejectedValueOnce(new Error('network down'));
    await expect(transactionalEmailService.emails.send(msg({ category: 'bulk' }))).rejects.toThrow(/network down/);
    expect(await getResendDailyCount()).toBe(0);
  });

  it('never sends the category field to Resend', async () => {
    await transactionalEmailService.emails.send(msg({ category: 'bulk' }));
    expect(Object.prototype.hasOwnProperty.call(mockResendSend.mock.calls[0][0], 'category')).toBe(false);
  });
});
