/**
 * EmptyState — Reusable component for empty content screens
 * Phase 27: Empty States + Microinteractions
 *
 * Features:
 * - Friendly icon/emoji
 * - Heading + subtext
 * - Optional CTA button/link
 * - Consistent styling
 */

import React from 'react';
import Link from 'next/link';

interface EmptyStateProps {
  icon?: string | React.ReactNode;
  heading: string;
  subtext?: string;
  cta?: {
    label: string;
    href: string;
  };
}

const EmptyState: React.FC<EmptyStateProps> = ({ icon = '📦', heading, subtext, cta }) => {
  return (
    <div className="text-center py-16 px-4">
      {typeof icon === 'string' ? (
        <p className="text-6xl mb-4">{icon}</p>
      ) : (
        <div className="flex justify-center mb-4">
          {icon}
        </div>
      )}
      <h2 className="text-xl font-semibold text-warm-900 mb-2">{heading}</h2>
      {subtext && <p className="text-warm-600 mb-6">{subtext}</p>}
      {cta && (
        <Link
          href={cta.href}
          className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
};

export default EmptyState;
