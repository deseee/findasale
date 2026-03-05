/**
 * Phase 21: Organizer hold management page
 * Lists all active reservations across the organizer's sales.
 * Accessible from the organizer dashboard.
 */

import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import { formatDistanceToNow, parseISO } from 'date-fns';

interface HoldItem {
  id: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  note: string | null;
  user: { id: string; name: string; email: string };
  item: {
    id: string;
    title: string;
    sale: { id: string; title: string };
  };
}

const OrganizerHoldsPage = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  if (!isLoading && (!user || user.role !== 'ORGANIZER')) {
    router.push('/login');
    return null;
  }

  const { data: holds = [], isLoading: holdsLoading } = useQuery({
    queryKey: ['organizer-holds'],
    queryFn: async () => {
      const response = await api.get('/reservations/organizer');
      return response.data as HoldItem[];
    },
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

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

  const timeLeft = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}h ${m}m`;
  };

  return (
    <>
      <Head>
        <title>Active Holds - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-warm-50">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center gap-4 mb-8">
            <Link href="/organizer/dashboard" className="text-amber-600 hover:text-amber-800 text-sm">
              ← Dashboard
            </Link>
            <h1 className="text-2xl font-bold text-warm-900">Active Holds</h1>
          </div>

          {holdsLoading ? (
            <p className="text-warm-600">Loading holds…</p>
          ) : holds.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-8 text-center">
              <p className="text-warm-600">No active holds right now.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {holds.map((hold) => (
                <div key={hold.id} className="bg-white rounded-lg shadow-md p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    {/* Hold details */}
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/items/${hold.item.id}`}
                        className="font-semibold text-warm-900 hover:text-amber-600 line-clamp-1"
                      >
                        {hold.item.title}
                      </Link>
                      <p className="text-sm text-warm-500 mt-0.5">
                        {hold.item.sale.title}
                      </p>
                      <p className="text-sm text-warm-700 mt-2">
                        <span className="font-medium">Shopper:</span> {hold.user.name}{' '}
                        <span className="text-warm-400">({hold.user.email})</span>
                      </p>
                      {hold.note && (
                        <p className="text-sm text-warm-600 mt-1 italic">"{hold.note}"</p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            hold.status === 'CONFIRMED'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {hold.status}
                        </span>
                        <span className="text-xs text-warm-500">
                          Expires in {timeLeft(hold.expiresAt)}
                        </span>
                        <span className="text-xs text-warm-400">
                          Placed {formatDistanceToNow(parseISO(hold.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 flex-shrink-0">
                      {hold.status === 'PENDING' && (
                        <button
                          onClick={() => updateMutation.mutate({ id: hold.id, status: 'CONFIRMED' })}
                          disabled={updateMutation.isPending}
                          className="text-sm bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded disabled:opacity-50"
                        >
                          Confirm
                        </button>
                      )}
                      <button
                        onClick={() => updateMutation.mutate({ id: hold.id, status: 'CANCELLED' })}
                        disabled={updateMutation.isPending}
                        className="text-sm border border-red-400 text-red-600 hover:bg-red-50 px-4 py-1.5 rounded disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default OrganizerHoldsPage;
