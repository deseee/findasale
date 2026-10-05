/**
 * Layout sticky wrapper guard: the app shell must not become a scroll container, or every `position: sticky`
 * descendant goes inert (the wrapper never scrolls, the window does).
 * Run: npm test   (node:test through tsx, no extra dependencies)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const HERE = typeof __dirname !== 'undefined' ? __dirname : path.join(process.cwd(), 'lib', '__tests__');
const FRONTEND = path.join(HERE, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(FRONTEND, rel), 'utf8');

/** The class string of the outermost Layout wrapper (the element that wraps every page). */
function layoutWrapperClass(): string {
  const src = read('components/Layout.tsx');
  const m = src.match(/<div className="(min-h-screen flex flex-col[^"]*)">\s*<OfflineIndicator/);
  assert.ok(m, 'Layout wrapper div (min-h-screen flex flex-col ... followed by OfflineIndicator) not found');
  return m[1];
}

test('Layout wrapper clips horizontal overflow with overflow-x: clip where supported (keeps sticky working)', () => {
  const cls = layoutWrapperClass().split(/\s+/);
  assert.ok(cls.includes('supports-[overflow:clip]:overflow-x-clip'), `wrapper classes: ${cls.join(' ')}`);
});

test('Layout wrapper keeps overflow-x-hidden only as the fallback for browsers without overflow: clip (Safari < 16)', () => {
  const cls = layoutWrapperClass().split(/\s+/);
  assert.ok(cls.includes('overflow-x-hidden'), 'fallback overflow-x-hidden missing');
  // The clip override must be a supports() variant. Nothing else may make the wrapper a scroll container.
  assert.ok(!cls.some((c) => /^overflow-(auto|scroll|y-auto|y-scroll|y-hidden)$/.test(c)), `wrapper classes: ${cls.join(' ')}`);
});

// Sticky elements that sit under the fixed header must carry an offset that clears it
// (header 48px + 47px mobile search bar below lg, 64px header at lg and up). top-0 / top-4 / top-6 hide them under the header.
const STICKY_BELOW_HEADER: Array<[string, RegExp]> = [
  ['components/FilterSidebar.tsx', /sticky top-24 lg:top-20 max-h-\[calc\(100vh-7rem\)\] overflow-y-auto/],
  ['components/SearchFilterPanel.tsx', /sticky top-24 lg:top-20 max-h-\[calc\(100vh-7rem\)\] overflow-y-auto/],
  ['pages/sales/[id].tsx', /sticky top-20 max-h-\[calc\(100vh-6rem\)\] overflow-y-auto/],
  ['pages/guide.tsx', /sticky top-28 lg:top-20/],
  ['pages/messages/[id].tsx', /sticky top-24 lg:top-16 z-10/],
  ['pages/organizer/label-composer/[saleId].tsx', /sticky top-24 lg:top-16 z-30/],
  ['pages/organizer/add-items/[saleId].tsx', /sticky top-24 lg:top-16 z-30/],
];

for (const [file, re] of STICKY_BELOW_HEADER) {
  test(`${file}: sticky element clears the fixed header`, () => {
    assert.match(read(file), re);
  });
}

test('create-sale wizard footer clears the mobile bottom tab bar and is not an inline sticky', () => {
  const src = read('pages/organizer/create-sale.tsx');
  assert.match(src, /sticky bottom-\[calc\(3\.5rem\+env\(safe-area-inset-bottom,0px\)\)\] md:bottom-0 z-30/);
  assert.ok(!/position: 'sticky'/.test(src), "inline position: 'sticky' came back");
});

test('encyclopedia filter bar stays non-sticky (it is ~250px tall and would cover content)', () => {
  const src = read('pages/encyclopedia/index.tsx');
  assert.ok(!/sticky top-0 z-10/.test(src));
});
