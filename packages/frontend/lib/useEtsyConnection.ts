import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from './api';
import { useAuth } from '../components/AuthContext';
import { ETSY_PANEL_COPY } from './etsyCopy';
import {
  ETSY_DISABLED_CONNECTION,
  ETSY_POLL_INTERVAL_MS,
  etsyErrorCode,
  etsyErrorData,
  etsyErrorMessage,
  etsyErrorStatus,
  isEtsyDisabledError,
  isSafeEtsyAuthorizeUrl,
  normalizeEtsyCategories,
  normalizeEtsyConnection,
  normalizeEtsyEligibility,
  normalizeEtsyListing,
  normalizeEtsySetup,
  shouldPollEtsyListing,
} from './etsyUiState';
import type {
  EtsyCategoryOptions,
  EtsyConnectionInfo,
  EtsyDraftRequestBody,
  EtsyEligibilityInfo,
  EtsyListingInfo,
  EtsySetupInfo,
} from './etsyUiState';

// ADR-135 batch E-B5. Etsy connection and listing hooks. Same react-query pattern as
// useReverbConnection.ts / useEbayConnection.ts, with two differences:
//   - availability comes from the SERVER (GET /etsy/connection answers 503 ETSY_DISABLED when the
//     connector is off), never from a build-time public env variable;
//   - the connect flow is OAuth: GET /etsy/connect returns { authorizeUrl } and the browser leaves
//     for Etsy. The callback page (pages/organizer/etsy-oauth-callback.tsx) finishes the flow.
//
// Nothing here logs. Error objects can hold request bodies (an OAuth code), so they are never printed.

export const ETSY_KEYS = {
  connection: ['etsy-connection-status'] as const,
  setup: ['etsy-shop-setup'] as const,
  listing: (itemId: string) => ['etsy-listing', itemId] as const,
  eligibility: (itemId: string) => ['etsy-eligibility', itemId] as const,
  categories: (itemId: string) => ['etsy-categories', itemId] as const,
};

export type EtsyDisconnectResult =
  | { kind: 'done'; orphanedListingCount: number }
  | { kind: 'confirm'; activeListingCount: number };

function itemPath(itemId: string, tail: string): string {
  return `/etsy/items/${encodeURIComponent(itemId)}/${tail}`;
}

// ---------------------------------------------------------------------------------------------
// Connection (Settings tab and the per-item section).
// ---------------------------------------------------------------------------------------------

export const useEtsyConnection = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery<EtsyConnectionInfo>({
    queryKey: ETSY_KEYS.connection,
    queryFn: async () => {
      try {
        const response = await api.get('/etsy/connection');
        return normalizeEtsyConnection(response.data);
      } catch (err) {
        if (isEtsyDisabledError(err)) return ETSY_DISABLED_CONNECTION;
        throw err;
      }
    },
    enabled: !!user,
    retry: false,
    staleTime: 30 * 1000,
  });

  // Connect: ask the server for Etsy's sign-in address, then leave for Etsy.
  const [isStartingConnect, setIsStartingConnect] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    // Coming back with the browser Back button restores this page from memory with the spinner on.
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setIsStartingConnect(false);
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  const startConnect = useCallback(async () => {
    setConnectError(null);
    setIsStartingConnect(true);
    try {
      const response = await api.get('/etsy/connect');
      const url: unknown = response.data?.authorizeUrl;
      if (!isSafeEtsyAuthorizeUrl(url)) {
        throw new Error('unexpected authorize address');
      }
      window.location.assign(url);
    } catch (err) {
      setIsStartingConnect(false);
      setConnectError(etsyErrorMessage(err, ETSY_PANEL_COPY.connectFailed));
    }
  }, []);

  const disconnectMutation = useMutation<EtsyDisconnectResult, unknown, boolean>({
    mutationFn: async (confirm: boolean) => {
      try {
        const response = await api.delete('/etsy/connection', confirm ? { params: { confirm: 'true' } } : undefined);
        const n = Number(response.data?.orphanedListingCount);
        return { kind: 'done', orphanedListingCount: isFinite(n) ? n : 0 };
      } catch (err) {
        if (etsyErrorStatus(err) === 409 && etsyErrorCode(err) === 'ETSY_CONFIRM_REQUIRED') {
          const data = etsyErrorData(err);
          const n = Number(data?.activeListingCount);
          return { kind: 'confirm', activeListingCount: isFinite(n) ? n : 0 };
        }
        throw err;
      }
    },
    onSuccess: (result) => {
      if (result.kind === 'done') {
        queryClient.invalidateQueries({ queryKey: ETSY_KEYS.connection });
        queryClient.removeQueries({ queryKey: ETSY_KEYS.setup });
      }
    },
  });

  const info = query.data;
  return {
    connection: info,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    /** True only when the server says the connector is on and the shop is connected and healthy. */
    isConnected: Boolean(info && info.enabled && info.connected),
    isStartingConnect,
    connectError,
    startConnect,
    disconnect: disconnectMutation.mutateAsync,
    isDisconnecting: disconnectMutation.isPending,
    disconnectError: disconnectMutation.isError ? etsyErrorMessage(disconnectMutation.error, ETSY_PANEL_COPY.disconnectFailed) : null,
  };
};

// ---------------------------------------------------------------------------------------------
// Shop setup (shipping profile, return policy, processing profile). Each fetch makes up to 3 Etsy
// calls on the server, so it is cached for a minute and never refetched on window focus.
// ---------------------------------------------------------------------------------------------

export const useEtsyShopSetup = (enabled: boolean) => {
  const queryClient = useQueryClient();

  const query = useQuery<EtsySetupInfo>({
    queryKey: ETSY_KEYS.setup,
    queryFn: async () => {
      const response = await api.get('/etsy/shop-setup');
      return normalizeEtsySetup(response.data);
    },
    enabled,
    retry: false,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const saveMutation = useMutation({
    mutationFn: (values: { shippingProfileId: string; returnPolicyId: string; readinessStateId: string }) =>
      api.put('/etsy/shop-setup', {
        defaultShippingProfileId: values.shippingProfileId,
        defaultReturnPolicyId: values.returnPolicyId || null,
        defaultReadinessStateId: values.readinessStateId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ETSY_KEYS.connection });
      queryClient.invalidateQueries({ queryKey: ETSY_KEYS.setup });
    },
  });

  return {
    setup: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    errorMessage: query.isError ? etsyErrorMessage(query.error, ETSY_PANEL_COPY.setupLoadError) : null,
    refetch: query.refetch,
    isFetching: query.isFetching,
    save: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    saveError: saveMutation.isError ? etsyErrorMessage(saveMutation.error, ETSY_PANEL_COPY.setupSaveFailed) : null,
    resetSaveError: saveMutation.reset,
  };
};

// ---------------------------------------------------------------------------------------------
// Per-item listing, eligibility and categories. Route contract: ADR-135 section 6 (batch E-B3).
// ---------------------------------------------------------------------------------------------

/** GET /etsy/items/:id/listing, polled every 2 s while a draft or publish is in flight. */
export const useEtsyListing = (itemId: string | undefined, enabled: boolean) => {
  const pollStartedAt = useRef<number>(Date.now());
  const lastState = useRef<string | null>(null);

  const query = useQuery<EtsyListingInfo | null>({
    queryKey: ETSY_KEYS.listing(itemId ?? ''),
    queryFn: async () => {
      try {
        const response = await api.get(itemPath(itemId as string, 'listing'));
        return normalizeEtsyListing(response.data);
      } catch (err) {
        if (etsyErrorStatus(err) === 404) return null;
        throw err;
      }
    },
    enabled: enabled && !!itemId,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (q) => (shouldPollEtsyListing(q.state.data?.state, Date.now() - pollStartedAt.current) ? ETSY_POLL_INTERVAL_MS : false),
  });

  const state = query.data?.state ?? null;
  useEffect(() => {
    if (state !== lastState.current) {
      lastState.current = state;
      pollStartedAt.current = Date.now();
    }
  }, [state]);

  return {
    listing: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    /** True when polling has stopped on a state that is still in flight (the page should say it is slow). */
    pollTimedOut:
      (state === 'DRAFT_PENDING' || state === 'PUBLISHING') && !shouldPollEtsyListing(state, Date.now() - pollStartedAt.current),
  };
};

/** GET /etsy/items/:id/eligibility. A 422 body { eligible: false, reason } is an answer, not an error. */
export const useEtsyEligibility = (itemId: string | undefined, enabled: boolean) => {
  const query = useQuery<EtsyEligibilityInfo>({
    queryKey: ETSY_KEYS.eligibility(itemId ?? ''),
    queryFn: async () => {
      try {
        const response = await api.get(itemPath(itemId as string, 'eligibility'));
        return normalizeEtsyEligibility(response.status, response.data);
      } catch (err) {
        if (etsyErrorStatus(err) === 422) return normalizeEtsyEligibility(422, etsyErrorData(err));
        throw err;
      }
    },
    enabled: enabled && !!itemId,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return { eligibility: query.data, isLoading: query.isLoading, isError: query.isError, refetch: query.refetch };
};

/** GET /etsy/taxonomy/suggest?itemId=: leaf categories plus a keyword "Suggested" one. */
export const useEtsyCategories = (itemId: string | undefined, enabled: boolean) => {
  const query = useQuery<EtsyCategoryOptions>({
    queryKey: ETSY_KEYS.categories(itemId ?? ''),
    queryFn: async () => {
      const response = await api.get('/etsy/taxonomy/suggest', { params: { itemId } });
      return normalizeEtsyCategories(response.data);
    },
    enabled: enabled && !!itemId,
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  return {
    categories: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
};

/** Save draft, publish, and discard/remove. The server re-checks eligibility on draft and publish. */
export const useEtsyListingActions = (itemId: string | undefined) => {
  const queryClient = useQueryClient();
  const refresh = () => {
    if (!itemId) return;
    queryClient.invalidateQueries({ queryKey: ETSY_KEYS.listing(itemId) });
    queryClient.invalidateQueries({ queryKey: ETSY_KEYS.eligibility(itemId) });
  };

  const draftMutation = useMutation({
    mutationFn: (body: EtsyDraftRequestBody) => api.post(itemPath(itemId as string, 'draft'), body),
    onSuccess: (response) => {
      const row = normalizeEtsyListing(response.data);
      if (row && itemId) queryClient.setQueryData(ETSY_KEYS.listing(itemId), row);
      refresh();
    },
  });

  const publishMutation = useMutation({
    mutationFn: () => api.post(itemPath(itemId as string, 'publish'), { confirm: true }),
    onSuccess: (response) => {
      const row = normalizeEtsyListing(response.data);
      if (row && itemId) queryClient.setQueryData(ETSY_KEYS.listing(itemId), row);
      refresh();
    },
    onError: refresh,
  });

  const discardMutation = useMutation({
    mutationFn: () => api.delete(itemPath(itemId as string, 'listing')),
    onSuccess: refresh,
    onError: refresh,
  });

  return {
    saveDraft: draftMutation.mutateAsync,
    isSavingDraft: draftMutation.isPending,
    draftError: draftMutation.isError ? etsyErrorMessage(draftMutation.error) : null,
    publish: publishMutation.mutateAsync,
    isPublishing: publishMutation.isPending,
    publishError: publishMutation.isError ? etsyErrorMessage(publishMutation.error) : null,
    discard: discardMutation.mutateAsync,
    isDiscarding: discardMutation.isPending,
    discardError: discardMutation.isError ? etsyErrorMessage(discardMutation.error) : null,
    resetErrors: () => {
      draftMutation.reset();
      publishMutation.reset();
      discardMutation.reset();
    },
  };
};
