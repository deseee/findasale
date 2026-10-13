/**
 * Render smoke tests for the item form's presentational pieces (server-side render to static markup, no DOM needed).
 * They pin the exact UI strings and the accessibility hooks (aria-live, radiogroup) the live QA relies on.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConditionSelect, ConditionGradePicker } from '../../components/itemForm/ConditionFields';
import { PushFailureBanner, PushNeedsInfoNotice, SaveOutcomeRow, EbayHoldPanel } from '../../components/itemForm/MarketplaceNotices';
import { BlockedPushSummary } from '../../components/BlockedPushSummary';
import { PlatformChipStrip, PlatformStatusList } from '../../components/itemForm/PlatformChips';
import { buildPlatformChips } from '../platformStatusView';

const h = React.createElement;
const html = (el: React.ReactElement) => renderToStaticMarkup(el);

test('ConditionSelect offers exactly the four canonical conditions plus the placeholder', () => {
  const out = html(h(ConditionSelect, { value: 'USED', onChange: () => undefined }));
  assert.equal((out.match(/<option/g) || []).length, 5);
  for (const label of ['Select condition', '>New<', '>Used<', '>Refurbished<', '>Parts / Repair<']) {
    assert.ok(out.includes(label), label);
  }
  assert.equal(out.includes('Like New'), false);
});

test('ConditionGradePicker: A to D, S (legacy) only when asked', () => {
  const plain = html(h(ConditionGradePicker, { condition: 'USED', grade: 'B', showLegacyS: false, onChange: () => undefined }));
  assert.equal((plain.match(/role="radio"/g) || []).length, 4);
  assert.equal(plain.includes('S (legacy)'), false);
  assert.ok(plain.includes('role="radiogroup"'));
  assert.ok(plain.includes('aria-checked="true"'));
  const legacy = html(h(ConditionGradePicker, { condition: 'USED', grade: 'S', showLegacyS: true, onChange: () => undefined }));
  assert.equal((legacy.match(/role="radio"/g) || []).length, 5);
  assert.ok(legacy.includes('S (legacy)'));
});

test('ConditionGradePicker: eBay preview and the not-used note', () => {
  const out = html(h(ConditionGradePicker, { condition: 'NEW', grade: '', showLegacyS: false, ebayPreview: 'New', onChange: () => undefined }));
  assert.ok(out.includes('On eBay this shows as: New'));
  assert.ok(out.includes('The grade only changes the eBay condition for used items.'));
});

test('PushFailureBanner', () => {
  const out = html(
    h(PushFailureBanner, {
      row: { id: 'p1', status: 'FAILED', fieldsAttempted: ['price'], errorMessage: 'The price is too low.' },
      onAcknowledge: () => undefined,
      pending: false,
    })
  );
  assert.ok(out.includes('role="alert"'));
  assert.ok(out.includes('eBay update failed: The price is too low.'));
  assert.ok(out.includes('>Acknowledge<'));
});

test('SaveOutcomeRow: always an aria-live polite region; Retry only when allowed', () => {
  const empty = html(h(SaveOutcomeRow, { outcome: null, onRetry: () => undefined, retryDisabled: false }));
  assert.ok(empty.includes('aria-live="polite"'));
  const failed = html(
    h(SaveOutcomeRow, {
      outcome: { phase: 'settled', view: { tone: 'error', text: 'eBay update failed: nope', canRetry: true }, extensionLines: ['Needs manual update on Vinted.'] },
      onRetry: () => undefined,
      retryDisabled: false,
    })
  );
  assert.ok(failed.includes('eBay update failed: nope'));
  assert.ok(failed.includes('>Retry<'));
  assert.ok(failed.includes('Needs manual update on Vinted.'));
  const ok = html(
    h(SaveOutcomeRow, {
      outcome: { phase: 'settled', view: { tone: 'success', text: 'eBay updated: price, condition', canRetry: false }, extensionLines: [] },
      onRetry: () => undefined,
      retryDisabled: false,
    })
  );
  assert.ok(ok.includes('eBay updated: price, condition'));
  assert.equal(ok.includes('Retry'), false);
});

test('EbayHoldPanel: chip, held fields and both actions; disabled while busy', () => {
  const out = html(
    h(EbayHoldPanel, {
      heldAt: '2026-10-04T10:00:00.000Z',
      heldFields: ['price', 'condition'],
      result: null,
      busy: true,
      updating: false,
      resuming: false,
      onUpdateNow: () => undefined,
      onResume: () => undefined,
    })
  );
  assert.ok(out.includes('eBay sync paused'));
  assert.ok(out.includes('Not sent to eBay yet: price, condition.'));
  assert.ok(out.includes('Update eBay now'));
  assert.ok(out.includes('Resume syncing'));
  assert.equal((out.match(/disabled=""/g) || []).length, 2);
});

test('EbayHoldPanel renders nothing when not held and no result', () => {
  const out = html(
    h(EbayHoldPanel, { heldAt: null, heldFields: [], result: null, busy: false, updating: false, resuming: false, onUpdateNow: () => undefined, onResume: () => undefined })
  );
  assert.equal(out, '');
});

test('EbayHoldPanel shows the message returned by the server', () => {
  const out = html(
    h(EbayHoldPanel, {
      heldAt: '2026-10-04T10:00:00.000Z',
      heldFields: [],
      result: { tone: 'info', lines: ['Saved. eBay will update from inventory.'] },
      busy: false,
      updating: false,
      resuming: false,
      onUpdateNow: () => undefined,
      onResume: () => undefined,
    })
  );
  assert.ok(out.includes('Saved. eBay will update from inventory.'));
  assert.ok(out.includes('Nothing is waiting to be sent.'));
});

test('PlatformStatusList: listed platforms, prompt text only for extensions, the rest under Other marketplaces', () => {
  const chips = buildPlatformChips(
    {
      itemId: 'i',
      platforms: { vinted: { platform: 'VINTED', label: 'Vinted', status: 'listed_needs_manual_update' }, ebay: { platform: 'EBAY', label: 'eBay', status: 'live' } },
      ebayHold: { heldAt: null, heldFields: [], contentDirtyAt: null },
      failedUnacknowledgedPushCount: 0,
      recentPushes: [],
    },
    { ebayListingId: 'L1' }
  );
  const out = html(h(PlatformStatusList, { chips }));
  assert.ok(out.includes('Other marketplaces'));
  assert.ok(out.includes('Needs manual update on Vinted'));
  assert.ok(out.includes('Listed, needs manual update'));
  assert.ok(out.includes('platform-chip-poshmark'));
  assert.equal(/<button[^>]*>[^<]*Vinted/.test(out), false);
});

test('PlatformChipStrip: listed chips, or the empty text', () => {
  const chips = buildPlatformChips(undefined, { ebayListingId: 'L1' });
  assert.ok(html(h(PlatformChipStrip, { chips, onJump: () => undefined, emptyText: 'none' })).includes('eBay live'));
  const none = buildPlatformChips(undefined, {});
  assert.ok(html(h(PlatformChipStrip, { chips: none, onJump: () => undefined, emptyText: 'none' })).includes('none'));
});

const NEEDS_INFO_ROW = { id: 'p1', status: 'FAILED', fieldsAttempted: [], errorCode: 'NEEDS_PACKAGE_DETAILS', errorMessage: 'Add the package weight and box size.' };
const noop = () => {};

test('PushNeedsInfoNotice: amber, says nothing failed, has the fix button and Got it, no red or failure wording', () => {
  const html = renderToStaticMarkup(
    React.createElement(PushNeedsInfoNotice, { row: NEEDS_INFO_ROW, collapsed: false, onAcknowledge: noop, pending: false, onGoToPackage: noop, onGoToIsbn: noop })
  );
  assert.match(html, /Needs package details/);
  assert.match(html, /Add the package weight and box size\./);
  assert.match(html, /Nothing went wrong/);
  assert.match(html, /Go to package details/);
  assert.match(html, /Got it/);
  assert.match(html, /amber/);
  assert.ok(!/red-/.test(html));
  assert.ok(!/role="alert"/.test(html));
  assert.ok(!/did not take your last update/.test(html));
});

test('PushNeedsInfoNotice: after Got it only the long note collapses to a persistent "Not updated on eBay" line', () => {
  const html = renderToStaticMarkup(
    React.createElement(PushNeedsInfoNotice, { row: NEEDS_INFO_ROW, collapsed: true, onAcknowledge: noop, pending: false, onGoToPackage: noop, onGoToIsbn: noop })
  );
  assert.match(html, /Not updated on eBay/);
  assert.match(html, /Needs package details/);
  assert.match(html, /Go to package details/);
  assert.ok(!/Nothing went wrong/.test(html));
  assert.ok(!/Got it/.test(html));
  assert.ok(!/red-/.test(html));
});

test('PushNeedsInfoNotice: eBay setup codes link to the eBay settings tab instead of the package fields', () => {
  const html = renderToStaticMarkup(
    React.createElement(PushNeedsInfoNotice, {
      row: { id: 'p2', status: 'FAILED', fieldsAttempted: [], errorCode: 'POLICIES_NOT_CONFIGURED', errorMessage: 'Finish eBay setup in Settings.' },
      collapsed: false,
      onAcknowledge: noop,
      pending: false,
      onGoToPackage: noop,
      onGoToIsbn: noop,
    })
  );
  assert.match(html, /Finish eBay setup/);
  assert.match(html, /href="\/organizer\/settings\?tab=ebay"/);
  assert.ok(!/Go to package details/.test(html));
});

test('BlockedPushSummary: persistent amber note with titles and a Fix these items link, no ids, no red', () => {
  const html = renderToStaticMarkup(
    React.createElement(BlockedPushSummary, {
      text: '3 items need package details before they can go to eBay',
      titles: ['Brass lamp', 'Oak table'],
      count: 3,
      reviewHref: '/organizer/add-items/sale_1',
      onDismiss: noop,
    })
  );
  assert.match(html, /3 items need package details before they can go to eBay\./);
  assert.match(html, /Brass lamp, Oak table and 1 more/);
  assert.match(html, /href="\/organizer\/add-items\/sale_1"/);
  assert.match(html, /Fix these items/);
  assert.match(html, /amber/);
  assert.ok(!/red-/.test(html));
});

test('PushNeedsInfoNotice: ISBN code offers Go to ISBN field (expanded and collapsed), not the package button', () => {
  const row = { id: 'p3', status: 'FAILED', fieldsAttempted: [], errorCode: 'EBAY_BOOK_NO_ISBN', errorMessage: 'Add the ISBN for this book.' };
  for (const collapsed of [false, true]) {
    const html = renderToStaticMarkup(
      React.createElement(PushNeedsInfoNotice, { row, collapsed, onAcknowledge: noop, pending: false, onGoToPackage: noop, onGoToIsbn: noop })
    );
    assert.match(html, /Go to ISBN field/);
    assert.match(html, /Needs ISBN/);
    assert.ok(!/Go to package details/.test(html));
  }
});
