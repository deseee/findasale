/**
 * Shopper Dashboard - Enhanced
 *
 * For authenticated shoppers to view:
 * - Activity summary (purchases, watchlist, saved items, streak points)
 * - Sales near them
 * - Recently viewed items
 * - Active flash deals
 * - Wishlist previews
 * - Notification preferences
 * - Purchase history, favorites, subscriptions, and pickups in tabs
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import Head from 'next/head';
import ActivitySummary from '../../components/ActivitySummary';
import SalesNearYou from '../../components/SalesNearYou';
import RecentlyViewed from '../../components/RecentlyViewed';
import FlashDealsBanner from '../../components/FlashDealsBanner';
import YourWishlists from '../../components/YourWishlists';
import NotificationPreferences from '../../components/NotificationPreferences';
import MyPickupAppointments from '../../components/MyPickupAppointments';
import EmptyState from '../../components/EmptyState';
import StreakWidget from '../../components/StreakWidget'; // CD2 Phase 2: Streak Challenges

const ShopperDashboard = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'purchases' | 'favorites' | 'subscribed' | 'pickups'>('overview');

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

  const { data: userData } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const response = await api.get('/users/me');
      return response.data;
    },
    enabled: !!user?.id,
  });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <>
      <Head>
        <title>My Dashboard - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-warm-50">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-warm-900 mb-8">My Dashboard</h1>

          {/* Tabs */}
          <div className="flex gap-2 mb-8 border-b border-warm-200 overflow-x-auto">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'purchases', label: 'Purchases' },
              { id: 'favorites', label: 'Favorites' },
              { id: 'subscribed', label: 'Subscribed' },
              { id: 'pickups', label: 'Pickups' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`pb-2 font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'border-b-2 border-amber-600 text-amber-600'
                    : 'text-warm-600 hover:text-warm-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Streak widget — always visible when logged in */}
              <StreakWidget />

              <ActivitySummary />

              <SalesNearYou />

              <RecentlyViewed />

              <FlashDealsBanner />

              <YourWishlists />

              {/* Welcome nudge only shown when no purchases yet */}
              {purchases && purchases.length === 0 && (
                <EmptyState
                  icon="🎉"
                  heading="Welcome to FindA.Sale!"
                  subtext="Explore nearby estate sales, add your favorite items, and discover unique treasures. Ready to get started?"
                  cta={{ label: 'Browse Upcoming Sales', href: '/' }}
                />
              )}
            </div>
          )}

          {/* Purchases Tab */}
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
                <div className="text-center py-16">
                  <p className="text-5xl mb-4">🛍️</p>
                  <h3 className="text-xl font-semibold text-warm-900 mb-2">No purchases yet</h3>
                  <p className="text-warm-600 mb-6">When you buy an item at a sale, it will show up here.</p>
                  <Link
                    href="/"
                    className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
                  >
                    Browse Sales
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Favorites Tab */}
          {activeTab === 'favorites' && (
            <div>
              {favorites && favorites.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {favorites.map((item: any) => (
                    <Link key={item.id} href={`/items/${item.id}`} className="card overflow-hidden hover:shadow-md transition-shadow">
                      {item.photoUrls?.[0] && (
                        <img src={item.photoUrls[0]} alt={item.title} className="aspect-square w-full object-cover" loading="lazy" />
                      )}
                      <div className="p-3">
                        <h3 className="text-sm font-semibold text-warm-900 line-clamp-1">{item.title}</h3>
                        {item.price != null && <p className="text-amber-600 font-bold text-sm">${Number(item.price).toFixed(2)}</p>}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16">
                  <div className="text-6xl mb-4 text-warm-300">❤️</div>
                  <h3 className="text-xl font-semibold text-warm-900 mb-2">Nothing saved yet</h3>
                  <p className="text-warm-600 mb-6">
                    Tap the heart on any item you like and it will appear here.
                    You also earn 2 Hunt Pass points for every favorite!
                  </p>
                  <Link
                    href="/"
                    className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
                  >
                    Start Browsing
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Subscribed Tab */}
          {activeTab === 'subscribed' && (
            <div className="text-center py-16">
              <p className="text-5xl mb-4">🔔</p>
              <h3 className="text-xl font-semibold text-warm-900 mb-2">No subscriptions yet</h3>
              <p className="text-warm-600 mb-6">
                Subscribe to a sale to get notified about updates and new items.
              </p>
              <Link
                href="/"
                className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
              >
                Browse Sales
              </Link>
            </div>
          )}

          {/* Pickups Tab */}
          {activeTab === 'pickups' && (
            <MyPickupAppointments />
          )}
        </div>
      </div>
    </>
  );
};

export default ShopperDashboard;