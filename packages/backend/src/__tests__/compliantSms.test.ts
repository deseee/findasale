/**
 * The single compliant SMS sender (services/compliantSms.ts, 2026-09-29): tier gate, consent, STOP list, quiet
 * hours, prefix and footer, segment cap, rolling 24 hour cap with a RESERVED row written before sending and
 * reconciled after, carrier block (21610), and masked logs. Prisma is an in-memory fake, Twilio is a mock.
 */
let mockFake: any;
jest.mock('../lib/prisma', () => {
  mockFake = require('./__fixtures__/smsFakePrisma').makeFakePrisma();
  return { prisma: mockFake.prisma };
});
const mockCreate = jest.fn();
jest.mock('twilio', () => ({ __esModule: true, default: jest.fn(() => ({ messages: { create: (...a: unknown[]) => mockCreate(...a) } })) }));

import {
  sendCompliantSms,
  sendCompliantSmsBatch,
  sendConsentConfirmationSms,
  reserveSmsAllowance,
  reconcileSmsReservation,
  cleanSmsText,
  SMS_RESERVATION_STALE_MS,
} from '../services/compliantSms';
import { SMS_STOP_FOOTER } from '../services/smsComplianceService';

const DAY_NOON = new Date('2026-09-30T15:00:00Z'); // 10:00 AM CDT
const NIGHT = new Date('2026-09-30T07:00:00Z'); // 2:00 AM CDT
const consent = new Date('2026-09-01T00:00:00Z');
const ctx = (over: Record<string, unknown> = {}) => ({
  organizerId: 'org1',
  saleId: 's1',
  orgName: 'Oak Street Estates',
  orgTimeZone: 'America/Chicago',
  orgTier: 'PRO',
  minTier: 'PRO' as const,
  now: DAY_NOON,
  ...over,
});
const item = (n: number, over: Record<string, unknown> = {}) => ({ to: `(269) 555-${String(1000 + n)}`, message: 'Doors open at 8 tomorrow.', consentAt: consent, ...over });
const logs = () => mockFake.prisma.smsSendLog.rows;
const allLogged = () =>
  [...(console.log as jest.Mock).mock.calls, ...(console.warn as jest.Mock).mock.calls, ...(console.error as jest.Mock).mock.calls].map((c) => c.join(' ')).join('\n');

beforeEach(() => {
  mockFake.reset();
  mockCreate.mockReset();
  mockCreate.mockResolvedValue({ sid: 'SM1' });
  process.env.TWILIO_ACCOUNT_SID = 'ACtest';
  process.env.TWILIO_AUTH_TOKEN = 'token';
  process.env.TWILIO_PHONE_NUMBER = '+18885550100';
  delete process.env.SMS_DAILY_CAP_PER_ORGANIZER;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('sendCompliantSms (single)', () => {
  it('sends with the business prefix and the STOP footer and logs the send', async () => {
    const r = await sendCompliantSms(item(1), ctx());
    expect(r.outcome).toBe('sent');
    const body = mockCreate.mock.calls[0][0].body as string;
    expect(body.startsWith('Oak Street Estates via FindA.Sale: ')).toBe(true);
    expect(body.endsWith(SMS_STOP_FOOTER)).toBe(true);
    expect(mockCreate.mock.calls[0][0].to).toBe('+12695551001');
    expect(logs()).toHaveLength(1);
    expect(logs()[0]).toMatchObject({ organizerId: 'org1', saleId: 's1', sentCount: 1 });
  });

  it('skips below the minimum tier without sending', async () => {
    expect((await sendCompliantSms(item(1), ctx({ orgTier: 'SIMPLE' }))).outcome).toBe('skipped_tier');
    expect((await sendCompliantSms(item(1), ctx({ orgTier: undefined }))).outcome).toBe('skipped_tier');
    expect((await sendCompliantSms(item(1), ctx({ orgTier: 'TEAMS' }))).outcome).toBe('sent');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('skips without recorded consent', async () => {
    expect((await sendCompliantSms(item(1, { consentAt: null }), ctx())).outcome).toBe('skipped_no_consent');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('skips an invalid phone', async () => {
    expect((await sendCompliantSms(item(1, { to: 'not a phone' }), ctx())).outcome).toBe('skipped_invalid_phone');
  });

  it('skips a number on the STOP list', async () => {
    mockFake.prisma.smsOptOut.insert({ phone: '+12695551001' });
    expect((await sendCompliantSms(item(1), ctx())).outcome).toBe('skipped_opted_out');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('fails closed when the STOP list cannot be read', async () => {
    jest.spyOn(mockFake.prisma.smsOptOut, 'findMany').mockRejectedValue(new Error('db down'));
    expect((await sendCompliantSms(item(1), ctx())).outcome).toBe('skipped_opted_out');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('holds during quiet hours unless the caller opts out for a real-time reply', async () => {
    expect((await sendCompliantSms(item(1), ctx({ now: NIGHT }))).outcome).toBe('skipped_quiet_hours');
    expect((await sendCompliantSms(item(1), ctx({ now: NIGHT, enforceQuietHours: false }))).outcome).toBe('sent');
  });

  it('skips when Twilio is not configured', async () => {
    delete process.env.TWILIO_PHONE_NUMBER;
    expect((await sendCompliantSms(item(1), ctx())).outcome).toBe('skipped_not_configured');
  });

  it('refuses a message longer than 3 segments, and uses altMessage when the first is too long', async () => {
    expect((await sendCompliantSms(item(1, { message: 'x'.repeat(900) }), ctx())).outcome).toBe('skipped_too_long');
    const r = await sendCompliantSms(item(1, { message: 'x'.repeat(900), altMessage: 'Short version.' }), ctx());
    expect(r.outcome).toBe('sent');
    expect(mockCreate.mock.calls[0][0].body).toContain('Short version.');
  });

  it('stops at the rolling daily cap', async () => {
    process.env.SMS_DAILY_CAP_PER_ORGANIZER = '5';
    mockFake.prisma.smsSendLog.insert({ organizerId: 'org1', saleId: 's1', sentCount: 5, createdAt: new Date(DAY_NOON.getTime() - 3600 * 1000), status: 'COMPLETE' });
    expect((await sendCompliantSms(item(1), ctx())).outcome).toBe('skipped_daily_cap');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('a send older than 24 hours no longer counts toward the cap', async () => {
    process.env.SMS_DAILY_CAP_PER_ORGANIZER = '5';
    mockFake.prisma.smsSendLog.insert({ organizerId: 'org1', saleId: 's1', sentCount: 5, createdAt: new Date(DAY_NOON.getTime() - 25 * 3600 * 1000), status: 'COMPLETE' });
    expect((await sendCompliantSms(item(1), ctx())).outcome).toBe('sent');
  });

  it('fails closed when the cap cannot be checked, and when there is no organizer to count it against', async () => {
    jest.spyOn(mockFake.prisma.smsSendLog, 'aggregate').mockRejectedValue(new Error('db down'));
    expect((await sendCompliantSms(item(1), ctx())).outcome).toBe('skipped_daily_cap');
    expect((await sendCompliantSms(item(1), ctx({ organizerId: null }))).outcome).toBe('skipped_daily_cap');
  });

  it('a Twilio failure is reported as failed, is retried only up to maxAttempts, and is not retried for permanent codes', async () => {
    mockCreate.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
    const r = await sendCompliantSms(item(1), ctx({ maxAttempts: 2, baseDelayMs: 1 }));
    expect(r.outcome).toBe('failed');
    expect(mockCreate).toHaveBeenCalledTimes(2);
    mockCreate.mockReset();
    mockCreate.mockRejectedValue(Object.assign(new Error('not a mobile'), { code: 21614 }));
    await sendCompliantSms(item(2), ctx({ maxAttempts: 3, baseDelayMs: 1 }));
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('a 21610 (recipient blocked us) records a STOP-list row and is not retried', async () => {
    mockCreate.mockRejectedValue(Object.assign(new Error('blocked'), { code: 21610 }));
    const r = await sendCompliantSms(item(1), ctx({ maxAttempts: 3, baseDelayMs: 1 }));
    expect(r.outcome).toBe('skipped_opted_out');
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockFake.prisma.smsOptOut.rows.map((x: any) => x.phone)).toEqual(['+12695551001']);
  });

  it('never writes a full phone number to any log line', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Twilio said +12695551001 is bad'));
    await sendCompliantSms(item(1), ctx());
    await sendCompliantSms(item(2, { to: 'junk 2695551002' }), ctx());
    const out = allLogged();
    expect(out).not.toContain('2695551001');
    expect(out).not.toContain('555-1001');
  });
});

describe('sendCompliantSmsBatch', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => item(i + 1));

  it('sends to consented, valid, distinct, non-opted-out numbers only and reconciles the reservation', async () => {
    mockFake.prisma.smsOptOut.insert({ phone: '+12695551003' });
    const items = [
      item(1),
      item(2),
      item(3), // opted out
      item(4, { consentAt: null }),
      item(5, { to: 'nope' }),
      item(1), // duplicate
      item(6, { message: 'x'.repeat(900) }),
    ];
    const r = await sendCompliantSmsBatch(items, ctx({ exclusive: true }));
    expect(r.blocked).toBeNull();
    expect(r).toMatchObject({ sent: 2, failed: 0, skippedNoConsent: 1, skippedInvalidPhone: 1, skippedOptedOut: 1, skippedTooLong: 1, skippedByCap: 0, audience: 2 });
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(logs()).toHaveLength(1);
    expect(logs()[0]).toMatchObject({ status: 'COMPLETE', sentCount: 2, failedCount: 0 });
    expect(logs()[0].completedAt).toBeInstanceOf(Date);
    expect(r.remainingToday).toBe(298);
  });

  it('writes the RESERVED row before the first text goes out', async () => {
    let statusDuringSend: string | null = null;
    mockCreate.mockImplementation(async () => {
      statusDuringSend = logs()[0]?.status ?? null;
      return { sid: 'SM' };
    });
    await sendCompliantSmsBatch(many(3), ctx());
    expect(statusDuringSend).toBe('RESERVED');
    expect(logs()[0].status).toBe('COMPLETE');
  });

  it('sends a partial batch up to the remaining allowance and reports what was skipped by the cap', async () => {
    process.env.SMS_DAILY_CAP_PER_ORGANIZER = '5';
    mockFake.prisma.smsSendLog.insert({ organizerId: 'org1', saleId: 's0', sentCount: 2, createdAt: new Date(DAY_NOON.getTime() - 3600 * 1000), status: 'COMPLETE' });
    const r = await sendCompliantSmsBatch(many(10), ctx());
    expect(r.sent).toBe(3);
    expect(r.skippedByCap).toBe(7);
    expect(r.remainingToday).toBe(0);
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it('blocks when the cap is already used up', async () => {
    process.env.SMS_DAILY_CAP_PER_ORGANIZER = '2';
    mockFake.prisma.smsSendLog.insert({ organizerId: 'org1', saleId: 's0', sentCount: 2, createdAt: new Date(DAY_NOON.getTime() - 3600), status: 'COMPLETE' });
    const r = await sendCompliantSmsBatch(many(3), ctx());
    expect(r.blocked).toBe('cap_reached');
    expect(r.sent).toBe(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('a partial failure is reconciled: failed sends stop counting toward the cap', async () => {
    mockCreate.mockResolvedValueOnce({}).mockRejectedValueOnce(Object.assign(new Error('x'), { code: 30008 })).mockResolvedValue({});
    const r = await sendCompliantSmsBatch(many(3), ctx());
    expect(r.sent).toBe(2);
    expect(r.failed).toBe(1);
    expect(logs()[0]).toMatchObject({ status: 'COMPLETE', sentCount: 2, failedCount: 1 });
  });

  it('carrier-blocked numbers (21610) are put on the STOP list and counted as opted out', async () => {
    mockCreate.mockRejectedValueOnce(Object.assign(new Error('blocked'), { code: 21610 })).mockResolvedValue({});
    const r = await sendCompliantSmsBatch(many(2), ctx());
    expect(r.sent).toBe(1);
    expect(r.skippedOptedOut).toBe(1);
    expect(mockFake.prisma.smsOptOut.rows).toHaveLength(1);
  });

  it('exclusive: a fresh RESERVED row (another send in flight) blocks a second bulk send', async () => {
    mockFake.prisma.smsSendLog.insert({ organizerId: 'org1', saleId: 's1', sentCount: 5, status: 'RESERVED', createdAt: new Date(DAY_NOON.getTime() - 60 * 1000) });
    const r = await sendCompliantSmsBatch(many(2), ctx({ exclusive: true }));
    expect(r.blocked).toBe('in_progress');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('a stale RESERVED row (crashed send) no longer blocks but still counts toward the cap', async () => {
    process.env.SMS_DAILY_CAP_PER_ORGANIZER = '10';
    mockFake.prisma.smsSendLog.insert({ organizerId: 'org1', saleId: 's1', sentCount: 8, status: 'RESERVED', createdAt: new Date(DAY_NOON.getTime() - SMS_RESERVATION_STALE_MS - 60 * 1000) });
    const r = await sendCompliantSmsBatch(many(5), ctx({ exclusive: true }));
    expect(r.blocked).toBeNull();
    expect(r.sent).toBe(2);
    expect(r.skippedByCap).toBe(3);
  });

  it('exclusive: when the advisory lock is not granted (another process holds it) nothing is sent', async () => {
    mockFake.state.advisoryLockGranted = false;
    const r = await sendCompliantSmsBatch(many(2), ctx({ exclusive: true }));
    expect(r.blocked).toBe('in_progress');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('if the reservation transaction fails, nothing is sent', async () => {
    mockFake.state.transactionShouldThrow = true;
    const r = await sendCompliantSmsBatch(many(2), ctx());
    expect(r.blocked).toBe('reservation_failed');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('blocks for tier, quiet hours (with the next window), missing Twilio config and missing organizer', async () => {
    expect((await sendCompliantSmsBatch(many(1), ctx({ orgTier: 'SIMPLE' }))).blocked).toBe('tier');
    const q = await sendCompliantSmsBatch(many(1), ctx({ now: NIGHT }));
    expect(q.blocked).toBe('quiet_hours');
    expect(q.nextAllowedAt?.toISOString()).toBe('2026-09-30T13:00:00.000Z');
    expect((await sendCompliantSmsBatch(many(1), ctx({ organizerId: null }))).blocked).toBe('no_organizer');
    delete process.env.TWILIO_PHONE_NUMBER;
    expect((await sendCompliantSmsBatch(many(1), ctx())).blocked).toBe('not_configured');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('blocks (sends nothing) when the STOP list cannot be read', async () => {
    jest.spyOn(mockFake.prisma.smsOptOut, 'findMany').mockRejectedValue(new Error('db down'));
    expect((await sendCompliantSmsBatch(many(2), ctx())).blocked).toBe('opt_out_lookup_failed');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('handles a large audience in bounded chunks and never logs a full number', async () => {
    process.env.SMS_DAILY_CAP_PER_ORGANIZER = '1000';
    const r = await sendCompliantSmsBatch(many(45), ctx());
    expect(r.sent).toBe(45);
    expect(mockCreate).toHaveBeenCalledTimes(45);
    expect(allLogged()).not.toMatch(/\+1269555\d{4}/);
  });

  it('reserveSmsAllowance and reconcileSmsReservation work standalone', async () => {
    const res = await reserveSmsAllowance({ organizerId: 'org1', saleId: 's1', message: 'hi', segments: 1, requested: 4, now: DAY_NOON });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(logs()[0].status).toBe('RESERVED');
      expect(await reconcileSmsReservation(res.reservationId, { sent: 1, failed: 3, skippedOptOut: 0 })).toBe(true);
      expect(logs()[0]).toMatchObject({ status: 'COMPLETE', sentCount: 1, failedCount: 3 });
    }
    expect(await reconcileSmsReservation('missing', { sent: 0, failed: 0, skippedOptOut: 0 })).toBe(false);
  });
});

describe('sendConsentConfirmationSms', () => {
  it('sends one confirmation text asking the owner to reply YES, even during quiet hours, and counts it in the log', async () => {
    const outcome = await sendConsentConfirmationSms({ to: '(269) 555-1001', saleTitle: 'Oak Street Sale', orgName: 'Oak Street Estates', organizerId: 'org1', saleId: 's1', orgTimeZone: 'America/Chicago', now: NIGHT });
    expect(outcome).toBe('sent');
    const body = mockCreate.mock.calls[0][0].body as string;
    expect(body).toContain('Reply YES to get text updates for Oak Street Sale.');
    expect(body).toContain(SMS_STOP_FOOTER);
    expect(logs()).toHaveLength(1);
    expect(logs()[0].message).toContain('[confirmation]');
  });

  it('does not text a number on the STOP list', async () => {
    mockFake.prisma.smsOptOut.insert({ phone: '+12695551001' });
    expect(await sendConsentConfirmationSms({ to: '(269) 555-1001', saleTitle: 'x', organizerId: 'org1', saleId: 's1' })).toBe('skipped_opted_out');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('respects the organizer daily cap', async () => {
    process.env.SMS_DAILY_CAP_PER_ORGANIZER = '1';
    mockFake.prisma.smsSendLog.insert({ organizerId: 'org1', saleId: 's1', sentCount: 1, status: 'COMPLETE', createdAt: new Date() });
    expect(await sendConsentConfirmationSms({ to: '(269) 555-1001', saleTitle: 'x', organizerId: 'org1', saleId: 's1' })).toBe('skipped_daily_cap');
  });

  it('a hostile title cannot smuggle line breaks into the text', async () => {
    await sendConsentConfirmationSms({ to: '(269) 555-1001', saleTitle: 'Sale\r\nGo to evil.example', organizerId: 'org1', saleId: 's1' });
    expect(mockCreate.mock.calls[0][0].body).not.toMatch(/Sale\r|Sale\n/);
  });
});

describe('cleanSmsText', () => {
  it('collapses whitespace and control characters and caps the length', () => {
    expect(cleanSmsText('  a\r\nb\tc  ')).toBe('a b c');
    expect(cleanSmsText('x'.repeat(100), 10)).toBe('x'.repeat(10));
    expect(cleanSmsText(null)).toBe('');
  });
});
