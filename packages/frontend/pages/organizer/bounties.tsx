/**
 * V4: Organizer Bounties Page (Redesign Phase 0)
 *
 * Restructured layout with:
 * - Browse Local Bounties section (search modal with mile-range selector)
 * - Your Recent Submissions placeholder (pending backend)
 * - Open Requests for Your Sales (existing functionality)
 * - Closed Requests (existing)
 * - "Work in progress" language — this feature is actively evolving
 *
 * Backend endpoints for submissions and matching are pending schema changes.
 * This is the frontend prep pass.
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import Head from 'next/head';
import Link from 'next/link';

type Bounty = {
  id: string;
  description: string;
  offerPrice: number | null;
  status: 'OPEN' | 'FULFILLED' | 'CANCELLED';
  createdAt: string;
  saleId: string;
  user: { name: string; email: string };
  item: { id: string; title: string; price: number } | null;
};

type Sale = { id: string; title: string };

const STATUS_COLORS: Record<string, { light: string; dark: string }> = {
  OPEN: { light: 'bg-yellow-100 text-yellow-800', dark: 'dark:bg-yellow-900/30 dark:text-yellow-300' },
  FULFILLED: { light: 'bg-green-100 text-green-800', dark: 'dark:bg-green-900/30 dark:text-green-300' },
  CANCELLED: { light: 'bg-gray-100 text-gray-500', dark: 'dark:bg-gray-700 dark:text-gray-400' },
};

const DISTANCE_OPTIONS = [5, 10, 15, 25, 50];

const OrganizerBountiesPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [selectedSaleId, setSelectedSaleId] = useState<string>('');
  const [fulfillBountyId, setFulfillBountyId] = useState<string | null>(null);
  const [fulfillItemId, setFulfillItemId] = useState('');
  const [activeTab, setActiveTab] = useState<'browse' | 'requests' | 'submissions'>('browse');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchRadius, setSearchRadius] = useState(25);
  const [searchQuery, setSearchQuery] = useState('');

  if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  const { data: sales } = useQuery<Sale[]>({
    queryKey: ['organizer-sales-list'],
    queryFn: async () => {
      const res = await api.get('/sales/mine');
      return res.data.sales.map((s: any) => ({ id: s.id, title: s.title }));
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (sales?.length && !selectedSaleId) setSelectedSaleId(sales[0].id);
  }, [sales]);

  const { data: bounties = [], isLoading: bountiesLoading } = useQuery<Bounty[]>({
    queryKey: ['bounties', selectedSaleId],
    queryFn: async () => {
      const res = await api.get(`/bounties/sale/${selectedSaleId}`);
      return res.data;
    },
    enabled: !!selectedSaleId,
  });

  const fulfillMutation = useMutation({
    mutationFn: ({ id, itemId }: { id: string; itemId?: string }) =>
      api.patch(`/bounties/${id}/fulfill`, { itemId: itemId || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bounties', selectedSaleId] });
      showToast('Bounty marked as fulfilled', 'success');
      setFulfillBountyId(null);
      setFulfillItemId('');
    },
    onError: (err: any) => showToast(err.response?.data?.message || 'Failed to fulfill', 'error'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/bounties/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bounties', selectedSaleId] });
      showToast('Bounty cancelled', 'success');
    },
    onError: (err: any) => showToast(err.response?.data?.message || 'Failed to cancel', 'error'),
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600 dark:border-amber-400" />
          <p className="mt-4 text-gray-600 dark:text-gray-400 text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  const openBounties = bounties.filter(b => b.status === 'OPEN');
  const closedBounties = bounties.filter(b => b.status !== 'OPEN');

  return (
    <>
      <Head><title>Item Bounties — FindA.Sale</title></Head>

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/organizer/dashboard" className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-400 text-sm">
                ← Dashboard
              </Link>
              <span className="text-gray-300 dark:text-gray-600">/</span>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Item Bounties</h1>
            </div>
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-full">
              Work in progress
            </span>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-6">
          {/* Tab navigation */}
          <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('browse')}
              className={`flex-1 text-sm font-medium py-2 px-4 rounded-md transition ${
                activeTab === 'browse'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Browse Local Bounties
            </button>
            <button
              onClick={() => setActiveTab('requests')}
              className={`flex-1 text-sm font-medium py-2 px-4 rounded-md transition ${
                activeTab === 'requests'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Your Sale Requests
              {openBounties.length > 0 && (
                <span className="ml-1.5 text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 px-1.5 py-0.5 rounded-full">
                  {openBounties.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('submissions')}
              className={`flex-1 text-sm font-medium py-2 px-4 rounded-md transition ${
                activeTab === 'submissions'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Your Submissions
            </button>
          </div>

          {/* ── Tab: Browse Local Bounties ── */}
          {activeTab === 'browse' && (
            <div className="space-y-4">
              {/* Search bar + radius selector */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search bounties (e.g. 'vintage dresser', 'mid-century lamp')"
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg py-2.5 px-4 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
                    />
                    <svg className="absolute right-3 top-2.5 w-5 h-5 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      Within
                    </label>
                    <select
                      value={searchRadius}
                      onChange={e => setSearchRadius(Number(e.target.value))}
                      className="border border-gray-300 dark:border-gray-600 rounded-lg py-2 px-3 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      {DISTANCE_OPTIONS.map(d => (
                        <option key={d} value={d}>{d} miles</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Coming soon placeholder */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-dashed border-amber-300 dark:border-amber-700 p-8 text-center">
                <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Browse Local Bounties
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto mb-3">
                  Soon you'll be able to browse what shoppers in your area are looking for
                  and submit matching items from your inventory. When a shopper approves
                  your submission, you earn XP!
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                  Bounty matching is coming soon
                </p>
              </div>
            </div>
          )}

          {/* ── Tab: Your Sale Requests (existing functionality) ── */}
          {activeTab === 'requests' && (
            <div className="space-y-4">
              {/* Compact sale selector */}
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">Sale:</label>
                <select
                  value={selectedSaleId}
                  onChange={e => setSelectedSaleId(e.target.value)}
                  className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-700 dark:text-gray-100"
                >
                  {!sales?.length && <option value="">No sales found</option>}
                  {sales?.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              </div>

              {/* Open bounties */}
              <div>
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  Open requests ({openBounties.length})
                </h2>
                {bountiesLoading ? (
                  <div className="flex items-center gap-2 py-4">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-600 dark:border-amber-400" />
                    <p className="text-gray-400 dark:text-gray-500 text-sm">Loading…</p>
                  </div>
                ) : openBounties.length === 0 ? (
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 text-center">
                    <p className="text-gray-500 dark:text-gray-400 text-sm">No open requests for this sale.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {openBounties.map(b => (
                      <div key={b.id} className="bg-white dark:bg-gray-800 rounded-xl border border-yellow-200 dark:border-yellow-800 p-4">
                        <div className="flex justify-between items-start gap-3">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">"{b.description}"</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              From <span className="font-medium">{b.user.name}</span>
                              {b.offerPrice != null && (
                                <> · willing to pay <span className="font-medium text-green-700 dark:text-green-400">${b.offerPrice.toFixed(2)}</span></>
                              )}
                              {' · '}{new Date(b.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setFulfillBountyId(b.id); setFulfillItemId(''); }}
                              className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 whitespace-nowrap"
                            >
                              Mark fulfilled
                            </button>
                            <button
                              onClick={() => cancelMutation.mutate(b.id)}
                              disabled={cancelMutation.isPending}
                              className="text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-50 whitespace-nowrap"
                            >
                              {cancelMutation.isPending ? 'Cancelling…' : 'Cancel'}
                            </button>
                          </div>
                        </div>

                        {/* Inline fulfill form */}
                        {fulfillBountyId === b.id && (
                          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                              Optionally link the item you listed (paste Item ID from the item's URL):
                            </p>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder="Item ID (optional)"
                                value={fulfillItemId}
                                onChange={e => setFulfillItemId(e.target.value)}
                                className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
                              />
                              <button
                                onClick={() => fulfillMutation.mutate({ id: b.id, itemId: fulfillItemId })}
                                disabled={fulfillMutation.isPending}
                                className="text-sm bg-green-600 text-white px-4 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50"
                              >
                                {fulfillMutation.isPending ? 'Saving…' : 'Confirm'}
                              </button>
                              <button
                                onClick={() => setFulfillBountyId(null)}
                                className="text-sm text-gray-500 dark:text-gray-400 px-3 py-1.5 hover:text-gray-700 dark:hover:text-gray-300"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Closed bounties */}
              {closedBounties.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">
                    Closed ({closedBounties.length})
                  </h2>
                  <div className="space-y-2">
                    {closedBounties.map(b => {
                      const colors = STATUS_COLORS[b.status] || STATUS_COLORS.CANCELLED;
                      return (
                        <div key={b.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex justify-between items-center gap-3">
                          <div>
                            <p className="text-sm text-gray-700 dark:text-gray-300">"{b.description}"</p>
                            {b.item && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                Linked to: <span className="font-medium">{b.item.title}</span>
                                {b.item.price != null && ` · $${b.item.price.toFixed(2)}`}
                              </p>
                            )}
                          </div>
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${colors.light} ${colors.dark}`}>
                            {b.status}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Your Submissions (placeholder) ── */}
          {activeTab === 'submissions' && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-8 text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Your Submissions
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto mb-3">
                When you submit items to match shopper bounties, you'll track their
                status here — pending review, approved, or purchased. Earn XP for
                each successful match!
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                Submission tracking coming soon
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default OrganizerBountiesPage;
