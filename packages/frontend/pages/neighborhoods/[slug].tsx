/**
 * Neighborhood Landing Page — Sprint U2
 * SEO-optimised page for estate sales in a specific neighborhood.
 * Uses getServerSideProps so search engines get pre-rendered sale listings.
 * Route: /neighborhoods/[slug]
 */

import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { GetServerSideProps } from 'next';
import { GRAND_RAPIDS_NEIGHBORHOODS } from './index';

interface NeighborhoodSale {
  id: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  photoUrls: string[];
  tags: string[];
  organizer: { businessName: string; avgRating: number | null };
  _count: { items: number };
}

interface Props {
  slug: string;
  name: string;
  description: string;
  sales: NeighborhoodSale[];
  total: number;
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

const isActive = (start: string, end: string) => {
  const now = Date.now();
  return new Date(start).getTime() <= now && new Date(end).getTime() >= now;
};

const NeighborhoodPage = ({ slug, name, description, sales, total }: Props) => {
  const canonicalUrl = `https://finda.sale/neighborhoods/${slug}`;
  const pageTitle = `Sales in ${name} | FindA.Sale`;
  const metaDesc = `Browse ${total > 0 ? total : 'upcoming'} sale${total !== 1 ? 's' : ''} in ${name} — estate sales, yard sales, garage sales, and more. Find furniture, antiques, collectibles and more near you.`;

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={metaDesc} />
        <link rel="canonical" href={canonicalUrl} />
        {/* Open Graph */}
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={metaDesc} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:type" content="website" />
        {/* Structured data — ItemList for Google */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'ItemList',
              name: `Sales in ${name}`,
              description: metaDesc,
              url: canonicalUrl,
              numberOfItems: total,
              itemListElement: sales.map((s, i) => ({
                '@type': 'ListItem',
                position: i + 1,
                url: `https://finda.sale/sales/${s.id}`,
                name: s.title,
              })),
            }),
          }}
        />
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-2xl mx-auto px-4 pt-6 pb-24">

          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-warm-500 dark:text-warm-400 mb-5">
            <Link href="/" className="hover:text-warm-700 dark:text-warm-300">Home</Link>
            <span>›</span>
            <Link href="/neighborhoods" className="hover:text-warm-700 dark:text-warm-300">Neighborhoods</Link>
            <span>›</span>
            <span className="text-warm-700 dark:text-warm-300 font-medium">{name}</span>
          </nav>

          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100">
              Sales in {name}
            </h1>
            <p className="text-warm-500 dark:text-warm-400 mt-1 text-sm">{description}</p>
            {total > 0 && (
              <p className="text-amber-700 font-medium mt-2 text-sm">
                {total} upcoming sale{total !== 1 ? 's' : ''} in this area
              </p>
            )}
          </div>

          {/* Empty state */}
          {sales.length === 0 && (
            <div className="text-center py-16">
              <p className="text-4xl mb-4">🏷️</p>
              <h2 className="text-xl font-semibold text-warm-900 dark:text-warm-100 mb-2">
                No upcoming sales in {name} right now
              </h2>
              <p className="text-warm-500 dark:text-warm-400 text-sm mb-6">
                Check back soon — new sales are added every day.
              </p>
              <Link
                href="/neighborhoods"
                className="inline-block bg-amber-600 text-white px-5 py-2 rounded-lg font-medium hover:bg-amber-700 transition-colors text-sm"
              >
                Browse other neighborhoods
              </Link>
            </div>
          )}

          {/* Sale list */}
          {sales.length > 0 && (
            <div className="space-y-4">
              {sales.map(sale => {
                const active = isActive(sale.startDate, sale.endDate);
                return (
                  <Link
                    key={sale.id}
                    href={`/sales/${sale.id}`}
                    className="card overflow-hidden flex gap-0 hover:shadow-md transition-shadow"
                  >
                    {/* Photo */}
                    <div className="w-28 h-28 flex-shrink-0 bg-warm-100 dark:bg-gray-700">
                      {sale.photoUrls?.[0] ? (
                        <img
                          src={sale.photoUrls[0]}
                          alt={sale.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-3xl">🏡</span>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 p-3 min-w-0">
                      <div className="flex items-start gap-2">
                        <p className="font-semibold text-warm-900 dark:text-warm-100 text-sm leading-tight flex-1 truncate">
                          {sale.title}
                        </p>
                        {active && (
                          <span className="flex-shrink-0 text-xs bg-green-50 dark:bg-green-900/20 text-green-700 px-2 py-0.5 rounded-full font-medium">
                            Happening Now
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                        {sale.organizer.businessName}
                        {sale.organizer.avgRating && sale.organizer.avgRating > 0 && (
                          <span className="ml-1">· ⭐ {sale.organizer.avgRating.toFixed(1)}</span>
                        )}
                      </p>

                      <p className="text-xs text-warm-600 dark:text-warm-400 mt-1">
                        📅 {formatDate(sale.startDate)} – {formatDate(sale.endDate)}
                      </p>

                      <p className="text-xs text-warm-500 dark:text-warm-400 mt-0.5 truncate">
                        📍 {sale.address}, {sale.city}
                      </p>

                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-warm-500 dark:text-warm-400">
                          {sale._count.items} item{sale._count.items !== 1 ? 's' : ''}
                        </span>
                        {sale.tags.slice(0, 3).map(tag => (
                          <span key={tag} className="text-xs bg-warm-100 dark:bg-gray-700 text-warm-600 dark:text-warm-400 px-2 py-0.5 rounded-full">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Other neighborhoods CTA */}
          <div className="mt-10 pt-6 border-t border-warm-200 dark:border-gray-700 text-center">
            <p className="text-warm-500 dark:text-warm-400 text-sm mb-3">Looking in a different area?</p>
            <Link
              href="/neighborhoods"
              className="text-amber-600 hover:text-amber-700 font-medium text-sm"
            >
              View all neighborhoods →
            </Link>
          </div>

        </div>
      </div>
    </>
  );
};

export const getServerSideProps: GetServerSideProps = async ({ params, res }) => {
  const slug = params?.slug as string;

  const neighborhood = GRAND_RAPIDS_NEIGHBORHOODS.find(n => n.slug === slug);
  if (!neighborhood) {
    return { notFound: true };
  }

  try {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
    const response = await fetch(`${apiBase}/sales/neighborhood/${slug}`);

    if (!response.ok) throw new Error('API error');
    const data = await response.json();

    // Cache for 5 minutes — balances freshness with SEO render time
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');

    return {
      props: {
        slug,
        name: neighborhood.name,
        description: neighborhood.description,
        sales: data.sales ?? [],
        total: data.total ?? 0,
      },
    };
  } catch {
    return {
      props: {
        slug,
        name: neighborhood.name,
        description: neighborhood.description,
        sales: [],
        total: 0,
      },
    };
  }
};

export default NeighborhoodPage;
