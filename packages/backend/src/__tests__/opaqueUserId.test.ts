/**
 * utils/opaqueUserId (2026-09-29): the opaque public user id shared by the Hall of Fame, crews and the
 * Collector's League. Must match the scheme getHallOfFame introduced, be stable, and resolve only
 * against a caller-supplied candidate set.
 */
import crypto from 'crypto';
import { opaqueUserId, isOpaqueUserId, resolveUserRef, OPAQUE_USER_ID_PREFIX } from '../utils/opaqueUserId';

describe('opaqueUserId', () => {
  const original = process.env.JWT_SECRET;
  afterEach(() => {
    if (original === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = original;
  });

  it('is exactly the getHallOfFame scheme: hof_ + 20 hex chars of HMAC-SHA256(JWT_SECRET, userId)', () => {
    process.env.JWT_SECRET = 'test-secret';
    const expected = 'hof_' + crypto.createHmac('sha256', 'test-secret').update('user-1').digest('hex').slice(0, 20);
    expect(opaqueUserId('user-1')).toBe(expected);
    expect(opaqueUserId('user-1').startsWith(OPAQUE_USER_ID_PREFIX)).toBe(true);
  });

  it('falls back to the same default secret as getHallOfFame when JWT_SECRET is unset', () => {
    delete process.env.JWT_SECRET;
    const expected = 'hof_' + crypto.createHmac('sha256', 'hall-of-fame').update('user-1').digest('hex').slice(0, 20);
    expect(opaqueUserId('user-1')).toBe(expected);
  });

  describe('production without JWT_SECRET fails closed (the public dev fallback is never used)', () => {
    const originalEnv = process.env.NODE_ENV;
    afterEach(() => {
      if (originalEnv === undefined) delete (process.env as Record<string, string | undefined>).NODE_ENV;
      else (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
    });

    it('throws at first use when NODE_ENV=production and JWT_SECRET is unset or empty', () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      delete process.env.JWT_SECRET;
      expect(() => opaqueUserId('user-1')).toThrow(/JWT_SECRET/);
      process.env.JWT_SECRET = '';
      expect(() => opaqueUserId('user-1')).toThrow(/JWT_SECRET/);
    });

    it('does not throw at import or for resolveUserRef inputs that need no hashing', () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      delete process.env.JWT_SECRET;
      expect(resolveUserRef('', ['u1'])).toBeNull(); // empty ref returns before any hashing
      expect(resolveUserRef('u1', ['u1'])).toBe('u1'); // exact real-id match short-circuits
    });

    it('works normally in production when JWT_SECRET is set (the production key, not the fallback)', () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      process.env.JWT_SECRET = 'prod-secret';
      const expected = 'hof_' + crypto.createHmac('sha256', 'prod-secret').update('user-1').digest('hex').slice(0, 20);
      expect(opaqueUserId('user-1')).toBe(expected);
      expect(opaqueUserId('user-1')).not.toBe('hof_' + crypto.createHmac('sha256', 'hall-of-fame').update('user-1').digest('hex').slice(0, 20));
    });

    it('keeps the dev fallback outside production (development and test)', () => {
      for (const env of ['development', 'test', undefined]) {
        if (env === undefined) delete (process.env as Record<string, string | undefined>).NODE_ENV;
        else (process.env as Record<string, string | undefined>).NODE_ENV = env;
        delete process.env.JWT_SECRET;
        expect(opaqueUserId('user-1')).toBe('hof_' + crypto.createHmac('sha256', 'hall-of-fame').update('user-1').digest('hex').slice(0, 20));
      }
    });
  });

  it('is stable per user, differs between users, and never contains the real id', () => {
    process.env.JWT_SECRET = 'test-secret';
    expect(opaqueUserId('user-1')).toBe(opaqueUserId('user-1'));
    expect(opaqueUserId('user-1')).not.toBe(opaqueUserId('user-2'));
    expect(opaqueUserId('user-1')).not.toContain('user-1');
  });

  it('isOpaqueUserId recognises the shape only', () => {
    process.env.JWT_SECRET = 'test-secret';
    expect(isOpaqueUserId(opaqueUserId('u1'))).toBe(true);
    expect(isOpaqueUserId('hof_short')).toBe(false);
    expect(isOpaqueUserId('u1')).toBe(false);
    expect(isOpaqueUserId(undefined)).toBe(false);
  });

  it('resolveUserRef resolves an opaque or real id, but only inside the candidate set', () => {
    process.env.JWT_SECRET = 'test-secret';
    const members = ['u1', 'u2', 'u3'];
    expect(resolveUserRef(opaqueUserId('u2'), members)).toBe('u2');
    expect(resolveUserRef('u3', members)).toBe('u3');
    expect(resolveUserRef(opaqueUserId('outsider'), members)).toBeNull();
    expect(resolveUserRef('outsider', members)).toBeNull();
    expect(resolveUserRef('', members)).toBeNull();
    expect(resolveUserRef(42, members)).toBeNull();
  });
});
