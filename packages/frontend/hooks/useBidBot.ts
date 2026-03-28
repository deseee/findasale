/**
 * useBidBot.ts — React Query hooks for Feature #17: Bid Bot Detector
 *
 * Hooks:
 *   useSaleFraudSignals(saleId) — GET /api/fraud/sale/:saleId (paginated fraud signals)
 *   useReviewSignal()            — POST /api/fraud/signals/:signalId/review (mark signal reviewed)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export type RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export function confidenceToRiskLevel(score: number): RiskLevel {
  if (score >= 70) return 'HIGH';
  if (score >= 50) return 'MEDIUM';
  return 'LOW';
}

export interface FraudSignal {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  itemId: string;
  itemTitle: string | null;
  signalType: string;
  confidenceScore: number;
  detectedAt: string;
  reviewedAt?: string;
  reviewOutcome: 'PENDING' | 'DISMISSED' | 'CONFIRMED';
  notes?: string;
}

export interface FraudSignalsResponse {
  signals: FraudSignal[];
  total: number;
  page: number;
  hasMore: boolean;
}

export interface ReviewSignalPayload {
  signalId: string;
  outcome: 'DISMISSED' | 'CONFIRMED';
  notes?: string;
}

// ─── GET /api/fraud/sale/:saleId ──────────────────────────────────────────
export function useSaleFraudSignals(
  saleId: string | null,
  page = 1,
  minScore = 30,
  status?: 'PENDING' | 'DISMISSED' | 'CONFIRMED'
) {
  return useQuery<FraudSignalsResponse>({
    queryKey: ['fraudSignals', saleId, page, minScore, status],
    queryFn: async () => {
      if (!saleId) throw new Error('saleId required');
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        minScore: String(minScore),
        ...(status && { status }),
      });
      const res = await api.get(`/fraud/sale/${saleId}?${params}`);
      return res.data;
    },
    enabled: !!saleId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

// ─── POST /api/fraud/signals/:signalId/review ─────────────────────────────
export function useReviewSignal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ signalId, outcome, notes }: ReviewSignalPayload) => {
      const res = await api.post(`/fraud/signals/${signalId}/review`, {
        outcome,
        notes,
      });
      return res.data;
    },
    onSuccess: (_, { signalId }) => {
      // Invalidate fraud signals queries to refetch updated data (matches all saleId/page/filter combinations)
      queryClient.invalidateQueries({ queryKey: ['fraudSignals'] });
    },
  });
}
