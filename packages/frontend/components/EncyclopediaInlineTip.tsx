import React from 'react';
import Link from 'next/link';
import { useEncyclopediaMatch, PriceBenchmark } from '../hooks/useEncyclopediaMatch';

interface EncyclopediaInlineTipProps {
  category?: string;
  tags?: string[];
  title?: string;
}

/**
 * EncyclopediaInlineTip — Inline price guidance during item editing.
 *
 * Shows below the price input:
 * ┌─────────────────────────────────────────────────┐
 * │ 📖 Similar items sell for $25–$85 (USED)        │
 * │    Based on: "Pyrex Mixing Bowl Sets"           │
 * │    [View full guide →]                          │
 * └─────────────────────────────────────────────────┘
 *
 * Features:
 * - Shows USED condition first, then GOOD/other if no USED
 * - Dark mode compatible
 * - Subtle amber/gold styling
 * - No loading skeleton (renders nothing while loading)
 */
const EncyclopediaInlineTip: React.FC<EncyclopediaInlineTipProps> = ({
  category,
  tags,
  title,
}) => {
  const { entry, benchmarks, isLoading } = useEncyclopediaMatch(category, tags, title);

  // No result — render nothing
  if (!entry || !benchmarks || benchmarks.length === 0) {
    return null;
  }

  // While loading — render nothing (no skeleton flash)
  if (isLoading) {
    return null;
  }

  // Find USED condition benchmark, or fallback to first available
  const usedBenchmark = benchmarks.find(b => b.condition === 'USED') || benchmarks[0];
  if (!usedBenchmark) {
    return null;
  }

  // Format price range in dollars
  const low = (usedBenchmark.priceRangeLow / 100).toFixed(0);
  const high = (usedBenchmark.priceRangeHigh / 100).toFixed(0);
  const condition = usedBenchmark.condition === 'USED' ? 'USED' : usedBenchmark.condition;

  return (
    <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
      <div className="flex items-start gap-2">
        <span className="text-base flex-shrink-0 mt-0.5">📖</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
            Similar items sell for <span className="font-bold">${low}–${high}</span> ({condition} condition)
          </p>
          <p className="text-xs text-amber-800 dark:text-amber-200 mt-0.5 line-clamp-1">
            Based on: "{entry.title}"
          </p>
          <Link
            href={`/encyclopedia/${entry.slug}`}
            className="text-xs text-amber-700 dark:text-amber-300 hover:underline font-medium mt-1 inline-block"
          >
            View full guide →
          </Link>
        </div>
      </div>
    </div>
  );
};

export default EncyclopediaInlineTip;
