import { useEffect } from 'react';
import { useNetworkQuality } from './useNetworkQuality';
import { useLowBandwidth } from '../contexts/LowBandwidthContext';

/**
 * Low-Bandwidth Initializer Hook (Feature #22)
 *
 * Syncs the useNetworkQuality hook state with the global LowBandwidthContext.
 * Monitors for network changes and updates the context accordingly.
 * Initializes on mount and listens for connection change events.
 */

export function useLowBandwidthInitializer() {
  const { isLowBandwidth, networkType, isManualOverride } = useNetworkQuality();
  const {
    setIsLowBandwidth,
    setNetworkType,
    setIsManualOverride,
  } = useLowBandwidth();

  useEffect(() => {
    // Sync state from hook to context on mount and whenever values change
    setIsLowBandwidth(isLowBandwidth);
    setNetworkType(networkType);
    setIsManualOverride(isManualOverride);
  }, [isLowBandwidth, networkType, isManualOverride, setIsLowBandwidth, setNetworkType, setIsManualOverride]);
}
