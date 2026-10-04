import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSaveImpact,
  describeSaveImpact,
  describePlan,
  describePushOutcome,
  planExtensionLines,
  findNewPush,
  pollForNewPush,
  OUTCOME_POLL_DELAYS_MS,
  extensionPlatformLabel,
} from '../marketplaceImpact';

const loaded = {
  title: 'Oak table',
  description: 'Solid oak',
  condition: 'USED',
  conditionGrade: 'B',
  price: '45.00',
  packageWeightOz: 100,
  packageLengthIn: 20,
  packageWidthIn: 10,
  packageHeightIn: 5,
  packageType: 'MAILING_BOX',
  ebayOfferId: 'offer1',
  ebayListingId: 'list1',
};
const noExt: string[] = [];

test('not listed on eBay: no eBay push, reason not_listed, no eBay sentence', () => {
  const impact = computeSaveImpact({ loadedItem: { ...loaded, ebayOfferId: null, ebayListingId: null }, dirtyFields: { price: '50' }, held: false, ebayListed: false, extensionPlatformsListed: noExt });
  assert.deepEqual(impact.ebay, { willPush: false, fields: [], reason: 'not_listed' });
  assert.deepEqual(describeSaveImpact(impact), []);
});

test('listed, price only', () => {
  const impact = computeSaveImpact({ loadedItem: loaded, dirtyFields: { price: '50' }, held: false, ebayListed: true, extensionPlatformsListed: noExt });
  assert.deepEqual(impact.ebay, { willPush: true, fields: ['price'] });
  assert.deepEqual(describeSaveImpact(impact), ['Saving will update eBay: price.']);
});

test('listed, price changed to the same value or by under half a cent: no change', () => {
  for (const price of ['45', '45.00', 45, '45.004']) {
    const impact = computeSaveImpact({ loadedItem: loaded, dirtyFields: { price }, held: false, ebayListed: true, extensionPlatformsListed: noExt });
    assert.equal(impact.ebay.willPush, false);
    assert.equal(impact.ebay.reason, 'no_changes');
  }
});

test('listed, price and condition: fields in the backend order', () => {
  const impact = computeSaveImpact({
    loadedItem: loaded,
    dirtyFields: { price: '50', condition: 'NEW', conditionGrade: '' },
    held: false,
    ebayListed: true,
    extensionPlatformsListed: noExt,
  });
  assert.deepEqual(impact.ebay.fields, ['condition', 'price']);
  assert.deepEqual(describeSaveImpact(impact), ['Saving will update eBay: condition, price.']);
});

test('listed, a grade change that moves the eBay condition counts as a condition change', () => {
  // B -> D moves USED_VERY_GOOD to USED_ACCEPTABLE
  const moved = computeSaveImpact({ loadedItem: loaded, dirtyFields: { condition: 'USED', conditionGrade: 'D' }, held: false, ebayListed: true, extensionPlatformsListed: noExt });
  assert.deepEqual(moved.ebay.fields, ['condition']);
  // A -> B keeps USED_VERY_GOOD and the condition itself is unchanged
  const same = computeSaveImpact({ loadedItem: { ...loaded, conditionGrade: 'A' }, dirtyFields: { condition: 'USED', conditionGrade: 'B' }, held: false, ebayListed: true, extensionPlatformsListed: noExt });
  assert.equal(same.ebay.willPush, false);
});

test('listed, legacy stored condition untouched (sent as stored) is not a change', () => {
  const impact = computeSaveImpact({
    loadedItem: { ...loaded, condition: 'LIKE_NEW', conditionGrade: null },
    dirtyFields: { condition: 'LIKE_NEW', conditionGrade: '' },
    held: false,
    ebayListed: true,
    extensionPlatformsListed: noExt,
  });
  assert.equal(impact.ebay.willPush, false);
  assert.deepEqual(describeSaveImpact(impact), ['eBay will not change.']);
});

test('listed, title and description changes; empty title is not a change', () => {
  const impact = computeSaveImpact({ loadedItem: loaded, dirtyFields: { title: 'Oak side table', description: 'Solid oak, sanded' }, held: false, ebayListed: true, extensionPlatformsListed: noExt });
  assert.deepEqual(impact.ebay.fields, ['title', 'description']);
  const empty = computeSaveImpact({ loadedItem: loaded, dirtyFields: { title: '' }, held: false, ebayListed: true, extensionPlatformsListed: noExt });
  assert.equal(empty.ebay.willPush, false);
});

test('listed, shipping inputs: a real package change counts, the same value does not; shipping alone prompts no extension', () => {
  const same = computeSaveImpact({ loadedItem: loaded, dirtyFields: { packageWeightOz: 100, packageLengthIn: 20, packageType: 'MAILING_BOX' }, held: false, ebayListed: true, extensionPlatformsListed: ['VINTED'] });
  assert.equal(same.ebay.willPush, false);
  const changed = computeSaveImpact({ loadedItem: loaded, dirtyFields: { packageWeightOz: 120 }, held: false, ebayListed: true, extensionPlatformsListed: ['VINTED'] });
  assert.deepEqual(changed.ebay, { willPush: true, fields: ['shipping'] });
  assert.deepEqual(changed.extensions, []);
  assert.deepEqual(describeSaveImpact(changed), ['Saving will update eBay: shipping.']);
});

test('held: nothing is pushed, the fields that would have are listed, and the text says paused', () => {
  const impact = computeSaveImpact({ loadedItem: loaded, dirtyFields: { price: '50', title: 'New title' }, held: true, ebayListed: true, extensionPlatformsListed: noExt });
  assert.deepEqual(impact.ebay, { willPush: false, fields: ['title', 'price'], reason: 'held' });
  assert.deepEqual(describeSaveImpact(impact), ['eBay sync is paused, so eBay will not change.']);
});

test('listed with a listing id but no offer: cannot be pushed', () => {
  const impact = computeSaveImpact({ loadedItem: { ...loaded, ebayOfferId: null }, dirtyFields: { price: '60' }, held: false, ebayListed: true, extensionPlatformsListed: noExt });
  assert.deepEqual(impact.ebay, { willPush: false, fields: ['price'], reason: 'no_offer_id' });
});

test('extension-listed: price change prompts a manual update, never a push', () => {
  const impact = computeSaveImpact({
    loadedItem: { ...loaded, ebayOfferId: null, ebayListingId: null },
    dirtyFields: { price: '50' },
    held: false,
    ebayListed: false,
    extensionPlatformsListed: ['VINTED', { platform: 'gumtreeAu', label: 'Gumtree AU' }],
  });
  assert.equal(impact.ebay.willPush, false);
  assert.deepEqual(impact.extensions, [
    { platform: 'VINTED', message: 'Needs manual update on Vinted', fields: ['price'] },
    { platform: 'gumtreeAu', message: 'Needs manual update on Gumtree AU', fields: ['price'] },
  ]);
  assert.deepEqual(describeSaveImpact(impact), ['Needs manual update on Vinted.', 'Needs manual update on Gumtree AU.']);
});

test('extension-listed and eBay-listed: both sentences', () => {
  const impact = computeSaveImpact({ loadedItem: loaded, dirtyFields: { price: '50' }, held: false, ebayListed: true, extensionPlatformsListed: ['VINTED'] });
  assert.deepEqual(describeSaveImpact(impact), ['Saving will update eBay: price.', 'Needs manual update on Vinted.']);
});

test('extension prompts also appear while eBay is held (the backend does not gate them on the hold)', () => {
  const impact = computeSaveImpact({ loadedItem: loaded, dirtyFields: { description: 'x' }, held: true, ebayListed: true, extensionPlatformsListed: ['POSHMARK'] });
  assert.equal(impact.extensions.length, 1);
});

test('no changes: eBay will not change, no extension prompt', () => {
  const impact = computeSaveImpact({ loadedItem: loaded, dirtyFields: {}, held: false, ebayListed: true, extensionPlatformsListed: ['VINTED'] });
  assert.deepEqual(impact.ebay, { willPush: false, fields: [], reason: 'no_changes' });
  assert.deepEqual(impact.extensions, []);
  assert.deepEqual(describeSaveImpact(impact), ['eBay will not change.']);
});

test('undefined keys are untouched (same as an omitted key in the PUT body)', () => {
  const impact = computeSaveImpact({ loadedItem: loaded, dirtyFields: { price: undefined, packageWeightOz: undefined }, held: false, ebayListed: true, extensionPlatformsListed: noExt });
  assert.equal(impact.ebay.willPush, false);
});

test('extension labels resolve enum and camelCase keys', () => {
  assert.equal(extensionPlatformLabel('GUMTREE_AU'), 'Gumtree AU');
  assert.equal(extensionPlatformLabel('gumtreeAu'), 'Gumtree AU');
  assert.equal(extensionPlatformLabel('vinted'), 'Vinted');
  assert.equal(extensionPlatformLabel('Unknown'), 'Unknown');
});

test('no copy contains an em dash or the word AI', () => {
  const texts: string[] = [];
  for (const status of ['SUCCESS', 'PARTIAL', 'FAILED', 'SKIPPED_HELD', 'SKIPPED_NOT_LISTED', 'WHAT']) {
    texts.push(describePushOutcome({ status, fieldsAttempted: ['price'], fieldsPushed: [] }).text);
  }
  texts.push(describePlan({ ebay: { willPush: true, fields: ['price'] } })?.text ?? '');
  texts.push(describePlan({ ebay: { willPush: false, fields: [], reason: 'held' } })?.text ?? '');
  texts.push(...describeSaveImpact(computeSaveImpact({ loadedItem: loaded, dirtyFields: { price: '9' }, held: true, ebayListed: true, extensionPlatformsListed: ['VINTED'] })));
  for (const t of texts) {
    assert.equal(/—|–/.test(t), false, t);
    assert.equal(/\bAI\b/.test(t), false, t);
  }
});

// ------------------------------------------------------------------------------------------ outcome text

test('describePlan from the PUT response', () => {
  assert.deepEqual(describePlan({ ebay: { willPush: true, fields: ['price', 'condition'] } }), {
    tone: 'pending',
    text: 'Updating eBay: price, condition.',
    canRetry: false,
  });
  assert.equal(describePlan({ ebay: { willPush: false, fields: [], held: true, reason: 'held' } })?.text, 'eBay not changed (sync paused)');
  assert.equal(describePlan({ ebay: { willPush: false, fields: [], reason: 'no_changes' } })?.text, 'eBay not changed');
  assert.equal(describePlan({ ebay: { willPush: false, fields: [], reason: 'not_listed' } }), null);
  assert.equal(describePlan(undefined), null);
  assert.equal(describePlan({}), null);
});

test('planExtensionLines reads the backend key (extension) and the brief key (extensions)', () => {
  assert.deepEqual(planExtensionLines({ extension: [{ platform: 'VINTED', message: 'Needs manual update on Vinted', fields: ['price'] }] }), ['Needs manual update on Vinted.']);
  assert.deepEqual(planExtensionLines({ extensions: [{ platform: 'MERCARI', message: 'Needs manual update on Mercari' }] }), ['Needs manual update on Mercari.']);
  assert.deepEqual(planExtensionLines(null), []);
});

test('describePushOutcome: SUCCESS, PARTIAL, FAILED, SKIPPED_HELD', () => {
  assert.deepEqual(describePushOutcome({ status: 'SUCCESS', fieldsAttempted: ['price', 'condition'], fieldsPushed: ['price', 'condition'] }), {
    tone: 'success',
    text: 'eBay updated: price, condition',
    canRetry: false,
  });
  const partial = describePushOutcome({ status: 'PARTIAL', fieldsAttempted: ['price', 'condition'], fieldsPushed: ['price'], errorMessage: 'Condition is not valid for this category.' });
  assert.equal(partial.tone, 'warning');
  assert.equal(partial.canRetry, true);
  assert.equal(partial.text, 'eBay updated: price. Could not update: condition. Condition is not valid for this category.');
  assert.deepEqual(describePushOutcome({ status: 'FAILED', fieldsAttempted: ['price'], errorMessage: 'The price is too low.' }), {
    tone: 'error',
    text: 'eBay update failed: The price is too low.',
    canRetry: true,
  });
  assert.equal(describePushOutcome({ status: 'FAILED', fieldsAttempted: ['price'] }).text, 'eBay update failed: eBay did not accept the update.');
  assert.deepEqual(describePushOutcome({ status: 'SKIPPED_HELD', fieldsAttempted: [] }), { tone: 'info', text: 'eBay not changed (sync paused)', canRetry: false });
});

test('describePushOutcome: SUCCESS with no fieldsPushed falls back to fieldsAttempted', () => {
  assert.equal(describePushOutcome({ status: 'SUCCESS', fieldsAttempted: ['title'] }).text, 'eBay updated: title');
});

// ------------------------------------------------------------------------------------------ polling

test('findNewPush: by known ids when a status was loaded before the click', () => {
  const rows = [{ id: 'p2' }, { id: 'p1' }];
  assert.equal(findNewPush(rows, { knownIds: ['p1'], knownLoaded: true, clickedAtMs: 0 })?.id, 'p2');
  assert.equal(findNewPush(rows, { knownIds: ['p1', 'p2'], knownLoaded: true, clickedAtMs: 0 }), null);
  assert.equal(findNewPush([], { knownIds: [], knownLoaded: true, clickedAtMs: 0 }), null);
});

test('findNewPush: by time when nothing was loaded before the click (5 second skew allowance)', () => {
  const click = Date.parse('2026-10-04T12:00:10.000Z');
  assert.equal(findNewPush([{ id: 'a', startedAt: '2026-10-04T12:00:12.000Z' }], { knownIds: [], knownLoaded: false, clickedAtMs: click })?.id, 'a');
  assert.equal(findNewPush([{ id: 'a', startedAt: '2026-10-04T12:00:06.000Z' }], { knownIds: [], knownLoaded: false, clickedAtMs: click })?.id, 'a');
  assert.equal(findNewPush([{ id: 'a', startedAt: '2026-10-04T11:59:00.000Z' }], { knownIds: [], knownLoaded: false, clickedAtMs: click }), null);
  assert.equal(findNewPush([{ id: 'a' }], { knownIds: [], knownLoaded: false, clickedAtMs: click }), null);
});

test('poll delays are 1.5s, 2s, 3s, 4s, 5s', () => {
  assert.deepEqual(Array.from(OUTCOME_POLL_DELAYS_MS), [1500, 2000, 3000, 4000, 5000]);
});

test('pollForNewPush: stops at the first new row', async () => {
  const waits: number[] = [];
  let fetches = 0;
  const result = await pollForNewPush({
    fetchRows: async () => {
      fetches += 1;
      return fetches >= 3 ? [{ id: 'new' }, { id: 'old' }] : [{ id: 'old' }];
    },
    ctx: { knownIds: ['old'], knownLoaded: true, clickedAtMs: 0 },
    wait: async (ms) => { waits.push(ms); },
    isCancelled: () => false,
  });
  assert.equal(result.row?.id, 'new');
  assert.equal(result.attempts, 3);
  assert.deepEqual(waits, [1500, 2000, 3000]);
});

test('pollForNewPush: never polls forever (five fetches, then gives up)', async () => {
  const waits: number[] = [];
  let fetches = 0;
  const result = await pollForNewPush({
    fetchRows: async () => { fetches += 1; return [{ id: 'old' }]; },
    ctx: { knownIds: ['old'], knownLoaded: true, clickedAtMs: 0 },
    wait: async (ms) => { waits.push(ms); },
    isCancelled: () => false,
  });
  assert.equal(result.row, null);
  assert.equal(result.attempts, 5);
  assert.equal(fetches, 5);
  assert.deepEqual(waits, [1500, 2000, 3000, 4000, 5000]);
});

test('pollForNewPush: fetch errors count as attempts and do not throw', async () => {
  let fetches = 0;
  const result = await pollForNewPush({
    fetchRows: async () => { fetches += 1; throw new Error('network'); },
    ctx: { knownIds: [], knownLoaded: true, clickedAtMs: 0 },
    wait: async () => undefined,
    isCancelled: () => false,
  });
  assert.equal(result.row, null);
  assert.equal(fetches, 5);
});

test('pollForNewPush: stops at once when cancelled (unmount)', async () => {
  let cancelled = false;
  let fetches = 0;
  const result = await pollForNewPush({
    fetchRows: async () => { fetches += 1; return []; },
    ctx: { knownIds: [], knownLoaded: true, clickedAtMs: 0 },
    wait: async () => { cancelled = true; },
    isCancelled: () => cancelled,
  });
  assert.equal(result.cancelled, true);
  assert.equal(fetches, 0);
});

test('pollForNewPush: a cancel that lands while a fetch is in flight discards its result', async () => {
  let cancelled = false;
  const result = await pollForNewPush({
    fetchRows: async () => { cancelled = true; return [{ id: 'new' }]; },
    ctx: { knownIds: [], knownLoaded: true, clickedAtMs: 0 },
    wait: async () => undefined,
    isCancelled: () => cancelled,
  });
  assert.equal(result.row, null);
  assert.equal(result.cancelled, true);
});
