/**
 * Shopper Receipts
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import Head from 'next/head';
import Skeleton from '../../components/Skeleton';
import ReceiptCard from '../../components/ReceiptCard';

const ShopperReceiptsPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [tab, setTab] = useState<'receipts' | 'returns'>('receipts');

  const { data: receiptsData, isLoading: receiptsLoading, isError: receiptsError } = useQuery({
    queryKey: ['my-receipts'],
    queryFn: async () => {
      const response = await api.get('/receipts/my-receipts');
      return response.data.receipts || [];
    },
    enabled: !!user?.id,
  });

  const { data: returnsData, isLoading: returnsLoading, isError: returnsError } = useQuery({
    queryKey: ['my-returns'],
    queryFn: async () => {
      const response = await api.get('/returns/my-returns');
      return response.data.returnRequests || [];
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-800 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <Skeleton className="h-10 w-64 mb-8" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>My Receipts - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-white dark:bg-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-8">My Receipts</h1>

          <div className="flex gap-4 mb-8 border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setTab('receipts')}
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                tab === 'receipts' ? 'border-green-600 text-green-600' : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900'
              }`}
              style={tab === 'receipts' ? { borderColor: '#8FB897', color: '#8FB897' } : {}}
            >
              Receipts ({receiptsData?.length || 0})
            </button>
            <button
              onClick={() => setTab('returns')}
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                tab === 'returns' ? 'border-green-600 text-green-600' : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900'
              }`}
              style={tab === 'returns' ? { borderColor: '#8FB897', color: '#8FB897' } : {}}
            >
              Returns ({returnsData?.length || 0})
            </button>
          </div>

          {tab === 'receipts' && (
            <div>
              {receiptsLoading ? (
                <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>
              ) : receiptsError ? (
                <div className="text-center py-12"><p className="text-gray-600 dark:text-gray-400 mb-4">Failed to load receipts. Please try again.</p></div>
              ) : receiptsData && receiptsData.length > 0 ? (
                <div className="space-y-4">
                  {receiptsData.map((receipt: any) => (
                    <ReceiptCard key={receipt.id} receipt={receipt} returnWindowHours={48} saleEndDate={receipt.purchase.sale?.endDate} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12"><p className="text-gray-600 dark:text-gray-400">You don't have any receipts yet.</p></div>
              )}
            </div>
          )}

          {tab === 'returns' && (
            <div>
              {returnsLoading ? (
                <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
              ) : returnsError ? (
                <div className="text-center py-12"><p className="text-gray-600 dark:text-gray-400 mb-4">Failed to load return requests. Please try again.</p></div>
              ) : returnsData && returnsData.length > 0 ? (
                <div className="space-y-4">
                  {returnsData.map((returnReq: any) => (
                    <div key={returnReq.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{returnReq.purchase.item?.title || 'Item'}</h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Requested {new Date(returnReq.requestedAt).toLocaleDateString()}</p>
                        </div>
                        <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                          returnReq.status === 'PENDING' ? 'bg-yellow-50 text-yellow-700'
                          : returnReq.status === 'APPROVED' ? 'bg-green-50 dark:bg-green-900/20 text-green-700'
                          : 'bg-red-50 dark:bg-red-900/20 text-red-700'
                        }`}>
                          {returnReq.status}
                        </span>
                      </div>
                      <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-900 rounded">
                        <p className="text-sm text-gray-700 dark:text-gray-300"><span className="font-semibold">Reason:</span> {returnReq.reason}</p>
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        <p>Amount: ${returnReq.purchase.amount.toFixed(2)}</p>
                        {returnReq.resolvedAt && <p className="mt-2 text-gray-500 dark:text-gray-400">Resolved {new Date(returnReq.resolvedAt).toLocaleDateString()}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12"><p className="text-gray-600 dark:text-gray-400">You don't have any return requests yet.</p></div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ShopperReceiptsPage;
