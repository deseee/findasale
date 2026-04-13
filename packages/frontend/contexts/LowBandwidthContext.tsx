import React, { createContext, useContext, useState } from 'react';

/**
 * Low-Bandwidth Mode Context (Feature #22)
 *
 * Global state for low-bandwidth detection and user override.
 * Used by components to reduce image quality, disable video previews, etc.
 */

interface LowBandwidthContextType {
  isLowBandwidth: boolean;
  setIsLowBandwidth: (value: boolean) => void;
  isManualOverride: boolean;
  setIsManualOverride: (value: boolean) => void;
  networkType: string;
  setNetworkType: (value: string) => void;
}

const LowBandwidthContext = createContext<LowBandwidthContextType | undefined>(undefined);

export const LowBandwidthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLowBandwidth, setIsLowBandwidth] = useState(false);
  const [isManualOverride, setIsManualOverride] = useState(false);
  const [networkType, setNetworkType] = useState('unknown');

  return (
    <LowBandwidthContext.Provider
      value={{
        isLowBandwidth,
        setIsLowBandwidth,
        isManualOverride,
        setIsManualOverride,
        networkType,
        setNetworkType,
      }}
    >
      {children}
    </LowBandwidthContext.Provider>
  );
};

export function useLowBandwidth(): LowBandwidthContextType {
  const context = useContext(LowBandwidthContext);
  if (!context) {
    throw new Error('useLowBandwidth must be used within LowBandwidthProvider');
  }
  return context;
}
