/**
 * Phase 29: Category browse page — /categories/[category]
 * Lists all available items in the given category across published sales.
 * ADR-074 Phase 2: Includes trending items from eBay by category.
 */
import React from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { GetStaticProps, GetStaticPaths } from 'next';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { formatCategoryLabel } from '../../lib/itemConstants';
import { SkeletonCard } from '../../components/SkeletonCards';
import { getItemImageUrl } from '../../lib/imageUtils';

const CATEGORIES = [
  'furniture', 'clothing', 'electronics', 'books', 'antiques',
  'tools', 'kitchen', 'art', 'jewelry', 'other',
];

/**
 * Slugify a category name for API calls.
 * "Furniture" → "furniture", "Art & Decor" → "art-decor"
 */
function slugifyCategory(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * TrendingSection — Display trending items for a category from eBay
 */
interface TrendingFind {
  id: string;
  itemTitle: string;
  listingPrice: number;
  imageUrl: string | null;
  ebayUrl: string | null;
  ebayListingId: string;
}

interface TrendingResponse {
  slug: string;
  finds: TrendingFind[];
  count: number;
  lastUpdated: string | null;
}

const TrendingSection: React.FC<{ categorySlug: string; categoryLabel: string }> = ({ categorySlug, categoryLabel }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['category-trending', categorySlug],
    queryFn: async () => {
      const res = await api.get(`/categories/${categorySlug}/top-finds`);
      return res.data as TrendingResponse;
    },
    enabled: !!categorySlug,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Hide if loading or no results
  if (isLoading || !data || data.count === 0) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100">
          Trending in {categoryLabel}
        </h2>
        <span className="text-xs text-gray-400">via eBay</span>
      </div>

      {/* Horizontally scrollable cards */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {data.finds.slice(0, 8).map((find) => (
          <a
            key={find.id}
            href={find.ebayUrl || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 w-[120px] group"
          >
            {/* Image */}
            {find.imageUrl ? (
              <img
                src={find.imageUrl}
                alt={find.itemTitle}
                className="aspect-square w-full object-cover rounded-lg mb-2 group-hover:opacity-80 transition-opacity"
                loading="lazy"
              />
            ) : (
              <div className="aspect-square bg-warm-200 dark:bg-gray-700 rounded-lg flex items-center justify-center mb-2">
                <span className="text-2xl">📦</span>
              </div>
            )}

            {/* Title */}
            <h3 className="text-sm font-medium text-warm-900 dark:text-warm-100 line-clamp-2 mb-1 group-hover:text-amber-600 transition-colors">
              {find.itemTitle}
            </h3>

            {/* Price */}
            <p className="text-sm font-semibold text-green-600 dark:text-green-400">
              ${find.listingPrice.toFixed(2)}
            </p>
          </a>
        ))}
      </div>
    </div>
  );
};

interface CategoryPageProps {
  initialData?: {
    category: string;
    items: any[];
    pagination: { total: number; page: number; pages: number };
  };
}

const CategoryPage = ({ initialData }: CategoryPageProps) => {
  const router = useRouter();
  const { category } = router.query as { category: string };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['category-items', category],
    queryFn: async () => {
      const res = await api.get(`/search/categories/${category}`);
      return res.data as {
        category: string;
        items: any[];
        pagination: { total: number; page: number; pages: number };
      };
    },
    enabled: !!category,
    staleTime: 60_000,
    initialData: initialData && category ? initialData : undefined,
  });

  const label = category
    ? formatCategoryLabel(category)
    : '...';

  // Slugify category for API calls (e.g., "Furniture" → "furniture")
  const categorySlug = category ? slugifyCategory(category) : '';

  return (
    <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
      <Head>
        <title>{label} — FindA.Sale</title>
        <link rel="canonical" href={`https://finda.sale/categories/${category}`} />
        <meta
          name="description"
          content={`Browse ${label} items from estate sales, auctions, yard sales, and consignment near you. New listings added daily.`}
        />
        <meta property="og:title" content={`${label} — FindA.Sale`} />
        <meta
          property="og:description"
          content={`Browse ${label} items from estate sales, auctions, yard sales, and consignment near you. New listings added daily.`}
        />
        <meta property="og:url" content={`https://finda.sale/categories/${category}`} />
        <meta property="og:image" content="https://finda.sale/og-image.png" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'CollectionPage',
              name: label,
              description: `Browse ${label} items from estate sales, auctions, yard sales, and consignment near you. New listings added daily.`,
              url: `https://finda.sale/categories/${category}`,
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                {
                  '@type': 'ListItem',
                  position: 1,
                  name: 'Home',
                  item: 'https://finda.sale',
                },
                {
                  '@type': 'ListItem',
                  position: 2,
                  name: 'Categories',
                  item: 'https://finda.sale/categories',
                },
                {
                  '@type': 'ListItem',
                  position: 3,
                  name: label,
                  item: `https://finda.sale/categories/${category}`,
                },
              ],
            }),
          }}
        />
      </Head>

      <main className="container mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="text-sm text-warm-400 mb-6 flex items-center gap-2">
          <Link href="/" className="hover:text-amber-600">Home</Link>
          <span>›</span>
          <span className="text-warm-900 dark:text-warm-100 font-medium">{label}</span>
        </nav>

        <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-1">{label}</h1>
        {!isLoading && data && (
          <p className="text-warm-500 dark:text-warm-400 text-sm mb-6">
            {data.pagination.total} item{data.pagination.total !== 1 ? 's' : ''} available
          </p>
        )}

        {/* Category chips */}
        <div className="flex flex-wrap gap-2 mb-8">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat}
              href={`/categories/${cat}`}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                cat === category
                  ? 'bg-amber-600 text-white'
                  : 'bg-warm-200 text-warm-800 dark:bg-gray-700 dark:text-gray-100 hover:bg-warm-300 dark:hover:bg-gray-600'
              }`}
            >
              {formatCategoryLabel(cat)}
            </Link>
          ))}
        </div>

        {/* Trending section */}
        {categorySlug && <TrendingSection categorySlug={categorySlug} categoryLabel={label} />}

        {/* Items grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-16">
            <p className="text-5xl mb-4">😕</p>
            <p className="text-warm-700 dark:text-warm-300 text-lg mb-4">Failed to load items.</p>
            <button
              onClick={() => refetch()}
              className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-5xl mb-4">📭</p>
            <h3 className="text-xl font-semibold text-warm-900 dark:text-warm-100 mb-2">No items in this category yet</h3>
            <p className="text-warm-600 dark:text-warm-400 mb-6">
              Check back soon — new sales go live every week.
            </p>
            <Link
              href="/"
              className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
            >
              Browse All Sales
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {data.items.map((item) => (
              <Link
                key={item.id}
                href={`/items/${item.id}`}
                className="group bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-sm hover:shadow-lg transition-shadow"
              >
                <div className="aspect-square bg-warm-100 dark:bg-gray-700 overflow-hidden">
                  {item.photoUrls && item.photoUrls[0] ? (
                    <img
                      src={getItemImageUrl(item.photoUrls[0]) || item.photoUrls[0]}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-3xl">📦</div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-warm-900 dark:text-warm-100 line-clamp-2 text-sm mb-2">
                    {item.title}
                  </h3>
                  {item.price && (
                    <p className="text-green-600 dark:text-green-400 font-bold mb-2">
                      ${parseFloat(item.price).toFixed(2)}
                    </p>
                  )}
                  <p className="text-xs text-warm-500 dark:text-warm-400">
                    {item.sale?.title || 'Sale TBA'}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default CategoryPage;

export const getStaticPaths: GetStaticPaths = async () => {
  const paths = CATEGORIES.map((cat) => ({
    params: { category: cat },
  }));

  return {
    paths,
    fallback: 'blocking',
  };
};

export const getStaticProps: GetStaticProps = async ({ params }) => {
  const category = params?.category as string;

  try {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || process.env.INTERNAL_API_URL || 'http://localhost:4000/api';
    const res = await fetch(`${apiBaseUrl}/search/categories/${category}`);

    if (!res.ok) {
      return { notFound: true };
    }

    const data = await res.json() as {
      category: string;
      items: any[];
      pagination: { total: number; page: number; pages: number };
    };

    return {
      props: {
        initialData: data,
      },
      revalidate: 300, // ISR: revalidate every 5 minutes
    };
  } catch (error) {
    console.error(`Error fetching category ${category}:`, error);
    return {
      props: {},
      revalidate: 60, // Retry in 1 minute on error
    };
  }
};
