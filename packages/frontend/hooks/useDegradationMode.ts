import { useEffect } from 'react';
import api from '../lib/api';
import { useDegradation } from '../contexts/DegradationContext';
import { useAuth } from '../components/AuthContext';

/**
 * Proactive Degradation Mode Hook (Feature #20)
 *
 * Polls `/api/health/latency` every 10 seconds when authenticated.
 * Updates global degradation state based on server response.
 *
 * Returns: { isDegraded, latencyMs }
 */

interface LatencyStatus {
  status: string;
  latencyMs: number;
  degraded: boolean;
  timestamp: number;
}

export function useDegradationMode() {
  const { isDegraded, setIsDegraded, latencyMs, setLatencyMs } = useDegradation();
  const { user } = useAuth();

  useEffect(() => {
    // Only poll if authenticated (don't waste bandwidth on anon users)
    if (!user) {
      return;
    }

    // Fetch health status immediately on mount
    const fetchHealth = async () => {
      try {
        const response = await api.get<LatencyStatus>('/health/latency');
        const { degraded, latencyMs: latency } = response.data;
        setIsDegraded(degraded);
        setLatencyMs(latency);
      } catch (error) {
        // Silently fail — health check errors shouldn't break the UI
        console.debug('Health check failed:', error);
      }
    };

    fetchHealth();

    // Poll every 60 seconds
    const interval = setInterval(fetchHealth, 60000);

    return () => clearInterval(interval);
  }, [user, setIsDegraded, setLatencyMs]);

  return { isDegraded, latencyMs };
}
