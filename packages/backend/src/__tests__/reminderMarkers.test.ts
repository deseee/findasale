/**
 * Reminder "due and not yet sent" scheduling + once-only ledger (2026-09-29 rework). Prisma, Twilio, email and
 * push are jest mocks; the SaleReminderSent ledger is an in-memory fake with the same unique-key semantics as
 * the table (createMany skipDuplicates). No network, no real email or text. NOT EXECUTED by jest when written
 * (see the report): logic was run through an in-memory harness.
 */
type LedgerRow = { subscriberId: string; saleId: string; kind: string };
let ledgerRows: LedgerRow[] = [];
let allSales: any[] = [];

const mockSaleFindMany = jest.fn();
const mockCreateMany = jest.fn();
const mockDeleteMany = jest.fn();
const mockLedgerFindMany = jest.fn();
const mockPushSubFindMany = jest.fn();
const mockOptOutFindMany = jest.fn();
const mockSmsLogCreate = jest.fn();
const mockSmsAggregate = jest.fn();
const mockUserFindUnique = jest.fn();
jest.mock('../lib/prisma', () => ({
  prisma: {
    sale: { findMany: (...a: unknown[]) => mockSaleFindMany(...a) },
    saleReminderSent: {
      createMany: (...a: unknown[]) => mockCreateMany(...a),
      deleteMany: (...a: unknown[]) => mockDeleteMany(...a),
      findMany: (...a: unknown[]) => mockLedgerFindMany(...a),
    },
    pushSubscription: { findMany: (...a: unknown[]) => mockPushSubFindMany(...a) },
    smsOptOut: { findMany: (...a: unknown[]) => mockOptOutFindMany(...a), upsert: jest.fn() },
    smsSendLog: { create: (...a: unknown[]) => mockSmsLogCreate(...a), aggregate: (...a: unknown[]) => mockSmsAggregate(...a) },
    user: { findUnique: (...a: unknown[]) => mockUserFindUnique(...a) },
  },
}));

const mockTwilioCreate = jest.fn();
jest.mock('twilio', () => jest.fn(() => ({ messages: { create: (...a: unknown[]) => mockTwilioCreate(...a) } })));
const mockSendPush = jest.fn();
jest.mock('../utils/webpush', () => ({ sendPushNotification: (...a: unknown[]) => mockSendPush(...a) }));
jest.mock('../services/emailTemplateService', () => ({ buildSaleDayReminderEmail: jest.fn(() => '<p>x</p>') }));
const mockEmailSend = jest.fn();
jest.mock('../lib/emailService', () => ({ emailService: { emails: { send: (...a: unknown[]) => mockEmailSend(...a) } } }));
const mockTransactionalSend = jest.fn();
jest.mock('../lib/transactionalEmailService', () => ({
  transactionalEmailService: { emails: { send: (...a: unknown[]) => mockTransactionalSend(...a) } },
}));
jest.mock('../services/suppressionService', () => ({ suppressionService: { isSuppressed: jest.fn().mockResolvedValue(false) } }));
const mockGenToken = jest.fn();
jest.mock('../controllers/unsubscribeController', () => ({ generateUnsubscribeToken: (...a: unknown[]) => mockGenToken(...a) }));

import {
  REMINDER_WINDOWS,
  REMINDER_MAX_ATTEMPTS,
  reminderWindow,
  claimReminder,
  releaseReminder,
  failureKind,
  isMissingTableError,
  processReminderPass,
  processReminderEmails,
  RETRYABLE_SMS_OUTCOMES,
} from '../services/emailReminderService';

const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;
const consent = new Date('2026-09-01T00:00:00Z');

// Organizer timezone America/Chicago (CDT, UTC-5 on these dates); text window is 8:00 AM to 9:00 PM local.
const SALE_START = new Date('2026-09-30T20:00:00Z'); // 3:00 PM CDT
const DAY_NOON = new Date('2026-09-30T15:00:00Z'); // 10:00 AM CDT, sale in 5h: DAY_BEFORE due, texts allowed
const DAY_NIGHT = new Date('2026-09-30T07:00:00Z'); // 2:00 AM CDT, sale in 13h: DAY_BEFORE due, quiet hours
const TWO_NOON = new Date('2026-09-30T18:30:00Z'); // 1:30 PM CDT, sale in 1.5h: TWO_HOURS due, texts allowed

const sale = (subscribers: any[], over: Record<string, unknown> = {}) => {
  const startDate = (over.startDate as Date) ?? SALE_START;
  return {
    id: 's1',
    title: 'Oak Street Sale',
    address: '12 Oak St',
    city: 'Paw Paw',
    state: 'MI',
    status: 'PUBLISHED',
    deletedAt: null,
    startDate,
    endDate: new Date(startDate.getTime() + 6 * HOUR),
    organizerId: 'org1',
    organizer: { id: 'org1', businessName: 'Oak Street Estates', timezone: 'America/Chicago', subscriptionTier: 'PRO' },
    subscribers,
    ...over,
  };
};
const subscriber = (over: Record<string, unknown> = {}) => {
  const row: Record<string, any> = {
    id: 'sub1',
    email: 'shopper@example.com',
    phone: null,
    userId: 'u1',
    smsConsentAt: null,
    emailOptOutAt: null,
    ...over,
  };
  // The reminder pass reads the ACCOUNT's email (User.email) through the `user` relation, never SaleSubscriber.email
  // (that column is only an "email me" flag). By default the account's email is the row's own, like a normal signup.
  if (!('user' in over)) row.user = row.userId ? { email: row.email ?? 'account@example.com' } : null;
  return row;
};
const smsSub = (over: Record<string, unknown> = {}) =>
  subscriber({ email: null, userId: null, phone: '(269) 555-0142', smsConsentAt: consent, ...over });

const ledgerKinds = () => ledgerRows.map((r) => r.kind).sort();
let sends: Array<{ subject: string; to: string }> = [];
let guestMail: any[] = [];
const dayEmails = () => sends.filter((s) => /^Your sale is (today|tomorrow)/.test(s.subject));
const twoHourEmails = () => sends.filter((s) => s.subject.includes('starts in about 2 hours'));

beforeEach(() => {
  jest.clearAllMocks();
  process.env.TWILIO_ACCOUNT_SID = 'ACtest';
  process.env.TWILIO_AUTH_TOKEN = 'token';
  process.env.TWILIO_PHONE_NUMBER = '+18885550100';
  ledgerRows = [];
  allSales = [];
  sends = [];
  guestMail = [];
  // Sale query: honours the same filters the service sends to Prisma.
  mockSaleFindMany.mockImplementation(async ({ where }: any) =>
    allSales.filter(
      (s) =>
        s.status === where.status &&
        s.deletedAt === where.deletedAt &&
        s.startDate > where.startDate.gt &&
        s.startDate <= where.startDate.lte &&
        s.endDate > where.endDate.gt,
    ),
  );
  // Ledger fake with the table's unique (subscriberId, saleId, kind) semantics. Synchronous body = atomic claim.
  mockCreateMany.mockImplementation(async ({ data }: { data: LedgerRow[] }) => {
    let count = 0;
    for (const d of data) {
      if (!ledgerRows.some((r) => r.subscriberId === d.subscriberId && r.saleId === d.saleId && r.kind === d.kind)) {
        ledgerRows.push({ subscriberId: d.subscriberId, saleId: d.saleId, kind: d.kind });
        count += 1;
      }
    }
    return { count };
  });
  mockDeleteMany.mockImplementation(async ({ where }: any) => {
    const before = ledgerRows.length;
    ledgerRows = ledgerRows.filter((r) => !(r.subscriberId === where.subscriberId && r.saleId === where.saleId && r.kind === where.kind));
    return { count: before - ledgerRows.length };
  });
  mockLedgerFindMany.mockImplementation(async ({ where }: any) => ledgerRows.filter((r) => where.saleId.in.includes(r.saleId)).map((r) => ({ ...r })));
  mockPushSubFindMany.mockResolvedValue([]);
  mockOptOutFindMany.mockResolvedValue([]);
  mockSmsLogCreate.mockResolvedValue({});
  mockSmsAggregate.mockResolvedValue({ _sum: { sentCount: 0 } });
  mockUserFindUnique.mockResolvedValue({ notificationPrefs: {} });
  mockTwilioCreate.mockResolvedValue({ sid: 'SM1' });
  mockTransactionalSend.mockImplementation(async (arg: any) => {
    sends.push({ subject: arg.subject, to: arg.to });
    guestMail.push(arg);
    return { sent: true };
  });
  mockEmailSend.mockImplementation(async (arg: any) => {
    sends.push({ subject: arg.subject, to: arg.to });
    return { id: 'e1' };
  });
  mockGenToken.mockResolvedValue('tok');
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('due bands', () => {
  it('day-before is due 2h..24h out and two-hours is due 0..2h out, exclusive lower / inclusive upper', () => {
    expect(REMINDER_WINDOWS.DAY_BEFORE).toEqual({ fromMs: 2 * HOUR, toMs: 24 * HOUR });
    expect(REMINDER_WINDOWS.TWO_HOURS).toEqual({ fromMs: 0, toMs: 2 * HOUR });
    const { from, to } = reminderWindow('TWO_HOURS', TWO_NOON);
    expect(from.getTime()).toBe(TWO_NOON.getTime());
    expect(to.getTime()).toBe(TWO_NOON.getTime() + 2 * HOUR);
  });

  it('the two bands tile the last 24 hours with no gap and no overlap', () => {
    expect(REMINDER_WINDOWS.DAY_BEFORE.fromMs).toBe(REMINDER_WINDOWS.TWO_HOURS.toMs);
    expect(REMINDER_WINDOWS.TWO_HOURS.fromMs).toBe(0);
  });

  it('queries published, undeleted, not-ended sales with a (from, to] start band', async () => {
    await processReminderPass('DAY_BEFORE', DAY_NOON, {});
    const where = mockSaleFindMany.mock.calls[0][0].where;
    expect(where.status).toBe('PUBLISHED');
    expect(where.deletedAt).toBeNull();
    expect(where.startDate.gt.getTime()).toBe(DAY_NOON.getTime() + 2 * HOUR);
    expect(where.startDate.lte.getTime()).toBe(DAY_NOON.getTime() + 24 * HOUR);
    expect(where.startDate.gte).toBeUndefined();
    expect(where.endDate.gt.getTime()).toBe(DAY_NOON.getTime());
    await processReminderPass('TWO_HOURS', TWO_NOON, {});
    const where2 = mockSaleFindMany.mock.calls[1][0].where;
    expect(where2.startDate.gt.getTime()).toBe(TWO_NOON.getTime());
    expect(where2.startDate.lte.getTime()).toBe(TWO_NOON.getTime() + 2 * HOUR);
  });

  it('processReminderEmails runs both passes and returns a summary', async () => {
    const summary = await processReminderEmails(DAY_NOON);
    expect(mockSaleFindMany).toHaveBeenCalledTimes(2);
    expect(summary).toMatchObject({ salesChecked: 0, sent: 0, alreadySent: 0, skippedQuietHours: 0, ledgerUnavailable: false });
  });

  it('isMissingTableError recognises Prisma P2021/P2022 and Postgres does-not-exist errors', () => {
    expect(isMissingTableError({ code: 'P2021' })).toBe(true);
    expect(isMissingTableError({ code: 'P2022' })).toBe(true);
    expect(isMissingTableError(new Error('relation "SaleReminderSent" does not exist'))).toBe(true);
    expect(isMissingTableError(new Error('connection reset'))).toBe(false);
  });
});

describe('claim / release', () => {
  it('claimReminder uses createMany skipDuplicates and reports whether this caller owns the send', async () => {
    expect(await claimReminder('sub1', 's1', 'DAY_BEFORE')).toBe(true);
    expect(mockCreateMany).toHaveBeenCalledWith({
      data: [{ subscriberId: 'sub1', saleId: 's1', kind: 'DAY_BEFORE' }],
      skipDuplicates: true,
    });
    expect(await claimReminder('sub1', 's1', 'DAY_BEFORE')).toBe(false); // second claim of the same key loses
  });

  it('releaseReminder deletes exactly that claim and never throws', async () => {
    await releaseReminder('sub1', 's1', 'TWO_HOURS_SMS');
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { subscriberId: 'sub1', saleId: 's1', kind: 'TWO_HOURS_SMS' } });
    mockDeleteMany.mockRejectedValueOnce(new Error('db down'));
    await expect(releaseReminder('sub1', 's1', 'TWO_HOURS_SMS')).resolves.toBeUndefined();
  });

  it('only failures and deferrals are retryable SMS outcomes', () => {
    expect(RETRYABLE_SMS_OUTCOMES.has('failed')).toBe(true);
    expect(RETRYABLE_SMS_OUTCOMES.has('skipped_quiet_hours')).toBe(true);
    expect(RETRYABLE_SMS_OUTCOMES.has('sent')).toBe(false);
    expect(RETRYABLE_SMS_OUTCOMES.has('skipped_opted_out')).toBe(false);
    expect(RETRYABLE_SMS_OUTCOMES.has('skipped_no_consent')).toBe(false);
  });
});

describe('consecutive hourly runs', () => {
  it('DAY_BEFORE is not re-sent on later hourly runs', async () => {
    allSales = [sale([subscriber()])];
    const first = await processReminderEmails(new Date('2026-09-30T08:06:00Z')); // sale in 11h54
    expect(dayEmails()).toHaveLength(1);
    expect(first.emailHandled).toBe(1);
    const second = await processReminderEmails(new Date('2026-09-30T09:06:00Z'));
    await processReminderEmails(new Date('2026-09-30T10:06:00Z'));
    expect(dayEmails()).toHaveLength(1);
    expect(second.alreadySent).toBe(1);
    expect(second.sent).toBe(0);
    expect(ledgerKinds()).toEqual(['DAY_BEFORE']);
  });

  it('the day-before reminder is due from 24h out, so the first run after that sends it (no duplicate on the next)', async () => {
    allSales = [sale([subscriber()])];
    await processReminderEmails(new Date('2026-09-29T19:06:00Z')); // 25h54 out: not due yet
    expect(sends).toHaveLength(0);
    await processReminderEmails(new Date('2026-09-29T20:06:00Z')); // 23h54 out: due
    expect(dayEmails()).toHaveLength(1);
    await processReminderEmails(new Date('2026-09-29T21:06:00Z'));
    expect(dayEmails()).toHaveLength(1);
  });

  it('TWO_HOURS is sent once when due even if the previous run was 55 minutes ago', async () => {
    allSales = [sale([subscriber()])];
    await processReminderEmails(new Date('2026-09-30T17:10:00Z')); // 2h50 out: only DAY_BEFORE is due
    expect(twoHourEmails()).toHaveLength(0);
    expect(dayEmails()).toHaveLength(1);
    await processReminderEmails(new Date('2026-09-30T18:05:00Z')); // 55 minutes later, 1h55 out: TWO_HOURS due
    expect(twoHourEmails()).toHaveLength(1);
    expect(dayEmails()).toHaveLength(1);
    await processReminderEmails(new Date('2026-09-30T19:00:00Z')); // 55 minutes later again: nothing new
    expect(twoHourEmails()).toHaveLength(1);
    expect(ledgerKinds()).toEqual(['DAY_BEFORE', 'TWO_HOURS']);
  });

  it('sweep: hourly runs at :06 send exactly one reminder of each kind per sale, never after the start', async () => {
    const starts = ['2026-09-30T14:00:00Z', '2026-09-30T14:37:00Z', '2026-09-30T15:05:00Z', '2026-09-30T15:07:00Z'];
    for (const startIso of starts) {
      ledgerRows = [];
      sends = [];
      const start = new Date(startIso);
      allSales = [sale([subscriber()], { startDate: start })];
      let firstAt = 0;
      for (let t = new Date('2026-09-29T09:06:00Z').getTime(); t < start.getTime() + 2 * HOUR; t += HOUR) {
        const before = sends.length;
        await processReminderEmails(new Date(t));
        if (sends.length > before) {
          expect(t).toBeLessThan(start.getTime()); // nothing after the sale has started
          firstAt = firstAt || t;
        }
      }
      expect(dayEmails()).toHaveLength(1);
      expect(twoHourEmails()).toHaveLength(1);
      expect(firstAt).toBeGreaterThan(start.getTime() - 24 * HOUR - 1);
    }
  });

  it('a sale that has started gets nothing', async () => {
    allSales = [sale([subscriber(), smsSub({ id: 'sub2' })], { startDate: new Date(TWO_NOON.getTime() - 30 * MIN) })];
    const summary = await processReminderEmails(TWO_NOON);
    expect(sends).toHaveLength(0);
    expect(mockTwilioCreate).not.toHaveBeenCalled();
    expect(mockCreateMany).not.toHaveBeenCalled();
    expect(summary.salesChecked).toBe(0);
  });

  it('a sale that starts mid-run is not reminded (start re-checked before each send)', async () => {
    // Bypass the query filter: the sale is returned but its start is already behind the run clock.
    mockSaleFindMany.mockResolvedValue([sale([subscriber(), smsSub({ id: 'sub2' })], { startDate: new Date(TWO_NOON.getTime() - 1000) })]);
    const out: Record<string, number> = {};
    await processReminderPass('TWO_HOURS', TWO_NOON, out);
    expect(sends).toHaveLength(0);
    expect(mockTwilioCreate).not.toHaveBeenCalled();
    expect(out.skipped_started).toBe(2);
  });

  it('excludes deleted and non-published sales via the query', async () => {
    allSales = [sale([subscriber()], { deletedAt: new Date('2026-09-29T00:00:00Z') }), sale([subscriber()], { id: 's2', status: 'DRAFT' })];
    await processReminderEmails(DAY_NOON);
    expect(sends).toHaveLength(0);
  });
});

describe('processReminderPass once-only sending', () => {
  it('claims, then sends email and push once', async () => {
    allSales = [sale([subscriber()])];
    mockPushSubFindMany.mockResolvedValue([{ endpoint: 'e' }]);
    await processReminderPass('DAY_BEFORE', DAY_NOON, {});
    expect(mockCreateMany).toHaveBeenCalledWith(expect.objectContaining({ data: [{ subscriberId: 'sub1', saleId: 's1', kind: 'DAY_BEFORE' }] }));
    expect(sends).toHaveLength(1);
    expect(mockSendPush).toHaveBeenCalledTimes(1);
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it('a subscriber already in the ledger is skipped without a claim write (alreadySent)', async () => {
    allSales = [sale([subscriber({ phone: '(269) 555-0142', smsConsentAt: consent })])];
    ledgerRows = [
      { subscriberId: 'sub1', saleId: 's1', kind: 'DAY_BEFORE' },
      { subscriberId: 'sub1', saleId: 's1', kind: 'DAY_BEFORE_SMS' },
    ];
    mockPushSubFindMany.mockResolvedValue([{ endpoint: 'e' }]);
    const out: Record<string, number> = {};
    await processReminderPass('DAY_BEFORE', DAY_NOON, out);
    expect(sends).toHaveLength(0);
    expect(mockSendPush).not.toHaveBeenCalled();
    expect(mockTwilioCreate).not.toHaveBeenCalled();
    expect(mockCreateMany).not.toHaveBeenCalled();
    expect(out.already_claimed_email_push).toBe(1);
    expect(out.already_claimed_sms).toBe(1);
  });

  it('DAY_BEFORE already sent does not block the distinct TWO_HOURS reminder', async () => {
    allSales = [sale([subscriber()])];
    ledgerRows = [{ subscriberId: 'sub1', saleId: 's1', kind: 'DAY_BEFORE' }];
    await processReminderPass('TWO_HOURS', TWO_NOON, {});
    expect(twoHourEmails()).toHaveLength(1);
    expect(ledgerKinds()).toEqual(['DAY_BEFORE', 'TWO_HOURS']);
  });

  it('concurrent runs: the claim lets exactly one send the email', async () => {
    allSales = [sale([subscriber()])];
    const a: Record<string, number> = {};
    const b: Record<string, number> = {};
    await Promise.all([processReminderPass('DAY_BEFORE', DAY_NOON, a), processReminderPass('DAY_BEFORE', DAY_NOON, b)]);
    expect(sends).toHaveLength(1);
    expect((a.email_handled ?? 0) + (b.email_handled ?? 0)).toBe(1);
    expect((a.already_claimed_email_push ?? 0) + (b.already_claimed_email_push ?? 0)).toBe(1);
  });

  it('concurrent runs: exactly one text is sent', async () => {
    allSales = [sale([smsSub()])];
    await Promise.all([processReminderPass('DAY_BEFORE', DAY_NOON, {}), processReminderPass('DAY_BEFORE', DAY_NOON, {})]);
    expect(mockTwilioCreate).toHaveBeenCalledTimes(1);
  });

  it('a failed email releases the claim and skips push, so a later run retries', async () => {
    allSales = [sale([subscriber()])];
    mockGenToken.mockRejectedValue(new Error('token store down')); // sendReminderEmail returns false right away
    mockPushSubFindMany.mockResolvedValue([{ endpoint: 'e' }]);
    const out: Record<string, number> = {};
    await processReminderPass('TWO_HOURS', TWO_NOON, out);
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { subscriberId: 'sub1', saleId: 's1', kind: 'TWO_HOURS' } });
    expect(mockSendPush).not.toHaveBeenCalled();
    expect(out.email_failed).toBe(1);
    expect(ledgerKinds()).toEqual([failureKind('TWO_HOURS', 1)]); // claim gone, only the failure marker remains
  });

  it('failure then success: the next run delivers once and later runs stay quiet', async () => {
    allSales = [sale([subscriber()])];
    mockGenToken.mockRejectedValueOnce(new Error('token store down')).mockResolvedValue('tok');
    await processReminderEmails(new Date('2026-09-30T08:06:00Z'));
    expect(sends).toHaveLength(0);
    await processReminderEmails(new Date('2026-09-30T09:06:00Z'));
    expect(dayEmails()).toHaveLength(1);
    await processReminderEmails(new Date('2026-09-30T10:06:00Z'));
    expect(dayEmails()).toHaveLength(1);
    expect(ledgerKinds()).toEqual(['DAY_BEFORE', failureKind('DAY_BEFORE', 1)].sort());
  });

  it(`retries are bounded: after ${REMINDER_MAX_ATTEMPTS} failed runs later runs stop trying`, async () => {
    allSales = [sale([subscriber()])];
    mockGenToken.mockRejectedValue(new Error('permanent failure'));
    let last: any;
    for (let h = 8; h < 14; h++) last = await processReminderEmails(new Date(`2026-09-30T${String(h).padStart(2, '0')}:06:00Z`));
    expect(mockGenToken).toHaveBeenCalledTimes(REMINDER_MAX_ATTEMPTS);
    expect(sends).toHaveLength(0);
    expect(last.retriesExhausted).toBe(1);
    expect(ledgerKinds()).toEqual([1, 2, 3].map((n) => failureKind('DAY_BEFORE', n)).sort());
  });

  it('fails closed when the ledger table is missing: nothing is sent and one clear error is logged per run', async () => {
    allSales = [sale([subscriber(), smsSub({ id: 'sub2' })])];
    mockLedgerFindMany.mockRejectedValue(Object.assign(new Error('The table `public.SaleReminderSent` does not exist'), { code: 'P2021' }));
    const summary = await processReminderEmails(DAY_NOON);
    expect(summary.ledgerUnavailable).toBe(true);
    expect(sends).toHaveLength(0);
    expect(mockTwilioCreate).not.toHaveBeenCalled();
    expect(mockSaleFindMany).toHaveBeenCalledTimes(1); // second pass not attempted
    const errors = (console.error as jest.Mock).mock.calls.filter((c) => /SaleReminderSent/.test(String(c[0])));
    expect(errors).toHaveLength(1);
    expect(String(errors[0][0])).toMatch(/sent nothing/);
  });

  it('fails closed when the claim itself reports a missing table', async () => {
    allSales = [sale([subscriber()])];
    mockCreateMany.mockRejectedValue(Object.assign(new Error('column does not exist'), { code: 'P2022' }));
    const summary = await processReminderEmails(DAY_NOON);
    expect(summary.ledgerUnavailable).toBe(true);
    expect(sends).toHaveLength(0);
  });

  it('a transient claim error skips only that subscriber', async () => {
    allSales = [sale([subscriber({ id: 'bad' }), subscriber({ id: 'good', email: 'good@example.com' })])];
    mockCreateMany.mockRejectedValueOnce(new Error('boom')).mockImplementation(async () => ({ count: 1 }));
    const out: Record<string, number> = {};
    await processReminderPass('DAY_BEFORE', DAY_NOON, out);
    expect(sends).toHaveLength(1);
    expect(sends[0].to).toBe('good@example.com');
    expect(out.claim_errors).toBe(1);
  });
});

describe('processReminderPass SMS handling', () => {
  it('sends an in-hours text under its own SMS claim and keeps the claim', async () => {
    allSales = [sale([smsSub()])];
    const out: Record<string, number> = {};
    await processReminderPass('DAY_BEFORE', DAY_NOON, out);
    expect(mockCreateMany).toHaveBeenCalledWith(expect.objectContaining({ data: [{ subscriberId: 'sub1', saleId: 's1', kind: 'DAY_BEFORE_SMS' }] }));
    expect(mockTwilioCreate).toHaveBeenCalledTimes(1);
    expect(out.sent).toBe(1);
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it('quiet hours: no text and no claim or marker is written, so nothing is lost', async () => {
    allSales = [sale([smsSub()])];
    const out: Record<string, number> = {};
    await processReminderPass('DAY_BEFORE', DAY_NIGHT, out);
    expect(mockTwilioCreate).not.toHaveBeenCalled();
    expect(out.skipped_quiet_hours).toBe(1);
    expect(mockCreateMany).not.toHaveBeenCalled();
    expect(ledgerRows).toHaveLength(0);
  });

  it('quiet hours skip, then the next hourly run inside the due band delivers the text once', async () => {
    const start = new Date('2026-09-30T12:00:00Z'); // 7:00 AM CDT: due from 7:00 AM the day before, texts allowed from 8:00 AM
    allSales = [sale([smsSub()], { startDate: start })];
    const r1 = await processReminderEmails(new Date('2026-09-29T12:06:00Z')); // 7:06 AM CDT: quiet
    expect(mockTwilioCreate).not.toHaveBeenCalled();
    expect(r1.skippedQuietHours).toBe(1);
    expect(ledgerRows).toHaveLength(0);
    await processReminderEmails(new Date('2026-09-29T13:06:00Z')); // 8:06 AM CDT: allowed
    expect(mockTwilioCreate).toHaveBeenCalledTimes(1);
    expect(ledgerKinds()).toEqual(['DAY_BEFORE_SMS']);
    await processReminderEmails(new Date('2026-09-29T14:06:00Z')); // later runs do not repeat it
    expect(mockTwilioCreate).toHaveBeenCalledTimes(1);
  });

  it('a quiet-hours text skip leaves the email that already went out untouched', async () => {
    allSales = [sale([smsSub({ email: 'shopper@example.com', userId: 'u1' })])];
    await processReminderPass('DAY_BEFORE', DAY_NIGHT, {});
    expect(sends).toHaveLength(1); // email is not subject to quiet hours
    expect(mockTwilioCreate).not.toHaveBeenCalled();
    expect(ledgerKinds()).toEqual(['DAY_BEFORE']);
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it('the run clock advances during a long pass: no text once quiet hours begin mid-run, and no marker is left', async () => {
    // Run starts at 8:59:59 PM CDT (allowed); by the time this subscriber is reached the real clock is past 9:00 PM.
    const nearEnd = new Date('2026-10-01T01:59:59.500Z');
    allSales = [sale([smsSub()], { startDate: new Date('2026-10-01T09:00:00Z') })];
    jest.useFakeTimers({ now: new Date('2026-10-01T01:59:59.400Z') });
    const p = processReminderPass('DAY_BEFORE', nearEnd, {});
    jest.setSystemTime(new Date('2026-10-01T02:00:01Z')); // real clock moved past 9:00 PM CDT during the pass
    await p;
    jest.useRealTimers();
    expect(mockTwilioCreate).not.toHaveBeenCalled();
    expect(ledgerRows.filter((r) => r.kind === 'DAY_BEFORE_SMS')).toHaveLength(0);
  });

  it('a Twilio failure releases the SMS claim and records a bounded failure marker; a permanent skip (opted out) keeps its claim', async () => {
    allSales = [sale([smsSub()])];
    mockTwilioCreate.mockRejectedValue(Object.assign(new Error('twilio down'), { status: 500 }));
    jest.useFakeTimers();
    const p = processReminderPass('DAY_BEFORE', DAY_NOON, {});
    await jest.advanceTimersByTimeAsync(20000); // step through withRetry backoff
    await p;
    jest.useRealTimers();
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { subscriberId: 'sub1', saleId: 's1', kind: 'DAY_BEFORE_SMS' } });
    expect(ledgerKinds()).toEqual([failureKind('DAY_BEFORE_SMS', 1)]);

    jest.clearAllMocks();
    ledgerRows = [];
    mockOptOutFindMany.mockResolvedValue([{ phone: '+12695550142' }]);
    const out: Record<string, number> = {};
    await processReminderPass('DAY_BEFORE', DAY_NOON, out);
    expect(out.skipped_opted_out).toBe(1);
    expect(mockDeleteMany).not.toHaveBeenCalled();
    expect(ledgerKinds()).toEqual(['DAY_BEFORE_SMS']);
  });

  it('never texts a phone without recorded consent and never claims for it', async () => {
    allSales = [sale([smsSub({ smsConsentAt: null })])];
    const out: Record<string, number> = {};
    await processReminderPass('DAY_BEFORE', DAY_NOON, out);
    expect(mockCreateMany).not.toHaveBeenCalled();
    expect(mockTwilioCreate).not.toHaveBeenCalled();
    expect(out.skipped_no_consent).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------------------
// 2026-09-29 compliance pass: tier gate, daily cap, subject wording, per-subscriber and per-user email opt-out.
// ---------------------------------------------------------------------------------------------------------
describe('reminder texts: PRO tier gate and daily cap', () => {
  it('a SIMPLE-tier organizer never sends reminder texts: no claim, no marker, counted as skipped_tier', async () => {
    allSales = [sale([smsSub()], { organizer: { id: 'org1', businessName: 'Oak Street Estates', timezone: 'America/Chicago', subscriptionTier: 'SIMPLE' } })];
    const out: Record<string, number> = {};
    await processReminderPass('DAY_BEFORE', DAY_NOON, out);
    expect(mockTwilioCreate).not.toHaveBeenCalled();
    expect(mockCreateMany).not.toHaveBeenCalled();
    expect(out.skipped_tier).toBe(1);
    expect(ledgerRows).toHaveLength(0);
  });

  it('TEAMS counts as PRO', async () => {
    allSales = [sale([smsSub()], { organizer: { id: 'org1', businessName: 'Oak Street Estates', timezone: 'America/Chicago', subscriptionTier: 'TEAMS' } })];
    await processReminderPass('DAY_BEFORE', DAY_NOON, {});
    expect(mockTwilioCreate).toHaveBeenCalledTimes(1);
  });

  it('the organizer rolling daily cap stops reminder texts, is counted as skippedCap, and the claim is released for a later run', async () => {
    allSales = [sale([smsSub()])];
    mockSmsAggregate.mockResolvedValue({ _sum: { sentCount: 100000 } });
    const summary = await processReminderEmails(DAY_NOON);
    expect(mockTwilioCreate).not.toHaveBeenCalled();
    expect(summary.skippedCap).toBeGreaterThanOrEqual(1);
    expect(ledgerKinds().filter((k) => k.endsWith('_SMS'))).toHaveLength(0); // claim released, no failure marker for a cap skip
    expect(RETRYABLE_SMS_OUTCOMES.has('skipped_daily_cap')).toBe(true);
  });

  it('a sent reminder text is written to the send log so it counts toward the cap', async () => {
    allSales = [sale([smsSub()])];
    await processReminderPass('DAY_BEFORE', DAY_NOON, {});
    expect(mockSmsLogCreate).toHaveBeenCalledTimes(1);
    expect(mockSmsLogCreate.mock.calls[0][0].data).toMatchObject({ organizerId: 'org1', saleId: 's1', sentCount: 1 });
  });

  it('the sent body carries the business prefix and the STOP footer and never the full phone number in a log line', async () => {
    allSales = [sale([smsSub()])];
    await processReminderPass('DAY_BEFORE', DAY_NOON, {});
    const body = mockTwilioCreate.mock.calls[0][0].body as string;
    expect(body.startsWith('Oak Street Estates via FindA.Sale: ')).toBe(true);
    expect(body).toMatch(/Reply STOP to opt out\.$/);
    const logged = [...(console.log as jest.Mock).mock.calls, ...(console.error as jest.Mock).mock.calls].map((c) => c.join(' ')).join('\n');
    expect(logged).not.toContain('2695550142');
    expect(logged).not.toContain('(269) 555-0142');
  });
});

describe('reminder email: wording, timezone and opt-out', () => {
  it('says "today" when the sale starts later the same local day and "tomorrow" otherwise', async () => {
    allSales = [sale([subscriber()])];
    await processReminderPass('DAY_BEFORE', DAY_NOON, {}); // 10:00 AM CDT, sale 3:00 PM CDT the same day
    expect(sends[0].subject).toBe('Your sale is today: Oak Street Sale');
    sends = [];
    ledgerRows = [];
    await processReminderPass('DAY_BEFORE', new Date('2026-09-29T20:06:00Z'), {}); // 3:06 PM CDT the day before
    expect(sends[0].subject).toBe('Your sale is tomorrow: Oak Street Sale');
  });

  it('a subscriber with emailOptOutAt gets no reminder email but still gets push', async () => {
    allSales = [sale([subscriber({ emailOptOutAt: new Date('2026-09-20T00:00:00Z') })])];
    mockPushSubFindMany.mockResolvedValue([{ endpoint: 'e' }]);
    const out: Record<string, number> = {};
    await processReminderPass('DAY_BEFORE', DAY_NOON, out);
    expect(sends).toHaveLength(0);
    expect(out.skipped_email_opt_out).toBe(1);
    expect(mockSendPush).toHaveBeenCalledTimes(1);
  });

  it('a subscriber with no account is not emailed (no way to unsubscribe)', async () => {
    allSales = [sale([subscriber({ userId: null })])];
    const out: Record<string, number> = {};
    await processReminderPass('DAY_BEFORE', DAY_NOON, out);
    expect(sends).toHaveLength(0);
    expect(out.skipped_email_no_account).toBe(1);
  });

  it('a user with notificationPrefs.emailSaleReminders === false gets no email', async () => {
    allSales = [sale([subscriber()])];
    mockUserFindUnique.mockResolvedValue({ notificationPrefs: { emailSaleReminders: false } });
    await processReminderPass('DAY_BEFORE', DAY_NOON, {});
    expect(sends).toHaveLength(0);
    expect(mockGenToken).not.toHaveBeenCalled();
  });

  it('a failed preference lookup fails closed: nothing sent and the claim is released for a retry', async () => {
    allSales = [sale([subscriber()])];
    mockUserFindUnique.mockRejectedValue(new Error('db down'));
    await processReminderPass('DAY_BEFORE', DAY_NOON, {});
    expect(sends).toHaveLength(0);
    expect(mockDeleteMany).toHaveBeenCalled();
  });

  it('the unsubscribe token uses the saleReminders type', async () => {
    allSales = [sale([subscriber()])];
    await processReminderPass('DAY_BEFORE', DAY_NOON, {});
    expect(mockGenToken).toHaveBeenCalledWith('u1', 'saleReminders');
  });

  it('a hostile sale name cannot inject a header line into the subject', async () => {
    allSales = [sale([subscriber()], { title: 'Sale\r\nBcc: evil@example.com' })];
    await processReminderPass('DAY_BEFORE', DAY_NOON, {});
    expect(sends[0].subject).not.toMatch(/[\r\n]/);
  });
});

describe('reminder email recipient: the account\'s own address only (2026-09-30)', () => {
  it('sends to User.email, never to a different address stored on the subscriber row', async () => {
    allSales = [sale([subscriber({ email: 'victim@third-party.example', user: { email: 'Owner@Example.com' } })])];
    await processReminderPass('DAY_BEFORE', DAY_NOON, {});
    expect(sends).toHaveLength(1);
    expect(sends[0].to).toBe('owner@example.com');
    expect(sends.some((s) => s.to.includes('third-party'))).toBe(false);
  });

  it('a guest / orphaned row (no account) with an email on it is never emailed, and is counted as skipped', async () => {
    allSales = [sale([subscriber({ userId: null, user: null, email: 'guest@example.com' })])];
    const outcomes: Record<string, number> = {};
    await processReminderPass('DAY_BEFORE', DAY_NOON, outcomes);
    expect(sends).toHaveLength(0);
    expect(outcomes.skipped_email_no_account).toBe(1);
  });

  it('a CONFIRMED guest row is emailed on the transactional rail with an opt-out link and one-click headers (2026-09-30)', async () => {
    process.env.JWT_SECRET = 'test-secret-not-real';
    allSales = [sale([subscriber({ userId: null, user: null, email: 'Guest@Example.com', emailConfirmedAt: new Date('2026-09-29T00:00:00Z') })])];
    const outcomes: Record<string, number> = {};
    await processReminderPass('DAY_BEFORE', DAY_NOON, outcomes);
    expect(guestMail).toHaveLength(1);
    expect(guestMail[0].to).toBe('guest@example.com');
    // the template receives the stateless guest opt-out link as its unsubscribe URL (the template itself is mocked here)
    const { buildSaleDayReminderEmail } = require('../services/emailTemplateService');
    const tplArg = (buildSaleDayReminderEmail as jest.Mock).mock.calls.at(-1)![0];
    expect(tplArg.unsubUrl).toMatch(/\/api\/notifications\/guest-unsubscribe\?token=/);
    expect(guestMail[0].headers['List-Unsubscribe']).toMatch(/guest-unsubscribe\?token=/);
    expect(guestMail[0].headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(mockEmailSend).not.toHaveBeenCalled();
    expect(outcomes.skipped_email_no_account).toBeUndefined();
  });

  it('a confirmed guest who opted out, and an unconfirmed guest, are never emailed', async () => {
    process.env.JWT_SECRET = 'test-secret-not-real';
    allSales = [
      sale([
        subscriber({ id: 'g1', userId: null, user: null, email: 'out@example.com', emailConfirmedAt: new Date(), emailOptOutAt: new Date() }),
        subscriber({ id: 'g2', userId: null, user: null, email: 'pending@example.com', emailConfirmedAt: null }),
      ]),
    ];
    const outcomes: Record<string, number> = {};
    await processReminderPass('DAY_BEFORE', DAY_NOON, outcomes);
    expect(guestMail).toHaveLength(0);
    expect(mockEmailSend).not.toHaveBeenCalled();
    expect(outcomes.skipped_email_opt_out).toBe(1);
    expect(outcomes.skipped_email_no_account).toBe(1);
  });

  it('a confirmed guest whose address is suppressed is not emailed', async () => {
    process.env.JWT_SECRET = 'test-secret-not-real';
    const { suppressionService } = require('../services/suppressionService');
    (suppressionService.isSuppressed as jest.Mock).mockResolvedValueOnce(true);
    allSales = [sale([subscriber({ userId: null, user: null, email: 'supp@example.com', emailConfirmedAt: new Date() })])];
    await processReminderPass('DAY_BEFORE', DAY_NOON, {});
    expect(guestMail).toHaveLength(0);
  });

  it('an account with no email on file is not emailed (fail closed, never falls back to the row address)', async () => {
    allSales = [sale([subscriber({ email: 'typed@example.com', user: { email: null } })])];
    const outcomes: Record<string, number> = {};
    await processReminderPass('DAY_BEFORE', DAY_NOON, outcomes);
    expect(sends).toHaveLength(0);
    expect(outcomes.skipped_email_no_account).toBe(1);
  });

  it('a row that is not flagged for email (email null) gets no reminder email even though the account has an address', async () => {
    allSales = [sale([subscriber({ email: null, user: { email: 'owner@example.com' } })])];
    await processReminderPass('DAY_BEFORE', DAY_NOON, {});
    expect(sends).toHaveLength(0);
  });
});
