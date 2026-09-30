/**
 * CSRF double-submit middleware: Twilio server-to-server callbacks are exempt (they carry no cookie,
 * Bearer token or CSRF header and authenticate with X-Twilio-Signature instead), while ordinary
 * cookie-session mutations still need a matching token. NOT EXECUTED when written (jest cannot run on
 * the authoring machine); CI is the first real run.
 */
import { validateCsrfToken, isCsrfExemptPath } from '../csrf';

const mkRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const mkReq = (path: string, headers: Record<string, string> = {}) =>
  ({ method: 'POST', path, headers } as any);

describe('validateCsrfToken', () => {
  it('lets Twilio voice callbacks through with no CSRF token', () => {
    for (const path of ['/api/twilio/voice-incoming', '/api/twilio/voice-recording-complete']) {
      const next = jest.fn();
      const res = mkRes();
      validateCsrfToken(mkReq(path), res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    }
  });

  it('does not exempt look-alike paths', () => {
    for (const path of ['/api/twilioevil/x', '/api/twilio', '/api/users/me/api/twilio']) {
      const next = jest.fn();
      const res = mkRes();
      validateCsrfToken(mkReq(path), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    }
  });

  it('still 403s a cookie-session mutation with no token', () => {
    const next = jest.fn();
    const res = mkRes();
    validateCsrfToken(mkReq('/api/items', { cookie: 'session=abc' }), res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts a matching cookie + header pair and a Bearer token', () => {
    const okNext = jest.fn();
    validateCsrfToken(mkReq('/api/items', { cookie: 'csrf-token=abc123', 'x-csrf-token': 'abc123' }), mkRes(), okNext);
    expect(okNext).toHaveBeenCalled();

    const bearerNext = jest.fn();
    validateCsrfToken(mkReq('/api/items', { authorization: 'Bearer t' }), mkRes(), bearerNext);
    expect(bearerNext).toHaveBeenCalled();
  });

  it('rejects a mismatched token pair', () => {
    const next = jest.fn();
    const res = mkRes();
    validateCsrfToken(mkReq('/api/items', { cookie: 'csrf-token=abc', 'x-csrf-token': 'zzz' }), res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('exact-path allowlist (no substring exemptions)', () => {
  const run = (path: string, headers: Record<string, string> = {}) => {
    const next = jest.fn();
    const res = mkRes();
    validateCsrfToken(mkReq(path, headers), res, next);
    return { next, res };
  };

  it('exempts the real signature-authenticated endpoints, with or without a trailing slash', () => {
    for (const path of ['/api/stripe/webhook', '/api/stripe/webhook/', '/api/billing/webhook', '/api/square/webhook', '/api/outreach/resend-webhook', '/api/shopper/waitlist/unsubscribe', '/api/internal/anything']) {
      expect(isCsrfExemptPath(path)).toBe(true);
      expect(run(path).next).toHaveBeenCalledTimes(1);
    }
  });

  it('does NOT exempt the TEAMS webhook CRUD or any path that merely contains "webhook"', () => {
    for (const path of ['/api/webhooks', '/api/webhooks/abc', '/api/items/x/webhook-anything', '/api/users/me/webhook', '/api/stripe/webhook/extra', '/api/stripe/webhooks']) {
      expect(isCsrfExemptPath(path)).toBe(false);
      const { next, res } = run(path, { cookie: 'accessToken=abc' });
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    }
  });

  it('exempts only the unauthenticated login-flow paths; authenticated OAuth mutations need CSRF', () => {
    for (const path of ['/api/auth/login', '/api/auth/register', '/api/auth/oauth', '/api/auth/refresh']) expect(isCsrfExemptPath(path)).toBe(true);
    for (const path of ['/api/auth/oauth/link', '/api/auth/oauth-verify-age', '/api/auth/login/extra', '/api/auth/me']) expect(isCsrfExemptPath(path)).toBe(false);
  });
});

describe('Bearer + cookie rule', () => {
  const run = (headers: Record<string, string>) => {
    const next = jest.fn();
    const res = mkRes();
    validateCsrfToken(mkReq('/api/items', headers), res, next);
    return { next, res };
  };

  it('a pure Bearer request (no session cookie) skips the double-submit check', () => {
    expect(run({ authorization: 'Bearer t' }).next).toHaveBeenCalledTimes(1);
  });

  it('a Bearer header cannot bypass CSRF when a session cookie is also present', () => {
    for (const cookie of ['accessToken=abc', 'refreshToken=abc', 'theme=dark; accessToken=abc']) {
      const { next, res } = run({ authorization: 'Bearer forged', cookie });
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    }
  });

  it('Bearer plus session cookie still passes with a matching double-submit pair', () => {
    const { next } = run({ authorization: 'Bearer t', cookie: 'accessToken=abc; csrf-token=zz', 'x-csrf-token': 'zz' });
    expect(next).toHaveBeenCalledTimes(1);
  });
});
