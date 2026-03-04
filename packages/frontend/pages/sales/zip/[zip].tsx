import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../../lib/api';
import SaleCard from '../../../components/SaleCard';
import { SaleCardSkeleton } from '../../../components/SkeletonCards';
import Head from 'next/head';

const ZipCodePage = () => {
  const router = useRouter();
  const { zip } = router.query;
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['sales', 'zip', zip, page],
    queryFn: async () => {
      const response = await api.get(`/sales/zip/${zip}`, {
        params: { page, limit: 12 },
      });
      return response.data;
    },
    enabled: !!zip,
  });

  if (!zip) return null;

  return (
    <>
      <Head>
        <title>Sales in {zip} - FindA.Sale</title>
        <meta name="description" content={`Find estate sales in ZIP code ${zip}`} />
      </Head>
      <div className="min-h-screen bg-white">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-warm-900 mb-8">Sales in {zip}</h1>

          {isLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <SaleCardSkeleton key={i} />
              ))}
            </div>
          )}

          {isError && (
            <div className="text-center py-8">
              <p className="text-warm-600">Unable to load sales. Please try again.</p>
            </div>
          )}

          {data && data.sales && data.sales.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {data.sales.map((sale: any) => (
                  <SaleCard key={sale.id} sale={sale} />
                ))}
              </div>
              {data.hasMore && (
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
              <p className="text-warm-600">No sales found in {zip}.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ZipCodePage;
