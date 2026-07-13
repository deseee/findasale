import React, { useState, useEffect, useMemo, useRef } from 'react';
import { jsonLdSafe } from '@/lib/jsonLdSafe';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { GetStaticProps } from 'next';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { getItemImageUrl } from '../lib/imageUtils';
import { getSubtypesFor } from '../lib/sale-subtypes';
import SaleMap, { SalePin } from '../components/SaleMap';
import SaleCard from '../components/SaleCard';
import Skeleton from '../components/Skeleton';
const TreasureHuntBanner = dynamic(() => import('../components/TreasureHuntBanner'), { ssr: false });
const CityHeatBanner = dynamic(() => import('../components/CityHeatBanner'), { ssr: false });
const SaleOfTheDayCard = dynamic(() => import('../components/SaleOfTheDayCard'), { ssr: false }); // Feature #401
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../components/AuthContext';

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
  saleType?: string;
  saleSubtype?: string;
}

interface SearchItem {
  id: string;
  title: string;
  description?: string;
  price?: number;
  photoUrls: string[];
  sale: {
    id: string;
    title: string;
    city: string;
  };
}

interface SearchResults {
  query: string;
  sales: Sale[];
  items: SearchItem[];
}

type DateFilter = 'all' | 'upcoming' | 'this-weekend' | 'this-month';

const SALE_TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'ESTATE', label: 'Estate Sale' },
  { value: 'YARD', label: 'Yard Sale' },
  { value: 'AUCTION', label: 'Auction' },
  { value: 'FLEA_MARKET', label: 'Flea Market' },
  { value: 'RETAIL', label: 'Resale' },
  { value: 'DORM_DASH', label: 'Dorm Dash' },
];

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

interface HomePageProps {
  initialSalesData?: any;
}

const HomePage = ({ initialSalesData }: HomePageProps) => {
  const defaultCity = process.env.NEXT_PUBLIC_DEFAULT_CITY || 'your area';
  const defaultState = process.env.NEXT_PUBLIC_DEFAULT_STATE || '';

  const router = useRouter();
  const { showToast } = useToast();
  const { user } = useAuth();
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [saleTypeFilter, setSaleTypeFilter] = useState('');
  const [saleSubtypeFilter, setSaleSubtypeFilter] = useState('');
  const [isSavingSearch, setIsSavingSearch] = useState(false);
  const resultsRef = useRef<HTMLHeadingElement>(null);

  // Initialize search from ?q= URL param (set by header search bar)
  useEffect(() => {
    if (router.isReady && router.query.q) {
      setSearchQuery(String(router.query.q));
    }
  }, [router.isReady, router.query.q]);

  // Auto-scroll removed — was causing jarring jump on every keystroke

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
    placeholderData: initialSalesData || undefined,
  });

  const sales = feedData?.sales as Sale[] | undefined;

  // Only render the map when at least one sale has valid coordinates.
  const mapPins: SalePin[] = useMemo(() => {
    if (!sales) return [];
    return sales
      .filter((s) => typeof s.lat === 'number' && typeof s.lng === 'number')
      .map((s) => ({
        id: s.id,
        title: s.title,
        lat: s.lat,
        lng: s.lng,
        city: s.city,
        state: s.state,
        startDate: s.startDate,
        endDate: s.endDate,
        organizerName: s.organizer.businessName,
        status: 'active' as const,
      }));
  }, [sales]);
  const hasMapPins = mapPins.length > 0;

  // Search API query — call backend FTS when searchQuery is >= 2 chars
  const { data: searchResults, isLoading: isSearching, isError: isSearchError } = useQuery({
    queryKey: ['search', searchQuery, saleTypeFilter, saleSubtypeFilter],
    queryFn: async () => {
      const params: any = { q: searchQuery, type: 'all', limit: 20 };
      if (saleTypeFilter) params.saleType = saleTypeFilter;
      if (saleSubtypeFilter) params.saleSubtype = saleSubtypeFilter;
      const res = await api.get('/search', { params });
      return res.data as SearchResults;
    },
    enabled: searchQuery.trim().length >= 2,
    staleTime: 30_000,
  });

  useEffect(() => {
    // Auto-locate only when permission is already granted.
    if (navigator.geolocation) {
      navigator.permissions
        ?.query({ name: 'geolocation' as PermissionName })
        .then((result) => {
          if (result.state === 'granted') {
            navigator.geolocation.getCurrentPosition(
              (position) => {
                setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
              },
              () => {}
            );
          }
        })
        .catch(() => {});
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
          s.organizer.businessName.toLowerCase().includes(q) ||
          (s.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    }

    if (saleTypeFilter) {
      result = result.filter((s) => s.saleType === saleTypeFilter);
    }

    if (saleSubtypeFilter) {
      result = result.filter((s) => s.saleSubtype === saleSubtypeFilter);
    }

    if (dateFilter !== 'all') {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const day = now.getDay();
      const satDiff = day === 0 ? -1 : day === 6 ? 0 : 6 - day;
      const weekendStart = new Date(todayStart);
      weekendStart.setDate(weekendStart.getDate() + satDiff);
      const weekendEnd = new Date(weekendStart);
      weekendEnd.setDate(weekendEnd.getDate() + 1);
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
  }, [sales, searchQuery, saleTypeFilter, saleSubtypeFilter, dateFilter]);

  const handleSaveSearch = async () => {
    if (!searchQuery.trim()) {
      showToast('Please enter a search query', 'error');
      return;
    }

    setIsSavingSearch(true);
    try {
      await api.post('/saved-searches', {
        name: searchQuery.trim(),
        filters: { q: searchQuery.trim(), dateFilter, saleType: saleTypeFilter || undefined, saleSubtype: saleSubtypeFilter || undefined },
      });
      showToast('Search saved!', 'success');
    } catch (error: any) {
      console.error('Error saving search:', error);
      showToast('Failed to save search. Please try again.', 'error');
    } finally {
      setIsSavingSearch(false);
    }
  };

  return (
    <>
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <Head>
        <title>FindA.Sale - Find Sales Near You</title>
        <meta name="description" content="Find sales near you - browse yard sales, garage sales, estate sales, flea markets, auctions, and more" />
        <meta property="og:title" content="FindA.Sale — Find Sales Near You" />
        <meta property="og:description" content="Browse sales near you - yard sales, garage sales, estate sales, auctions, flea markets, and more. Bid, buy, and discover unique items from local sales." />
        <meta property="og:url" content="https://finda.sale" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://finda.sale/og-default.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="FindA.Sale — Find Sales Near You" />
        <meta name="twitter:description" content="Browse sales near you - yard sales, garage sales, estate sales, auctions, and more. Bid, buy, and discover unique items from local sales." />
        <link rel="canonical" href="https://finda.sale" key="canonical" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdSafe({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'FindA.Sale',
              url: 'https://finda.sale',
              logo: 'https://finda.sale/icons/icon-512x512.png',
              description: 'Secondary sales marketplace — browse, buy, and sell items from yard sales, garage sales, estate sales, flea markets, auctions, and more',
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
            __html: jsonLdSafe({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'FindA.Sale',
              url: 'https://finda.sale',
              potentialAction: {
                '@type': 'SearchAction',
                target: 'https://finda.sale/sales?q={search_term_string}',
                'query-input': 'required name=search_term_string',
              },
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdSafe({
              '@context': 'https://schema.org',
              '@type': 'LocalBusiness',
              name: 'FindA.Sale',
              url: 'https://finda.sale',
              description: 'Community marketplace for buying and selling items from yard sales, garage sales, estate sales, auctions, flea markets, and consignment shops',
              image: 'https://finda.sale/icons/icon-512x512.png',
              sameAs: [
                'https://www.facebook.com/findasale',
                'https://twitter.com/findasale',
                'https://instagram.com/findasale'
              ],
              contactPoint: {
                '@type': 'ContactPoint',
                contactType: 'Customer Service',
                email: 'support@finda.sale',
                url: 'https://finda.sale/contact'
              }
            }),
          }}
        />
      </Head>

      <main className="min-h-screen flex flex-col">
        {/* Hero Section with Orange Gradient */}
        <section className="bg-gradient-to-br from-orange-400 via-orange-500 to-orange-600 dark:from-orange-600 dark:via-orange-700 dark:to-orange-800 text-white py-8 md:py-12">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl">
              <h1 className="font-heading text-5xl md:text-6xl font-bold mb-4 leading-tight">Discover Amazing Deals</h1>
              <p className="font-body text-lg md:text-xl text-white/90 mb-8 max-w-2xl">
                Discover unique finds from sales near you. Browse yard sales, garage sales, estate sales, flea markets, auctions, and more.
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
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchQuery.trim()) {
                      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
                    }
                  }}
                  className="w-full pl-12 pr-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white/95 text-warm-900 dark:text-warm-100 placeholder-warm-500 font-body"
                  aria-label="Search sales and items"
                />
              </div>
              {searchQuery && user && (
                <button
                  onClick={handleSaveSearch}
                  disabled={isSavingSearch}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  💾 {isSavingSearch ? 'Saving...' : 'Save This Search'}
                </button>
              )}
              {searchQuery && !user && (
                <Link
                  href={`/login?redirect=${encodeURIComponent(`/?q=${searchQuery}`)}`}
                >
                  <a className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg font-medium transition-colors">
                    Sign in to save
                  </a>
                </Link>
              )}
              {!searchQuery && (
                <p className="mt-3 text-sm text-white/60">
                  Running a sale?{' '}
                  <a href="/organizer/register" className="text-white/85 underline underline-offset-2 hover:text-white transition-colors">
                    List it free
                  </a>
                </p>
              )}
            </div>
          </div>
        </section>

        <div className="flex-1 container mx-auto px-4 py-8">
          {/* Sales Near You Card */}
          <section className="mb-12">
            <div>
              <div className="rounded-xl border border-warm-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden flex flex-col">
                {/* Map Section — only render when at least one sale has coords */}
                {!isLoading && hasMapPins && (
                  <div className="w-full" style={{ height: '220px' }}>
                    <SaleMap
                      pins={mapPins}
                      center={[42.9634, -85.6681]}
                      zoom={11}
                      height="220px"
                    />
                  </div>
                )}

                {/* Footer Line */}
                <div className="px-4 py-3 border-t border-warm-200 dark:border-gray-700 flex items-center justify-between">
                  {isLoading ? (
                    <Skeleton className="h-4 w-48" />
                  ) : (
                    <>
                      <span className="text-sm font-medium text-warm-800 dark:text-gray-200">
                        Sales Near You · <span className="text-sage-600 dark:text-sage-400">{sales?.length ?? 0} active</span>
                      </span>
                      <Link href="/map" className="text-sm font-medium text-sage-600 dark:text-sage-400 hover:text-sage-700 dark:hover:text-sage-300">
                        View on Map →
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Discovery banners — moved below the map (CLS S968): they load async, so
              keeping them above the map/sales shifted primary content on mount */}
          <CityHeatBanner />
          <TreasureHuntBanner />
          <SaleOfTheDayCard />

          {/* Filter Bar: When + Sale Type */}
          <section className="mb-6">
            <div className="flex flex-wrap items-center gap-3 overflow-x-auto pb-2 -mx-4 px-4">
              <span className="text-sm font-medium text-warm-600 dark:text-gray-400 whitespace-nowrap">When:</span>
              {(['all', 'upcoming', 'this-weekend', 'this-month'] as DateFilter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setDateFilter(f)}
                  aria-pressed={dateFilter === f}
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                    dateFilter === f
                      ? 'bg-amber-600 text-white shadow-md'
                      : 'bg-white dark:bg-gray-800 text-warm-700 dark:text-gray-300 border border-warm-300 dark:border-gray-700 hover:border-amber-400 hover:text-amber-600 dark:hover:text-amber-400'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'upcoming' ? 'Upcoming' : f === 'this-weekend' ? 'This Weekend' : 'This Month'}
                </button>
              ))}
              <span className="text-sm font-medium text-warm-600 dark:text-gray-400 whitespace-nowrap ml-2">Type:</span>
              <select
                value={saleTypeFilter}
                onChange={(e) => { setSaleTypeFilter(e.target.value); setSaleSubtypeFilter(''); }}
                className="px-3 py-2 rounded-full text-sm font-medium border border-warm-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-warm-700 dark:text-gray-300 hover:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors"
                aria-label="Filter sales by type"
              >
                {SALE_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              {getSubtypesFor(saleTypeFilter).length > 0 && (
                <select
                  value={saleSubtypeFilter}
                  onChange={(e) => setSaleSubtypeFilter(e.target.value)}
                  className="px-3 py-2 rounded-full text-sm font-medium border border-warm-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-warm-700 dark:text-gray-300 hover:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors"
                  aria-label="Filter sales by subtype"
                >
                  <option value="">All Subtypes</option>
                  {getSubtypesFor(saleTypeFilter).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              )}
            </div>
          </section>

          {/* Featured Sales / Search Results */}
          <section>
            {searchQuery.trim().length >= 2 ? (
              <>
                <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
                  <h2 ref={resultsRef} className="font-heading text-3xl font-bold text-warm-900 dark:text-gray-100">
                    {isSearching ? 'Searching…' : `${(searchResults?.items?.length ?? 0) + (searchResults?.sales?.length ?? 0)} results for "${searchQuery}"`}
                  </h2>
                </div>

                {isSearching ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {[1, 2, 3, 4, 5, 6].map((i) => <SaleCardSkeleton key={i} />)}
                  </div>
                ) : isSearchError ? (
                  <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 text-center">
                    <p className="text-red-700 dark:text-red-300 font-medium">
                      Search unavailable — try again.
                    </p>
                  </div>
                ) : (searchResults?.items?.length ?? 0) + (searchResults?.sales?.length ?? 0) > 0 ? (
                  <>
                    {searchResults?.items && searchResults.items.length > 0 && (
                      <div className="mb-12">
                        <h3 className="font-heading text-lg font-semibold text-warm-900 dark:text-gray-100 mb-4">Items</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                          {searchResults.items.map((item) => (
                            <Link key={item.id} href={`/sales/${item.sale.id}`}>
                              <a className="group rounded-lg border border-warm-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden flex flex-col h-full hover:shadow-card-hover transition-shadow duration-300">
                                <div className="w-full h-48 bg-warm-100 dark:bg-gray-700 relative overflow-hidden">
                                  {item.photoUrls && item.photoUrls.length > 0 ? (
                                    <img
                                      key={getItemImageUrl(item.photoUrls[0]) || item.photoUrls[0]}
                                      src={getItemImageUrl(item.photoUrls[0]) || item.photoUrls[0]}
                                      alt={item.title}
                                      loading="lazy"
                                      decoding="async"
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-warm-300 dark:text-gray-600">
                                      📷 No photo
                                    </div>
                                  )}
                                </div>
                                <div className="p-4 space-y-2 flex flex-col flex-1">
                                  <h3 className="font-medium text-warm-900 dark:text-gray-100 line-clamp-2 group-hover:text-sage-600 dark:group-hover:text-sage-400 transition-colors">
                                    {item.title}
                                  </h3>
                                  {item.price != null && (
                                    <p className="text-sm font-semibold text-sage-600 dark:text-sage-400">
                                      ${item.price.toFixed(2)}
                                    </p>
                                  )}
                                </div>
                                <div className="px-4 py-3 border-t border-warm-200 dark:border-gray-700 space-y-1">
                                  <p className="text-xs font-medium text-warm-600 dark:text-gray-400">{item.sale.title}</p>
                                  <p className="text-xs text-warm-500 dark:text-gray-500">{item.sale.city} · View Sale →</p>
                                </div>
                              </a>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {searchResults?.sales && searchResults.sales.length > 0 && (
                      <div>
                        <h3 className="font-heading text-lg font-semibold text-warm-900 dark:text-gray-100 mb-4">Sales</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                          {searchResults.sales.map((sale, index) => (
                            <SaleCard key={sale.id} sale={sale} priority={index < 4} />
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <EmptyState
                    icon="🔍"
                    heading={`No items found for "${searchQuery}"`}
                    subtext="Try a different keyword, or browse all nearby sales."
                    cta={{ label: 'Browse Nearby Sales', onClick: () => setSearchQuery('') }}
                  />
                )}
              </>
            ) : (
              <>
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
                    {filteredSales.map((sale, index) => (
                      <SaleCard key={sale.id} sale={sale} priority={index < 4} />
                    ))}
                  </div>
                ) : (
                  <div>
                    {dateFilter !== 'all' || saleTypeFilter || saleSubtypeFilter ? (
                      <div>
                        <EmptyState
                          icon="🏷️"
                          heading="No sales found"
                          subtext="No sales match your current filters. Try broadening your search or checking back later — new sales are added every day."
                        />
                        <div className="flex justify-center mt-6">
                          <button
                            type="button"
                            onClick={() => { setSearchQuery(''); setDateFilter('all'); setSaleTypeFilter(''); setSaleSubtypeFilter(''); }}
                            className="px-6 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium transition-colors"
                          >
                            Clear all filters
                          </button>
                        </div>
                      </div>
                    ) : (
                      <EmptyState
                        icon="💭"
                        heading="No sales yet in your area"
                        subtext="Great sales are coming soon! Check back daily or sign up to receive alerts when new sales open near you."
                      />
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </main>
        </div>
    </>
  );
};

export const getStaticProps: GetStaticProps<HomePageProps> = async () => {
  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://api.finda.sale';

  try {
    const res = await fetch(`${BACKEND_URL}/api/feed?limit=12&status=upcoming`);
    const data = res.ok ? await res.json() : null;
    return {
      props: { initialSalesData: data },
      revalidate: 3600, // 1 hour ISR
    };
  } catch (error) {
    return { props: { initialSalesData: null }, revalidate: 300 };
  }
};
export default HomePage;
