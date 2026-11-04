/**
 * safeUrl: safe hrefs for user-entered links and same-origin returnTo paths.
 * Run: npm test   (node:test through tsx)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { safeHref, safeReturnTo, UNTRUSTED_LINK_REL } from '../safeUrl';

test('safeHref keeps http and https URLs', () => {
  assert.equal(safeHref('https://example.com/shop'), 'https://example.com/shop');
  assert.equal(safeHref('  http://example.com  '), 'http://example.com');
});

test('safeHref drops script and data schemes', () => {
  for (const bad of [
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'mailto:a@b.c',
    '',
    null,
    undefined,
    42,
  ]) {
    assert.equal(safeHref(bad), null, String(bad));
  }
});

test('safeHref without a scheme is dropped unless assumeHttps is set', () => {
  assert.equal(safeHref('instagram.com/shop'), null);
  assert.equal(safeHref('instagram.com/shop', { assumeHttps: true }), 'https://instagram.com/shop');
  assert.equal(safeHref('javascript:alert(1)', { assumeHttps: true }), null);
});

test('safeReturnTo accepts same-origin relative paths only', () => {
  assert.equal(safeReturnTo('/organizer/dashboard', '/'), '/organizer/dashboard');
  assert.equal(safeReturnTo('/sales/abc?x=1#y', '/'), '/sales/abc?x=1#y');
  assert.equal(safeReturnTo(['/a', '/b'], '/'), '/a');
  for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', 'evil', '', undefined, '/\nfoo']) {
    assert.equal(safeReturnTo(bad, '/fallback'), '/fallback', String(bad));
  }
});

test('untrusted links carry nofollow', () => {
  assert.equal(UNTRUSTED_LINK_REL, 'noopener noreferrer nofollow');
});
