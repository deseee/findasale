/**
 * Auctions City SEO Landing Page
 * URL: /auctions/denver-co
 *      /auctions/chicago-il
 *      /auctions/grand-rapids-mi
 *
 * Dedicated landing page for the "auctions in [city]" GSC cluster.
 * Uses getStaticProps (ISR) — renders server-side for SEO.
 *
 * SEO framework: @/lib/seo/cityData.ts
 * All city content, FAQ data, title/description builders, and nearby-city
 * links are managed there.
 *
 * Modeled after /yard-sales/[city-slug].tsx — same ISR pattern, same components,
 * auction-specific copy and FAQ content.
 */

import { GetStaticProps, GetStaticPaths } from 'next';
import { jsonLdSafe } from '@/lib/jsonLdSafe';
import Head from 'next/head';
import Link from 'next/link';
import {
  CityMeta,
  FaqItem,
  getCityMeta,
  getAuctionMeta,
  getAuctionFaqs,
  buildFaqJsonLd,
  buildSeoTitle,
  buildSeoDescription,
  getNearbyLinks,
} from '@/lib/seo/cityData';
import { computeSaleStats, buildLiveDataFaqs, CitySaleStats } from '@/lib/seo/cityStats';
import CityLiveStats from '@/components/CityLiveStats';

// ---------------------------------------------------------------------------
// Prerender list — build-time static generation
// Add cities with known GSC impressions here. All other slugs use blocking ISR.
// ---------------------------------------------------------------------------
const TOP_AUCTION_CITIES = [
  // Core US markets (top 15)
  'denver-co',
  'grand-rapids-mi',
  'chicago-il',
  'phoenix-az',
  'dallas-tx',
  'los-angeles-ca',
  'new-york-ny',
  'houston-tx',
  'san-antonio-tx',
  'philadelphia-pa',
  'detroit-mi',
  'portland-or',
  'seattle-wa',
  'atlanta-ga',
  'minneapolis-mn',
  // GSC-confirmed markets (top 10 by impressions)
  'boston-ma',
  'nashville-tn',
  'charlotte-nc',
  'austin-tx',
  'columbus-oh',
  'indianapolis-in',
  'kansas-city-mo',
  'st-louis-mo',
  'miami-fl',
  'tampa-fl',
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

interface AuctionsCityPageProps {
  citySlug: string;
  cityName: string;
  cityState: string;
  cityMeta: CityMeta;
  auctionAbout: { knownFor: string; tip: string };
  faqs: FaqItem[];
  sales: SaleListing[];
  totalCount: number;
  activeByType: Record<string, number>;
  stats: CitySaleStats;
}

export default function AuctionsCityPage({
  citySlug,
  cityName,
  cityState,
  cityMeta,
  auctionAbout,
  faqs,
  sales,
  totalCount,
  activeByType,
  stats,
}: AuctionsCityPageProps) {
  const title = buildSeoTitle(cityName, cityState, totalCount, 'Auctions');
  const description = buildSeoDescription(cityName, cityState, totalCount, 'auctions');
  const canonicalUrl = `https://finda.sale/auctions/${citySlug}`;
  const nearbyLinks = getNearbyLinks(cityMeta);

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://finda.sale' },
      { '@type': 'ListItem', position: 2, name: 'Auctions', item: 'https://finda.sale/city/auctions' },
      {
        '@type': 'ListItem',
        position: 3,
        name: `Auctions in ${cityName}, ${cityState}`,
        item: canonicalUrl,
      },
    ],
  };

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Auctions in ${cityName}, ${cityState}`,
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

  // Live-data stats and FAQs, computed from real listings at build time
  const liveFaqs = buildLiveDataFaqs({
    cityName,
    stateCode: cityState,
    typeSingular: 'auction',
    typePlural: 'auctions',
    currentTypeKey: 'AUCTION',
    stats,
    activeByType,
  });
  const allFaqs = [...liveFaqs, ...faqs];
  const faqJsonLd = buildFaqJsonLd(allFaqs);

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta
          name="keywords"
          content={`auctions ${cityName} ${cityState}, estate auctions ${cityName}, ${cityName} auctions, auction houses ${cityName}, online auctions ${cityName}`}
        />
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
          dangerouslySetInnerHTML={{ __html: jsonLdSafe(breadcrumbJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdSafe(itemListJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdSafe(faqJsonLd) }}
        />
      </Head>

      <main className="min-h-screen bg-white dark:bg-slate-900">
        {/* Breadcrumb */}
        <nav className="max-w-5xl mx-auto px-4 pt-4 pb-2 text-sm text-warm-500 dark:text-warm-400">
          <ol className="flex flex-wrap items-center gap-1">
            <li>
              <Link href="/" className="hover:text-amber-600">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href={`/city/${citySlug}/auctions`} className="hover:text-amber-600">
                Auctions
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="text-warm-800 dark:text-warm-200 font-medium">
              {cityName}, {cityState}
            </li>
          </ol>
        </nav>

        {/* Hero */}
        <div className="max-w-5xl mx-auto px-4 pt-6 pb-4">
          <h1 className="text-3xl md:text-4xl font-bold text-warm-900 dark:text-warm-100">
            Auctions in {cityName}, {cityState}
          </h1>
          <p className="mt-2 text-warm-600 dark:text-warm-400">
            {totalCount > 0
              ? `${totalCount} auction${totalCount !== 1 ? 's' : ''} listed`
              : 'No auctions currently listed'}
            {' — '} updated daily
          </p>
        </div>

        {/* Live inventory stats, real counts from build-time data */}
        <CityLiveStats
          citySlug={citySlug}
          cityName={cityName}
          typePluralLabel="auctions"
          currentTypeKey="AUCTION"
          stats={stats}
          activeByType={activeByType}
        />

        {/* Related sale-type links */}
        <div className="max-w-5xl mx-auto px-4 pb-4">
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/city/${citySlug}/estate-sales`}
              className="px-3 py-1.5 rounded-full text-sm border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-warm-300 hover:border-amber-500 hover:text-amber-600 transition-colors"
            >
              Estate Sales
            </Link>
            <Link
              href={`/city/${citySlug}/yard-sales`}
              className="px-3 py-1.5 rounded-full text-sm border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-warm-300 hover:border-amber-500 hover:text-amber-600 transition-colors"
            >
              Yard Sales
            </Link>
            <span className="px-3 py-1.5 rounded-full text-sm border bg-amber-500 border-amber-500 text-white font-medium">
              Auctions
            </span>
            <Link
              href={`/city/${citySlug}/flea-markets`}
              className="px-3 py-1.5 rounded-full text-sm border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-warm-300 hover:border-amber-500 hover:text-amber-600 transition-colors"
            >
              Flea Markets
            </Link>
            <Link
              href={`/city/${citySlug}`}
              className="px-3 py-1.5 rounded-full text-sm border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-warm-300 hover:border-amber-500 hover:text-amber-600 transition-colors"
            >
              All Sales
            </Link>
          </div>
        </div>

        {/* Sale grid */}
        <div className="max-w-5xl mx-auto px-4 pb-16">
          {sales.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-warm-500 dark:text-warm-400 text-lg mb-2">
                No auctions currently listed in {cityName}.
              </p>
              <p className="text-warm-400 dark:text-warm-500 text-sm mb-6">
                New auctions are added daily — check back soon or browse nearby cities.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
                <Link href="/cities" className="text-amber-600 hover:text-amber-700 font-medium">
                  Browse other cities →
                </Link>
                <Link href="/map" className="text-amber-600 hover:text-amber-700 font-medium">
                  View sales map →
                </Link>
              </div>
              {/* Nearby city links on empty state */}
              {nearbyLinks.length > 0 && (
                <div className="max-w-sm mx-auto">
                  <p className="text-warm-500 dark:text-warm-400 text-sm font-medium mb-3">
                    Auctions near {cityName}:
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {nearbyLinks.map(({ slug, label }) => (
                      <Link
                        key={slug}
                        href={`/auctions/${slug}`}
                        className="px-3 py-1.5 rounded-full text-sm border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-warm-300 hover:border-amber-500 hover:text-amber-600 transition-colors"
                      >
                        {label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
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
                        {start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                        {' – '}
                        {end.toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          timeZone: 'UTC',
                        })}
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

          {/* City-specific content block */}
          <div className="mt-12 p-6 bg-warm-50 dark:bg-slate-800 rounded-xl border border-warm-200 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-3">
              About Auctions in {cityName}, {cityState}
            </h2>
            <p className="text-warm-600 dark:text-warm-400 text-sm leading-relaxed mb-3">
              {auctionAbout.knownFor}
            </p>
            <p className="text-warm-600 dark:text-warm-400 text-sm leading-relaxed">
              <span className="font-medium text-warm-700 dark:text-warm-300">Bidder tip: </span>
              {auctionAbout.tip}
            </p>
          </div>

          {/* Nearby cities */}
          {nearbyLinks.length > 0 && (
            <div className="mt-6 p-6 bg-warm-50 dark:bg-slate-800 rounded-xl border border-warm-200 dark:border-slate-700">
              <h2 className="text-base font-semibold text-warm-900 dark:text-warm-100 mb-3">
                Auctions Near {cityName}
              </h2>
              <div className="flex flex-wrap gap-2">
                {nearbyLinks.map(({ slug, label }) => (
                  <Link
                    key={slug}
                    href={`/auctions/${slug}`}
                    className="px-3 py-1.5 rounded-full text-sm border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-warm-300 hover:border-amber-500 hover:text-amber-600 transition-colors"
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* FAQ section */}
          <div className="mt-6">
            <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-4">
              Frequently Asked Questions About Auctions in {cityName}
            </h2>
            <div className="space-y-4">
              {allFaqs.map((faq, i) => (
                <details
                  key={i}
                  className="group border border-warm-200 dark:border-slate-700 rounded-xl overflow-hidden"
                >
                  <summary className="flex justify-between items-center p-4 cursor-pointer list-none bg-warm-50 dark:bg-slate-800 hover:bg-warm-100 dark:hover:bg-slate-700 transition-colors">
                    <span className="font-medium text-warm-900 dark:text-warm-100 text-sm pr-4">
                      {faq.question}
                    </span>
                    <span className="flex-shrink-0 text-warm-400 dark:text-warm-500 group-open:rotate-180 transition-transform text-lg leading-none">
                      ›
                    </span>
                  </summary>
                  <div className="p-4 pt-0 bg-white dark:bg-slate-900">
                    <p className="text-warm-600 dark:text-warm-400 text-sm leading-relaxed pt-3 border-t border-warm-100 dark:border-slate-700">
                      {faq.answer}
                    </p>
                  </div>
                </details>
              ))}
            </div>
          </div>

          {/* Organizer CTA */}
          <div className="mt-8 p-6 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-center border border-amber-200 dark:border-amber-800">
            <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-2">
              Running an auction in {cityName}?
            </h2>
            <p className="text-warm-600 dark:text-warm-400 text-sm mb-4">
              List your auction on FindA.Sale and reach local bidders looking for auctions right now.
            </p>
            <Link
              href="/register"
              className="inline-block bg-amber-500 hover:bg-amber-600 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm"
            >
              List your auction free
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  let slugs: string[] = TOP_AUCTION_CITIES;

  try {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';
    const res = await fetch(`${apiBaseUrl}/sales/city-slugs`);
    if (res.ok) {
      const data = await res.json();
      const raw: any[] = Array.isArray(data) ? data : data.slugs ?? [];
      const fetched: string[] = raw
        .map((item) => (typeof item === 'string' ? item : item.slug))
        .filter(Boolean);
      if (fetched.length > 0) {
        // Merge API slugs with our top list, deduplicated, capped at 200
        const merged = Array.from(new Set([...TOP_AUCTION_CITIES, ...fetched]));
        slugs = merged.slice(0, 25);
      }
    }
  } catch (err) {
    console.error('[auctions/[city-slug]] getStaticPaths fetch error — using fallback:', err);
  }

  return {
    paths: slugs.map((slug) => ({ params: { 'city-slug': slug } })),
    fallback: 'blocking',
  };
};

export const getStaticProps: GetStaticProps<AuctionsCityPageProps> = async ({ params }) => {
  const citySlug = params?.['city-slug'] as string;

  // Parse display name + state from slug (e.g. "denver-co" → "Denver", "CO")
  const parts = citySlug.split('-');
  const stateCode = parts[parts.length - 1].toUpperCase();
  const cityName = parts
    .slice(0, -1)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  // Load city-specific SEO content from the framework
  const cityMeta = getCityMeta(citySlug);
  const auctionAbout = getAuctionMeta(citySlug, cityName, stateCode);
  const faqs = getAuctionFaqs(cityName, stateCode);

  let sales: SaleListing[] = [];
  let totalCount = 0;
  let activeByType: Record<string, number> = {};

  try {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';
    const res = await fetch(
      `${apiBaseUrl}/sales/by-city/${encodeURIComponent(citySlug)}?category=auctions`,
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (res.ok) {
      const data = await res.json();
      sales = data.sales ?? [];
      totalCount = data.totalCount ?? 0;
    }
  } catch (err) {
    console.error(`[auctions/[city-slug]] getStaticProps fetch error for ${citySlug}:`, err);
  }

  // Per-type active counts for this city (drives the stats block and FAQ 3)
  try {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';
    const res = await fetch(`${apiBaseUrl}/sales/city-slugs`);
    if (res.ok) {
      const data = await res.json();
      const row = (data.slugs ?? []).find(
        (s: { slug: string; activeByType?: Record<string, number> }) => s.slug === citySlug
      );
      if (row && row.activeByType && typeof row.activeByType === 'object') {
        activeByType = row.activeByType;
      }
    }
  } catch (err) {
    console.error(`[auctions/[city-slug]] city-slugs fetch error for ${citySlug}:`, err);
  }

  const stats = computeSaleStats(sales);

  return {
    props: {
      citySlug,
      cityName,
      cityState: stateCode,
      cityMeta,
      auctionAbout,
      faqs,
      sales,
      totalCount,
      activeByType,
      stats,
    },
    revalidate: 86400, // ISR: 24 hours
  };
};
