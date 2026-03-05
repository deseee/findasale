import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import SaleCard from '../components/SaleCard';
import { SaleCardSkeleton } from '../components/SkeletonCards';
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
      <div className="min-h-screen bg-warm-50 flex items-center justify-center p-8">
        <Head>
          <title>Your Feed – FindA.Sale</title>
        </Head>
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">📋</div>
          <h1 className="text-2xl font-bold text-warm-900 mb-3">Your Feed</h1>
          <p className="text-warm-600 mb-6">
            Log in to see new sales from organizers you follow.
          </p>
          <Link
            href="/login"
            className="inline-block px-6 py-3 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 transition-colors"
          >
            Log in
          </Link>
          <p className="mt-4 text-sm text-warm-500">
            <Link href="/" className="text-amber-600 hover:underline">Browse all sales instead</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-50">
      <Head>
        <title>Your Feed – FindA.Sale</title>
        <meta name="description" content="Sales from organizers you follow on FindA.Sale" />
      </Head>

      <main className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-warm-900">Your Feed</h1>
            {!isLoading && data && (
              <p className="text-sm text-warm-500 mt-1">
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
            <p className="text-warm-600">Failed to load your feed. Try refreshing.</p>
          </div>
        )}

        {/* Empty state — personalized but no new sales */}
        {!isLoading && !isError && data?.sales.length === 0 && data.personalized && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🏡</div>
            <h2 className="text-xl font-semibold text-warm-900 mb-2">All caught up</h2>
            <p className="text-warm-600 mb-6">
              The organizers you follow haven't published any sales yet.
              We'll notify you when they do.
            </p>
            <Link
              href="/"
              className="inline-block px-6 py-3 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 transition-colors"
            >
              Browse all sales
            </Link>
          </div>
        )}

        {/* Empty state — not following anyone */}
        {!isLoading && !isError && data?.sales.length === 0 && !data?.personalized && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🔍</div>
            <h2 className="text-xl font-semibold text-warm-900 mb-2">Your feed is empty</h2>
            <p className="text-warm-600 mb-6">
              Follow organizers to see their new sales here first.
              Browse sales and tap <strong>Follow</strong> on any organizer page.
            </p>
            <Link
              href="/"
              className="inline-block px-6 py-3 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 transition-colors"
            >
              Discover sales
            </Link>
          </div>
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
