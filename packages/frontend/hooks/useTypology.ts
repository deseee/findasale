/**
 * useTypology.ts — React Query hooks for Feature #46: Treasure Typology Classifier
 *
 * Hooks:
 *   useItemTypology(itemId)    — GET  /api/items/:itemId/typology
 *   useClassifyItem()          — POST /api/items/:itemId/classify
 *   useBatchClassifySale()     — POST /api/sales/:saleId/classify-all
 *   useUpdateTypology()        — PATCH /api/items/:itemId/typology
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export type TypologyCategory =
  | 'ART_DECO'
  | 'MID_CENTURY_MODERN'
  | 'AMERICANA'
  | 'VICTORIAN'
  | 'INDUSTRIAL'
  | 'FARMHOUSE'
  | 'RETRO_ATOMIC'
  | 'PRIMITIVE_FOLK_ART'
  | 'ART_NOUVEAU'
  | 'CONTEMPORARY'
  | 'OTHER';

export const TYPOLOGY_LABELS: Record<TypologyCategory, string> = {
  ART_DECO: 'Art Deco',
  MID_CENTURY_MODERN: 'Mid-Century Modern',
  AMERICANA: 'Americana',
  VICTORIAN: 'Victorian',
  INDUSTRIAL: 'Industrial',
  FARMHOUSE: 'Farmhouse',
  RETRO_ATOMIC: 'Retro / Atomic',
  PRIMITIVE_FOLK_ART: 'Primitive Folk Art',
  ART_NOUVEAU: 'Art Nouveau',
  CONTEMPORARY: 'Contemporary',
  OTHER: 'Other',
};

export const ALL_TYPOLOGY_CATEGORIES: TypologyCategory[] = Object.keys(TYPOLOGY_LABELS) as TypologyCategory[];

export interface ItemTypology {
  itemId: string;
  primaryCategory: TypologyCategory;
  primaryConfidence: number;
  secondaryCategory: TypologyCategory | null;
  secondaryConfidence: number | null;
  organizer_reviewed: boolean;
  organizer_correctedTo: TypologyCategory | null;
  classifiedAt: string;
}

export interface BatchClassifyResult {
  classified: number;
  failed: number;
  total: number;
}

// ─── GET /api/items/:itemId/typology ──────────────────────────────────────────
export function useItemTypology(itemId: string | null) {
  return useQuery<ItemTypology | null>({
    queryKey: ['typology', itemId],
    queryFn: async () => {
      if (!itemId) return null;
      try {
        const res = await api.get(`/items/${itemId}/typology`);
        return res.data.data as ItemTypology;
      } catch (err: any) {
        if (err.response?.status === 404) return null;
        throw err;
      }
    },
    enabled: !!itemId,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── POST /api/items/:itemId/classify ─────────────────────────────────────────
export function useClassifyItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) => {
      const res = await api.post(`/items/${itemId}/classify`);
      return res.data as ItemTypology;
    },
    onSuccess: (_data, itemId) => {
      queryClient.invalidateQueries({ queryKey: ['typology', itemId] });
    },
  });
}

// ─── POST /api/sales/:saleId/classify-all ─────────────────────────────────────
export function useBatchClassifySale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (saleId: string) => {
      const res = await api.post(`/sales/${saleId}/classify-all`);
      return res.data as BatchClassifyResult;
    },
    onSuccess: () => {
      // Invalidate all typology queries since multiple items were classified
      queryClient.invalidateQueries({ queryKey: ['typology'] });
    },
  });
}

// ─── PATCH /api/items/:itemId/typology ────────────────────────────────────────
export interface UpdateTypologyPayload {
  itemId: string;
  correctedTo: TypologyCategory;
  reason: string;
}

export function useUpdateTypology() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, correctedTo, reason }: UpdateTypologyPayload) => {
      const res = await api.patch(`/items/${itemId}/typology`, {
        correctedTo,
        reason,
      });
      return res.data as ItemTypology;
    },
    onSuccess: (_data, { itemId }) => {
      queryClient.invalidateQueries({ queryKey: ['typology', itemId] });
    },
  });
}
