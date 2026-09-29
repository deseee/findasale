/**
 * Physical Markdown Alert List (2026-09-25, Patrick):
 * "a running alert for [staff] for markdowns so they can markdown the items physically or
 * with a highlighter or stickers or something."
 *
 * Staff-facing list of items the SYSTEM auto-marked down (markdownCron.ts /
 * markdownCycleCron.ts) whose shelf price sticker hasn't been updated to match yet.
 * Item.markdownPhysicallyAppliedAt (null = needs re-tagging) is the tracking field; both
 * markdown crons reset it back to null on a later markdown stage so a second price cut
 * re-surfaces the item here even if it was already re-tagged once.
 *
 * Pattern modeled on organizer/ugc-moderation.tsx (pending-count badge, loading/error/
 * empty states, per-row action button) and organizer/holds.tsx (checkbox Set + "select
 * all on this page" bulk action).
 *
 * Access (Patrick, 2026-09-29, decisions D3 + D6): the list is free for EVERY tier (the default
 * 50%/75% markdown schedule is a free feature). Staff (team members) can use it through a
 * dedicated permission while the owner is on TEAMS; the backend is the real gate and answers
 * 403 otherwise. Staff users do not carry the ORGANIZER role, so this page only bounces
 * visitors who are not logged in (same rule as organizer/pos.tsx) and turns 403s into a clear message.
 *
 * Route: /organizer/markdown-retag
 */

import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import api from '../../lib/api';

interface RetagQueueItem {
  id: string;
  title: string;
  sku: string | null;
  price: number | null;
  priceBeforeMarkdown: number | null;
  photoUrl: string | null;
  saleId: string | null;
  saleTitle: string | null;
  markedDownAt: string;
  stickerPct?: number | null;
  discountPct?: number | null;
  needsRetag?: boolean;
}

interface ActiveListResponse {
  items: RetagQueueItem[];
  total: number;
  countsByPct: Record<string, number>;
}

interface RetagQueueResponse {
  items: RetagQueueItem[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

const PAGE_SIZE = 50;

// Backend codes whose server message is already written for the user (requireTier).
const USER_READY_403_CODES = ['TIER_REQUIRED', 'GRACE_PERIOD_RESTRICTION'];
const NO_ACCESS_DETAIL = 'Ask the account owner to check your team permissions.';

// Turns a failed list request into a title and detail line. A 403 is a permission problem
// (staff without the re-tag permission, or an owner whose plan no longer covers the feature),
// not a broken page, so it gets its own message instead of the generic load error.
const describeListError = (err: unknown, genericTitle: string): { title: string; detail: string } => {
  const e = err as any;
  const status = e?.response?.status;
  const code = e?.response?.data?.code;
  const message = e?.response?.data?.message;
  if (status === 403) {
    return {
      title: 'You do not have access to this list',
      detail: USER_READY_403_CODES.includes(code) && message ? message : NO_ACCESS_DETAIL,
    };
  }
  return { title: genericTitle, detail: 'Please try again later.' };
};

const serverMessage = (err: unknown, fallback: string): string => {
  const message = (err as any)?.response?.data?.message;
  return typeof message === 'string' && message.length > 0 ? message : fallback;
};

const formatPrice = (value: number | null): string =>
  value == null ? '—' : `$${value.toFixed(2)}`;

// Sticker guide (2026-09-29): one colour per markdown step so staff can grab the right
// sticker/highlighter without reading the price maths. Text label always shown too.
const stickerClasses = (pct: number | null | undefined): string => {
  if (pct == null || pct <= 0) return 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  if (pct <= 10) return 'bg-yellow-300 text-yellow-950';
  if (pct <= 20) return 'bg-orange-400 text-orange-950';
  if (pct <= 30) return 'bg-red-500 text-white';
  return 'bg-purple-600 text-white';
};

const StickerBadge: React.FC<{ pct?: number | null }> = ({ pct }) => (
  <span className={`inline-block px-2 py-1 rounded-md text-xs font-bold whitespace-nowrap ${stickerClasses(pct)}`}>
    {pct != null && pct > 0 ? `${pct}% OFF` : 'MARKED DOWN'}
  </span>
);

const MarkdownRetagPage: React.FC = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<'retag' | 'active'>('retag');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const queryKey = ['markdown-retag-queue', page];

  const { data, isLoading, error } = useQuery<RetagQueueResponse>({
    queryKey,
    queryFn: async () => {
      const res = await api.get('/items/markdown-retag-queue', { params: { page, limit: PAGE_SIZE } });
      return res.data;
    },
    enabled: !!user,
  });

  const { data: activeData, isLoading: activeLoading, error: activeError } = useQuery<ActiveListResponse>({
    queryKey: ['markdown-active-list'],
    queryFn: async () => {
      const res = await api.get('/items/markdown-active');
      return res.data;
    },
    enabled: !!user,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['markdown-retag-queue'] });
    queryClient.invalidateQueries({ queryKey: ['markdown-active-list'] });
    setSelectedIds(new Set());
  };

  const markOneMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await api.post(`/items/${itemId}/mark-retagged`);
    },
    onSuccess: () => {
      invalidate();
    },
    onError: (err: unknown) => {
      showToast(serverMessage(err, 'Failed to mark item as re-tagged'), 'error');
    },
  });

  const markBulkMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      const res = await api.post('/items/mark-retagged/bulk', { itemIds });
      return res.data as { updated: number };
    },
    onSuccess: (result) => {
      showToast(`Marked ${result.updated} item${result.updated === 1 ? '' : 's'} as re-tagged`, 'success');
      invalidate();
    },
    onError: (err: unknown) => {
      showToast(serverMessage(err, 'Failed to mark items as re-tagged'), 'error');
    },
  });

  // Bounce only visitors who are not logged in. Do NOT require the ORGANIZER role here: staff
  // (team members) do not carry it, and the backend is the real gate (403 handled below).
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [authLoading, user, router]);

  if (authLoading || !user) return null;

  const retagError = error ? describeListError(error, 'Error loading the re-tag list') : null;
  const activeListError = activeError ? describeListError(activeError, 'Error loading the discounted items list') : null;

  const items = data?.items || [];
  const allOnPageSelected = items.length > 0 && items.every((i) => selectedIds.has(i.id));

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllOnPage = () => {
    setSelectedIds((prev) => {
      if (allOnPageSelected) return new Set();
      return new Set(items.map((i) => i.id));
    });
  };

  return (
    <>
      <Head>
        <title>Markdown Re-tag List - FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        {/* Breadcrumb */}
        <div className="bg-white dark:bg-gray-800 border-b border-warm-200 dark:border-gray-700 px-4 py-4 mb-8">
          <div className="max-w-6xl mx-auto flex items-center gap-3">
            <Link href="/organizer/dashboard" className="text-warm-400 hover:text-warm-600 dark:text-gray-400 dark:hover:text-gray-300 text-sm">
              ← Dashboard
            </Link>
            <span className="text-warm-300 dark:text-gray-600">/</span>
            <h1 className="text-lg font-semibold text-warm-900 dark:text-gray-100">Markdown Re-tag List</h1>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
            <div>
              <h2 className="text-3xl font-bold text-warm-900 dark:text-gray-100 mb-2">Markdown Re-tag List</h2>
              <p className="text-warm-600 dark:text-gray-400 max-w-2xl">
                Items whose price was cut automatically. Re-tag or re-sticker them on the shelf,
                then mark them done here so they drop off this list.
              </p>
            </div>
            {data && data.total > 0 && (
              <div className="px-4 py-2 rounded-full text-white font-semibold text-lg bg-amber-500">
                {data.total} need{data.total === 1 ? 's' : ''} re-tagging
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-4 print:hidden">
            <button
              onClick={() => setTab('retag')}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'retag' ? 'bg-amber-500 text-white' : 'bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100 border border-warm-200 dark:border-gray-700'}`}
            >
              Needs re-tagging{data ? ` (${data.total})` : ''}
            </button>
            <button
              onClick={() => setTab('active')}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'active' ? 'bg-amber-500 text-white' : 'bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100 border border-warm-200 dark:border-gray-700'}`}
            >
              All discounted now{activeData ? ` (${activeData.total})` : ''}
            </button>
          </div>

          {tab === 'active' && (
            <div>
              <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                <div className="flex flex-wrap gap-2 items-center">
                  {activeData &&
                    Object.entries(activeData.countsByPct)
                      .sort((a, b) => Number(a[0]) - Number(b[0]))
                      .map(([pct, n]) => (
                        <span key={pct} className="flex items-center gap-1 text-sm text-warm-800 dark:text-gray-200">
                          <StickerBadge pct={Number(pct)} /> × {n}
                        </span>
                      ))}
                </div>
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 dark:hover:bg-gray-600 text-warm-900 dark:text-gray-100 rounded-lg text-sm font-medium print:hidden"
                >
                  Print this list
                </button>
              </div>

              {activeLoading && <div className="bg-white dark:bg-gray-800 rounded-lg h-20 animate-pulse" />}
              {activeListError && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
                  <p className="font-medium">{activeListError.title}</p>
                  <p className="text-sm mt-1">{activeListError.detail}</p>
                </div>
              )}
              {!activeLoading && !activeError && activeData && activeData.items.length === 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-12 text-center text-warm-600 dark:text-gray-400">
                  Nothing is discounted right now.
                </div>
              )}
              {activeData && activeData.items.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-900/50 overflow-hidden divide-y divide-warm-100 dark:divide-gray-700">
                  {activeData.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-4 p-4">
                      <div className="w-24 flex-shrink-0">
                        <StickerBadge pct={item.stickerPct} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-warm-900 dark:text-gray-100 truncate">{item.title}</p>
                        <p className="text-xs text-warm-500 dark:text-gray-500">
                          {item.sku && <span className="mr-2">SKU: {item.sku}</span>}
                          {item.saleTitle && <span>{item.saleTitle}</span>}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-medium flex-shrink-0 ${item.needsRetag ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}
                      >
                        {item.needsRetag ? 'Needs re-tag' : 'Tag updated'}
                      </span>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm text-warm-500 dark:text-gray-500 line-through">{formatPrice(item.priceBeforeMarkdown)}</p>
                        <p className="font-semibold text-amber-600 dark:text-amber-400">{formatPrice(item.price)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'retag' && (<>
          {/* Bulk action bar */}
          {items.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-900/50 p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
              <label className="flex items-center gap-2 text-sm text-warm-700 dark:text-gray-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={toggleAllOnPage}
                  className="h-4 w-4 rounded border-warm-300 text-amber-600 focus:ring-amber-500"
                />
                Select all on this page ({items.length})
              </label>
              <button
                onClick={() => markBulkMutation.mutate(Array.from(selectedIds))}
                disabled={selectedIds.size === 0 || markBulkMutation.isPending}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {markBulkMutation.isPending
                  ? 'Marking…'
                  : `Mark ${selectedIds.size || ''} selected as re-tagged`.replace('  ', ' ')}
              </button>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-white dark:bg-gray-800 rounded-lg h-20 animate-pulse" />
              ))}
            </div>
          )}

          {/* Error State */}
          {retagError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
              <p className="font-medium">{retagError.title}</p>
              <p className="text-sm mt-1">{retagError.detail}</p>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && items.length === 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-900/50 p-12 text-center">
              <div className="text-6xl mb-4">🏷️</div>
              <h3 className="text-xl font-semibold text-warm-900 dark:text-gray-100 mb-2">
                Nothing needs re-tagging
              </h3>
              <p className="text-warm-600 dark:text-gray-400">
                Every auto-markdown has been matched on the shelf. Check back after the next markdown run.
              </p>
            </div>
          )}

          {/* List */}
          {!isLoading && !error && items.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-900/50 overflow-hidden divide-y divide-warm-100 dark:divide-gray-700">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-4 p-4">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleOne(item.id)}
                    className="h-4 w-4 rounded border-warm-300 text-amber-600 focus:ring-amber-500 flex-shrink-0"
                  />

                  {item.photoUrl ? (
                    <img
                      src={item.photoUrl}
                      alt={item.title}
                      className="w-14 h-14 rounded-md object-cover flex-shrink-0 bg-warm-100 dark:bg-gray-700"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-md bg-warm-100 dark:bg-gray-700 flex-shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-warm-900 dark:text-gray-100 truncate">{item.title}</p>
                    <p className="text-xs text-warm-500 dark:text-gray-500">
                      {item.sku && <span className="mr-2">SKU: {item.sku}</span>}
                      {item.saleTitle && <span>{item.saleTitle}</span>}
                    </p>
                  </div>

                  <div className="flex-shrink-0">
                    <StickerBadge pct={item.stickerPct} />
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="text-sm text-warm-500 dark:text-gray-500 line-through">
                      {formatPrice(item.priceBeforeMarkdown)}
                    </p>
                    <p className="font-semibold text-amber-600 dark:text-amber-400">
                      {formatPrice(item.price)}
                    </p>
                  </div>

                  <button
                    onClick={() => markOneMutation.mutate(item.id)}
                    disabled={markOneMutation.isPending}
                    className="px-3 py-2 bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 dark:hover:bg-gray-600 text-warm-900 dark:text-gray-100 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex-shrink-0"
                  >
                    Mark as re-tagged
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {data && (data.hasMore || page > 1) && (
            <div className="flex justify-center items-center gap-2 mt-8">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 rounded-lg bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100 border border-warm-200 dark:border-gray-700 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-warm-600 dark:text-gray-400">Page {page}</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!data.hasMore}
                className="px-4 py-2 rounded-lg bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100 border border-warm-200 dark:border-gray-700 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
          </>)}
        </div>
      </div>
    </>
  );
};

export default MarkdownRetagPage;
