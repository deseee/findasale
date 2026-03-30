/**
 * TypologyBadge.tsx — Feature #46: Treasure Typology Classifier
 *
 * Displays a typology category pill with confidence color and optional
 * "✓ Reviewed" indicator when an organizer has manually confirmed or corrected.
 */

import React from 'react';
import { TypologyCategory, TYPOLOGY_LABELS } from '../hooks/useTypology';

interface TypologyBadgeProps {
  primaryCategory: TypologyCategory;
  confidence: number; // 0–1 float
  isReviewed?: boolean;
  size?: 'sm' | 'md';
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.75) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 border-green-200 dark:border-green-800';
  if (confidence >= 0.5) return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100 border-amber-200 dark:border-amber-800';
  return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-100 border-red-200 dark:border-red-800';
}

export default function TypologyBadge({
  primaryCategory,
  confidence,
  isReviewed = false,
  size = 'md',
}: TypologyBadgeProps) {
  const label = TYPOLOGY_LABELS[primaryCategory] ?? primaryCategory;
  const pct = Math.round(confidence * 100);
  const colorClass = confidenceColor(confidence);
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-medium ${textSize} ${colorClass}`}
        title={`Confidence: ${pct}%`}
      >
        {label}
        <span className="opacity-70 font-normal">{pct}%</span>
      </span>
      {isReviewed && (
        <span
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-100 border border-green-200 dark:border-green-800 font-medium ${textSize}`}
          title="Manually reviewed by organizer"
        >
          ✓ Reviewed
        </span>
      )}
    </span>
  );
}
