import test from 'node:test';
import assert from 'node:assert/strict';
import { vintedListAgainNoteText } from '../vintedListAgainNote';
import type { MarketplaceStatus, PlatformEntry } from '../itemMarketplaceApi';

function status(vinted?: PlatformEntry): MarketplaceStatus {
  return {
    itemId: 'i1',
    platforms: vinted ? { vinted } : {},
    ebayHold: { heldAt: null, heldFields: [], contentDirtyAt: null },
    failedUnacknowledgedPushCount: 0,
    recentPushes: [],
  };
}

test('shows the units left after a Vinted sale', () => {
  const s = status({ platform: 'VINTED', label: 'Vinted', status: 'eligible', readyToListAgain: { unitsLeft: 77 } });
  assert.equal(
    vintedListAgainNoteText(s),
    'Sold one on Vinted, 77 left. List it on Vinted again from the extension (Vinted listings are drafts you upload).'
  );
});

test('hidden without the flag, with no units, or before the status loads', () => {
  assert.equal(vintedListAgainNoteText(status({ platform: 'VINTED', label: 'Vinted', status: 'eligible' })), null);
  assert.equal(vintedListAgainNoteText(status({ platform: 'VINTED', label: 'Vinted', status: 'eligible', readyToListAgain: { unitsLeft: 0 } })), null);
  assert.equal(vintedListAgainNoteText(status()), null);
  assert.equal(vintedListAgainNoteText(undefined), null);
});

test('the copy has no em dashes', () => {
  const s = status({ platform: 'VINTED', label: 'Vinted', status: 'eligible', readyToListAgain: { unitsLeft: 2 } });
  assert.ok(!/\u2014/.test(String(vintedListAgainNoteText(s))));
});
