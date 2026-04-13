/**
 * usePullToRefresh Hook
 * Implements pull-to-refresh gesture for mobile devices
 * Tracks touchstart Y position, shows indicator on drag >60px, triggers refetch on threshold
 */

import { useRef, useEffect, useState, useCallback } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => void | Promise<void>;
  threshold?: number;
  containerSelector?: string;
}

const DEFAULT_THRESHOLD = 60;

export function usePullToRefresh({
  onRefresh,
  threshold = DEFAULT_THRESHOLD,
  containerSelector = 'main',
}: UsePullToRefreshOptions) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const touchStartYRef = useRef<number>(0);
  const containerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Find the container element
    if (containerSelector) {
      containerRef.current = document.querySelector(containerSelector) as HTMLElement;
    } else {
      containerRef.current = document.querySelector('main') as HTMLElement;
    }

    if (!containerRef.current) return;

    const container = containerRef.current;
    let isScrollAtTop = false;

    const handleTouchStart = (e: TouchEvent): void => {
      touchStartYRef.current = e.touches[0].clientY;
      // Check if container is scrolled to top
      isScrollAtTop = container.scrollTop === 0 || window.scrollY === 0;
    };

    const handleTouchMove = (e: TouchEvent): void => {
      if (!isScrollAtTop || isRefreshing) return;

      const currentY = e.touches[0].clientY;
      const distance = currentY - touchStartYRef.current;

      // Only track downward pulls
      if (distance > 0) {
        setPullDistance(distance);
      }
    };

    const handleTouchEnd = async (): Promise<void> => {
      if (pullDistance >= threshold && !isRefreshing) {
        setIsRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setIsRefreshing(false);
        }
      }
      setPullDistance(0);
    };

    // Use passive event listeners for touch events for better performance
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: true });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onRefresh, threshold, isRefreshing, pullDistance, containerSelector]);

  return {
    isRefreshing,
    pullDistance,
    progress: Math.min(pullDistance / threshold, 1),
  };
}
