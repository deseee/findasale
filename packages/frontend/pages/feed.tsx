import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { GetStaticProps } from 'next';
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

interface FeedPageProps {
  initialSales: FeedSale[];
}

const FeedPage = ({ initialSales }: FeedPageProps) => {
  const { user } = useAuth();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['feed'],
    queryFn: async () => {
      const response = await api.get('/feed');
      return response.data as { sales: FeedSale[]; personalized: boolean };
    },
    // Only fetch personalized data when user is logged in.
    // Anonymous visitors are served the pre-rendered initialSales below.
    enabled: !!user,
    // Seed with the ISR-prefetched public feed so there's no loading flash on first render
    initialData: user
      ? undefined
      : { sales: initialSales, personalized: false },
  });

  // Not logged in
  if (!user) {
    // Show the ISR-seeded public sales for SEO bots and anonymous visitors
    const publicSales = initialSales;
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
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100">Your Feed</h1>
              <p className="text-sm text-warm-500 dark:text-gray-400 mt-1">
                <Link href="/login" className="text-amber-600 hover:underline">Log in</Link> to personalize your feed
              </p>
            </div>
            <Link href="/" className="text-sm text-amber-600 hover:underline self-center">
              Browse all
            </Link>
          </div>

          {publicSales.length > 0 ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {publicSales.map((sale, index) => (
                <SaleCard key={sale.id} sale={sale} priority={index < 4} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon="🔍"
              heading="No upcoming sales"
              subtext="Check back soon for new sales in your area."
              cta={{ label: 'Browse All Sales', href: '/' }}
            />
          )}
        </main>
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
            {data.sales.map((sale, index) => (
              <SaleCard key={sale.id} sale={sale} priority={index < 4} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export const getStaticProps: GetStaticProps<FeedPageProps> = async () => {
  try {
    const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');
    const response = await fetch(`${apiBase}/feed`);
    if (!response.ok) {
      return { props: { initialSales: [] }, revalidate: 60 };
    }
    const data = await response.json() as { sales: FeedSale[]; personalized: boolean };
    return {
      props: { initialSales: data.sales ?? [] },
      revalidate: 300, // 5 minutes
    };
  } catch {
    return { props: { initialSales: [] }, revalidate: 60 };
  }
};

export default FeedPage;
