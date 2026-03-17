import React, { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import SaleMap, { SalePin } from '../components/SaleMap';
import SaleCard from '../components/SaleCard';
import Skeleton from '../components/Skeleton';
import TreasureHuntBanner from '../components/TreasureHuntBanner';

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
  lat: number;
  lng: number;
  photoUrls: string[];
  organizer: {
    id: string;
    businessName: string;
  };
  tags?: string[];
  isAuctionSale?: boolean;
}

type DateFilter = 'all' | 'upcoming' | 'this-weekend' | 'this-month';

const SaleCardSkeleton = () => (
  <div className="bg-white rounded-lg shadow-md overflow-hidden flex flex-col">
    <Skeleton className="aspect-square w-full rounded-none" />
    <div className="p-3 space-y-2 flex flex-col flex-1">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-3 w-2/5 mt-1" />
    </div>
  </div>
);

const HomePage = () => {
  const defaultCity = process.env.NEXT_PUBLIC_DEFAULT_CITY || 'your area';
  const defaultState = process.env.NEXT_PUBLIC_DEFAULT_STATE || '';

  const router = useRouter();
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');

  // Initialize search from ?q= URL param (set by header search bar)
  useEffect(() => {
    if (router.isReady && router.query.q) {
      setSearchQuery(String(router.query.q));
    }
  }, [router.isReady, router.query.q]);

  const { data: feedData, isLoading, isError, refetch } = useQuery({
    queryKey: ['feed', userLocation?.lat, userLocation?.lng],
    queryFn: async () => {
      try {
        const params = new URLSearchParams();
        if (userLocation?.lat && userLocation?.lng) {
          params.append('lat', userLocation.lat.toString());
          params.append('lng', userLocation.lng.toString());
        }
        const response = await api.get(`/feed?${params.toString()}`);
        return response.data;
      } catch (err: any) {
        console.error('Error fetching feed:', err);
        throw new Error('Failed to load sales. Please try again later.');
      }
    },
    retry: 1,
  });

  const sales = feedData?.sales as Sale[] | undefined;

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude }),
        (error) => console.error('Error getting location:', error)
      );
    }

    // Record visit streak silently
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (token) {
      api
        .post('/streaks/visit')
        .catch((err) => console.error('Streak visit recording failed (non-blocking):', err.message));
    }
  }, []);

  // Client-side filtering
  const filteredSales = useMemo(() => {
    if (!sales) return [];
    let result = [...sales];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          (s.description || '').toLowerCase().includes(q) ||
          s.city.toLowerCase().includes(q) ||
          (s.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    }

    if (dateFilter !== 'all') {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // H4: Weekend = Saturday+Sunday of the current week.
      // Handles edge cases: Sunday (weekend already started), Saturday (today), weekday (next Saturday).
      const day = now.getDay(); // 0=Sun, 1=Mon … 6=Sat
      const satDiff = day === 0 ? -1 : day === 6 ? 0 : 6 - day;
      const weekendStart = new Date(todayStart);
      weekendStart.setDate(weekendStart.getDate() + satDiff); // This Saturday
      const weekendEnd = new Date(weekendStart);
      weekendEnd.setDate(weekendEnd.getDate() + 1); // This Sunday
      weekendEnd.setHours(23, 59, 59, 999);

      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      result = result.filter((s) => {
        let start: Date;
        let end: Date;
        try {
          start = new Date(s.startDate);
          end = new Date(s.endDate);
        } catch { return false; }
        if (isNaN(start.getTime())) return false;

        if (dateFilter === 'upcoming') return end >= todayStart;
        if (dateFilter === 'this-weekend') return start <= weekendEnd && end >= weekendStart;
        if (dateFilter === 'this-month') return start <= monthEnd && end >= monthStart;
        return true;
      });
    }

    return result;
  }, [sales, searchQuery, dateFilter]);

  return (
    <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
      <Head>
        <title>FindA.Sale - Find Estate Sales Near You</title>
        <meta name="description" content="Find estate sales and auctions near you" />
        <meta property="og:title" content="FindA.Sale — Find Estate Sales Near You" />
        <meta property="og:description" content="Browse estate sales and auctions near you. Bid, buy, and discover unique items from local estate sales." />
        <meta property="og:url" content="https://finda.sale" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://finda.sale/og-default.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="FindA.Sale — Find Estate Sales Near You" />
        <meta name="twitter:description" content="Browse estate sales and auctions near you. Bid, buy, and discover unique items from local estate sales." />
        {/* Structured data — Organization + WebSite schema for Google */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'FindA.Sale',
              url: 'https://finda.sale',
              logo: 'https://finda.sale/icons/icon-512x512.png',
              description: 'Local estate sale marketplace — browse, buy, and sell estate sale items online',
              address: {
                '@type': 'PostalAddress',
                addressLocality: defaultCity,
                addressRegion: defaultState,
                addressCountry: 'US',
              },
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'FindA.Sale',
              url: 'https://finda.sale',
              potentialAction: {
                '@type': 'SearchAction',
                target: 'https://finda.sale/search?q={search_term_string}',
                'query-input': 'required name=search_term_string',
              },
            }),
          }}
        />
      </Head>

      <main className="container mx-auto px-4 py-8">
        <section className="mb-12 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-amber-600 mb-4">Discover Amazing Deals</h1>
          <p className="text-xl text-warm-700 dark:text-gray-300 max-w-2xl mx-auto">
            Find estate sales, garage sales, and auctions near you with FindA.Sale
          </p>
        </section>

        {/* CD2 Phase 2: Treasure Hunt Banner */}
        <TreasureHuntBanner />

        {/* Map Section */}
        <section className="mb-12">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 relative overflow-hidden">
            <h2 className="text-2xl font-bold mb-4 text-warm-900 dark:text-gray-100">Sales Near You</h2>
            {isLoading ? (
              <Skeleton className="h-96 w-full" />
            ) : (
              <SaleMap
                pins={
                  filteredSales
                    .filter((s) => s.lat && s.lng)
                    .map((s): SalePin => ({
                      id: s.id,
                      title: s.title,
                      lat: s.lat,
                      lng: s.lng,
                      city: s.city,
                      state: s.state,
                      startDate: s.startDate,
                      endDate: s.endDate,
                      organizerName: s.organizer?.businessName ?? '',
                      photoUrl: s.photoUrls?.[0],
                    }))}
                userLocation={userLocation}
                height="420px"
              />
            )}
          </div>
        </section>

        {/* Search & Date Filter */}
        <section className="mb-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-grow">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-warm-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search by title, city, or keyword…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-warm-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {(['all', 'upcoming', 'this-weekend', 'this-month'] as DateFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setDateFilter(f)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    dateFilter === f
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-white dark:bg-gray-800 text-warm-700 dark:text-gray-300 border-warm-300 dark:border-gray-700 hover:border-amber-400'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'upcoming' ? 'Upcoming' : f === 'this-weekend' ? 'This Weekend' : 'This Month'}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Featured Sales */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              {feedData?.personalized && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-xs font-medium text-amber-700">
                  ✨ Picked for you
                </span>
              )}
              {!feedData?.personalized && sales && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 border border-blue-200 rounded-full text-xs font-medium text-blue-700">
                  📍 Sales Near You
                </span>
              )}
              <h2 className="text-3xl font-bold text-warm-900">Featured Sales</h2>
            </div>
            {!isLoading && sales && (
              <span className="text-sm text-warm-500">
                {filteredSales.length} of {sales.length} sale{sales.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => <SaleCardSkeleton key={i} />)}
            </div>
          ) : isError ? (
            <div className="text-center py-12">
              <h2 className="text-xl font-bold text-red-600 mb-2">Error Loading Sales</h2>
              <p className="text-warm-600 mb-4">There was a problem loading sales data.</p>
              <button onClick={() => refetch()} className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded">
                Retry
              </button>
            </div>
          ) : filteredSales.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {filteredSales.map((sale) => (
                <SaleCard key={sale.id} sale={sale} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-warm-600">
                {searchQuery || dateFilter !== 'all'
                  ? 'No sales match your search. Try adjusting your filters.'
                  : 'No sales available at the moment. Check back later!'}
              </p>
              {(searchQuery || dateFilter !== 'all') && (
                <button
                  onClick={() => { setSearchQuery(''); setDateFilter('all'); }}
                  className="mt-4 text-amber-600 hover:underline text-sm"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default HomePage;
