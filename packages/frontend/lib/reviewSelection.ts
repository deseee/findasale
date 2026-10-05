/**
 * Review page selection helpers (Smart Review Queue bulk actions).
 *
 * The Review page keeps the selected item ids in a Set<string>. These pure helpers cover toggling one card,
 * select all across the cards that are visible (pending) right now, pruning ids whose cards left the queue
 * (approved, published, discarded), and the count and button wording shown in the bulk bar.
 *
 * Every function returns a NEW Set when something changed and the SAME Set when nothing did, so React state
 * updates can skip a pointless re-render.
 *
 * Pure module: no imports, no React.
 */

/** Add the id when absent, remove it when present. */
export function toggleSelection(prev: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Select every visible id (replaces the selection, so ids that are not visible are dropped). */
export function selectAllVisible(visibleIds: readonly string[]): Set<string> {
  return new Set(visibleIds);
}

/** Keep only ids that are still visible. Returns `prev` itself when nothing had to be dropped. */
export function pruneSelection(prev: ReadonlySet<string>, visibleIds: readonly string[]): ReadonlySet<string> {
  const visible = new Set(visibleIds);
  let dropped = false;
  prev.forEach((id) => {
    if (!visible.has(id)) dropped = true;
  });
  if (!dropped) return prev;
  const next = new Set<string>();
  prev.forEach((id) => {
    if (visible.has(id)) next.add(id);
  });
  return next;
}

/** True when there is at least one visible id and every one of them is selected. */
export function allVisibleSelected(selected: ReadonlySet<string>, visibleIds: readonly string[]): boolean {
  return visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
}

/** "3 selected" */
export function selectedCountText(count: number): string {
  return `${count} selected`;
}

/** "1 item" / "3 items" */
export function itemsCountText(count: number): string {
  return `${count} item${count === 1 ? '' : 's'}`;
}

/**
 * The bulk price a typed value stands for: a finite number above zero, rounded to cents (what the backend
 * writes). Empty, non-numeric, zero and negative input return null, so the Apply button stays disabled.
 */
export function parseBulkPriceInput(raw: string): number | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  const rounded = parseFloat(n.toFixed(2));
  return rounded > 0 ? rounded : null;
}

/** Label of the bulk price Apply button, for example "Set price to $12.50 on 3 items". */
export function bulkPriceButtonText(price: number | null, count: number): string {
  const target = itemsCountText(count);
  if (price === null) return `Set price on ${target}`;
  return `Set price to $${price.toFixed(2)} on ${target}`;
}

/** Label of the bulk category Apply button, for example "Apply category to 3 items". */
export function bulkCategoryButtonText(count: number): string {
  return `Apply category to ${itemsCountText(count)}`;
}
