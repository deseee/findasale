import React, { useState, useEffect } from 'react';
import { useDegradation } from '../contexts/DegradationContext';
import { useOrganizerTier } from '../hooks/useOrganizerTier';
import { useAuth } from './AuthContext';

/**
 * Proactive Degradation Mode Banner (Feature #20)
 *
 * Dismissible amber banner shown to PRO/TEAMS organizers when server degradation detected.
 * Shoppers see no banner (silent degradation).
 * Auto-dismisses after 10 seconds or on manual close.
 */

const DegradationBanner: React.FC = () => {
  const { isDegraded } = useDegradation();
  const { user } = useAuth();
  const { tier } = useOrganizerTier();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Only show for authenticated PRO/TEAMS organizers
  const shouldShow = user && (tier === 'PRO' || tier === 'TEAMS') && isDegraded && !dismissed;

  useEffect(() => {
    if (shouldShow) {
      setVisible(true);

      // Auto-dismiss after 10 seconds
      const timer = setTimeout(() => {
        setVisible(false);
      }, 10000);

      return () => clearTimeout(timer);
    }
  }, [shouldShow]);

  if (!shouldShow || !visible) {
    return null;
  }

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 transform transition-transform duration-300 ease-out ${
        visible ? 'translate-y-0' : '-translate-y-full'
      }`}
    >
      <div className="mx-4 mt-4 p-4 rounded-lg shadow-lg bg-amber-100 dark:bg-amber-900 text-amber-900 dark:text-amber-100 border border-amber-300 dark:border-amber-700">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1">
            <svg
              className="w-5 h-5 flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-sm font-semibold">
              Slow connection detected — performance mode active
            </span>
          </div>
          <button
            onClick={() => {
              setDismissed(true);
              setVisible(false);
            }}
            className="flex-shrink-0 text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 transition-colors p-1 -mr-1"
            aria-label="Dismiss degradation notice"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default DegradationBanner;
