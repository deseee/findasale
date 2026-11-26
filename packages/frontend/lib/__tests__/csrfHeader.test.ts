/**
 * csrfHeader: x-csrf-token for raw fetch() calls made while session cookies are present
 * (OAuth listing claim in _app.tsx, invite redeem in auth/oauth-callback.tsx).
 * Run: npm test   (node:test through tsx)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CSRF_HEADER_NAME, csrfHeaders, readCsrfToken } from '../csrfHeader';

test('reads the token among other cookies', () => {
  assert.equal(readCsrfToken('a=1; csrf-token=abc123; accessToken=zzz'), 'abc123');
  assert.equal(readCsrfToken('csrf-token=abc123'), 'abc123');
});

test('keeps an = inside the value', () => {
  assert.equal(readCsrfToken('csrf-token=ab=c'), 'ab=c');
});

test('does not match a cookie whose name only ends in csrf-token', () => {
  assert.equal(readCsrfToken('x-csrf-token=nope; other=1'), undefined);
});

test('absent or empty cookie gives no token', () => {
  assert.equal(readCsrfToken(''), undefined);
  assert.equal(readCsrfToken(undefined), undefined);
  assert.equal(readCsrfToken(null), undefined);
  assert.equal(readCsrfToken('csrf-token='), undefined);
});

test('csrfHeaders adds the header only when a token exists', () => {
  assert.deepEqual(csrfHeaders('csrf-token=t0k; refreshToken=r'), { [CSRF_HEADER_NAME]: 't0k' });
  assert.deepEqual(csrfHeaders('refreshToken=r'), {});
  assert.deepEqual(csrfHeaders(null), {});
});

test('csrfHeaders with no argument and no document returns {}', () => {
  assert.deepEqual(csrfHeaders(), {});
});
