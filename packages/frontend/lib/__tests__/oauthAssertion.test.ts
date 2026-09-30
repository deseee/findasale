/**
 * Parity test: the frontend signer (lib/oauthAssertion.ts) must produce byte-identical output to the backend
 * signer (packages/backend/src/utils/oauthAssertion.ts). The backend algorithm is copied below verbatim as the
 * reference (the frontend package must not import from the backend package), and a pinned vector guards both.
 * Run: npm test   (node:test through tsx, no extra dependencies)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { signOAuthAssertion, maybeSignOAuthAssertion } from '../oauthAssertion';

// ---- reference copy of the backend algorithm (keep in step with the backend file) ----
const refNormalize = (e: unknown): string | null =>
  typeof e === 'string' && e.trim() ? e.trim().toLowerCase() : null;
const refB64u = (s: string | Buffer): string => Buffer.from(s).toString('base64url');
function refSign(
  fields: { provider: string; providerId: string; email?: string | null },
  secret: string,
  ttlSeconds: number,
  nowMs: number
): string {
  const payload = {
    p: fields.provider,
    i: fields.providerId,
    e: refNormalize(fields.email),
    x: Math.floor(nowMs / 1000) + ttlSeconds,
  };
  const body = refB64u(JSON.stringify(payload));
  return `${body}.${refB64u(crypto.createHmac('sha256', secret).update(body).digest())}`;
}
// ---------------------------------------------------------------------------------------

const SECRET = 'test-bridge-secret';
const NOW = 1_800_000_000_000;
const PINNED = 'eyJwIjoiZ29vZ2xlIiwiaSI6IjEyMzQ1Njc4OTAiLCJlIjoiYUBiLmNvIiwieCI6MTgwMDAwMDYwMH0.OChzTBVqzFJShbqq15jYLm0_iluHpiaSRxlHwTZhPeg';

test('matches the pinned vector', () => {
  assert.equal(
    signOAuthAssertion({ provider: 'google', providerId: '1234567890', email: '  A@B.co ' }, SECRET, 600, NOW),
    PINNED
  );
});

test('identical to the backend algorithm across inputs', () => {
  const cases = [
    { provider: 'google', providerId: '1', email: 'x@y.com' },
    { provider: 'facebook', providerId: '99999999999', email: 'Mixed.Case@Example.COM' },
    { provider: 'facebook', providerId: '42', email: null },
    { provider: 'google', providerId: '7', email: '' },
    { provider: 'google', providerId: 'ünï-çødé', email: undefined },
  ];
  for (const c of cases) {
    for (const ttl of [60, 600]) {
      assert.equal(signOAuthAssertion(c, SECRET, ttl, NOW), refSign(c, SECRET, ttl, NOW));
    }
  }
});

test('maybeSignOAuthAssertion is a no-op while the secret is unset', () => {
  assert.equal(maybeSignOAuthAssertion({ provider: 'google', providerId: '1', email: 'a@b.co' }, {} as NodeJS.ProcessEnv), undefined);
});

test('maybeSignOAuthAssertion signs when the secret is set and never returns the secret', () => {
  const out = maybeSignOAuthAssertion(
    { provider: 'google', providerId: '1', email: 'a@b.co' },
    { OAUTH_BRIDGE_SECRET: SECRET } as unknown as NodeJS.ProcessEnv
  );
  assert.ok(out && out.split('.').length === 2);
  assert.ok(!out!.includes(SECRET));
});
