/**
 * Vinted bundle sale reconciliation (2026-10-12).
 *
 * Vinted's "bought a bundle" email does not say which listings were in the bundle, so FindA.Sale never
 * guesses. This page lists the organizer's live Vinted listings (and, collapsed, their other available
 * items) with checkboxes; "Mark selected as sold on Vinted" runs the same sold flow as a normal Vinted
 * sale for each ticked item and takes it down from the organizer's other channels.
 *
 * Backend: GET /api/organizer/vinted-bundle and POST /api/organizer/vinted-bundle/mark-sold
 * (controllers/vintedBundleController.ts). Types are local on purpose (a @findasale/shared import breaks
 * the Vercel build). FALLBACK ONLY (2026-10-12): bundles reconcile automatically (vintedBundleOrderService.ts);
 * the bundle notice links here and only asks for manual help after automatic attempts failed.
 */

import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../components/AuthContext';
import api from '../../lib/api';

interface BundleOption {
  itemId: string;
  title: string;
}

interface BundleOptionsResponse {
  notices: Array<{ id: string; title: string; body: string; createdAt: string }>;
  tracked: BundleOption[];
  other: BundleOption[];
  maxSelectable: number;
}

interface MarkSoldResult {
  itemId: string;
  title?: string;
  result: 'sold' | 'alreadySold' | 'notAvailable' | 'notFound' | 'error';
  reason?: string;
}

interface MarkSoldResponse {
  ok: boolean;
  results: MarkSoldResult[];
  summary: Record<string, number>;
}

const RESULT_LABEL: Record<MarkSoldResult['result'], string> = {
  sold: 'Marked sold',
  alreadySold: 'Already sold',
  notAvailable: 'Not available (no change)',
  notFound: 'Not found in your account',
  error: 'Failed, try again',
};

const VintedBundlePage = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showOther, setShowOther] = useState(false);
  const [lastResult, setLastResult] = useState<MarkSoldResponse | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<BundleOptionsResponse>({
    queryKey: ['vinted-bundle-options'],
    queryFn: async () => (await api.get('/organizer/vinted-bundle')).data,
    enabled: !!user,
  });

  const max = data?.maxSelectable ?? 50;

  const markSold = useMutation<MarkSoldResponse, any, string[]>({
    mutationFn: async (itemIds) => (await api.post('/organizer/vinted-bundle/mark-sold', { itemIds })).data,
    onSuccess: (resp) => {
      setLastResult(resp);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ['vinted-bundle-options'] });
    },
  });

  if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < max) next.add(id);
      return next;
    });
  };

  const renderList = (options: BundleOption[]) => (
    <ul className="divide-y divide-warm-200 dark:divide-gray-700">
      {options.map((o) => {
        const checked = selected.has(o.itemId);
        const disabled = !checked && selected.size >= max;
        return (
          <li key={o.itemId}>
            <label className={`flex items-start gap-3 py-2.5 px-1 cursor-pointer ${disabled ? 'opacity-50' : ''}`}>
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(o.itemId)}
              />
              <span className="text-sm text-warm-900 dark:text-gray-100 break-words">{o.title || '(untitled item)'}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );

  const errorMessage = markSold.isError
    ? ((markSold.error as any)?.response?.data?.message as string | undefined) || 'Something went wrong. Nothing was changed for the items that failed.'
    : null;

  return (
    <>
      <Head>
        <title>Vinted bundle sale - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <Link href="/organizer/marketplace-extension" className="text-amber-600 hover:underline text-sm font-medium mb-4 inline-block">
            Back to Marketplace Autofill
          </Link>
          <h1 className="text-2xl font-bold text-warm-900 dark:text-gray-100 mb-2">Vinted bundle sale</h1>
          <p className="text-sm text-warm-600 dark:text-gray-300 mb-4">
            Vinted bundle sales are reconciled automatically: FindA.Sale reads the order from your Vinted account and
            marks the items sold. You only need this page if a bundle notice says some items could not be matched.
            In that case tick the items that sold and FindA.Sale will mark them sold and take them down from your
            other channels. Nothing is changed until you press the button.
          </p>

          {data && data.notices.length > 0 && (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-3 text-sm text-amber-900 dark:text-amber-100">
              {data.notices.map((n) => (
                <p key={n.id} className="mb-1 last:mb-0">{n.title}</p>
              ))}
            </div>
          )}

          {lastResult && (
            <div className="mb-4 rounded-lg border border-warm-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <h2 className="text-sm font-semibold text-warm-800 dark:text-gray-100 mb-2">Result</h2>
              <ul className="space-y-1 text-sm text-warm-700 dark:text-gray-300">
                {lastResult.results.map((r) => (
                  <li key={r.itemId}>
                    <span className="font-medium">{RESULT_LABEL[r.result]}:</span> {r.title || r.itemId}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(isLoading || authLoading) && <div className="animate-pulse text-warm-500 dark:text-gray-400">Loading...</div>}
          {isError && (
            <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-800 dark:text-red-200">
              Could not load your listings.{' '}
              <button type="button" className="underline" onClick={() => refetch()}>Try again</button>
            </div>
          )}

          {data && (
            <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-4 sm:p-6">
              <h2 className="text-sm font-semibold text-warm-800 dark:text-gray-100 mb-2">
                Your live Vinted listings ({data.tracked.length})
              </h2>
              {data.tracked.length === 0 ? (
                <p className="text-sm text-warm-600 dark:text-gray-300">
                  No tracked live Vinted listings. If an item is on Vinted but missing here, open the list below.
                </p>
              ) : (
                renderList(data.tracked)
              )}

              <button
                type="button"
                className="mt-4 text-sm text-amber-700 dark:text-amber-400 underline"
                onClick={() => setShowOther((v) => !v)}
              >
                {showOther ? 'Hide' : 'Show'} other available items ({data.other.length})
              </button>
              {showOther && <div className="mt-2">{data.other.length ? renderList(data.other) : <p className="text-sm text-warm-600 dark:text-gray-300">None.</p>}</div>}

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={selected.size === 0 || markSold.isPending}
                  onClick={() => markSold.mutate(Array.from(selected))}
                  className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold py-2.5 px-5 rounded-lg transition-colors"
                >
                  {markSold.isPending ? 'Working...' : 'Mark selected as sold on Vinted'}
                </button>
                <span className="text-sm text-warm-600 dark:text-gray-300">
                  {selected.size} selected (up to {max} at a time)
                </span>
              </div>
              {errorMessage && <p className="mt-3 text-sm text-red-700 dark:text-red-300">{errorMessage}</p>}
              <p className="mt-4 text-xs text-warm-500 dark:text-gray-400">
                Each item keeps its own listed price. The bundle total is not split across items.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default VintedBundlePage;
