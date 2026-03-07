/**
 * Phase 29: Full-text search page — /search?q=
 * CD2 Phase 3: Adds visual search support via photo upload
 * Searches across published sales and available items with tabbed results.
 * Advanced filters: price range, condition, category, sale status, sort
 */
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import SaleCard from '../components/SaleCard';
import VisualSearchButton from '../components/VisualSearchButton';
import SearchFilterPanel, { SearchFilters } from '../components/SearchFilterPanel';
import EmptyState from '../components/EmptyState';
import { SkeletonGrid } from '../components/SkeletonCards';

type SearchTab = 'all' | 'sales' | 'items';

const SUGGESTED_CATEGORIES = ['Furniture', 'Antiques', 'Clothing', 'Books', 'Tools', 'Jewelry'];

const ItemCard = ({ item }: { item: any }) => (
  <Link
    href={`/items/${item.id}`}
    className="bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col"
  >
    {item.photoUrls?.[0] ? (
      <img
        src={item.photoUrls[0]}
        alt={item.title}
        className="aspect-square w-full object-cover"
        loading="lazy"
      />
    ) : (
      <div className="aspect-square bg-warm-200 flex items-center justify-center">
        <span className="text-warm-400 text-3xl">📦</span>
      </div>
    )}
    <div className="p-3 flex-1 flex flex-col">
      <h3 className="text-sm font-semibold text-warm-900 line-clamp-1 mb-1">{item.title}</h3>
      {item.price != null && (
        <p className="text-amber-600 font-bold text-sm">${Number(item.price).toFixed(2)}</p>
      )}
      {item.sale && (
        <p className="text-xs text-warm-500 mt-auto pt-1 line-clamp-1">
          {item.sale.title} &middot; {item.sale.city}, {item.sale.state}
        </p>
      )}
    </div>
  </Link>
);

interface VisualSearchData {
  detectedLabels: string[];
  results: any[];
}

const CATEGORIES = [
  'Furniture', 'Clothing', 'Electronics', 'Books', 'Antiques',
  'Tools', 'Kitchen', 'Art', 'Jewelry', 'Other',
];

const SearchPage = () => {
  const router = useRouter();
  const [tab, setTab] = useState<SearchTab>('all');
  const [visualResults, setVisualResults] = useState<VisualSearchData | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Initialize filters from URL query params
  const [filters, setFilters] = useState<SearchFilters>({
    priceMin: null,
    priceMax: null,
    condition: '',
    category: '',
    saleStatus: 'all',
    sortBy: 'recent',
  });

  const q = ((router.query.q as string) || '').trim();

  // Load filters from URL on mount
  useEffect(() => {
    if (!router.isReady) return;

    const priceMin = router.query.priceMin ? parseInt(router.query.priceMin as string) : null;
    const priceMax = router.query.priceMax ? parseInt(router.query.priceMax as string) : null;
    const condition = (router.query.condition as string) || '';
    const category = (router.query.category as string) || '';
    const saleStatus = (router.query.saleStatus as string || 'all') as any;
    const sortBy = (router.query.sortBy as string || 'recent') as any;

    setFilters({ priceMin, priceMax, condition, category, saleStatus, sortBy });

    // Detect mobile
    setIsMobile(window.innerWidth < 768);
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [router.isReady, router.query]);

  const { data, isLoading } = useQuery({
    queryKey: ['search', q, tab, filters],
    queryFn: async () => {
      const params: any = { q, type: tab };
      if (filters.priceMin !== null) params.priceMin = filters.priceMin;
      if (filters.priceMax !== null) params.priceMax = filters.priceMax;
      if (filters.condition) params.condition = filters.condition;
      if (filters.category) params.category = filters.category;
      if (filters.saleStatus !== 'all') params.saleStatus = filters.saleStatus;
      if (filters.sortBy !== 'recent') params.sortBy = filters.sortBy;

      const res = await api.get('/search', { params });
      return res.data as { query: string; sales: any[]; items: any[] };
    },
    enabled: q.length >= 2,
    staleTime: 30_000,
  });

  // Update URL when filters change
  const handleFiltersChange = (newFilters: SearchFilters) => {
    setFilters(newFilters);

    const queryParams = new URLSearchParams({ q });
    if (newFilters.priceMin !== null) queryParams.set('priceMin', newFilters.priceMin.toString());
    if (newFilters.priceMax !== null) queryParams.set('priceMax', newFilters.priceMax.toString());
    if (newFilters.condition) queryParams.set('condition', newFilters.condition);
    if (newFilters.category) queryParams.set('category', newFilters.category);
    if (newFilters.saleStatus !== 'all') queryParams.set('saleStatus', newFilters.saleStatus);
    if (newFilters.sortBy !== 'recent') queryParams.set('sortBy', newFilters.sortBy);

    router.push(`/search?${queryParams.toString()}`, undefined, { shallow: true });
  };

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const query = (fd.get('q') as string || '').trim();
    if (query) router.push(`/search?q=${encodeURIComponent(query)}`);
  };

  const handleVisualSearchResults = (data: VisualSearchData) => {
    setVisualResults(data);
  };

  const isShowingVisualResults = visualResults && visualResults.results.length > 0;
  const salesCount = data?.sales?.length ?? 0;
  const itemsCount = data?.items?.length ?? 0;

  return (
    <div className="min-h-screen bg-warm-50">
      <Head>
        <title>{q ? `"${q}" — Search` : 'Search'} — FindA.Sale</title>
        <meta name="description" content={q ? `Search results for ${q} on FindA.Sale` : 'Search sales and items on FindA.Sale'} />
      </Head>

      <main className="container mx-auto px-4 py-8">
        {/* Search bar */}
        <form onSubmit={handleSearch} className="mb-8">
          <div className="flex gap-2 max-w-2xl mx-auto">
            <input
              name="q"
              defaultValue={q}
              key={q}
              placeholder="Search sales, items, keywords…"
              aria-label="Search sales and items"
              className="flex-1 px-4 py-3 border border-warm-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white text-warm-900"
              autoFocus={!q}
            />
            <button
              type="submit"
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-6 py-3 rounded-xl transition-colors"
            >
              Search
            </button>
          </div>
        </form>

        {/* Mobile filter panel */}
        {q && q.length >= 2 && isMobile && (
          <SearchFilterPanel
            filters={filters}
            onFiltersChange={handleFiltersChange}
            categories={CATEGORIES}
            resultCount={data?.items?.length}
            isMobile={true}
          />
        )}

        {/* Empty / short query state */}
        {!q && !isShowingVisualResults && (
          <div className="text-center py-16">
            <p className="text-warm-500 text-lg mb-6">What are you looking for?</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTED_CATEGORIES.map((cat) => (
                <Link
                  key={cat}
                  href={`/categories/${cat.toLowerCase()}`}
                  className="px-4 py-2 bg-white border border-warm-200 hover:border-amber-400 text-warm-700 rounded-full text-sm transition-colors shadow-sm"
                >
                  {cat}
                </Link>
              ))}
            </div>
          </div>
        )}

        {q && q.length < 2 && (
          <p className="text-center text-warm-500 py-8">Please enter at least 2 characters.</p>
        )}

        {/* Visual search results */}
        {isShowingVisualResults && (
          <>
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-warm-900 mb-3">Visual Search Results</h2>
              {visualResults!.detectedLabels.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {visualResults!.detectedLabels.map((label) => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-800 text-sm rounded-full"
                    >
                      🏷️ {label}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-sm text-warm-600 mb-4">
                Found {visualResults!.results.length} item{visualResults!.results.length !== 1 ? 's' : ''} matching your photo
              </p>
            </div>

            {visualResults!.results.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-12">
                {visualResults!.results.map((item: any) => (
                  <ItemCard key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 mb-12">
                <p className="text-warm-500">No items found matching your photo. Try searching by text.</p>
              </div>
            )}

            {q && (
              <div className="border-t pt-8">
                <p className="text-sm text-warm-600 mb-4">Or continue with your text search:</p>
              </div>
            )}
          </>
        )}

        {/* Text search results */}
        {q && q.length >= 2 && (
          <>
            <div className="flex gap-6">
              {/* Desktop filter sidebar */}
              {!isMobile && (
                <SearchFilterPanel
                  filters={filters}
                  onFiltersChange={handleFiltersChange}
                  categories={CATEGORIES}
                  resultCount={data?.items?.length}
                  isMobile={false}
                />
              )}

              {/* Main content area */}
              <div className="flex-1 min-w-0">
                {/* Tabs */}
                <div className="flex gap-6 mb-6 border-b border-warm-200">
                  {(['all', 'sales', 'items'] as SearchTab[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`pb-2 font-medium capitalize transition-colors ${
                        tab === t
                          ? 'border-b-2 border-amber-600 text-amber-600'
                          : 'text-warm-600 hover:text-warm-900'
                      }`}
                    >
                      {t}
                      {!isLoading && t === 'sales' && ` (${salesCount})`}
                      {!isLoading && t === 'items' && ` (${itemsCount})`}
                    </button>
                  ))}
                </div>

                {isLoading ? (
                  <SkeletonGrid count={6} variant="sale" columns="grid-cols-2 md:grid-cols-3" />
                ) : (
                  <>
                    {/* Sales */}
                    {(tab === 'all' || tab === 'sales') && (
                      <section className="mb-10">
                        {tab === 'all' && (
                          <h2 className="text-lg font-semibold text-warm-900 mb-4">
                            Sales <span className="text-warm-400 font-normal">({salesCount})</span>
                          </h2>
                        )}
                        {salesCount > 0 ? (
                          <>
                            {salesCount > 1 && (
                              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                <button
                                  onClick={() => {
                                    const addresses = data!.sales
                                      .filter((s: any) => s.address && s.city && s.state)
                                      .map((s: any) => `${s.address}, ${s.city}, ${s.state}`)
                                      .slice(0, 10);

                                    if (addresses.length > 0) {
                                      const waypointsParam = addresses.slice(1).map(a => encodeURIComponent(a)).join('|');
                                      const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(addresses[0])}${waypointsParam ? `&waypoints=${waypointsParam}` : ''}`;
                                      window.open(mapsUrl, '_blank');
                                    }
                                  }}
                                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors text-sm"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h14a2 2 0 002-2v-6a2 2 0 00-2-2h-2a2 2 0 00-2 2v6m-6-10l3-3m0 0l3 3m-3-3v10" />
                                  </svg>
                                  Plan Route for All Sales
                                </button>
                              </div>
                            )}
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                              {data!.sales.map((sale: any) => (
                                <SaleCard key={sale.id} sale={sale} />
                              ))}
                            </div>
                          </>
                        ) : (
                          <p className="text-warm-400 text-sm py-4">No sales found for "{q}".</p>
                        )}
                      </section>
                    )}

                    {/* Items */}
                    {(tab === 'all' || tab === 'items') && (
                      <section>
                        {tab === 'all' && (
                          <h2 className="text-lg font-semibold text-warm-900 mb-4">
                            Items <span className="text-warm-400 font-normal">({itemsCount})</span>
                          </h2>
                        )}
                        {itemsCount > 0 ? (
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                            {data!.items.map((item: any) => (
                              <ItemCard key={item.id} item={item} />
                            ))}
                          </div>
                        ) : (
                          <p className="text-warm-400 text-sm py-4">No items found for "{q}".</p>
                        )}
                      </section>
                    )}

                    {/* All empty */}
                    {salesCount === 0 && itemsCount === 0 && (
                      <div>
                        <EmptyState
                          icon="🔍"
                          heading={`No sales found for "${q}"`}
                          subtext="Try adjusting your filters, using different keywords, or browsing by category."
                        />
                        <div className="flex flex-wrap justify-center gap-2 mt-6">
                          {SUGGESTED_CATEGORIES.map((cat) => (
                            <Link
                              key={cat}
                              href={`/categories/${cat.toLowerCase()}`}
                              className="px-3 py-1 bg-warm-200 hover:bg-warm-300 text-warm-700 rounded-full text-sm transition-colors"
                            >
                              {cat}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default SearchPage;