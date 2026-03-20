/**
 * Shopper Holds Page
 * Route: /shopper/holds
 */

import React, { useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import HoldTimer from '../../components/HoldTimer';
import { getThumbnailUrl } from '../../lib/imageUtils';
import { formatDistanceToNow, parseISO } from 'date-fns';

interface HoldItem {
  id: string;
  expiresAt: string;
  createdAt: string;
  status: string;
  note: string | null;
  item: {
    id: string;
    title: string;
    price: number | null;
    photoUrls: string[];
    status: string;
    sale: { id: string; title: string };
  };
}

const ShopperHoldsPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data: holds = [], isLoading: holdsLoading, refetch } = useQuery({
    queryKey: ['shopper-holds'],
    queryFn: async () => {
      const response = await api.get('/reservations/shopper');
      return response.data as HoldItem[];
    },
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  const cancelMutation = useMutation({
    mutationFn: (reservationId: string) => api.delete(`/reservations/${reservationId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shopper-holds'] });
      showToast('Hold released', 'success');
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to release hold', 'error');
    },
  });

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  if (authLoading || !user) {
    return null;
  }

  const handleReleaseHold = (reservationId: string) => {
    if (confirm('Are you sure you want to release this hold?')) {
      cancelMutation.mutate(reservationId);
    }
  };

  const handleHoldExpiry = (reservationId: string) => {
    queryClient.invalidateQueries({ queryKey: ['shopper-holds'] });
    showToast('Hold expired', 'info');
  };

  const activeHolds = holds.filter((h) => ['PENDING', 'CONFIRMED'].includes(h.status));
  const expiredHolds = holds.filter((h) => h.status === 'CANCELLED' || h.status === 'EXPIRED');

  return (
    <>
      <Head>
        <title>My Holds - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="flex items-center gap-4 mb-8">
            <Link href="/shopper/dashboard" className="text-amber-600 hover:text-amber-800 text-sm">
              ← Dashboard
            </Link>
            <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100">My Holds</h1>
          </div>

          {activeHolds.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-900">
                You have <span className="font-semibold">{activeHolds.length}</span> active{' '}
                {activeHolds.length === 1 ? 'hold' : 'holds'}. Items are held for 24 hours from placement.
              </p>
            </div>
          )}

          {holdsLoading ? (
            <div className="text-center py-12">
              <p className="text-warm-600 dark:text-warm-400">Loading your holds…</p>
            </div>
          ) : activeHolds.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-12 text-center">
              <p className="text-warm-700 dark:text-warm-300 text-lg mb-4">You don't have any active holds yet.</p>
              <Link
                href="/sales"
                className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-6 rounded-lg"
              >
                Browse Sales
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {activeHolds.map((hold) => (
                <div key={hold.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="flex flex-col sm:flex-row gap-4 p-5">
                    <div className="flex-shrink-0 w-full sm:w-32">
                      <Link href={`/items/${hold.item.id}`}>
                        <img
                          src={hold.item.photoUrls?.[0] ? getThumbnailUrl(hold.item.photoUrls[0]) : '/images/placeholder.svg'}
                          alt={hold.item.title}
                          className="w-full h-32 object-cover rounded-lg hover:opacity-90 transition-opacity"
                        />
                      </Link>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col h-full justify-between">
                        <div>
                          <Link href={`/items/${hold.item.id}`} className="font-semibold text-warm-900 dark:text-warm-100 hover:text-amber-600 line-clamp-2">
                            {hold.item.title}
                          </Link>
                          <p className="text-sm text-warm-500 dark:text-warm-400 mt-1">
                            <Link href={`/sales/${hold.item.sale.id}`} className="hover:text-amber-600">
                              {hold.item.sale.title}
                            </Link>
                          </p>
                        </div>
                        {hold.item.price && (
                          <p className="text-lg font-bold text-amber-700 mt-2">${(hold.item.price / 100).toFixed(2)}</p>
                        )}
                        <div className="mt-3">
                          <HoldTimer expiresAt={hold.expiresAt} onExpiry={() => handleHoldExpiry(hold.id)} />
                        </div>
                        <p className="text-xs text-warm-400 mt-2">
                          Hold placed {formatDistanceToNow(parseISO(hold.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 flex-shrink-0 sm:justify-center">
                      <Link
                        href={`/checkout?itemId=${hold.item.id}`}
                        className="inline-block text-center bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded transition-colors"
                      >
                        Purchase Now
                      </Link>
                      <button
                        onClick={() => handleReleaseHold(hold.id)}
                        disabled={cancelMutation.isPending}
                        className="border border-red-400 text-red-600 hover:bg-red-50 dark:bg-red-900/20 font-semibold py-2 px-4 rounded transition-colors disabled:opacity-50"
                      >
                        {cancelMutation.isPending ? 'Releasing…' : 'Release Hold'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {expiredHolds.length > 0 && (
            <div className="mt-8">
              <h2 className="text-lg font-semibold text-warm-700 dark:text-warm-300 mb-4">Released Holds</h2>
              <div className="space-y-2">
                {expiredHolds.map((hold) => (
                  <div key={hold.id} className="bg-warm-50 dark:bg-gray-900 rounded-lg p-4 border border-warm-200 dark:border-gray-700">
                    <Link href={`/items/${hold.item.id}`} className="text-warm-700 dark:text-warm-300 hover:text-amber-600">
                      {hold.item.title}
                    </Link>
                    <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                      Released {formatDistanceToNow(parseISO(hold.expiresAt), { addSuffix: true })}
                    </p>
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

export default ShopperHoldsPage;
