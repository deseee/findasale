/**
 * Cities Index Page — ISR SEO Landing Page
 * Route: /cities
 * Lists all cities where FindA.Sale has sales, grouped by state.
 * Revalidates every hour via ISR.
 */

import { GetStaticProps } from 'next';
import { jsonLdSafe } from '@/lib/jsonLdSafe';
import Head from 'next/head';
import Link from 'next/link';

// US state code → full state name
const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'Washington D.C.',
};

interface CityEntry {
  name: string;    // "Grand Rapids"
  slug: string;    // "grand-rapids-mi"
  count: number;
}

interface StateGroup {
  state: string;      // "Michigan"
  stateCode: string;  // "MI"
  cities: CityEntry[];
}

interface CitiesPageProps {
  stateGroups: StateGroup[];
  totalCities: number;
}

export default function CitiesPage({ stateGroups, totalCities }: CitiesPageProps) {
  const title = 'Browse Sales by City | FindA.Sale';
  const description =
    'Find estate sales, yard sales, auctions and more near you. Browse sales in cities across the US on FindA.Sale.';
  const canonicalUrl = 'https://finda.sale/cities';

  const collectionPageJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description,
    url: canonicalUrl,
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home',   item: 'https://finda.sale' },
      { '@type': 'ListItem', position: 2, name: 'Cities', item: canonicalUrl },
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
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdSafe(collectionPageJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdSafe(breadcrumbJsonLd) }}
        />
      </Head>

      <main className="min-h-screen bg-white dark:bg-slate-900">
        {/* Breadcrumb */}
        <nav className="max-w-5xl mx-auto px-4 pt-4 pb-2 text-sm text-warm-500 dark:text-warm-400">
          <ol className="flex flex-wrap items-center gap-1">
            <li><Link href="/" className="hover:text-amber-600">Home</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-warm-800 dark:text-warm-200 font-medium">Cities</li>
          </ol>
        </nav>

        {/* Hero */}
        <div className="max-w-5xl mx-auto px-4 pt-6 pb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-warm-900 dark:text-warm-100">
            Browse Sales by City
          </h1>
          <p className="mt-2 text-warm-600 dark:text-warm-400 text-lg">
            Find sales near you across {totalCities} {totalCities === 1 ? 'city' : 'cities'}
          </p>
        </div>

        {/* State-grouped city list */}
        <div className="max-w-5xl mx-auto px-4 pb-16 space-y-10">
          {stateGroups.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-warm-500 dark:text-warm-400 text-lg">No cities with sales yet.</p>
              <Link href="/" className="mt-4 inline-block text-amber-600 hover:text-amber-700 font-medium">
                ← Back to home
              </Link>
            </div>
          ) : (
            stateGroups.map((group) => (
              <section key={group.stateCode}>
                <h2 className="text-xl font-semibold text-warm-900 dark:text-warm-100 mb-3 pb-2 border-b border-warm-200 dark:border-gray-700">
                  {group.state}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {group.cities.map((city) => (
                    <Link
                      key={city.slug}
                      href={`/city/${city.slug}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-warm-300 hover:border-amber-500 hover:text-amber-600 dark:hover:border-amber-500 dark:hover:text-amber-400 transition-colors bg-white dark:bg-slate-800"
                    >
                      {city.name}
                      <span className="text-warm-400 dark:text-gray-500 text-xs">({city.count})</span>
                    </Link>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>

        {/* Back link */}
        <div className="max-w-5xl mx-auto px-4 pb-12 text-center">
          <Link href="/" className="text-amber-600 hover:text-amber-700 font-medium text-sm">
            ← Back to home
          </Link>
        </div>
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps<CitiesPageProps> = async () => {
  let stateGroups: StateGroup[] = [];
  let totalCities = 0;

  try {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';
    const res = await fetch(`${apiBaseUrl}/sales/city-slugs`, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (res.ok) {
      const data = await res.json();
      const rawSlugs: Array<{ slug: string; count: number }> =
        Array.isArray(data) ? data : data.slugs ?? [];

      // Parse each slug → city name + state code
      const parsed = rawSlugs.map(({ slug, count }) => {
        const parts = slug.split('-');
        const stateCode = parts[parts.length - 1].toUpperCase();
        const cityName = parts
          .slice(0, -1)
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
        return { name: cityName, slug, count, stateCode };
      });

      totalCities = parsed.length;

      // Group by state
      const byState: Record<string, CityEntry[]> = {};
      for (const city of parsed) {
        if (!byState[city.stateCode]) byState[city.stateCode] = [];
        byState[city.stateCode].push({ name: city.name, slug: city.slug, count: city.count });
      }

      // Sort cities within each state by count descending
      for (const code of Object.keys(byState)) {
        byState[code].sort((a, b) => b.count - a.count);
      }

      // Build state groups sorted alphabetically by state name
      stateGroups = Object.keys(byState)
        .sort((a, b) => {
          const nameA = STATE_NAMES[a] ?? a;
          const nameB = STATE_NAMES[b] ?? b;
          return nameA.localeCompare(nameB);
        })
        .map((code) => ({
          state: STATE_NAMES[code] ?? code,
          stateCode: code,
          cities: byState[code],
        }));
    }
  } catch (err) {
    console.error('[cities/index] getStaticProps fetch error:', err);
  }

  return {
    props: { stateGroups, totalCities },
    revalidate: 21600, // ISR: 6h (widened from 1h 2026-07-27 -- Fluid Active CPU reduction; this page only shows city names + aggregate sale counts by state, not individual sale/item data, so a few hours of staleness on a count is imperceptible to users)
  };
};
