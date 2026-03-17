import { useRouter } from 'next/router';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { usePublicLootLog } from '../../../../hooks/useLootLog';

export default function PublicLootLogPage() {
  const router = useRouter();
  const { userId } = router.query;
  const [currentPage, setCurrentPage] = useState(1);

  const { data: lootLogData, isLoading, error } = usePublicLootLog(
    userId as string,
    currentPage
  );

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (error || !lootLogData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-xl text-slate-700 mb-4">Loot Log not found or is private</p>
          <Link href="/">
            <a className="px-6 py-2 bg-[#8FB897] text-white rounded-lg">Back to Home</a>
          </Link>
        </div>
      </div>
    );
  }

  const isEmpty = lootLogData.total === 0;
  const userName = lootLogData.user?.name || 'Anonymous';

  const handleLoadMore = () => {
    setCurrentPage((prev) => prev + 1);
  };

  return (
    <>
      <Head>
        <title>{userName}&apos;s Loot Log — FindA.Sale</title>
        <meta name="description" content={`${userName}'s estate sale purchases`} />
      </Head>

      <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-6xl mx-auto px-4 py-12">
          {/* Header */}
          <div className="mb-12">
            <h1 className="text-4xl font-bold text-slate-900 mb-2">
              {userName}&apos;s Loot Log
            </h1>
            <p className="text-slate-600">
              {lootLogData.total} {lootLogData.total === 1 ? 'treasure' : 'treasures'} found
            </p>
          </div>

          {/* Gallery Grid */}
          {isEmpty ? (
            <div className="text-center py-24">
              <p className="text-2xl font-semibold text-slate-700 mb-4">
                No treasures shared yet
              </p>
              <p className="text-slate-600">
                Come back soon to see what {userName} finds!
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-6 mb-12">
                {lootLogData.purchases.map((purchase) => (
                  <div key={purchase.id} className="group">
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
                    <p className="text-xs text-slate-500">{purchase.sale.title}</p>
                  </div>
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
