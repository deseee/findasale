/**
 * Tag-based SEO Landing Pages — Sprint 3
 * /tags/[slug] — ISR page for browsing items by tag
 *
 * Features:
 * - getStaticPaths: Fetch top 20 tags at build time
 * - fallback: 'blocking' for remaining tags
 * - revalidate: 3600 (1-hour ISR cache)
 * - SEO: title, description, OG image from first item
 * - JSON-LD ItemList schema with first 10 items
 * - Responsive grid: 1-col mobile, 2-col tablet, 3-col desktop
 */

import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { GetStaticPropsContext, GetStaticPropsResult, GetStaticPathsResult } from 'next';

interface ItemCard {
  id: string;
  title: string;
  price: number | null;
  category: string | null;
  condition: string | null;
  thumbnailUrl: string | null;
  tags: string[];
  saleId: string;
  saleTitle: string;
  city: string;
  state: string;
  createdAt: string;
}

interface SaleSummary {
  id: string;
  title: string;
  city: string;
  state: string;
  startDate: string | null;
  endDate: string | null;
}

interface TagPageProps {
  tag: string;
  itemCount: number;
  items: ItemCard[];
  sales: SaleSummary[];
  ogImageUrl: string | null;
}

export default function TagPage({ tag, itemCount, items, ogImageUrl }: TagPageProps) {
  const formattedTag = tag
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return (
    <>
      <Head>
        <title>{formattedTag} for Sale | FindA.Sale</title>
        <meta
          name="description"
          content={`Browse ${itemCount} ${tag} items available at estate sales near you. Updated weekly.`}
        />

        {/* OG / Social Sharing */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content={`${formattedTag} for Sale | FindA.Sale`} />
        <meta
          property="og:description"
          content={`Browse ${itemCount} ${tag} items available at estate sales near you.`}
        />
        {ogImageUrl && <meta property="og:image" content={ogImageUrl} />}

        {/* JSON-LD ItemList Schema */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'ItemList',
              name: `${formattedTag} Items for Sale`,
              description: `Browse ${tag} items at estate sales`,
              itemListElement: items.slice(0, 10).map((item, idx) => ({
                '@type': 'ListItem',
                position: idx + 1,
                name: item.title,
                image: item.thumbnailUrl || undefined,
                url: `https://findasale.com/items/${item.id}`,
                offers: {
                  '@type': 'Offer',
                  price: item.price ? item.price.toString() : '0',
                  priceCurrency: 'USD',
                },
              })),
            }),
          }}
        />
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-warm-200 dark:border-gray-700 py-8">
          <div className="max-w-6xl mx-auto px-4">
            {/* Breadcrumb */}
            <nav className="text-sm text-warm-500 dark:text-warm-400 mb-6 flex items-center gap-2">
              <Link href="/" className="hover:text-amber-600">
                Home
              </Link>
              <span>›</span>
              <Link href="/tags" className="hover:text-amber-600">
                Tags
              </Link>
              <span>›</span>
              <span className="text-warm-900 dark:text-warm-100 font-medium">{formattedTag}</span>
            </nav>

            <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-2">{formattedTag}</h1>
            <p className="text-warm-600 dark:text-warm-400 text-lg">
              {itemCount} item{itemCount !== 1 ? 's' : ''} available at estate sales near you
            </p>
          </div>
        </div>

        {/* Main Content */}
        <main className="max-w-6xl mx-auto px-4 py-12">
          {items.length > 0 ? (
            <>
              {/* Item Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {items.map((item) => (
                  <Link key={item.id} href={`/items/${item.id}`}>
                    <a className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden border border-warm-200 dark:border-gray-700 shadow-sm hover:shadow-lg transition-shadow">
                      {/* Item Photo */}
                      <div className="relative aspect-square bg-warm-100 dark:bg-gray-700 overflow-hidden">
                        {item.thumbnailUrl ? (
                          <Image
                            src={item.thumbnailUrl}
                            alt={item.title}
                            fill
                            className="object-cover"
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full bg-warm-200 text-warm-500 dark:text-warm-400">
                            <svg
                              className="w-12 h-12"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                              />
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Card Content */}
                      <div className="p-4 space-y-3">
                        {/* Title */}
                        <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 line-clamp-2">
                          {item.title}
                        </h3>

                        {/* Price */}
                        {item.price !== null && (
                          <p className="text-2xl font-bold text-amber-600">
                            ${item.price.toFixed(0)}
                          </p>
                        )}

                        {/* Sale Info */}
                        <div className="bg-warm-50 dark:bg-gray-900 rounded p-3 space-y-1 text-sm">
                          <p className="font-semibold text-warm-900 dark:text-warm-100">{item.saleTitle}</p>
                          <p className="text-warm-600 dark:text-warm-400">
                            {item.city}, {item.state}
                          </p>
                        </div>

                        {/* Condition Badge */}
                        {item.condition && (
                          <div className="flex items-center gap-2 text-xs">
                            <span className="bg-warm-200 text-warm-800 dark:text-warm-200 px-2 py-1 rounded">
                              {item.condition}
                            </span>
                          </div>
                        )}
                      </div>
                    </a>
                  </Link>
                ))}
              </div>

              {/* Note about pagination */}
              {itemCount > 24 && (
                <div className="mt-12 text-center text-warm-600 dark:text-warm-400">
                  <p>Showing 24 of {itemCount} items</p>
                  <p className="text-sm mt-2">More items from this tag coming soon</p>
                </div>
              )}
            </>
          ) : (
            /* Empty State */
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="text-5xl mb-4">🏺</div>
              <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-2">No items yet</h2>
              <p className="text-warm-600 dark:text-warm-400 mb-6">
                Check back soon for {tag} items at estate sales near you.
              </p>
              <Link href="/" className="text-amber-600 hover:underline font-medium">
                Browse all items
              </Link>
            </div>
          )}
        </main>
      </div>
    </>
  );
}

/**
 * Generate static paths for top 20 tags at build time
 */
export async function getStaticPaths(): Promise<GetStaticPathsResult> {
  try {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
    const response = await fetch(`${apiBase}/tags/popular`);

    if (!response.ok) {
      console.warn('Failed to fetch popular tags for static paths');
      return { paths: [], fallback: 'blocking' };
    }

    const data = (await response.json()) as { tags: Array<{ slug: string; count: number }> };
    const paths = data.tags.slice(0, 20).map((tag) => ({
      params: { slug: tag.slug },
    }));

    return {
      paths,
      fallback: 'blocking',
    };
  } catch (error) {
    console.error('Error generating static paths:', error);
    return { paths: [], fallback: 'blocking' };
  }
}

/**
 * Generate static props with tag items and SEO metadata
 */
export async function getStaticProps(
  context: GetStaticPropsContext<{ slug: string }>
): Promise<GetStaticPropsResult<TagPageProps>> {
  const { slug } = context.params || {};

  if (!slug) {
    return { notFound: true };
  }

  try {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
    const response = await fetch(`${apiBase}/tags/${encodeURIComponent(slug)}/items?page=1&limit=24`);

    if (!response.ok) {
      return { notFound: true, revalidate: 3600 };
    }

    const data = (await response.json()) as {
      tag: string;
      itemCount: number;
      items: ItemCard[];
      sales: SaleSummary[];
    };

    // Extract OG image from first item
    const ogImageUrl = data.items[0]?.thumbnailUrl || null;

    return {
      props: {
        tag: data.tag,
        itemCount: data.itemCount,
        items: data.items,
        sales: data.sales,
        ogImageUrl,
      },
      revalidate: 3600, // 1-hour ISR cache
    };
  } catch (error) {
    console.error('Error generating static props for tag:', slug, error);
    return {
      notFound: true,
      revalidate: 300, // Retry after 5 minutes on error
    };
  }
}
