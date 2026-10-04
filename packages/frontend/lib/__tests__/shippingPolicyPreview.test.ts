/**
 * shippingPolicyPreview: custom eBay policy fields on the shipping preview response and the note shown for them.
 * Run: npm test   (node:test through tsx)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_POLICY_OPTION_LABEL,
  CUSTOM_POLICY_FALLBACK_MESSAGE,
  customPolicyNote,
  parseCustomPolicyInfo,
  policySelectionDiffersFromPreview,
} from '../shippingPolicyPreview';

test('custom-override response with all fields', () => {
  const info = parseCustomPolicyInfo({
    customPolicy: true,
    customPolicyId: 'p1',
    customPolicyName: 'Golf Club',
    customPolicyDescription: 'Up to 22 lb',
    message: 'Custom eBay policy selected. Buyer shipping is set by your eBay policy.',
  });
  assert.deepEqual(info, {
    isCustom: true,
    id: 'p1',
    name: 'Golf Club',
    description: 'Up to 22 lb',
    message: 'Custom eBay policy selected. Buyer shipping is set by your eBay policy.',
  });
});

test('null and missing fields read as null, never throw', () => {
  assert.deepEqual(parseCustomPolicyInfo({ customPolicy: true, customPolicyId: null, customPolicyName: null, customPolicyDescription: null }), {
    isCustom: true, id: null, name: null, description: null, message: null,
  });
  assert.equal(parseCustomPolicyInfo({ customPolicy: true }).name, null);
  assert.equal(parseCustomPolicyInfo(null).isCustom, false);
  assert.equal(parseCustomPolicyInfo(undefined).isCustom, false);
  assert.equal(parseCustomPolicyInfo('x').isCustom, false);
  assert.equal(parseCustomPolicyInfo([]).isCustom, false);
});

test('only customPolicy === true is custom; normal responses are not', () => {
  assert.equal(parseCustomPolicyInfo({ buyerShipping: 9.5, net: 20 }).isCustom, false);
  assert.equal(parseCustomPolicyInfo({ customPolicy: 'true' }).isCustom, false);
  assert.equal(parseCustomPolicyInfo({ customPolicy: false, customPolicyName: 'X' }).isCustom, false);
});

test('non-string and blank values read as null; strings are trimmed', () => {
  const info = parseCustomPolicyInfo({ customPolicy: true, customPolicyId: 5, customPolicyName: '   ', customPolicyDescription: ' Box up to 4 in ' });
  assert.equal(info.id, null);
  assert.equal(info.name, null);
  assert.equal(info.description, 'Box up to 4 in');
});

test('note names the policy when a name exists', () => {
  assert.equal(customPolicyNote('Golf Club'), 'Custom eBay policy: Golf Club. Buyer shipping is set by this policy.');
  assert.equal(customPolicyNote('  Guitar  ', 'ignored'), 'Custom eBay policy: Guitar. Buyer shipping is set by this policy.');
});

test('note falls back to the old sentence when the name is null or blank', () => {
  assert.equal(customPolicyNote(null), CUSTOM_POLICY_FALLBACK_MESSAGE);
  assert.equal(customPolicyNote(undefined), CUSTOM_POLICY_FALLBACK_MESSAGE);
  assert.equal(customPolicyNote('  '), CUSTOM_POLICY_FALLBACK_MESSAGE);
  assert.equal(customPolicyNote(null, 'Backend says so.'), 'Backend says so.');
  assert.equal(CUSTOM_POLICY_FALLBACK_MESSAGE, 'Custom eBay policy selected. Buyer shipping is set by your eBay policy.');
});

test('selection differs from the previewed policy only on a real change', () => {
  assert.equal(policySelectionDiffersFromPreview('p1', 'p1'), false);
  assert.equal(policySelectionDiffersFromPreview('p1', 'p2'), true);
  assert.equal(policySelectionDiffersFromPreview('p1', ''), true);
  assert.equal(policySelectionDiffersFromPreview(null, ''), false);
  assert.equal(policySelectionDiffersFromPreview(undefined, null), false);
  assert.equal(policySelectionDiffersFromPreview(null, 'p2'), true);
});

test('auto option label', () => {
  assert.equal(AUTO_POLICY_OPTION_LABEL, 'Auto (use my eBay default)');
});

test('no em dashes in the copy strings', async () => {
  const mod = await import('../shippingPolicyPreview');
  for (const v of Object.values(mod)) if (typeof v === 'string') assert.ok(!v.includes('—'));
});
