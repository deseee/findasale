/**
 * useHaptics Hook
 * Provides haptic feedback using the Vibration API
 * Gracefully degrades on unsupported devices
 */

export function useHaptics() {
  const vibrate = (pattern: number | number[]): void => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch (error) {
        // Silently fail on devices that don't support or restrict vibration
        console.debug('Vibration API not available or restricted');
      }
    }
  };

  return { vibrate };
}
