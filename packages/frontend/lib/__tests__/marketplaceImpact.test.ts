import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  computeSaveImpact,
  describeSaveImpact,
  describePlan,
  describePushOutcome,
  isInformationalPushCode,
  informationalPushLabel,
  informationalPushFix,
  describeBlockedPushes,
  INFORMATIONAL_PUSH_CODES,
  EBAY_SETTINGS_HREF,
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

test('describePushOutcome: SUCCESS where nothing was sent never says eBay was updated', () => {
  const none = describePushOutcome({ status: 'SUCCESS', fieldsAttempted: ['fccId'], fieldsPushed: [] });
  assert.equal(none.tone, 'success');
  assert.ok(!/eBay updated/.test(none.text));
  assert.match(none.text, /Nothing needed to be sent/);
  const mixed = describePushOutcome({ status: 'SUCCESS', fieldsAttempted: ['title', 'fccId'], fieldsPushed: ['title'] });
  assert.match(mixed.text, /^eBay updated: title\./);
  assert.match(mixed.text, /No change needed for FCC ID/);
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

test('fccId: a new or changed FCC ID on a listed item is planned as an eBay push, worded "FCC ID"', () => {
  const added = computeSaveImpact({ loadedItem: { ...loaded, fccId: null }, dirtyFields: { fccId: 'abc123xyz' }, held: false, ebayListed: true, extensionPlatformsListed: noExt });
  assert.deepEqual(added.ebay, { willPush: true, fields: ['fccId'] });
  assert.deepEqual(describeSaveImpact(added), ['Saving will update eBay: FCC ID.']);
  const changed = computeSaveImpact({ loadedItem: { ...loaded, fccId: 'OLD111AAA' }, dirtyFields: { fccId: 'ABC123XYZ', price: '50' }, held: false, ebayListed: true, extensionPlatformsListed: noExt });
  assert.deepEqual(changed.ebay.fields, ['price', 'fccId']);
});

test('fccId: unchanged (after normalizing), cleared or omitted does not push; not an extension-relevant field', () => {
  const same = computeSaveImpact({ loadedItem: { ...loaded, fccId: 'ABC123XYZ' }, dirtyFields: { fccId: ' abc123xyz ' }, held: false, ebayListed: true, extensionPlatformsListed: noExt });
  assert.deepEqual(same.ebay, { willPush: false, fields: [], reason: 'no_changes' });
  const cleared = computeSaveImpact({ loadedItem: { ...loaded, fccId: 'ABC123XYZ' }, dirtyFields: { fccId: '' }, held: false, ebayListed: true, extensionPlatformsListed: noExt });
  assert.equal(cleared.ebay.willPush, false);
  const ext = computeSaveImpact({ loadedItem: { ...loaded, fccId: null }, dirtyFields: { fccId: 'ABC123XYZ' }, held: false, ebayListed: true, extensionPlatformsListed: ['VINTED'] });
  assert.deepEqual(ext.extensions, []);
});

test('fccId: held and no-offer items report the field without pushing', () => {
  const held = computeSaveImpact({ loadedItem: { ...loaded, fccId: null }, dirtyFields: { fccId: 'ABC123XYZ' }, held: true, ebayListed: true, extensionPlatformsListed: noExt });
  assert.deepEqual(held.ebay, { willPush: false, fields: ['fccId'], reason: 'held' });
});

test('identifiers: a new or changed brand, MPN, UPC, EAN or ISBN on a listed item is planned as an eBay push, with the form wording', () => {
  const brand = computeSaveImpact({ loadedItem: { ...loaded, brand: 'Acme' }, dirtyFields: { brand: 'NewCo' }, held: false, ebayListed: true, extensionPlatformsListed: noExt });
  assert.deepEqual(brand.ebay, { willPush: true, fields: ['brand'] });
  assert.deepEqual(describeSaveImpact(brand), ['Saving will update eBay: brand.']);
  const all = computeSaveImpact({
    loadedItem: { ...loaded, brand: null, mpn: null, upc: null, ean: null, isbn: null },
    dirtyFields: { brand: 'Acme', mpn: 'X1', upc: '012345678905', ean: '4006381333931', isbn: '9781234567897' },
    held: false, ebayListed: true, extensionPlatformsListed: noExt,
  });
  assert.deepEqual(all.ebay.fields, ['brand', 'mpn', 'upc', 'ean', 'isbn']);
  assert.deepEqual(describeSaveImpact(all), ['Saving will update eBay: brand, MPN, UPC, EAN, ISBN.']);
});

test('identifiers: a clear counts as a change (the backend removes upc / ean and reports the rest)', () => {
  const cleared = computeSaveImpact({ loadedItem: { ...loaded, upc: '012345678905' }, dirtyFields: { upc: '' }, held: false, ebayListed: true, extensionPlatformsListed: noExt });
  assert.deepEqual(cleared.ebay, { willPush: true, fields: ['upc'] });
});

test('identifiers: unchanged after trimming, blank to null, or omitted does not push; not an extension-relevant field', () => {
  const same = computeSaveImpact({ loadedItem: { ...loaded, brand: 'Acme', mpn: null }, dirtyFields: { brand: ' Acme ', mpn: '' }, held: false, ebayListed: true, extensionPlatformsListed: noExt });
  assert.deepEqual(same.ebay, { willPush: false, fields: [], reason: 'no_changes' });
  const omitted = computeSaveImpact({ loadedItem: { ...loaded, brand: 'Acme' }, dirtyFields: {}, held: false, ebayListed: true, extensionPlatformsListed: noExt });
  assert.equal(omitted.ebay.willPush, false);
  const ext = computeSaveImpact({ loadedItem: { ...loaded, brand: null }, dirtyFields: { brand: 'Acme' }, held: false, ebayListed: true, extensionPlatformsListed: ['VINTED'] });
  assert.deepEqual(ext.extensions, []);
});

test('identifiers: held items report the fields without pushing; not-listed items say nothing', () => {
  const held = computeSaveImpact({ loadedItem: { ...loaded, mpn: null }, dirtyFields: { mpn: 'X1' }, held: true, ebayListed: true, extensionPlatformsListed: noExt });
  assert.deepEqual(held.ebay, { willPush: false, fields: ['mpn'], reason: 'held' });
  const unlisted = computeSaveImpact({ loadedItem: { ...loaded, mpn: null }, dirtyFields: { mpn: 'X1' }, held: false, ebayListed: false, extensionPlatformsListed: noExt });
  assert.deepEqual(unlisted.ebay, { willPush: false, fields: [], reason: 'not_listed' });
});

test('identifiers: push outcome rows use the same words', () => {
  const view = describePushOutcome({ status: 'PARTIAL', fieldsAttempted: ['title', 'brand'], fieldsPushed: ['title'], errorMessage: null });
  assert.match(view.text, /Could not update: brand\./);
});

test('describePushOutcome: a blocked push that needs package details is an amber note, not a failure', () => {
  const v = describePushOutcome({
    status: 'FAILED',
    fieldsAttempted: [],
    errorCode: 'NEEDS_PACKAGE_DETAILS',
    errorMessage: 'Shipping was not updated on eBay because this item has no package weight.',
  });
  assert.equal(v.tone, 'warning');
  assert.equal(v.canRetry, false);
  assert.match(v.text, /^Needs package details: /);
  assert.ok(!/fail/i.test(v.text));
  assert.equal(describePushOutcome({ status: 'FAILED', fieldsAttempted: [], errorCode: 'EBAY_NO_PACKAGE_WEIGHT' }).tone, 'warning');
  assert.match(describePushOutcome({ status: 'FAILED', fieldsAttempted: [], errorCode: 'POLICIES_NOT_CONFIGURED', errorMessage: 'Set up policies.' }).text, /^Finish eBay setup: /);
});

test('describePushOutcome: a real eBay error is still a red failure with Retry', () => {
  assert.deepEqual(
    describePushOutcome({ status: 'FAILED', fieldsAttempted: ['price'], errorCode: 'PUBLISH_FAILED', errorMessage: 'eBay rejected this listing.' }),
    { tone: 'error', text: 'eBay update failed: eBay rejected this listing.', canRetry: true }
  );
  assert.equal(describePushOutcome({ status: 'PARTIAL', fieldsAttempted: ['price', 'title'], fieldsPushed: ['price'], errorCode: 'INVENTORY_PUT_FAILED' }).canRetry, true);
});

test('informational push codes', () => {
  assert.equal(isInformationalPushCode('NEEDS_PACKAGE_DETAILS'), true);
  assert.equal(isInformationalPushCode('PUBLISH_FAILED'), false);
  assert.equal(isInformationalPushCode(null), false);
  assert.equal(informationalPushLabel('EBAY_WEIGHT_NOT_CONFIRMED'), 'Needs package details');
  assert.equal(informationalPushLabel('EBAY_BOOK_NO_ISBN'), 'Needs ISBN');
  assert.equal(informationalPushLabel('POLICIES_NOT_CONFIGURED'), 'Finish eBay setup');
  assert.equal(informationalPushLabel('NO_FULFILLMENT_POLICY_MATCH'), 'Finish eBay setup');
  for (const c of ['NEEDS_PACKAGE_DETAILS', 'EBAY_NO_PACKAGE_WEIGHT', 'EBAY_WEIGHT_NOT_CONFIRMED', 'EBAY_PACKAGE_DIMS_NOT_CONFIRMED']) {
    assert.equal(informationalPushLabel(c), 'Needs package details');
    assert.equal(informationalPushFix(c), 'package');
  }
  assert.equal(informationalPushFix('POLICIES_NOT_CONFIGURED'), 'ebay-settings');
  assert.equal(informationalPushFix('PUBLISH_FAILED'), null);
  assert.equal(EBAY_SETTINGS_HREF, '/organizer/settings?tab=ebay');
  assert.equal(informationalPushLabel('HTTP_500'), null);
});

test('describeBlockedPushes: one summary with counts and item titles, never ids; real errors are not included', () => {
  const titles: Record<string, string> = { a: 'Brass lamp', b: 'Oak table', c: 'Vase', d: 'Rug' };
  const sum = describeBlockedPushes(
    [
      { itemId: 'a', status: 'error', code: 'EBAY_NO_PACKAGE_WEIGHT', informational: true },
      { itemId: 'b', status: 'error', error: 'NEEDS_PACKAGE_DETAILS', informational: true },
      { itemId: 'c', status: 'error', code: 'EBAY_WEIGHT_NOT_CONFIRMED', informational: true },
      { itemId: 'd', status: 'error', code: 'PUBLISH_FAILED' },
      { itemId: 'e', status: 'success' },
    ],
    (id) => titles[id]
  );
  assert.ok(sum);
  assert.equal(sum!.text, '3 items need package details before they can go to eBay');
  assert.equal(sum!.count, 3);
  assert.deepEqual(sum!.titles, ['Brass lamp', 'Oak table', 'Vase']);
  assert.ok(!/\b[abcd]\b/.test(sum!.text));
  assert.equal(describeBlockedPushes([{ itemId: 'd', status: 'error', code: 'PUBLISH_FAILED' }], () => null), null);
  assert.equal(describeBlockedPushes([], () => null), null);
  assert.equal(describeBlockedPushes([{ itemId: 'x', status: 'error', code: 'EBAY_NO_PACKAGE_WEIGHT' }], () => 'Lamp')!.text, '1 item needs package details before it can go to eBay');
  assert.equal(describeBlockedPushes([{ itemId: 'x', status: 'error', code: 'POLICIES_NOT_CONFIGURED' }], () => 'Lamp')!.text, 'Finish eBay setup before 1 item can go to eBay');
  assert.equal(describeBlockedPushes([{ itemId: 'x', status: 'error', code: 'EBAY_BOOK_NO_ISBN' }], () => null)!.titles[0], 'Untitled item');
});

test('parity: the frontend informational code list equals the backend list', () => {
  const file = path.resolve(__dirname, '../../../backend/src/lib/ebayPushInformational.ts');
  const src = fs.readFileSync(file, 'utf8');
  const block = src.match(/INFORMATIONAL_PUSH_CODES[^=]*=\s*\[([\s\S]*?)\];/);
  assert.ok(block, 'backend list not found');
  const backend = Array.from(block![1].matchAll(/'([A-Z0-9_]+)'/g)).map((m) => m[1]).sort();
  assert.deepEqual([...INFORMATIONAL_PUSH_CODES].sort(), backend);
});
