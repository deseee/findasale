/**
 * Sale Detail Page
 *
 * Displays a single sale with its items list and bulk actions.
 * Allows organizers to view, manage, and push items to eBay.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../lib/api';
import { useAuth } from '../../../../components/AuthContext';
import { useToast } from '../../../../components/ToastContext';
import { useEbayConnection } from '../../../../lib/useEbayConnection';
import { useOrganizerTier } from '../../../../hooks/useOrganizerTier';
import { PostSaleEbayPanel } from '../../../../components/PostSaleEbayPanel';
import Head from 'next/head';
import Link from 'next/link';
import Skeleton from '../../../../components/Skeleton';

interface Item {
  id: string;
  title: string;
  price?: number;
  status: string;
  draftStatus?: string;
  photoUrls: string[];
  ebayListingId?: string;
  saleId: string;
}

interface Sale {
  id: string;
  title: string;
  status: string;
  startDate?: string;
  endDate?: string;
  city?: string;
  state?: string;
}

const SaleDetailPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { isConnected: ebayConnected } = useEbayConnection();
  const { tier } = useOrganizerTier();

  // State tracking eBay push status per item
  const [ebayPushStatus, setEbayPushStatus] = useState<Record<string, 'idle' | 'pushing' | 'listed' | 'error'>>({});
  // State for post-sale toast
  const [showedPostSaleToast, setShowedPostSaleToast] = useState(false);
  const [postSaleToastDismissed, setPostSaleToastDismissed] = useState(false);

  if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  // Fetch sale details
  const { data: sale, isLoading: saleLoading } = useQuery({
    queryKey: ['sale', id],
    queryFn: async () => {
      const response = await api.get(`/sales/${id}`);
      return response.data as Sale;
    },
    enabled: !!id,
  });

  // Fetch items for this sale
  const { data: items = [], isLoading: itemsLoading, refetch: refetchItems } = useQuery({
    queryKey: ['items', id, 'by-sale'],
    queryFn: async () => {
      const response = await api.get(`/items?saleId=${id}&limit=1000`);
      return (response.data.items || response.data) as Item[];
    },
    enabled: !!id,
  });

  // eBay push mutation
  const ebayPushMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      return api.post(`/organizer/sales/${id}/ebay-push`, {
        itemIds,
      });
    },
    onSuccess: (response) => {
      const results = response.data.results || [];
      results.forEach((result: any) => {
        if (result.success) {
          setEbayPushStatus((prev) => ({ ...prev, [result.itemId]: 'listed' }));
          showToast(`Item listed on eBay`, 'success');
        } else {
          setEbayPushStatus((prev) => ({ ...prev, [result.itemId]: 'error' }));
          const errorMsg = result.error?.includes('NOT_CONNECTED')
            ? 'eBay not connected'
            : result.error?.includes('POLICIES')
            ? 'eBay policies not configured'
            : result.error || 'Failed to push item';
          showToast(errorMsg, 'error');
        }
      });
      refetchItems();
    },
    onError: (error: any, variables: string[]) => {
      const msg = error.response?.data?.message || 'Failed to push item to eBay';
      showToast(msg, 'error');
      variables.forEach((id) => {
        setEbayPushStatus((prev) => ({ ...prev, [id]: 'error' }));
      });
    },
  });

  const handlePushToEbay = useCallback(
    (itemId: string) => {
      if (!ebayConnected) {
        showToast('Connect eBay in Settings first', 'error');
        return;
      }
      if (tier === 'SIMPLE') {
        showToast('eBay selling requires PRO or TEAMS tier', 'error');
        return;
      }
      setEbayPushStatus((prev) => ({ ...prev, [itemId]: 'pushing' }));
      ebayPushMutation.mutate([itemId]);
    },
    [ebayConnected, tier, ebayPushMutation, showToast]
  );

  // Show post-sale toast when sale is ENDED and has unsold items
  useEffect(() => {
    if (sale && sale.status === 'ENDED' && items && items.length > 0 && !showedPostSaleToast && !postSaleToastDismissed) {
      const toastKey = `post_sale_toast_${id}`;
      const alreadyDismissed = typeof window !== 'undefined' && sessionStorage.getItem(toastKey) === 'true';

      if (!alreadyDismissed) {
        const unsoldCount = items.filter((item) => item.status !== 'SOLD' && item.status !== 'RESERVED').length;
        const unsoldWithoutEbay = items.filter(
          (item) => (item.status !== 'SOLD' && item.status !== 'RESERVED') && !item.ebayListingId
        ).length;

        if (unsoldWithoutEbay > 0) {
          const handleOpenPanel = () => {
            const panelElement = document.getElementById('post-sale-panel');
            if (panelElement) {
              panelElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          };

          // Custom toast with action button
          showToast(`${unsoldWithoutEbay} item${unsoldWithoutEbay !== 1 ? 's' : ''} didn't sell — ready to list on eBay?`, 'info');

          setShowedPostSaleToast(true);
          if (typeof window !== 'undefined') {
            sessionStorage.setItem(toastKey, 'true');
          }
        }
      }
    }
  }, [sale, items, id, showedPostSaleToast, postSaleToastDismissed]);

  const isLoading = authLoading || saleLoading || itemsLoading;

  if (isLoading) {
    return (
      <>
        <Head>
          <title>Sale | FindA.Sale</title>
        </Head>
        <div className="min-h-screen bg-warm-50 dark:bg-gray-900 py-8">
          <div className="max-w-6xl mx-auto px-4">
            <Skeleton className="h-10 w-64 mb-4" />
            <Skeleton className="h-6 w-96 mb-8" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-64" />
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!sale) {
    return (
      <>
        <Head>
          <title>Sale Not Found | FindA.Sale</title>
        </Head>
        <div className="min-h-screen bg-warm-50 dark:bg-gray-900 py-8">
          <div className="max-w-6xl mx-auto px-4">
            <div className="text-center py-12">
              <p className="text-warm-600 dark:text-warm-400 mb-6">Sale not found</p>
              <Link
                href="/organizer/sales"
                className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg"
              >
                Back to Sales
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  const availableItems = items.filter(
    (item) => item.status === 'AVAILABLE' || item.status === 'DRAFT' || !item.status
  );

  return (
    <>
      <Head>
        <title>{sale.title} | FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 py-8">
        <div className="max-w-6xl mx-auto px-4">
          {/* Header */}
          <div className="mb-6">
            <Link
              href="/organizer/sales"
              className="text-amber-700 hover:text-amber-800 dark:text-amber-400 font-medium mb-4 inline-block"
            >
              ← Back to Sales
            </Link>
            <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100">{sale.title}</h1>
            <p className="text-warm-600 dark:text-warm-400 mt-2">
              {sale.city && sale.state ? `${sale.city}, ${sale.state}` : 'Location TBA'} · {availableItems.length} items
            </p>
          </div>

          {/* Items Grid */}
          {availableItems.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {availableItems.map((item) => (
                <div
                  key={item.id}
                  className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-200 dark:border-gray-700 overflow-hidden hover:shadow-md transition-shadow"
                >
                  {/* Photo */}
                  {item.photoUrls?.[0] && (
                    <div className="aspect-square bg-gray-100 dark:bg-gray-700 overflow-hidden">
                      <img
                        src={item.photoUrls[0]}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  {/* Content */}
                  <div className="p-4">
                    <h3 className="font-semibold text-warm-900 dark:text-warm-100 mb-2 line-clamp-2">
                      {item.title}
                    </h3>

                    {item.price && (
                      <p className="text-lg font-bold text-amber-700 dark:text-amber-400 mb-3">
                        ${Number(item.price).toFixed(2)}
                      </p>
                    )}

                    {/* eBay Status Badge */}
                    {item.ebayListingId && (
                      <div className="mb-3 inline-block bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200 text-xs font-semibold px-2 py-1 rounded">
                        ✓ Listed on eBay
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-2 mt-4">
                      <Link
                        href={`/organizer/edit-item/${item.id}`}
                        className="flex-1 text-center text-sm bg-warm-200 dark:bg-gray-700 hover:bg-warm-300 dark:hover:bg-gray-600 text-warm-900 dark:text-warm-100 font-semibold py-2 px-2 rounded transition-colors"
                      >
                        Edit
                      </Link>

                      {/* Push to eBay Button */}
                      {!item.ebayListingId &&
                        tier !== 'SIMPLE' &&
                        ebayConnected && (
                        <button
                          onClick={() => handlePushToEbay(item.id)}
                          disabled={ebayPushStatus[item.id] === 'pushing'}
                          title=""
                          className="flex-1 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2 px-2 rounded transition-colors"
                        >
                          {ebayPushStatus[item.id] === 'pushing' ? 'Pushing...' : 'Push to eBay'}
                        </button>
                      )}

                      {/* View on eBay Link */}
                      {item.ebayListingId && (
                        <a
                          href={`https://www.ebay.com/itm/${item.ebayListingId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 text-center text-sm bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-2 rounded transition-colors"
                        >
                          View on eBay
                        </a>
                      )}

                      {/* Disabled state for SIMPLE tier */}
                      {!item.ebayListingId && tier === 'SIMPLE' && (
                        <button
                          disabled
                          title="Upgrade to PRO to use eBay"
                          className="flex-1 text-sm bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400 font-semibold py-2 px-2 rounded cursor-not-allowed"
                        >
                          Push to eBay
                        </button>
                      )}

                      {/* Disabled state for no eBay connection */}
                      {!item.ebayListingId && !ebayConnected && (
                        <button
                          disabled
                          title="Connect eBay in Settings"
                          className="flex-1 text-sm bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400 font-semibold py-2 px-2 rounded cursor-not-allowed"
                        >
                          Push to eBay
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-warm-600 dark:text-warm-400">No items in this sale yet</p>
            </div>
          )}

          {/* Post-Sale eBay Push Panel */}
          {sale && sale.status === 'ENDED' && (
            <div id="post-sale-panel">
              <PostSaleEbayPanel saleId={id as string} />
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default SaleDetailPage;
