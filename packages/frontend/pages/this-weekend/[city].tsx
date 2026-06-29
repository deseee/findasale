/**
 * This Weekend Sales — ISR City Page
 * Route: /this-weekend/grand-rapids-mi
 *
 * Shows sales overlapping the coming Friday–Sunday for a given city.
 * Revalidates every 4 hours so the weekend window stays current.
 */

import { GetStaticProps, GetStaticPaths } from 'next';
import Head from 'next/head';
import Link from 'next/link';

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

interface ThisWeekendPageProps {
  citySlug: string;
  cityName: string;
  cityState: string;
  sales: SaleListing[];
  totalCount: number;
  weekendStart: string;  // ISO string — Friday 00:00
  weekendEnd: string;    // ISO string — Sunday 23:59
}

/** Returns the next Friday–Sunday range (handles all day-of-week cases). */
function getThisWeekendRange(): { start: Date; end: Date } {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon…6=Sat
  const daysUntilFriday = ((5 - day + 7) % 7) || 7; // next Friday; if today IS Friday, still next Friday
  const friday = new Date(now);
  friday.setDate(now.getDate() + daysUntilFriday);
  friday.setHours(0, 0, 0, 0);
  const sunday = new Date(friday);
  sunday.setDate(friday.getDate() + 2);
  sunday.setHours(23, 59, 59, 999);
  return { start: friday, end: sunday };
}

/** Format a date range as "May 23–25, 2026" or "May 30 – Jun 1, 2026" */
function formatWeekendRange(start: Date, end: Date): string {
  const startMonth = start.toLocaleDateString('en-US', { month: 'long' });
  const endMonth = end.toLocaleDateString('en-US', { month: 'long' });
  const year = end.getFullYear();
  if (startMonth === endMonth) {
    return `${startMonth} ${start.getDate()}–${end.getDate()}, ${year}`;
  }
  return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}, ${year}`;
}

export default function ThisWeekendPage({
  citySlug,
  cityName,
  cityState,
  sales,
  totalCount,
  weekendStart,
  weekendEnd,
}: ThisWeekendPageProps) {
  const title = `Sales This Weekend in ${cityName}, ${cityState} | FindA.Sale`;
  const description = `Browse ${totalCount > 0 ? totalCount : ''} sales happening this weekend in ${cityName}, ${cityState}. Estate sales, yard sales, auctions and more.`.trim();
  const canonicalUrl = `https://finda.sale/this-weekend/${citySlug}`;

  const fridayDate = new Date(weekendStart);
  const sundayDate = new Date(weekendEnd);
  const weekendLabel = formatWeekendRange(fridayDate, sundayDate);

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Sales This Weekend in ${cityName}, ${cityState}`,
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

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home',   item: 'https://finda.sale' },
      { '@type': 'ListItem', position: 2, name: 'Cities', item: 'https://finda.sale/cities' },
      { '@type': 'ListItem', position: 3, name: `${cityName}, ${cityState}`, item: `https://finda.sale/city/${citySlug}` },
      { '@type': 'ListItem', position: 4, name: 'This Weekend', item: canonicalUrl },
    ],
  };

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonicalUrl} key="canonical" />
        <meta name="robots" content="index, follow" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
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
            <li>
              <Link href={`/city/${citySlug}`} className="hover:text-amber-600">
                {cityName}, {cityState}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="text-warm-800 dark:text-warm-200 font-medium">This Weekend</li>
          </ol>
        </nav>

        {/* Hero */}
        <div className="max-w-5xl mx-auto px-4 pt-6 pb-4">
          <h1 className="text-3xl md:text-4xl font-bold text-warm-900 dark:text-warm-100">
            Sales This Weekend in {cityName}, {cityState}
          </h1>
          <p className="mt-2 text-warm-600 dark:text-warm-400 text-lg">
            {weekendLabel}
          </p>
          {totalCount > 0 && (
            <p className="mt-1 text-warm-500 dark:text-warm-400 text-sm">
              {totalCount} sale{totalCount !== 1 ? 's' : ''} listed
            </p>
          )}
        </div>

        {/* Sale grid */}
        <div className="max-w-5xl mx-auto px-4 pb-16">
          {sales.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-warm-500 dark:text-warm-400 text-lg mb-3">
                No sales listed for this weekend in {cityName}.
              </p>
              <p className="text-warm-400 dark:text-gray-500 text-sm mb-6">
                Check back Thursday — we update weekly.
              </p>
              <Link
                href={`/city/${citySlug}`}
                className="text-amber-600 hover:text-amber-700 font-medium"
              >
                Browse all {cityName} sales →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
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

          {/* Link back to full city page */}
          {sales.length > 0 && (
            <div className="mt-8 text-center">
              <Link
                href={`/city/${citySlug}`}
                className="text-amber-600 hover:text-amber-700 font-medium text-sm"
              >
                ← See all sales in {cityName}
              </Link>
            </div>
          )}

          {/* Claim CTA */}
          <div className="mt-12 p-6 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-center border border-amber-200 dark:border-amber-800">
            <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-2">
              Are you an organizer in {cityName}?
            </h2>
            <p className="text-warm-600 dark:text-warm-400 text-sm mb-4">
              List your sales on FindA.Sale and reach local shoppers every weekend.
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
  const FALLBACK_SLUGS = [
    'grand-rapids-mi', 'chicago-il', 'detroit-mi', 'phoenix-az', 'dallas-tx',
    'los-angeles-ca', 'new-york-ny', 'houston-tx', 'san-antonio-tx', 'philadelphia-pa',
  ];

  let slugs: string[] = FALLBACK_SLUGS;

  try {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';
    const res = await fetch(`${apiBaseUrl}/sales/city-slugs`);
    if (res.ok) {
      const data = await res.json();
      const fetched: Array<{ slug: string; count: number }> =
        Array.isArray(data) ? data : data.slugs ?? [];
      if (fetched.length > 0) {
        // Pre-build top 30 by count
        slugs = fetched.slice(0, 25).map((s) => (typeof s === 'string' ? s : s.slug));
      }
    }
  } catch (err) {
    console.error('[this-weekend/[city]] getStaticPaths fetch error — using fallback:', err);
  }

  return {
    paths: slugs.map((slug) => ({ params: { city: slug } })),
    fallback: 'blocking',
  };
};

export const getStaticProps: GetStaticProps<ThisWeekendPageProps> = async ({ params }) => {
  const citySlug = params?.city as string;

  // Parse display name + state from slug
  const parts = citySlug.split('-');
  const stateCode = parts[parts.length - 1].toUpperCase();
  const cityName = parts
    .slice(0, -1)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  // Compute this weekend at build time
  const { start: friday, end: sunday } = getThisWeekendRange();

  let allSales: SaleListing[] = [];

  try {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';
    // Try date-filtered fetch first; fall back to all sales if endpoint doesn't support it
    const url = `${apiBaseUrl}/sales/by-city/${encodeURIComponent(citySlug)}?startAfter=${friday.toISOString()}&endBefore=${sunday.toISOString()}`;
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });

    if (res.ok) {
      const data = await res.json();
      allSales = data.sales ?? [];
    } else {
      // Endpoint may not support date params — fetch all and filter in getStaticProps
      const fallbackRes = await fetch(
        `${apiBaseUrl}/sales/by-city/${encodeURIComponent(citySlug)}`,
        { headers: { 'Content-Type': 'application/json' } }
      );
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        allSales = fallbackData.sales ?? [];
      }
    }
  } catch (err) {
    console.error(`[this-weekend/[city]] fetch error for ${citySlug}:`, err);
  }

  // Filter to sales that overlap the Friday–Sunday window
  const fridayMs = friday.getTime();
  const sundayMs = sunday.getTime();
  const weekendSales = allSales.filter((sale) => {
    const saleStart = new Date(sale.startDate).getTime();
    const saleEnd = new Date(sale.endDate).getTime();
    // Overlap: sale starts before Sunday ends AND sale ends after Friday starts
    return saleStart <= sundayMs && saleEnd >= fridayMs;
  });

  return {
    props: {
      citySlug,
      cityName,
      cityState: stateCode,
      sales: weekendSales,
      totalCount: weekendSales.length,
      weekendStart: friday.toISOString(),
      weekendEnd: sunday.toISOString(),
    },
    // ISR: 4 hours Thu–Sat (peak browsing days), twice/day Sun–Wed (off-peak)
    revalidate: new Date().getDay() >= 4 ? 14400 : 43200,
  };
};
