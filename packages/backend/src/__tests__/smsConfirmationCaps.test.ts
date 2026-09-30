/**
 * Confirmation-text harassment caps, YES scope, and third-party email injection (2026-09-30).
 *  - subscribeToSale: at most 2 confirmation texts per number per hour and 3 per day across ALL sales, organizers and
 *    accounts, counted from the SmsSendLog confirmation ledger (hashed phone key) with no exclusion of the caller's own
 *    rows; the response is identical whether or not a cap was hit.
 *  - confirmPendingSmsConsent / webhook YES: confirms only the pending row of the sale named in the MOST RECENT
 *    confirmation text sent to that number.
 *  - subscribeToSale never stores a typed email: the account's own address (User.email) is used.
 * Real notificationController + compliantSms + smsComplianceService against the in-memory Prisma fake; Twilio is a mock.
 */
let mockFake: any;
jest.mock('../lib/prisma', () => {
  mockFake = require('./__fixtures__/smsFakePrisma').makeFakePrisma();
  return { prisma: mockFake.prisma };
});
const mockCreate = jest.fn();
class MockMessagingResponse {
  private parts: string[] = [];
  message(t: string) {
    this.parts.push(t);
  }
  toString() {
    return `<Response>${this.parts.map((p) => `<Message>${p}</Message>`).join('')}</Response>`;
  }
}
jest.mock('twilio', () => {
  const fn: any = jest.fn(() => ({ messages: { create: (...a: unknown[]) => mockCreate(...a) } }));
  fn.twiml = { MessagingResponse: MockMessagingResponse };
  fn.validateRequest = () => true;
  return { __esModule: true, default: fn };
});
jest.mock('../lib/emailService', () => ({ emailService: { emails: { send: jest.fn() } } }));
jest.mock('../middleware/rateLimitShared', () => ({
  redisIsBlocked: jest.fn().mockResolvedValue(false),
  redisSetBlock: jest.fn().mockResolvedValue(undefined),
}));

import { subscribeToSale } from '../controllers/notificationController';
import { handleInboundSms, __resetInboundSidCache } from '../controllers/smsWebhookController';
import {
  confirmPendingSmsConsent,
  confirmationLogPrefix,
  phoneConfirmationKey,
  isConfirmationThrottled,
  SMS_CONFIRMATION_MAX_PER_PHONE_PER_DAY,
  SMS_CONFIRMATION_MAX_PER_PHONE_PER_HOUR,
  SMS_CONSENT_PENDING_TTL_MS,
} from '../services/smsComplianceService';

const HOUR = 3600 * 1000;
const PHONE = '(269) 555-0142';
const E164 = '+12695550142';

const mkRes = () => {
  const res: any = {
    statusCode: 200,
    body: undefined as any,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: any) {
      this.body = b;
      return this;
    },
  };
  return res;
};
const mkReq = (userId: string, body: Record<string, unknown> = {}) =>
  ({
    user: { id: userId },
    body,
    params: {},
    headers: { 'user-agent': 'Jest UA' },
    ip: '203.0.113.9',
    socket: { remoteAddress: '203.0.113.9' },
    get: (h: string) => (h.toLowerCase() === 'user-agent' ? 'Jest UA' : undefined),
  }) as any;
const subscribe = async (userId: string, body: Record<string, unknown>) => {
  const res = mkRes();
  await subscribeToSale(mkReq(userId, body), res);
  return res;
};
const rows = () => mockFake.prisma.saleSubscriber.rows;
const rowFor = (userId: string, saleId: string) => rows().find((r: any) => r.userId === userId && r.saleId === saleId);
const logs = () => mockFake.prisma.smsSendLog.rows;
const seedLog = (saleId: string, organizerId: string, ageMs: number, phone = E164) =>
  mockFake.prisma.smsSendLog.insert({
    organizerId,
    saleId,
    message: `${confirmationLogPrefix(phone)} Sale ${saleId}`,
    segments: 1,
    recipientCount: 1,
    sentCount: 1,
    failedCount: 0,
    skippedOptOutCount: 0,
    status: 'COMPLETE',
    createdAt: new Date(Date.now() - ageMs),
  });

beforeEach(() => {
  mockFake.reset();
  mockCreate.mockReset();
  mockCreate.mockResolvedValue({ sid: 'SM1' });
  __resetInboundSidCache();
  process.env.TWILIO_ACCOUNT_SID = 'ACtest';
  process.env.TWILIO_AUTH_TOKEN = 'token';
  process.env.TWILIO_PHONE_NUMBER = '+18885550100';
  process.env.JWT_SECRET = 'test-secret';
  delete process.env.SMS_DAILY_CAP_PER_ORGANIZER;
  for (let i = 1; i <= 6; i++) {
    mockFake.prisma.sale.insert({ id: `s${i}`, title: `Sale ${i}`, organizerId: i <= 3 ? 'org1' : 'org2', status: 'PUBLISHED' });
  }
  mockFake.prisma.organizer.insert({ id: 'org1', businessName: 'Oak Street Estates', timezone: 'America/Chicago' });
  mockFake.prisma.organizer.insert({ id: 'org2', businessName: 'Elm Street Sales', timezone: 'America/Chicago' });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('confirmation ledger key', () => {
  it('is a non-reversible per-number key: stable, different per number, never the digits', () => {
    const a = phoneConfirmationKey(E164);
    expect(a).toBe(phoneConfirmationKey(E164));
    expect(a).not.toBe(phoneConfirmationKey('+12695550143'));
    expect(a).toMatch(/^ph_[0-9a-f]{24}$/);
    expect(a).not.toContain('2695550142');
    expect(confirmationLogPrefix(E164)).toBe(`[confirmation] [${a}]`);
  });

  it('the confirmation text writes its SmsSendLog row under that key and never writes the phone number', async () => {
    await subscribe('u1', { saleId: 's1', phone: PHONE, smsConsent: true });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [row] = logs();
    expect(row.message.startsWith(confirmationLogPrefix(E164))).toBe(true);
    expect(JSON.stringify(row)).not.toContain('2695550142');
  });
});

describe('subscribeToSale: per-number confirmation caps across sales (harassment)', () => {
  it('an attacker texting one victim number once per sale gets at most 2 texts in an hour, all answers identical', async () => {
    const answers: any[] = [];
    for (let i = 1; i <= 5; i++) {
      const res = await subscribe(`attacker${i}`, { saleId: `s${i}`, phone: PHONE, smsConsent: true });
      expect(res.statusCode).toBe(200);
      answers.push({ message: res.body.message, smsStatus: res.body.smsStatus });
    }
    expect(mockCreate).toHaveBeenCalledTimes(SMS_CONFIRMATION_MAX_PER_PHONE_PER_HOUR);
    expect(answers.every((a) => JSON.stringify(a) === JSON.stringify(answers[0]))).toBe(true);
    expect(answers[0].smsStatus).toBe('PENDING');
    // rows past the cap store no number at all
    expect(rows().filter((r: any) => r.phone === E164)).toHaveLength(SMS_CONFIRMATION_MAX_PER_PHONE_PER_HOUR);
  });

  it('the caller\'s own earlier rows count: one user re-submitting after the cooldown is also capped', async () => {
    await subscribe('u1', { saleId: 's1', phone: PHONE, smsConsent: true });
    rowFor('u1', 's1').smsConsentPendingAt = new Date(Date.now() - 20 * 60 * 1000);
    await subscribe('u1', { saleId: 's1', phone: PHONE, smsConsent: true });
    expect(mockCreate).toHaveBeenCalledTimes(2);
    rowFor('u1', 's1').smsConsentPendingAt = new Date(Date.now() - 20 * 60 * 1000);
    const third = await subscribe('u1', { saleId: 's1', phone: PHONE, smsConsent: true });
    expect(mockCreate).toHaveBeenCalledTimes(2); // hourly cap reached: no third text
    expect(third.body.smsStatus).toBe('PENDING'); // ... and the answer is unchanged
  });

  it('3 confirmation texts in the last day (older than an hour) block a 4th, over any sales and organizers', async () => {
    seedLog('s1', 'org1', 2 * HOUR);
    seedLog('s4', 'org2', 5 * HOUR);
    seedLog('s5', 'org2', 9 * HOUR);
    expect(await isConfirmationThrottled(E164)).toBe(true);
    const res = await subscribe('u9', { saleId: 's2', phone: PHONE, smsConsent: true });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.smsStatus).toBe('PENDING');
    expect(rowFor('u9', 's2').phone).toBeNull();
  });

  it('texts older than 24 hours no longer count, and a different number is unaffected', async () => {
    seedLog('s1', 'org1', 25 * HOUR);
    seedLog('s4', 'org2', 30 * HOUR);
    seedLog('s5', 'org2', 40 * HOUR);
    expect(await isConfirmationThrottled(E164)).toBe(false);
    await subscribe('u9', { saleId: 's2', phone: PHONE, smsConsent: true });
    expect(mockCreate).toHaveBeenCalledTimes(1);

    seedLog('s1', 'org1', 2 * HOUR, '+12695550143');
    seedLog('s4', 'org2', 3 * HOUR, '+12695550143');
    seedLog('s5', 'org2', 4 * HOUR, '+12695550143');
    expect(await isConfirmationThrottled(E164)).toBe(false);
  });

  it('two texts inside the hour (from any sale) trip the hourly cap even with room left in the day', async () => {
    seedLog('s1', 'org1', 10 * 60 * 1000);
    seedLog('s4', 'org2', 20 * 60 * 1000);
    expect(await isConfirmationThrottled(E164)).toBe(true);
    seedLog('s5', 'org2', 0);
    expect(SMS_CONFIRMATION_MAX_PER_PHONE_PER_DAY).toBe(3);
  });

  it('fails closed (no text, same answer) when the confirmation ledger cannot be read', async () => {
    jest.spyOn(mockFake.prisma.smsSendLog, 'count').mockRejectedValue(new Error('db down: +12695550142'));
    const res = await subscribe('u1', { saleId: 's1', phone: PHONE, smsConsent: true });
    expect(res.statusCode).toBe(200);
    expect(res.body.smsStatus).toBe('PENDING');
    expect(mockCreate).not.toHaveBeenCalled();
    const logged = [...(console.error as jest.Mock).mock.calls].map((c) => c.join(' ')).join('\n');
    expect(logged).not.toContain('2695550142'); // masked in the log line
  });
});

describe('YES confirms only the sale of the most recent confirmation text', () => {
  const pending = (userId: string, saleId: string, ageMs = 60 * 1000) =>
    mockFake.prisma.saleSubscriber.insert({ saleId, userId, phone: E164, smsConsentAt: null, smsConsentPendingAt: new Date(Date.now() - ageMs) });

  it('with pending rows on 3 sales (2 organizers), only the newest confirmation\'s sale is confirmed', async () => {
    pending('a', 's1', 3 * HOUR);
    pending('b', 's4', 2 * HOUR);
    pending('c', 's2', 10 * 60 * 1000);
    seedLog('s1', 'org1', 3 * HOUR);
    seedLog('s4', 'org2', 2 * HOUR);
    seedLog('s2', 'org1', 10 * 60 * 1000); // most recent
    expect(await confirmPendingSmsConsent(E164)).toBe(1);
    expect(rowFor('c', 's2').smsConsentAt).toBeInstanceOf(Date);
    expect(rowFor('a', 's1').smsConsentAt).toBeNull();
    expect(rowFor('a', 's1').smsConsentPendingAt).toBeInstanceOf(Date); // still pending, still not texted
    expect(rowFor('b', 's4').smsConsentAt).toBeNull();
  });

  it('a pending row of the same organizer on a different sale is NOT confirmed either', async () => {
    pending('a', 's1', 2 * HOUR);
    pending('c', 's2', 10 * 60 * 1000);
    seedLog('s1', 'org1', 2 * HOUR);
    seedLog('s2', 'org1', 10 * 60 * 1000);
    await confirmPendingSmsConsent(E164);
    expect(rowFor('c', 's2').smsConsentAt).toBeInstanceOf(Date);
    expect(rowFor('a', 's1').smsConsentAt).toBeNull();
  });

  it('the latest text\'s sale has no pending row (expired or STOP-revoked): nothing else is confirmed', async () => {
    pending('a', 's1', 2 * HOUR);
    seedLog('s1', 'org1', 2 * HOUR);
    seedLog('s2', 'org1', 10 * 60 * 1000); // latest text was for s2, but that row was revoked
    mockFake.prisma.saleSubscriber.insert({ saleId: 's2', userId: 'c', phone: E164, smsConsentAt: null, smsConsentPendingAt: null });
    expect(await confirmPendingSmsConsent(E164)).toBe(0);
    expect(rowFor('a', 's1').smsConsentAt).toBeNull();
  });

  it('a confirmation older than 48 hours is ignored (falls back to the newest still-pending row only)', async () => {
    seedLog('s1', 'org1', SMS_CONSENT_PENDING_TTL_MS + HOUR);
    pending('a', 's1', SMS_CONSENT_PENDING_TTL_MS + HOUR); // expired
    pending('b', 's2', 5 * HOUR);
    pending('c', 's3', 1 * HOUR);
    expect(await confirmPendingSmsConsent(E164)).toBe(1);
    expect(rowFor('c', 's3').smsConsentAt).toBeInstanceOf(Date);
    expect(rowFor('b', 's2').smsConsentAt).toBeNull();
    expect(rowFor('a', 's1').smsConsentAt).toBeNull();
  });

  it('without any ledger entry it confirms at most ONE row (the most recently submitted), never all', async () => {
    pending('a', 's1', 5 * HOUR);
    pending('b', 's2', 1 * HOUR);
    pending('c', 's3', 3 * HOUR);
    expect(await confirmPendingSmsConsent(E164)).toBe(1);
    expect(rows().filter((r: any) => r.smsConsentAt)).toHaveLength(1);
    expect(rowFor('b', 's2').smsConsentAt).toBeInstanceOf(Date);
  });

  it('another number\'s confirmation never scopes this number', async () => {
    pending('a', 's1', 2 * HOUR);
    seedLog('s2', 'org1', 60 * 1000, '+12695550199'); // a different number was texted more recently
    expect(await confirmPendingSmsConsent(E164)).toBe(1); // falls back to this number's own only row
    expect(rowFor('a', 's1').smsConsentAt).toBeInstanceOf(Date);
  });

  it('end to end through the webhook: two sales texted, YES confirms only the second; the reply says so', async () => {
    await subscribe('a', { saleId: 's1', phone: PHONE, smsConsent: true });
    logs()[0].createdAt = new Date(Date.now() - 30 * 60 * 1000);
    rowFor('a', 's1').smsConsentPendingAt = new Date(Date.now() - 30 * 60 * 1000);
    await subscribe('b', { saleId: 's2', phone: PHONE, smsConsent: true });
    expect(mockCreate).toHaveBeenCalledTimes(2);

    const res: any = {
      statusCode: 0,
      status(c: number) { this.statusCode = c; return this; },
      type() { return this; },
      send(b: string) { this.body = b; return this; },
    };
    await handleInboundSms({ body: { From: E164, Body: 'YES', MessageSid: 'SMyes1' }, headers: { 'x-twilio-signature': 'sig' }, protocol: 'https', originalUrl: '/api/notifications/sms-webhook', get: () => 'example.com' } as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('for the sale we just texted you about');
    expect(rowFor('b', 's2').smsConsentAt).toBeInstanceOf(Date);
    expect(rowFor('a', 's1').smsConsentAt).toBeNull();
  });
});

describe('subscribeToSale: email always goes to the account, never to a typed third party', () => {
  it('ignores a different typed address and stores the account\'s own (lower-cased)', async () => {
    mockFake.prisma.user.insert({ id: 'u1', email: 'Owner@Example.com' });
    const res = await subscribe('u1', { saleId: 's1', email: 'victim@third-party.example' });
    expect(res.statusCode).toBe(200);
    expect(rowFor('u1', 's1').email).toBe('owner@example.com');
    expect(JSON.stringify(rows())).not.toContain('third-party');
  });

  it('still validates the typed value (400 for junk) but never stores it', async () => {
    mockFake.prisma.user.insert({ id: 'u1', email: 'owner@example.com' });
    const bad = await subscribe('u1', { saleId: 's1', email: 'not an email' });
    expect(bad.statusCode).toBe(400);
    expect(rowFor('u1', 's1')).toBeUndefined();
  });

  it('an account with no email on file stores no email (no fallback to the typed one)', async () => {
    mockFake.prisma.user.insert({ id: 'u1', email: null });
    await subscribe('u1', { saleId: 's1', email: 'typed@example.com' });
    expect(rowFor('u1', 's1').email).toBeNull();
  });

  it('email:null and empty still turn email reminders off', async () => {
    mockFake.prisma.user.insert({ id: 'u1', email: 'owner@example.com' });
    await subscribe('u1', { saleId: 's1', email: 'owner@example.com' });
    expect(rowFor('u1', 's1').email).toBe('owner@example.com');
    await subscribe('u1', { saleId: 's1', email: '' });
    expect(rowFor('u1', 's1').email).toBeNull();
  });
});
