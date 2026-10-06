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

// Tablet band (768-1023px): the fixed mobile search bar (lg:hidden, ends at y=94) is still showing, so
// anything pinned under the header must use top-24 (96px) up to lg, never an md: switch to 64px.
test('item editor sticky header, tier-lapse banner and offline banner clear the search bar in the tablet band', () => {
  const itemForm = read('components/itemForm/ItemFormBody.tsx');
  assert.match(itemForm, /isSheet \? 'top-0' : 'top-24 lg:top-16'/);
  assert.ok(!/top-\[92px\] md:top-16/.test(itemForm), 'item editor header is back on top-[92px] md:top-16');
  const layout = read('components/Layout.tsx');
  assert.match(layout, /sticky top-24 lg:top-16 z-40/);
  assert.match(read('components/OfflineIndicator.tsx'), /fixed top-24 lg:top-16 left-0 right-0 z-40/);
  for (const f of ['components/Layout.tsx', 'components/OfflineIndicator.tsx', 'components/itemForm/ItemFormBody.tsx']) {
    assert.ok(!/top-\[92px\] md:top-16/.test(read(f)), `${f} still uses top-[92px] md:top-16`);
  }
});

test('main content padding clears header + search bar until lg (search bar is lg:hidden), not md', () => {
  const layout = read('components/Layout.tsx');
  assert.match(layout, /className="flex-grow pt-\[92px\] lg:pt-16 pb-15 md:pb-0"/);
  assert.ok(!/md:pt-16/.test(layout), 'main padding is back on md:pt-16');
});

test('message thread composer sits above the mobile bottom tab bar and the list leaves room for it', () => {
  const src = read('pages/messages/[id].tsx');
  assert.match(src, /fixed bottom-\[calc\(3\.5rem\+env\(safe-area-inset-bottom,0px\)\)\] md:bottom-0 left-0 right-0/);
  assert.ok(!/fixed bottom-0 left-0 right-0/.test(src), 'composer is back on bottom-0 under the tab bar');
  assert.match(src, /space-y-3 pb-40 md:pb-28/);
});

test('sticky bars at 96px cover the 2px strip under the 94px search bar with a page-colored backdrop', () => {
  const strip = /before:absolute before:inset-x-0 before:-top-0\.5 before:h-0\.5 before:bg-warm-50 dark:before:bg-gray-900 lg:before:hidden/;
  assert.match(read('pages/messages/[id].tsx'), strip);
  assert.match(read('pages/organizer/add-items/[saleId].tsx'), strip);
});

// The item editor header is pinned at 96px under the 94px search bar too. The cover strip uses the editor page's own
// background (bg-white / dark:bg-gray-800 on edit-item/[id].tsx) so it is invisible, and the sheet variant (top-0, not
// under the search bar) must not get it.
test('item editor sticky header covers the 2px strip with the editor page background, non-sheet only', () => {
  const src = read('components/itemForm/ItemFormBody.tsx');
  assert.match(
    src,
    /\$\{isSheet \? '' : "before:content-\[''\] before:absolute before:inset-x-0 before:-top-0\.5 before:h-0\.5 before:bg-white dark:before:bg-gray-800 lg:before:hidden"\} z-30/,
  );
  const page = read('pages/organizer/edit-item/[id].tsx');
  assert.match(page, /min-h-screen bg-white dark:bg-gray-800/);
});

// The wrapper used h-full inside Layout's <main>, which has no definite height, so it collapsed to the content and the
// lighter body background showed between the last message and the composer. min-h fills the viewport below the header.
test('message thread wrapper fills the viewport below the header instead of collapsing with h-full', () => {
  const src = read('pages/messages/[id].tsx');
  assert.match(
    src,
    /flex flex-col min-h-\[calc\(100dvh-5\.75rem\)\] lg:min-h-\[calc\(100dvh-4rem\)\] bg-warm-50 dark:bg-gray-900/,
  );
  assert.ok(!/flex flex-col h-full bg-warm-50/.test(src), 'thread wrapper is back on h-full');
  assert.match(src, /flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-40 md:pb-28/);
});
