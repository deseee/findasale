import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import { useLootLog, useLootLogStats } from '../../hooks/useLootLog';

export default function LootLogPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [currentPage, setCurrentPage] = useState(1);

  const { data: statsData, isLoading: statsLoading } = useLootLogStats();
  const { data: lootLogData, isLoading: logsLoading } = useLootLog(currentPage);

  // Redirect to login if not authenticated
  if (status === 'unauthenticated') {
    router.push('/auth/login');
    return null;
  }

  if (status === 'loading') {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  const handleShare = () => {
    const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/shopper/loot-log/public/${session?.user?.id}`;
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
        <meta name="description" content="Your personal purchase history from estate sales" />
      </Head>

      <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-6xl mx-auto px-4 py-12">
          {/* Header */}
          <div className="flex justify-between items-center mb-12">
            <div>
              <h1 className="text-4xl font-bold text-slate-900 mb-2">My Loot Log</h1>
              <p className="text-slate-600">Your personal purchase history across all sales</p>
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
              <p className="text-2xl font-semibold text-slate-700 mb-4">No treasures found yet</p>
              <p className="text-slate-600 mb-8">Start attending sales and making purchases to build your loot log!</p>
              <Link href="/sales">
                <a className="px-6 py-3 bg-[#8FB897] text-white rounded-lg hover:bg-opacity-90 transition inline-block">
                  Browse Sales
                </a>
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-6 mb-12">
                {lootLogData?.purchases.map((purchase) => (
                  <Link
                    key={purchase.id}
                    href={`/shopper/loot-log/${purchase.id}`}
                  >
                    <a className="group cursor-pointer">
                      <div className="relative w-full h-48 bg-slate-200 rounded-lg overflow-hidden mb-3">
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
                      <h3 className="font-semibold text-slate-900 line-clamp-2 group-hover:text-[#8FB897] transition mb-1">
                        {purchase.item.title}
                      </h3>
                      <p className="text-sm text-slate-600 mb-1">{purchase.item.category}</p>
                      <p className="text-lg font-bold text-[#8FB897] mb-1">${purchase.amount.toFixed(2)}</p>
                      <p className="text-xs text-slate-500">{purchase.sale.title}</p>
                    </a>
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
      </main>
    </>
  );
}

function StatBox({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="bg-white rounded-lg p-6 border border-slate-200 text-center">
      <div className="text-3xl mb-2">{icon}</div>
      <p className="text-slate-600 text-sm font-medium mb-2">{label}</p>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
