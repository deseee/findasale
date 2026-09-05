/**
 * ADR-115 Phase 3 -- Organizer Orders Page
 *
 * The one place a sold item that needs organizer action (ship it, hand it over in
 * person, or refund it) actually lives. Before this page, "Buy Shipping Label" only
 * existed on Payouts -- a financial ledger, not a fulfillment tool -- and there was no
 * Orders/Fulfillment page anywhere in the product (confirmed via a full audit of every
 * packages/frontend/pages/organizer/*.tsx file, 2026-09-05). Spec:
 * claude_docs/ux-spotchecks/order-fulfillment-and-shipping-price-validation-2026-09-05.md
 *
 * Reuses the SAME /stripe/earnings endpoint payouts.tsx and dashboard.tsx already call
 * (no new backend query) -- this page just reads two fields (deliveryMethod, pickedUpAt)
 * that endpoint already returns, added alongside this build. Buy Shipping Label moves
 * here from Payouts (REPLACE decision, Patrick confirmed 2026-09-05); Refund is
 * available on BOTH pages, a deliberate Patrick-directed exception to the UX skill's
 * No-Redundancy default -- refunds are relevant both when reconciling earnings
 * (Payouts) and when handling a specific order gone wrong (Orders).
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import Head from 'next/head';
import Link from 'next/link';

interface OrderItem {
  purchaseId: string;
  itemTitle: string;
  saleTitle: string;
  purchaseDate: string;
  salePrice: number;
  deliveryMethod?: string | null;
  // SHIP fields
  shippingAddressLine1?: string | null;
  shippingAddressLine2?: string | null;
  shippingCity?: string | null;
  shippingState?: string | null;
  shippingZip?: string | null;
  shippingLabelUrl?: string | null;
  shippingTrackingNumber?: string | null;
  shippingCarrier?: string | null;
  shippingLabelPurchasedAt?: string | null;
  // LOCAL_PICKUP field
  pickedUpAt?: string | null;
}

const OrganizerOrdersPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [showCompleted, setShowCompleted] = useState(false);
  const [refundModalItem, setRefundModalItem] = useState<OrderItem | null>(null);
  const [refundError, setRefundError] = useState('');

  const { data: earnings, isLoading: earningsLoading, isError: earningsError } = useQuery({
    queryKey: ['earnings-breakdown'],
    queryFn: async () => {
      const res = await api.get('/stripe/earnings');
      return res.data as { items: OrderItem[]; count: number };
    },
    enabled: !!user?.id,
    staleTime: 2 * 60_000,
  });

  const buyLabelMutation = useMutation({
    mutationFn: (purchaseId: string) => api.post(`/stripe/purchases/${purchaseId}/buy-shipping-label`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['earnings-breakdown'] });
      showToast('Shipping label purchased', 'success');
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to purchase shipping label', 'error');
    },
  });

  const markPickedUpMutation = useMutation({
    mutationFn: (purchaseId: string) => api.post(`/stripe/purchases/${purchaseId}/mark-picked-up`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['earnings-breakdown'] });
      showToast('Marked picked up', 'success');
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to mark this order picked up', 'error');
    },
  });

  const refundMutation = useMutation({
    mutationFn: (purchaseId: string) => api.post(`/stripe/refund/${purchaseId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['earnings-breakdown'] });
      queryClient.invalidateQueries({ queryKey: ['stripe-balance'] });
      queryClient.invalidateQueries({ queryKey: ['refund-history'] });
      showToast('Refund issued', 'success');
      setRefundModalItem(null);
      setRefundError('');
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'Failed to issue refund';
      setRefundError(msg);
      showToast(msg, 'error');
    },
  });

  if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  const items = earnings?.items ?? [];
  const needsAction = items.filter(
    (i) =>
      (i.deliveryMethod === 'SHIP' && !i.shippingLabelPurchasedAt) ||
      (i.deliveryMethod === 'LOCAL_PICKUP' && !i.pickedUpAt)
  );
  const completed = items.filter(
    (i) =>
      (i.deliveryMethod === 'SHIP' && !!i.shippingLabelPurchasedAt) ||
      (i.deliveryMethod === 'LOCAL_PICKUP' && !!i.pickedUpAt)
  );

  const renderRow = (item: OrderItem) => (
    <div
      key={item.purchaseId}
      className="border-b border-gray-100 dark:border-gray-700 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{item.itemTitle}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {item.saleTitle} · ${item.salePrice.toFixed(2)} · {new Date(item.purchaseDate).toLocaleDateString()}
        </p>
        {item.deliveryMethod === 'SHIP' && item.shippingZip && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            📦 Ship to: {[item.shippingAddressLine1, item.shippingAddressLine2, item.shippingCity, item.shippingState]
              .filter(Boolean)
              .join(', ')}{' '}
            {item.shippingZip}
          </p>
        )}
        {item.deliveryMethod === 'SHIP' && item.shippingLabelPurchasedAt && (
          <p className="text-xs text-green-600 dark:text-green-400 mt-1">
            ✔ Label purchased ({item.shippingCarrier}) -- tracking{' '}
            <span className="font-mono">{item.shippingTrackingNumber}</span>
            {item.shippingLabelUrl && (
              <>
                {' '}
                <a href={item.shippingLabelUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-green-700 dark:hover:text-green-300">
                  View label
                </a>
              </>
            )}
          </p>
        )}
        {item.deliveryMethod === 'LOCAL_PICKUP' && item.pickedUpAt && (
          <p className="text-xs text-green-600 dark:text-green-400 mt-1">
            ✔ Picked up {new Date(item.pickedUpAt).toLocaleDateString()}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {item.deliveryMethod === 'SHIP' && !item.shippingLabelPurchasedAt && (
          <button
            type="button"
            onClick={() => buyLabelMutation.mutate(item.purchaseId)}
            disabled={buyLabelMutation.isPending}
            className="px-2.5 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50"
          >
            {buyLabelMutation.isPending && buyLabelMutation.variables === item.purchaseId ? 'Buying label…' : 'Buy Shipping Label'}
          </button>
        )}
        {item.deliveryMethod === 'LOCAL_PICKUP' && !item.pickedUpAt && (
          <button
            type="button"
            onClick={() => markPickedUpMutation.mutate(item.purchaseId)}
            disabled={markPickedUpMutation.isPending}
            className="px-2.5 py-1 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded transition-colors disabled:opacity-50"
          >
            {markPickedUpMutation.isPending && markPickedUpMutation.variables === item.purchaseId ? 'Marking…' : 'Mark Picked Up'}
          </button>
        )}
        <button
          type="button"
          onClick={() => { setRefundModalItem(item); setRefundError(''); }}
          className="px-2.5 py-1 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
        >
          Refund
        </button>
      </div>
    </div>
  );

  return (
    <>
      <Head>
        <title>Orders - FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-4">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <Link href="/organizer/dashboard" className="text-gray-400 hover:text-gray-600 dark:text-gray-400 text-sm">
              ← Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Orders</h1>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
          {earningsError && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-400">
              Something went wrong loading your orders. Please refresh to try again.
            </div>
          )}

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Needs Action
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              Sold items waiting on you -- ship it, hand it over, or refund it.
            </p>

            {earningsLoading ? (
              <p className="text-gray-400 text-sm">Loading orders…</p>
            ) : needsAction.length === 0 ? (
              <p className="text-gray-400 text-sm">Nothing needs action right now.</p>
            ) : (
              <div>{needsAction.map(renderRow)}</div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <button
              type="button"
              onClick={() => setShowCompleted((v) => !v)}
              className="w-full flex items-center justify-between text-left"
            >
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Completed ({completed.length})
              </span>
              <span className="text-gray-400 text-xs">{showCompleted ? 'Hide' : 'Show'}</span>
            </button>
            {showCompleted && (
              completed.length === 0 ? (
                <p className="text-gray-400 text-sm mt-4">No completed orders yet.</p>
              ) : (
                <div className="mt-4">{completed.map(renderRow)}</div>
              )
            )}
          </div>
        </div>
      </div>

      {refundModalItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Confirm Refund</h2>
              <button
                onClick={() => { if (!refundMutation.isPending) { setRefundModalItem(null); setRefundError(''); } }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Refund <span className="font-semibold">${refundModalItem.salePrice.toFixed(2)}</span> for{' '}
                <span className="font-semibold">{refundModalItem.itemTitle}</span> ({refundModalItem.saleTitle})?
                This reverses the buyer's charge and cannot be undone.
              </p>
              {refundError && <p className="text-sm text-red-600 dark:text-red-400">{refundError}</p>}
            </div>
            <div className="flex justify-end gap-3 px-5 pb-5">
              <button
                onClick={() => { if (!refundMutation.isPending) { setRefundModalItem(null); setRefundError(''); } }}
                disabled={refundMutation.isPending}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={refundMutation.isPending}
                onClick={() => { if (refundModalItem) refundMutation.mutate(refundModalItem.purchaseId); }}
                className="px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                {refundMutation.isPending ? 'Refunding…' : 'Refund'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default OrganizerOrdersPage;
