/**
 * useArrivalAssistant.ts — Feature #84: Approach Notes
 *
 * Hook for fetching and managing approach notes (parking, entrance, hours)
 * for a sale on the day of the event.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export interface ApproachNotesResponse {
  saleId: string;
  notes: string | null;
  address: string;
  startDate: string;
  endDate: string;
}

export interface ApproachNotesUpdateResponse {
  message: string;
  saleId: string;
  notes: string | null;
  address: string;
  startDate: string;
}

export interface NotificationResponse {
  message: string;
  notificationsSent: number;
  skippedDueToDuplicates?: number;
  totalSubscribers?: number;
}

/**
 * useArrivalAssistant — Fetch approach notes for a sale
 *
 * Returns: { notes, address, startDate, endDate, isLoading, error }
 */
export function useArrivalAssistant(saleId: string | null) {
  return useQuery<ApproachNotesResponse>({
    queryKey: ['approachNotes', saleId],
    queryFn: async () => {
      if (!saleId) throw new Error('saleId required');
      const res = await api.get(`/sales/${saleId}/approach-notes`);
      return res.data;
    },
    enabled: !!saleId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * useUpdateApproachNotes — Update approach notes for a sale (organizer only)
 *
 * Returns: { mutate, mutateAsync, isPending, error }
 */
export function useUpdateApproachNotes(saleId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notes: string | null) => {
      const res = await api.post(`/sales/${saleId}/approach-notes`, { notes });
      return res.data as ApproachNotesUpdateResponse;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['approachNotes', saleId], data);
    },
  });
}

/**
 * useSendApproachNotification — Trigger push notification to all saved users
 *
 * Returns: { mutate, mutateAsync, isPending, error }
 */
export function useSendApproachNotification(saleId: string) {
  return useMutation({
    mutationFn: async () => {
      const res = await api.post(`/sales/${saleId}/send-approach-notification`, {});
      return res.data as NotificationResponse;
    },
  });
}
