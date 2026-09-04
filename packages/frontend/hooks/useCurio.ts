import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

/**
 * useCurio.ts -- Phase 5 PWA "curious scan" hooks.
 *
 * Thin TanStack Query wrappers over the already-live, already-migrated Curio backend
 * (Phases 1-4, see claude_docs/feature-notes/curio-api-adr-2026-07-17.md). Response shapes
 * are duplicated locally here per CLAUDE.md's `packages/frontend` never imports
 * `@findasale/shared` rule -- these types mirror curioController.ts exactly, not invented.
 *
 * Units: `value.low/high/median` are CENTS (matches ItemValuation's cents convention).
 * `comparableListings[].price` is DOLLARS (matches the existing eBay comps convention used
 * by EbayCompTiles.tsx) -- these two units are deliberately different, per the ADR's API
 * contract and curioController.ts's own CurioListing docstring. Do not conflate them.
 */

export interface CurioIdentification {
  title: string;
  description: string;
  category: string | null;
  brand: string | null;
  condition: string | null;
  confidence: number; // 0.0-1.0
}

export interface CurioValue {
  low: number; // cents
  high: number; // cents
  median: number; // cents
  basis: string; // always "similar_active_listings" -- never "sold", see ADR Rationale #1
  compsFound: number;
}

export interface CurioComparableListing {
  title: string;
  price: number; // dollars, NOT cents
  url: string;
  imageUrl: string | null;
}

export interface CurioScanResult {
  scanId: string;
  identification: CurioIdentification;
  value: CurioValue | null;
  comparableListings: CurioComparableListing[];
  guildXpAwarded: number;
  degraded?: boolean;
  message?: string;
}

export interface CurioFind {
  scanId: string;
  identification: CurioIdentification;
  value: CurioValue | null;
  photoUrl: string | null;
  createdAt: string;
  convertedToItemId: string | null;
}

export interface CurioFindsPage {
  finds: CurioFind[];
  totalValueIdentifiedCents: number;
  nextCursor: string | null;
}

export interface CurioConvertResult {
  itemId: string;
  saleId: null;
  draftStatus: 'DRAFT';
  organizerAutoProvisioned: boolean;
}

/**
 * POST /api/curio/scan -- submit 1-3 photos for identification + a value estimate.
 * sourceSurface is always 'PWA_CAMERA' from this page (the PWA scan surface) -- the
 * extension-only values ('EXTENSION_RIGHTCLICK'/'EXTENSION_UPLOAD') don't apply here.
 */
export const useSubmitCurioScan = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (photos: File[]): Promise<CurioScanResult> => {
      const formData = new FormData();
      photos.forEach((file) => formData.append('photos', file));
      formData.append('sourceSurface', 'PWA_CAMERA');

      const response = await api.post('/curio/scan', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    },
    onSuccess: () => {
      // A new scan is also a new (unlisted) Find -- keep the Finds tab's count/total fresh.
      queryClient.invalidateQueries({ queryKey: ['curio-finds'] });
    },
  });
};

/**
 * GET /api/curio/finds?limit= -- the shopper's own scan history ("Finds" collection).
 * Owner-scoped server-side (userId from the authenticated session) -- no params needed here.
 */
export const useCurioFinds = (limit: number = 20) => {
  return useQuery({
    queryKey: ['curio-finds', limit],
    queryFn: async (): Promise<CurioFindsPage> => {
      const response = await api.get('/curio/finds', { params: { limit } });
      return response.data;
    },
    staleTime: 1000 * 30,
  });
};

/** DELETE /api/curio/finds/:scanId -- soft delete, owner-only. */
export const useDeleteCurioFind = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (scanId: string) => {
      const response = await api.delete(`/curio/finds/${scanId}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['curio-finds'] });
    },
  });
};

/**
 * POST /api/curio/scan/:scanId/convert -- convert a scan into a DRAFT Item. May
 * auto-provision an Organizer profile (see ADR Decision #6) -- `organizerAutoProvisioned`
 * on the response tells the caller whether to show the one-time "we set up your seller
 * profile" toast before navigating to the new draft item.
 */
export const useConvertCurioScan = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (scanId: string): Promise<CurioConvertResult> => {
      const response = await api.post(`/curio/scan/${scanId}/convert`, {});
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['curio-finds'] });
    },
  });
};
