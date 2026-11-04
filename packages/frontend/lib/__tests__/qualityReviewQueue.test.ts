/**
 * qualityReviewQueue: rapid-capture quality decisions are kept per capture.
 * Run: npm test   (node:test through tsx)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { currentQualityReview, enqueueQualityReview, removeQualityReview, QualityReviewEntry } from '../qualityReviewQueue';

const entry = (captureId: string, blob: string, tier: 2 | 3 = 2, appendToItemId: string | null = null): QualityReviewEntry<string> => ({
  captureId,
  blob,
  tier,
  appendToItemId,
});

test('a later capture does not overwrite an earlier pending photo', () => {
  let q: QualityReviewEntry<string>[] = [];
  q = enqueueQualityReview(q, entry('temp-A', 'blob-A', 2));
  q = enqueueQualityReview(q, entry('temp-B', 'blob-B', 3));
  const head = currentQualityReview(q);
  assert.equal(head?.captureId, 'temp-A');
  assert.equal(head?.blob, 'blob-A');
  assert.equal(head?.tier, 2);
});

test('deciding one capture leaves the next capture intact and shows it', () => {
  let q = [entry('temp-A', 'blob-A'), entry('temp-B', 'blob-B', 3, 'item-9')];
  q = removeQualityReview(q, 'temp-A');
  assert.deepEqual(currentQualityReview(q), entry('temp-B', 'blob-B', 3, 'item-9'));
  q = removeQualityReview(q, 'temp-B');
  assert.equal(currentQualityReview(q), null);
});

test('re-enqueueing the same capture replaces it in place', () => {
  let q = [entry('temp-A', 'old'), entry('temp-B', 'blob-B')];
  q = enqueueQualityReview(q, entry('temp-A', 'new', 3));
  assert.equal(q.length, 2);
  assert.equal(q[0].blob, 'new');
  assert.equal(q[1].captureId, 'temp-B');
});

test('removing an unknown capture is a no-op', () => {
  const q = [entry('temp-A', 'blob-A')];
  assert.deepEqual(removeQualityReview(q, 'temp-Z'), q);
});
