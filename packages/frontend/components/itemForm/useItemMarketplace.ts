/**
 * Marketplace state for the item form: the per-platform status (GET /items/:id/marketplace-status), the result of the
 * last save, and the eBay hold actions ("Update eBay now", "Resume syncing", Acknowledge).
 *
 * The status is fetched once on mount and refreshed after a save. A save's eBay push runs AFTER the PUT returns, so
 * after a save that planned a push the hook polls the status at most five times (1.5s, 2s, 3s, 4s, 5s apart) until a
 * push row newer than the save appears, then stops. It never polls forever and stops on unmount. No email, no toast.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { createItemMarketplaceApi, marketplaceErrorMessage } from '../../lib/itemMarketplaceApi';
import type { EbayHold, MarketplaceStatus, PushRow } from '../../lib/itemMarketplaceApi';
import {
  describePlan,
  describePushOutcome,
  planExtensionLines,
  pollForNewPush,
} from '../../lib/marketplaceImpact';
import type { OutcomeView, PlanLike } from '../../lib/marketplaceImpact';

export interface SaveOutcome {
  /** 'pending' while the eBay push is still being waited for, 'settled' once the row is in or nothing was planned. */
  phase: 'pending' | 'settled' | 'timeout';
  view: OutcomeView | null;
  /** "Needs manual update on Vinted." style sentences from the plan. */
  extensionLines: string[];
}

export interface HoldActionResult {
  tone: OutcomeView['tone'];
  /** One or two plain sentences: the outcome and the server's own message, without repeats. */
  lines: string[];
}

function uniqueLines(lines: string[]): string[] {
  const out: string[] = [];
  lines.forEach((l) => {
    const t = (l || '').trim();
    if (!t) return;
    const lower = t.toLowerCase();
    if (out.some((o) => o.toLowerCase().indexOf(lower) !== -1 || lower.indexOf(o.toLowerCase()) !== -1)) return;
    out.push(t);
  });
  return out;
}

const EMPTY_HOLD: EbayHold = { heldAt: null, heldFields: [], contentDirtyAt: null };

export function useItemMarketplace(itemId: string, itemHold?: { heldAt?: string | null; heldFields?: string[] | null }) {
  const queryClient = useQueryClient();
  const marketplaceApi = useMemo(() => createItemMarketplaceApi(api), []);
  const statusKey = useMemo(() => ['item-marketplace-status', itemId], [itemId]);

  const statusQuery = useQuery({
    queryKey: statusKey,
    queryFn: () => marketplaceApi.getStatus(itemId),
    enabled: !!itemId,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const status: MarketplaceStatus | undefined = statusQuery.data;

  // Hold: the status wins once loaded; until then the edit payload's own hold columns.
  const hold: EbayHold = status
    ? status.ebayHold
    : { heldAt: itemHold?.heldAt || null, heldFields: itemHold?.heldFields || [], contentDirtyAt: null };

  const [outcome, setOutcome] = useState<SaveOutcome | null>(null);
  const [holdResult, setHoldResult] = useState<HoldActionResult | null>(null);
  const pollGen = useRef(0);
  const unmounted = useRef(false);
  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
      pollGen.current += 1;
    };
  }, []);

  const setHeldInCache = useCallback(
    (next: EbayHold) => {
      queryClient.setQueryData(statusKey, (old: MarketplaceStatus | undefined) =>
        old ? { ...old, ebayHold: next } : old
      );
    },
    [queryClient, statusKey]
  );

  /**
   * Call once per successful save. `plan` is the PUT response's marketplacePlan. `known` is what the status held when
   * the save was clicked, so a row that already existed is never mistaken for this save's push.
   */
  const trackSave = useCallback(
    (plan: PlanLike | null | undefined, clickedAtMs: number, opts?: { skipped?: boolean }) => {
      const gen = ++pollGen.current;
      const known = queryClient.getQueryData<MarketplaceStatus>(statusKey);
      const view = describePlan(plan);
      const willPush = !!(plan && plan.ebay && plan.ebay.willPush);
      setOutcome({
        phase: willPush ? 'pending' : 'settled',
        view,
        extensionLines: planExtensionLines(plan),
      });
      setHoldResult(null);

      // "Save without updating marketplaces": show the hold at once; the refresh below confirms it.
      if (opts && opts.skipped && plan && plan.ebay && plan.ebay.reason !== 'not_listed') {
        const now = new Date().toISOString();
        const prior = known ? known.ebayHold : EMPTY_HOLD;
        const fields = Array.from(new Set((prior.heldFields || []).concat((plan.ebay.fields as string[]) || [])));
        setHeldInCache({ heldAt: prior.heldAt || now, heldFields: fields, contentDirtyAt: prior.contentDirtyAt });
      }

      if (!willPush) {
        queryClient.invalidateQueries({ queryKey: statusKey });
        return;
      }
      const ctx = {
        knownIds: known ? known.recentPushes.map((r) => r.id) : [],
        knownLoaded: !!known,
        clickedAtMs,
      };
      pollForNewPush<PushRow>({
        fetchRows: async () => {
          const fresh = await queryClient.fetchQuery({
            queryKey: statusKey,
            queryFn: () => marketplaceApi.getStatus(itemId),
            staleTime: 0,
          });
          return fresh.recentPushes;
        },
        ctx,
        wait: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
        isCancelled: () => unmounted.current || gen !== pollGen.current,
      }).then((result) => {
        if (result.cancelled || unmounted.current || gen !== pollGen.current) return;
        if (result.row) {
          setOutcome({ phase: 'settled', view: describePushOutcome(result.row), extensionLines: planExtensionLines(plan) });
        } else {
          setOutcome({
            phase: 'timeout',
            view: {
              tone: 'info',
              text: 'The eBay update is still running. Check Where this is listed in a minute.',
              canRetry: false,
            },
            extensionLines: planExtensionLines(plan),
          });
        }
      });
    },
    [queryClient, statusKey, marketplaceApi, itemId, setHeldInCache]
  );

  const clearOutcome = useCallback(() => {
    pollGen.current += 1;
    setOutcome(null);
  }, []);

  const ackMutation = useMutation({
    mutationFn: () => marketplaceApi.ackPushFailures(itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: statusKey });
    },
  });

  const repushMutation = useMutation({
    mutationFn: (opts: { retry?: boolean }) => marketplaceApi.repush(itemId, opts),
    onMutate: () => {
      setHoldResult(null);
    },
    onSuccess: (res, variables) => {
      setHeldInCache(res.ebayHold);
      let result: HoldActionResult;
      if (res.outcome) {
        const view = describePushOutcome(res.outcome);
        result = { tone: view.tone, lines: uniqueLines([view.text, res.message]) };
        // A retry from the save result row replaces that row's text with the new outcome.
        if (variables && variables.retry === true) {
          setOutcome({ phase: 'settled', view, extensionLines: [] });
        }
      } else {
        // A saleless inventory item returns a message only: show it as returned.
        result = { tone: 'info', lines: [res.message || 'Done.'] };
      }
      setHoldResult(result);
      queryClient.invalidateQueries({ queryKey: statusKey });
      queryClient.invalidateQueries({ queryKey: ['item', itemId] });
    },
    onError: (err) => {
      setHoldResult({ tone: 'error', lines: [marketplaceErrorMessage(err, 'Could not update eBay right now. Try again in a minute.')] });
    },
  });

  const releaseMutation = useMutation({
    mutationFn: () => marketplaceApi.releaseHold(itemId),
    onMutate: () => {
      setHoldResult(null);
    },
    onSuccess: (res) => {
      setHeldInCache(res.ebayHold);
      setHoldResult({ tone: 'success', lines: ['Syncing is back on for eBay.'] });
      queryClient.invalidateQueries({ queryKey: statusKey });
      queryClient.invalidateQueries({ queryKey: ['item', itemId] });
    },
    onError: (err) => {
      setHoldResult({ tone: 'error', lines: [marketplaceErrorMessage(err, 'Could not resume syncing right now. Try again in a minute.')] });
    },
  });

  /** The server returns 409 when a push is already running, so both actions stay disabled while either request is in flight. */
  const actionBusy = repushMutation.isPending || releaseMutation.isPending;

  return {
    status,
    statusLoaded: !!status,
    hold,
    outcome,
    holdResult,
    actionBusy,
    trackSave,
    clearOutcome,
    ack: () => ackMutation.mutate(),
    ackPending: ackMutation.isPending,
    repush: (opts?: { retry?: boolean }) => repushMutation.mutate(opts || {}),
    repushPending: repushMutation.isPending,
    release: () => releaseMutation.mutate(),
    releasePending: releaseMutation.isPending,
  };
}
