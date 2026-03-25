import { useRouter } from 'next/router';
import { useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '../../components/AuthContext';
import { useLootLog, useLootLogStats } from '../../hooks/useLootLog';

export default function LootLogPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [currentPage, setCurrentPage] = useState(1);

  const { data: statsData, isLoading: statsLoading } = useLootLogStats();
  const { data: lootLogData, isLoading: logsLoading } = useLootLog(currentPage);

  // Redirect to login if not authenticated
  if (!authLoading && !user) {
    router.push('/login');
    return null;
  }

  if (authLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  const handleShare = () => {
    const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/shopper/loot-log/public/${user?.id}`;
    navigator.clipboard.writeText(shareUrl);
    alert('Loot Log link copied to clipboard!');
  };

  const handleLoadMore = () => {
    setCurrentPage((prev) => prev + 1);
  };

  const isEmpty = !logsLoading && lootLogData?.total === 0;

  return (
    <>
      <Head>
        <title>My Loot Log — FindA.Sale</title>
        <meta name="description" content="Your purchase history" />
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-900 dark:to-gray-800">
        <div className="max-w-6xl mx-auto px-4 py-12">
          {/* Header */}
          <div className="flex justify-between items-center mb-12">
            <div>
              <h1 className="text-4xl font-bold text-slate-900 dark:text-gray-100 mb-2">My Loot Log</h1>
              <p className="text-slate-600 dark:text-gray-400">Your personal purchase history across all sales</p>
            </div>
            <button
              onClick={handleShare}
              className="px-6 py-3 bg-[#8FB897] text-white rounded-lg hover:bg-opacity-90 transition"
            >
              Share Loot Log
            </button>
          </div>

          {/* Stats Grid */}
          {!statsLoading && statsData && (
            <div className="grid grid-cols-4 gap-4 mb-12">
              <StatBox
                label="Total Finds"
                value={statsData.totalFinds}
                icon="🎯"
              />
              <StatBox
                label="Total Spent"
                value={`$${statsData.totalSpent.toFixed(2)}`}
                icon="💰"
              />
              <StatBox
                label="Favorite Category"
                value={statsData.favoriteCategory || 'None yet'}
                icon="⭐"
              />
              <StatBox
                label="Sales Attended"
                value={statsData.uniqueSales}
                icon="🏪"
              />
            </div>
          )}

          {/* Gallery Grid */}
          {isEmpty ? (
            <div className="text-center py-24">
              <p className="text-4xl mb-4">🏺</p>
              <p className="text-2xl font-semibold text-slate-700 dark:text-gray-300 mb-2">Your loot log is empty</p>
              <p className="text-slate-600 dark:text-gray-400 mb-8">Make your first purchase at a sale to start building your collection history.</p>
              <Link
                href="/"
                className="px-6 py-3 bg-[#8FB897] text-white rounded-lg hover:bg-opacity-90 transition inline-block font-semibold"
              >
                Find a Sale Near You
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-6 mb-12">
                {lootLogData?.purchases.map((purchase) => (
                  <Link
                    key={purchase.id}
                    href={`/shopper/loot-log/${purchase.id}`}
                    className="group cursor-pointer"
                  >
                    <div className="relative w-full h-48 bg-slate-200 dark:bg-gray-700 rounded-lg overflow-hidden mb-3">
                      {purchase.item.imageUrl ? (
                        <Image
                          src={purchase.item.imageUrl}
                          alt={purchase.item.title}
                          layout="fill"
                          objectFit="cover"
                          className="group-hover:scale-105 transition"
                        />
                      ) : (
                        <div className="flex items-center justify-center w-full h-full bg-gradient-to-br from-slate-300 to-slate-400 text-white text-sm">
                          No image
                        </div>
                      )}
                    </div>
                    <h3 className="font-semibold text-slate-900 dark:text-gray-100 line-clamp-2 group-hover:text-[#8FB897] transition mb-1">
                      {purchase.item.title}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-gray-400 mb-1">{purchase.item.category}</p>
                    <p className="text-lg font-bold text-[#8FB897] mb-1">${purchase.amount.toFixed(2)}</p>
                    <p className="text-xs text-slate-500 dark:text-gray-400">{purchase.sale.title}</p>
                  </Link>
                ))}
              </div>

              {/* Pagination */}
              {lootLogData && lootLogData.totalPages > currentPage && (
                <div className="text-center">
                  <button
                    onClick={handleLoadMore}
                    className="px-8 py-3 border-2 border-[#8FB897] text-[#8FB897] font-semibold rounded-lg hover:bg-[#8FB897] hover:text-white transition"
                  >
                    Load More
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function StatBox({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-slate-200 dark:border-gray-700 text-center">
      <div className="text-3xl mb-2">{icon}</div>
      <p className="text-slate-600 dark:text-gray-400 text-sm font-medium mb-2">{label}</p>
      <p className="text-2xl font-bold text-slate-900 dark:text-gray-100">{value}</p>
    </div>
  );
}
