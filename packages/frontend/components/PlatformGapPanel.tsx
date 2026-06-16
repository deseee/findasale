/**
 * PlatformGapPanel — slide-in side panel showing items not listed on a given platform.
 * Used by the /organizer/platforms page.
 */

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import Skeleton from './Skeleton';

interface GapItem {
  id: string;
  title: string;
  primaryPhotoUrl: string | null;
  price: number | null;
  saleId: string | null;
  saleTitle: string | null;
  listingType: string;
  ebayQueuedAt: string | null;
  ineligibilityReasons?: string[];
}

interface PlatformGapResponse {
  platform: string;
  totalNotListed: number;
  page: number;
  pageSize: number;
  items: GapItem[];
}

export interface PlatformGapPanelProps {
  platform: 'ebay' | 'google' | 'facebook' | 'shopify';
  organizerId: string;
  ebayQueueMode?: boolean;
  googleFilter?: string | null;
  onClose: () => void;
}

const PLATFORM_LABELS: Record<string, string> = {
  ebay: 'eBay',
  google: 'Google Merchant',
  facebook: 'Facebook',
  shopify: 'Shopify',
};

const GOOGLE_REASON_LABELS: Record<string, string> = {
  noPhoto: 'No Photo',
  noPrice: 'No Price',
  auctionType: 'Auction',
};

const REASON_PARAM_MAP: Record<string, string> = {
  noPhoto: 'no_photo',
  noPrice: 'no_price',
  auctionType: 'auction',
};

export default function PlatformGapPanel({
  platform,
  organizerId,
  ebayQueueMode,
  googleFilter,
  onClose,
}: PlatformGapPanelProps) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [activeGoogleFilter, setActiveGoogleFilter] = useState<string>(googleFilter || 'all');
  const [allItems, setAllItems] = useState<GapItem[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [totalNotListed, setTotalNotListed] = useState(0);

  const filterParam =
    platform === 'google' && activeGoogleFilter !== 'all'
      ? `&reason=${REASON_PARAM_MAP[activeGoogleFilter] || activeGoogleFilter}`
      : '';

  const { isLoading, isFetching, data: gapData } = useQuery<PlatformGapResponse>({
    queryKey: ['platform-gap', platform, page, activeGoogleFilter],
    queryFn: async () => {
      const res = await api.get(
        `/organizers/me/platform-gap?platform=${platform}&page=${page}${filterParam}`
      );
      return res.data as PlatformGapResponse;
    },
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!gapData) return;
    setTotalNotListed(gapData.totalNotListed);
    if (page === 1) {
      setAllItems(gapData.items);
    } else {
      setAllItems((prev: GapItem[]) => [...prev, ...gapData.items]);
    }
    setInitialized(true);
  }, [gapData, page]);

  const addToQueueMutation = useMutation({
    mutationFn: (itemIds: string[]) =>
      api.post('/organizers/me/ebay-queue', { itemIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-gap'] });
      queryClient.invalidateQueries({ queryKey: ['platform-stats'] });
    },
  });

  const removeFromQueueMutation = useMutation({
    mutationFn: (itemId: string) =>
      api.delete(`/organizers/me/ebay-queue/${itemId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-gap'] });
      queryClient.invalidateQueries({ queryKey: ['platform-stats'] });
    },
  });

  const handleGoogleFilterChange = (filter: string) => {
    setActiveGoogleFilter(filter);
    setPage(1);
    setAllItems([]);
    setInitialized(false);
  };

  const handleLoadMore = () => {
    setPage((p: number) => p + 1);
  };

  const hasMore = allItems.length < totalNotListed;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full sm:w-[480px] bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-warm-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-warm-900 dark:text-warm-100">
              {PLATFORM_LABELS[platform]} &mdash; Items Not Listed
            </h2>
            {initialized && (
              <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-warm-100 dark:bg-gray-700 text-warm-700 dark:text-warm-300">
                {totalNotListed} items
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close panel"
            className="p-2 rounded-lg hover:bg-warm-100 dark:hover:bg-gray-700 text-warm-500 dark:text-warm-400 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Google filter tabs */}
        {platform === 'google' && (
          <div className="px-5 pt-3 pb-1 flex gap-2 flex-wrap border-b border-warm-100 dark:border-gray-800">
            {(['all', 'noPhoto', 'noPrice', 'auctionType'] as const).map((f) => (
              <button
                key={f}
                onClick={() => handleGoogleFilterChange(f)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  activeGoogleFilter === f
                    ? 'bg-[#87A878] text-white'
                    : 'bg-warm-100 dark:bg-gray-700 text-warm-700 dark:text-warm-300 hover:bg-warm-200 dark:hover:bg-gray-600'
                }`}
              >
                {f === 'all' ? 'All' : GOOGLE_REASON_LABELS[f]}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading && !initialized ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="w-14 h-14 flex-shrink-0 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : allItems.length === 0 && initialized ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <div className="text-5xl mb-4">&#x2705;</div>
              <p className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-2">
                All your items are listed on {PLATFORM_LABELS[platform]}!
              </p>
              <p className="text-sm text-warm-500 dark:text-warm-400">
                Nothing missing &mdash; you&apos;re fully covered.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {allItems.map((item: GapItem) => (
                <div
                  key={item.id}
                  className="flex gap-3 p-3 rounded-lg bg-warm-50 dark:bg-gray-800 border border-warm-100 dark:border-gray-700"
                >
                  {/* Thumbnail */}
                  <div className="w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-warm-200 dark:bg-gray-700">
                    {item.primaryPhotoUrl ? (
                      <img
                        src={item.primaryPhotoUrl}
                        alt={item.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-warm-400 dark:text-warm-500 text-xs">
                        No photo
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-warm-900 dark:text-warm-100 truncate">
                      {item.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {item.price != null && (
                        <span className="text-xs text-warm-600 dark:text-warm-400">
                          ${item.price.toFixed(2)}
                        </span>
                      )}
                      {item.saleTitle && (
                        <span className="text-xs text-warm-500 truncate max-w-[140px]">
                          {item.saleTitle}
                        </span>
                      )}
                    </div>

                    {/* Google ineligibility reasons */}
                    {platform === 'google' && item.ineligibilityReasons && item.ineligibilityReasons.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.ineligibilityReasons.map((reason: string) => (
                          <span
                            key={reason}
                            className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"
                          >
                            {reason}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* eBay queue status */}
                    {platform === 'ebay' && item.ebayQueuedAt && (
                      <p className="text-xs text-[#6b8f5e] dark:text-[#a8c49a] mt-1">
                        In queue since{' '}
                        {new Date(item.ebayQueuedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                    )}

                    {/* Facebook note */}
                    {platform === 'facebook' && (
                      <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                        Include in next export from sale page
                      </p>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-2 mt-2">
                      {platform === 'ebay' && ebayQueueMode && !item.ebayQueuedAt && (
                        <button
                          onClick={() => addToQueueMutation.mutate([item.id])}
                          disabled={addToQueueMutation.isPending}
                          className="text-xs px-2 py-1 rounded bg-[#87A878] hover:bg-[#6b8f5e] text-white font-medium transition-colors disabled:opacity-50"
                        >
                          Add to Queue
                        </button>
                      )}
                      {platform === 'ebay' && !ebayQueueMode && !item.ebayQueuedAt && (
                        <button
                          disabled
                          className="text-xs px-2 py-1 rounded bg-warm-200 dark:bg-gray-600 text-warm-500 dark:text-warm-400 font-medium cursor-not-allowed"
                          title="Enable Queue Mode to manage eBay listings"
                        >
                          Push to eBay
                        </button>
                      )}
                      {platform === 'ebay' && item.ebayQueuedAt && (
                        <button
                          onClick={() => removeFromQueueMutation.mutate(item.id)}
                          disabled={removeFromQueueMutation.isPending}
                          className="text-xs px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 hover:bg-red-200 text-red-600 dark:text-red-400 font-medium transition-colors disabled:opacity-50"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Load More */}
              {hasMore && (
                <button
                  onClick={handleLoadMore}
                  disabled={isFetching}
                  className="w-full py-3 text-sm font-medium text-[#6b8f5e] dark:text-[#a8c49a] hover:text-[#87A878] border border-[#a8c49a] dark:border-[#6b8f5e] rounded-lg hover:bg-[#87A878]/5 transition-colors disabled:opacity-50"
                >
                  {isFetching ? 'Loading...' : `Load More (${totalNotListed - allItems.length} remaining)`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
