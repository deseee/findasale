import {
  isSameOriginRedirect,
  checkAdultDob,
  passwordProblem,
  normalizeEmailInput,
  stripSensitiveUserFields,
} from '../utils/authSecurity';
import {
  signOAuthAssertion,
  verifyOAuthAssertion,
  enforceOAuthAssertion,
  __resetOAuthAssertionWarning,
} from '../utils/oauthAssertion';

describe('isSameOriginRedirect', () => {
  const FE = 'https://finda.sale';
  it('accepts no redirect and same-origin URLs', () => {
    expect(isSameOriginRedirect(undefined, FE)).toBe(true);
    expect(isSameOriginRedirect(null, FE)).toBe(true);
    expect(isSameOriginRedirect('', FE)).toBe(true);
    expect(isSameOriginRedirect('https://finda.sale', FE)).toBe(true);
    expect(isSameOriginRedirect('https://finda.sale/organizer/dashboard?x=1#y', FE)).toBe(true);
    expect(isSameOriginRedirect('http://localhost:3000/browse', 'http://localhost:3000')).toBe(true);
  });
  it('rejects the startsWith bypasses that the old check let through', () => {
    for (const bad of [
      'https://finda.sale.evil.com',
      'https://finda.sale.evil.com/browse',
      'https://finda.sale@evil.com/x',
      'https://finda.saleevil.com',
      'https://evil.com/?https://finda.sale',
      'https://finda.sale:8443/browse',
      'http://finda.sale/browse',
      'https://finda.sale\\@evil.com',
      '//evil.com',
      '/browse',
      'javascript:alert(1)',
      'data:text/html,hi',
      'https://user:pw@finda.sale/',
      'https://finda.sale/\n@evil.com',
    ]) {
      expect(isSameOriginRedirect(bad, FE)).toBe(false);
    }
    expect(isSameOriginRedirect({ toString: () => 'https://finda.sale' } as any, FE)).toBe(false);
    expect(isSameOriginRedirect(['https://finda.sale'] as any, FE)).toBe(false);
  });
  it('rejects everything when FRONTEND_URL itself is unparseable', () => {
    expect(isSameOriginRedirect('https://finda.sale', 'not a url')).toBe(false);
  });
});

describe('checkAdultDob', () => {
  const NOW = new Date('2026-09-29T12:00:00Z');
  it('accepts adults and rejects minors by calendar birthday', () => {
    expect(checkAdultDob('1990-05-01', NOW)).toBe('ok');
    expect(checkAdultDob('2008-09-29', NOW)).toBe('ok'); // turns 18 today
    expect(checkAdultDob('2008-09-30', NOW)).toBe('minor'); // tomorrow
    expect(checkAdultDob('2015-01-01', NOW)).toBe('minor');
  });
  it('rejects unparseable, future, implausible and non-date values (NaN used to pass)', () => {
    for (const bad of ['abc', 'not-a-date', '', '   ', '2999-01-01', '1800-01-01', null, undefined, {}, [], true, NaN]) {
      expect(checkAdultDob(bad as any, NOW)).toBe('invalid');
    }
  });
});

describe('passwordProblem', () => {
  it('requires a string of 8 to 128 characters', () => {
    expect(passwordProblem('12345678')).toBeNull();
    expect(passwordProblem('a'.repeat(128))).toBeNull();
    expect(passwordProblem('short')).toMatch(/at least 8/);
    expect(passwordProblem('a'.repeat(129))).toMatch(/at most 128/);
    for (const bad of [undefined, null, 12345678, {}, ['12345678']]) {
      expect(passwordProblem(bad as any)).toMatch(/required/);
    }
  });
});

describe('normalizeEmailInput', () => {
  it('trims and lowercases strings, returns undefined for anything else', () => {
    expect(normalizeEmailInput('  Alice@Example.COM ')).toBe('alice@example.com');
    for (const bad of [undefined, null, '', '   ', 5, {}, ['a@b.c']]) expect(normalizeEmailInput(bad as any)).toBeUndefined();
  });
});

describe('stripSensitiveUserFields', () => {
  it('removes credentials and internal columns but keeps everything else, without mutating the input', () => {
    const user = {
      id: 'u1', email: 'a@b.c', name: 'A', role: 'USER', oauthProvider: 'google',
      password: 'hash', resetToken: 'r', resetTokenExpiry: new Date(), emailVerificationToken: 'v',
      emailVerificationTokenExpiry: new Date(), deviceFingerprint: 'fp', fraudSuspect: true,
    };
    const out = stripSensitiveUserFields(user) as Record<string, unknown>;
    expect(out).toEqual({ id: 'u1', email: 'a@b.c', name: 'A', role: 'USER', oauthProvider: 'google' });
    expect(user.password).toBe('hash');
  });
});

describe('oauth assertion', () => {
  const SECRET = 'unit-test-bridge-secret';
  const fields = { provider: 'google', providerId: '1234567890', email: 'Alice@Example.com' };
  const NOW = 1_800_000_000_000;

  it('round-trips and treats the email case-insensitively', () => {
    const a = signOAuthAssertion(fields, SECRET, 600, NOW);
    expect(verifyOAuthAssertion(a, { ...fields, email: 'alice@example.com' }, SECRET, NOW + 1000)).toEqual({ ok: true });
  });
  it('rejects a changed provider, providerId or email', () => {
    const a = signOAuthAssertion(fields, SECRET, 600, NOW);
    expect(verifyOAuthAssertion(a, { ...fields, providerId: '999' }, SECRET, NOW)).toEqual({ ok: false, reason: 'mismatch' });
    expect(verifyOAuthAssertion(a, { ...fields, provider: 'facebook' }, SECRET, NOW)).toEqual({ ok: false, reason: 'mismatch' });
    expect(verifyOAuthAssertion(a, { ...fields, email: 'victim@example.com' }, SECRET, NOW)).toEqual({ ok: false, reason: 'mismatch' });
    expect(verifyOAuthAssertion(a, { ...fields, email: null }, SECRET, NOW)).toEqual({ ok: false, reason: 'mismatch' });
  });
  it('rejects an expired assertion, a wrong secret, a tampered payload and garbage', () => {
    const a = signOAuthAssertion(fields, SECRET, 600, NOW);
    expect(verifyOAuthAssertion(a, fields, SECRET, NOW + 601_000)).toEqual({ ok: false, reason: 'expired' });
    expect(verifyOAuthAssertion(a, fields, 'other-secret', NOW)).toEqual({ ok: false, reason: 'bad_signature' });
    const [body, sig] = a.split('.');
    const forged = Buffer.from(JSON.stringify({ p: 'google', i: '1', e: null, x: 9_999_999_999 })).toString('base64url');
    expect(verifyOAuthAssertion(`${forged}.${sig}`, fields, SECRET, NOW)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(verifyOAuthAssertion(`${body}.`, fields, SECRET, NOW)).toEqual({ ok: false, reason: 'malformed' });
    expect(verifyOAuthAssertion('nodot', fields, SECRET, NOW)).toEqual({ ok: false, reason: 'malformed' });
    for (const bad of [undefined, null, 5, {}, '']) {
      expect(verifyOAuthAssertion(bad as any, fields, SECRET, NOW).ok).toBe(false);
    }
  });
  it('enforceOAuthAssertion: legacy pass-through with a one-time warning when no secret, strict when set', () => {
    __resetOAuthAssertionWarning();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(enforceOAuthAssertion(undefined, fields, {} as any, NOW)).toBeNull();
    expect(enforceOAuthAssertion(undefined, fields, {} as any, NOW)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();

    const env = { OAUTH_BRIDGE_SECRET: SECRET } as any;
    expect(enforceOAuthAssertion(undefined, fields, env, NOW)).toBe('missing');
    const a = signOAuthAssertion(fields, SECRET, 600, NOW);
    expect(enforceOAuthAssertion(a, fields, env, NOW)).toBeNull();
    expect(enforceOAuthAssertion(a, { ...fields, providerId: 'x' }, env, NOW)).toBe('mismatch');
  });
});
