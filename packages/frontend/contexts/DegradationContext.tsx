import React, { createContext, useContext, useState } from 'react';

/**
 * Proactive Degradation Mode Context (Feature #20)
 *
 * Global state for server degradation status.
 * Used by components to reduce image quality, disable analytics, preserve core flows.
 */

interface DegradationContextType {
  isDegraded: boolean;
  setIsDegraded: (value: boolean) => void;
  latencyMs: number;
  setLatencyMs: (value: number) => void;
}

const DegradationContext = createContext<DegradationContextType | undefined>(undefined);

export const DegradationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDegraded, setIsDegraded] = useState(false);
  const [latencyMs, setLatencyMs] = useState(0);

  return (
    <DegradationContext.Provider
      value={{
        isDegraded,
        setIsDegraded,
        latencyMs,
        setLatencyMs,
      }}
    >
      {children}
    </DegradationContext.Provider>
  );
};

export function useDegradation(): DegradationContextType {
  const context = useContext(DegradationContext);
  if (!context) {
    throw new Error('useDegradation must be used within DegradationProvider');
  }
  return context;
}
