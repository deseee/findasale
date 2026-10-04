import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlatformChips, PLATFORM_KEYS } from '../platformStatusView';
import type { MarketplaceStatus } from '../itemMarketplaceApi';

function statusOf(platforms: Record<string, { status: string; label?: string }>): MarketplaceStatus {
  const full: MarketplaceStatus['platforms'] = {};
  Object.keys(platforms).forEach((k) => {
    full[k] = { platform: k.toUpperCase(), label: platforms[k].label || k, status: platforms[k].status };
  });
  return { itemId: 'i1', platforms: full, ebayHold: { heldAt: null, heldFields: [], contentDirtyAt: null }, failedUnacknowledgedPushCount: 0, recentPushes: [] };
}

test('always returns all twelve platforms in a fixed order', () => {
  const chips = buildPlatformChips(undefined, {});
  assert.equal(chips.length, 12);
  assert.deepEqual(chips.map((c) => c.key), Array.from(PLATFORM_KEYS));
});

test('before the status loads: eBay and Discogs come from the item, everything else is quiet', () => {
  const chips = buildPlatformChips(undefined, { ebayListingId: 'L1', discogsListingId: 'D1' });
  assert.equal(chips[0].short, 'eBay live');
  assert.equal(chips[1].short, 'Discogs live');
  assert.equal(chips.filter((c) => c.listed).length, 2);
});

test('eBay pending offer, live listing, and paused hold', () => {
  assert.equal(buildPlatformChips(undefined, { ebayOfferId: 'O1' })[0].kind, 'pending');
  assert.equal(buildPlatformChips(undefined, { ebayListingId: 'L1', ebayOfferId: 'O1' })[0].kind, 'live');
  const held = buildPlatformChips(statusOf({ ebay: { status: 'paused', label: 'eBay' } }), { ebayListingId: 'L1' })[0];
  assert.equal(held.kind, 'paused');
  assert.equal(held.short, 'eBay paused');
});

test('extension marketplaces: listed ones carry the prompt and no push; paused and unlisted are labelled', () => {
  const chips = buildPlatformChips(
    statusOf({
      vinted: { status: 'listed_needs_manual_update', label: 'Vinted' },
      gumtreeAu: { status: 'listed_needs_manual_update', label: 'Gumtree AU' },
      poshmark: { status: 'paused', label: 'Poshmark' },
      mercari: { status: 'eligible', label: 'Mercari' },
      grailed: { status: 'none', label: 'Grailed' },
    }),
    {}
  );
  const by = (k: string) => chips.find((c) => c.key === k)!;
  assert.equal(by('vinted').kind, 'manual');
  assert.equal(by('vinted').prompt, 'Needs manual update on Vinted');
  assert.equal(by('vinted').long, 'Listed, needs manual update');
  assert.equal(by('gumtreeAu').prompt, 'Needs manual update on Gumtree AU');
  assert.equal(by('poshmark').kind, 'paused');
  assert.equal(by('mercari').kind, 'quiet');
  assert.equal(by('mercari').long, 'Not listed yet');
  assert.equal(by('grailed').long, 'Not listed');
  assert.equal(by('facebook').isExtension, true);
  assert.equal(by('etsy').isExtension, false);
});

test('API platforms: live status shows live', () => {
  const chips = buildPlatformChips(statusOf({ reverb: { status: 'live', label: 'Reverb' }, etsy: { status: 'live', label: 'Etsy' } }), {});
  assert.equal(chips.find((c) => c.key === 'reverb')!.short, 'Reverb live');
  assert.equal(chips.find((c) => c.key === 'etsy')!.kind, 'live');
});

test('no chip text contains an em dash or the word AI', () => {
  const chips = buildPlatformChips(statusOf({ vinted: { status: 'listed_needs_manual_update', label: 'Vinted' } }), { ebayListingId: 'x' });
  chips.forEach((c) => {
    [c.short, c.long, c.prompt || ''].forEach((t) => {
      assert.equal(/—|–/.test(t), false);
      assert.equal(/\bAI\b/.test(t), false);
    });
  });
});
