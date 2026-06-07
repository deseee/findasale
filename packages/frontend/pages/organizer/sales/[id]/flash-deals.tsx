/**
 * Flash Deals — per-sale management page
 *
 * Accessible from CommandCenterCard → ⚡ Flash Deal link
 * Route: /organizer/sales/[id]/flash-deals
 *
 * Features:
 * - Lists active flash deals for this sale
 * - Create new flash deal (select item, discount %, duration)
 * - Delete / cancel a flash deal
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Head from 'next/head';
import Link from 'next/link';
import api from '../../../../lib/api';
import { useAuth } from '../../../../components/AuthContext';
import { useToast } from '../../../../components/ToastContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SaleItem {
  id: string;
  title: string;
  price: number;
  status: string;
}

interface FlashDeal {
  id: string;
  discountPct: number;
  startsAt: string;
  endsAt: string;
  timeRemainingMinutes: number;
  item: {
    id: string;
    title: string;
    price: number;
    category: string | null;
    photoUrls: string[];
  };
  sale: {
    id: string;
    title: string;
    city: string;
    state: string;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DISCOUNT_OPTIONS = [10, 15, 20, 25, 30, 40, 50];

const DURATION_OPTIONS = [
  { minutes: 60, label: '1 hour' },
  { minutes: 120, label: '2 hours' },
  { minutes: 240, label: '4 hours' },
  { minutes: 360, label: '6 hours' },
  { minutes: 720, label: '12 hours' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeRemaining(minutes: number): string {
  if (minutes <= 0) return 'Expired';
  if (minutes < 60) return `${minutes}m left`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m left` : `${h}h left`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const FlashDealsPage: React.FC = () => {
  const router = useRouter();
  const { id: saleId } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // Form state
  const [selectedItemId, setSelectedItemId] = useState('');
  const [discountPct, setDiscountPct] = useState(25);
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [showForm, setShowForm] = useState(false);

  // Auth gate
  if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  const saleIdStr = typeof saleId === 'string' ? saleId : '';

  // Fetch AVAILABLE items for this sale (to populate item selector)
  const { data: saleItems = [], isLoading: itemsLoading } = useQuery<SaleItem[]>({
    queryKey: ['flash-deal-page-items', saleIdStr],
    queryFn: async () => {
      const res = await api.get(`/items/drafts?saleId=${saleIdStr}&limit=200`);
      const raw: Array<{ id: string; title: string; price?: number; status?: string }> =
        res.data.items ?? res.data;
      return raw
        .map((item) => ({
          id: item.id,
          title: item.title,
          price: item.price ?? 0,
          status: item.status ?? '',
        }))
        .filter((item) => item.status === 'AVAILABLE');
    },
    enabled: !!saleIdStr,
  });

  // Fetch active flash deals (public endpoint — filters by endsAt > now)
  const { data: allDeals = [], isLoading: dealsLoading } = useQuery<FlashDeal[]>({
    queryKey: ['flash-deals-active'],
    queryFn: async () => {
      const res = await api.get('/flash-deals');
      return res.data as FlashDeal[];
    },
    enabled: !!saleIdStr,
    refetchInterval: 60_000, // refresh every minute for countdown accuracy
  });

  // Filter to just this sale's deals
  const saleDeals = allDeals.filter((d) => d.sale.id === saleIdStr);
  const saleName = saleDeals[0]?.sale?.title ?? 'This Sale';

  // Create flash deal mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/flash-deals', {
        itemId: selectedItemId,
        discountPct,
        durationMinutes,
      });
      return res.data;
    },
    onSuccess: () => {
      showToast('Flash deal created! Subscribers have been notified.', 'success');
      queryClient.invalidateQueries({ queryKey: ['flash-deals-active'] });
      setShowForm(false);
      setSelectedItemId('');
      setDiscountPct(25);
      setDurationMinutes(120);
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to create flash deal', 'error');
    },
  });

  // Delete flash deal mutation
  const deleteMutation = useMutation({
    mutationFn: async (dealId: string) => {
      await api.delete(`/flash-deals/${dealId}`);
    },
    onSuccess: () => {
      showToast('Flash deal cancelled', 'success');
      queryClient.invalidateQueries({ queryKey: ['flash-deals-active'] });
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to cancel flash deal', 'error');
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId) {
      showToast('Please select an item', 'error');
      return;
    }
    createMutation.mutate();
  };

  const isLoading = authLoading || dealsLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900">
        <div className="text-warm-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Flash Deals — FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-2xl mx-auto px-4 py-8">

          {/* Header */}
          <div className="mb-6">
            <Link
              href="/organizer/dashboard"
              className="inline-flex items-center gap-1 text-sm text-warm-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 mb-4 transition-colors"
            >
              ← Back to Dashboard
            </Link>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-warm-900 dark:text-white">⚡ Flash Deals</h1>
                <p className="text-sm text-warm-500 dark:text-gray-400 mt-1">
                  Create time-limited discounts to drive urgency during your sale
                </p>
              </div>
              {!showForm && (
                <button
                  onClick={() => setShowForm(true)}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-semibold px-4 py-2 rounded-lg transition-colors text-sm"
                >
                  + Create Flash Deal
                </button>
              )}
            </div>
          </div>

          {/* Create Form */}
          {showForm && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-warm-200 dark:border-gray-700 p-6 mb-6">
              <h2 className="text-lg font-semibold text-warm-900 dark:text-white mb-4">Create Flash Deal</h2>
              <form onSubmit={handleCreate} className="space-y-5">

                {/* Item selector */}
                <div>
                  <label className="block text-sm font-medium text-warm-700 dark:text-gray-200 mb-1">
                    Select Item
                  </label>
                  {itemsLoading ? (
                    <div className="text-sm text-warm-400 dark:text-gray-500">Loading items...</div>
                  ) : saleItems.length === 0 ? (
                    <div className="text-sm text-warm-400 dark:text-gray-500 p-3 bg-warm-50 dark:bg-gray-700 rounded-lg">
                      No available items found for this sale.
                    </div>
                  ) : (
                    <select
                      value={selectedItemId}
                      onChange={(e) => setSelectedItemId(e.target.value)}
                      className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-700 text-warm-900 dark:text-white text-sm"
                    >
                      <option value="">— Choose an item —</option>
                      {saleItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}{item.price ? ` — $${item.price}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Discount % */}
                <div>
                  <label className="block text-sm font-medium text-warm-700 dark:text-gray-200 mb-2">
                    Discount
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {DISCOUNT_OPTIONS.map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setDiscountPct(pct)}
                        className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
                          discountPct === pct
                            ? 'bg-amber-600 text-white'
                            : 'bg-warm-50 dark:bg-gray-700 border border-warm-300 dark:border-gray-600 text-warm-800 dark:text-gray-200 hover:border-amber-500 dark:hover:border-amber-400'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>

                {/* Duration */}
                <div>
                  <label className="block text-sm font-medium text-warm-700 dark:text-gray-200 mb-2">
                    Duration
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {DURATION_OPTIONS.map((opt) => (
                      <button
                        key={opt.minutes}
                        type="button"
                        onClick={() => setDurationMinutes(opt.minutes)}
                        className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                          durationMinutes === opt.minutes
                            ? 'bg-amber-600 text-white'
                            : 'bg-warm-50 dark:bg-gray-700 border border-warm-300 dark:border-gray-600 text-warm-800 dark:text-gray-200 hover:border-amber-500 dark:hover:border-amber-400'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Summary line */}
                {selectedItemId && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-300">
                    ⚡ {discountPct}% off for{' '}
                    {DURATION_OPTIONS.find((o) => o.minutes === durationMinutes)?.label} — subscribers will be notified instantly.
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={createMutation.isPending || !selectedItemId}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 disabled:cursor-not-allowed text-white font-bold py-2.5 px-4 rounded-lg transition-colors text-sm"
                  >
                    {createMutation.isPending ? 'Creating...' : 'Create Deal'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setSelectedItemId('');
                    }}
                    className="px-4 py-2.5 border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-gray-300 rounded-lg hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Active Deals List */}
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-warm-700 dark:text-gray-300">
              Active Flash Deals
              {saleDeals.length > 0 && (
                <span className="ml-2 text-xs font-normal text-warm-400 dark:text-gray-500">
                  ({saleDeals.length})
                </span>
              )}
            </h2>

            {saleDeals.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-warm-200 dark:border-gray-700 p-10 text-center">
                <div className="text-4xl mb-3">⚡</div>
                <p className="text-warm-700 dark:text-gray-300 font-medium mb-1">No active flash deals</p>
                <p className="text-sm text-warm-400 dark:text-gray-500 mb-5">
                  Create a time-limited discount to notify subscribers and drive urgency.
                </p>
                {!showForm && (
                  <button
                    onClick={() => setShowForm(true)}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-semibold px-5 py-2 rounded-lg transition-colors text-sm"
                  >
                    Create Your First Flash Deal
                  </button>
                )}
              </div>
            ) : (
              saleDeals.map((deal) => {
                const photoUrl = deal.item.photoUrls?.[0];
                const originalPrice = deal.item.price;
                const salePrice = originalPrice
                  ? Math.round(originalPrice * (1 - deal.discountPct / 100) * 100) / 100
                  : null;

                return (
                  <div
                    key={deal.id}
                    className="bg-white dark:bg-gray-800 rounded-xl border border-warm-200 dark:border-gray-700 p-4 flex gap-4 items-start"
                  >
                    {/* Item photo */}
                    {photoUrl ? (
                      <img
                        src={photoUrl}
                        alt={deal.item.title}
                        className="w-16 h-16 object-cover rounded-lg flex-shrink-0 border border-warm-200 dark:border-gray-600"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-warm-100 dark:bg-gray-700 rounded-lg flex-shrink-0 flex items-center justify-center text-2xl">
                        ⚡
                      </div>
                    )}

                    {/* Deal info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-warm-900 dark:text-white text-sm truncate">
                            {deal.item.title}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-amber-600 dark:text-amber-400 font-bold text-sm">
                              {deal.discountPct}% OFF
                            </span>
                            {originalPrice > 0 && (
                              <span className="text-xs text-warm-400 dark:text-gray-500">
                                <span className="line-through">${originalPrice}</span>
                                {salePrice !== null && (
                                  <span className="text-green-600 dark:text-green-400 ml-1 font-medium">
                                    → ${salePrice}
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => deleteMutation.mutate(deal.id)}
                          disabled={deleteMutation.isPending}
                          className="flex-shrink-0 text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50 transition-colors px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                          title="Cancel this flash deal"
                        >
                          Cancel
                        </button>
                      </div>

                      <div className="mt-2 flex items-center gap-3 text-xs text-warm-500 dark:text-gray-400">
                        <span
                          className={`font-semibold ${
                            deal.timeRemainingMinutes <= 30
                              ? 'text-red-500 dark:text-red-400'
                              : deal.timeRemainingMinutes <= 60
                              ? 'text-orange-500 dark:text-orange-400'
                              : 'text-green-600 dark:text-green-400'
                          }`}
                        >
                          {formatTimeRemaining(deal.timeRemainingMinutes)}
                        </span>
                        <span>·</span>
                        <span>Ends {formatDateTime(deal.endsAt)}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Info callout */}
          <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-sm text-blue-700 dark:text-blue-300">
            <p className="font-semibold mb-1">How flash deals work</p>
            <ul className="space-y-1 text-blue-600 dark:text-blue-400 list-disc list-inside">
              <li>Subscribers following this sale are notified instantly</li>
              <li>The discounted price appears on the item listing</li>
              <li>Deals expire automatically when time runs out</li>
              <li>You can cancel a deal early at any time</li>
            </ul>
          </div>

        </div>
      </div>
    </>
  );
};

export default FlashDealsPage;
