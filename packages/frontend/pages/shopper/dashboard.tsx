/**
 * Shopper Dashboard
 *
 * For authenticated shoppers to view:
 * - Their purchase history
 * - Saved/favorite sales
 * - Subscribed sales with notifications
 * - Referral earnings (if applicable)
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import Head from 'next/head';

const ShopperDashboard = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'purchases' | 'favorites' | 'subscribed'>('purchases');

  if (!isLoading && !user) {
    router.push('/login');
    return null;
  }

  const { data: purchases } = useQuery({
    queryKey: ['shopper-purchases'],
    queryFn: async () => {
      const response = await api.get('/shopper/purchases');
      return response.data;
    },
    enabled: !!user?.id,
  });

  const { data: favorites } = useQuery({
    queryKey: ['shopper-favorites'],
    queryFn: async () => {
      const response = await api.get('/shopper/favorites');
      return response.data;
    },
    enabled: !!user?.id,
  });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <>
      <Head>
        <title>Shopper Dashboard - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-warm-50">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-warm-900 mb-6">My Dashboard</h1>

          {/* Tabs */}
          <div className="flex gap-4 mb-8 border-b border-warm-200">
            {['purchases', 'favorites', 'subscribed'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`pb-2 font-medium capitalize ${
                  activeTab === tab
                    ? 'border-b-2 border-amber-600 text-amber-600'
                    : 'text-warm-600 hover:text-warm-900'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Content */}
          {activeTab === 'purchases' && (
            <div>
              {purchases && purchases.length > 0 ? (
                <div className="space-y-4">
                  {purchases.map((purchase: any) => (
                    <div key={purchase.id} className="card p-4 flex justify-between items-center">
                      <div>
                        <h3 className="font-semibold text-warm-900">{purchase.itemTitle}</h3>
                        <p className="text-sm text-warm-600">Purchased on {purchase.purchasedAt}</p>
                      </div>
                      <span className="font-bold text-warm-900">${purchase.amount}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-warm-600 text-center py-8">No purchases yet. Start shopping!</p>
              )}
            </div>
          )}

          {activeTab === 'favorites' && (
            <div>
              {favorites && favorites.length > 0 ? (
                <p className="text-warm-600">Favorites coming soon...</p>
              ) : (
                <p className="text-warm-600 text-center py-8">No favorites yet.</p>
              )}
            </div>
          )}

          {activeTab === 'subscribed' && (
            <div>
              <p className="text-warm-600">View all sales you're subscribed to for updates.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ShopperDashboard;
