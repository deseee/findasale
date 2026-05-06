import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import SaleCard from '../../components/SaleCard';
import { useNetworkQuality } from '../../hooks/useNetworkQuality';

const ITEMS_PER_PAGE = 20;

interface Sale {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  photoUrls: string[];
  organizer: {
    id: string;
    businessName: string;
    reputationTier?: string;
    reputationScore?: number;
    reputationIsNew?: boolean;
    verificationStatus?: string;
  };
  status?: string;
  isAuctionSale?: boolean;
  isLive?: boolean;
  isSold?: boolean;
  isFlashDeal?: boolean;
  favoriteCount?: number;
  maxOrganizerDiscount?: number;
  boost?: { boostType: string; expiresAt: string; status: string };
  locked?: boolean;
  minutesUntilUnlock?: number;
  sourceName?: string;
}

interface ApiResponse {
  sales: Sale[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export default function SalesPage() {
  const router = useRouter();
  const { isLowBandwidth } = useNetworkQuality();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 0 });

  useEffect(() => {
    const fetchSales = async () => {
      try {
        setLoading(true);
        setError(null);
        const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
        const response = await fetch(
          `${apiBase}/sales?status=PUBLISHED&page=${page}&limit=${ITEMS_PER_PAGE}`
        );
        if (!response.ok) throw new Error('Failed to fetch sales');
        const data: ApiResponse = await response.json();
        setSales(data.sales);
        setPagination({ total: data.pagination.total, pages: data.pagination.pages });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setSales([]);
      } finally {
        setLoading(false);
      }
    };

    fetchSales();
  }, [page]);

  return (
    <>
      <Head>
        <title>Browse Sales · FindA.Sale</title>
        <meta name="description" content="Discover upcoming estate sales, auctions, and yard sales in your area." />
      </Head>

      <div className="bg-white dark:bg-gray-900 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            All Sales
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            Browse published sales {pagination.total > 0 && `(${pagination.total} total)`}
          </p>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-8">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-gray-200 dark:bg-gray-700 rounded-lg h-64 animate-pulse" />
              ))}
            </div>
          ) : sales.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {sales.map((sale) => (
                  <SaleCard key={sale.id} sale={sale} />
                ))}
              </div>

              {pagination.pages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Page {page} of {pagination.pages}
                  </span>
                  <button
                    onClick={() => setPage(Math.min(pagination.pages, page + 1))}
                    disabled={page === pagination.pages}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400">No sales found.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export async function getStaticProps() {
  return {
    props: {},
    revalidate: 3600, // ISR: revalidate every hour
  };
}
