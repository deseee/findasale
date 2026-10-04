/**
 * cardConditionVisibility: when the card condition flow replaces the A to D grade picker.
 * Run: npm test   (node:test through tsx)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { showCardCondition } from '../cardConditionVisibility';

test('an item with a card record shows the card condition flow', () => {
  assert.equal(showCardCondition({ card: { game: 'MTG', conditionCode: null, grader: null, grade: null } }), true);
  assert.equal(showCardCondition({ card: { game: 'POKEMON', conditionCode: 'NM' } }), true);
  assert.equal(showCardCondition({ card: { releaseYear: 1999 } }), true);
});

test('an item without a card record keeps the A to D grade picker', () => {
  assert.equal(showCardCondition({ card: null }), false);
  assert.equal(showCardCondition({ card: undefined }), false);
  assert.equal(showCardCondition({}), false);
  assert.equal(showCardCondition(null), false);
  assert.equal(showCardCondition(undefined), false);
});

test('non-object card values are not card records', () => {
  assert.equal(showCardCondition({ card: '' }), false);
  assert.equal(showCardCondition({ card: 0 }), false);
  assert.equal(showCardCondition({ card: 'true' }), false);
  assert.equal(showCardCondition({ card: true }), false);
  assert.equal(showCardCondition({ card: [] }), false);
});
