/**
 * City SEO Landing Page
 * URL: /city/grand-rapids-mi
 *      /city/chicago-il
 *
 * All-types view of a city. Links to per-category filtered pages.
 * Uses getStaticProps (ISR) — consistent with [slug]/[category].tsx.
 */

import { GetStaticProps, GetStaticPaths } from 'next';
import Head from 'next/head';
import Link from 'next/link';

// Category slug → display label + saleType enum
const CATEGORY_META: Record<string, { label: string; plural: string; saleType: string }> = {
  'estate-sales':  { label: 'Estate Sale',  plural: 'Estate Sales',  saleType: 'ESTATE'      },
  'yard-sales':    { label: 'Yard Sale',     plural: 'Yard Sales',    saleType: 'YARD'        },
  'auctions':      { label: 'Auction',       plural: 'Auctions',      saleType: 'AUCTION'     },
  'flea-markets':  { label: 'Flea Market',   plural: 'Flea Markets',  saleType: 'FLEA_MARKET' },
  'consignment':   { label: 'Consignment',   plural: 'Consignment',   saleType: 'RETAIL'      },
};

// Hardcoded fallback slugs when API is unavailable
const FALLBACK_CITY_SLUGS = [
  'grand-rapids-mi', 'chicago-il', 'detroit-mi', 'phoenix-az', 'dallas-tx',
  'los-angeles-ca', 'new-york-ny', 'houston-tx', 'san-antonio-tx', 'philadelphia-pa',
];

interface SaleListing {
  id: string;
  title: string;
  saleType: string;
  startDate: string;
  endDate: string;
  city: string;
  state: string;
  address: string;
  photoUrl: string | null;
  status: string;
  organizer: { id: string; businessName: string } | null;
}

interface CityPageProps {
  citySlug: string;
  cityName: string;
  cityState: string;
  sales: SaleListing[];
  totalCount: number;
  allCategories: string[];
}

export default function CityPage({
  citySlug,
  cityName,
  cityState,
  sales,
  totalCount,
  allCategories,
}: CityPageProps) {
  const title = `Estate Sales, Auctions & More in ${cityName}, ${cityState} | FindA.Sale`;
  const description = `Browse ${totalCount} sales in ${cityName}, ${cityState}. Find estate sales, yard sales, auctions, flea markets and more on FindA.Sale.`;
  const canonicalUrl = `https://finda.sale/city/${citySlug}`;

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home',   item: 'https://finda.sale' },
      { '@type': 'ListItem', position: 2, name: 'Cities', item: 'https://finda.sale/cities' },
      { '@type': 'ListItem', position: 3, name: `${cityName}, ${cityState}`, item: canonicalUrl },
    ],
  };

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Sales in ${cityName}, ${cityState}`,
    description,
    numberOfItems: sales.length,
    itemListElement: sales.slice(0, 20).map((sale, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      item: {
        '@type': 'Event',
        name: sale.title,
        url: `https://finda.sale/sales/${sale.id}`,
        startDate: sale.startDate,
        endDate: sale.endDate,
        location: {
          '@type': 'Place',
          name: sale.organizer?.businessName ?? sale.title,
          address: {
            '@type': 'PostalAddress',
            streetAddress: sale.address,
            addressLocality: sale.city,
            addressRegion: sale.state,
            addressCountry: 'US',
          },
        },
        ...(sale.photoUrl ? { image: sale.photoUrl } : {}),
        organizer: sale.organizer
          ? {
              '@type': 'Organization',
              name: sale.organizer.businessName,
              url: `https://finda.sale/organizers/${sale.organizer.id}`,
            }
          : undefined,
      },
    })),
  };

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonicalUrl} key="canonical" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="robots" content="index, follow" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
        />
      </Head>

      <main className="min-h-screen bg-white dark:bg-slate-900">
        {/* Breadcrumb */}
        <nav className="max-w-5xl mx-auto px-4 pt-4 pb-2 text-sm text-warm-500 dark:text-warm-400">
          <ol className="flex flex-wrap items-center gap-1">
            <li><Link href="/" className="hover:text-amber-600">Home</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link href="/cities" className="hover:text-amber-600">Cities</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-warm-800 dark:text-warm-200 font-medium">{cityName}, {cityState}</li>
          </ol>
        </nav>

        {/* Hero */}
        <div className="max-w-5xl mx-auto px-4 pt-6 pb-4">
          <h1 className="text-3xl md:text-4xl font-bold text-warm-900 dark:text-warm-100">
            Sales in {cityName}, {cityState}
          </h1>
          <p className="mt-2 text-warm-600 dark:text-warm-400">
            {totalCount > 0
              ? `${totalCount} sale${totalCount !== 1 ? 's' : ''} listed`
              : 'No sales currently listed'}
          </p>
        </div>

        {/* Category filter tabs */}
        {allCategories.length > 0 && (
          <div className="max-w-5xl mx-auto px-4 pb-4">
            <div className="flex flex-wrap gap-2">
              {/* "All sales" is the active tab on this page */}
              <span className="px-3 py-1.5 rounded-full text-sm border bg-amber-500 border-amber-500 text-white font-medium">
                All sales
              </span>
              {allCategories.map((saleType) => {
                const catSlug = Object.keys(CATEGORY_META).find(
                  (k) => CATEGORY_META[k].saleType === saleType
                );
                if (!catSlug) return null;
                const meta = CATEGORY_META[catSlug];
                return (
                  <Link
                    key={catSlug}
                    href={`/city/${citySlug}/${catSlug}`}
                    className="px-3 py-1.5 rounded-full text-sm border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-warm-300 hover:border-amber-500 hover:text-amber-600 transition-colors"
                  >
                    {meta.plural}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Sale grid */}
        <div className="max-w-5xl mx-auto px-4 pb-16">
          {sales.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-warm-500 dark:text-warm-400 text-lg mb-4">
                No sales currently listed in {cityName}.
              </p>
              <Link
                href="/cities"
                className="text-amber-600 hover:text-amber-700 font-medium"
              >
                Browse other cities →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
              {sales.map((sale) => {
                const start = new Date(sale.startDate);
                const end = new Date(sale.endDate);
                const now = new Date();
                const isActive = start <= now && now <= end;
                const isEnded = now > end;

                return (
                  <Link
                    key={sale.id}
                    href={`/sales/${sale.id}`}
                    className="card overflow-hidden hover:shadow-lg transition-shadow"
                  >
                    {/* Photo */}
                    {sale.photoUrl ? (
                      <div className="aspect-video w-full overflow-hidden bg-warm-100 dark:bg-gray-800">
                        <img
                          src={sale.photoUrl}
                          alt={sale.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div className="aspect-video w-full bg-warm-100 dark:bg-gray-800 flex items-center justify-center">
                        <span className="text-warm-400 dark:text-gray-500 text-sm">No photo</span>
                      </div>
                    )}

                    {/* Content */}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h2 className="font-semibold text-warm-900 dark:text-warm-100 text-sm leading-tight line-clamp-2">
                          {sale.title}
                        </h2>
                        {isActive && (
                          <span className="flex-shrink-0 text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 px-2 py-0.5 rounded-full font-medium">
                            Live
                          </span>
                        )}
                        {isEnded && (
                          <span className="flex-shrink-0 text-xs bg-warm-100 text-warm-500 dark:bg-gray-700 dark:text-gray-400 px-2 py-0.5 rounded-full">
                            Ended
                          </span>
                        )}
                      </div>

                      {sale.organizer && (
                        <p className="text-xs text-warm-500 dark:text-warm-400 mb-2">
                          {sale.organizer.businessName}
                        </p>
                      )}

                      <p className="text-xs text-warm-600 dark:text-warm-400">
                        {start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {' – '}
                        {end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>

                      {sale.address && (
                        <p className="text-xs text-warm-500 dark:text-warm-400 mt-1 truncate">
                          {sale.address}
                        </p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Claim CTA */}
          <div className="mt-12 p-6 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-center border border-amber-200 dark:border-amber-800">
            <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-2">
              Are you an organizer in {cityName}?
            </h2>
            <p className="text-warm-600 dark:text-warm-400 text-sm mb-4">
              List your sales on FindA.Sale and reach local shoppers.
            </p>
            <Link
              href="/register"
              className="inline-block bg-amber-500 hover:bg-amber-600 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm"
            >
              List your sales free
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  let slugs: string[] = FALLBACK_CITY_SLUGS;

  try {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';
    const res = await fetch(`${apiBaseUrl}/sales/city-slugs`);
    if (res.ok) {
      const data = await res.json();
      const raw: any[] = Array.isArray(data) ? data : data.slugs ?? [];
      // API returns objects { slug, city, state, count } — extract the string
      const fetched: string[] = raw.map((item) =>
        typeof item === 'string' ? item : item.slug
      ).filter(Boolean);
      if (fetched.length > 0) {
        slugs = fetched.slice(0, 25);
      }
    }
  } catch (err) {
    console.error('[city/[slug]] getStaticPaths fetch error — using fallback slugs:', err);
  }

  return {
    paths: slugs.map((slug) => ({ params: { slug } })),
    fallback: 'blocking',
  };
};

export const getStaticProps: GetStaticProps<CityPageProps> = async ({ params }) => {
  const citySlug = params?.slug as string;

  // Parse display name + state from slug
  const parts = citySlug.split('-');
  const stateCode = parts[parts.length - 1].toUpperCase();
  const cityName = parts
    .slice(0, -1)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  let sales: SaleListing[] = [];
  let totalCount = 0;
  let allCategories: string[] = [];

  try {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';
    const res = await fetch(
      `${apiBaseUrl}/sales/by-city/${encodeURIComponent(citySlug)}`,
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (res.ok) {
      const data = await res.json();
      sales = data.sales ?? [];
      totalCount = data.totalCount ?? 0;
      allCategories = data.categories ?? [];
    }
  } catch (err) {
    console.error(`[city/[slug]] getStaticProps fetch error for ${citySlug}:`, err);
  }

  return {
    props: {
      citySlug,
      cityName,
      cityState: stateCode,
      sales,
      totalCount,
      allCategories,
    },
    revalidate: 86400, // ISR: 24 hours
  };
};
