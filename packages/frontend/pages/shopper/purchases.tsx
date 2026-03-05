/**
 * Shopper Purchases
 *
 * Shows a shopper's purchase history with filters/sorting.
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import Head from 'next/head';

const ShopperPurchasesPage = () => {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [sort, setSort] = useState<'recent' | 'price-high' | 'price-low'>('recent');

  if (!loading && !user) {
    router.push('/login');
    return null;
  }

  const { data: purchases, isLoading } = useQuery({
    queryKey: ['purchases', sort],
    queryFn: async () => {
      const response = await api.get('/shopper/purchases', { params: { sort } });
      return response.data;
    },
    enabled: !!user?.id,
  });

  if (loading) return <div>Loading...</div>;

  return (
    <>
      <Head>
        <title>My Purchases - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-white">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-warm-900 mb-8">My Purchases</h1>

          <div className="mb-6 flex justify-between items-center">
            <p className="text-warm-600">{purchases?.length || 0} items purchased</p>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as any)}
              className="px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
            >
              <option value="recent">Most Recent</option>
              <option value="price-high">Price: High to Low</option>
              <option value="price-low">Price: Low to High</option>
            </select>
          </div>

          {isLoading ? (
            <p>Loading purchases...</p>
          ) : purchases && purchases.length > 0 ? (
            <div className="space-y-4">
              {purchases.map((purchase: any) => (
                <div key={purchase.id} className="card p-6 flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold text-lg text-warm-900 mb-1">{purchase.itemTitle}</h3>
                    <p className="text-sm text-warm-600">From: {purchase.organizerName}</p>
                    <p className="text-xs text-warm-500 mt-1">Purchased {purchase.purchasedDate}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-warm-900">${purchase.amount}</p>
                    <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium ${
                      purchase.status === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {purchase.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-warm-600 mb-4">You haven't made any purchases yet.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ShopperPurchasesPage;
