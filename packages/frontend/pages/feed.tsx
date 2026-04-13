import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import SaleCard from '../components/SaleCard';
import { SaleCardSkeleton } from '../components/SkeletonCards';
import EmptyState from '../components/EmptyState';
import { useAuth } from '../components/AuthContext';

interface FeedSale {
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
  isAuctionSale: boolean;
  favoriteCount: number;
  organizer: {
    id: string;
    businessName: string;
  };
}

const FeedPage = () => {
  const { user } = useAuth();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['feed'],
    queryFn: async () => {
      const response = await api.get('/feed');
      return response.data as { sales: FeedSale[]; personalized: boolean };
    },
    enabled: !!user,
  });

  // Not logged in
  if (!user) {
    return (
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex items-center justify-center p-8">
        <Head>
          <title>Your Feed – FindA.Sale</title>
        </Head>
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">📋</div>
          <h1 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-3">Your Feed</h1>
          <p className="text-warm-600 dark:text-gray-400 mb-6">
            Log in to see new sales from organizers you follow.
          </p>
          <Link
            href="/login"
            className="inline-block px-6 py-3 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 transition-colors"
          >
            Log in
          </Link>
          <p className="mt-4 text-sm text-warm-500 dark:text-gray-400">
            <Link href="/" className="text-amber-600 hover:underline">Browse all sales instead</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
      <Head>
        <title>Your Feed – FindA.Sale</title>
        <meta name="description" content="Sales from organizers you follow on FindA.Sale" />
        <meta property="og:title" content="Your Sale Feed — FindA.Sale" />
        <meta property="og:description" content="Your personalized sales feed — sales from organizers you follow and items matching your interests." />
        <meta property="og:url" content="https://finda.sale/feed" />
        <meta property="og:image" content="https://finda.sale/og-default.png" />
        <meta name="twitter:card" content="summary" />
      </Head>

      <main className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100">Your Feed</h1>
            {!isLoading && data && (
              <p className="text-sm text-warm-500 dark:text-gray-400 mt-1">
                {data.personalized
                  ? 'Sales from organizers you follow'
                  : <>Recent sales — <Link href="/" className="text-amber-600 hover:underline">follow organizers</Link> to personalize</>
                }
              </p>
            )}
          </div>
          <Link href="/" className="text-sm text-amber-600 hover:underline self-center">
            Browse all
          </Link>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }, (_, i) => <SaleCardSkeleton key={i} />)}
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div className="text-center py-12">
            <p className="text-warm-600 dark:text-gray-400">Failed to load your feed. Try refreshing.</p>
          </div>
        )}

        {/* Empty state — personalized but no new sales */}
        {!isLoading && !isError && data?.sales.length === 0 && data.personalized && (
          <EmptyState
            icon="🏡"
            heading="All caught up"
            subtext="The organizers you follow haven't published any sales yet. We'll notify you when they do."
            cta={{ label: 'Browse All Sales', href: '/' }}
          />
        )}

        {/* Empty state — not following anyone */}
        {!isLoading && !isError && data?.sales.length === 0 && !data?.personalized && (
          <EmptyState
            icon="🔍"
            heading="Your feed is empty"
            subtext="Follow your favorite organizers to see their new sales here first. Browse sales and tap Follow on any organizer page."
            cta={{ label: 'Discover Sales', href: '/' }}
          />
        )}

        {/* Sale cards */}
        {!isLoading && !isError && data && data.sales.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {data.sales.map(sale => (
              <SaleCard key={sale.id} sale={sale} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default FeedPage;
