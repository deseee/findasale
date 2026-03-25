import React, { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import Layout from '../components/Layout';
import SaleMap, { SalePin } from '../components/SaleMap';
import SaleCard from '../components/SaleCard';
import Skeleton from '../components/Skeleton';
import TreasureHuntBanner from '../components/TreasureHuntBanner';
import CityHeatBanner from '../components/CityHeatBanner';

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
type SaleTypeFilter = 'all' | 'estate' | 'yard' | 'auction' | 'flea-market' | 'consignment';

const SaleCardSkeleton = () => (
  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-card hover:shadow-card-hover transition-shadow duration-300 overflow-hidden flex flex-col h-full">
    <Skeleton className="w-full h-48 rounded-none" />
    <div className="p-4 space-y-2 flex flex-col flex-1">
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-3 w-2/3 mt-2" />
    </div>
    <div className="px-4 py-3 border-t border-warm-200 dark:border-gray-700 space-y-1">
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
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
  const [saleTypeFilter, setSaleTypeFilter] = useState<SaleTypeFilter>('all');

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
    // Bug #24: Make geolocation non-blocking with timeout fallback
    if (navigator.geolocation) {
      const timeoutId = setTimeout(() => {
        console.warn('Geolocation request timed out after 5s');
      }, 5000);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timeoutId);
          setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        },
        (error) => {
          clearTimeout(timeoutId);
          console.error('Geolocation error (non-blocking):', error.message);
        }
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

  // Helper function to determine sale type from tags
  const getSaleType = (sale: Sale): string => {
    const tagLower = (sale.tags || []).map(t => t.toLowerCase());
    if (tagLower.some(t => t.includes('estate'))) return 'estate';
    if (tagLower.some(t => t.includes('yard') || t.includes('garage'))) return 'yard';
    if (tagLower.some(t => t.includes('auction'))) return 'auction';
    if (tagLower.some(t => t.includes('flea') || t.includes('market'))) return 'flea-market';
    if (tagLower.some(t => t.includes('consignment'))) return 'consignment';
    return 'other';
  };

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
          s.organizer.businessName.toLowerCase().includes(q) ||
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

    if (saleTypeFilter !== 'all') {
      result = result.filter((s) => getSaleType(s) === saleTypeFilter);
    }

    return result;
  }, [sales, searchQuery, dateFilter, saleTypeFilter]);

  return (
    <Layout>
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <Head>
        <title>FindA.Sale - Find Sales Near You</title>
        <meta name="description" content="Find estate sales, garage sales, yard sales, and auctions near you" />
        <meta property="og:title" content="FindA.Sale — Find Sales Near You" />
        <meta property="og:description" content="Browse estate sales, garage sales, yard sales, and auctions near you. Bid, buy, and discover unique items from local sales." />
        <meta property="og:url" content="https://finda.sale" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://finda.sale/og-default.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="FindA.Sale — Find Sales Near You" />
        <meta name="twitter:description" content="Browse estate sales, garage sales, and auctions near you. Bid, buy, and discover unique items from local sales." />
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
              description: 'Secondary sales marketplace — browse, buy, and sell items from estate sales, garage sales, and auctions online',
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

      <main className="min-h-screen flex flex-col">
        {/* Hero Section with Sage Gradient */}
        <section className="bg-gradient-to-br from-sage-400 via-sage-500 to-sage-600 dark:from-sage-600 dark:via-sage-700 dark:to-sage-800 text-white py-16 md:py-24">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl">
              <h1 className="font-heading text-5xl md:text-6xl font-bold mb-4 leading-tight">Discover Amazing Deals</h1>
              <p className="font-body text-lg md:text-xl text-white/90 mb-8 max-w-2xl">
                Find estate sales, garage sales, yard sales, auctions, flea markets, and more near you with FindA.Sale.
              </p>
              {/* Search Bar */}
              <div className="relative max-w-xl">
                <svg
                  className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/60"
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
                  className="w-full pl-12 pr-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white/95 text-warm-900 placeholder-warm-500 font-body"
                />
              </div>
            </div>
          </div>
        </section>

        <div className="flex-1 container mx-auto px-4 py-8">
          {/* Phase 5: #49 City Heat Index Banner */}
          <CityHeatBanner />

          {/* CD2 Phase 2: Treasure Hunt Banner */}
          <TreasureHuntBanner />

          {/* Sale Type Filter Pills */}
          <section className="mb-8 py-6 border-b border-warm-200 dark:border-gray-700">
            <div className="flex items-center gap-3 overflow-x-auto pb-2 -mx-4 px-4">
              <span className="text-sm font-medium text-warm-600 dark:text-gray-400 whitespace-nowrap">Sale Type:</span>
              {(['all', 'estate', 'yard', 'auction', 'flea-market', 'consignment'] as SaleTypeFilter[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setSaleTypeFilter(type)}
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                    saleTypeFilter === type
                      ? 'bg-sage-600 text-white shadow-md'
                      : 'bg-white dark:bg-gray-800 text-warm-700 dark:text-gray-300 border border-warm-300 dark:border-gray-700 hover:border-sage-400 hover:text-sage-600 dark:hover:text-sage-400'
                  }`}
                >
                  {type === 'all' ? 'All' : type === 'estate' ? 'Estate' : type === 'yard' ? 'Yard' : type === 'auction' ? 'Auction' : type === 'flea-market' ? 'Flea Market' : 'Consignment'}
                </button>
              ))}
            </div>
          </section>

          {/* Map Section */}
          <section className="mb-12">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-card p-6 relative overflow-hidden">
              <h2 className="font-heading text-2xl font-bold mb-4 text-warm-900 dark:text-gray-100">Sales Near You</h2>
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
                  height="300px"
                />
              )}
            </div>
          </section>

          {/* Date Filter Pills */}
          <section className="mb-6">
            <div className="flex items-center gap-3 overflow-x-auto pb-2 -mx-4 px-4">
              <span className="text-sm font-medium text-warm-600 dark:text-gray-400 whitespace-nowrap">When:</span>
              {(['all', 'upcoming', 'this-weekend', 'this-month'] as DateFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setDateFilter(f)}
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                    dateFilter === f
                      ? 'bg-amber-600 text-white shadow-md'
                      : 'bg-white dark:bg-gray-800 text-warm-700 dark:text-gray-300 border border-warm-300 dark:border-gray-700 hover:border-amber-400 hover:text-amber-600 dark:hover:text-amber-400'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'upcoming' ? 'Upcoming' : f === 'this-weekend' ? 'This Weekend' : 'This Month'}
                </button>
              ))}
            </div>
          </section>

          {/* Featured Sales */}
          <section>
            <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                {feedData?.personalized && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-full text-xs font-medium text-amber-700 dark:text-amber-400">
                    ✨ Picked for you
                  </span>
                )}
                {!feedData?.personalized && sales && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-full text-xs font-medium text-blue-700 dark:text-blue-400">
                    📍 Sales Near You
                  </span>
                )}
                <h2 className="font-heading text-3xl font-bold text-warm-900 dark:text-gray-100">Featured Sales</h2>
              </div>
              {!isLoading && sales && (
                <span className="text-sm text-warm-500 dark:text-gray-400">
                  {filteredSales.length} of {sales.length} sale{sales.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => <SaleCardSkeleton key={i} />)}
              </div>
            ) : isError ? (
              <div className="text-center py-12">
                <h2 className="text-xl font-bold text-red-600 mb-2">Error Loading Sales</h2>
                <p className="text-warm-600 dark:text-gray-400 mb-4">There was a problem loading sales data.</p>
                <button onClick={() => refetch()} className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded">
                  Retry
                </button>
              </div>
            ) : filteredSales.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredSales.map((sale) => (
                  <SaleCard key={sale.id} sale={sale} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-warm-600 dark:text-gray-400">
                  {searchQuery || dateFilter !== 'all' || saleTypeFilter !== 'all'
                    ? 'No sales match your filters. Try adjusting your search.'
                    : 'No sales available at the moment. Check back later!'}
                </p>
                {(searchQuery || dateFilter !== 'all' || saleTypeFilter !== 'all') && (
                  <button
                    onClick={() => { setSearchQuery(''); setDateFilter('all'); setSaleTypeFilter('all'); }}
                    className="mt-4 text-amber-600 hover:underline text-sm font-medium"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
      </main>
        </div>
    </Layout>
  );
};

export default HomePage;
