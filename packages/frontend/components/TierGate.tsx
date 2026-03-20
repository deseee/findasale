import React from 'react';
import Link from 'next/link';
import { useOrganizerTier, SubscriptionTier } from '../hooks/useOrganizerTier';

/**
 * TierGate — Wraps page content with a blurred overlay + upgrade CTA
 * when the current organizer's tier is below the required level.
 *
 * Usage:
 *   <TierGate requiredTier="PRO" featureName="Command Center">
 *     <CommandCenterContent />
 *   </TierGate>
 *
 * Pattern derived from brand-kit.tsx PRO section (the only correct upsell pattern).
 */
interface TierGateProps {
  requiredTier: SubscriptionTier;
  featureName?: string;
  description?: string;
  children: React.ReactNode;
}

export default function TierGate({
  requiredTier,
  featureName,
  description,
  children,
}: TierGateProps) {
  const { canAccess, tier } = useOrganizerTier();

  // User has access — render children normally
  if (canAccess(requiredTier)) {
    return <>{children}</>;
  }

  // User does NOT have access — show blurred content with overlay
  return (
    <div className="relative">
      {/* Blurred/grayed page content behind overlay */}
      <div
        className="pointer-events-none select-none"
        style={{ filter: 'blur(3px) grayscale(0.6)', opacity: 0.5 }}
        aria-hidden="true"
      >
        {children}
      </div>

      {/* Overlay card — centered on screen */}
      <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
        {/* Semi-transparent backdrop */}
        <div className="absolute inset-0 bg-white/60 dark:bg-gray-900/70" />

        {/* Upgrade card */}
        <div className="relative z-50 bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-xl shadow-2xl dark:shadow-gray-900/50 p-8 max-w-md w-full text-center">
          {/* Lock icon */}
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-blue-600 dark:text-blue-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>

          {/* Tier badge */}
          <span className="inline-block bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full mb-3">
            {requiredTier}
          </span>

          {/* Feature name */}
          {featureName && (
            <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-2">
              {featureName}
            </h2>
          )}

          {/* Description */}
          <p className="text-warm-600 dark:text-warm-400 mb-6 text-sm leading-relaxed">
            {description ||
              `This feature is available to ${requiredTier} and above subscribers. Upgrade your plan to unlock it.`}
          </p>

          {/* Current tier indicator */}
          <p className="text-xs text-warm-500 dark:text-warm-400 mb-4">
            Your current plan: <span className="font-semibold">{tier}</span>
          </p>

          {/* Upgrade CTA */}
          <Link
            href="/organizer/upgrade"
            className="inline-block w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-6 rounded-lg transition-colors text-center"
          >
            Upgrade to {requiredTier} →
          </Link>

          {/* Learn more link */}
          <Link
            href="/organizer/pro-features"
            className="block mt-3 text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            See all {requiredTier} features
          </Link>
        </div>
      </div>
    </div>
  );
}
