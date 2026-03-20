import React from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import Head from 'next/head';
import Link from 'next/link';
import api from '../../../lib/api';
import { useAuth } from '../../../components/AuthContext';
import SaleChecklist from '../../../components/SaleChecklist';
import Skeleton from '../../../components/Skeleton';

interface Sale {
  id: string;
  title: string;
}

const ChecklistPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { saleId } = router.query;

  // Redirect if not authenticated or not an organizer
  if (!authLoading && (!user || user.role !== 'ORGANIZER')) {
    router.push('/login');
    return null;
  }

  // Fetch sale details
  const {
    data: sale,
    isLoading: saleLoading,
    error: saleError,
  } = useQuery<Sale>({
    queryKey: ['sale', saleId],
    queryFn: async () => {
      const response = await api.get(`/sales/${saleId}`);
      return response.data;
    },
    enabled: !!saleId && typeof saleId === 'string',
  });

  if (authLoading || saleLoading) {
    return (
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 p-4">
        <div className="max-w-4xl mx-auto">
          <Skeleton className="h-10 w-64 mb-8" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (saleError || !sale) {
    return (
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="card p-6 text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Sale Not Found</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-4">We couldn't find the sale you're looking for.</p>
            <Link
              href="/organizer/dashboard"
              className="inline-block px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Sale Checklist: {sale.title} | FindA.Sale</title>
        <meta name="description" content="Organize your sale with our day-of checklist" />
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 p-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/organizer/dashboard"
              className="inline-flex items-center gap-2 text-amber-600 hover:text-amber-700 font-medium mb-4"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back to Dashboard
            </Link>

            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Sale Checklist</h1>
            <p className="text-lg text-gray-700 dark:text-gray-300">{sale.title}</p>
          </div>

          {/* Checklist Component */}
          <SaleChecklist saleId={sale.id} />
        </div>
      </div>
    </>
  );
};

export default ChecklistPage;
