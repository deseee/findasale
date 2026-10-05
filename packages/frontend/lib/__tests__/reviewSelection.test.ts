/**
 * Review page selection helpers (Smart Review Queue bulk actions).
 * Run: npx tsx --test lib/__tests__/reviewSelection.test.ts
 */
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  toggleSelection,
  selectAllVisible,
  pruneSelection,
  allVisibleSelected,
  selectedCountText,
  itemsCountText,
  parseBulkPriceInput,
  bulkPriceButtonText,
  bulkCategoryButtonText,
  stickyTopOffset,
  isBarStuck,
  bulkBarLayout,
  LG_BREAKPOINT_PX,
  shouldCloseBulkPanelOnKey,
  PHONE_STICKY_TOP_PX,
  DESKTOP_STICKY_TOP_PX,
} from '../reviewSelection';

test('toggleSelection adds an absent id and removes a present one without mutating the input', () => {
  const start = new Set(['a']);
  const added = toggleSelection(start, 'b');
  assert.deepEqual(Array.from(added).sort(), ['a', 'b']);
  assert.deepEqual(Array.from(start), ['a']);
  const removed = toggleSelection(added, 'a');
  assert.deepEqual(Array.from(removed), ['b']);
  assert.notEqual(removed, added);
});

test('selectAllVisible selects exactly the visible ids', () => {
  assert.deepEqual(Array.from(selectAllVisible(['a', 'b', 'c'])), ['a', 'b', 'c']);
  assert.equal(selectAllVisible([]).size, 0);
});

test('selectAllVisible replaces the selection (a stale id is not kept)', () => {
  const all = selectAllVisible(['a', 'b']);
  assert.equal(all.has('stale'), false);
});

test('pruneSelection drops ids that left the queue', () => {
  const pruned = pruneSelection(new Set(['a', 'b', 'c']), ['a', 'c']);
  assert.deepEqual(Array.from(pruned).sort(), ['a', 'c']);
});

test('pruneSelection returns the same Set when nothing was dropped', () => {
  const prev = new Set(['a', 'b']);
  assert.equal(pruneSelection(prev, ['a', 'b', 'c']), prev);
  const empty = new Set<string>();
  assert.equal(pruneSelection(empty, []), empty);
});

test('pruneSelection with nothing visible empties the selection', () => {
  assert.equal(pruneSelection(new Set(['a']), []).size, 0);
});

test('allVisibleSelected needs at least one visible id and all of them selected', () => {
  assert.equal(allVisibleSelected(new Set(['a', 'b']), ['a', 'b']), true);
  assert.equal(allVisibleSelected(new Set(['a']), ['a', 'b']), false);
  assert.equal(allVisibleSelected(new Set(), []), false);
  assert.equal(allVisibleSelected(new Set(['a', 'x']), ['a']), true);
});

test('count text', () => {
  assert.equal(selectedCountText(0), '0 selected');
  assert.equal(selectedCountText(3), '3 selected');
  assert.equal(itemsCountText(1), '1 item');
  assert.equal(itemsCountText(2), '2 items');
  assert.equal(itemsCountText(0), '0 items');
});

test('parseBulkPriceInput accepts a positive amount and rounds to cents', () => {
  assert.equal(parseBulkPriceInput('12.5'), 12.5);
  assert.equal(parseBulkPriceInput(' 7 '), 7);
  assert.equal(parseBulkPriceInput('1.999'), 2);
  assert.equal(parseBulkPriceInput('0.99'), 0.99);
});

test('parseBulkPriceInput rejects empty, zero, negative, non-numeric and values that round to zero', () => {
  for (const bad of ['', '   ', '0', '0.00', '-5', 'abc', '1e999', 'Infinity', '0.004']) {
    assert.equal(parseBulkPriceInput(bad), null, `"${bad}" should be rejected`);
  }
});

test('button text names the amount and the number of items', () => {
  assert.equal(bulkPriceButtonText(12.5, 3), 'Set price to $12.50 on 3 items');
  assert.equal(bulkPriceButtonText(5, 1), 'Set price to $5.00 on 1 item');
  assert.equal(bulkPriceButtonText(null, 2), 'Set price on 2 items');
  assert.equal(bulkCategoryButtonText(1), 'Apply category to 1 item');
  assert.equal(bulkCategoryButtonText(4), 'Apply category to 4 items');
});

test('stickyTopOffset clears the fixed header and search bar below lg and the 64px header from lg up', () => {
  assert.equal(LG_BREAKPOINT_PX, 1024, 'matches the layout (header h-12 / lg:h-16, search bar lg:hidden)');
  assert.equal(stickyTopOffset(375), PHONE_STICKY_TOP_PX);
  assert.ok(PHONE_STICKY_TOP_PX >= 48 + 47, 'offset below lg must clear the 48px header plus the 47px search bar');
  // The tablet band 768-1023 still has the search bar, so it uses the phone offset.
  assert.equal(stickyTopOffset(768), PHONE_STICKY_TOP_PX);
  assert.equal(stickyTopOffset(1023), PHONE_STICKY_TOP_PX);
  assert.equal(stickyTopOffset(LG_BREAKPOINT_PX - 1), PHONE_STICKY_TOP_PX);
  assert.equal(stickyTopOffset(LG_BREAKPOINT_PX), DESKTOP_STICKY_TOP_PX);
  assert.ok(DESKTOP_STICKY_TOP_PX >= 64, 'desktop offset must clear the 64px header');
  assert.equal(stickyTopOffset(1440), DESKTOP_STICKY_TOP_PX);
});

test('isBarStuck pins the bar only after its slot scrolls above the resting offset', () => {
  assert.equal(isBarStuck(300, 96), false);
  assert.equal(isBarStuck(96, 96), false);
  assert.equal(isBarStuck(95.5, 96), true);
  assert.equal(isBarStuck(-1200, 80), true);
});

test('bulkBarLayout shows the selection row only with a selection and never opens a panel without one', () => {
  assert.deepEqual(bulkBarLayout(0, null), { showSelectionRow: false, panel: null, hideStatsOnPhone: false });
  assert.deepEqual(bulkBarLayout(0, 'category'), { showSelectionRow: false, panel: null, hideStatsOnPhone: false });
  assert.deepEqual(bulkBarLayout(3, null), { showSelectionRow: true, panel: null, hideStatsOnPhone: false });
});

test('bulkBarLayout hides the stats row on phones while a panel is open, so the pinned bar stays short', () => {
  assert.deepEqual(bulkBarLayout(2, 'price'), { showSelectionRow: true, panel: 'price', hideStatsOnPhone: true });
  assert.deepEqual(bulkBarLayout(2, 'category'), { showSelectionRow: true, panel: 'category', hideStatsOnPhone: true });
});

test('shouldCloseBulkPanelOnKey closes an open panel on Escape only', () => {
  const base = { key: 'Escape', panelOpen: true, overlayOpen: false };
  assert.equal(shouldCloseBulkPanelOnKey(base), true);
  assert.equal(shouldCloseBulkPanelOnKey({ ...base, key: 'Enter' }), false);
  assert.equal(shouldCloseBulkPanelOnKey({ ...base, key: 'Esc' }), false);
  assert.equal(shouldCloseBulkPanelOnKey({ ...base, panelOpen: false }), false);
});

test('shouldCloseBulkPanelOnKey leaves Escape to open dialogs, handled events and IME composition', () => {
  const base = { key: 'Escape', panelOpen: true, overlayOpen: false };
  assert.equal(shouldCloseBulkPanelOnKey({ ...base, overlayOpen: true }), false);
  assert.equal(shouldCloseBulkPanelOnKey({ ...base, defaultPrevented: true }), false);
  assert.equal(shouldCloseBulkPanelOnKey({ ...base, isComposing: true }), false);
});

test('review page wires the solid backdrop, tablet-aware offset and Escape handler (source guard)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'pages', 'organizer', 'add-items', '[saleId]', 'review.tsx'),
    'utf8'
  );
  // Backdrop: page-colored (same tokens as <main>), behind the bar content, only while pinned, covers the gap above.
  assert.match(src, /data-testid="pinned-bar-backdrop"/);
  assert.match(src, /pinnedBar\.pinned && \(\s*<div\s+aria-hidden="true"\s+data-testid="pinned-bar-backdrop"\s+className="absolute inset-x-0 bottom-0 -z-10 bg-\[#F4EFE7\] dark:bg-\[#1C1C1E\]"/);
  assert.match(src, /top: -pinnedBar\.pinned\.top/);
  // Escape: scoped keydown listener that is removed again, gated by the pure helper.
  assert.match(src, /addEventListener\('keydown', onKeyDown\)/);
  assert.match(src, /removeEventListener\('keydown', onKeyDown\)/);
  assert.match(src, /shouldCloseBulkPanelOnKey\(/);
});
