/**
 * Shopper Purchases
 */

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import Head from 'next/head';
import Skeleton from '../../components/Skeleton';

const ShopperPurchasesPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [sort, setSort] = useState<'recent' | 'price-high' | 'price-low'>('recent');

  const { data: purchases, isLoading, isError, refetch } = useQuery({
    queryKey: ['purchases', sort],
    queryFn: async () => {
      const response = await api.get('/users/purchases', { params: { sort } });
      return response.data;
    },
    enabled: !!user?.id,
  });

  const { data: coupons } = useQuery({
    queryKey: ['my-coupons'],
    queryFn: async () => {
      const res = await api.get('/coupons');
      return res.data.coupons as any[];
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
        <div className="max-w-6xl mx-auto px-4">
          <Skeleton className="h-10 w-64 mb-8" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>My Purchases - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-white dark:bg-gray-800">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-8">My Purchases</h1>

          {coupons && coupons.length > 0 && (
            <div className="mb-8 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
              <h2 className="text-lg font-semibold text-green-800 dark:text-green-200 mb-3">🎟️ My Coupons</h2>
              <div className="flex flex-wrap gap-3">
                {coupons.map((c: any) => (
                  <div key={c.id} className="bg-white dark:bg-gray-800 border border-green-300 rounded-lg px-4 py-3 flex items-center gap-3">
                    <div>
                      <p className="font-mono font-bold text-green-700 text-lg tracking-widest">{c.code}</p>
                      <p className="text-xs text-warm-500 dark:text-warm-400">${c.discountValue} off · Expires {new Date(c.expiresAt).toLocaleDateString()}</p>
                    </div>
                    <button
                      onClick={() => navigator.clipboard.writeText(c.code).catch(() => {})}
                      className="text-xs text-green-600 hover:text-green-800 dark:text-green-200 font-medium border border-green-300 rounded px-2 py-1"
                    >
                      Copy
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mb-6 flex justify-between items-center">
            <p className="text-warm-600 dark:text-warm-400">{purchases?.length || 0} items purchased</p>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as any)}
              className="px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
            >
              <option value="recent">Most Recent</option>
              <option value="price-high">Price: High to Low</option>
              <option value="price-low">Price: Low to High</option>
            </select>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : isError ? (
            <div className="text-center py-12">
              <p className="text-warm-600 dark:text-warm-400 mb-4">Failed to load purchases. Please try again.</p>
              <button onClick={() => refetch()} className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg">
                Retry
              </button>
            </div>
          ) : purchases && purchases.length > 0 ? (
            <div className="space-y-4">
              {purchases.map((purchase: any) => (
                <div key={purchase.id} className="card p-6 flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold text-lg text-warm-900 dark:text-warm-100 mb-1">{purchase.itemTitle}</h3>
                    <p className="text-sm text-warm-600 dark:text-warm-400">From: {purchase.organizerName}</p>
                    <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">Purchased {purchase.purchasedDate}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-warm-900 dark:text-warm-100">${purchase.amount}</p>
                    <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium ${
                      purchase.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {purchase.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-warm-600 dark:text-warm-400 mb-4">You haven't made any purchases yet.</p>
              <Link href="/" className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg">
                Browse Sales
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ShopperPurchasesPage;
