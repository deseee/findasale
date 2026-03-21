/**
 * V3: Organizer Bounties Page
 * Shows all missing-listing requests across the organizer's sales.
 * Organizer can fulfill a bounty by entering the item ID they listed.
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

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-yellow-100 text-yellow-800',
  FULFILLED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

const OrganizerBountiesPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [selectedSaleId, setSelectedSaleId] = useState<string>('');
  const [fulfillBountyId, setFulfillBountyId] = useState<string | null>(null);
  const [fulfillItemId, setFulfillItemId] = useState('');

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

  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-900">Loading…</div>;

  const openBounties = bounties.filter(b => b.status === 'OPEN');
  const closedBounties = bounties.filter(b => b.status !== 'OPEN');

  return (
    <>
      <Head><title>Bounties - FindA.Sale</title></Head>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-4">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <Link href="/organizer/dashboard" className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-400 text-sm">← Dashboard</Link>
            <span className="text-gray-300 dark:text-gray-600">/</span>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Missing-Item Requests</h1>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
          {/* Sale selector */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sale</label>
            <select
              value={selectedSaleId}
              onChange={e => setSelectedSaleId(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100"
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
              <p className="text-gray-400 dark:text-gray-500 text-sm">Loading…</p>
            ) : openBounties.length === 0 ? (
              <p className="text-gray-400 dark:text-gray-500 text-sm">No open requests for this sale.</p>
            ) : (
              <div className="space-y-3">
                {openBounties.map(b => (
                  <div key={b.id} className="bg-white dark:bg-gray-800 rounded-xl border border-yellow-200 dark:border-yellow-700 p-4">
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">"{b.description}"</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          From <span className="font-medium">{b.user.name}</span>
                          {b.offerPrice != null && (
                            <> · willing to pay <span className="font-medium text-green-700">${b.offerPrice.toFixed(2)}</span></>
                          )}
                          {' · '}{new Date(b.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={() => { setFulfillBountyId(b.id); setFulfillItemId(''); }}
                        className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 whitespace-nowrap"
                      >
                        Mark fulfilled
                      </button>
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
                            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 dark:text-gray-100"
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
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">Closed ({closedBounties.length})</h2>
              <div className="space-y-2">
                {closedBounties.map(b => (
                  <div key={b.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 flex justify-between items-center gap-3">
                    <div>
                      <p className="text-sm text-gray-700 dark:text-gray-300">"{b.description}"</p>
                      {b.item && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Linked to: <span className="font-medium">{b.item.title}</span>
                          {b.item.price != null && ` · $${b.item.price.toFixed(2)}`}
                        </p>
                      )}
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLORS[b.status]}`}>
                      {b.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default OrganizerBountiesPage;
