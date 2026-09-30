/**
 * Inbound Twilio SMS webhook: STOP / START / HELP (2026-09-29).
 * NOT EXECUTED when written (jest cannot run on the authoring device); CI is the first real run.
 */
const mockOptOutUpsert = jest.fn();
const mockOptOutDeleteMany = jest.fn();

jest.mock('../../lib/prisma', () => ({
  prisma: {
    smsOptOut: {
      upsert: (...a: any[]) => mockOptOutUpsert(...a),
      deleteMany: (...a: any[]) => mockOptOutDeleteMany(...a),
      findMany: jest.fn(),
    },
  },
}));

import twilio from 'twilio';
import { handleInboundSms } from '../smsWebhookController';

const TOKEN = 'webhook_test_token';
const PATH = '/api/notifications/sms-webhook';
const URL = `https://api.example.com${PATH}`;

const mkRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.type = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

const signedReq = (body: Record<string, string>, signature?: string) =>
  ({
    headers: { 'x-twilio-signature': signature ?? twilio.getExpectedTwilioSignature(TOKEN, URL, body) },
    protocol: 'https',
    get: () => 'api.example.com',
    originalUrl: PATH,
    body,
  }) as any;

const OLD = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  process.env.TWILIO_AUTH_TOKEN = TOKEN;
  delete process.env.TWILIO_WEBHOOK_BASE_URL;
});
afterEach(() => {
  jest.restoreAllMocks();
  process.env = { ...OLD };
});

describe('handleInboundSms', () => {
  it('401 and no database write for an unsigned or wrongly signed request', async () => {
    const res = mkRes();
    await handleInboundSms(signedReq({ From: '+12695551234', Body: 'STOP' }, 'forged'), res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockOptOutUpsert).not.toHaveBeenCalled();
  });

  it('401 when the auth token is not configured (fail closed)', async () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    const res = mkRes();
    await handleInboundSms(signedReq({ From: '+12695551234', Body: 'STOP' }, 'anything'), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it.each(['STOP', 'stop', 'Unsubscribe', 'END'])('%s adds the sender to the suppression list', async (word) => {
    const res = mkRes();
    await handleInboundSms(signedReq({ From: '+12695551234', Body: word }), res);
    expect(mockOptOutUpsert).toHaveBeenCalledTimes(1);
    expect(mockOptOutUpsert.mock.calls[0][0].where).toEqual({ phone: '+12695551234' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send.mock.calls[0][0]).toContain('<Response');
    expect(res.send.mock.calls[0][0]).not.toContain('<Message');
  });

  it('START removes the sender from the suppression list', async () => {
    const res = mkRes();
    await handleInboundSms(signedReq({ From: '+12695551234', Body: 'START' }), res);
    expect(mockOptOutDeleteMany).toHaveBeenCalledWith({ where: { phone: '+12695551234' } });
    expect(mockOptOutUpsert).not.toHaveBeenCalled();
  });

  it('HELP replies with program info and the STOP instruction, without changing any record', async () => {
    const res = mkRes();
    await handleInboundSms(signedReq({ From: '+12695551234', Body: 'HELP' }), res);
    const xml = res.send.mock.calls[0][0] as string;
    expect(xml).toContain('<Message>');
    expect(xml).toContain('Reply STOP to opt out');
    expect(mockOptOutUpsert).not.toHaveBeenCalled();
    expect(mockOptOutDeleteMany).not.toHaveBeenCalled();
  });

  it('ordinary replies are acknowledged silently', async () => {
    const res = mkRes();
    await handleInboundSms(signedReq({ From: '+12695551234', Body: 'see you there!' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send.mock.calls[0][0]).not.toContain('<Message');
    expect(mockOptOutUpsert).not.toHaveBeenCalled();
  });

  it('formats a US number typed without +1 the same way sends do', async () => {
    const res = mkRes();
    await handleInboundSms(signedReq({ From: '12695551234', Body: 'STOP' }), res);
    expect(mockOptOutUpsert.mock.calls[0][0].where).toEqual({ phone: '+12695551234' });
  });

  it('500 when the database write fails so the failure is visible', async () => {
    mockOptOutUpsert.mockRejectedValue(new Error('db down'));
    const res = mkRes();
    await handleInboundSms(signedReq({ From: '+12695551234', Body: 'STOP' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
