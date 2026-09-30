/**
 * Double opt-in for sale text updates and the organizer text-update endpoint (2026-09-29).
 * Real notificationController + compliantSms + smsComplianceService against an in-memory Prisma fake;
 * Twilio is a mock. No network, no real text.
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

import {
  subscribeToSale,
  unsubscribeFromSale,
  getUserSubscriptions,
  sendSMSUpdate,
  getSmsAudienceSummary,
  buildDigestHtml,
} from '../controllers/notificationController';
import { handleInboundSms } from '../controllers/smsWebhookController';
import { SMS_CONSENT_PENDING_TTL_MS } from '../services/smsComplianceService';

const HOUR = 3600 * 1000;
const DAY_NOON = new Date('2026-09-30T15:00:00Z'); // 10:00 AM CDT
const NIGHT = new Date('2026-09-30T07:00:00Z'); // 2:00 AM CDT

const mkRes = () => {
  const res: any = {
    statusCode: 200,
    body: undefined as any,
    headers: {} as Record<string, string>,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: any) {
      this.body = b;
      return this;
    },
    type(t: string) {
      this.headers.type = t;
      return this;
    },
    send(b: any) {
      this.body = b;
      return this;
    },
  };
  return res;
};
const mkReq = (userId: string, body: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
  ({
    user: { id: userId },
    body,
    params: {},
    headers: { 'user-agent': 'Jest UA' },
    ip: '203.0.113.9',
    socket: { remoteAddress: '203.0.113.9' },
    get: (h: string) => (h.toLowerCase() === 'user-agent' ? 'Jest UA' : undefined),
    ...extra,
  }) as any;

const subscribe = async (userId: string, body: Record<string, unknown>) => {
  const res = mkRes();
  await subscribeToSale(mkReq(userId, body), res);
  return res;
};
const rows = () => mockFake.prisma.saleSubscriber.rows;
const rowFor = (userId: string, saleId = 's1') => rows().find((r: any) => r.userId === userId && r.saleId === saleId);
const allLogged = () =>
  [...(console.log as jest.Mock).mock.calls, ...(console.info as jest.Mock).mock.calls, ...(console.warn as jest.Mock).mock.calls, ...(console.error as jest.Mock).mock.calls].map((c) => c.join(' ')).join('\n');

const PHONE = '(269) 555-0142';
const E164 = '+12695550142';

beforeEach(() => {
  mockFake.reset();
  mockCreate.mockReset();
  mockCreate.mockResolvedValue({ sid: 'SM1' });
  process.env.TWILIO_ACCOUNT_SID = 'ACtest';
  process.env.TWILIO_AUTH_TOKEN = 'token';
  process.env.TWILIO_PHONE_NUMBER = '+18885550100';
  delete process.env.SMS_DAILY_CAP_PER_ORGANIZER;
  mockFake.prisma.sale.insert({ id: 's1', title: 'Oak Street Sale', organizerId: 'org1', status: 'PUBLISHED' });
  mockFake.prisma.sale.insert({ id: 's2', title: 'Elm Street Sale', organizerId: 'org1', status: 'PUBLISHED' });
  mockFake.prisma.organizer.insert({ id: 'org1', businessName: 'Oak Street Estates', timezone: 'America/Chicago' });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('subscribeToSale: double opt-in', () => {
  it('stores a PENDING opt-in with consent evidence, no confirmed consent, and sends exactly one confirmation text', async () => {
    const res = await subscribe('u1', { saleId: 's1', phone: PHONE, smsConsent: true });
    expect(res.statusCode).toBe(200);
    expect(res.body.smsStatus).toBe('PENDING');
    const row = rowFor('u1');
    expect(row.phone).toBe(E164);
    expect(row.smsConsentAt).toBeNull();
    expect(row.smsConsentPendingAt).toBeInstanceOf(Date);
    expect(row.smsConsentIp).toBe('203.0.113.9');
    expect(row.smsConsentUserAgent).toBe('Jest UA');
    expect(row.smsConsentVersion).toBeTruthy();
    expect(row.smsConsentSource).toBe('sale_page_double_opt_in_v2');
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0].to).toBe(E164);
    expect(mockCreate.mock.calls[0][0].body).toContain('Reply YES');
  });

  it('never echoes the phone number or any consent evidence in the response, and never logs the full number', async () => {
    const res = await subscribe('u1', { saleId: 's1', phone: PHONE, smsConsent: true });
    const json = JSON.stringify(res.body);
    expect(json).not.toContain('5550142');
    expect(json).not.toContain('203.0.113.9');
    expect(Object.keys(res.body.subscription).sort()).toEqual(['id', 'saleId']);
    expect(allLogged()).not.toContain('2695550142');
  });

  it('a pending number is not texted again until the YES arrives (no updates to pending rows)', async () => {
    await subscribe('u1', { saleId: 's1', phone: PHONE, smsConsent: true });
    expect(mockCreate).toHaveBeenCalledTimes(1); // only the confirmation
    expect(rowFor('u1').smsConsentAt).toBeNull();
  });

  it('YES from that number confirms it; STOP later removes it; YES afterwards does not bring it back', async () => {
    await subscribe('u1', { saleId: 's1', phone: PHONE, smsConsent: true });
    const inbound = async (Body: string) => {
      const res = mkRes();
      await handleInboundSms(
        { body: { From: E164, Body }, headers: { 'x-twilio-signature': 'sig' }, protocol: 'https', originalUrl: '/api/notifications/sms-webhook', get: () => 'example.com' } as any,
        res,
      );
      return res;
    };
    await inbound('YES');
    expect(rowFor('u1').smsConsentAt).toBeInstanceOf(Date);
    expect(rowFor('u1').smsConsentPendingAt).toBeNull();
    await inbound('STOP');
    expect(rowFor('u1').smsConsentAt).toBeNull();
    await inbound('YES');
    expect(rowFor('u1').smsConsentAt).toBeNull();
  });

  it('requires the consent box, a valid phone and a valid email', async () => {
    expect((await subscribe('u1', { saleId: 's1', phone: PHONE })).body.code).toBe('SMS_CONSENT_REQUIRED');
    expect((await subscribe('u1', { saleId: 's1', phone: PHONE, smsConsent: 'true' })).statusCode).toBe(400);
    expect((await subscribe('u1', { saleId: 's1', phone: '12345', smsConsent: true })).body.code).toBe('INVALID_PHONE');
    expect((await subscribe('u1', { saleId: 's1', email: 'not an email' })).body.code).toBe('INVALID_EMAIL');
    expect((await subscribe('u1', { saleId: 's1', email: 'a@b' })).statusCode).toBe(400);
    expect((await subscribe('u1', { saleId: 's1', email: '<x>@example.com' })).statusCode).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(0);
  });

  it('404 for a missing sale and 400 for a missing sale id', async () => {
    expect((await subscribe('u1', { saleId: 'nope', phone: PHONE, smsConsent: true })).statusCode).toBe(404);
    expect((await subscribe('u1', {})).statusCode).toBe(400);
  });

  it('email-only subscribing works and sends no text (the ACCOUNT email is stored, not the typed one)', async () => {
    mockFake.prisma.user.insert({ id: 'u1', email: 'Shopper@Example.com' });
    const res = await subscribe('u1', { saleId: 's1', email: 'Shopper@Example.com' });
    expect(res.statusCode).toBe(200);
    expect(res.body.smsStatus).toBe('NONE');
    expect(rowFor('u1').email).toBe('shopper@example.com');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('resubmitting the same number inside the cooldown does not text again; after the cooldown it does', async () => {
    await subscribe('u1', { saleId: 's1', phone: PHONE, smsConsent: true });
    await subscribe('u1', { saleId: 's1', phone: PHONE, smsConsent: true });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    rowFor('u1').smsConsentPendingAt = new Date(Date.now() - 20 * 60 * 1000);
    await subscribe('u1', { saleId: 's1', phone: PHONE, smsConsent: true });
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('an already confirmed number reports CONFIRMED and sends nothing', async () => {
    mockFake.prisma.saleSubscriber.insert({ saleId: 's1', userId: 'u1', phone: E164, smsConsentAt: new Date() });
    const res = await subscribe('u1', { saleId: 's1', phone: PHONE, smsConsent: true });
    expect(res.body.smsStatus).toBe('CONFIRMED');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('an empty phone turns texts off and clears every consent field; an omitted phone leaves it alone', async () => {
    mockFake.prisma.saleSubscriber.insert({ saleId: 's1', userId: 'u1', phone: E164, smsConsentAt: new Date(), smsConsentSource: 'x', smsConsentPendingAt: null });
    await subscribe('u1', { saleId: 's1', email: 'a@example.com' });
    expect(rowFor('u1').phone).toBe(E164);
    expect(rowFor('u1').smsConsentAt).toBeInstanceOf(Date);
    const res = await subscribe('u1', { saleId: 's1', phone: '' });
    expect(res.body.smsStatus).toBe('OFF');
    expect(rowFor('u1')).toMatchObject({ phone: null, smsConsentAt: null, smsConsentPendingAt: null });
  });

  it('a signed-in account cannot get consent recorded for a number it does not control (typing a number never confirms it)', async () => {
    await subscribe('attacker', { saleId: 's1', phone: PHONE, smsConsent: true });
    expect(rowFor('attacker').smsConsentAt).toBeNull();
    // and the audience the organizer can text does not include it
    const { loadSmsAudience } = require('../services/smsComplianceService');
    expect((await loadSmsAudience('s1')).eligible).toEqual([]);
  });

  describe('no phone-number oracle: the response is the same in every case', () => {
    const normalized = (res: any) => JSON.stringify({ status: res.statusCode, ...res.body, subscription: undefined });

    it('fresh number vs STOP-listed number vs number held (confirmed) by another account vs throttled number', async () => {
      const fresh = await subscribe('u1', { saleId: 's1', phone: '(269) 555-0101', smsConsent: true });

      mockFake.prisma.smsOptOut.insert({ phone: '+12695550102' });
      const stopListed = await subscribe('u2', { saleId: 's1', phone: '(269) 555-0102', smsConsent: true });
      expect(mockCreate.mock.calls.filter((c) => c[0].to === '+12695550102')).toHaveLength(0);
      expect(rowFor('u2').phone).toBeNull();

      mockFake.prisma.saleSubscriber.insert({ saleId: 's1', userId: 'owner', phone: '+12695550103', smsConsentAt: new Date() });
      const held = await subscribe('u3', { saleId: 's1', phone: '(269) 555-0103', smsConsent: true });
      expect(rowFor('u3').phone).toBeNull();
      expect(mockCreate.mock.calls.filter((c) => c[0].to === '+12695550103')).toHaveLength(0);

      for (let i = 0; i < 3; i++) {
        mockFake.prisma.saleSubscriber.insert({ saleId: `x${i}`, userId: `t${i}`, phone: '+12695550104', smsConsentPendingAt: new Date() });
      }
      const throttled = await subscribe('u4', { saleId: 's1', phone: '(269) 555-0104', smsConsent: true });
      expect(mockCreate.mock.calls.filter((c) => c[0].to === '+12695550104')).toHaveLength(0);

      const base = normalized(fresh);
      expect(normalized(stopListed)).toBe(base);
      expect(normalized(held)).toBe(base);
      expect(normalized(throttled)).toBe(base);
    });

    it('a number that is already pending for another account looks the same as a fresh one', async () => {
      const fresh = await subscribe('u1', { saleId: 's1', phone: '(269) 555-0101', smsConsent: true });
      const again = await subscribe('u2', { saleId: 's1', phone: '(269) 555-0101', smsConsent: true });
      expect(normalized(again)).toBe(normalized(fresh));
    });
  });

  it('an expired, unconfirmed hold on (sale, number) by another account is released for the real owner', async () => {
    mockFake.prisma.saleSubscriber.insert({
      saleId: 's1',
      userId: 'squatter',
      phone: E164,
      smsConsentAt: null,
      smsConsentPendingAt: new Date(Date.now() - SMS_CONSENT_PENDING_TTL_MS - HOUR),
    });
    const res = await subscribe('owner', { saleId: 's1', phone: PHONE, smsConsent: true });
    expect(res.statusCode).toBe(200);
    expect(rowFor('owner').phone).toBe(E164);
    expect(rowFor('squatter').phone).toBeNull();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('a confirmation-text failure never changes the response', async () => {
    mockCreate.mockRejectedValue(new Error('twilio down'));
    const res = await subscribe('u1', { saleId: 's1', phone: PHONE, smsConsent: true });
    expect(res.statusCode).toBe(200);
    expect(res.body.smsStatus).toBe('PENDING');
  });
});

describe('unsubscribeFromSale', () => {
  it('deletes the subscription, and answers 404 (not 500) when there is none', async () => {
    mockFake.prisma.saleSubscriber.insert({ saleId: 's1', userId: 'u1', email: 'a@example.com' });
    const req = mkReq('u1');
    req.params = { saleId: 's1' };
    const ok = mkRes();
    await unsubscribeFromSale(req, ok);
    expect(ok.statusCode).toBe(200);
    const again = mkRes();
    await unsubscribeFromSale(req, again);
    expect(again.statusCode).toBe(404);
  });
});

describe('getUserSubscriptions', () => {
  it('asks for an explicit field list that leaves out the consent IP and user agent', async () => {
    const spy = jest.spyOn(mockFake.prisma.saleSubscriber, 'findMany');
    mockFake.prisma.saleSubscriber.insert({ saleId: 's1', userId: 'u1', smsConsentIp: '203.0.113.9', smsConsentUserAgent: 'UA' });
    const res = mkRes();
    await getUserSubscriptions(mkReq('u1'), res);
    const select = (spy.mock.calls[0][0] as any).select;
    expect(select.smsConsentIp).toBeUndefined();
    expect(select.smsConsentUserAgent).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('203.0.113.9');
  });
});

describe('sendSMSUpdate (organizer text update)', () => {
  const organizerProfile = { id: 'org1', businessName: 'Oak Street Estates', timezone: 'America/Chicago', subscriptionTier: 'PRO' };
  const send = async (body: Record<string, unknown>, profile: any = organizerProfile) => {
    const res = mkRes();
    await sendSMSUpdate({ user: { id: 'ou', organizerProfile: profile }, body, params: {}, headers: {} } as any, res);
    return res;
  };
  const seedAudience = (n: number, over: Record<string, unknown> = {}) => {
    for (let i = 0; i < n; i++) {
      mockFake.prisma.saleSubscriber.insert({ saleId: 's1', userId: `a${i}`, phone: `+1269555${String(2000 + i)}`, smsConsentAt: new Date('2026-09-01T00:00:00Z'), ...over });
    }
  };

  beforeEach(() => {
    jest.useFakeTimers({ now: DAY_NOON });
  });

  it('texts only confirmed subscribers, with prefix and footer, and reports counts', async () => {
    seedAudience(3);
    mockFake.prisma.saleSubscriber.insert({ saleId: 's1', userId: 'pending', phone: '+12695559999', smsConsentAt: null, smsConsentPendingAt: new Date() });
    mockFake.prisma.saleSubscriber.insert({ saleId: 's1', userId: 'nocons', phone: '+12695558888', smsConsentAt: null });
    const res = await send({ saleId: 's1', message: 'Doors open at 8 tomorrow.' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ sentCount: 3, failedCount: 0, partial: false, skippedByCapCount: 0 });
    expect(mockCreate).toHaveBeenCalledTimes(3);
    const bodies = mockCreate.mock.calls.map((c) => c[0].body as string);
    expect(bodies.every((b) => b.startsWith('Oak Street Estates via FindA.Sale: ') && b.endsWith('Reply STOP to opt out.'))).toBe(true);
    expect(mockCreate.mock.calls.map((c) => c[0].to)).not.toContain('+12695559999');
    expect(mockCreate.mock.calls.map((c) => c[0].to)).not.toContain('+12695558888');
  });

  it('skips STOP-listed numbers', async () => {
    seedAudience(2);
    mockFake.prisma.smsOptOut.insert({ phone: '+12695552000' });
    const res = await send({ saleId: 's1', message: 'Hello' });
    expect(res.body.sentCount).toBe(1);
    expect(res.body.skippedOptOutCount).toBeGreaterThanOrEqual(1);
  });

  it('partial send at the daily cap: sends the remaining allowance and says so', async () => {
    process.env.SMS_DAILY_CAP_PER_ORGANIZER = '5';
    mockFake.prisma.smsSendLog.insert({ organizerId: 'org1', saleId: 's2', sentCount: 2, status: 'COMPLETE', createdAt: new Date(Date.now() - HOUR) });
    seedAudience(10);
    const res = await send({ saleId: 's1', message: 'Hello' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ sentCount: 3, skippedByCapCount: 7, partial: true, remainingToday: 0 });
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it('answers 429 DAILY_CAP_REACHED when nothing is left', async () => {
    process.env.SMS_DAILY_CAP_PER_ORGANIZER = '2';
    mockFake.prisma.smsSendLog.insert({ organizerId: 'org1', saleId: 's2', sentCount: 2, status: 'COMPLETE', createdAt: new Date(Date.now() - HOUR) });
    seedAudience(3);
    const res = await send({ saleId: 's1', message: 'Hello' });
    expect(res.statusCode).toBe(429);
    expect(res.body.code).toBe('DAILY_CAP_REACHED');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('a second blast while one is reserved is refused with 409, database backed', async () => {
    mockFake.prisma.smsSendLog.insert({ organizerId: 'org1', saleId: 's1', sentCount: 5, status: 'RESERVED', createdAt: new Date(Date.now() - 60 * 1000) });
    seedAudience(3);
    const res = await send({ saleId: 's1', message: 'Hello' });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('SEND_IN_PROGRESS');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('refuses during quiet hours with 422 and the next allowed time', async () => {
    jest.setSystemTime(NIGHT);
    seedAudience(2);
    const res = await send({ saleId: 's1', message: 'Hello' });
    expect(res.statusCode).toBe(422);
    expect(res.body.code).toBe('QUIET_HOURS');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('refuses a SIMPLE-tier organizer', async () => {
    seedAudience(2);
    const res = await send({ saleId: 's1', message: 'Hello' }, { ...organizerProfile, subscriptionTier: 'SIMPLE' });
    expect(res.statusCode).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects other organizers, empty and over-long messages, and ended sales', async () => {
    seedAudience(1);
    expect((await send({ saleId: 's1', message: 'Hello' }, { ...organizerProfile, id: 'other' })).statusCode).toBe(403);
    expect((await send({ saleId: 's1', message: '   ' })).statusCode).toBe(400);
    expect((await send({ saleId: 's1', message: 'x'.repeat(300) })).body.code).toBe('MESSAGE_TOO_LONG');
    mockFake.prisma.sale.rows.find((s: any) => s.id === 's1').status = 'ENDED';
    expect((await send({ saleId: 's1', message: 'Hello' })).statusCode).toBe(409);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('the audience summary counts pending opt-ins separately and never returns phone numbers', async () => {
    seedAudience(2);
    mockFake.prisma.saleSubscriber.insert({ saleId: 's1', userId: 'p', phone: '+12695559999', smsConsentAt: null, smsConsentPendingAt: new Date() });
    const res = mkRes();
    await getSmsAudienceSummary({ user: { organizerProfile }, params: { saleId: 's1' }, body: {}, headers: {} } as any, res);
    expect(res.body).toMatchObject({ eligibleCount: 2, pendingConfirmationCount: 1 });
    expect(JSON.stringify(res.body)).not.toContain('2695559999');
  });
});

describe('weekly digest HTML escaping (P1-2)', () => {
  const sale = (over: Record<string, unknown> = {}) => ({
    id: 's<1>',
    title: '<script>alert(1)</script>Oak "Sale"',
    address: '12 <b>Oak</b> St',
    city: 'Paw & Paw',
    state: 'MI',
    startDate: new Date('2026-10-03T14:00:00Z'),
    endDate: new Date('2026-10-04T20:00:00Z'),
    photoUrls: ['https://cdn.example.com/a.jpg'],
    organizer: { businessName: '<img src=x onerror=alert(2)>Estates' },
    ...over,
  });

  it('escapes titles, addresses, business names, first names and ids', () => {
    const html = buildDigestHtml('<i>Pat</i> Smith', [sale()], 'https://finda.sale', 'https://finda.sale/unsubscribe?token=a&b=c', true);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>Oak</b>');
    expect(html).not.toContain('<i>Pat</i>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Paw &amp; Paw');
    expect(html).toContain('token=a&amp;b=c');
  });

  it('only renders photos that are https URLs and neutralizes attribute breakouts', () => {
    const evil = buildDigestHtml('Pat', [sale({ photoUrls: ['https://x.example/a.jpg" onerror="alert(1)'] })], 'https://finda.sale', 'https://finda.sale/u', false);
    expect(evil).not.toMatch(/onerror="alert/);
    const js = buildDigestHtml('Pat', [sale({ photoUrls: ['javascript:alert(1)'] })], 'https://finda.sale', 'https://finda.sale/u', false);
    expect(js).not.toContain('javascript:');
    expect(js).not.toContain('<img');
    const http = buildDigestHtml('Pat', [sale({ photoUrls: ['http://insecure.example/a.jpg'] })], 'https://finda.sale', 'https://finda.sale/u', false);
    expect(http).not.toContain('<img');
    const ok = buildDigestHtml('Pat', [sale()], 'https://finda.sale', 'https://finda.sale/u', false);
    expect(ok).toContain('<img src="https://cdn.example.com/a.jpg"');
  });
});
