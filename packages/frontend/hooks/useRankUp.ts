import { useEffect, useRef } from 'react';
import useXpProfile from './useXpProfile';
import { useAuth } from '../components/AuthContext';

/**
 * useRankUp — monitors explorerRank changes and fires a callback when rank increases.
 * Only fires when rank goes UP (not down or stays same).
 */
const useRankUp = (onRankUp?: (newRank: string) => void) => {
  const { data: xpProfile, isLoading } = useXpProfile();
  const previousRankRef = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading || !xpProfile) {
      return;
    }

    const currentRank = xpProfile.explorerRank;

    // On first load, just set the reference without firing callback
    if (previousRankRef.current === null) {
      previousRankRef.current = currentRank;
      return;
    }

    // Define rank progression order
    const rankOrder = ['INITIATE', 'SCOUT', 'RANGER', 'SAGE', 'GRANDMASTER'];
    const prevIndex = rankOrder.indexOf(previousRankRef.current);
    const currIndex = rankOrder.indexOf(currentRank);

    // Only fire if rank increased
    if (currIndex > prevIndex && onRankUp) {
      onRankUp(currentRank);
    }

    previousRankRef.current = currentRank;
  }, [xpProfile, isLoading, onRankUp]);
};

export default useRankUp;
