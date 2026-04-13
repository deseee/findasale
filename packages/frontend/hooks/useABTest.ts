import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';

export type Variant = 'A' | 'B';

interface ABTestHook {
  variant: Variant;
  track: (event: string) => Promise<void>;
  isLoading: boolean;
}

/**
 * useABTest — Manage A/B test variant assignment and event tracking.
 * - Gets or creates a session ID from localStorage (key: 'fsa_session_id')
 * - Fetches variant assignment on mount
 * - Returns variant and track function
 * - Defaults to 'A' while loading to prevent flicker
 */
export const useABTest = (testName: string): ABTestHook => {
  const [variant, setVariant] = useState<Variant>('A');
  const [sessionId, setSessionId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  // Initialize session ID on mount
  useEffect(() => {
    const storedSessionId = localStorage.getItem('fsa_session_id');
    if (storedSessionId) {
      setSessionId(storedSessionId);
    } else {
      // Generate a new session ID if one doesn't exist
      // Use crypto.randomUUID if available, otherwise fall back to cuid pattern
      let newSessionId: string;
      if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
        newSessionId = window.crypto.randomUUID();
      } else {
        // Simple fallback: timestamp + random string
        newSessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
      localStorage.setItem('fsa_session_id', newSessionId);
      setSessionId(newSessionId);
    }
  }, []);

  // Fetch variant assignment
  useEffect(() => {
    if (!sessionId || !testName) return;

    const fetchVariant = async () => {
      try {
        setIsLoading(true);
        const response = await api.post('/ab/variant', {
          testName,
          sessionId,
        });
        setVariant((response.data.variant as Variant) || 'A');
      } catch (error) {
        console.error('Error fetching A/B variant:', error);
        // Default to 'A' on error
        setVariant('A');
      } finally {
        setIsLoading(false);
      }
    };

    fetchVariant();
  }, [sessionId, testName]);

  // Track event function
  const track = useCallback(
    async (event: string): Promise<void> => {
      if (!sessionId || !testName) return;

      try {
        await api.post('/ab/event', {
          testName,
          sessionId,
          variant,
          event,
        });
      } catch (error) {
        console.error('Error tracking A/B event:', error);
        // Silently fail — don't interrupt user experience
      }
    },
    [sessionId, testName, variant]
  );

  return {
    variant,
    track,
    isLoading,
  };
};

export default useABTest;
