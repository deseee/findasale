/**
 * My Saves Page — Q2 Consolidation
 * Consolidates Favorites (heart-saves) + Wishlists (named collections) +
 * Watching (items with notifications) + Followed Sellers into single page
 * Route: /shopper/wishlist
 */

import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { ItemCardSkeleton } from '../../components/SkeletonCards';
import EmptyState from '../../components/EmptyState';
import { useFollows } from '../../hooks/useFollows';
import { useToast } from '../../components/ToastContext';

interface FavoriteItem {
  id: string;
  title: string;
  price: number | null;
  status: string;
  category: string | null;
  condition: string | null;
  photoUrls: string[];
  sale: {
    id: string;
    title: string;
    startDate: string;
    endDate: string;
    status: string;
    organizer: { id: string; businessName: string };
  };
}

interface WishlistItem {
  id: string;
  itemId: string;
  note?: string;
  addedAt: string;
  item: {
    id: string;
    title: string;
    price?: number;
    auctionStartPrice?: number;
    photoUrls: string[];
    sale: {
      id: string;
      title: string;
    };
  };
}

interface Wishlist {
  id: string;
  name: string;
  occasion?: string;
  isPublic: boolean;
  shareSlug?: string;
  items: WishlistItem[];
  createdAt: string;
  updatedAt: string;
}

interface WishlistAlert {
  id: string;
  name: string;
  query: {
    q?: string;
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    radiusMiles?: number;
    lat?: number;
    lng?: number;
    tags?: string[];
  };
  isActive: boolean;
  createdAt: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  furniture: 'Furniture',
  decor: 'Décor',
  vintage: 'Vintage',
  textiles: 'Textiles',
  collectibles: 'Collectibles',
  art: 'Art',
  antiques: 'Antiques',
  jewelry: 'Jewelry',
  books: 'Books',
  tools: 'Tools',
  electronics: 'Electronics',
  clothing: 'Clothing',
  home: 'Home',
  other: 'Other',
};

type TabType = 'items' | 'sellers';

const WishlistPage = () => {
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('items');
  const { data: follows, isLoading: followsLoading } = useFollows();

  if (!authLoading && !user) {
    router.push('/login');
    return null;
  }

  // Fetch saved items (favorites)
  const { data: favoritesData, isLoading: favoritesLoading, isError: favoritesError } = useQuery({
    queryKey: ['favorites'],
    queryFn: async () => {
      const res = await api.get('/favorites');
      return res.data as { favorites: FavoriteItem[]; categories: string[]; total: number };
    },
    enabled: !!user,
  });

  // Fetch collections (wishlists)
  const { data: wishlistsData, isLoading: wishlistsLoading, isError: wishlistsError } = useQuery({
    queryKey: ['wishlists'],
    queryFn: async () => {
      const res = await api.get('/wishlists');
      return res.data as Wishlist[];
    },
    enabled: !!user,
  });

  // Fetch watching (wishlist alerts)
  const { data: alertsData, isLoading: alertsLoading, isError: alertsError } = useQuery({
    queryKey: ['wishlistAlerts'],
    queryFn: async () => {
      const res = await api.get('/wishlist-alerts/my');
      return res.data as WishlistAlert[];
    },
    enabled: !!user,
  });

  const savedItems = favoritesData?.favorites ?? [];
  const savedCount = favoritesData?.total ?? 0;
  const collections = wishlistsData ?? [];
  const collectionsTotal = collections.reduce((sum, w) => sum + w.items.length, 0);
  const watching = alertsData ?? [];

  const isLoading = favoritesLoading || wishlistsLoading || alertsLoading || followsLoading;
  const hasError = favoritesError || wishlistsError || alertsError;

  return (
    <>
      <Head>
        <title>My Collections – FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-2xl mx-auto px-4 pt-6 pb-24">

          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <Link href="/shopper/dashboard" className="text-warm-500 hover:text-warm-700 dark:text-warm-400 dark:hover:text-warm-300">
              ←
            </Link>
            <h1 className="text-2xl font-bold text-warm-900 dark:text-warm-100">My Collections</h1>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-2 border-b border-warm-200 dark:border-gray-700 mb-6">
            <button
              onClick={() => setActiveTab('items')}
              className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${
                activeTab === 'items'
                  ? 'text-amber-600 dark:text-amber-400 border-amber-600 dark:border-amber-400'
                  : 'text-warm-600 dark:text-warm-400 border-transparent hover:text-warm-900 dark:hover:text-warm-200'
              }`}
            >
              Items {(savedCount + collectionsTotal + watching.length) > 0 && <span className="text-xs ml-1">({savedCount + collectionsTotal + watching.length})</span>}
            </button>
            <button
              onClick={() => setActiveTab('sellers')}
              className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${
                activeTab === 'sellers'
                  ? 'text-amber-600 dark:text-amber-400 border-amber-600 dark:border-amber-400'
                  : 'text-warm-600 dark:text-warm-400 border-transparent hover:text-warm-900 dark:hover:text-warm-200'
              }`}
            >
              Sellers {follows && follows.length > 0 && <span className="text-xs ml-1">({follows.length})</span>}
            </button>
          </div>

          {/* Collections Stub — Phase 1: "All Saves" + "New Collection" coming soon */}
          {!isLoading && !hasError && activeTab === 'items' && (
            <div className="flex gap-2 items-center mb-6 pb-4 border-b border-warm-100 dark:border-gray-800">
              <div className="inline-flex items-center px-3 py-2 rounded-full bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 text-sm font-medium text-warm-900 dark:text-warm-100">
                ✓ All Saves
              </div>
              <button
                onClick={() => {
                  showToast('Named collections coming soon! For now, all your saved items appear here.', 'info');
                }}
                className="inline-flex items-center px-3 py-2 rounded-full bg-warm-100 dark:bg-gray-800 border border-warm-200 dark:border-gray-700 text-sm font-medium text-warm-700 dark:text-warm-300 hover:bg-warm-200 dark:hover:bg-gray-700 transition-colors"
              >
                + New Collection
              </button>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <ItemCardSkeleton key={i} />)}
            </div>
          )}

          {/* Error State */}
          {hasError && (
            <div className="text-center py-12">
              <p className="text-4xl mb-3">⚠️</p>
              <p className="text-warm-500 dark:text-warm-400">Failed to load wishlist. Please try again.</p>
            </div>
          )}

          {/* ITEMS TAB */}
          {!isLoading && !hasError && activeTab === 'items' && (
            <>
              {/* Saved Items Section */}
              {savedItems.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-3">Saved Items</h2>
                  <div className="space-y-3">
                    {savedItems.map(item => (
                      <div key={item.id} className="card overflow-hidden dark:bg-gray-800 dark:border-gray-700">
                        <Link href={`/items/${item.id}`} className="block">
                          <div className="flex gap-3 p-3">
                            {item.photoUrls?.[0] ? (
                              <img
                                key={item.photoUrls[0]}
                                src={item.photoUrls[0]}
                                alt={item.title}
                                className="w-20 h-20 object-cover rounded-lg flex-shrink-0 bg-warm-100 dark:bg-gray-700"
                              />
                            ) : (
                              <div className="w-20 h-20 rounded-lg bg-warm-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                                <span className="text-2xl">🏷️</span>
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-warm-900 dark:text-warm-100 truncate">{item.title}</p>
                              {item.price != null && (
                                <p className="text-amber-700 dark:text-amber-400 font-bold">${item.price.toFixed(2)}</p>
                              )}
                              <p className="text-warm-500 dark:text-warm-400 text-xs mt-0.5 truncate">
                                {item.sale.organizer.businessName} · {item.sale.title}
                              </p>
                              <div className="flex gap-2 mt-1.5">
                                {item.category && (
                                  <span className="text-xs bg-warm-100 text-warm-600 dark:bg-gray-700 dark:text-warm-300 px-2 py-0.5 rounded-full">
                                    {CATEGORY_LABELS[item.category] ?? item.category}
                                  </span>
                                )}
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  item.status === 'AVAILABLE'
                                    ? 'bg-green-50 text-green-700 dark:bg-green-900 dark:text-green-300'
                                    : item.status === 'SOLD'
                                    ? 'bg-red-50 text-red-600 dark:bg-red-900 dark:text-red-300'
                                    : 'bg-warm-100 text-warm-600 dark:bg-gray-700 dark:text-warm-300'
                                }`}>
                                  {item.status === 'AVAILABLE' ? 'Available' : item.status === 'SOLD' ? 'Sold' : item.status}
                                </span>
                              </div>
                            </div>
                          </div>
                        </Link>
                      </div>
                    ))}
                  </div>
                  <hr className="my-6 border-warm-200 dark:border-gray-700" />
                </div>
              )}

              {/* Collections Section */}
              {collections.length > 0 && (
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100">Collections</h2>
                    <Link href="/wishlists" className="text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 text-sm font-medium">
                      View All →
                    </Link>
                  </div>
                  <div className="space-y-6">
                    {collections.map(wishlist => (
                      <div key={wishlist.id}>
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div>
                            <h3 className="text-base font-semibold text-warm-900 dark:text-warm-100">{wishlist.name}</h3>
                            {wishlist.occasion && (
                              <p className="text-sm text-warm-600 dark:text-warm-400 mt-0.5">
                                {wishlist.occasion}
                              </p>
                            )}
                            <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                              {wishlist.items.length} item{wishlist.items.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                          <Link href={`/wishlists/shared/${wishlist.shareSlug}`} className="text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 text-sm font-medium flex-shrink-0">
                            View →
                          </Link>
                        </div>

                        {/* Collection Items Grid */}
                        {wishlist.items.length > 0 ? (
                          <div className="grid grid-cols-2 gap-3">
                            {wishlist.items.slice(0, 4).map(wItem => (
                              <Link key={wItem.id} href={`/items/${wItem.item.id}`} className="group">
                                <div className="card overflow-hidden dark:bg-gray-800 dark:border-gray-700">
                                  {wItem.item.photoUrls?.[0] ? (
                                    <img
                                      key={wItem.item.photoUrls[0]}
                                      src={wItem.item.photoUrls[0]}
                                      alt={wItem.item.title}
                                      className="w-full h-24 object-cover bg-warm-100 dark:bg-gray-700 group-hover:opacity-80 transition-opacity"
                                    />
                                  ) : (
                                    <div className="w-full h-24 rounded-t bg-warm-100 dark:bg-gray-700 flex items-center justify-center">
                                      <span className="text-2xl">🏷️</span>
                                    </div>
                                  )}
                                  <div className="p-2">
                                    <p className="text-xs font-semibold text-warm-900 dark:text-warm-100 truncate">{wItem.item.title}</p>
                                    {wItem.item.price && (
                                      <p className="text-xs text-amber-700 dark:text-amber-400 font-bold mt-0.5">
                                        ${wItem.item.price.toFixed(2)}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-warm-500 dark:text-warm-400 italic">This collection is empty</p>
                        )}
                      </div>
                    ))}
                  </div>
                  <hr className="my-6 border-warm-200 dark:border-gray-700" />
                </div>
              )}

              {/* Watching Section */}
              {watching.length > 0 && (
                <div id="watching">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100">Watching</h2>
                    <Link href="/shopper/wishlist#watching" className="text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 text-sm font-medium">
                      Manage →
                    </Link>
                  </div>
                  <div className="space-y-4">
                    {watching.map(alert => (
                      <div key={alert.id} className="card dark:bg-gray-800 dark:border-gray-700 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <h3 className="text-base font-semibold text-warm-900 dark:text-warm-100">{alert.name}</h3>
                            <div className="mt-2 text-sm text-warm-600 dark:text-warm-400 space-y-1">
                              {alert.query.q && <p><span className="font-medium">Keywords:</span> {alert.query.q}</p>}
                              {alert.query.category && <p><span className="font-medium">Category:</span> {alert.query.category}</p>}
                              {(alert.query.minPrice !== undefined || alert.query.maxPrice !== undefined) && (
                                <p><span className="font-medium">Price:</span> ${alert.query.minPrice || '0'} - ${alert.query.maxPrice || '∞'}</p>
                              )}
                              {alert.query.radiusMiles && <p><span className="font-medium">Radius:</span> {alert.query.radiusMiles} miles</p>}
                            </div>
                            {alert.query.tags && alert.query.tags.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {alert.query.tags.map((tag) => (
                                  <span key={tag} className="inline-block bg-warm-100 text-warm-700 dark:bg-gray-700 dark:text-warm-300 px-2 py-1 rounded text-xs font-medium">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                            <div className="mt-3 flex items-center gap-2">
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                alert.isActive
                                  ? 'bg-green-50 text-green-700 dark:bg-green-900 dark:text-green-300'
                                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                              }`}>
                                <span className={`w-2 h-2 rounded-full mr-1.5 ${
                                  alert.isActive ? 'bg-green-600 dark:bg-green-400' : 'bg-gray-400 dark:bg-gray-500'
                                }`}></span>
                                {alert.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state when all sections empty */}
              {savedItems.length === 0 && collections.length === 0 && watching.length === 0 && (
                <EmptyState
                  icon="❤️"
                  heading="No saved items yet"
                  subtext="Start saving items, create collections, and set up alerts for the items you love."
                  cta={{ label: 'Browse Sales', href: '/' }}
                />
              )}
            </>
          )}

          {/* SELLERS TAB */}
          {!isLoading && !hasError && activeTab === 'sellers' && (
            <>
              {follows && follows.length > 0 ? (
                <div className="space-y-3">
                  {follows.map((follow) => (
                    <Link key={follow.id} href={`/organizer/${follow.organizerId}`}>
                      <div className="card p-4 dark:bg-gray-800 dark:border-gray-700 flex items-center gap-4 hover:shadow-md transition-shadow">
                        {follow.organizer.profilePhoto ? (
                          <img
                            src={follow.organizer.profilePhoto}
                            alt={follow.organizer.businessName}
                            className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-700 dark:text-amber-300 font-bold text-lg flex-shrink-0">
                            {follow.organizer.businessName[0]?.toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-warm-900 dark:text-warm-100 truncate">{follow.organizer.businessName}</p>
                          <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                            {follow.notifyEmail && follow.notifyPush && 'Email & push notifications'}
                            {follow.notifyEmail && !follow.notifyPush && 'Email notifications'}
                            {!follow.notifyEmail && follow.notifyPush && 'Push notifications'}
                            {!follow.notifyEmail && !follow.notifyPush && 'No notifications'}
                          </p>
                        </div>
                        <svg className="w-5 h-5 text-warm-400 dark:text-warm-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon="🏪"
                  heading="No followed sellers yet"
                  subtext="Follow your favorite sellers to stay updated on their new sales and get notifications."
                  cta={{ label: 'Explore Sellers', href: '/' }}
                />
              )}
            </>
          )}

        </div>
      </div>
    </>
  );
};

export default WishlistPage;
