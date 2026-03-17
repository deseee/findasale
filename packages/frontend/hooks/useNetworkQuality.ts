import { useState, useEffect } from 'react';

interface UseNetworkQualityReturn {
  isLowBandwidth: boolean;
  networkType: string;
  toggleLowBandwidth: (override: boolean) => void;
  isManualOverride: boolean;
}

const STORAGE_KEY = 'findasale_low_bandwidth';

/**
 * Hook to detect network quality and provide manual override capability.
 * Detects slow connections via navigator.connection API.
 * Falls back gracefully if API unavailable (server-side or unsupported browser).
 * Persists manual override to localStorage.
 */
export const useNetworkQuality = (): UseNetworkQualityReturn => {
  const [isLowBandwidth, setIsLowBandwidth] = useState(false);
  const [networkType, setNetworkType] = useState('unknown');
  const [isManualOverride, setIsManualOverride] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);

    // Check for manual override in localStorage
    const savedOverride = localStorage.getItem(STORAGE_KEY);
    if (savedOverride !== null) {
      const override = savedOverride === 'true';
      setIsManualOverride(override);
      setIsLowBandwidth(override);
      return;
    }

    // Check navigator.connection API
    if (!('connection' in navigator)) {
      // API not available (server-side or unsupported browser)
      setNetworkType('unknown');
      setIsLowBandwidth(false);
      return;
    }

    // Network Information API is not in standard TypeScript types
    const connection = (navigator as any).connection as any;
    if (!connection) {
      setNetworkType('unknown');
      setIsLowBandwidth(false);
      return;
    }

    const effectiveType = connection.effectiveType || 'unknown';
    const downlink = connection.downlink || 0;

    // Detect low bandwidth: 2g, slow-2g, or downlink < 0.5 Mbps
    const isLow =
      effectiveType === '2g' ||
      effectiveType === 'slow-2g' ||
      downlink < 0.5;

    setNetworkType(effectiveType);
    setIsLowBandwidth(isLow);

    // Listen for connection change events
    const handleConnectionChange = () => {
      const conn = (navigator as any).connection as any;
      if (!conn) return;

      const newEffectiveType = conn.effectiveType || 'unknown';
      const newDownlink = conn.downlink || 0;

      const newIsLow =
        newEffectiveType === '2g' ||
        newEffectiveType === 'slow-2g' ||
        newDownlink < 0.5;

      setNetworkType(newEffectiveType);
      setIsLowBandwidth(newIsLow);
    };

    connection.addEventListener('change', handleConnectionChange);

    return () => {
      connection.removeEventListener('change', handleConnectionChange);
    };
  }, []);

  const toggleLowBandwidth = (override: boolean) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, override ? 'true' : 'false');
    }
    setIsManualOverride(override);
    setIsLowBandwidth(override);
  };

  return {
    isLowBandwidth,
    networkType,
    toggleLowBandwidth,
    isManualOverride,
  };
};
