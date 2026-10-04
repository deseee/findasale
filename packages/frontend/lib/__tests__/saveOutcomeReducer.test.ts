import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SYNC_PAUSED_TEXT,
  describePlan,
  describePushOutcome,
  isSyncPausedView,
  reduceSaveOutcome,
  selectVisibleOutcome,
} from '../marketplaceImpact';
import type { SaveOutcomeState } from '../marketplaceImpact';

const pausedPlan = { ebay: { willPush: false, held: true, reason: 'held' } };
const pausedOutcome = (ext: string[] = []): SaveOutcomeState => ({
  phase: 'settled',
  view: describePlan(pausedPlan),
  extensionLines: ext,
});
const success = describePushOutcome({
  status: 'SUCCESS',
  fieldsPushed: ['description', 'title', 'condition'],
});

test('the paused text is shared by the plan and the push row', () => {
  assert.equal(describePlan(pausedPlan)?.text, SYNC_PAUSED_TEXT);
  assert.equal(describePushOutcome({ status: 'SKIPPED_HELD' }).text, SYNC_PAUSED_TEXT);
  assert.equal(isSyncPausedView(describePlan(pausedPlan)), true);
  assert.equal(isSyncPausedView(success), false);
  assert.equal(isSyncPausedView(null), false);
});

test('repush with an outcome replaces the older paused row', () => {
  const next = reduceSaveOutcome(pausedOutcome(['Needs manual update on Vinted.']), {
    type: 'repush',
    view: success,
    retry: false,
  });
  assert.ok(next);
  assert.equal(next.view?.text, 'eBay updated: description, title, condition');
  assert.equal(next.phase, 'settled');
  assert.deepEqual(next.extensionLines, ['Needs manual update on Vinted.']);
});

test('repush from the hold panel with no prior outcome sets the new outcome', () => {
  const next = reduceSaveOutcome(null, { type: 'repush', view: success, retry: false });
  assert.equal(next?.view?.tone, 'success');
  assert.deepEqual(next?.extensionLines, []);
});

test('a Retry replaces the row and drops extension lines, as before', () => {
  const failed: SaveOutcomeState = {
    phase: 'settled',
    view: describePushOutcome({ status: 'FAILED', errorMessage: 'nope' }),
    extensionLines: ['Needs manual update on Vinted.'],
  };
  const next = reduceSaveOutcome(failed, { type: 'repush', view: success, retry: true });
  assert.equal(next?.view?.text, 'eBay updated: description, title, condition');
  assert.deepEqual(next?.extensionLines, []);
});

test('message-only repush clears a paused or pending row but keeps extension prompts', () => {
  const ext = ['Needs manual update on Vinted.'];
  assert.equal(reduceSaveOutcome(pausedOutcome(), { type: 'repush', view: null, retry: false }), null);
  const withExt = reduceSaveOutcome(pausedOutcome(ext), { type: 'repush', view: null, retry: false });
  assert.deepEqual(withExt, { phase: 'settled', view: null, extensionLines: ext });
  const pending: SaveOutcomeState = {
    phase: 'pending',
    view: describePlan({ ebay: { willPush: true, fields: ['title'] } }),
    extensionLines: [],
  };
  assert.equal(reduceSaveOutcome(pending, { type: 'repush', view: null, retry: false }), null);
});

test('message-only repush leaves a still-true settled row alone, and null stays null', () => {
  const settled: SaveOutcomeState = { phase: 'settled', view: success, extensionLines: [] };
  assert.equal(reduceSaveOutcome(settled, { type: 'repush', view: null, retry: false }), settled);
  assert.equal(reduceSaveOutcome(null, { type: 'repush', view: null, retry: false }), null);
});

test('release clears a paused row (keeping extension prompts) and nothing else', () => {
  assert.equal(reduceSaveOutcome(pausedOutcome(), { type: 'release' }), null);
  assert.deepEqual(reduceSaveOutcome(pausedOutcome(['Needs manual update on Vinted.']), { type: 'release' }), {
    phase: 'settled',
    view: null,
    extensionLines: ['Needs manual update on Vinted.'],
  });
  const settled: SaveOutcomeState = { phase: 'settled', view: success, extensionLines: [] };
  assert.equal(reduceSaveOutcome(settled, { type: 'release' }), settled);
  assert.equal(reduceSaveOutcome(null, { type: 'release' }), null);
});

test('selectVisibleOutcome hides a paused row once the loaded status says nothing is held', () => {
  assert.equal(selectVisibleOutcome(pausedOutcome(), { heldAt: null }, true), null);
  assert.deepEqual(selectVisibleOutcome(pausedOutcome(['x.']), { heldAt: null }, true)?.extensionLines, ['x.']);
  assert.equal(selectVisibleOutcome(pausedOutcome(['x.']), { heldAt: null }, true)?.view, null);
});

test('selectVisibleOutcome keeps the paused row while held or before the status loads', () => {
  const o = pausedOutcome();
  assert.equal(selectVisibleOutcome(o, { heldAt: '2026-10-04T00:00:00Z' }, true), o);
  assert.equal(selectVisibleOutcome(o, { heldAt: null }, false), o);
  assert.equal(selectVisibleOutcome(null, { heldAt: null }, true), null);
});

test('selectVisibleOutcome never touches non-paused rows', () => {
  const o: SaveOutcomeState = { phase: 'settled', view: success, extensionLines: [] };
  assert.equal(selectVisibleOutcome(o, { heldAt: null }, true), o);
});
