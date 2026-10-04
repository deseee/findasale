/**
 * VirtualList (ADR-134 #642, batch B8): a list that renders only the rows near the scroll position once it holds more
 * than VIRTUALIZE_THRESHOLD (200) rows; shorter lists are rendered in full with no inner scroll box.
 *
 * The windowing maths is in lib/virtualWindow.ts (tested). Row heights differ, so every rendered row reports its real
 * height (ResizeObserver) and the spacers above and below use measured heights where known, estimates elsewhere.
 *
 * Keyboard: the scroll box can take focus and scrolls with the arrow keys and Page Up and Page Down. Rows near the edge are
 * rendered ahead of time (overscan), so Tab always reaches the next row's controls, and the browser scrolls a focused
 * control into view, which renders the rows after it.
 */
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { DEFAULT_OVERSCAN, computeWindow, shouldVirtualize, withMeasurement } from '../../lib/virtualWindow';

export interface VirtualListProps<T> {
  items: readonly T[];
  getKey: (item: T) => string;
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Starting height guess in px for a row that has not been on screen yet. */
  estimateHeight: number;
  ariaLabel: string;
  /** Short usage hint read with the label. */
  hint?: string;
}

interface MeasuredRowProps {
  rowKey: string;
  onMeasure: (key: string, height: number) => void;
  setSize: number;
  position: number;
  children: React.ReactNode;
}

const MeasuredRow: React.FC<MeasuredRowProps> = ({ rowKey, onMeasure, setSize, position, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const report = () => onMeasure(rowKey, el.offsetHeight);
    report();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rowKey, onMeasure]);
  return (
    <div ref={ref} role="listitem" aria-setsize={setSize} aria-posinset={position}>
      {children}
    </div>
  );
};

function VirtualList<T>({ items, getKey, renderItem, estimateHeight, ariaLabel, hint }: VirtualListProps<T>) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(640);
  const [measured, setMeasured] = useState<Readonly<Record<string, number>>>({});
  const hintId = useId();

  const virtual = shouldVirtualize(items.length);
  const keys = useMemo(() => items.map(getKey), [items, getKey]);

  const onMeasure = useCallback((key: string, height: number) => {
    setMeasured((prev) => withMeasurement(prev, key, height));
  }, []);

  useEffect(() => {
    if (!virtual) return undefined;
    const el = boxRef.current;
    if (!el) return undefined;
    const read = () => setViewportHeight(el.clientHeight || 640);
    read();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', read);
      return () => window.removeEventListener('resize', read);
    }
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [virtual]);

  if (!virtual) {
    return (
      <div role="list" aria-label={ariaLabel} className="flex flex-col gap-3">
        {items.map((item, i) => (
          <div key={getKey(item)} role="listitem">
            {renderItem(item, i)}
          </div>
        ))}
      </div>
    );
  }

  const win = computeWindow({ keys, measured, estimate: estimateHeight, scrollTop, viewportHeight, overscan: DEFAULT_OVERSCAN });
  const rows: React.ReactNode[] = [];
  for (let i = win.start; i < win.end; i++) {
    const item = items[i];
    const key = keys[i];
    rows.push(
      <MeasuredRow key={key} rowKey={key} onMeasure={onMeasure} setSize={items.length} position={i + 1}>
        <div className="pb-3">{renderItem(item, i)}</div>
      </MeasuredRow>
    );
  }

  return (
    <div>
      {hint ? (
        <p id={hintId} className="mb-2 text-sm text-warm-600 dark:text-warm-300">
          {hint}
        </p>
      ) : null}
      <div
        ref={boxRef}
        role="list"
        aria-label={ariaLabel}
        aria-describedby={hint ? hintId : undefined}
        tabIndex={0}
        onScroll={(e) => setScrollTop((e.currentTarget as HTMLDivElement).scrollTop)}
        className="overflow-y-auto overscroll-contain rounded-lg border border-warm-200 p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-gray-700"
        style={{ maxHeight: 'min(75vh, 720px)' }}
      >
        <div aria-hidden="true" style={{ height: win.topPad }} />
        {rows}
        <div aria-hidden="true" style={{ height: win.bottomPad }} />
      </div>
    </div>
  );
}

export default VirtualList;
