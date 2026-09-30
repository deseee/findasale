/**
 * SMS compliance building blocks (2026-09-29): phone normalization, STOP/START/HELP keyword classification,
 * DST-correct quiet hours, stored keyword sanitizing, consent revoke/confirm, and the inbound webhook flow.
 * Prisma is an in-memory fake (fixtures/smsFakePrisma.ts) and Twilio is a mock. No network, no real text.
 */
let mockFake: any;
jest.mock('../lib/prisma', () => {
  mockFake = require('./__fixtures__/smsFakePrisma').makeFakePrisma();
  return { prisma: mockFake.prisma };
});
jest.mock('express', () => ({}), { virtual: true });
class MockMessagingResponse {
  private parts: string[] = [];
  message(t: string) {
    this.parts.push(t);
  }
  toString() {
    return `<Response>${this.parts.map((p) => `<Message>${p}</Message>`).join('')}</Response>`;
  }
}
const mockValidateRequest = jest.fn();
jest.mock('twilio', () => {
  const fn: any = jest.fn(() => ({}));
  fn.twiml = { MessagingResponse: MockMessagingResponse };
  fn.validateRequest = (...a: unknown[]) => mockValidateRequest(...a);
  return { __esModule: true, default: fn };
});

import {
  normalizePhoneE164,
  phoneStorageVariants,
  classifyInboundKeyword,
  checkQuietHours,
  sanitizeOptOutKeyword,
  recordSmsOptOut,
  clearSmsOptOut,
  confirmPendingSmsConsent,
  revokeSmsConsentForPhone,
  isPendingConsentActive,
  loadSmsAudience,
  composeSmsBody,
  estimateSmsSegments,
  SMS_CONSENT_PENDING_TTL_MS,
  SMS_STOP_FOOTER,
} from '../services/smsComplianceService';
import { handleInboundSms, SMS_CONSENT_CONFIRMED_REPLY } from '../controllers/smsWebhookController';

const HOUR = 3600 * 1000;

beforeEach(() => {
  mockFake.reset();
  mockValidateRequest.mockReset();
  mockValidateRequest.mockReturnValue(true);
  process.env.TWILIO_AUTH_TOKEN = 'token';
  process.env.NODE_ENV = 'test';
  delete process.env.SMS_ALLOWED_COUNTRY_CODES;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('normalizePhoneE164', () => {
  it.each([
    ['(269) 555-0142', '+12695550142'],
    ['269-555-0142', '+12695550142'],
    ['269.555.0142', '+12695550142'],
    ['1 269 555 0142', '+12695550142'],
    ['+1 (269) 555-0142', '+12695550142'],
    ['  2695550142  ', '+12695550142'],
  ])('accepts %s', (raw, out) => expect(normalizePhoneE164(raw)).toBe(out));

  it.each([
    ['tel:+12695550142'],
    ['269-555-0142 ext 5'],
    ['269-555-0142abc'],
    ['(269) 555-014'],
    ['+0 269 555 0142'],
    ['211'],
    ['+1 911 555 0142'],
    ['+1 269 911 0142'],
    ['+12695550142 and more'],
    ['+44 20 7946 0958'], // outside the default allowlist (+1 only)
    [''],
    ['x'.repeat(50)],
  ])('rejects %s', (raw) => expect(normalizePhoneE164(raw)).toBeNull());

  it('rejects non-strings', () => {
    expect(normalizePhoneE164(null)).toBeNull();
    expect(normalizePhoneE164(2695550142)).toBeNull();
    expect(normalizePhoneE164({})).toBeNull();
  });

  it('allows another country only when configured', () => {
    process.env.SMS_ALLOWED_COUNTRY_CODES = '1,44';
    expect(normalizePhoneE164('+44 20 7946 0958')).toBe('+442079460958');
  });

  it('applies the NANP rules to +1 exactly like unprefixed numbers', () => {
    expect(normalizePhoneE164('+1 069 555 0142')).toBeNull();
    expect(normalizePhoneE164('069 555 0142')).toBeNull();
  });

  it('phoneStorageVariants covers the ways older code stored the same number', () => {
    const v = phoneStorageVariants('+12695550142');
    expect(v).toEqual(expect.arrayContaining(['+12695550142', '12695550142', '2695550142', '(269) 555-0142', '269-555-0142']));
  });
});

describe('classifyInboundKeyword', () => {
  it.each([
    'STOP', 'stop', 'Stop.', ' STOP ', 'STOPALL', 'STOP ALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPT OUT', 'OPTOUT',
    'REVOKE', 'remove me', 'please stop texting me', 'stop texting me', 'stop sending me these', 'ｓｔｏｐ', 'Unsubscribe me please',
    'cancel', 'quit',
  ])('%s is a STOP', (b) => expect(classifyInboundKeyword(b)).toBe('STOP'));

  it.each(['START', 'start', 'YES', 'yes', 'UNSTOP', 'Yes.', 'yes!'])('%s is a START', (b) => expect(classifyInboundKeyword(b)).toBe('START'));

  it.each(['HELP', 'help', 'INFO', 'Help?'])('%s is HELP', (b) => expect(classifyInboundKeyword(b)).toBe('HELP'));

  it.each([
    'see you at the sale, stop by around noon',
    'the bus stop is on Oak Street',
    "don't stop",
    'keep them coming',
    'what time does it open',
    'yes I will be there Saturday with my truck', // START/HELP only as the whole message
    'help me find the sale',
    '',
  ])('%j is not a keyword', (b) => expect(classifyInboundKeyword(b)).toBeNull());

  it('Twilio OptOutType STOP wins over a harmless body', () => {
    expect(classifyInboundKeyword('thanks', 'STOP')).toBe('STOP');
  });

  it('non-string bodies do not throw', () => {
    expect(classifyInboundKeyword(undefined)).toBeNull();
    expect(classifyInboundKeyword(42 as any)).toBeNull();
  });
});

describe('quiet hours (8:00 AM to 9:00 PM organizer local time, DST correct)', () => {
  it('allows inside the window and blocks outside it', () => {
    expect(checkQuietHours(new Date('2026-09-30T15:00:00Z'), 'America/Chicago').allowed).toBe(true); // 10:00 CDT
    const night = checkQuietHours(new Date('2026-09-30T07:00:00Z'), 'America/Chicago'); // 2:00 CDT
    expect(night.allowed).toBe(false);
    expect(night.nextAllowedAt?.toISOString()).toBe('2026-09-30T13:00:00.000Z'); // 8:00 CDT
  });

  it('9:00 PM local is already quiet, 8:00 AM local is open', () => {
    expect(checkQuietHours(new Date('2026-10-01T02:00:00Z'), 'America/Chicago').allowed).toBe(false); // 21:00 CDT
    expect(checkQuietHours(new Date('2026-10-01T01:59:00Z'), 'America/Chicago').allowed).toBe(true); // 20:59 CDT
    expect(checkQuietHours(new Date('2026-09-30T13:00:00Z'), 'America/Chicago').allowed).toBe(true); // 08:00 CDT
  });

  it('next window across the fall-back change (Nov 1 2026 in Chicago) is 8:00 AM CST, not a fixed 24h later', () => {
    // 2026-11-01 07:30Z is 1:30 AM CST (after the fall back) : next 8:00 AM CST is 14:00Z
    const r = checkQuietHours(new Date('2026-11-01T07:30:00Z'), 'America/Chicago');
    expect(r.allowed).toBe(false);
    expect(r.nextAllowedAt?.toISOString()).toBe('2026-11-01T14:00:00.000Z');
  });

  it('next window across the spring-forward change (Mar 8 2026 in Chicago) is 8:00 AM CDT', () => {
    const r = checkQuietHours(new Date('2026-03-08T06:30:00Z'), 'America/Chicago'); // 12:30 AM CST
    expect(r.allowed).toBe(false);
    expect(r.nextAllowedAt?.toISOString()).toBe('2026-03-08T13:00:00.000Z'); // 8:00 CDT (UTC-5)
  });

  it('after 9 PM the next window is the following morning', () => {
    const r = checkQuietHours(new Date('2026-10-01T03:30:00Z'), 'America/Chicago'); // 22:30 CDT Sep 30
    expect(r.nextAllowedAt?.toISOString()).toBe('2026-10-01T13:00:00.000Z');
  });

  it('honours other zones', () => {
    expect(checkQuietHours(new Date('2026-09-30T15:00:00Z'), 'America/Los_Angeles').allowed).toBe(true); // 08:00 PDT
    expect(checkQuietHours(new Date('2026-09-30T14:59:00Z'), 'America/Los_Angeles').allowed).toBe(false); // 07:59 PDT
  });
});

describe('stored keyword sanitizing (P1-5)', () => {
  it('caps at 20 characters, upper-cases, strips control and non-ASCII characters', () => {
    expect(sanitizeOptOutKeyword('  stop   all\r\n')).toBe('STOP ALL');
    expect(sanitizeOptOutKeyword('x'.repeat(200))).toBe('X'.repeat(20));
    expect(sanitizeOptOutKeyword('<script>alert(1)</script> stop')!.length).toBeLessThanOrEqual(20);
    expect(sanitizeOptOutKeyword('\u0007​')).toBeNull();
    expect(sanitizeOptOutKeyword(null)).toBeNull();
  });

  it('recordSmsOptOut stores only the sanitized keyword', async () => {
    await recordSmsOptOut('+12695550142', 'please stop texting me right now, this is the third time i have asked', 'STOP_REPLY');
    const row = mockFake.prisma.smsOptOut.rows[0];
    expect(row.phone).toBe('+12695550142');
    expect(row.lastKeyword.length).toBeLessThanOrEqual(20);
    expect(row.lastKeyword).toBe(row.lastKeyword.toUpperCase());
  });
});

describe('consent lifecycle (double opt-in)', () => {
  const seed = (over: Record<string, unknown> = {}) =>
    mockFake.prisma.saleSubscriber.insert({ saleId: 's1', userId: 'u1', phone: '+12695550142', smsConsentAt: null, smsConsentPendingAt: null, ...over });

  it('confirms only fresh pending rows', async () => {
    const now = new Date('2026-09-29T12:00:00Z');
    const fresh = seed({ userId: 'u1', smsConsentPendingAt: new Date(now.getTime() - HOUR) });
    const stale = seed({ userId: 'u2', saleId: 's2', smsConsentPendingAt: new Date(now.getTime() - SMS_CONSENT_PENDING_TTL_MS - HOUR) });
    const never = seed({ userId: 'u3', saleId: 's3' });
    expect(await confirmPendingSmsConsent('+12695550142', now)).toBe(1);
    const rows = mockFake.prisma.saleSubscriber.rows;
    expect(rows.find((r: any) => r.id === fresh.id).smsConsentAt).toEqual(now);
    expect(rows.find((r: any) => r.id === fresh.id).smsConsentPendingAt).toBeNull();
    expect(rows.find((r: any) => r.id === stale.id).smsConsentAt).toBeNull();
    expect(rows.find((r: any) => r.id === never.id).smsConsentAt).toBeNull();
  });

  it('never confirms a different number', async () => {
    seed({ smsConsentPendingAt: new Date() });
    expect(await confirmPendingSmsConsent('+12695550199')).toBe(0);
  });

  it('finds rows stored in an older phone format', async () => {
    seed({ phone: '(269) 555-0142', smsConsentPendingAt: new Date() });
    expect(await confirmPendingSmsConsent('+12695550142')).toBe(1);
  });

  it('STOP nulls both consent and pending on every row of the number', async () => {
    seed({ smsConsentAt: new Date() });
    seed({ userId: 'u2', saleId: 's2', smsConsentPendingAt: new Date() });
    expect(await revokeSmsConsentForPhone('+12695550142')).toBe(2);
    for (const r of mockFake.prisma.saleSubscriber.rows) {
      expect(r.smsConsentAt).toBeNull();
      expect(r.smsConsentPendingAt).toBeNull();
    }
  });

  it('isPendingConsentActive follows the 48 hour window', () => {
    const now = new Date('2026-09-29T12:00:00Z');
    expect(isPendingConsentActive(new Date(now.getTime() - 47 * HOUR), now)).toBe(true);
    expect(isPendingConsentActive(new Date(now.getTime() - 49 * HOUR), now)).toBe(false);
    expect(isPendingConsentActive(null, now)).toBe(false);
  });

  it('loadSmsAudience only returns confirmed, non-opted-out numbers and counts pending ones separately', async () => {
    seed({ userId: 'a', phone: '+12695550101', smsConsentAt: new Date() });
    seed({ userId: 'b', phone: '+12695550102', smsConsentAt: new Date() });
    seed({ userId: 'c', phone: '+12695550103', smsConsentPendingAt: new Date() });
    await recordSmsOptOut('+12695550102', 'STOP', 'STOP_REPLY'); // also revokes consent for that number
    const audience = await loadSmsAudience('s1');
    expect(audience.eligible).toEqual(['+12695550101']);
    expect(audience.pendingConfirmation).toBe(1);
  });
});

describe('framing helpers', () => {
  it('composeSmsBody adds the business prefix and the STOP footer', () => {
    const body = composeSmsBody('Oak Street Estates', 'Doors open at 8 tomorrow.');
    expect(body.startsWith('Oak Street Estates via FindA.Sale: ')).toBe(true);
    expect(body.endsWith(SMS_STOP_FOOTER)).toBe(true);
  });

  it('a long message is more than 3 segments (callers refuse it)', () => {
    expect(estimateSmsSegments(composeSmsBody('Oak Street Estates', 'x'.repeat(700))).segments).toBeGreaterThan(3);
  });
});

describe('inbound webhook flow', () => {
  const call = async (body: Record<string, unknown>) => {
    const res: any = {
      statusCode: 0,
      headers: {} as Record<string, string>,
      status(c: number) {
        this.statusCode = c;
        return this;
      },
      type(t: string) {
        this.headers.type = t;
        return this;
      },
      send(b: string) {
        this.body = b;
        return this;
      },
    };
    await handleInboundSms({ body, headers: { 'x-twilio-signature': 'sig' }, protocol: 'https', originalUrl: '/api/notifications/sms-webhook', get: () => 'example.com' } as any, res);
    return res;
  };
  const seed = (over: Record<string, unknown> = {}) =>
    mockFake.prisma.saleSubscriber.insert({ saleId: 's1', userId: 'u1', phone: '+12695550142', smsConsentAt: null, smsConsentPendingAt: null, ...over });

  it('rejects an invalid Twilio signature and changes nothing', async () => {
    mockValidateRequest.mockReturnValue(false);
    seed({ smsConsentPendingAt: new Date() });
    const res = await call({ From: '+12695550142', Body: 'YES' });
    expect(res.statusCode).toBe(401);
    expect(mockFake.prisma.saleSubscriber.rows[0].smsConsentAt).toBeNull();
  });

  it('YES confirms a pending opt-in and replies once with the confirmation text', async () => {
    seed({ smsConsentPendingAt: new Date() });
    const res = await call({ From: '+12695550142', Body: 'YES' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain(SMS_CONSENT_CONFIRMED_REPLY);
    expect(mockFake.prisma.saleSubscriber.rows[0].smsConsentAt).toBeInstanceOf(Date);
  });

  it('YES from a number with nothing pending confirms nothing and sends no reply (no oracle)', async () => {
    seed();
    const res = await call({ From: '+12695550142', Body: 'YES' });
    expect(res.body).toBe('<Response></Response>');
    expect(mockFake.prisma.saleSubscriber.rows[0].smsConsentAt).toBeNull();
  });

  it('YES from a different number cannot confirm someone else\'s pending row', async () => {
    seed({ smsConsentPendingAt: new Date() });
    await call({ From: '+12695550199', Body: 'YES' });
    expect(mockFake.prisma.saleSubscriber.rows[0].smsConsentAt).toBeNull();
    expect(mockFake.prisma.saleSubscriber.rows[0].smsConsentPendingAt).toBeInstanceOf(Date);
  });

  it('an expired pending row is not confirmed by YES', async () => {
    seed({ smsConsentPendingAt: new Date(Date.now() - SMS_CONSENT_PENDING_TTL_MS - HOUR) });
    const res = await call({ From: '+12695550142', Body: 'YES' });
    expect(res.body).toBe('<Response></Response>');
    expect(mockFake.prisma.saleSubscriber.rows[0].smsConsentAt).toBeNull();
  });

  it('STOP opts out, revokes consent everywhere, and replies with an empty document', async () => {
    seed({ smsConsentAt: new Date() });
    seed({ userId: 'u2', saleId: 's2', smsConsentPendingAt: new Date() });
    const res = await call({ From: '+12695550142', Body: 'STOP' });
    expect(res.body).toBe('<Response></Response>');
    expect(mockFake.prisma.smsOptOut.rows).toHaveLength(1);
    for (const r of mockFake.prisma.saleSubscriber.rows) {
      expect(r.smsConsentAt).toBeNull();
      expect(r.smsConsentPendingAt).toBeNull();
    }
  });

  it('STOP then YES does not revive consent: the person must opt in again', async () => {
    seed({ smsConsentAt: new Date() });
    await call({ From: '+12695550142', Body: 'STOP' });
    const res = await call({ From: '+12695550142', Body: 'YES' });
    expect(res.body).toBe('<Response></Response>');
    expect(mockFake.prisma.saleSubscriber.rows[0].smsConsentAt).toBeNull();
    expect(mockFake.prisma.smsOptOut.rows).toHaveLength(0); // the suppression is cleared by the explicit START
  });

  it('a natural-language stop request is honored', async () => {
    seed({ smsConsentAt: new Date() });
    await call({ From: '+12695550142', Body: 'please stop texting me' });
    expect(mockFake.prisma.smsOptOut.rows).toHaveLength(1);
  });

  it('a chatty non-keyword message is logged masked and does not change consent', async () => {
    seed({ smsConsentAt: new Date() });
    const res = await call({ From: '+12695550142', Body: 'see you around noon? I will bring a truck' });
    expect(res.body).toBe('<Response></Response>');
    expect(mockFake.prisma.smsOptOut.rows).toHaveLength(0);
    const logged = (console.info as jest.Mock).mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).not.toContain('2695550142');
  });

  it('HELP replies with program info', async () => {
    const res = await call({ From: '+12695550142', Body: 'HELP' });
    expect(res.body).toMatch(/STOP/);
  });

  it('an unusable From number is ignored with a 200', async () => {
    const res = await call({ From: 'junk', Body: 'STOP' });
    expect(res.statusCode).toBe(200);
    expect(mockFake.prisma.smsOptOut.rows).toHaveLength(0);
  });

  it('clearSmsOptOut removes the suppression row', async () => {
    await recordSmsOptOut('+12695550142', 'STOP', 'STOP_REPLY');
    await clearSmsOptOut('+12695550142');
    expect(mockFake.prisma.smsOptOut.rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// 2026-09-30 review fixes
// ---------------------------------------------------------------------------------------------------------------------
import { isAllowedNanpAreaCode, US_AREA_CODES, CA_AREA_CODES } from '../services/smsComplianceService';
import { safeErrorForLog, redactEmailsInText } from '../utils/logMask';

describe('classifyInboundKeyword: an exact carrier keyword as the FIRST word always opts out', () => {
  it.each([
    'stop, thanks a lot',
    'STOP thanks a lot',
    'Stop. Thanks!',
    'stop - thank you so much for everything',
    "STOP, don't keep texting me",
    'Stop, I want to keep my number private',
    "stop!! I can't stop getting these",
    'stop, i never asked for these and it is not okay',
    'STOP\nthanks',
    'stop,thanks',
    'STOPALL thanks',
    'stopall, please',
    'Unsubscribe, thanks',
    'UNSUBSCRIBE! now',
    'cancel, thanks a lot',
    'CANCEL my subscription to everything that you have ever sent me',
    'end, thanks',
    'End. of. story. I do not want these anymore ok',
    'quit, thanks',
    'QUIT texting',
    '  Stop  ',
    'ＳＴＯＰ, thanks', // fullwidth
    'stop by mistake? no, stop please', // conservative: first word wins
  ])('%j is a STOP', (b) => expect(classifyInboundKeyword(b)).toBe('STOP'));

  it.each(['please stop texting me', 'Please STOP', 'pls stop', 'can you stop texting me please', 'i want to unsubscribe', 'do not text me again', 'opt out please', 'remove me'])(
    'still a STOP: %j',
    (b) => expect(classifyInboundKeyword(b)).toBe('STOP')
  );

  it.each(['START', 'yes', 'HELP', 'info'])('the rest of the keyword handling is unchanged: %s', (b) => {
    expect(classifyInboundKeyword(b)).toBe(b.toLowerCase() === 'help' || b.toLowerCase() === 'info' ? 'HELP' : 'START');
  });

  it.each([
    'see you at the sale, stop by around noon',
    'the bus stop is on Oak Street',
    "don't stop",
    'we cannot stop by until noon',
    'keep them coming',
    'what time does it open',
    'thanks a lot, see you there',
    'yes I will be there Saturday with my truck',
  ])('a message that does not start with a carrier keyword and means something else is not a STOP: %j', (b) => expect(classifyInboundKeyword(b)).toBeNull());

  it('the webhook honors "stop, thanks a lot" (opt-out recorded, consent revoked)', async () => {
    mockFake.prisma.saleSubscriber.insert({ saleId: 's1', userId: 'u1', phone: '+12695550142', smsConsentAt: new Date(), smsConsentPendingAt: null });
    const res: any = { statusCode: 0, status(c: number) { this.statusCode = c; return this; }, type() { return this; }, send(b: string) { this.body = b; return this; } };
    await handleInboundSms({ body: { From: '+12695550142', Body: "STOP, don't keep texting me" }, headers: { 'x-twilio-signature': 'sig' }, protocol: 'https', originalUrl: '/api/notifications/sms-webhook', get: () => 'example.com' } as any, res);
    expect(mockFake.prisma.smsOptOut.rows).toHaveLength(1);
    expect(mockFake.prisma.saleSubscriber.rows[0].smsConsentAt).toBeNull();
  });
});

describe('normalizePhoneE164: United States and Canada only (explicit area-code allowlist)', () => {
  it.each([
    ['+1 269 555 0142', '+12695550142'], // Michigan
    ['(212) 555-0123', '+12125550123'], // New York
    ['310-555-0100', '+13105550100'], // California
    ['+1 416 555 0199', '+14165550199'], // Toronto
    ['604.555.0177', '+16045550177'], // Vancouver
    ['+1 514 555 0111', '+15145550111'], // Montreal
    ['+1 907 555 0100', '+19075550100'], // Alaska
    ['+1 808 555 0100', '+18085550100'], // Hawaii
    ['+1 202 555 0100', '+12025550100'], // DC
  ])('accepts %s', (raw, out) => expect(normalizePhoneE164(raw)).toBe(out));

  it.each([
    // Caribbean nations sharing +1
    '+1 242 555 0100', '+1 246 555 0100', '+1 264 555 0100', '+1 268 555 0100', '+1 284 555 0100', '+1 345 555 0100',
    '+1 441 555 0100', '+1 473 555 0100', '+1 649 555 0100', '+1 664 555 0100', '+1 721 555 0100', '+1 758 555 0100',
    '+1 767 555 0100', '+1 784 555 0100', '+1 809 555 0100', '+1 829 555 0100', '+1 849 555 0100', '+1 868 555 0100',
    '+1 869 555 0100', '+1 876 555 0100',
    // US territories: decision is US states + DC and Canada only
    '+1 787 555 0100', '+1 939 555 0100', '+1 340 555 0100', '+1 671 555 0100', '+1 684 555 0100', '+1 670 555 0100',
    // premium / pay-per-call / toll free / personal numbers
    '+1 900 555 0100', '900-555-0100', '(976) 555-0100', '976 555 0100', '+1 800 555 0100', '888-555-0100', '+1 500 555 0100', '+1 700 555 0100',
    // N9X-style codes that are not assigned
    '+1 299 555 0100', '+1 399 555 0100', '+1 999 555 0100', '+1 899 555 0100',
  ])('rejects %s', (raw) => expect(normalizePhoneE164(raw)).toBeNull());

  it('N9X codes that ARE assigned US/Canadian areas stay allowed (989 Michigan, 519 Ontario, 909 California)', () => {
    expect(normalizePhoneE164('+1 989 555 0100')).toBe('+19895550100');
    expect(normalizePhoneE164('+1 519 555 0100')).toBe('+15195550100');
    expect(normalizePhoneE164('909-555-0100')).toBe('+19095550100');
  });

  it('the allowlist has the shape of the real assignments and no overlap between countries', () => {
    expect(US_AREA_CODES.size).toBeGreaterThan(300);
    expect(CA_AREA_CODES.size).toBeGreaterThan(40);
    for (const c of [...US_AREA_CODES, ...CA_AREA_CODES]) expect(c).toMatch(/^[2-9]\d{2}$/);
    for (const c of CA_AREA_CODES) expect(US_AREA_CODES.has(c)).toBe(false);
    for (const c of ['900', '976', '800', '888', '877', '866', '855', '844', '833', '500', '600', '700', '787', '939', '340', '809']) expect(isAllowedNanpAreaCode(c)).toBe(false);
    for (const c of ['269', '231', '517', '616', '734', '810', '906', '989', '313', '248', '586', '947', '679']) expect(isAllowedNanpAreaCode(c)).toBe(true); // Michigan
  });

  it('SMS_EXTRA_AREA_CODES can add a territory, but never a premium code', () => {
    process.env.SMS_EXTRA_AREA_CODES = '787, 939,900,976';
    try {
      expect(normalizePhoneE164('+1 787 555 0100')).toBe('+17875550100');
      expect(normalizePhoneE164('+1 939 555 0100')).toBe('+19395550100');
      expect(normalizePhoneE164('+1 900 555 0100')).toBeNull();
      expect(normalizePhoneE164('+1 976 555 0100')).toBeNull();
    } finally {
      delete process.env.SMS_EXTRA_AREA_CODES;
    }
    expect(normalizePhoneE164('+1 787 555 0100')).toBeNull();
  });

  it('applies to prefixed and unprefixed numbers alike, and other countries still need the country allowlist', () => {
    expect(normalizePhoneE164('787-555-0100')).toBeNull();
    expect(normalizePhoneE164('+17875550100')).toBeNull();
    expect(normalizePhoneE164('+44 20 7946 0958')).toBeNull();
  });
});

describe('log masking: errors that can embed phone numbers or emails (2026-09-30)', () => {
  it('safeErrorForLog keeps the code and masks numbers and emails, one line, capped', () => {
    const err = Object.assign(new Error('Invalid `prisma.saleSubscriber.updateMany()` invocation:\n where: { phone: "+12695550142" }\n owner jane.doe@example.com'), { code: 'P2010' });
    const out = safeErrorForLog(err);
    expect(out).toContain('code=P2010');
    expect(out).not.toContain('2695550142');
    expect(out).not.toContain('jane.doe@example.com');
    expect(out).toContain('***0142');
    expect(out).not.toMatch(/[\r\n]/);
    expect(safeErrorForLog(new Error('x'.repeat(5000))).length).toBeLessThanOrEqual(260);
  });

  it('safeErrorForLog never throws on odd input', () => {
    expect(() => safeErrorForLog(undefined)).not.toThrow();
    expect(() => safeErrorForLog(null)).not.toThrow();
    expect(() => safeErrorForLog('plain string +12695550142')).not.toThrow();
    expect(safeErrorForLog('plain string +12695550142')).not.toContain('2695550142');
    expect(redactEmailsInText('mail a.b@c.example now')).toBe('mail a***@c.example now');
  });

  it('the inbound webhook 500 path logs a masked message', async () => {
    jest.spyOn(mockFake.prisma.smsOptOut, 'upsert').mockRejectedValue(
      Object.assign(new Error('Invalid invocation: where phone "+12695550142"'), { code: 'P2010' })
    );
    const res: any = { statusCode: 0, status(c: number) { this.statusCode = c; return this; }, type() { return this; }, send(b: string) { this.body = b; return this; } };
    await handleInboundSms({ body: { From: '+12695550142', Body: 'STOP' }, headers: { 'x-twilio-signature': 'sig' }, protocol: 'https', originalUrl: '/api/notifications/sms-webhook', get: () => 'example.com' } as any, res);
    expect(res.statusCode).toBe(500);
    const logged = (console.error as jest.Mock).mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).toContain('code=P2010');
    expect(logged).not.toContain('2695550142');
  });
});

