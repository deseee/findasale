/**
 * Tests for the Etsy OAuth callback helpers and page (ADR-135 D1.5, batch E-B5).
 * Run: npm test   (node:test through tsx, no extra dependencies)
 *
 * Covers: the callback posts once (guard), reads the standard OAuth query, never puts `code` or `state`
 * in a redirect, only ever sends whitelisted banner keys back to Settings, and the page source has no
 * console calls and no storage writes (so `code` and `state` are never logged or persisted).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import {
  ETSY_CALLBACK_PATH,
  buildEtsySettingsRedirect,
  claimEtsyCallbackOnce,
  createOnceGuard,
  outcomeFromCallbackError,
  parseEtsyCallbackQuery,
} from '../etsyCallback';
import { ETSY_BANNER_MESSAGES } from '../etsyCopy';
import { resolveEtsyBannerKey } from '../etsyUiState';

const HERE = typeof __dirname !== 'undefined' ? __dirname : path.join(process.cwd(), 'lib', '__tests__');
const PAGE = path.resolve(HERE, '..', '..', 'pages', 'organizer', 'etsy-oauth-callback.tsx');

const SECRET_CODE = 'SECRETCODE-abc.123_xyz';
const SECRET_STATE = 'SECRETSTATE-def.456_uvw';

test('query: code and state are read from the standard OAuth redirect', () => {
  assert.deepEqual(parseEtsyCallbackQuery({ code: SECRET_CODE, state: SECRET_STATE }), { kind: 'code', code: SECRET_CODE, state: SECRET_STATE });
  assert.deepEqual(parseEtsyCallbackQuery({ code: [SECRET_CODE, 'second'], state: [SECRET_STATE] }), { kind: 'code', code: SECRET_CODE, state: SECRET_STATE });
});

test('query: an error from Etsy means the organizer declined, even if a code is also present', () => {
  assert.deepEqual(parseEtsyCallbackQuery({ error: 'access_denied', error_description: 'User denied' }), { kind: 'denied' });
  assert.deepEqual(parseEtsyCallbackQuery({ error: 'access_denied', code: SECRET_CODE, state: SECRET_STATE }), { kind: 'denied' });
});

test('query: missing or oversized values are "missing"', () => {
  for (const q of [{}, null, undefined, { code: SECRET_CODE }, { state: SECRET_STATE }, { code: '', state: '' }, { code: 'x'.repeat(5000), state: 's' }, { code: 5, state: 6 }]) {
    assert.deepEqual(parseEtsyCallbackQuery(q as Record<string, unknown> | null | undefined), { kind: 'missing' });
  }
});

test('the post happens once: a repeat effect run (React strict mode, remount) for the same state is refused', () => {
  const claim = createOnceGuard();
  let posts = 0;
  const effect = (state: string) => {
    if (!claim(state)) return;
    posts += 1;
  };
  effect(SECRET_STATE);
  effect(SECRET_STATE); // strict mode runs the effect a second time
  effect(SECRET_STATE);
  assert.equal(posts, 1);
  effect('a-fresh-state-from-a-new-connect-attempt'); // a later connection attempt is allowed
  assert.equal(posts, 2);
});

test('the shared guard behaves the same way and tolerates prototype-like keys', () => {
  const key = `guard-test-${Date.now()}`;
  assert.equal(claimEtsyCallbackOnce(key), true);
  assert.equal(claimEtsyCallbackOnce(key), false);
  assert.equal(claimEtsyCallbackOnce('constructor'), true);
  assert.equal(claimEtsyCallbackOnce('constructor'), false);
  assert.equal(claimEtsyCallbackOnce('__proto__'), true);
  assert.equal(claimEtsyCallbackOnce('__proto__'), false);
});

test('redirect: success and error go to the Etsy tab, with fixed keys only', () => {
  assert.equal(buildEtsySettingsRedirect({ ok: true }), '/organizer/settings?tab=etsy&etsy=connected');
  assert.equal(buildEtsySettingsRedirect({ ok: false, reason: 'ETSY_NO_SHOP' }), '/organizer/settings?tab=etsy&etsy=error&reason=ETSY_NO_SHOP');
  assert.equal(buildEtsySettingsRedirect({ ok: false, reason: 'denied' }), '/organizer/settings?tab=etsy&etsy=error&reason=denied');
  assert.equal(buildEtsySettingsRedirect({ ok: false, reason: 'missing' }), '/organizer/settings?tab=etsy&etsy=error&reason=missing');
});

test('redirect: never contains code or state, whatever the error carries', () => {
  const err = { response: { status: 400, data: { code: 'ETSY_CONNECT_FAILED', message: `bad ${SECRET_CODE} ${SECRET_STATE}` } }, config: { data: JSON.stringify({ code: SECRET_CODE, state: SECRET_STATE }) } };
  const target = buildEtsySettingsRedirect(outcomeFromCallbackError(err));
  assert.ok(!target.includes(SECRET_CODE));
  assert.ok(!target.includes(SECRET_STATE));
  assert.equal(target, '/organizer/settings?tab=etsy&etsy=error&reason=ETSY_CONNECT_FAILED');
});

test('errors from POST /api/etsy/callback map to whitelisted banner keys', () => {
  const e = (status: number, code?: string) => outcomeFromCallbackError({ response: { status, data: code ? { code } : {} } });
  assert.deepEqual(e(400, 'ETSY_CONNECT_FAILED'), { ok: false, reason: 'ETSY_CONNECT_FAILED' });
  assert.deepEqual(e(422, 'ETSY_NO_SHOP'), { ok: false, reason: 'ETSY_NO_SHOP' });
  assert.deepEqual(e(409, 'ETSY_SHOP_IN_USE'), { ok: false, reason: 'ETSY_SHOP_IN_USE' });
  assert.deepEqual(e(403, 'ETSY_NOT_ALLOWED'), { ok: false, reason: 'ETSY_NOT_ALLOWED' });
  assert.deepEqual(e(503, 'ETSY_DISABLED'), { ok: false, reason: 'ETSY_DISABLED' });
  assert.deepEqual(e(503, 'ETSY_NOT_CONFIGURED'), { ok: false, reason: 'ETSY_DISABLED' });
  assert.deepEqual(e(503, 'ETSY_BUSY'), { ok: false, reason: 'ETSY_BUSY' });
  assert.deepEqual(e(429), { ok: false, reason: 'ETSY_BUSY' });
  assert.deepEqual(e(500), { ok: false, reason: 'generic' });
  assert.deepEqual(e(400, 'connected'), { ok: false, reason: 'generic' });
  assert.deepEqual(e(400, 'constructor'), { ok: false, reason: 'generic' });
  assert.deepEqual(outcomeFromCallbackError(new Error('network down')), { ok: false, reason: 'generic' });
  assert.deepEqual(outcomeFromCallbackError(undefined), { ok: false, reason: 'generic' });
});

test('every redirect the page can produce is shown as a banner by the settings panel', () => {
  const reasons = Object.keys(ETSY_BANNER_MESSAGES).filter((k) => k !== 'connected');
  for (const reason of reasons) {
    const url = new URL(buildEtsySettingsRedirect({ ok: false, reason: reason as keyof typeof ETSY_BANNER_MESSAGES }), 'https://finda.sale');
    assert.equal(url.pathname, '/organizer/settings');
    assert.equal(url.searchParams.get('tab'), 'etsy');
    assert.equal(resolveEtsyBannerKey(url.searchParams.get('etsy'), url.searchParams.get('reason')), reason);
  }
  const ok = new URL(buildEtsySettingsRedirect({ ok: true }), 'https://finda.sale');
  assert.equal(resolveEtsyBannerKey(ok.searchParams.get('etsy'), ok.searchParams.get('reason')), 'connected');
});

test('callback path matches the redirect URI the backend registers (ADR-135 D1.3)', () => {
  assert.equal(ETSY_CALLBACK_PATH, '/organizer/etsy-oauth-callback');
  const auth = path.resolve(HERE, '..', '..', '..', 'backend', 'src', 'services', 'marketplace', 'etsyAuth.ts');
  if (fs.existsSync(auth)) assert.ok(fs.readFileSync(auth, 'utf8').includes('/organizer/etsy-oauth-callback'));
});

function pageCode(): string {
  const src = fs.readFileSync(PAGE, 'utf8');
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
}

test('page source: one API post, strict-mode guards, no console calls, no storage', () => {
  const code = pageCode();
  assert.equal((code.match(/\.post\(/g) ?? []).length, 1, 'exactly one POST');
  assert.ok(code.includes("'/etsy/callback'"));
  assert.ok(/startedRef\.current/.test(code), 'ref guard present');
  assert.ok(/claimEtsyCallbackOnce\(/.test(code), 'per-state guard present');
  assert.ok(!/console\./.test(code), 'the page must not log (an axios error can carry the code)');
  assert.ok(!/localStorage|sessionStorage|document\.cookie/.test(code), 'code and state stay in memory');
  assert.ok(!/window\.location\.(href|assign|replace)/.test(code), 'navigation goes through the router');
});

test('page source: the address bar is scrubbed before the post and the result goes to the settings tab', () => {
  const code = pageCode();
  const scrub = code.indexOf('router.replace(ETSY_CALLBACK_PATH');
  const post = code.indexOf('.post(');
  assert.ok(scrub > -1 && post > -1 && scrub < post, 'scrub the URL, then post');
  assert.ok(/buildEtsySettingsRedirect\(/.test(code));
});
