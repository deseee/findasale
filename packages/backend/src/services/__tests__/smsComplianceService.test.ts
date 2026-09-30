/**
 * smsComplianceService (2026-09-29). NOT EXECUTED when written (jest cannot run on the authoring
 * device); CI is the first real run. Prisma is mocked.
 */
const mockSubscriberFindMany = jest.fn();
const mockSubscriberCount = jest.fn();
const mockOptOutFindMany = jest.fn();
const mockOptOutUpsert = jest.fn();
const mockOptOutDeleteMany = jest.fn();
const mockLogAggregate = jest.fn();

jest.mock('../../lib/prisma', () => ({
  prisma: {
    saleSubscriber: {
      findMany: (...a: any[]) => mockSubscriberFindMany(...a),
      count: (...a: any[]) => mockSubscriberCount(...a),
    },
    smsOptOut: {
      findMany: (...a: any[]) => mockOptOutFindMany(...a),
      upsert: (...a: any[]) => mockOptOutUpsert(...a),
      deleteMany: (...a: any[]) => mockOptOutDeleteMany(...a),
    },
    smsSendLog: { aggregate: (...a: any[]) => mockLogAggregate(...a) },
  },
}));

import twilio from 'twilio';
import {
  normalizePhoneE164,
  classifyInboundKeyword,
  estimateSmsSegments,
  composeSmsBody,
  getSmsFraming,
  checkQuietHours,
  resolveSendTimeZone,
  describeAllowedWindow,
  verifyTwilioSignature,
  loadSmsAudience,
  getSentInLast24h,
  recordSmsOptOut,
  clearSmsOptOut,
  getSmsDailyCap,
  SMS_STOP_FOOTER,
} from '../smsComplianceService';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('normalizePhoneE164', () => {
  it.each([
    ['(269) 555-1234', '+12695551234'],
    ['269-555-1234', '+12695551234'],
    ['1 269 555 1234', '+12695551234'],
    ['+1 (269) 555-1234', '+12695551234'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizePhoneE164(input)).toBe(expected);
  });

  it.each([[''], ['   '], ['12345'], ['+44 20 7946 0958'], ['(069) 555-1234'], ['(269) 155-1234'], [null], [undefined], [12345678901]])(
    'rejects %p',
    (input) => {
      expect(normalizePhoneE164(input as any)).toBeNull();
    }
  );
});

describe('classifyInboundKeyword', () => {
  it.each(['STOP', 'stop', ' Stop ', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'stop.'])('%s is STOP', (b) => {
    expect(classifyInboundKeyword(b)).toBe('STOP');
  });
  it.each(['START', 'yes', 'UNSTOP'])('%s is START', (b) => {
    expect(classifyInboundKeyword(b)).toBe('START');
  });
  it.each(['HELP', 'info'])('%s is HELP', (b) => {
    expect(classifyInboundKeyword(b)).toBe('HELP');
  });
  it('only whole-message keywords count', () => {
    expect(classifyInboundKeyword('please stop texting me')).toBe('STOP'); // conservative: a short message containing stop is an opt-out
    expect(classifyInboundKeyword('thanks!')).toBeNull();
    expect(classifyInboundKeyword('')).toBeNull();
    expect(classifyInboundKeyword(undefined)).toBeNull();
  });
  it('Twilio OptOutType wins when present', () => {
    expect(classifyInboundKeyword('anything', 'STOP')).toBe('STOP');
    expect(classifyInboundKeyword('STOP', 'HELP')).toBe('HELP');
  });
});

describe('segments and composition', () => {
  it('counts GSM-7 segments', () => {
    expect(estimateSmsSegments('a'.repeat(160))).toMatchObject({ encoding: 'GSM-7', segments: 1 });
    expect(estimateSmsSegments('a'.repeat(161))).toMatchObject({ encoding: 'GSM-7', segments: 2 });
    expect(estimateSmsSegments('a'.repeat(307))).toMatchObject({ encoding: 'GSM-7', segments: 3 });
  });
  it('extension characters count double', () => {
    expect(estimateSmsSegments('{'.repeat(81)).segments).toBe(2); // 162 units
  });
  it('emoji forces UCS-2 (70 per segment)', () => {
    expect(estimateSmsSegments('hi 😀')).toMatchObject({ encoding: 'UCS-2', segments: 1 });
    expect(estimateSmsSegments('😀'.repeat(36)).segments).toBe(2); // 72 UTF-16 units
  });
  it('every composed text names the sender and ends with the STOP line', () => {
    const body = composeSmsBody('Maple Estate Co', '  Doors open at 9  ');
    expect(body).toBe(`Maple Estate Co via FindA.Sale: Doors open at 9\n${SMS_STOP_FOOTER}`);
    expect(body.endsWith('Reply STOP to opt out.')).toBe(true);
  });
  it('falls back to a generic sender and trims long names', () => {
    expect(getSmsFraming('').prefix).toBe('Your organizer via FindA.Sale: ');
    expect(getSmsFraming('x'.repeat(100)).prefix.length).toBe(40 + ' via FindA.Sale: '.length);
  });
});

describe('quiet hours (8:00 AM to 9:00 PM, organizer timezone)', () => {
  const tz = 'America/Detroit'; // EDT (UTC-4) in September
  const at = (utc: string) => checkQuietHours(new Date(utc), tz);

  it('allows 8:00 AM local', () => {
    expect(at('2026-09-29T12:00:00Z').allowed).toBe(true);
  });
  it('blocks 7:59 AM local and reports 8 AM as next window', () => {
    const r = at('2026-09-29T11:59:00Z');
    expect(r.allowed).toBe(false);
    expect(r.nextAllowedAt?.toISOString()).toBe('2026-09-29T12:00:00.000Z');
  });
  it('allows 8:59 PM local, blocks 9:00 PM local', () => {
    expect(at('2026-09-30T00:59:00Z').allowed).toBe(true);
    const r = at('2026-09-30T01:00:00Z');
    expect(r.allowed).toBe(false);
    expect(r.nextAllowedAt?.toISOString()).toBe('2026-09-30T12:00:00.000Z');
  });
  it('blocks midnight local', () => {
    expect(at('2026-09-29T04:00:00Z').allowed).toBe(false);
  });
  it('resolves an invalid organizer timezone to the platform default', () => {
    expect(resolveSendTimeZone('Not/AZone')).toBeTruthy();
    expect(resolveSendTimeZone('America/Denver')).toBe('America/Denver');
  });
  it('describes the window', () => {
    expect(describeAllowedWindow()).toBe('8:00 AM to 9:00 PM');
  });
});

describe('verifyTwilioSignature', () => {
  const token = 'test_auth_token';
  const params = { From: '+12695551234', Body: 'STOP' };
  const url = 'https://api.example.com/api/notifications/sms-webhook';
  const mkReq = (signature?: string, body: any = params) =>
    ({
      headers: signature ? { 'x-twilio-signature': signature } : {},
      protocol: 'https',
      get: () => 'api.example.com',
      originalUrl: '/api/notifications/sms-webhook',
      body,
    }) as any;

  const OLD = { ...process.env };
  afterEach(() => {
    process.env = { ...OLD };
  });

  it('accepts a correctly signed request', () => {
    process.env.TWILIO_AUTH_TOKEN = token;
    const sig = twilio.getExpectedTwilioSignature(token, url, params);
    expect(verifyTwilioSignature(mkReq(sig))).toBe(true);
  });
  it('rejects a bad signature, a tampered body, a missing header, and a missing token (fail closed)', () => {
    process.env.TWILIO_AUTH_TOKEN = token;
    const sig = twilio.getExpectedTwilioSignature(token, url, params);
    expect(verifyTwilioSignature(mkReq('bogus'))).toBe(false);
    expect(verifyTwilioSignature(mkReq(sig, { ...params, Body: 'START' }))).toBe(false);
    expect(verifyTwilioSignature(mkReq())).toBe(false);
    delete process.env.TWILIO_AUTH_TOKEN;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(verifyTwilioSignature(mkReq(sig))).toBe(false);
  });
  it('honors TWILIO_WEBHOOK_BASE_URL when the public host differs', () => {
    process.env.TWILIO_AUTH_TOKEN = token;
    process.env.TWILIO_WEBHOOK_BASE_URL = 'https://public.example.org/';
    const sig = twilio.getExpectedTwilioSignature(token, 'https://public.example.org/api/notifications/sms-webhook', params);
    expect(verifyTwilioSignature(mkReq(sig))).toBe(true);
  });
});

describe('loadSmsAudience', () => {
  it('only counts consenting subscribers, dedupes, drops invalid numbers and STOP-listed numbers', async () => {
    mockSubscriberFindMany.mockResolvedValue([
      { phone: '(269) 555-1234' },
      { phone: '+12695551234' }, // same number, different formatting
      { phone: '269-555-9999' },
      { phone: 'garbage' },
      { phone: '(616) 555-0000' },
    ]);
    mockSubscriberCount.mockResolvedValue(4); // phone on file, no consent
    mockOptOutFindMany.mockResolvedValue([{ phone: '+12695559999' }]);

    const aud = await loadSmsAudience('sale_1');

    expect(aud.eligible.sort()).toEqual(['+12695551234', '+16165550000']);
    expect(aud.optedOut).toBe(1);
    expect(aud.invalidPhone).toBe(1);
    expect(aud.noConsent).toBe(4);
    const where = mockSubscriberFindMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ saleId: 'sale_1', smsConsentAt: { not: null } });
  });
});

describe('daily cap accounting and opt-out records', () => {
  it('sums sentCount over the rolling 24h window', async () => {
    mockLogAggregate.mockResolvedValue({ _sum: { sentCount: 42 } });
    const now = new Date('2026-09-29T15:00:00Z');
    expect(await getSentInLast24h('org_1', now)).toBe(42);
    const where = mockLogAggregate.mock.calls[0][0].where;
    expect(where.organizerId).toBe('org_1');
    expect(where.createdAt.gte.toISOString()).toBe('2026-09-28T15:00:00.000Z');
  });
  it('treats no rows as zero', async () => {
    mockLogAggregate.mockResolvedValue({ _sum: { sentCount: null } });
    expect(await getSentInLast24h('org_1')).toBe(0);
  });
  it('default cap is 300 and env-overridable', () => {
    const old = process.env.SMS_DAILY_CAP_PER_ORGANIZER;
    delete process.env.SMS_DAILY_CAP_PER_ORGANIZER;
    expect(getSmsDailyCap()).toBe(300);
    process.env.SMS_DAILY_CAP_PER_ORGANIZER = '50';
    expect(getSmsDailyCap()).toBe(50);
    if (old === undefined) delete process.env.SMS_DAILY_CAP_PER_ORGANIZER;
    else process.env.SMS_DAILY_CAP_PER_ORGANIZER = old;
  });
  it('records and clears opt-outs by E.164 number', async () => {
    await recordSmsOptOut('+12695551234', 'STOP', 'STOP_REPLY');
    expect(mockOptOutUpsert.mock.calls[0][0].where).toEqual({ phone: '+12695551234' });
    await clearSmsOptOut('+12695551234');
    expect(mockOptOutDeleteMany).toHaveBeenCalledWith({ where: { phone: '+12695551234' } });
  });
});
