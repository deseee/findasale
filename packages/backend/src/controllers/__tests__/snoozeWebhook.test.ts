/**
 * MailerLite unsubscribe webhook signature verification (2026-09-29).
 * NOT EXECUTED when written (jest cannot run on the authoring device); CI is the first real run.
 */
const mockSnooze = jest.fn();
jest.mock('../../services/snoozeService', () => ({
  snoozeSubscriber: (...a: any[]) => mockSnooze(...a),
  checkAndReactivateSnoozes: jest.fn(),
  reactivateSubscriber: jest.fn(),
}));

import crypto from 'crypto';
import { handleMailerLiteWebhook, verifyMailerLiteSignature, extractWebhookEmail } from '../snoozeController';

const SECRET = 'ml_secret';
const sign = (payload: string | Buffer) => crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
const mkRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const payloadObj = { event: 'subscriber.unsubscribed', email: 'jane@example.com', fields: { name: 'José / Co' } };

const OLD = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  process.env.MAILERLITE_WEBHOOK_SECRET = SECRET;
});
afterEach(() => {
  jest.restoreAllMocks();
  process.env = { ...OLD };
});

describe('verifyMailerLiteSignature', () => {
  it('accepts an HMAC over the exact raw bytes', () => {
    const raw = Buffer.from('{ "email" : "jane@example.com" }');
    expect(verifyMailerLiteSignature(raw, sign(raw), SECRET)).toBe(true);
  });
  it('rejects a wrong secret, tampered body or missing signature', () => {
    const raw = Buffer.from('{"email":"a@b.com"}');
    expect(verifyMailerLiteSignature(raw, sign(Buffer.from('{"email":"x@y.com"}')), SECRET)).toBe(false);
    expect(verifyMailerLiteSignature(raw, crypto.createHmac('sha256', 'other').update(raw).digest('hex'), SECRET)).toBe(false);
    expect(verifyMailerLiteSignature(raw, undefined, SECRET)).toBe(false);
    expect(verifyMailerLiteSignature(raw, '', SECRET)).toBe(false);
  });
  it('parsed-body fallback accepts PHP-style serialization (escaped slashes / unicode)', () => {
    const plain = JSON.stringify(payloadObj);
    expect(verifyMailerLiteSignature(payloadObj, sign(plain), SECRET)).toBe(true);
    const phpStyle = plain.replace(/\//g, '\\/').replace(/[\u0080-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
    expect(verifyMailerLiteSignature(payloadObj, sign(phpStyle), SECRET)).toBe(true);
  });
  it('parsed-body fallback still rejects a forged signature', () => {
    expect(verifyMailerLiteSignature(payloadObj, 'deadbeef', SECRET)).toBe(false);
  });
});

describe('extractWebhookEmail', () => {
  it('finds the address in the payload shapes MailerLite uses', () => {
    expect(extractWebhookEmail({ data: { email: 'a@b.com' } })).toBe('a@b.com');
    expect(extractWebhookEmail({ email: 'a@b.com' })).toBe('a@b.com');
    expect(extractWebhookEmail({ events: [{ data: { subscriber: { email: 'a@b.com' } } }] })).toBe('a@b.com');
    expect(extractWebhookEmail({})).toBeNull();
  });
});

describe('handleMailerLiteWebhook', () => {
  it('401 and no snooze for a missing or invalid signature', async () => {
    let res = mkRes();
    await handleMailerLiteWebhook({ headers: {}, body: payloadObj }, res);
    expect(res.status).toHaveBeenCalledWith(401);
    res = mkRes();
    await handleMailerLiteWebhook({ headers: { signature: 'nope' }, body: payloadObj }, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockSnooze).not.toHaveBeenCalled();
  });

  it('applies the snooze for a correctly signed request (raw Buffer body)', async () => {
    const raw = Buffer.from(JSON.stringify(payloadObj));
    const res = mkRes();
    await handleMailerLiteWebhook({ headers: { signature: sign(raw) }, body: raw }, res);
    expect(mockSnooze).toHaveBeenCalledWith('jane@example.com', 30);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies the snooze for a correctly signed request (already-parsed body)', async () => {
    const res = mkRes();
    await handleMailerLiteWebhook({ headers: { signature: sign(JSON.stringify(payloadObj)) }, body: payloadObj }, res);
    expect(mockSnooze).toHaveBeenCalledWith('jane@example.com', 30);
  });

  it('acknowledges but ignores non-unsubscribe events', async () => {
    const body = { event: 'subscriber.created', email: 'jane@example.com' };
    const res = mkRes();
    await handleMailerLiteWebhook({ headers: { signature: sign(JSON.stringify(body)) }, body }, res);
    expect(mockSnooze).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('fails closed in production when the secret is not configured', async () => {
    delete process.env.MAILERLITE_WEBHOOK_SECRET;
    (process.env as any).NODE_ENV = 'production';
    const res = mkRes();
    await handleMailerLiteWebhook({ headers: {}, body: payloadObj }, res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(mockSnooze).not.toHaveBeenCalled();
  });

  it('outside production a missing secret only warns (local development)', async () => {
    delete process.env.MAILERLITE_WEBHOOK_SECRET;
    (process.env as any).NODE_ENV = 'test';
    const res = mkRes();
    await handleMailerLiteWebhook({ headers: {}, body: payloadObj }, res);
    expect(mockSnooze).toHaveBeenCalled();
  });
});
