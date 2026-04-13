'use client';

import React, { useState } from 'react';

interface NearMissNudgeProps {
  /**
   * Current progress value (e.g., items listed, photos uploaded)
   */
  current: number;

  /**
   * Target milestone value (e.g., 10 items, 50 photos)
   */
  target: number;

  /**
   * Reward label (e.g., "completed your listing", "unlocked a badge")
   */
  reward: string;

  /**
   * Unit label for the gap (default: "items")
   */
  unit?: string;
}

const NearMissNudge: React.FC<NearMissNudgeProps> = ({
  current,
  target,
  reward,
  unit = 'items',
}) => {
  const [dismissed, setDismissed] = useState(false);

  // Only render if within 40% of target AND not yet at target
  const progress = current / target;
  const shouldShow = progress >= 0.6 && current < target;

  if (!shouldShow || dismissed) {
    return null;
  }

  const gap = target - current;
  const percentComplete = Math.round(progress * 100);

  return (
    <div
      className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-lg p-4 mb-6 shadow-sm"
      role="status"
      aria-live="polite"
      aria-label={`You're ${gap} ${unit} away from ${reward}`}
    >
      <div className="flex items-start gap-4">
        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Main Message */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">✨</span>
            <p className="text-sm font-semibold text-amber-900">
              You're <span className="font-bold">{gap}</span> {unit}{gap > 1 ? 's' : ''} away from {reward}!
            </p>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1">
            <div className="w-full bg-amber-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-amber-400 to-yellow-400 h-2 rounded-full transition-all duration-500"
                style={{ width: `${percentComplete}%` }}
              />
            </div>
            <p className="text-xs text-amber-700">
              {current} of {target} complete
            </p>
          </div>
        </div>

        {/* Dismiss Button */}
        <button
          onClick={() => setDismissed(true)}
          className="flex-shrink-0 text-amber-400 hover:text-amber-600 transition-colors p-1"
          aria-label="Dismiss"
          title="Dismiss this message"
        >
          <svg
            className="w-5 h-5"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default NearMissNudge;
