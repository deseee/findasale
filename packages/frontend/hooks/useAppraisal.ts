import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

/**
 * Feature #54: Crowdsourced Appraisal API
 * React Query hooks for appraisal submission, community voting, and consensus tracking
 */

export interface AppraisalRequest {
  id: string;
  itemTitle: string;
  itemDescription?: string;
  itemCategory?: string;
  photoUrls: string[];
  status: 'PENDING' | 'IN_REVIEW' | 'COMPLETED';
  responseCount: number;
  consensus?: AppraisalConsensus;
  createdAt: string;
  updatedAt: string;
}

export interface AppraisalResponse {
  id: string;
  estimatedLow: number; // cents
  estimatedHigh: number; // cents
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  expertise?: string;
  reasoning: string;
  helpfulVotes: number;
  notHelpfulVotes: number;
  responderId: string;
}

export interface AppraisalConsensus {
  estimatedLow: number; // cents
  estimatedHigh: number; // cents
  confidenceScore: number; // 0–100
}

export interface AppraisalFeedResponse {
  requests: AppraisalRequest[];
  total: number;
  page: number;
  hasMore: boolean;
}

export interface AppraisalDetailResponse {
  request: AppraisalRequest;
  responses: AppraisalResponse[];
}

// Display map for category dropdown
export const ITEM_CATEGORIES = {
  ART_DECO: 'Art Deco',
  MID_CENTURY_MODERN: 'Mid-Century Modern',
  AMERICANA: 'Americana',
  VICTORIAN: 'Victorian',
  INDUSTRIAL: 'Industrial',
  FARMHOUSE: 'Farmhouse',
  RETRO_ATOMIC: 'Retro Atomic',
  PRIMITIVE_FOLK_ART: 'Primitive / Folk Art',
  ART_NOUVEAU: 'Art Nouveau',
  CONTEMPORARY: 'Contemporary',
  OTHER: 'Other',
} as const;

/**
 * useMyAppraisals — Fetch organizer's own appraisal requests
 */
export const useMyAppraisals = () => {
  return useQuery<AppraisalFeedResponse>({
    queryKey: ['appraisals-my'],
    queryFn: async () => {
      const response = await api.get('/appraisals/my');
      return response.data;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

/**
 * useAppraisalFeed — Fetch public appraisal feed (paginated)
 */
export const useAppraisalFeed = (page: number = 1, limit: number = 20) => {
  return useQuery<AppraisalFeedResponse>({
    queryKey: ['appraisals-feed', { page, limit }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('limit', String(limit));
      const response = await api.get(`/appraisals?${params.toString()}`);
      return response.data;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

/**
 * useAppraisal — Fetch single appraisal request with all responses and consensus
 * Returns null if requestId is undefined
 */
export const useAppraisal = (requestId?: string) => {
  return useQuery<AppraisalDetailResponse>({
    queryKey: ['appraisal', requestId],
    queryFn: async () => {
      const response = await api.get(`/appraisals/${requestId}`);
      return response.data;
    },
    enabled: !!requestId,
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

/**
 * useCreateAppraisal — Mutation to create a new appraisal request
 */
export const useCreateAppraisal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      itemTitle: string;
      itemDescription?: string;
      itemCategory?: string;
      photoUrls: string[];
    }) => {
      const response = await api.post('/appraisals', data);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate and refetch user's appraisals
      queryClient.invalidateQueries({ queryKey: ['appraisals-my'] });
    },
  });
};

/**
 * useSubmitResponse — Mutation to submit a community estimate
 */
export const useSubmitResponse = (requestId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      estimatedLow: number; // cents
      estimatedHigh: number; // cents
      confidence: 'LOW' | 'MEDIUM' | 'HIGH';
      expertise?: string;
      reasoning: string;
    }) => {
      const response = await api.post(
        `/appraisals/${requestId}/responses`,
        data
      );
      return response.data;
    },
    onSuccess: () => {
      // Invalidate and refetch the appraisal detail
      queryClient.invalidateQueries({ queryKey: ['appraisal', requestId] });
      // Invalidate feed to reflect updated response counts (matches all page/limit combinations)
      queryClient.invalidateQueries({ queryKey: ['appraisals-feed'] });
    },
  });
};

/**
 * useVoteResponse — Mutation to vote on a response (helpful/not helpful)
 */
export const useVoteResponse = (requestId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      responseId: string;
      helpful: boolean;
    }) => {
      const response = await api.post(
        `/appraisals/${requestId}/responses/${data.responseId}/vote`,
        { helpful: data.helpful }
      );
      return response.data;
    },
    onSuccess: () => {
      // Invalidate the appraisal detail to reflect updated vote counts
      queryClient.invalidateQueries({ queryKey: ['appraisal', requestId] });
    },
  });
};
