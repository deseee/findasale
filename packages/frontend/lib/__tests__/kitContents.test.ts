/**
 * kitContents: the pure rules behind the kit contents editor on the item edit page.
 * Run: npm test   (node:test through tsx)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KIT_MAX_COMPONENTS,
  buildKitComponentsPayload,
  kitAvailableLine,
  kitErrorText,
  kitPartsChanged,
  parseKitQuantity,
  partsFromComponents,
  previewKitAvailable,
  suggestKitPrice,
  validateKitParts,
  validateNewKit,
} from '../kitContents';
import type { KitDraftPart } from '../kitContents';

const part = (itemId: string, quantity: string, remaining = 10): KitDraftPart => ({ itemId, title: itemId, photoUrl: null, quantity, remaining });

test('parseKitQuantity accepts whole numbers 1 to 1000 only', () => {
  assert.equal(parseKitQuantity('1'), 1);
  assert.equal(parseKitQuantity(' 12 '), 12);
  assert.equal(parseKitQuantity('1000'), 1000);
  for (const bad of ['', '0', '1001', '1.5', '-2', 'a', '1e2']) assert.equal(parseKitQuantity(bad), null);
});

test('validateKitParts mirrors the server messages', () => {
  assert.equal(validateKitParts([]), 'Pick at least one item for the kit.');
  assert.match(validateKitParts([part('a', '1'), part('a', '2')]) ?? '', /only once/);
  assert.match(validateKitParts([part('a', '')]) ?? '', /whole number/);
  const many = Array.from({ length: KIT_MAX_COMPONENTS + 1 }, (_, i) => part(`i${i}`, '1'));
  assert.match(validateKitParts(many) ?? '', /at most 25/);
  assert.equal(validateKitParts([part('a', '1'), part('b', '3')]), null);
});

test('buildKitComponentsPayload sends numbers', () => {
  assert.deepEqual(buildKitComponentsPayload([part('a', '2'), part('b', ' 3')]), [{ itemId: 'a', quantity: 2 }, { itemId: 'b', quantity: 3 }]);
});

test('kitPartsChanged ignores order and whitespace, sees quantity, add and remove', () => {
  const saved = [part('a', '1'), part('b', '2')];
  assert.equal(kitPartsChanged(saved, [part('b', '2 '), part('a', '1')]), false);
  assert.equal(kitPartsChanged(saved, [part('a', '1'), part('b', '3')]), true);
  assert.equal(kitPartsChanged(saved, [part('a', '1')]), true);
  assert.equal(kitPartsChanged(saved, [part('a', '1'), part('b', '2'), part('c', '1')]), true);
  assert.equal(kitPartsChanged(saved, [part('a', '1'), part('c', '2')]), true);
});

test('previewKitAvailable is the smallest floor(remaining / quantity)', () => {
  assert.equal(previewKitAvailable([part('a', '2', 9), part('b', '1', 3)]), 3);
  assert.equal(previewKitAvailable([part('a', '5', 4)]), 0);
  assert.equal(previewKitAvailable([]), 0);
  assert.equal(previewKitAvailable([part('a', 'x', 9)]), 0);
});

test('partsFromComponents turns quantities into text', () => {
  const out = partsFromComponents([{ itemId: 'a', title: 'A', photoUrl: 'u', quantity: 4, remaining: 7 }]);
  assert.deepEqual(out, [{ itemId: 'a', title: 'A', photoUrl: 'u', quantity: '4', remaining: 7 }]);
});

test('kitAvailableLine and kitErrorText', () => {
  assert.equal(kitAvailableLine(3), '3 available, worked out from the items inside');
  assert.equal(kitErrorText({ response: { data: { error: 'This kit has already sold.' } } }), 'This kit has already sold.');
  assert.equal(kitErrorText({ response: { data: { message: 'm' } } }), 'm');
  assert.match(kitErrorText(new Error('x')), /Something went wrong/);
});

test('suggestKitPrice adds price times quantity in whole cents and skips unpriced items', () => {
  assert.equal(suggestKitPrice([{ ...part('a', '2'), price: 1.1 }, { ...part('b', '1'), price: 3 }]), 5.2);
  assert.equal(suggestKitPrice([{ ...part('a', '1'), price: null }, part('b', '1')]), 0);
  assert.equal(suggestKitPrice([{ ...part('a', 'x'), price: 4 }]), 0);
});

test('validateNewKit asks for a name, items, and a price only when it has to', () => {
  const ok = [part('a', '1')];
  assert.equal(validateNewKit('  ', ok, '', false), 'Give the kit a name.');
  assert.equal(validateNewKit('Set', [], '', false), 'Pick at least one item for the kit.');
  assert.equal(validateNewKit('Set', ok, '', false), null);
  assert.equal(validateNewKit('Set', ok, '', true), 'Enter a kit price greater than zero.');
  assert.equal(validateNewKit('Set', ok, '0', true), 'Enter a kit price greater than zero.');
  assert.equal(validateNewKit('Set', ok, '12.50', true), null);
});
