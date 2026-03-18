import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import SaleCard from '../../components/SaleCard';
import { SaleCardSkeleton } from '../../components/SkeletonCards';
import Head from 'next/head';

const CityPage = () => {
  const router = useRouter();
  const { city } = router.query;
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['sales', 'city', city, page],
    queryFn: async () => {
      const response = await api.get(`/sales/city/${city}`, {
        params: { page, limit: 12 },
      });
      return response.data;
    },
    enabled: !!city,
  });

  if (!city) return null;

  // Humanize city slug: convert hyphens to spaces and capitalize words
  const cityName = typeof city === 'string'
    ? city.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : '';
  const pageTitle = `Estate Sales in ${cityName}`;

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={`Find estate sales in ${city}`} />
      </Head>
      <div className="min-h-screen bg-white dark:bg-gray-900">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-warm-900 dark:text-gray-100 mb-8">{pageTitle}</h1>

          {isLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <SaleCardSkeleton key={i} />
              ))}
            </div>
          )}

          {isError && (
            <div className="min-h-screen flex flex-col items-center justify-center bg-warm-50 dark:bg-gray-800 gap-4">
              <p className="text-warm-700 dark:text-gray-300 text-lg">Failed to load city listings.</p>
              <button onClick={() => refetch()} className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg">Try again</button>
            </div>
          )}

          {data && data.sales && data.sales.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {data.sales.map((sale: any) => (
                  <SaleCard key={sale.id} sale={sale} />
                ))}
              </div>
              {data.totalPages && data.page < data.totalPages && (
                <div className="mt-8 flex justify-center">
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded"
                  >
                    Load More
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-warm-600 dark:text-gray-400">No sales found in {cityName}.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default CityPage;
