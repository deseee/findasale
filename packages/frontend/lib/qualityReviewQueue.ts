/**
 * Rapid capture lighting-quality review queue (2026-11-04).
 *
 * Rapidfire runs several capture pipelines at once. The quality warning used one set of page-level
 * state (blob, temp id, append target), and every capture wrote the blob, so "Use photo" on photo A
 * could upload photo B's image, and a second dim photo replaced the first one's temp id. Each
 * capture that needs a decision now gets its own entry, keyed by its capture (temp) id. The modal
 * always shows the oldest entry, and a decision only ever touches that entry.
 *
 * Pure functions over an immutable array so React state updaters stay race-free.
 */

export interface QualityReviewEntry<TBlob = Blob> {
  /** The capture's temp item id (unique per capture). */
  captureId: string;
  blob: TBlob;
  /** Item the photo is appended to, or null when the capture creates a new item. */
  appendToItemId: string | null;
  tier: 2 | 3;
}

/** Adds an entry, replacing any existing entry for the same capture. Order is capture order. */
export function enqueueQualityReview<TBlob>(
  queue: readonly QualityReviewEntry<TBlob>[],
  entry: QualityReviewEntry<TBlob>
): QualityReviewEntry<TBlob>[] {
  const idx = queue.findIndex((e) => e.captureId === entry.captureId);
  if (idx === -1) return [...queue, entry];
  const next = queue.slice();
  next[idx] = entry;
  return next;
}

/** The entry the modal shows (the oldest pending decision), or null. */
export function currentQualityReview<TBlob>(queue: readonly QualityReviewEntry<TBlob>[]): QualityReviewEntry<TBlob> | null {
  return queue.length > 0 ? queue[0] : null;
}

/** Removes the entry for one capture; every other capture's entry is left as it was. */
export function removeQualityReview<TBlob>(
  queue: readonly QualityReviewEntry<TBlob>[],
  captureId: string
): QualityReviewEntry<TBlob>[] {
  return queue.filter((e) => e.captureId !== captureId);
}
