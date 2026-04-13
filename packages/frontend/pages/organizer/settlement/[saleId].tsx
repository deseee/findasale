/**
 * Settlement Hub Page — Feature #228
 * Full settlement page for a sale: wizard (estate/consignment/auction) or simple card (yard sale)
 */
import React from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import Head from 'next/head';
import Link from 'next/link';
import api from '../../../lib/api';
import { useAuth } from '../../../components/AuthContext';
import SettlementWizard from '../../../components/SettlementWizard';

export default function SettlementPage() {
  const router = useRouter();
  const { saleId } = router.query;
  const { user } = useAuth();

  // Fetch sale details to get saleType
  const { data: sale, isLoading, isError } = useQuery({
    queryKey: ['sale-for-settlement', saleId],
    queryFn: () => api.get(`/sales/${saleId}`).then((r) => r.data),
    enabled: !!saleId && !!user,
  });

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-500 dark:text-gray-400">Please log in to access settlement.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <div className="max-w-2xl mx-auto animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-48" />
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
    );
  }

  if (isError || !sale) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-red-700 dark:text-red-300 mb-2">Sale Not Found</h2>
            <p className="text-sm text-red-600 dark:text-red-400 mb-4">
              This sale could not be found or you don&apos;t have access.
            </p>
            <Link
              href="/organizer/dashboard"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Settlement — {sale.title || 'Sale'} | FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-2xl mx-auto p-4 py-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <Link
              href="/organizer/dashboard"
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              ←
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Settlement Hub</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">{sale.title}</p>
            </div>
          </div>

          {/* Warning if sale is not ENDED */}
          {sale.status !== 'ENDED' && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4 mb-4">
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                This sale is still <strong>{sale.status}</strong>. Settlement is typically done after a sale ends,
                but you can start preparing now.
              </p>
            </div>
          )}

          {/* Settlement Wizard */}
          <SettlementWizard
            saleId={saleId as string}
            saleType={sale.saleType || 'ESTATE'}
          />
        </div>
      </div>
    </>
  );
}
