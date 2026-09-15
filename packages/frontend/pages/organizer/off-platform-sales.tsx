/**
 * Off-Platform Sales Log
 *
 * Shows items an organizer has marked sold outside of FindA.Sale (cash,
 * Venmo, their own card reader, etc.) via the Bring-Your-Own-Rails (BYOR)
 * off-platform sales feature. Read-only log -- marking an item sold this
 * way happens from the status control on the Add Items page.
 *
 * See: claude_docs/feature-notes/bring-your-own-rails-architecture-and-scoping-2026-09-06.md
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import Skeleton from '../../components/Skeleton';
import { useOffPlatformSalesLog, useUndoOffPlatformSale, OffPlatformSaleLogEntry } from '../../hooks/useOffPlatformSales';

function formatCurrency(amount: string | number | null | undefined): string | null {
  if (amount === null || amount === undefined || amount === '') return null;
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (Number.isNaN(num)) return null;
  return `$${num.toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

const OffPlatformSalesPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const { data: entries = [], isLoading: logLoading, isError, refetch } = useOffPlatformSalesLog();
  const { showToast } = useToast();
  const undoMutation = useUndoOffPlatformSale();
  const [undoingId, setUndoingId] = useState<string | null>(null);

  const handleUndo = (entry: OffPlatformSaleLogEntry) => {
    const label = entry.item?.title || 'this item';
    if (!window.confirm(`Undo marking "${label}" sold off-platform? It will go back to Available.`)) {
      return;
    }
    setUndoingId(entry.id);
    undoMutation.mutate(entry.itemId, {
      onSuccess: () => {
        showToast('Reverted to Available', 'success');
        setUndoingId(null);
      },
      onError: (error: any) => {
        showToast(error.response?.data?.message || 'Could not undo this sale', 'error');
        setUndoingId(null);
      },
    });
  };

  // Auth guard -- after all hooks
  if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  const loading = !isClient || authLoading || logLoading;

  return (
    <>
      <Head>
        <title>Off-Platform Sales | FindA.Sale</title>
        <meta name="description" content="Items you've marked sold outside of FindA.Sale" />
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 py-8">
        <div className="max-w-4xl mx-auto px-4">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">
              Off-Platform Sales
            </h1>
            <p className="text-warm-600 dark:text-warm-400">
              Items you&apos;ve marked sold outside of FindA.Sale: cash, Venmo, or another payment method you handled yourself.
            </p>
          </div>

          {/* Loading State */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : isError ? (
            /* Error State */
            <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
              <p className="text-red-700 dark:text-red-200 mb-3">
                Unable to load your off-platform sales. Please try again.
              </p>
              <button
                onClick={() => refetch()}
                className="inline-block bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm"
              >
                Retry
              </button>
            </div>
          ) : entries.length === 0 ? (
            /* Empty State */
            <div className="text-center py-12 card">
              <p className="text-warm-600 dark:text-warm-400 mb-6 px-4">
                No off-platform sales yet. When you mark an item sold outside of FindA.Sale from the Add Items page, it&apos;ll show up here.
              </p>
              <Link
                href="/organizer/settings?tab=subscription"
                className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
              >
                Off-Platform Sales Settings
              </Link>
            </div>
          ) : (
            /* Log List */
            <div className="space-y-3">
              {entries.map((entry: OffPlatformSaleLogEntry) => {
                const amount = formatCurrency(entry.reportedAmount);
                const noteParts = [entry.paymentMethodNote, entry.buyerNameNote, entry.buyerEmailNote].filter(Boolean);
                return (
                  <div
                    key={entry.id}
                    className="card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-warm-900 dark:text-warm-100 truncate">
                        {entry.item?.title || `Item ${entry.itemId.slice(0, 8)}`}
                      </p>
                      <p className="text-sm text-warm-500 dark:text-warm-400">
                        {formatDate(entry.createdAt)}
                      </p>
                      {noteParts.length > 0 && (
                        <p className="text-xs text-warm-500 dark:text-warm-500 mt-1 truncate">
                          {noteParts.join(' \u00b7 ')}
                        </p>
                      )}
                    </div>
                    {amount && (
                      <div className="text-left sm:text-right flex-shrink-0">
                        <p className="font-semibold text-warm-900 dark:text-warm-100">{amount}</p>
                        <p className="text-xs text-warm-500 dark:text-warm-400">reported amount</p>
                      </div>
                    )}
                    <button
                      onClick={() => handleUndo(entry)}
                      disabled={undoingId === entry.id}
                      className="flex-shrink-0 text-sm font-semibold text-red-700 dark:text-red-300 hover:text-red-800 dark:hover:text-red-200 disabled:opacity-50 underline underline-offset-2"
                    >
                      {undoingId === entry.id ? 'Undoing...' : 'Undo'}
                    </button>
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

export default OffPlatformSalesPage;
