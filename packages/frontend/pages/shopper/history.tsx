/**
 * Consolidated Purchase History Page
 *
 * Combines three views:
 * - List View (default): Sortable transaction list with return windows
 * - Gallery View: Photo grid with stats
 * - Receipts View: Two tabs (receipts + returns)
 */

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import Head from 'next/head';
import Skeleton from '../../components/Skeleton';
import ReceiptCard from '../../components/ReceiptCard';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useLootLog, useLootLogStats } from '../../hooks/useLootLog';

type ViewType = 'list' | 'gallery' | 'receipts';

const PurchaseHistoryPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [sort, setSort] = useState<'recent' | 'price-high' | 'price-low'>('recent');
  const [currentPage, setCurrentPage] = useState(1);
  const [tab, setTab] = useState<'receipts' | 'returns'>('receipts');

  // Determine view from URL query param or default to 'list'
  const view = (router.query.view as ViewType) || 'list';

  // Purchases list view (for List and Receipts view)
  const { data: purchases, isLoading: purchasesLoading, isError: purchasesError, refetch: refetchPurchases } = useQuery({
    queryKey: ['purchases', sort],
    queryFn: async () => {
      const response = await api.get('/users/purchases', { params: { sort } });
      return response.data;
    },
    enabled: !!user?.id && (view === 'list' || view === 'receipts'),
  });

  // Coupons (all views)
  const { data: coupons } = useQuery({
    queryKey: ['my-coupons'],
    queryFn: async () => {
      const res = await api.get('/coupons');
      return res.data.coupons as any[];
    },
    enabled: !!user?.id,
  });

  // Gallery view data
  const { data: lootLogData, isLoading: logsLoading } = useLootLog(currentPage);
  const { data: statsData, isLoading: statsLoading } = useLootLogStats();

  // Receipts view data
  const { data: receiptsData, isLoading: receiptsLoading, isError: receiptsError } = useQuery({
    queryKey: ['my-receipts'],
    queryFn: async () => {
      const response = await api.get('/receipts/my-receipts');
      return response.data.receipts || [];
    },
    enabled: !!user?.id && view === 'receipts',
  });

  // Returns view data
  const { data: returnsData, isLoading: returnsLoading, isError: returnsError } = useQuery({
    queryKey: ['my-returns'],
    queryFn: async () => {
      const response = await api.get('/returns/my-returns');
      return response.data.returnRequests || [];
    },
    enabled: !!user?.id && view === 'receipts',
  });

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  const handleViewChange = (newView: ViewType) => {
    router.push({ pathname: '/shopper/history', query: { view: newView } }, undefined, { shallow: true });
  };

  const handleShare = () => {
    const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/shopper/loot-log/public/${user?.id}`;
    navigator.clipboard.writeText(shareUrl);
    alert('Collection link copied to clipboard!');
  };

  const handleLoadMore = () => {
    setCurrentPage((prev) => prev + 1);
  };

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
        <title>My Purchase History - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-white dark:bg-gray-800">
        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-6">My Purchase History</h1>

            {/* View Toggle */}
            <div className="flex gap-2 border-b border-warm-200 dark:border-gray-700 mb-6">
              <button
                onClick={() => handleViewChange('list')}
                className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                  view === 'list'
                    ? 'border-amber-600 text-amber-600'
                    : 'border-transparent text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-100'
                }`}
              >
                List
              </button>
              <button
                onClick={() => handleViewChange('gallery')}
                className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                  view === 'gallery'
                    ? 'border-amber-600 text-amber-600'
                    : 'border-transparent text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-100'
                }`}
              >
                Gallery
              </button>
              <button
                onClick={() => handleViewChange('receipts')}
                className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                  view === 'receipts'
                    ? 'border-amber-600 text-amber-600'
                    : 'border-transparent text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-100'
                }`}
              >
                Receipts
              </button>
            </div>
          </div>

          {/* Coupons Banner (all views) */}
          {coupons && coupons.length > 0 && (
            <div className="mb-8 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
              <h2 className="text-lg font-semibold text-green-800 dark:text-green-200 mb-3">🎟️ My Coupons</h2>
              <div className="flex flex-wrap gap-3">
                {coupons.map((c: any) => (
                  <div key={c.id} className="bg-white dark:bg-gray-800 border border-green-300 dark:border-green-700 rounded-lg px-4 py-3 flex items-center gap-3">
                    <div>
                      <p className="font-mono font-bold text-green-700 dark:text-green-400 text-lg tracking-widest">{c.code}</p>
                      <p className="text-xs text-warm-500 dark:text-warm-400">${c.discountValue} off · Expires {new Date(c.expiresAt).toLocaleDateString()}</p>
                    </div>
                    <button
                      onClick={() => navigator.clipboard.writeText(c.code).catch(() => {})}
                      className="text-xs text-green-600 hover:text-green-800 dark:text-green-200 dark:hover:text-green-100 font-medium border border-green-300 dark:border-green-700 rounded px-2 py-1"
                    >
                      Copy
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LIST VIEW */}
          {view === 'list' && (
            <>
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

              {purchasesLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
                </div>
              ) : purchasesError ? (
                <div className="text-center py-12">
                  <p className="text-warm-600 dark:text-warm-400 mb-4">Failed to load purchases. Please try again.</p>
                  <button onClick={() => refetchPurchases()} className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg">
                    Retry
                  </button>
                </div>
              ) : purchases && purchases.length > 0 ? (
                <div className="space-y-4">
                  {purchases.map((purchase: any) => (
                    <Link key={purchase.id} href={`/shopper/loot-log/${purchase.id}`}>
                      <div className="bg-white dark:bg-gray-800 border border-warm-300 dark:border-gray-700 card p-6 flex justify-between items-center hover:shadow-md transition cursor-pointer">
                        <div>
                          <h3 className="font-semibold text-lg text-warm-900 dark:text-warm-100 mb-1">{purchase.itemTitle}</h3>
                          <p className="text-sm text-warm-600 dark:text-warm-400">From: {purchase.organizerName}</p>
                          <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">Purchased {purchase.purchasedDate}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-warm-900 dark:text-warm-100">${purchase.amount}</p>
                          <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium ${
                            purchase.status === 'completed' ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300' : 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300'
                          }`}>
                            {purchase.status}
                          </span>
                        </div>
                      </div>
                    </Link>
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
            </>
          )}

          {/* GALLERY VIEW */}
          {view === 'gallery' && (
            <>
              {/* Stats Bar */}
              {!statsLoading && statsData && (
                <div className="grid grid-cols-4 gap-4 mb-12">
                  <StatBox label="Total Finds" value={statsData.totalFinds} icon="🎯" />
                  <StatBox label="Total Spent" value={`$${statsData.totalSpent.toFixed(2)}`} icon="💰" />
                  <StatBox label="Favorite Category" value={statsData.favoriteCategory || 'None yet'} icon="⭐" />
                  <StatBox label="Sales Attended" value={statsData.uniqueSales} icon="🏪" />
                </div>
              )}

              {/* Gallery Grid */}
              {logsLoading && currentPage === 1 ? (
                <div className="grid grid-cols-3 gap-6 mb-12">
                  {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-48" />)}
                </div>
              ) : !logsLoading && lootLogData?.total === 0 ? (
                <div className="text-center py-24">
                  <p className="text-4xl mb-4">🏺</p>
                  <p className="text-2xl font-semibold text-slate-700 dark:text-gray-300 mb-2">Your collection is empty</p>
                  <p className="text-slate-600 dark:text-gray-400 mb-8">Make your first purchase at a sale to start building your collection history.</p>
                  <Link href="/" className="px-6 py-3 bg-[#8FB897] text-white rounded-lg hover:bg-opacity-90 transition inline-block font-semibold">
                    Find a Sale Near You
                  </Link>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-6 mb-12">
                    {lootLogData?.purchases.map((purchase) => (
                      <Link key={purchase.id} href={`/shopper/loot-log/${purchase.id}`} className="group cursor-pointer">
                        <div className="relative w-full h-48 bg-slate-200 dark:bg-gray-700 rounded-lg overflow-hidden mb-3">
                          {purchase.item.imageUrl ? (
                            <Image src={purchase.item.imageUrl} alt={purchase.item.title} layout="fill" objectFit="cover" className="group-hover:scale-105 transition" />
                          ) : (
                            <div className="flex items-center justify-center w-full h-full bg-gradient-to-br from-slate-300 to-slate-400 text-white text-sm">No image</div>
                          )}
                        </div>
                        <h3 className="font-semibold text-slate-900 dark:text-gray-100 line-clamp-2 group-hover:text-[#8FB897] transition mb-1">{purchase.item.title}</h3>
                        <p className="text-sm text-slate-600 dark:text-gray-400 mb-1">{purchase.item.category}</p>
                        <p className="text-lg font-bold text-[#8FB897] mb-1">${purchase.amount.toFixed(2)}</p>
                        <p className="text-xs text-slate-500 dark:text-gray-400">{purchase.sale.title}</p>
                      </Link>
                    ))}
                  </div>

                  {lootLogData && lootLogData.totalPages > currentPage && (
                    <div className="text-center mb-8">
                      <button onClick={handleLoadMore} className="px-8 py-3 border-2 border-[#8FB897] text-[#8FB897] font-semibold rounded-lg hover:bg-[#8FB897] hover:text-white transition">
                        Load More
                      </button>
                    </div>
                  )}

                  <div className="text-center">
                    <button onClick={handleShare} className="px-6 py-3 bg-[#8FB897] text-white rounded-lg hover:bg-opacity-90 transition font-semibold">
                      Share my collection
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* RECEIPTS VIEW */}
          {view === 'receipts' && (
            <>
              <div className="flex gap-4 mb-8 border-b border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setTab('receipts')}
                  className={`px-4 py-3 font-medium border-b-2 transition-colors ${tab === 'receipts' ? 'border-amber-600 text-amber-600' : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
                >
                  Receipts ({receiptsData?.length || 0})
                </button>
                <button
                  onClick={() => setTab('returns')}
                  className={`px-4 py-3 font-medium border-b-2 transition-colors ${tab === 'returns' ? 'border-amber-600 text-amber-600' : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
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
                              returnReq.status === 'PENDING' ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300'
                              : returnReq.status === 'APPROVED' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                            }`}>
                              {returnReq.status}
                            </span>
                          </div>
                          <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded">
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
            </>
          )}
        </div>
      </div>
    </>
  );
};

function StatBox({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-slate-200 dark:border-gray-700 text-center">
      <div className="text-3xl mb-2">{icon}</div>
      <p className="text-slate-600 dark:text-gray-400 text-sm font-medium mb-2">{label}</p>
      <p className="text-2xl font-bold text-slate-900 dark:text-gray-100">{value}</p>
    </div>
  );
}

export default PurchaseHistoryPage;
