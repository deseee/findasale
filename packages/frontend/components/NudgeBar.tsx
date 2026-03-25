import React, { useState, useEffect } from 'react';
import useNudges, { Nudge } from '../hooks/useNudges';
import { useAuth } from './AuthContext';

const NudgeBar: React.FC = () => {
  const { user } = useAuth();
  const { topNudge, loading } = useNudges(!!user);
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (topNudge && !dismissed) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
      }, 10000); // Auto-dismiss after 10 seconds

      return () => clearTimeout(timer);
    }
  }, [topNudge, dismissed]);

  if (!topNudge || dismissed || !visible || loading) {
    return null;
  }

  // Nudges are shopper-only features — don't show to organizers or admins
  if (user?.role === 'ORGANIZER' || user?.role === 'ADMIN' || user?.roles?.includes('ORGANIZER') || user?.roles?.includes('ADMIN')) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    setVisible(false);
  };

  const renderProgressBar = (nudge: Nudge) => {
    if (!nudge.progress) return null;

    const percentage = Math.min(
      (nudge.progress.current / nudge.progress.target) * 100,
      100
    );

    return (
      <div className="mt-2 w-full">
        <div className="relative h-2 bg-white/30 rounded-full overflow-hidden">
          <div
            className="absolute h-full bg-white transition-all duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div className="text-xs mt-1 opacity-90">
          {nudge.progress.current} / {nudge.progress.target}
        </div>
      </div>
    );
  };

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 transform transition-transform duration-300 ease-out ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
      style={{ bottom: '80px' }} // Above BottomTabNav
    >
      <div className="mx-4 mb-4 p-4 rounded-lg shadow-lg bg-gradient-to-r from-[#6B8F71] to-[#5a7a60] dark:from-[#5a7a60] dark:to-[#4a6a50] text-white dark:shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-sm font-semibold leading-snug">{topNudge.message}</p>
            {renderProgressBar(topNudge)}
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 text-white/70 hover:text-white transition-colors p-1 -mr-1"
            aria-label="Dismiss nudge"
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

export default NudgeBar;
