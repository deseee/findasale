import { useState, useEffect } from 'react';

/**
 * useCountUp — Lightweight count-up animation hook
 * Animates from 0 to a target value over 1.2 seconds with easing
 * No external animation libraries — uses requestAnimationFrame
 */
export const useCountUp = (targetValue: number, duration: number = 1200) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (targetValue <= 0) {
      setDisplayValue(0);
      return;
    }

    let startTime: number | null = null;
    let animationId: number;

    const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);

    const animate = (timestamp: number) => {
      if (startTime === null) {
        startTime = timestamp;
      }

      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = easeOutQuad(progress);
      const currentValue = targetValue * easeProgress;

      setDisplayValue(Math.floor(currentValue));

      if (progress < 1) {
        animationId = requestAnimationFrame(animate);
      }
    };

    animationId = requestAnimationFrame(animate);

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [targetValue, duration]);

  return displayValue;
};

export default useCountUp;
