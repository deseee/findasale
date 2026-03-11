/**
 * ReviewScreen — Phase 3B full-screen review & publish page
 *
 * Route: /organizer/add-items/[saleId]/review
 *
 * Shows all draft items for a sale in full-screen scrollable list.
 * Each item card: thumbnail + title/category/condition/price + status
 * Low-confidence items highlighted in yellow.
 *
 * Polling: GET /api/items/:id/draft-status every 3s for analyzing items
 * Publishes via POST /api/items/:id/publish
 *
 * Load more at 20 items/page
 */

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../lib/api';
import { useAuth } from '../../../../components/AuthContext';
import { useToast } from '../../../../components/ToastContext';
import Head from 'next/head';
import Link from 'next/link';
import Skeleton from '../../../../components/Skeleton';

interface DraftItem {
  id: string;
  saleId: string;
  title?: string;
  category?: string;
  condition?: string;
  description?: string;
  price?: number;
  photoUrls?: string[];
  draftStatus: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED';
  aiErrorLog?: object;
  aiConfidence?: number;
  optimisticLockVersion?: number;
}

const ReviewScreen = () => {
  const router = useRouter();
  const { saleId } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [items, setItems] = useState<DraftItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [selectedPreviewId, setSelectedPreviewId] = useState<string | null>(null);
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const pageSize = 20;

  if (!authLoading && (!user || user.role !== 'ORGANIZER')) {
    router.push('/login');
    return null;
  }

  // Load draft items
  const { data: itemsData = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['draft-items', saleId, page],
    queryFn: async () => {
      if (!saleId) return [];
      const response = await api.get(
        `/items/drafts?saleId=${saleId}&page=${page}&limit=${pageSize}`
      );
      return response.data || [];
    },
    enabled: !!saleId,
  });

  useEffect(() => {
    if (itemsData.length < pageSize) {
      setHasMore(false);
    } else {
      setHasMore(true);
    }

    if (page === 1) {
      setItems(itemsData);
    } else {
      setItems((prev) => [...prev, ...itemsData]);
    }
  }, [itemsData, page]);

  // Polling for analyzing items
  useEffect(() => {
    const analyzingItems = items.filter(
      (i) => i.draftStatus === 'DRAFT' && !i.aiErrorLog
    );

    if (analyzingItems.length === 0) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    const poll = async () => {
      try {
        const updates: Record<string, any> = {};
        await Promise.all(
          analyzingItems.map(async (item) => {
            const res = await api.get(`/items/${item.id}/draft-status`);
            updates[item.id] = res.data;
          })
        );

        setItems((prev) =>
          prev.map((item) => ({
            ...item,
            ...(updates[item.id] || {}),
          }))
        );
      } catch (err) {
        console.error('Polling error:', err);
      }
    };

    pollingIntervalRef.current = setInterval(poll, 3000);
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [items]);

  const publishMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const item = items.find((i) => i.id === itemId);
      if (!item) throw new Error('Item not found');

      return await api.post(`/items/${itemId}/publish`, {
        optimisticLockVersion: item.optimisticLockVersion,
      });
    },
    onSuccess: (_, itemId) => {
      setItems((prev) =>
        prev.map((i) =>
          i.id === itemId ? { ...i, draftStatus: 'PUBLISHED' } : i
        )
      );
      showToast('Item published', 'success');
    },
    onError: (error: any) => {
      const message =
        error.response?.data?.message || 'Failed to publish item';
      showToast(message, 'error');
    },
  });

  const publishAllMutation = useMutation({
    mutationFn: async () => {
      const readyItems = items.filter(
        (i) => i.draftStatus === 'PENDING_REVIEW'
      );
      await Promise.all(
        readyItems.map((item) =>
          api.post(`/items/${item.id}/publish`, {
            optimisticLockVersion: item.optimisticLockVersion,
          })
        )
      );
    },
    onSuccess: () => {
      setItems((prev) =>
        prev.map((i) =>
          i.draftStatus === 'PENDING_REVIEW'
            ? { ...i, draftStatus: 'PUBLISHED' }
            : i
        )
      );
      showToast('All ready items published', 'success');
    },
    onError: (error: any) => {
      const message =
        error.response?.data?.message || 'Failed to publish items';
      showToast(message, 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return await api.delete(`/items/${itemId}`);
    },
    onSuccess: (_, itemId) => {
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      showToast('Item deleted', 'success');
    },
    onError: (error: any) => {
      const message =
        error.response?.data?.message || 'Failed to delete item';
      showToast(message, 'error');
    },
  });

  const getStatusLabel = (item: DraftItem) => {
    if (item.draftStatus === 'PUBLISHED') {
      return { label: 'Published', color: 'text-green-700', bg: 'bg-green-100' };
    }
    if (item.draftStatus === 'PENDING_REVIEW') {
      return {
        label: 'Ready to Publish',
        color: 'text-green-700',
        bg: 'bg-green-100',
      };
    }
    if (item.aiErrorLog) {
      return { label: 'Error', color: 'text-red-700', bg: 'bg-red-100' };
    }
    return {
      label: 'Analyzing...',
      color: 'text-amber-700',
      bg: 'bg-amber-100',
    };
  };

  const readyCount = items.filter(
    (i) => i.draftStatus === 'PENDING_REVIEW'
  ).length;
  const analyzingCount = items.filter(
    (i) => i.draftStatus === 'DRAFT' && !i.aiErrorLog
  ).length;
  const errorCount = items.filter(
    (i) => i.draftStatus === 'DRAFT' && i.aiErrorLog
  ).length;

  if (authLoading) {
    return (
      <div className="min-h-screen bg-warm-50 py-8">
        <div className="max-w-6xl mx-auto px-4">
          <Skeleton className="h-10 w-48 mb-8" />
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Review Items - FindA.Sale</title>
      </Head>

      <main className="min-h-screen bg-warm-50 py-8">
        <div className="max-w-6xl mx-auto px-4">
          {/* Header */}
          <div className="mb-8">
            <Link
              href={`/organizer/add-items/${saleId}`}
              className="text-amber-700 hover:text-amber-800 text-sm font-medium inline-flex items-center gap-1"
            >
              &larr; Back to Add Items
            </Link>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-warm-200 p-6 mb-8">
            <h1 className="text-3xl font-bold text-warm-900 mb-2">
              Review Items Before Publishing
            </h1>
            <p className="text-warm-600 mb-4">
              {items.length} item{items.length !== 1 ? 's' : ''} ·{' '}
              <span className="text-green-700 font-semibold">{readyCount} ready</span>{' '}
              ·
              <span className="text-amber-700 font-semibold">{analyzingCount} analyzing</span>
              {errorCount > 0 && (
                <>
                  {' '}
                  ·
                  <span className="text-red-700 font-semibold">
                    {errorCount} error{errorCount !== 1 ? 's' : ''}
                  </span>
                </>
              )}
            </p>

            {readyCount > 0 && (
              <button
                onClick={() => publishAllMutation.mutate()}
                disabled={publishAllMutation.isPending}
                className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50 transition-colors"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                {publishAllMutation.isPending
                  ? 'Publishing...'
                  : `Publish All Ready (${readyCount})`}
              </button>
            )}
          </div>

          {/* Items List */}
          {itemsLoading && items.length === 0 ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-warm-200">
              <p className="text-warm-600 text-lg">
                No items yet. Go back to add items.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const status = getStatusLabel(item);
                const isLowConfidence =
                  item.aiConfidence !== undefined && item.aiConfidence < 0.6;

                return (
                  <div
                    key={item.id}
                    className={`border rounded-lg p-4 transition-colors ${
                      isLowConfidence && item.draftStatus !== 'PUBLISHED'
                        ? 'bg-yellow-50 border-yellow-300'
                        : 'bg-white border-warm-200'
                    }`}
                  >
                    <div className="flex gap-4">
                      {/* Thumbnail */}
                      <div className="flex-shrink-0">
                        <div className="w-20 h-20 rounded-lg overflow-hidden bg-warm-100 border border-warm-300">
                          {item.photoUrls && item.photoUrls[0] ? (
                            <img
                              src={item.photoUrls[0]}
                              alt={item.title || 'Item'}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400">
                              No photo
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Details */}
                      <div className="flex-1">
                        <h3 className="font-semibold text-warm-900 text-base mb-1">
                          {item.title || 'Untitled'}
                        </h3>
                        <div className="text-sm text-warm-600 space-y-0.5">
                          <p>
                            {item.category && (
                              <>
                                <span className="font-medium">Category:</span>{' '}
                                {item.category}
                              </>
                            )}
                            {item.category && item.condition && ' · '}
                            {item.condition && (
                              <>
                                <span className="font-medium">Condition:</span>{' '}
                                {item.condition}
                              </>
                            )}
                          </p>
                          {item.price && (
                            <p>
                              <span className="font-medium">Price:</span> $
                              {item.price.toFixed(2)}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Status & Actions */}
                      <div className="flex flex-col items-end justify-between">
                        <div
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${status.bg} ${status.color}`}
                        >
                          {status.label}
                        </div>

                        <div className="flex gap-2">
                          {item.draftStatus === 'PENDING_REVIEW' && (
                            <button
                              onClick={() =>
                                publishMutation.mutate(item.id)
                              }
                              disabled={publishMutation.isPending}
                              className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
                            >
                              Publish
                            </button>
                          )}
                          <button
                            onClick={() => router.push(`/organizer/edit-item/${item.id}`)}
                            className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Delete this item?')) {
                                deleteMutation.mutate(item.id);
                              }
                            }}
                            disabled={deleteMutation.isPending}
                            className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold rounded-lg disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Low confidence warning */}
                    {isLowConfidence && item.draftStatus !== 'PUBLISHED' && (
                      <div className="mt-2 text-xs text-yellow-700 px-2">
                        ⚠ Low AI confidence — please review carefully
                      </div>
                    )}

                    {/* Error message */}
                    {item.aiErrorLog && (
                      <div className="mt-2 text-xs text-red-700 px-2">
                        ⚠ AI analysis failed — please fill in details manually
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Load more button */}
              {hasMore && (
                <div className="flex justify-center pt-4">
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={itemsLoading}
                    className="px-4 py-2 bg-warm-100 hover:bg-warm-200 text-warm-900 font-medium rounded-lg disabled:opacity-50"
                  >
                    {itemsLoading ? 'Loading...' : 'Load More Items'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
};

export default ReviewScreen;