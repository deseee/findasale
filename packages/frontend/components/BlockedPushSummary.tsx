/**
 * One persistent amber summary after a sale-level eBay push when some items were held back because they need more
 * information (package details and similar). It is a note, not an error: nothing failed. Shown instead of only a toast
 * that disappears. Item titles are shown, never ids.
 */
import React, { useEffect, useRef } from 'react';
import Link from 'next/link';

export const BlockedPushSummary: React.FC<{
  text: string;
  titles: string[];
  count: number;
  reviewHref: string;
  onDismiss?: () => void;
}> = ({ text, titles, count, reviewHref, onDismiss }) => {
  const more = count - titles.length;
  const rootRef = useRef<HTMLDivElement>(null);
  // The summary sits at the top of a long list while the push button is deep in it: bring it into view when it appears.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof window === 'undefined' || typeof el.scrollIntoView !== 'function') return;
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);
  return (
    <div
      ref={rootRef}
      role="status"
      data-testid="blocked-push-summary"
      className="mb-4 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3"
    >
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">{text}.</p>
      {titles.length > 0 ? (
        <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
          {titles.join(', ')}
          {more > 0 ? ` and ${more} more` : ''}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Link
          href={reviewHref}
          className="inline-flex items-center min-h-[44px] px-4 text-sm font-semibold rounded-lg bg-amber-700 hover:bg-amber-800 text-white"
        >
          Fix these items
        </Link>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="min-h-[44px] px-4 text-sm font-semibold rounded-lg border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100 bg-white dark:bg-gray-900"
          >
            Dismiss
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default BlockedPushSummary;
