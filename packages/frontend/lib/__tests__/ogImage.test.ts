/**
 * ogImage: OG image URLs must build for any sale title, including emoji on the truncation cut.
 * Run: npm test   (node:test through tsx)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateItemOGImage, generateSaleOGImage, truncateText } from '../ogImage';

test('truncateText never splits an emoji and drops lone surrogates', () => {
  assert.equal(truncateText('ab\u{1F3E1}cd', 3), 'ab\u{1F3E1}');
  assert.equal(truncateText('a\uD83Cb', 5), 'ab');
  assert.equal(truncateText('plain title', 50), 'plain title');
});

test('sale OG image builds when an emoji straddles the 50-character title cut', () => {
  const title = 'x'.repeat(49) + '\u{1F3E1} Everything Must Go ✨';
  const url = generateSaleOGImage({ cloudName: 'demo', saleTitle: title, saleDate: 'Nov 1–Nov 3, 2026', location: 'x'.repeat(24) + '\u{1F3E1}' });
  assert.match(url, /^https:\/\/res\.cloudinary\.com\/demo\//);
  assert.ok(url.includes(encodeURIComponent('\u{1F3E1}')));
});

test('sale OG image builds for a short emoji title', () => {
  assert.doesNotThrow(() => generateSaleOGImage({ cloudName: 'demo', saleTitle: 'Estate Sale \u{1F3E1} Everything Must Go ✨' }));
});

test('item OG image builds when an emoji straddles the cut', () => {
  assert.doesNotThrow(() => generateItemOGImage({ cloudName: 'demo', itemTitle: 'y'.repeat(49) + '\u{1F3E1}', saleTitle: 'z'.repeat(34) + '✨\u{1F3E1}' }));
});
