import { useState, useCallback } from 'react';

/**
 * useHeartAnimation — Hook for heart favorite animation
 * Phase 27: Microinteractions
 *
 * Provides brief animation state for heart buttons on favorite toggle
 */

export const useHeartAnimation = () => {
  const [isAnimating, setIsAnimating] = useState(false);

  const triggerAnimation = useCallback(() => {
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 600);
  }, []);

  return { isAnimating, triggerAnimation };
};

export default useHeartAnimation;
