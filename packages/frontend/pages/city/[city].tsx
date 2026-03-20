/**
 * City Weekend Landing Pages — SEO Sprint #92
 * /city/[city] — ISR page for browsing sales by city
 *
 * Features:
 * - getStaticPaths: Grand Rapids + fallback 'blocking' for other cities
 * - getStaticProps: Fetch sales, items, organizers by city
 * - revalidate: 3600 (1-hour ISR cache)
 * - SEO: proper title, description, Schema.org LocalBusiness/Event JSON-LD
 * - CTA: "Run estate sales in [City]? List your next sale free"
 * - Internal linking: nearby city links for SEO crawl depth
 */

import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { GetStaticPropsContext, GetStaticPropsResult, GetStaticPathsResult } from 'next';
import SaleCard from '../../components/SaleCard';

interface Sale {
  id: string;
  title: string;
  description?: string;
  city: string;
  state: string;
  zip: string;
  startDate: string;
  endDate: string;
  address: string;
  photoUrls: string[];
  tags: string[];
  organizer: {
    businessName: string;
    avgRating?: number;
  };
  _count?: {
    items: number;
  };
}

interface Item {
  id: string;
  title: string;
  price: number | null;
  category: string | null;
  photoUrls: string[];
  saleId: string;
}

interface Organizer {
  id: string;
  businessName: string;
  reputationTier: string;
}

interface CityPageProps {
  city: string;
  state: string;
  saleCount: number;
  sales: Sale[];
  recentItems: Item[];
  topOrganizers: Organizer[];
  nearbyCities: Array<{ city: string; count: number }>;
}

export default function CityPage({
  city,
  state,
  saleCount,
  sales,
  recentItems,
  topOrganizers,
  nearbyCities,
}: CityPageProps) {
  // Humanize city name: convert hyphens to spaces and capitalize
  const cityDisplay = city
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  const pageTitle = `Estate Sales in ${cityDisplay}, ${state}`;
  const metaDescription = `Find upcoming estate sales in ${cityDisplay}, ${state}. Browse ${saleCount} sales with verified organizers and updated inventory.`;

  return (
    <>
      <Head>
        <title>{pageTitle} | FindA.Sale</title>
        <meta name="description" content={metaDescription} />
        <meta name="keywords" content={`estate sales ${cityDisplay}, ${state}, weekend sales, liquidation`} />

        {/* OG / Social Sharing */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content={`https://findasale.com/city/${city}`} />

        {/* Schema.org LocalBusiness/CollectionPage */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'CollectionPage',
              name: pageTitle,
              description: metaDescription,
              url: `https://findasale.com/city/${city}`,
              image: 'https://findasale.com/logo.png',
              areaServed: {
                '@type': 'City',
                name: cityDisplay,
                addressRegion: state,
                addressCountry: 'US',
              },
              aggregateOffer: {
                '@type': 'AggregateOffer',
                priceCurrency: 'USD',
                offerCount: saleCount,
              },
              // List first 10 sales as Event items
              itemListElement: sales.slice(0, 10).map((sale, idx) => ({
                '@type': 'ListItem',
                position: idx + 1,
                item: {
                  '@type': 'Event',
                  name: sale.title,
                  startDate: sale.startDate,
                  endDate: sale.endDate,
                  eventAttendanceMode: 'OfflineEventAttendanceMode',
                  eventStatus: 'EventScheduled',
                  location: {
                    '@type': 'Place',
                    name: sale.address,
                    address: {
                      '@type': 'PostalAddress',
                      addressLocality: sale.city,
                      addressRegion: sale.state,
                      addressCountry: 'US',
                    },
                  },
                  organizer: {
                    '@type': 'Organization',
                    name: sale.organizer.businessName,
                  },
                },
              })),
            }),
          }}
        />
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        {/* Hero Section */}
        <div className="bg-white dark:bg-gray-800 border-b border-warm-200 dark:border-gray-700 py-12">
          <div className="max-w-6xl mx-auto px-4">
            {/* Breadcrumb */}
            <nav className="text-sm text-warm-600 dark:text-warm-400 mb-6">
              <Link href="/" className="hover:text-amber-600">
                Home
              </Link>
              <span className="mx-2">›</span>
              <span className="text-warm-900 dark:text-warm-100 font-medium">{cityDisplay}</span>
            </nav>

            <h1 className="text-4xl md:text-5xl font-bold text-warm-900 dark:text-warm-100 mb-3">
              Estate Sales in {cityDisplay}, {state}
            </h1>
            <p className="text-lg text-warm-600 dark:text-warm-400">
              Browse {saleCount} upcoming sales with verified organizers and curated inventory
            </p>
          </div>
        </div>

        {/* Main Content */}
        <main className="max-w-6xl mx-auto px-4 py-12">
          {/* Upcoming Sales Section */}
          {sales.length > 0 ? (
            <section className="mb-16">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100">
                    Upcoming Sales
                  </h2>
                  <p className="text-warm-600 dark:text-warm-400 text-sm mt-1">
                    {sales.length} of {saleCount} showing
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sales.map((sale) => (
                  <SaleCard key={sale.id} sale={sale} />
                ))}
              </div>

              {saleCount > sales.length && (
                <div className="mt-8 text-center text-warm-600 dark:text-warm-400">
                  <p className="text-sm">More sales loading as they are scheduled</p>
                </div>
              )}
            </section>
          ) : (
            <section className="mb-16 text-center py-12">
              <div className="text-5xl mb-4">🏙️</div>
              <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-2">
                No sales scheduled yet
              </h2>
              <p className="text-warm-600 dark:text-warm-400 mb-6">
                Check back next weekend or browse sales in nearby cities below.
              </p>
            </section>
          )}

          {/* Popular Items Section */}
          {recentItems.length > 0 && (
            <section className="mb-16 bg-white dark:bg-gray-800 rounded-lg p-8 border border-warm-200 dark:border-gray-700">
              <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-6">
                Popular Items in {cityDisplay}
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {recentItems.slice(0, 8).map((item) => (
                  <Link key={item.id} href={`/items/${item.id}`}>
                    <a className="block group">
                      <div className="bg-warm-100 dark:bg-gray-700 rounded-lg overflow-hidden mb-3 aspect-square relative">
                        {item.photoUrls[0] ? (
                          <img
                            src={item.photoUrls[0]}
                            alt={item.title}
                            className="w-full h-full object-cover group-hover:opacity-75 transition-opacity"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full text-warm-400">
                            <svg
                              className="w-8 h-8"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16"
                              />
                            </svg>
                          </div>
                        )}
                      </div>
                      <h3 className="font-semibold text-warm-900 dark:text-warm-100 line-clamp-2 group-hover:text-amber-600 text-sm">
                        {item.title}
                      </h3>
                      {item.price !== null && (
                        <p className="text-lg font-bold text-amber-600 mt-1">
                          ${item.price.toFixed(0)}
                        </p>
                      )}
                    </a>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* CTA Section */}
          <section className="mb-16 bg-gradient-to-r from-amber-50 to-warm-50 dark:from-gray-800 dark:to-gray-900 rounded-lg p-8 border border-amber-200 dark:border-gray-700">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-3">
                Run estate sales in {cityDisplay}?
              </h2>
              <p className="text-warm-600 dark:text-warm-400 mb-6">
                Join FindA.Sale and list your next sale for free. Reach qualified buyers in your area.
              </p>
              <Link href="/signup?role=organizer">
                <a className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors">
                  Get Started as an Organizer
                </a>
              </Link>
            </div>
          </section>

          {/* Nearby Cities Section */}
          {nearbyCities.length > 0 && (
            <section>
              <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-6">
                Nearby Cities
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {nearbyCities.slice(0, 8).map((nearbyCity) => (
                  <Link key={nearbyCity.city} href={`/city/${nearbyCity.city.toLowerCase().replace(/\s+/g, '-')}`}>
                    <a className="block p-4 bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg hover:border-amber-400 dark:hover:border-amber-500 transition-colors">
                      <h3 className="font-semibold text-warm-900 dark:text-warm-100 hover:text-amber-600">
                        {nearbyCity.city}
                      </h3>
                      <p className="text-sm text-warm-600 dark:text-warm-400 mt-1">
                        {nearbyCity.count} sale{nearbyCity.count !== 1 ? 's' : ''}
                      </p>
                    </a>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>
    </>
  );
}

/**
 * Generate static paths for Grand Rapids at build time
 */
export async function getStaticPaths(): Promise<GetStaticPathsResult> {
  try {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
    const response = await fetch(`${apiBase}/sales/cities`);

    if (!response.ok) {
      console.warn('Failed to fetch cities for static paths, using Grand Rapids only');
      return {
        paths: [
          {
            params: { city: 'grand-rapids' },
          },
        ],
        fallback: 'blocking',
      };
    }

    const cities = (await response.json()) as Array<{ city: string; count: number }>;

    // Build Grand Rapids as primary path
    const paths = cities
      .filter((c) => c.count > 0)
      .slice(0, 5) // Pre-generate top 5 cities, rest use fallback
      .map((c) => ({
        params: { city: c.city.toLowerCase().replace(/\s+/g, '-') },
      }));

    // Ensure Grand Rapids is always included
    if (!paths.some((p) => p.params.city === 'grand-rapids')) {
      paths.unshift({ params: { city: 'grand-rapids' } });
    }

    return {
      paths,
      fallback: 'blocking',
    };
  } catch (error) {
    console.error('Error generating static paths:', error);
    return {
      paths: [{ params: { city: 'grand-rapids' } }],
      fallback: 'blocking',
    };
  }
}

/**
 * Generate static props with sales, items, and organizers for each city
 */
export async function getStaticProps(
  context: GetStaticPropsContext<{ city: string }>
): Promise<GetStaticPropsResult<CityPageProps>> {
  const { city } = context.params || {};

  if (!city) {
    return { notFound: true };
  }

  try {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

    // Decode city slug back to city name (e.g., grand-rapids -> Grand Rapids)
    const cityName = city
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    // Fetch all cities to get counts and identify state
    const citiesResponse = await fetch(`${apiBase}/sales/cities`);
    const allCities = (await citiesResponse.json()) as Array<{ city: string; count: number }>;

    // Find matching city (case-insensitive)
    const cityData = allCities.find((c) => c.city.toLowerCase() === cityName.toLowerCase());

    if (!cityData) {
      return { notFound: true, revalidate: 300 };
    }

    // Fetch sales for this city
    const salesResponse = await fetch(
      `${apiBase}/sales/city/${encodeURIComponent(cityName)}?limit=12`
    );

    if (!salesResponse.ok) {
      return { notFound: true, revalidate: 300 };
    }

    const salesData = (await salesResponse.json()) as {
      sales: Sale[];
      total: number;
      page: number;
      totalPages: number;
    };

    // Extract unique state from first sale (or default to MI)
    const state = salesData.sales[0]?.state || 'MI';
    const totalCount = salesData.total || 0;

    // Collect recent items from first 3 sales
    const recentItems: Item[] = [];
    for (const sale of salesData.sales.slice(0, 3)) {
      try {
        const itemsResponse = await fetch(
          `${apiBase}/items?saleId=${sale.id}&limit=4`
        );
        if (itemsResponse.ok) {
          const itemsData = (await itemsResponse.json()) as { items: Item[] };
          if (itemsData.items) {
            recentItems.push(...itemsData.items);
          }
        }
      } catch (err) {
        // Skip if items fetch fails
      }
    }

    // Top organizers in city (from sales data)
    const topOrganizers = Array.from(
      new Map(
        salesData.sales
          .filter((s) => s.organizer)
          .map((s) => [s.organizer.businessName, {
            id: s.organizer.businessName, // Use business name as ID for now
            businessName: s.organizer.businessName,
            reputationTier: 'TRUSTED' // Default tier
          }])
      ).values()
    ).slice(0, 5) as Organizer[];

    return {
      props: {
        city: city.toLowerCase(),
        state,
        saleCount: totalCount,
        sales: salesData.sales,
        recentItems: recentItems.slice(0, 12),
        topOrganizers,
        nearbyCities: allCities.filter((c) => c.city !== cityName).slice(0, 12),
      },
      revalidate: 3600, // 1-hour ISR cache
    };
  } catch (error) {
    console.error('Error generating static props for city:', city, error);
    return {
      notFound: true,
      revalidate: 300, // Retry after 5 minutes on error
    };
  }
}
