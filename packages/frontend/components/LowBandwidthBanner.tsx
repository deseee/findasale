import React, { useState, useEffect } from 'react';
import { useLowBandwidth } from '../contexts/LowBandwidthContext';
import { useNetworkQuality } from '../hooks/useNetworkQuality';

/**
 * Low-Bandwidth Mode Banner (Feature #22)
 *
 * Dismissible banner shown when low bandwidth is detected or manually enabled.
 * Allows users to toggle low-bandwidth mode on/off.
 * Auto-dismisses after 8 seconds if shown via auto-detection (not manual override).
 */

const LowBandwidthBanner: React.FC = () => {
  const { isLowBandwidth, isManualOverride } = useLowBandwidth();
  const { toggleLowBandwidth } = useNetworkQuality();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Show if low bandwidth is active and not dismissed
  const shouldShow = isLowBandwidth && !dismissed;

  useEffect(() => {
    if (shouldShow) {
      setVisible(true);

      // Auto-dismiss after 8 seconds if not manually enabled
      if (!isManualOverride) {
        const timer = setTimeout(() => {
          setVisible(false);
        }, 8000);

        return () => clearTimeout(timer);
      }
    }
  }, [shouldShow, isManualOverride]);

  if (!shouldShow || !visible) {
    return null;
  }

  const handleToggle = () => {
    toggleLowBandwidth(!isLowBandwidth);
    setDismissed(true);
    setVisible(false);
  };

  const handleDismiss = () => {
    setDismissed(true);
    setVisible(false);
  };

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 transform transition-transform duration-300 ease-out ${
        visible ? 'translate-y-0' : '-translate-y-full'
      }`}
    >
      <div className="mx-4 mt-4 p-4 rounded-lg shadow-lg bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 border border-blue-300 dark:border-blue-700">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1">
            <svg
              className="w-5 h-5 flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
            </svg>
            <span className="text-sm font-semibold">
              {isManualOverride
                ? 'Low-bandwidth mode enabled. Photos are optimized.'
                : 'Slow connection detected. Reducing image quality.'}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleToggle}
              className="text-xs font-medium px-2 py-1 rounded bg-blue-200 dark:bg-blue-800 hover:bg-blue-300 dark:hover:bg-blue-700 transition-colors text-blue-900 dark:text-blue-100"
              aria-label={isManualOverride ? 'Disable low-bandwidth mode' : 'Enable low-bandwidth mode'}
            >
              {isManualOverride ? 'Disable' : 'Enable'}
            </button>
            <button
              onClick={handleDismiss}
              className="text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100 transition-colors p-1 -mr-1"
              aria-label="Dismiss notice"
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
    </div>
  );
};

export default LowBandwidthBanner;
