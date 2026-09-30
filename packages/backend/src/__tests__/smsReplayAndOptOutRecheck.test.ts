/**
 * SMS leftovers (2026-09-29): (1) inbound webhook replay protection on MessageSid, (2) opt-out re-checked at send
 * time for every chunk of a batch. Prisma is an in-memory fake, Twilio and Redis helpers are mocks.
 */
let mockFake: any;
jest.mock('../lib/prisma', () => {
  mockFake = require('./__fixtures__/smsFakePrisma').makeFakePrisma();
  return { prisma: mockFake.prisma };
});
const mockRedisIsBlocked = jest.fn();
const mockRedisSetBlock = jest.fn();
jest.mock('../middleware/rateLimitShared', () => ({
  redisIsBlocked: (...a: unknown[]) => mockRedisIsBlocked(...a),
  redisSetBlock: (...a: unknown[]) => mockRedisSetBlock(...a),
}));
const mockCreate = jest.fn();
const mockValidateRequest = jest.fn();
class MockMessagingResponse {
  private parts: string[] = [];
  message(t: string) { this.parts.push(t); }
  toString() { return `<Response>${this.parts.map((p) => `<Message>${p}</Message>`).join('')}</Response>`; }
}
jest.mock('twilio', () => {
  const fn: any = jest.fn(() => ({ messages: { create: (...a: unknown[]) => mockCreate(...a) } }));
  fn.twiml = { MessagingResponse: MockMessagingResponse };
  fn.validateRequest = (...a: unknown[]) => mockValidateRequest(...a);
  return { __esModule: true, default: fn };
});

import { handleInboundSms, __resetInboundSidCache } from '../controllers/smsWebhookController';
import { sendCompliantSmsBatch, SMS_SEND_CONCURRENCY } from '../services/compliantSms';

const DAY_NOON = new Date('2026-09-30T15:00:00Z');
const consent = new Date('2026-09-01T00:00:00Z');

const call = async (body: Record<string, unknown>) => {
  const res: any = {
    statusCode: 0, body: '', headers: {} as Record<string, string>,
    status(c: number) { this.statusCode = c; return this; },
    type(t: string) { this.headers.type = t; return this; },
    send(b: string) { this.body = b; return this; },
  };
  await handleInboundSms({ body, headers: { 'x-twilio-signature': 'sig' }, protocol: 'https', originalUrl: '/api/notifications/sms-webhook', get: () => 'example.com' } as any, res);
  return res;
};
const seedSub = (over: Record<string, unknown> = {}) =>
  mockFake.prisma.saleSubscriber.insert({ saleId: 's1', userId: 'u1', phone: '+12695550142', smsConsentAt: new Date(), smsConsentPendingAt: null, ...over });

beforeEach(() => {
  mockFake.reset();
  __resetInboundSidCache();
  mockValidateRequest.mockReset().mockReturnValue(true);
  mockRedisIsBlocked.mockReset().mockResolvedValue(false);
  mockRedisSetBlock.mockReset().mockResolvedValue(undefined);
  mockCreate.mockReset().mockResolvedValue({ sid: 'SM1' });
  process.env.TWILIO_AUTH_TOKEN = 'token';
  process.env.TWILIO_ACCOUNT_SID = 'ACtest';
  process.env.TWILIO_PHONE_NUMBER = '+18885550100';
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('inbound webhook replay protection', () => {
  it('a replayed START cannot re-opt a number back in after it texted STOP', async () => {
    seedSub();
    const start = { From: '+12695550142', Body: 'START', MessageSid: 'SM' + 'a'.repeat(32) };
    expect((await call(start)).statusCode).toBe(200);
    expect((await call({ From: '+12695550142', Body: 'STOP', MessageSid: 'SM' + 'b'.repeat(32) })).statusCode).toBe(200);
    expect(mockFake.prisma.smsOptOut.rows).toHaveLength(1);
    // attacker replays the captured, validly signed START
    const replay = await call(start);
    expect(replay.statusCode).toBe(200);
    expect(replay.body).toBe('<Response></Response>');
    expect(mockFake.prisma.smsOptOut.rows).toHaveLength(1); // still opted out
  });

  it('marks the sid in Redis under the rl: prefix only after successful processing', async () => {
    const sid = 'SM' + 'c'.repeat(32);
    await call({ From: '+12695550142', Body: 'HELP', MessageSid: sid });
    expect(mockRedisIsBlocked).toHaveBeenCalledWith(`rl:sms-inbound-sid:${sid}`);
    expect(mockRedisSetBlock).toHaveBeenCalledWith(`rl:sms-inbound-sid:${sid}`, 7 * 24 * 3600);
  });

  it('honors a sid another instance already recorded in Redis', async () => {
    mockRedisIsBlocked.mockResolvedValue(true);
    seedSub();
    const res = await call({ From: '+12695550142', Body: 'STOP', MessageSid: 'SM' + 'd'.repeat(32) });
    expect(res.statusCode).toBe(200);
    expect(mockFake.prisma.smsOptOut.rows).toHaveLength(0); // not processed
  });

  it('does NOT mark the sid when processing fails, so a Twilio retry is processed', async () => {
    const sid = 'SM' + 'e'.repeat(32);
    mockFake.prisma.smsOptOut.upsert = async () => { throw new Error('db down'); };
    const failed = await call({ From: '+12695550142', Body: 'STOP', MessageSid: sid });
    expect(failed.statusCode).toBe(500);
    expect(mockRedisSetBlock).not.toHaveBeenCalled();
    // retry succeeds and is processed (no replay block)
    mockFake.reset();
    const retry = await call({ From: '+12695550142', Body: 'HELP', MessageSid: sid });
    expect(retry.statusCode).toBe(200);
    expect(retry.body).toContain('<Message>');
  });

  it('a message without a MessageSid is still processed (nothing to dedupe on)', async () => {
    const res = await call({ From: '+12695550142', Body: 'HELP' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<Message>');
    expect(mockRedisSetBlock).not.toHaveBeenCalled();
  });

  it('an invalid signature is rejected before any dedupe or processing', async () => {
    mockValidateRequest.mockReturnValue(false);
    const res = await call({ From: '+12695550142', Body: 'STOP', MessageSid: 'SM' + 'f'.repeat(32) });
    expect(res.statusCode).toBe(401);
    expect(mockRedisIsBlocked).not.toHaveBeenCalled();
  });
});

describe('batch send re-checks opt-out for every chunk', () => {
  const phone = (n: number) => `+1269555${String(1000 + n)}`;
  const items = (n: number) => Array.from({ length: n }, (_, i) => ({ to: phone(i + 1), message: 'Doors open at 8.', consentAt: consent }));
  const opts = {
    organizerId: 'org1', saleId: 's1', orgName: 'Oak Street', orgTimeZone: 'America/Chicago', orgTier: 'PRO', minTier: 'PRO' as const, now: DAY_NOON,
  };

  it('a STOP that lands while the first chunk is sending suppresses that person in a later chunk', async () => {
    const total = SMS_SEND_CONCURRENCY + 2;
    let inserted = false;
    mockCreate.mockImplementation(async () => {
      if (!inserted) {
        inserted = true;
        mockFake.prisma.smsOptOut.insert({ phone: phone(SMS_SEND_CONCURRENCY + 1) }); // first recipient of chunk 2
      }
      return { sid: 'SM' };
    });
    const r = await sendCompliantSmsBatch(items(total), opts as any);
    expect(r.sent).toBe(total - 1);
    expect(r.skippedOptedOut).toBe(1);
    const recipients = mockCreate.mock.calls.map((c) => c[0].to);
    expect(recipients).not.toContain(phone(SMS_SEND_CONCURRENCY + 1));
    expect(recipients).toContain(phone(SMS_SEND_CONCURRENCY + 2));
  });

  it('fails closed for a chunk when the re-check lookup errors: nothing in that chunk is sent', async () => {
    const total = SMS_SEND_CONCURRENCY + 3;
    let calls = 0;
    const realFindMany = mockFake.prisma.smsOptOut.findMany.bind(mockFake.prisma.smsOptOut);
    mockFake.prisma.smsOptOut.findMany = async (...a: unknown[]) => {
      calls++;
      if (calls >= 2) throw new Error('db blip'); // 1st = snapshot, 2nd = chunk re-check
      return realFindMany(...a);
    };
    const r = await sendCompliantSmsBatch(items(total), opts as any);
    expect(r.sent).toBe(SMS_SEND_CONCURRENCY);
    expect(r.failed).toBe(3);
    expect(mockCreate).toHaveBeenCalledTimes(SMS_SEND_CONCURRENCY);
  });
});
