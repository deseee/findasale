import { useEffect } from 'react';
import api from '../lib/api';
import { useDegradation } from '../contexts/DegradationContext';
import { useAuth } from '../components/AuthContext';

/**
 * Proactive Degradation Mode Hook (Feature #20)
 *
 * Polls `/api/health/latency` every 3 minutes when authenticated.
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

    // Poll every 3 minutes (2026-07-06: lengthened from 60s — degradation
    // mode does not need near-real-time detection, and this hook runs
    // globally in _app.tsx for every authenticated user on every page,
    // so shortening it directly multiplies Vercel Edge Request volume.
    const interval = setInterval(fetchHealth, 180000);

    return () => clearInterval(interval);
  }, [user, setIsDegraded, setLatencyMs]);

  return { isDegraded, latencyMs };
}
