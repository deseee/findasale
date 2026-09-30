/**
 * Organizer SMS controller (controllers/notificationController.ts), rewritten 2026-09-29 for the current implementation:
 *  - subscribeToSale is DOUBLE OPT-IN: a typed number is stored as PENDING (smsConsentPendingAt), one "Reply YES"
 *    confirmation text is sent, and consent (smsConsentAt) is only ever set by the number replying YES (webhook).
 *    The response never reveals whether a number is taken, on the STOP list or throttled (no phone-number oracle).
 *  - sendSMSUpdate goes through sendCompliantSmsBatch: tier gate, recorded consent, STOP suppression, quiet hours in the
 *    organizer's timezone, sender prefix + STOP footer, segment cap, and a database reservation against the rolling
 *    24 hour cap (a send larger than the remaining allowance is sent PARTIALLY, not refused).
 *  - getSmsAudienceSummary returns counts and framing only.
 * Prisma, Twilio and the email service are mocked. No real texts or emails are ever sent.
 */
const mockSaleFindUnique = jest.fn();
const mockOrganizerFindUnique = jest.fn();
const mockSubFindMany = jest.fn();
const mockSubCount = jest.fn();
const mockSubFindUnique = jest.fn();
const mockSubUpsert = jest.fn();
const mockSubUpdateMany = jest.fn();
const mockUserFindUnique = jest.fn();
const mockOptOutFindMany = jest.fn();
const mockOptOutUpsert = jest.fn();
const mockLogAggregate = jest.fn();
const mockLogCreate = jest.fn();
const mockLogUpdate = jest.fn();
const mockLogCount = jest.fn();
const mockQueryRaw = jest.fn();
const mockTwilioCreate = jest.fn();

const mockLogModel = {
  aggregate: (...a: any[]) => mockLogAggregate(...a),
  create: (...a: any[]) => mockLogCreate(...a),
  update: (...a: any[]) => mockLogUpdate(...a),
  count: (...a: any[]) => mockLogCount(...a),
};

jest.mock('../../lib/prisma', () => ({
  prisma: {
    sale: { findUnique: (...a: any[]) => mockSaleFindUnique(...a) },
    user: { findUnique: (...a: any[]) => mockUserFindUnique(...a) },
    organizer: { findUnique: (...a: any[]) => mockOrganizerFindUnique(...a) },
    saleSubscriber: {
      findMany: (...a: any[]) => mockSubFindMany(...a),
      count: (...a: any[]) => mockSubCount(...a),
      findUnique: (...a: any[]) => mockSubFindUnique(...a),
      upsert: (...a: any[]) => mockSubUpsert(...a),
      updateMany: (...a: any[]) => mockSubUpdateMany(...a),
    },
    smsOptOut: {
      findMany: (...a: any[]) => mockOptOutFindMany(...a),
      upsert: (...a: any[]) => mockOptOutUpsert(...a),
    },
    smsSendLog: mockLogModel,
    // The cap reservation runs in a transaction; the transaction client shares the same mocks.
    $transaction: async (fn: any) => fn({ $queryRaw: (...a: any[]) => mockQueryRaw(...a), smsSendLog: mockLogModel }),
  },
}));
jest.mock('../../lib/emailService', () => ({ emailService: { emails: { send: jest.fn() } } }));
jest.mock('twilio', () => ({
  __esModule: true,
  default: jest.fn(() => ({ messages: { create: (...a: any[]) => mockTwilioCreate(...a) } })),
}));

import { subscribeToSale, sendSMSUpdate, getSmsAudienceSummary } from '../notificationController';

const NOON_EDT = new Date('2026-09-29T16:00:00Z'); // 12:00 PM America/Detroit
const ELEVEN_PM_EDT = new Date('2026-09-30T03:00:00Z');

const useNow = (d: Date) =>
  jest.useFakeTimers({
    now: d,
    doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'],
  });

const mkRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const organizerReq = (body: any, over: any = {}) =>
  ({
    body,
    params: {},
    user: {
      id: 'u_org',
      organizerProfile: { id: 'org_1', businessName: 'Maple Estate Co', timezone: 'America/Detroit', subscriptionTier: 'PRO', ...over },
    },
    get: () => undefined,
    ip: '203.0.113.9',
    headers: {},
  }) as any;

const shopperReq = (body: any) =>
  ({ body, params: {}, user: { id: 'u_shopper' }, get: () => 'jest-agent', ip: '203.0.113.7', headers: {} }) as any;

const ownSale = { id: 'sale_1', organizerId: 'org_1', title: 'Big Garage Sale', status: 'PUBLISHED' };

const setAudience = (phones: string[], opts: { noConsent?: number; optedOut?: string[] } = {}) => {
  mockSubFindMany.mockResolvedValue(phones.map((phone) => ({ phone })));
  mockSubCount.mockResolvedValue(opts.noConsent ?? 0);
  mockOptOutFindMany.mockResolvedValue((opts.optedOut ?? []).map((phone) => ({ phone })));
};

const OLD_ENV = { ...process.env };
const allMocks = [
  mockSaleFindUnique, mockOrganizerFindUnique, mockSubFindMany, mockSubCount, mockSubFindUnique, mockSubUpsert, mockSubUpdateMany, mockUserFindUnique,
  mockOptOutFindMany, mockOptOutUpsert, mockLogAggregate, mockLogCreate, mockLogUpdate, mockLogCount, mockQueryRaw, mockTwilioCreate,
];
let consoleSpies: jest.SpyInstance[] = [];

beforeEach(() => {
  allMocks.forEach((m) => m.mockReset());
  consoleSpies = (['error', 'warn', 'info', 'log'] as const).map((k) => jest.spyOn(console, k).mockImplementation(() => undefined));
  process.env.TWILIO_ACCOUNT_SID = 'ACtest';
  process.env.TWILIO_AUTH_TOKEN = 'token';
  process.env.TWILIO_PHONE_NUMBER = '+18556943115';
  delete process.env.SMS_DAILY_CAP_PER_ORGANIZER;
  mockSaleFindUnique.mockResolvedValue(ownSale);
  mockOrganizerFindUnique.mockResolvedValue({ id: 'org_1', businessName: 'Maple Estate Co', timezone: 'America/Detroit' });
  mockSubFindMany.mockResolvedValue([]);
  mockSubCount.mockResolvedValue(0);
  mockOptOutFindMany.mockResolvedValue([]);
  mockOptOutUpsert.mockResolvedValue({});
  mockSubUpdateMany.mockResolvedValue({ count: 0 });
  // The subscriber's own account email: the only address a reminder is ever addressed to.
  mockUserFindUnique.mockResolvedValue({ email: 'account@example.com' });
  mockLogAggregate.mockResolvedValue({ _sum: { sentCount: 0 } });
  mockLogCount.mockResolvedValue(0);
  mockLogCreate.mockResolvedValue({ id: 'log_1' });
  mockLogUpdate.mockResolvedValue({});
  mockQueryRaw.mockResolvedValue([{ locked: true }]);
  mockTwilioCreate.mockResolvedValue({ sid: 'SM1' });
  useNow(NOON_EDT);
});

afterEach(() => {
  jest.useRealTimers();
  consoleSpies.forEach((s) => s.mockRestore());
  process.env = { ...OLD_ENV };
});

describe('sendSMSUpdate', () => {
  it('rejects a missing sale id or an empty message', async () => {
    const res = mkRes();
    await sendSMSUpdate(organizerReq({ saleId: 'sale_1', message: '   ' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockTwilioCreate).not.toHaveBeenCalled();

    const res2 = mkRes();
    await sendSMSUpdate(organizerReq({ message: 'hello' }), res2);
    expect(res2.status).toHaveBeenCalledWith(400);
  });

  it('403 when the signed-in user has no organizer profile', async () => {
    const res = mkRes();
    await sendSMSUpdate({ body: { saleId: 'sale_1', message: 'hello' }, params: {}, user: { id: 'u_x' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].code).toBe('ORGANIZER_PROFILE_REQUIRED');
  });

  it('rejects a message over the length limit', async () => {
    const res = mkRes();
    await sendSMSUpdate(organizerReq({ saleId: 'sale_1', message: 'a'.repeat(241) }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].code).toBe('MESSAGE_TOO_LONG');
  });

  it('rejects a message that would bill too many segments (emoji)', async () => {
    const res = mkRes();
    await sendSMSUpdate(organizerReq({ saleId: 'sale_1', message: '😀'.repeat(120) }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].code).toBe('MESSAGE_TOO_LONG');
    expect(mockTwilioCreate).not.toHaveBeenCalled();
  });

  it("403 for another organizer's sale, 404 for a missing sale", async () => {
    mockSaleFindUnique.mockResolvedValueOnce({ ...ownSale, organizerId: 'someone_else' });
    let res = mkRes();
    await sendSMSUpdate(organizerReq({ saleId: 'sale_1', message: 'hello' }), res);
    expect(res.status).toHaveBeenCalledWith(403);

    mockSaleFindUnique.mockResolvedValueOnce(null);
    res = mkRes();
    await sendSMSUpdate(organizerReq({ saleId: 'nope', message: 'hello' }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockTwilioCreate).not.toHaveBeenCalled();
  });

  it('refuses to send for an ended sale', async () => {
    mockSaleFindUnique.mockResolvedValueOnce({ ...ownSale, status: 'ENDED' });
    const res = mkRes();
    await sendSMSUpdate(organizerReq({ saleId: 'sale_1', message: 'hello' }), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].code).toBe('SALE_ENDED');
    expect(mockTwilioCreate).not.toHaveBeenCalled();
  });

  it('503 when Twilio is not configured', async () => {
    delete process.env.TWILIO_PHONE_NUMBER;
    const res = mkRes();
    await sendSMSUpdate(organizerReq({ saleId: 'sale_1', message: 'hello' }), res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json.mock.calls[0][0].code).toBe('SMS_NOT_CONFIGURED');
  });

  it('blocks sends during quiet hours (11 PM organizer time) and reports the next window', async () => {
    jest.useRealTimers();
    useNow(ELEVEN_PM_EDT);
    setAudience(['(269) 555-1234']);
    const res = mkRes();
    await sendSMSUpdate(organizerReq({ saleId: 'sale_1', message: 'hello' }), res);
    expect(res.status).toHaveBeenCalledWith(422);
    const payload = res.json.mock.calls[0][0];
    expect(payload.code).toBe('QUIET_HOURS');
    expect(payload.timeZone).toBe('America/Detroit');
    expect(payload.nextAllowedAt).toBeInstanceOf(Date);
    expect(mockTwilioCreate).not.toHaveBeenCalled();
    expect(mockLogCreate).not.toHaveBeenCalled(); // no allowance is reserved for a blocked send
  });

  it('texts only consenting, non-STOP shoppers and appends the STOP line and sender name', async () => {
    setAudience(['(269) 555-1234', '(616) 555-0000', '(313) 555-7777'], { optedOut: ['+13135557777'], noConsent: 5 });
    const res = mkRes();
    await sendSMSUpdate(organizerReq({ saleId: 'sale_1', message: 'Doors open at 8' }), res);

    expect(mockTwilioCreate).toHaveBeenCalledTimes(2);
    const tos = mockTwilioCreate.mock.calls.map((c) => c[0].to).sort();
    expect(tos).toEqual(['+12695551234', '+16165550000']);
    for (const call of mockTwilioCreate.mock.calls) {
      expect(call[0].body).toBe('Maple Estate Co via FindA.Sale: Doors open at 8\nReply STOP to opt out.');
      expect(call[0].from).toBe('+18556943115');
    }
    // consent query only ever asks for subscribers with a recorded (confirmed) consent time
    expect(mockSubFindMany.mock.calls[0][0].where.smsConsentAt).toEqual({ not: null });

    const payload = res.json.mock.calls[0][0];
    expect(payload).toMatchObject({ sentCount: 2, failedCount: 0, skippedOptOutCount: 1, skippedByCapCount: 0, partial: false, audienceSize: 2 });
    // never echoes phone numbers back
    expect(JSON.stringify(payload)).not.toMatch(/\+1\d{10}/);

    // The allowance is reserved BEFORE sending (RESERVED row), then reconciled to the real numbers.
    expect(mockLogCreate).toHaveBeenCalledTimes(1);
    expect(mockLogCreate.mock.calls[0][0].data).toMatchObject({
      organizerId: 'org_1', saleId: 'sale_1', recipientCount: 2, sentCount: 2, status: 'RESERVED',
    });
    expect(mockLogUpdate).toHaveBeenCalledTimes(1);
    expect(mockLogUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: 'log_1' },
      data: { sentCount: 2, failedCount: 0, status: 'COMPLETE' },
    });
  });

  it('does nothing when nobody has opted in', async () => {
    setAudience([]);
    const res = mkRes();
    await sendSMSUpdate(organizerReq({ saleId: 'sale_1', message: 'hello' }), res);
    expect(mockTwilioCreate).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0]).toMatchObject({ sentCount: 0, audienceSize: 0 });
    expect(mockLogCreate).not.toHaveBeenCalled();
  });

  it('requires the PRO plan: a SIMPLE organizer is refused and nothing is sent or reserved', async () => {
    setAudience(['(269) 555-1234']);
    const res = mkRes();
    await sendSMSUpdate(organizerReq({ saleId: 'sale_1', message: 'hello' }, { subscriptionTier: 'SIMPLE' }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].code).toBe('TIER_REQUIRED');
    expect(mockTwilioCreate).not.toHaveBeenCalled();
    expect(mockLogCreate).not.toHaveBeenCalled();
  });

  it('records a carrier opt-out (Twilio 21610) instead of counting a failure', async () => {
    setAudience(['(269) 555-1234', '(616) 555-0000']);
    mockTwilioCreate.mockImplementation(async ({ to }: any) => {
      if (to === '+16165550000') throw Object.assign(new Error('unsubscribed recipient'), { code: 21610 });
      return { sid: 'SM' };
    });
    const res = mkRes();
    await sendSMSUpdate(organizerReq({ saleId: 'sale_1', message: 'hello' }), res);
    expect(mockOptOutUpsert).toHaveBeenCalledTimes(1);
    expect(mockOptOutUpsert.mock.calls[0][0].where).toEqual({ phone: '+16165550000' });
    expect(mockOptOutUpsert.mock.calls[0][0].create).toMatchObject({ source: 'TWILIO_21610' });
    expect(res.json.mock.calls[0][0]).toMatchObject({ sentCount: 1, failedCount: 0, skippedOptOutCount: 1 });
  });

  it('counts other Twilio errors as failures (and reconciles the reservation to what really happened)', async () => {
    setAudience(['(269) 555-1234']);
    mockTwilioCreate.mockRejectedValue(new Error('boom'));
    const res = mkRes();
    await sendSMSUpdate(organizerReq({ saleId: 'sale_1', message: 'hello' }), res);
    expect(res.json.mock.calls[0][0]).toMatchObject({ sentCount: 0, failedCount: 1 });
    expect(mockLogUpdate.mock.calls[0][0].data).toMatchObject({ sentCount: 0, failedCount: 1, status: 'COMPLETE' });
  });

  it('enforces the rolling daily cap: a larger audience is sent PARTIALLY, earliest subscribers first', async () => {
    setAudience(['(269) 555-1234', '(616) 555-0000']);
    mockLogAggregate.mockResolvedValue({ _sum: { sentCount: 299 } }); // cap 300, 1 left, audience 2
    const res = mkRes();
    await sendSMSUpdate(organizerReq({ saleId: 'sale_1', message: 'hello' }), res);

    expect(mockTwilioCreate).toHaveBeenCalledTimes(1);
    expect(mockTwilioCreate.mock.calls[0][0].to).toBe('+12695551234');
    const payload = res.json.mock.calls[0][0];
    expect(payload).toMatchObject({ sentCount: 1, skippedByCapCount: 1, partial: true, audienceSize: 2, remainingToday: 0 });
    expect(payload.message).toMatch(/not texted because you reached today's limit of 300/);
    expect(mockLogCreate.mock.calls[0][0].data).toMatchObject({ recipientCount: 2, sentCount: 1, status: 'RESERVED' });
  });

  it('a fully used allowance sends nothing and answers 429 DAILY_CAP_REACHED', async () => {
    setAudience(['(269) 555-1234', '(616) 555-0000']);
    mockLogAggregate.mockResolvedValue({ _sum: { sentCount: 300 } });
    const res = mkRes();
    await sendSMSUpdate(organizerReq({ saleId: 'sale_1', message: 'hello' }), res);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json.mock.calls[0][0]).toMatchObject({ code: 'DAILY_CAP_REACHED', dailyCap: 300, remainingToday: 0 });
    expect(mockTwilioCreate).not.toHaveBeenCalled();
    expect(mockLogCreate).not.toHaveBeenCalled();
  });

  it('honors SMS_DAILY_CAP_PER_ORGANIZER', async () => {
    process.env.SMS_DAILY_CAP_PER_ORGANIZER = '2';
    setAudience(['(269) 555-1234', '(616) 555-0000', '(313) 555-7777']);
    const res = mkRes();
    await sendSMSUpdate(organizerReq({ saleId: 'sale_1', message: 'hello' }), res);
    expect(mockTwilioCreate).toHaveBeenCalledTimes(2);
    expect(res.json.mock.calls[0][0]).toMatchObject({ sentCount: 2, skippedByCapCount: 1, partial: true });
  });

  it('refuses a second overlapping send from the same organizer (in-process fast path)', async () => {
    setAudience(['(269) 555-1234']);
    let release: (v: any) => void = () => undefined;
    mockTwilioCreate.mockImplementation(() => new Promise((resolve) => { release = resolve; }));

    const first = sendSMSUpdate(organizerReq({ saleId: 'sale_1', message: 'one' }), mkRes());
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); // let the first call reach Twilio

    const res2 = mkRes();
    await sendSMSUpdate(organizerReq({ saleId: 'sale_1', message: 'two' }), res2);
    expect(res2.status).toHaveBeenCalledWith(409);
    expect(res2.json.mock.calls[0][0].code).toBe('SEND_IN_PROGRESS');

    release({ sid: 'SM' });
    await first;
  });

  it('refuses when another process already holds the database lock or a fresh reservation (multi-process guard)', async () => {
    setAudience(['(269) 555-1234']);
    mockQueryRaw.mockResolvedValue([{ locked: false }]);
    let res = mkRes();
    await sendSMSUpdate(organizerReq({ saleId: 'sale_1', message: 'hello' }), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].code).toBe('SEND_IN_PROGRESS');

    mockQueryRaw.mockResolvedValue([{ locked: true }]);
    mockLogCount.mockResolvedValue(1); // a RESERVED row from a send that is still running
    res = mkRes();
    await sendSMSUpdate(organizerReq({ saleId: 'sale_1', message: 'hello' }), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockTwilioCreate).not.toHaveBeenCalled();
  });

  it('sends nothing when the allowance cannot be reserved (fail closed)', async () => {
    setAudience(['(269) 555-1234']);
    mockQueryRaw.mockRejectedValue(new Error('db down'));
    const res = mkRes();
    await sendSMSUpdate(organizerReq({ saleId: 'sale_1', message: 'hello' }), res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json.mock.calls[0][0].code).toBe('SMS_SEND_UNAVAILABLE');
    expect(mockTwilioCreate).not.toHaveBeenCalled();
  });

  it('sends nothing when the STOP list cannot be read (fail closed)', async () => {
    mockSubFindMany.mockResolvedValue([{ phone: '(269) 555-1234' }]);
    mockOptOutFindMany.mockRejectedValue(new Error('db down'));
    const res = mkRes();
    await sendSMSUpdate(organizerReq({ saleId: 'sale_1', message: 'hello' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockTwilioCreate).not.toHaveBeenCalled();
  });
});

describe('getSmsAudienceSummary', () => {
  it('returns counts and framing, never phone numbers', async () => {
    mockSubFindMany.mockResolvedValue([{ phone: '(269) 555-1234' }]);
    mockSubCount.mockResolvedValueOnce(2).mockResolvedValueOnce(1); // noConsent, pendingConfirmation
    mockLogAggregate.mockResolvedValue({ _sum: { sentCount: 10 } });
    const res = mkRes();
    const req = organizerReq({}); req.params = { saleId: 'sale_1' };
    await getSmsAudienceSummary(req, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload).toMatchObject({
      saleId: 'sale_1',
      eligibleCount: 1,
      noConsentCount: 2,
      pendingConfirmationCount: 1,
      dailyCap: 300,
      sentLast24h: 10,
      remainingToday: 290,
      messagePrefix: 'Maple Estate Co via FindA.Sale: ',
      messageSuffix: '\nReply STOP to opt out.',
      smsConfigured: true,
    });
    expect(payload.quietHours.allowedNow).toBe(true);
    expect(JSON.stringify(payload)).not.toMatch(/555/);
  });

  it('reports quiet hours as closed at 11 PM organizer time', async () => {
    jest.useRealTimers();
    useNow(ELEVEN_PM_EDT);
    const res = mkRes();
    const req = organizerReq({}); req.params = { saleId: 'sale_1' };
    await getSmsAudienceSummary(req, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.quietHours.allowedNow).toBe(false);
    expect(payload.quietHours.nextAllowedAt).toBeInstanceOf(Date);
  });

  it('403 for a sale that belongs to another organizer', async () => {
    mockSaleFindUnique.mockResolvedValue({ ...ownSale, organizerId: 'other' });
    const res = mkRes();
    const req = organizerReq({}); req.params = { saleId: 'sale_1' };
    await getSmsAudienceSummary(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('subscribeToSale (double opt-in consent)', () => {
  beforeEach(() => {
    mockSubFindUnique.mockResolvedValue(null);
    mockSubUpsert.mockImplementation(async (args: any) => ({ id: 'sub_1', saleId: 'sale_1', ...args.update }));
  });

  const confirmationBodies = () => mockTwilioCreate.mock.calls.map((c) => c[0].body);

  it('400 without a sale id, 404 for an unknown sale', async () => {
    let res = mkRes();
    await subscribeToSale(shopperReq({ phone: '(269) 555-1234', smsConsent: true }), res);
    expect(res.status).toHaveBeenCalledWith(400);

    mockSaleFindUnique.mockResolvedValue(null);
    res = mkRes();
    await subscribeToSale(shopperReq({ saleId: 'nope', email: 'a@b.com' }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockSubUpsert).not.toHaveBeenCalled();
  });

  it('a phone number without smsConsent is rejected', async () => {
    const res = mkRes();
    await subscribeToSale(shopperReq({ saleId: 'sale_1', phone: '(269) 555-1234' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].code).toBe('SMS_CONSENT_REQUIRED');
    expect(mockSubUpsert).not.toHaveBeenCalled();
    expect(mockTwilioCreate).not.toHaveBeenCalled();
  });

  it('an invalid number is rejected', async () => {
    const res = mkRes();
    await subscribeToSale(shopperReq({ saleId: 'sale_1', phone: '12345', smsConsent: true }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].code).toBe('INVALID_PHONE');
  });

  it('an invalid email is rejected', async () => {
    const res = mkRes();
    await subscribeToSale(shopperReq({ saleId: 'sale_1', email: 'not-an-email' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].code).toBe('INVALID_EMAIL');
  });

  it('stores E.164 as PENDING (no consent yet) with the evidence, and sends exactly one confirmation text', async () => {
    const res = mkRes();
    await subscribeToSale(shopperReq({ saleId: 'sale_1', phone: '(269) 555-1234', smsConsent: true }), res);

    const update = mockSubUpsert.mock.calls[0][0].update;
    expect(update.phone).toBe('+12695551234');
    expect(update.smsConsentAt).toBeNull(); // consent is only recorded when the number replies YES
    expect(update.smsConsentPendingAt).toEqual(NOON_EDT);
    expect(update.smsConsentSource).toBe('sale_page_double_opt_in_v2');
    expect(update.smsConsentVersion).toEqual(expect.any(String));
    expect(update.smsConsentUserAgent).toBe('jest-agent');

    expect(mockTwilioCreate).toHaveBeenCalledTimes(1);
    expect(mockTwilioCreate.mock.calls[0][0].to).toBe('+12695551234');
    expect(confirmationBodies()[0]).toBe(
      'Maple Estate Co via FindA.Sale: Reply YES to get text updates for Big Garage Sale. Msg&data rates may apply.\nReply STOP to opt out.'
    );
    // the confirmation is counted in the audit log like any other text
    expect(mockLogCreate.mock.calls[0][0].data).toMatchObject({ organizerId: 'org_1', saleId: 'sale_1', recipientCount: 1, sentCount: 1 });

    const payload = res.json.mock.calls[0][0];
    expect(payload.smsStatus).toBe('PENDING');
    expect(JSON.stringify(payload)).not.toMatch(/2695551234/); // never echoes the number
  });

  it('the confirmation text still goes out during quiet hours (it answers a request made seconds ago)', async () => {
    jest.useRealTimers();
    useNow(ELEVEN_PM_EDT);
    await subscribeToSale(shopperReq({ saleId: 'sale_1', phone: '(269) 555-1234', smsConsent: true }), mkRes());
    expect(mockTwilioCreate).toHaveBeenCalledTimes(1);
  });

  it('a number already confirmed on this sale is left alone: no new pending marker, no second text', async () => {
    const original = new Date('2026-09-01T10:00:00Z');
    mockSubFindUnique.mockResolvedValue({ id: 'sub_1', phone: '+12695551234', smsConsentAt: original, smsConsentPendingAt: null });
    const res = mkRes();
    await subscribeToSale(shopperReq({ saleId: 'sale_1', phone: '269-555-1234', smsConsent: true }), res);
    expect(mockSubUpsert.mock.calls[0][0].update).toEqual({}); // the original consent time is never rewritten
    expect(mockTwilioCreate).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].smsStatus).toBe('CONFIRMED');
  });

  it('a re-submit within the cooldown does not text again or extend the pending window', async () => {
    const oneMinuteAgo = new Date(NOON_EDT.getTime() - 60 * 1000);
    mockSubFindUnique.mockResolvedValue({ id: 'sub_1', phone: '+12695551234', smsConsentAt: null, smsConsentPendingAt: oneMinuteAgo });
    const res = mkRes();
    await subscribeToSale(shopperReq({ saleId: 'sale_1', phone: '(269) 555-1234', smsConsent: true }), res);
    expect(mockSubUpsert.mock.calls[0][0].update).toEqual({});
    expect(mockTwilioCreate).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].smsStatus).toBe('PENDING');
  });

  it('a number on the STOP list gets the same PENDING answer but is not stored or texted (no oracle)', async () => {
    mockOptOutFindMany.mockResolvedValue([{ phone: '+12695551234' }]);
    const res = mkRes();
    await subscribeToSale(shopperReq({ saleId: 'sale_1', phone: '(269) 555-1234', smsConsent: true }), res);
    expect(res.status).not.toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].smsStatus).toBe('PENDING');
    const update = mockSubUpsert.mock.calls[0][0].update;
    expect(update).not.toHaveProperty('phone');
    expect(update).not.toHaveProperty('smsConsentPendingAt');
    expect(mockTwilioCreate).not.toHaveBeenCalled();
  });

  it('a number that already received too many confirmation texts today is not stored or texted', async () => {
    mockSubCount.mockResolvedValue(3);
    const res = mkRes();
    await subscribeToSale(shopperReq({ saleId: 'sale_1', phone: '(269) 555-1234', smsConsent: true }), res);
    expect(res.json.mock.calls[0][0].smsStatus).toBe('PENDING');
    expect(mockSubUpsert.mock.calls[0][0].update).not.toHaveProperty('phone');
    expect(mockTwilioCreate).not.toHaveBeenCalled();
  });

  it('fails closed when the STOP list lookup fails: nothing stored, nothing sent, same PENDING answer', async () => {
    mockOptOutFindMany.mockRejectedValue(new Error('db down'));
    const res = mkRes();
    await subscribeToSale(shopperReq({ saleId: 'sale_1', phone: '(269) 555-1234', smsConsent: true }), res);
    expect(res.json.mock.calls[0][0].smsStatus).toBe('PENDING');
    expect(mockSubUpsert.mock.calls[0][0].update).not.toHaveProperty('phone');
    expect(mockTwilioCreate).not.toHaveBeenCalled();
  });

  it('phone: null clears the number and every consent field', async () => {
    const res = mkRes();
    await subscribeToSale(shopperReq({ saleId: 'sale_1', phone: null }), res);
    expect(mockSubUpsert.mock.calls[0][0].update).toEqual({
      phone: null,
      smsConsentAt: null,
      smsConsentSource: null,
      smsConsentPendingAt: null,
    });
    expect(res.json.mock.calls[0][0].smsStatus).toBe('OFF');
    expect(mockTwilioCreate).not.toHaveBeenCalled();
  });

  it('omitted fields are left unchanged (email-only call does not wipe the phone)', async () => {
    await subscribeToSale(shopperReq({ saleId: 'sale_1', email: 'A@B.com' }), mkRes());
    // the typed address is validated but IGNORED: the signed-in account's own email is stored instead
    expect(mockSubUpsert.mock.calls[0][0].update).toEqual({ email: 'account@example.com' });
    expect(mockTwilioCreate).not.toHaveBeenCalled();
  });

  it('a typed email that belongs to someone else is never stored (no third-party reminder injection)', async () => {
    mockUserFindUnique.mockResolvedValue({ email: 'me@example.com' });
    await subscribeToSale(shopperReq({ saleId: 'sale_1', email: 'victim@example.org' }), mkRes());
    expect(mockUserFindUnique.mock.calls[0][0].where).toEqual({ id: 'u_shopper' });
    const stored = mockSubUpsert.mock.calls[0][0].update;
    expect(stored).toEqual({ email: 'me@example.com' });
    expect(JSON.stringify(mockSubUpsert.mock.calls)).not.toMatch(/victim@example\.org/);
  });

  it('an account with no usable email stores no email at all', async () => {
    mockUserFindUnique.mockResolvedValue({ email: null });
    await subscribeToSale(shopperReq({ saleId: 'sale_1', email: 'victim@example.org' }), mkRes());
    expect(mockSubUpsert.mock.calls[0][0].update).toEqual({ email: null });
  });

  it('a phone already confirmed by another subscriber of the sale is neither a 409 nor a 500 (no oracle): caller data is kept, no phone stored, no text', async () => {
    mockSubUpsert
      .mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }))
      .mockImplementation(async (args: any) => ({ id: 'sub_1', saleId: 'sale_1', ...args.update }));
    const res = mkRes();
    await subscribeToSale(shopperReq({ saleId: 'sale_1', phone: '(269) 555-1234', smsConsent: true, email: 'a@b.com' }), res);
    expect(res.status).not.toHaveBeenCalled();
    expect(mockSubUpsert).toHaveBeenCalledTimes(2);
    const retryUpdate = mockSubUpsert.mock.calls[1][0].update;
    expect(retryUpdate).toEqual({ email: 'account@example.com' });
    expect(mockTwilioCreate).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].smsStatus).toBe('PENDING');
  });

  it('a failing confirmation text never changes the response', async () => {
    mockTwilioCreate.mockRejectedValue(new Error('boom'));
    const res = mkRes();
    await subscribeToSale(shopperReq({ saleId: 'sale_1', phone: '(269) 555-1234', smsConsent: true }), res);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].smsStatus).toBe('PENDING');
  });
});
