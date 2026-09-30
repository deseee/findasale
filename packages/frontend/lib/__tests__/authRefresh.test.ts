/**
 * Auth interceptor helpers (2026-09-30): single-flight refresh, transient-refresh retry, failure classification.
 * Run: npm test   (node:test through tsx, no extra dependencies)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTH_COPY,
  TransientRefreshError,
  classifyApiError,
  classifyRefreshError,
  createSingleFlight,
  readableSuspensionReason,
  refreshWithTransientRetry,
} from '../authRefresh';

const httpError = (status: number, data: Record<string, unknown> = {}) => ({ response: { status, data } });
const noSleep = async () => undefined;

test('classifyApiError: suspended 403 and deleted 401 are recognised, everything else is OTHER', () => {
  assert.equal(classifyApiError(httpError(403, { code: 'ACCOUNT_SUSPENDED' })), 'ACCOUNT_SUSPENDED');
  assert.equal(classifyApiError(httpError(401, { code: 'ACCOUNT_DELETED' })), 'ACCOUNT_DELETED');
  assert.equal(classifyApiError(httpError(401, {})), 'OTHER');
  assert.equal(classifyApiError(httpError(403, { code: 'TIER_REQUIRED' })), 'OTHER');
  assert.equal(classifyApiError(httpError(401, { code: 'ACCOUNT_SUSPENDED' })), 'OTHER');
  assert.equal(classifyApiError(null), 'OTHER');
  assert.equal(classifyApiError(undefined), 'OTHER');
});

test('classifyRefreshError: 503, 5xx and no response are transient; 401 and 403 end the session', () => {
  assert.equal(classifyRefreshError(httpError(503)), 'TRANSIENT');
  assert.equal(classifyRefreshError(httpError(500)), 'TRANSIENT');
  assert.equal(classifyRefreshError(new Error('Network Error')), 'TRANSIENT');
  assert.equal(classifyRefreshError(httpError(401)), 'SESSION_DEAD');
  assert.equal(classifyRefreshError(httpError(403)), 'SESSION_DEAD');
  assert.equal(classifyRefreshError(httpError(401, { code: 'ACCOUNT_DELETED' })), 'ACCOUNT_DELETED');
  assert.equal(classifyRefreshError(httpError(401, { code: 'ACCOUNT_SUSPENDED' })), 'ACCOUNT_SUSPENDED');
  assert.equal(classifyRefreshError(httpError(400)), 'OTHER');
});

test('single-flight: concurrent callers share ONE refresh call and the same result', async () => {
  let calls = 0;
  let release!: (v: string) => void;
  const gate = new Promise<string>((r) => { release = r; });
  const refresh = createSingleFlight(async () => { calls += 1; return gate; });
  const all = Promise.all([refresh(), refresh(), refresh(), refresh(), refresh()]);
  release('new-session');
  assert.deepEqual(await all, Array(5).fill('new-session'));
  assert.equal(calls, 1);
});

test('single-flight: the slot frees after success and after failure, so a later 401 refreshes again', async () => {
  let calls = 0;
  const refresh = createSingleFlight(async () => {
    calls += 1;
    if (calls === 2) throw new Error('boom');
    return calls;
  });
  assert.equal(await refresh(), 1);
  await assert.rejects(refresh(), /boom/);
  assert.equal(await refresh(), 3);
  assert.equal(calls, 3);
});

test('single-flight: concurrent callers all see the same failure, from one call', async () => {
  let calls = 0;
  const refresh = createSingleFlight(async () => { calls += 1; throw httpError(401); });
  const results = await Promise.allSettled([refresh(), refresh(), refresh()]);
  assert.equal(calls, 1);
  assert.ok(results.every((r) => r.status === 'rejected'));
});

test('refresh 503 is retried once after the delay and a success on the retry is returned', async () => {
  let calls = 0;
  const waits: number[] = [];
  const out = await refreshWithTransientRetry(
    async () => { calls += 1; if (calls === 1) throw httpError(503); return 'ok'; },
    { sleep: async (ms) => { waits.push(ms); } }
  );
  assert.equal(out, 'ok');
  assert.equal(calls, 2);
  assert.deepEqual(waits, [1000]);
});

test('refresh 503 twice throws TransientRefreshError after exactly two calls (caller must not log out)', async () => {
  let calls = 0;
  await assert.rejects(
    refreshWithTransientRetry(async () => { calls += 1; throw httpError(503); }, { sleep: noSleep }),
    (err: unknown) => err instanceof TransientRefreshError
  );
  assert.equal(calls, 2);
});

test('a network drop (no response) is treated like a 503', async () => {
  let calls = 0;
  await assert.rejects(
    refreshWithTransientRetry(async () => { calls += 1; throw new Error('Network Error'); }, { sleep: noSleep }),
    TransientRefreshError
  );
  assert.equal(calls, 2);
});

test('a 401 from refresh is NOT retried and is rethrown unchanged for the caller to log out', async () => {
  let calls = 0;
  const dead = httpError(401);
  await assert.rejects(
    refreshWithTransientRetry(async () => { calls += 1; throw dead; }, { sleep: noSleep }),
    (err: unknown) => err === dead
  );
  assert.equal(calls, 1);
});

test('a 503 followed by a 401 on the retry surfaces the 401 (session really ended)', async () => {
  let calls = 0;
  const dead = httpError(401);
  await assert.rejects(
    refreshWithTransientRetry(async () => { calls += 1; throw calls === 1 ? httpError(503) : dead; }, { sleep: noSleep }),
    (err: unknown) => err === dead
  );
  assert.equal(calls, 2);
});

test('single-flight over the retry wrapper: five concurrent 401s under a 503 outage make two refresh calls total', async () => {
  let calls = 0;
  const refresh = createSingleFlight(() =>
    refreshWithTransientRetry(async () => { calls += 1; throw httpError(503); }, { sleep: noSleep })
  );
  const results = await Promise.allSettled([refresh(), refresh(), refresh(), refresh(), refresh()]);
  assert.equal(calls, 2);
  assert.ok(results.every((r) => r.status === 'rejected' && r.reason instanceof TransientRefreshError));
});

test('readableSuspensionReason hides internal codes and oversize text, keeps plain sentences', () => {
  assert.equal(readableSuspensionReason('SERIAL_CHARGEBACKS'), null);
  assert.equal(readableSuspensionReason('ADMIN_ACTION'), null);
  assert.equal(readableSuspensionReason(''), null);
  assert.equal(readableSuspensionReason(undefined), null);
  assert.equal(readableSuspensionReason('x'.repeat(301)), null);
  assert.equal(readableSuspensionReason('  Repeated payment disputes  '), 'Repeated payment disputes');
});

test('user-facing auth copy has no em or en dashes and no banned words', () => {
  for (const v of Object.values(AUTH_COPY)) {
    assert.doesNotMatch(v, /[–—]/);
    assert.doesNotMatch(v, /estate sale/i);
    assert.doesNotMatch(v, /\bAI\b/);
  }
});
