import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { GetServerSideProps } from 'next';

interface ClearanceItem {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  condition: string | null;
  category: string | null;
  primaryPhoto: string | null;
  saleId: string | null;
  sale: {
    city: string;
    state: string;
    endDate: string;
  } | null;
}

interface PageProps {
  initialItems: ClearanceItem[];
  initialTotal: number;
  cities: string[];
  currentCity: string;
  currentMaxPrice: string;
}

const CONDITION_LABELS: Record<string, string> = {
  NEW: 'New',
  USED: 'Used',
  REFURBISHED: 'Refurbished',
  PARTS_OR_REPAIR: 'Parts/Repair',
};

const CONDITION_COLORS: Record<string, string> = {
  NEW: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  USED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  REFURBISHED: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  PARTS_OR_REPAIR: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

function ItemCard({ item }: { item: ClearanceItem }) {
  const conditionLabel = item.condition ? (CONDITION_LABELS[item.condition] ?? item.condition) : null;
  const conditionColor = item.condition ? (CONDITION_COLORS[item.condition] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300') : null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col hover:shadow-md transition-shadow">
      {/* Photo */}
      <div className="aspect-square bg-gray-100 dark:bg-gray-700 overflow-hidden">
        {item.primaryPhoto ? (
          <img
            src={item.primaryPhoto}
            alt={item.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500 text-4xl">
            📦
          </div>
        )}
      </div>

      {/* Details */}
      <div className="p-3 flex flex-col flex-1 gap-2">
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm leading-snug line-clamp-2">
          {item.name}
        </h3>

        {item.price != null && (
          <span className="text-lg font-bold text-amber-600 dark:text-amber-400">
            ${item.price.toFixed(2)}
          </span>
        )}

        <div className="flex flex-wrap gap-1 items-center">
          {conditionLabel && conditionColor && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${conditionColor}`}>
              {conditionLabel}
            </span>
          )}
          {item.category && (
            <span className="text-xs text-gray-500 dark:text-gray-400">{item.category}</span>
          )}
        </div>

        {item.sale && (
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <span>📍</span>
            <span>{item.sale.city}, {item.sale.state}</span>
          </p>
        )}

        <div className="mt-auto pt-2">
          {item.saleId ? (
            <Link
              href={`/sales/${item.saleId}`}
              className="block text-center text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 border border-indigo-200 dark:border-indigo-700 rounded-md py-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
            >
              Contact Organizer
            </Link>
          ) : (
            <span className="block text-center text-sm text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 rounded-md py-1.5">
              Unavailable
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ClearancePage({
  initialItems,
  initialTotal,
  cities,
  currentCity,
  currentMaxPrice,
}: PageProps) {
  const [city, setCity] = useState(currentCity);
  const [maxPrice, setMaxPrice] = useState(currentMaxPrice);
  const [items, setItems] = useState<ClearanceItem[]>(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const LIMIT = 24;
  const pages = Math.ceil(total / LIMIT);

  const fetchItems = async (nextPage: number, nextCity: string, nextMaxPrice: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), limit: String(LIMIT) });
      if (nextCity) params.set('city', nextCity);
      if (nextMaxPrice) params.set('maxPrice', nextMaxPrice);
      const res = await fetch(`/api/clearance?${params.toString()}`);
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      setItems(data.items);
      setTotal(data.total);
      setPage(nextPage);
    } catch {
      // keep existing items on error
    } finally {
      setLoading(false);
    }
  };

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    fetchItems(1, city, maxPrice);
  };

  // Build JSON-LD ItemList from first 10 items
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Clearance & Post-Sale Finds — FindA.Sale',
    description: 'Items from recently ended sales, available for pickup or arrangement with the organizer.',
    numberOfItems: Math.min(10, items.length),
    itemListElement: items.slice(0, 10).map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      url: item.saleId ? `https://finda.sale/sales/${item.saleId}` : 'https://finda.sale/clearance',
      ...(item.price != null
        ? {
            offers: {
              '@type': 'Offer',
              price: item.price.toFixed(2),
              priceCurrency: 'USD',
              availability: 'https://schema.org/InStock',
            },
          }
        : {}),
    })),
  };

  return (
    <>
      <Head>
        <title>Clearance & Post-Sale Finds · FindA.Sale</title>
        <meta
          name="description"
          content="Shop clearance items from recently ended estate sales, yard sales, and more. Contact the organizer to arrange pickup."
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </Head>

      <div className="bg-white dark:bg-gray-900 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Clearance &amp; Post-Sale Finds
            </h1>
            <p className="text-gray-600 dark:text-gray-400 max-w-2xl">
              Items from recently ended sales, available for pickup or arrangement with the organizer.
              {total > 0 && (
                <span className="ml-1 text-gray-500 dark:text-gray-500">
                  ({total.toLocaleString()} item{total !== 1 ? 's' : ''})
                </span>
              )}
            </p>
          </div>

          {/* Filters */}
          <form
            onSubmit={handleFilter}
            className="flex flex-wrap gap-3 mb-8 items-end"
          >
            <div className="flex flex-col gap-1">
              <label htmlFor="city-filter" className="text-xs font-medium text-gray-600 dark:text-gray-400">
                City
              </label>
              <select
                id="city-filter"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All cities</option>
                {cities.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="price-filter" className="text-xs font-medium text-gray-600 dark:text-gray-400">
                Max price
              </label>
              <select
                id="price-filter"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Any price</option>
                <option value="10">Under $10</option>
                <option value="25">Under $25</option>
                <option value="50">Under $50</option>
                <option value="100">Under $100</option>
                <option value="250">Under $250</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Loading…' : 'Apply'}
            </button>

            {(city || maxPrice) && (
              <button
                type="button"
                onClick={() => {
                  setCity('');
                  setMaxPrice('');
                  fetchItems(1, '', '');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Clear
              </button>
            )}
          </form>

          {/* Grid */}
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="bg-gray-200 dark:bg-gray-700 rounded-lg aspect-square animate-pulse" />
              ))}
            </div>
          ) : items.length > 0 ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-8">
                {items.map((item) => (
                  <ItemCard key={item.id} item={item} />
                ))}
              </div>

              {pages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  <button
                    onClick={() => fetchItems(Math.max(1, page - 1), city, maxPrice)}
                    disabled={page === 1 || loading}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Page {page} of {pages}
                  </span>
                  <button
                    onClick={() => fetchItems(Math.min(pages, page + 1), city, maxPrice)}
                    disabled={page === pages || loading}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16">
              <p className="text-2xl mb-2">🏷️</p>
              <p className="text-gray-600 dark:text-gray-400 font-medium">No clearance items right now</p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                Check back after upcoming sales end — items appear here automatically.
              </p>
              <Link
                href="/sales"
                className="inline-block mt-4 text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Browse upcoming sales →
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { city = '', maxPrice = '' } = context.query as Record<string, string>;

  const apiBase =
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:5000/api';

  try {
    const params = new URLSearchParams({ page: '1', limit: '24' });
    if (city) params.set('city', city);
    if (maxPrice) params.set('maxPrice', maxPrice);

    const res = await fetch(`${apiBase}/clearance?${params.toString()}`);
    const data = res.ok ? await res.json() : { items: [], total: 0, page: 1 };

    // Fetch distinct cities from a second page-1 unlimited call for the dropdown
    // Use items already fetched to build the initial list; a dedicated /api/clearance/cities
    // endpoint can be added later. For now, pass empty — client can filter by typing.
    const cities: string[] = [];

    return {
      props: {
        initialItems: data.items ?? [],
        initialTotal: data.total ?? 0,
        cities,
        currentCity: city,
        currentMaxPrice: maxPrice,
      },
    };
  } catch {
    return {
      props: {
        initialItems: [],
        initialTotal: 0,
        cities: [],
        currentCity: city,
        currentMaxPrice: maxPrice,
      },
    };
  }
};
