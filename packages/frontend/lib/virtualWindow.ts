/**
 * virtualWindow (ADR-134 #642, batch B8): a small windowing helper for long lists (no dependency).
 *
 * Step B of the card intake can show up to 500 rows that each hold a picker. Above VIRTUALIZE_THRESHOLD rows only the rows
 * near the scroll position are rendered; the space of the others is kept with two spacer blocks, so the scrollbar and the
 * scroll position stay true. Row heights differ (a row with five candidates is tall), so each row starts at an estimated
 * height and is replaced by its measured height once it has been on screen.
 *
 * Pure functions, no DOM: lib/__tests__/virtualWindow.test.ts. components/cardIntake/VirtualList.tsx does the measuring.
 */

export const VIRTUALIZE_THRESHOLD = 200;
export const DEFAULT_OVERSCAN = 4;

export function shouldVirtualize(count: number, threshold: number = VIRTUALIZE_THRESHOLD): boolean {
  return count > threshold;
}

export interface WindowInput {
  /** Stable key of every item, in order. */
  keys: readonly string[];
  /** Measured height in px by key. Items not in here use `estimate`. */
  measured: Readonly<Record<string, number>>;
  estimate: number;
  scrollTop: number;
  viewportHeight: number;
  overscan?: number;
}

export interface WindowResult {
  /** First rendered index (inclusive). */
  start: number;
  /** One past the last rendered index. */
  end: number;
  /** Height of the spacer above the rendered rows. */
  topPad: number;
  /** Height of the spacer below the rendered rows. */
  bottomPad: number;
  totalHeight: number;
}

function heightOf(input: WindowInput, index: number): number {
  const key = input.keys[index];
  if (Object.prototype.hasOwnProperty.call(input.measured, key)) {
    const h = input.measured[key];
    if (h > 0) return h;
  }
  return input.estimate > 0 ? input.estimate : 1;
}

export function computeWindow(input: WindowInput): WindowResult {
  const count = input.keys.length;
  if (count === 0) return { start: 0, end: 0, topPad: 0, bottomPad: 0, totalHeight: 0 };
  const overscan = Math.max(0, input.overscan === undefined ? DEFAULT_OVERSCAN : input.overscan);
  const scrollTop = Math.max(0, input.scrollTop);
  const bottomEdge = scrollTop + Math.max(0, input.viewportHeight);

  let total = 0;
  let firstVisible = -1;
  let lastVisible = -1;
  for (let i = 0; i < count; i++) {
    const h = heightOf(input, i);
    const top = total;
    const bottom = top + h;
    if (firstVisible < 0 && bottom > scrollTop) firstVisible = i;
    if (top < bottomEdge && bottom > scrollTop) lastVisible = i;
    total = bottom;
  }
  // Scrolled past the end (the list shrank): show the last rows.
  if (firstVisible < 0) {
    firstVisible = count - 1;
    lastVisible = count - 1;
  }
  if (lastVisible < firstVisible) lastVisible = firstVisible;

  const start = Math.max(0, firstVisible - overscan);
  const end = Math.min(count, lastVisible + 1 + overscan);
  let topPad = 0;
  for (let i = 0; i < start; i++) topPad += heightOf(input, i);
  let rendered = 0;
  for (let i = start; i < end; i++) rendered += heightOf(input, i);
  return { start, end, topPad, bottomPad: Math.max(0, total - topPad - rendered), totalHeight: total };
}

/** Top offset of one item, used to scroll a row into view. */
export function offsetOfIndex(input: Pick<WindowInput, 'keys' | 'measured' | 'estimate'>, index: number): number {
  let top = 0;
  const upto = Math.min(index, input.keys.length);
  for (let i = 0; i < upto; i++) top += heightOf({ ...input, scrollTop: 0, viewportHeight: 0 }, i);
  return top;
}

/** Records a measurement; returns the same object when nothing changed (so a state update can be skipped). */
export function withMeasurement(measured: Readonly<Record<string, number>>, key: string, height: number): Readonly<Record<string, number>> {
  const h = Math.round(height);
  if (!(h > 0)) return measured;
  if (Object.prototype.hasOwnProperty.call(measured, key) && measured[key] === h) return measured;
  const next: Record<string, number> = {};
  Object.keys(measured).forEach((k) => {
    Object.defineProperty(next, k, { value: measured[k], enumerable: true, writable: true, configurable: true });
  });
  Object.defineProperty(next, key, { value: h, enumerable: true, writable: true, configurable: true });
  return next;
}
