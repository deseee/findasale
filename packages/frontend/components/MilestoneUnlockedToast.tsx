/**
 * MilestoneUnlockedToast: low-interrupt, bottom-right toast for Sale Passport unlocks
 * (new stamp or new milestone badge). Auto-dismisses after 5 seconds, skippable, no modal.
 * Design record: claude_docs/feature-notes/ADR-sale-passport-2026-09-29.md
 */

import React, { useEffect } from 'react';
import Link from 'next/link';

export interface UnlockToastItem {
  id: string;
  icon: string;
  title: string;
  message: string;
}

const shownIds = new Set<string>();

/**
 * Returns only the ids that have not been toasted yet in this browser session. Shared by every
 * surface that can show passport toasts (the Passport section and the global watcher), so the
 * same unlock never toasts twice while its "seen" write is still in flight.
 */
export function claimUnlockToasts(ids: string[]): string[] {
  const fresh: string[] = [];
  for (const id of ids) {
    if (!shownIds.has(id)) {
      shownIds.add(id);
      fresh.push(id);
    }
  }
  return fresh;
}

interface ToastRowProps {
  item: UnlockToastItem;
  onDismiss: (id: string) => void;
}

const ToastRow: React.FC<ToastRowProps> = ({ item, onDismiss }) => {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(item.id), 5000);
    return () => clearTimeout(t);
  }, [item.id, onDismiss]);

  return (
    <div
      role="status"
      className="pointer-events-auto flex items-start gap-3 max-w-xs w-full rounded-lg border border-amber-300 dark:border-amber-600 bg-white dark:bg-gray-800 shadow-lg dark:shadow-2xl p-3"
    >
      <span className="text-2xl leading-none" aria-hidden="true">{item.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-warm-900 dark:text-warm-100">{item.title}</p>
        <p className="text-xs text-warm-600 dark:text-warm-300 mt-0.5">{item.message}</p>
        <Link
          href="/shopper/achievements#sale-passport"
          className="inline-block mt-1 text-xs font-semibold text-sage-700 dark:text-sage-300 hover:underline"
          onClick={() => onDismiss(item.id)}
        >
          View Passport
        </Link>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        className="flex-shrink-0 text-warm-500 dark:text-warm-400 hover:text-warm-800 dark:hover:text-warm-100 text-lg leading-none"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
};

interface MilestoneUnlockedToastProps {
  items: UnlockToastItem[];
  onDismiss: (id: string) => void;
}

const MilestoneUnlockedToast: React.FC<MilestoneUnlockedToastProps> = ({ items, onDismiss }) => {
  if (items.length === 0) return null;
  return (
    <div
      className="fixed bottom-20 right-4 left-4 sm:left-auto z-50 flex flex-col items-end gap-2 pointer-events-none"
      aria-live="polite"
    >
      {items.map((item) => (
        <ToastRow key={item.id} item={item} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

export default MilestoneUnlockedToast;
