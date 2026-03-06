/**
 * Phase 29: Full-text search page — /search?q=
 * CD2 Phase 3: Adds visual search support via photo upload
 * Searches across published sales and available items with tabbed results.
 */
import React, { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import SaleCard from '../components/SaleCard';
import VisualSearchButton from '../components/VisualSearchButton';

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

const SearchPage = () => {
  const router = useRouter();
  const [tab, setTab] = useState<SearchTab>('all');
  const [visualResults, setVisualResults] = useState<VisualSearchData | null>(null);
  const q = ((router.query.q as string) || '').trim();

  const { data, isLoading } = useQuery({
    queryKey: ['search', q, tab],
    queryFn: async () => {
      const res = await api.get('/search', { params: { q, type: tab } });
      return res.data as { query: string; sales: any[]; items: any[] };
    },
    enabled: q.length >= 2,
    staleTime: 30_000,
  });

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
        {/* Search bar + visual search */}
        <div className="mb-8 max-w-2xl mx-auto">
          <form onSubmit={handleSearch} className="mb-4">
            <div className="flex gap-2">
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

          {/* Visual search button */}
          <VisualSearchButton onResults={handleVisualSearchResults} />
        </div>

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
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-white rounded-lg overflow-hidden animate-pulse">
                    <div className="aspect-square bg-warm-200" />
                    <div className="p-3 space-y-2">
                      <div className="h-4 bg-warm-200 rounded w-3/4" />
                      <div className="h-3 bg-warm-200 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
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
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                        {data!.sales.map((sale: any) => (
                          <SaleCard key={sale.id} sale={sale} />
                        ))}
                      </div>
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
                  <div className="text-center py-16">
                    <p className="text-warm-600 text-lg mb-2">No results for "{q}".</p>
                    <p className="text-warm-400 text-sm mb-6">Try a different keyword or browse by category.</p>
                    <div className="flex flex-wrap justify-center gap-2">
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
          </>
        )}
      </main>
    </div>
  );
};

export default SearchPage;
