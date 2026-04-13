/**
 * Feature #24: Holds-Only Item View
 * Upgraded organizer hold management page.
 * Filter by sale, sort by expiry/created, grouped-by-buyer display,
 * batch actions (release, extend, mark sold), item photos + prices.
 */

import React, { useState, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import HoldTimer from '../../components/HoldTimer';
import FraudBadge from '../../components/FraudBadge';
import EmptyState from '../../components/EmptyState';
import { formatDistanceToNow, parseISO } from 'date-fns';

// Helper: Map explorer rank to badge emoji and description
function getRankBadge(rank?: string): { emoji: string; label: string; description: string } {
  switch (rank) {
    case 'GRANDMASTER':
      return {
        emoji: '👑',
        label: 'Grandmaster',
        description: 'Grandmaster buyers almost always follow through.',
      };
    case 'SAGE':
      return {
        emoji: '🧙',
        label: 'Sage',
        description: 'One of your best potential customers. High purchase completion rate.',
      };
    case 'RANGER':
      return {
        emoji: '🧗',
        label: 'Ranger',
        description: 'Active buyer. Visits sales frequently and completes purchases.',
      };
    case 'SCOUT':
      return {
        emoji: '🐦',
        label: 'Scout',
        description: 'Has visited multiple sales. Starting to become a regular.',
      };
    case 'INITIATE':
    default:
      return {
        emoji: '⚔️',
        label: 'Initiate',
        description: 'New to FindA.Sale. First hold or purchase.',
      };
  }
}

interface HoldItem {
  id: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  note: string | null;
  user: { id: string; name: string; email: string; fraudConfidenceScore?: number; explorerRank?: string };
  item: {
    id: string;
    title: string;
    price: number | null;
    photoUrls: string[];
    sale: { id: string; title: string };
  };
}

const OrganizerHoldsPage = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [saleFilter, setSaleFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'expiry' | 'created'>('expiry');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Initialize saleFilter from query param on mount
  React.useEffect(() => {
    if (router.isReady && router.query.saleId) {
      setSaleFilter(router.query.saleId as string);
    }
  }, [router.isReady, router.query.saleId]);

  if (!isLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  // Fetch holds with filters
  const { data: holds = [], isLoading: holdsLoading } = useQuery({
    queryKey: ['organizer-holds', saleFilter, sortBy],
    queryFn: async () => {
      const params = new URLSearchParams({ sort: sortBy });
      if (saleFilter !== 'all') params.set('saleId', saleFilter);
      const response = await api.get(`/reservations/organizer?${params}`);
      return (response.data.holds ?? []) as HoldItem[];
    },
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  // Fetch organizer's sales for filter dropdown
  const { data: salesData } = useQuery({
    queryKey: ['organizer-sales-list', user?.id],
    queryFn: async () => {
      const response = await api.get('/sales/mine');
      return response.data.sales as { id: string; title: string }[];
    },
    enabled: !!user?.id,
  });

  // Single hold update (confirm/cancel)
  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/reservations/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizer-holds'] });
      showToast('Hold updated', 'success');
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to update hold', 'error');
    },
  });

  // Batch mutation
  const batchMutation = useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: string }) =>
      api.post('/reservations/batch', { ids, action }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['organizer-holds'] });
      setSelectedIds(new Set());
      showToast(`${res.data.updated} hold(s) updated`, 'success');
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Batch update failed', 'error');
    },
  });

  // Group holds by buyer
  const groupedByBuyer = useMemo(() => {
    const groups: Record<string, { buyerName: string; buyerEmail: string; holds: HoldItem[] }> = {};
    for (const hold of holds) {
      const key = hold.user.id;
      if (!groups[key]) {
        groups[key] = { buyerName: hold.user.name, buyerEmail: hold.user.email, holds: [] };
      }
      groups[key].holds.push(hold);
    }
    return Object.values(groups).sort((a, b) => b.holds.length - a.holds.length);
  }, [holds]);

  // Selection helpers
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === holds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(holds.map((h) => h.id)));
    }
  };

  const handleBatch = (action: 'release' | 'extend' | 'markSold') => {
    if (selectedIds.size === 0) return;
    batchMutation.mutate({ ids: Array.from(selectedIds), action });
  };

  // Accordion state for buyer groups
  const [expandedBuyers, setExpandedBuyers] = useState<Set<string>>(new Set());
  const toggleBuyerExpand = (buyerId: string) => {
    setExpandedBuyers((prev) => {
      const next = new Set(prev);
      next.has(buyerId) ? next.delete(buyerId) : next.add(buyerId);
      return next;
    });
  };

  // Auto-expand all on first load
  const allExpanded = expandedBuyers.size === 0 && holds.length > 0;

  return (
    <>
      <Head>
        <title>Active Holds - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-5xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <Link href="/organizer/dashboard" className="text-amber-600 dark:text-amber-500 hover:text-amber-800 dark:hover:text-amber-400 text-sm">
              ← Dashboard
            </Link>
            <h1 className="text-2xl font-bold text-warm-900 dark:text-warm-100">
              Active Holds {holds.length > 0 && <span className="text-lg font-normal text-warm-500 dark:text-warm-400">({holds.length})</span>}
            </h1>
          </div>

          {/* Filters bar */}
          <div className="flex flex-wrap items-center gap-4 mb-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
            {/* Sale filter */}
            <div className="flex items-center gap-2">
              <label htmlFor="sale-filter" className="text-sm font-medium text-warm-700 dark:text-warm-300">Sale:</label>
              <select
                id="sale-filter"
                value={saleFilter}
                onChange={(e) => { setSaleFilter(e.target.value); setSelectedIds(new Set()); }}
                className="text-sm border border-warm-300 dark:border-gray-700 rounded-md px-3 py-1.5 bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 focus:ring-amber-500 focus:border-amber-500"
              >
                <option value="all">All sales</option>
                {salesData?.map((sale) => (
                  <option key={sale.id} value={sale.id}>{sale.title}</option>
                ))}
              </select>
            </div>

            {/* Sort toggle */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-warm-700 dark:text-warm-300">Sort:</span>
              <button
                onClick={() => setSortBy('expiry')}
                className={`text-sm px-3 py-1 rounded-md transition-colors ${
                  sortBy === 'expiry'
                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 font-semibold'
                    : 'text-warm-600 dark:text-warm-400 hover:bg-warm-100 dark:hover:bg-gray-700'
                }`}
              >
                Expiring Soon
              </button>
              <button
                onClick={() => setSortBy('created')}
                className={`text-sm px-3 py-1 rounded-md transition-colors ${
                  sortBy === 'created'
                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 font-semibold'
                    : 'text-warm-600 dark:text-warm-400 hover:bg-warm-100 dark:hover:bg-gray-700'
                }`}
              >
                Recently Added
              </button>
            </div>

            {/* Select all */}
            {holds.length > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={toggleSelectAll}
                  className="text-sm text-amber-600 dark:text-amber-500 hover:text-amber-800 dark:hover:text-amber-400 font-medium"
                >
                  {selectedIds.size === holds.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
            )}
          </div>

          {/* Batch action bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 mb-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <span className="text-sm font-medium text-amber-800 dark:text-amber-400">{selectedIds.size} selected</span>
              <div className="flex gap-2 ml-auto">
                <button
                  onClick={() => handleBatch('release')}
                  disabled={batchMutation.isPending}
                  className="text-sm bg-white border border-red-300 text-red-600 hover:bg-red-50 px-4 py-1.5 rounded-md disabled:opacity-50 transition-colors"
                >
                  Release
                </button>
                <button
                  onClick={() => handleBatch('extend')}
                  disabled={batchMutation.isPending}
                  className="text-sm bg-white border border-blue-300 text-blue-600 hover:bg-blue-50 px-4 py-1.5 rounded-md disabled:opacity-50 transition-colors"
                >
                  Extend
                </button>
                <button
                  onClick={() => handleBatch('markSold')}
                  disabled={batchMutation.isPending}
                  className="text-sm bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded-md disabled:opacity-50 transition-colors"
                >
                  Mark Sold
                </button>
              </div>
            </div>
          )}

          {/* Content */}
          {holdsLoading ? (
            <p className="text-warm-600 dark:text-warm-400">Loading holds…</p>
          ) : holds.length === 0 ? (
            <EmptyState
              icon="🤝"
              heading="No active holds"
              subtext="When shoppers reserve items from your sales, their holds will appear here. You'll be able to approve, extend, or release them."
            />
          ) : (
            <div className="space-y-4">
              {groupedByBuyer.map((group) => {
                const buyerKey = group.holds[0].user.id;
                const isExpanded = allExpanded || expandedBuyers.has(buyerKey);

                return (
                  <div key={buyerKey} className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
                    {/* Buyer header (accordion toggle) */}
                    <button
                      onClick={() => toggleBuyerExpand(buyerKey)}
                      className="w-full flex items-center justify-between px-5 py-3 bg-warm-50 dark:bg-gray-700 hover:bg-warm-100 dark:hover:bg-gray-600 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-warm-900 dark:text-warm-100 font-semibold">{group.buyerName}</span>
                        <span className="text-warm-400 dark:text-warm-500 text-sm">{group.buyerEmail}</span>
                        {typeof group.holds[0].user.fraudConfidenceScore === 'number' && (
                          <FraudBadge confidenceScore={group.holds[0].user.fraudConfidenceScore} size="sm" />
                        )}
                        {/* Rank badge */}
                        {group.holds[0].user.explorerRank && (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-semibold text-warm-900 dark:text-warm-100">
                              {getRankBadge(group.holds[0].user.explorerRank).emoji}{' '}
                              {getRankBadge(group.holds[0].user.explorerRank).label}
                            </span>
                            {group.holds[0].user.explorerRank === 'GRANDMASTER' && (
                              <span className="text-xs text-warm-500 dark:text-warm-400">
                                {getRankBadge(group.holds[0].user.explorerRank).description}
                              </span>
                            )}
                          </div>
                        )}
                        <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                          {group.holds.length} {group.holds.length === 1 ? 'hold' : 'holds'}
                        </span>
                      </div>
                      <svg
                        className={`h-5 w-5 text-warm-400 dark:text-warm-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Hold items */}
                    {isExpanded && (
                      <div className="divide-y divide-warm-100 dark:divide-gray-700">
                        {group.holds.map((hold) => (
                          <div key={hold.id} className="flex items-start gap-4 px-5 py-4">
                            {/* Checkbox */}
                            <input
                              type="checkbox"
                              checked={selectedIds.has(hold.id)}
                              onChange={() => toggleSelect(hold.id)}
                              className="mt-1 h-4 w-4 rounded border-warm-300 text-amber-600 focus:ring-amber-500"
                            />

                            {/* Item thumbnail */}
                            <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-warm-100 dark:bg-gray-700">
                              {hold.item.photoUrls && hold.item.photoUrls.length > 0 ? (
                                <img
                                  key={hold.item.photoUrls[0]}
                                  src={hold.item.photoUrls[0]}
                                  alt={hold.item.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-warm-400 dark:text-warm-500 text-2xl">📷</div>
                              )}
                            </div>

                            {/* Details */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <Link
                                    href={`/items/${hold.item.id}`}
                                    className="font-semibold text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 line-clamp-1"
                                  >
                                    {hold.item.title}
                                  </Link>
                                  {hold.item.price != null && (
                                    <span className="ml-2 text-sm font-medium text-green-700">${hold.item.price.toFixed(2)}</span>
                                  )}
                                </div>
                                {/* Single actions */}
                                <div className="flex gap-2 flex-shrink-0">
                                  {hold.status === 'PENDING' && (
                                    <button
                                      onClick={() => updateMutation.mutate({ id: hold.id, status: 'CONFIRMED' })}
                                      disabled={updateMutation.isPending}
                                      title="Approve this hold — shopper will be notified they can come pick up the item"
                                      className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded disabled:opacity-50"
                                    >
                                      Approve Hold
                                    </button>
                                  )}
                                  <button
                                    onClick={() => batchMutation.mutate({ ids: [hold.id], action: 'extend' })}
                                    disabled={batchMutation.isPending}
                                    title="Add 30 minutes to this hold's expiry"
                                    className="text-xs border border-blue-400 text-blue-600 hover:bg-blue-50 px-3 py-1 rounded disabled:opacity-50"
                                  >
                                    Extend (+30min)
                                  </button>
                                  <button
                                    onClick={() => updateMutation.mutate({ id: hold.id, status: 'CANCELLED' })}
                                    disabled={updateMutation.isPending}
                                    title="Cancel this hold — item becomes available again for other shoppers"
                                    className="text-xs border border-red-400 text-red-600 hover:bg-red-50 px-3 py-1 rounded disabled:opacity-50"
                                  >
                                    Cancel Hold
                                  </button>
                                </div>
                              </div>
                              <p className="text-xs text-warm-500 dark:text-warm-400 mt-0.5">{hold.item.sale.title}</p>
                              {hold.note && (
                                <p className="text-xs text-warm-600 dark:text-warm-400 mt-1 italic">"{hold.note}"</p>
                              )}
                              <div className="flex items-center gap-3 mt-2">
                                <span
                                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                    hold.status === 'CONFIRMED'
                                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                      : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                                  }`}
                                >
                                  {hold.status}
                                </span>
                                <HoldTimer expiresAt={hold.expiresAt} />
                                <span className="text-xs text-warm-400 dark:text-warm-500">
                                  Placed {formatDistanceToNow(parseISO(hold.createdAt), { addSuffix: true })}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default OrganizerHoldsPage;
