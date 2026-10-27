import test from 'node:test';
import assert from 'node:assert/strict';
import { joinPlatformLabels, platformsRepostingAfterSale, platformsWithoutQuantity, stockCountNoteText } from '../stockCountNote';
import type { MarketplaceStatus, PlatformEntry } from '../itemMarketplaceApi';

function entry(platform: string, label: string, status: string, supportsQuantity?: boolean): PlatformEntry {
  return { platform, label, status, ...(supportsQuantity === undefined ? {} : { supportsQuantity }) };
}
function status(platforms: Record<string, PlatformEntry>): MarketplaceStatus {
  return { itemId: 'i1', platforms, ebayHold: { heldAt: null, heldFields: [], contentDirtyAt: null }, failedUnacknowledgedPushCount: 0, recentPushes: [] };
}

test('lists only active listings on platforms that cannot take a count', () => {
  const s = status({
    ebay: entry('EBAY', 'eBay', 'live', true),
    reverb: entry('REVERB', 'Reverb', 'live', false),
    vinted: entry('VINTED', 'Vinted', 'listed_needs_manual_update', false),
    mercari: entry('MERCARI', 'Mercari', 'eligible', false),
    poshmark: entry('POSHMARK', 'Poshmark', 'none', false),
  });
  assert.deepEqual(platformsWithoutQuantity(s), ['Reverb', 'Vinted']);
});

test('an unknown flag (older server) never shows the note', () => {
  assert.deepEqual(platformsWithoutQuantity(status({ reverb: entry('REVERB', 'Reverb', 'live') })), []);
  assert.deepEqual(platformsWithoutQuantity(undefined), []);
});

test('the note shows only when in stock is greater than 1', () => {
  const s = status({ reverb: entry('REVERB', 'Reverb', 'live', false), vinted: entry('VINTED', 'Vinted', 'listed_needs_manual_update', false) });
  assert.equal(stockCountNoteText(s, 1), null);
  assert.equal(stockCountNoteText(s, 0), null);
  assert.equal(
    stockCountNoteText(s, 3),
    "FindA.Sale can't set the count on Reverb and Vinted. Sales there lower your in stock number automatically, but that listing keeps its own count and may need a manual update."
  );
});

test('no note when only quantity-capable markets are listed', () => {
  const s = status({ ebay: entry('EBAY', 'eBay', 'live', true), etsy: entry('ETSY', 'Etsy', 'live', true) });
  assert.equal(stockCountNoteText(s, 5), null);
});

test('joinPlatformLabels', () => {
  assert.equal(joinPlatformLabels(['A']), 'A');
  assert.equal(joinPlatformLabels(['A', 'B']), 'A and B');
  assert.equal(joinPlatformLabels(['A', 'B', 'C']), 'A, B and C');
});

test('one-unit markets with the auto queue on get the repost sentence, not the manual-count one (2026-10-27)', () => {
  const s = status({
    reverb: entry('REVERB', 'Reverb', 'live', false),
    mercari: { ...entry('MERCARI', 'Mercari', 'listed_needs_manual_update', false), autoRepostAfterSale: true },
    grailed: { ...entry('GRAILED', 'Grailed', 'eligible', false), autoRepostAfterSale: true },
  });
  assert.deepEqual(platformsWithoutQuantity(s), ['Reverb']);
  assert.deepEqual(platformsRepostingAfterSale(s), ['Mercari']);
  assert.equal(
    stockCountNoteText(s, 4),
    "FindA.Sale can't set the count on Reverb. Sales there lower your in stock number automatically, but that listing keeps its own count and may need a manual update. Mercari lists one unit at a time. When it sells there and stock is left, the auto queue posts a fresh listing."
  );
});

test('repost sentence alone, plural, and hidden at stock 1', () => {
  const s = status({
    mercari: { ...entry('MERCARI', 'Mercari', 'listed_needs_manual_update', false), autoRepostAfterSale: true },
    facebook: { ...entry('FACEBOOK', 'Facebook', 'listed_needs_manual_update', false), autoRepostAfterSale: true },
  });
  assert.equal(stockCountNoteText(s, 2), 'Mercari and Facebook list one unit at a time. When it sells there and stock is left, the auto queue posts a fresh listing.');
  assert.equal(stockCountNoteText(s, 1), null);
  assert.deepEqual(platformsRepostingAfterSale(undefined), []);
});
