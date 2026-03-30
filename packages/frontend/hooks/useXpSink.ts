import { useState } from 'react';
import api from '../lib/api';

export interface XpSinkResponse {
  success: boolean;
  cost: number;
  message: string;
}

interface UseXpSinkOptions {
  onSuccess?: (response: XpSinkResponse) => void;
  onError?: (error: string) => void;
}

/**
 * useXpSink — hook for spending XP on sinks (rarity boost, coupon generation)
 * Handles loading, error, and success states for XP sink endpoints.
 */
export const useXpSink = (options?: UseXpSinkOptions) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const spendXpRarityBoost = async (saleId: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.post('/xp/sink/rarity-boost', {
        saleId,
      });

      if (options?.onSuccess) {
        options.onSuccess({
          success: true,
          cost: 15,
          message: '✨ Rarity boost activated! Your odds just got boosted.',
        });
      }

      return true;
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.error ||
        err?.validationMessage ||
        'Failed to activate rarity boost. Please try again.';

      setError(errorMessage);

      if (options?.onError) {
        options.onError(errorMessage);
      }

      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const spendXpCoupon = async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.post('/xp/sink/coupon', {});

      if (options?.onSuccess) {
        options.onSuccess({
          success: true,
          cost: 20,
          message: '🎫 Coupon generated! Use it to offer shoppers a discount.',
        });
      }

      return true;
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.error ||
        err?.validationMessage ||
        'Failed to generate coupon. Please try again.';

      setError(errorMessage);

      if (options?.onError) {
        options.onError(errorMessage);
      }

      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    spendXpRarityBoost,
    spendXpCoupon,
    isLoading,
    error,
  };
};
