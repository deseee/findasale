/**
 * Review page bulk category helpers (Wave 3, F3).
 *
 * The bulk category picker returns an eBay L1 name, a leaf id and a leaf name. POST /items/bulk applies one
 * operation per call, and the three fields are three operations: `category`, `ebayCategoryId`,
 * `ebayCategoryName`. The `category` operation alone is NOT enough: it only sets Item.category (and, on the
 * backend, only for a short lowercase whitelist), it never sets the eBay leaf id or name.
 *
 * These pure helpers plan the operations (run them one after another, never as concurrent mutate() calls on
 * one mutation object) and word the failure so the organizer can see exactly what was and was not applied.
 *
 * Pure module: no imports, no React.
 */

export type BulkCategoryOperation = 'category' | 'ebayCategoryId' | 'ebayCategoryName';

export interface BulkCategoryPayload {
  l1CategoryName: string;
  leafCategoryId: string;
  leafCategoryName: string;
}

export interface PlannedBulkOp {
  operation: BulkCategoryOperation;
  value: string;
}

const OPERATION_LABELS: Record<BulkCategoryOperation, string> = {
  category: 'category',
  ebayCategoryId: 'eBay category ID',
  ebayCategoryName: 'eBay category name',
};

/**
 * Ordered operations to send. `category` goes first: it is the one the backend can reject (whitelist) without
 * having changed anything, so a rejection leaves every field untouched. The eBay id is sent only when it is
 * 1 to 10 digits (the backend rule) and the eBay name only when non-empty and at most 200 characters. An
 * empty list means there is nothing valid to send (for example the picker was cleared).
 */
export function planBulkCategoryOps(payload: BulkCategoryPayload): PlannedBulkOp[] {
  const ops: PlannedBulkOp[] = [];
  const l1 = (payload.l1CategoryName ?? '').trim();
  const id = (payload.leafCategoryId ?? '').trim();
  const name = (payload.leafCategoryName ?? '').trim();
  if (l1) ops.push({ operation: 'category', value: l1 });
  if (/^\d{1,10}$/.test(id)) ops.push({ operation: 'ebayCategoryId', value: id });
  // eslint-disable-next-line no-control-regex
  if (name && name.length <= 200 && !/[\u0000-\u001f\u007f]/.test(name)) {
    ops.push({ operation: 'ebayCategoryName', value: name });
  }
  return ops;
}

/**
 * Message for a failed step. `applied` lists the operations that already succeeded before the failure.
 *   nothing applied: 'No categories were changed. <server message>'
 *   some applied:    'Only part of the category change was applied. Changed: category. Not changed: eBay
 *                     category ID, eBay category name. <server message>'
 */
export function bulkCategoryFailureMessage(
  failedOperation: BulkCategoryOperation,
  applied: readonly BulkCategoryOperation[],
  allOps: readonly BulkCategoryOperation[],
  serverMessage: string | null | undefined,
): string {
  const rawDetail = (serverMessage && serverMessage.trim()) || 'The update failed.';
  const detail = /[.!?]$/.test(rawDetail) ? rawDetail : `${rawDetail}.`;
  if (applied.length === 0) {
    const hint =
      failedOperation === 'category'
        ? ' You can still set the category on each item.'
        : '';
    return `No categories were changed. ${detail}${hint}`;
  }
  const changed = applied.map((o) => OPERATION_LABELS[o]).join(', ');
  const notChanged = allOps
    .filter((o) => !applied.includes(o))
    .map((o) => OPERATION_LABELS[o])
    .join(', ');
  return `Only part of the category change was applied. Changed: ${changed}. Not changed: ${notChanged}. ${detail}`;
}

/** Message for a 207 (some items could not be changed by the category step). Null when none failed. */
export function bulkCategoryPartialItemsMessage(
  responseData: unknown,
  updatedCount: number,
): string | null {
  const failed = (responseData as { failed?: unknown } | null | undefined)?.failed;
  if (!Array.isArray(failed) || failed.length === 0) return null;
  const reason =
    typeof (failed[0] as { reason?: unknown })?.reason === 'string'
      ? (failed[0] as { reason: string }).reason
      : 'Not changed';
  const n = failed.length;
  return `Category updated for ${updatedCount} item${updatedCount !== 1 ? 's' : ''}. ${n} item${n !== 1 ? 's were' : ' was'} not changed: ${reason}`;
}
