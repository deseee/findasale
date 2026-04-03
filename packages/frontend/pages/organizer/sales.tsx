/**
 * Organizer Sales Management Page
 *
 * Displays a list of all organizer's sales with status and management links.
 * Authenticates with same guard as other organizer pages.
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import OrganizerSaleCard from '../../components/OrganizerSaleCard';
import Head from 'next/head';
import Link from 'next/link';
import Skeleton from '../../components/Skeleton';

interface Sale {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  photoUrls?: string[];
  organizer?: {
    id: string;
    businessName: string;
  };
}

const OrganizerSalesPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Fetch organizer's sales — hooks must be called before conditional returns
  const { data: sales = [], isLoading: salesLoading, error: salesError, refetch: refetchSales } = useQuery({
    queryKey: ['organizer-sales', user?.id],
    queryFn: async () => {
      const response = await api.get('/sales/mine');
      return response.data.sales || [];
    },
    enabled: !!user?.id && isClient,
  });

  // Auth guard — after all hooks
  if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  const isLoading = !isClient || authLoading || salesLoading;

  if (isLoading) {
    return (
      <>
        <Head>
          <title>Manage Sales | FindA.Sale</title>
        </Head>
        <div className="min-h-screen bg-warm-50 dark:bg-gray-900 py-8">
          <div className="max-w-6xl mx-auto px-4">
            <Skeleton className="h-10 w-64 mb-4" />
            <Skeleton className="h-6 w-96 mb-8" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
      case 'LIVE':
        return 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200';
      case 'DRAFT':
        return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200';
      case 'COMPLETED':
      case 'CLOSED':
        return 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200';
      default:
        return 'bg-warm-100 dark:bg-warm-900 text-warm-700 dark:text-warm-200';
    }
  };

  return (
    <>
      <Head>
        <title>Manage Sales | FindA.Sale</title>
        <meta name="description" content="View and manage your sales" />
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 py-8">
        <div className="max-w-6xl mx-auto px-4">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">
              Manage Sales
            </h1>
            <p className="text-warm-600 dark:text-warm-400">
              View all your sales and manage listings.
            </p>
          </div>

          {/* Create Sale Button */}
          <div className="mb-8">
            <Link
              href="/organizer/create-sale"
              className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
            >
              + Create New Sale
            </Link>
          </div>

          {/* Error State */}
          {salesError && (
            <div className="mb-8 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
              <p className="text-red-700 dark:text-red-200 mb-3">
                Unable to load sales. Please try again.
              </p>
              <button
                onClick={() => refetchSales()}
                className="inline-block bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm"
              >
                Retry
              </button>
            </div>
          )}

          {/* Sales Grid */}
          {!salesError && sales.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sales.map((sale: Sale) => (
                <div key={sale.id} className="flex flex-col">
                  <OrganizerSaleCard sale={sale} />
                  {/* Action buttons below card */}
                  <div className="flex gap-3 mt-3">
                    <Link
                      href={`/organizer/edit-sale/${sale.id}`}
                      className="flex-1 text-center bg-warm-200 dark:bg-gray-700 hover:bg-warm-300 dark:hover:bg-gray-600 text-warm-900 dark:text-warm-100 font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
                    >
                      Edit
                    </Link>
                    <Link
                      href={`/organizer/add-items/${sale.id}`}
                      className="flex-1 text-center bg-amber-100 dark:bg-amber-900 hover:bg-amber-200 dark:hover:bg-amber-800 text-amber-900 dark:text-amber-100 font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
                    >
                      Items
                    </Link>
                    {sale.status === 'ENDED' && (
                      <Link
                        href={`/organizer/settlement/${sale.id}`}
                        className="flex-1 text-center bg-green-100 dark:bg-green-900 hover:bg-green-200 dark:hover:bg-green-800 text-green-900 dark:text-green-100 font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
                      >
                        Settle
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : !salesError ? (
            <div className="text-center py-12">
              <p className="text-warm-600 dark:text-warm-400 mb-6">
                No sales yet. Create your first sale to get started.
              </p>
              <Link
                href="/organizer/create-sale"
                className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
              >
                Create Your First Sale
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
};

export default OrganizerSalesPage;
