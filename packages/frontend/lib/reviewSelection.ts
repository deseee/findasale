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

// ── Sticky action bar ───────────────────────────────────────────────────────────────────────────────────────
// The site layout wraps every page in `overflow-x-hidden`, which turns that wrapper into the scroll container
// for CSS `position: sticky`. The wrapper never scrolls (the window does), so a sticky bar inside it never
// sticks. The Review page therefore pins its action bar itself: it watches where the bar's in-flow slot is and
// switches the bar to `position: fixed` once the slot scrolls under the site header. These helpers hold the
// numbers and the decisions so they can be tested without a browser.

/**
 * Width at which Tailwind's `lg` breakpoint starts. The site layout changes here: below it the header is 48px
 * and a 47px fixed search bar sits under it; from it up the header is 64px and the search bar is gone.
 */
export const LG_BREAKPOINT_PX = 1024;
/** Below lg: 48px fixed header + 47px fixed search bar = 95px, plus a 1px gap. */
export const PHONE_STICKY_TOP_PX = 96;
/** lg and up: the same offset the site uses elsewhere for content under the 64px header (`top-20`). */
export const DESKTOP_STICKY_TOP_PX = 80;

/** Distance from the top of the window at which the bar should rest, so it sits just under the fixed header(s). */
export function stickyTopOffset(viewportWidth: number): number {
  return viewportWidth >= LG_BREAKPOINT_PX ? DESKTOP_STICKY_TOP_PX : PHONE_STICKY_TOP_PX;
}

/** True once the bar's in-flow slot has scrolled up past the resting offset, so the bar must be pinned. */
export function isBarStuck(slotTop: number, offset: number): boolean {
  return slotTop < offset;
}

export type BulkPanel = 'price' | 'category';

export interface BulkBarLayout {
  /** The selection row (count, Clear, Set price, Set category) is shown. */
  showSelectionRow: boolean;
  /** Which inline panel is open under the selection row (never open with nothing selected). */
  panel: BulkPanel | null;
  /**
   * The stats row (pending count, Discard all, Approve all) is hidden on phones while a panel is open, so the
   * pinned bar stays well under half the screen. It is always shown from the `sm` breakpoint up, and returns
   * on phones as soon as the panel is closed.
   */
  hideStatsOnPhone: boolean;
}

/** Which rows of the pinned bar are visible, given how many cards are selected and which panel was opened. */
export function bulkBarLayout(selectedCount: number, bulkMode: BulkPanel | null): BulkBarLayout {
  const showSelectionRow = selectedCount > 0;
  const panel = showSelectionRow ? bulkMode : null;
  return { showSelectionRow, panel, hideStatsOnPhone: panel !== null };
}

/**
 * Whether a key press should close the open bulk panel (Set price / Set category). Only a plain Escape does,
 * and only while a panel is open, no confirm dialog or camera overlay is open (those own Escape), the event
 * was not already handled by something else (for example a menu), and it is not part of IME composition.
 */
export function shouldCloseBulkPanelOnKey(opts: {
  key: string;
  panelOpen: boolean;
  overlayOpen: boolean;
  defaultPrevented?: boolean;
  isComposing?: boolean;
}): boolean {
  return opts.key === 'Escape' && opts.panelOpen && !opts.overlayOpen && !opts.defaultPrevented && !opts.isComposing;
}
