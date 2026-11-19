/**
 * salePage: /sales/[id] getStaticProps guards (2026-11-19, GSC 404 cleanup).
 * Run: npm test   (node:test through tsx)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidSaleId, goneSaleRedirectPath } from '../seo/salePage';

test('isValidSaleId accepts real cuid sale ids', () => {
  assert.equal(isValidSaleId('cmqf14g6x00t9bo1nibst4yk7'), true);
  assert.equal(isValidSaleId('cmwlx4i0f27g0wj9b9m3d0k0h'), true);
});

test('isValidSaleId rejects truncated, malformed and non-string ids without throwing', () => {
  for (const bad of ['', 'c', 'cm', 'cmopy9qwz006bjp2zwp', '[id]', '%5Bslug%5D', 'CMQF14G6X00T9BO1NIBST4YK7',
    'cmqf14g6x00t9bo1nibst4yk7=', '..%2Fadmin', 'cmqf14g6x00t9bo1nibst4yk7/extra', 'a'.repeat(31),
    'cmqf14g6x00t9bo1n\uD83Dst4yk7', '\uDC00'.repeat(25), 'cmqf14g6x00t9bo1nibst4yk7\n']) {
    assert.equal(isValidSaleId(bad), false, JSON.stringify(bad));
  }
  for (const bad of [undefined, null, 42, ['cmqf14g6x00t9bo1nibst4yk7'], {}]) {
    assert.equal(isValidSaleId(bad), false);
  }
});

test('a lone surrogate is rejected before it can reach encodeURIComponent', () => {
  const id = 'cmqf14g6x00t9bo1nibst4yk' + '\uD800';
  assert.throws(() => encodeURIComponent(id), URIError);
  assert.doesNotThrow(() => isValidSaleId(id));
  assert.equal(isValidSaleId(id), false);
});

test('goneSaleRedirectPath turns a SALE_GONE body with a valid slug into the city path', () => {
  assert.equal(goneSaleRedirectPath({ code: 'SALE_GONE', citySlug: 'grand-rapids-mi' }), '/city/grand-rapids-mi');
});

test('goneSaleRedirectPath returns null without a usable slug or code', () => {
  assert.equal(goneSaleRedirectPath({ code: 'SALE_GONE', citySlug: null }), null);
  assert.equal(goneSaleRedirectPath({ code: 'SALE_GONE' }), null);
  assert.equal(goneSaleRedirectPath({ code: 'SALE_GONE', citySlug: 'https://evil.example/x' }), null);
  assert.equal(goneSaleRedirectPath({ code: 'SALE_GONE', citySlug: '../admin-mi' }), null);
  assert.equal(goneSaleRedirectPath({ code: 'SALE_GONE', citySlug: 'Grand-Rapids-MI' }), null);
  assert.equal(goneSaleRedirectPath({ code: 'SALE_NOT_PUBLIC', citySlug: 'grand-rapids-mi' }), null);
  assert.equal(goneSaleRedirectPath(null), null);
  assert.equal(goneSaleRedirectPath('SALE_GONE'), null);
});
