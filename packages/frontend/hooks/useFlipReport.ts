import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface TopPerformer {
  id: string;
  title: string;
  finalPrice: number;
  category: string | null;
}

export interface CategoryBreakdown {
  category: string;
  total: number;
  sold: number;
  revenue: number;
}

export interface PricingInsights {
  averageAskingPrice: number;
  averageSalePrice: number;
  priceDropRate: number;
}

export interface FlipReport {
  saleId: string;
  saleTitle: string;
  saleStartDate: string;
  saleEndDate: string;
  sellThroughRate: number;
  totalRevenue: number;
  itemsSold: number;
  itemsUnsold: number;
  topPerformers: TopPerformer[];
  unsoldItems: Array<{ id: string; title: string; askingPrice: number | null; category: string | null }>;
  categoryBreakdown: CategoryBreakdown[];
  pricingInsights: PricingInsights;
  recommendations: string[];
}

/**
 * Hook to fetch Flip Report for a sale
 * @param saleId - The ID of the sale to fetch report for (null skips fetch)
 * @returns { flipReport, isLoading, error }
 */
export function useFlipReport(saleId: string | null) {
  return useQuery<FlipReport>({
    queryKey: ['flipReport', saleId],
    queryFn: async () => {
      if (!saleId) throw new Error('saleId is required');
      const response = await api.get(`/flip-report/${saleId}`);
      return response.data;
    },
    enabled: !!saleId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
