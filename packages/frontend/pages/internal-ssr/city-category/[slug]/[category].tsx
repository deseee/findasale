/**
 * City + Category SEO Landing Page — SSR long-tail sibling (Option B)
 * URL: /city/:slug/:category (served here only for cities NOT in the curated
 *      ISR top-N list — see middleware.ts's CURATED_CITY_SLUGS).
 *
 * ADR: claude_docs/feature-notes/adr-vercel-isr-overage-2026-07-19.md (Option B).
 * Mirrors pages/neighborhoods/[slug].tsx's SSR + Cache-Control pattern.
 *
 * KEEP IN SYNC with pages/city/[slug]/[category].tsx (the curated ISR
 * variant) -- the component/markup below is intentionally a duplicate of
 * that file's JSX so a bug here can never affect the higher-traffic
 * curated cities, and vice versa. If you change the rendered UI in one,
 * change it in both.
 *
 * Reached ONLY via middleware.ts's NextResponse.rewrite() -- the public URL
 * a browser/crawler sees is always /city/:slug/:category, never this file's
 * own path, so this does not create a duplicate-content or duplicate-URL
 * issue. Middleware explicitly excludes non-VALID_CATEGORIES values (e.g.
 * legacy 'consignment') from this rewrite so the existing next.config.js
 * 301 redirects for those still fire normally.
 */

import { GetServerSideProps } from 'next';
import { jsonLdSafe } from '@/lib/jsonLdSafe';
import Head from 'next/head';
import Link from 'next/link';
import { computeSaleStats, buildLiveDataFaqs, CitySaleStats } from '@/lib/seo/cityStats';
import { buildFaqJsonLd } from '@/lib/seo/cityData';
import CityLiveStats from '@/components/CityLiveStats';

// Category slug → display label + saleType enum
const CATEGORY_META: Record<string, { label: string; plural: string; saleType: string }> = {
  'estate-sales':  { label: 'Estate Sale',  plural: 'Estate Sales',  saleType: 'ESTATE'      },
  'yard-sales':    { label: 'Yard Sale',     plural: 'Yard Sales',    saleType: 'YARD'        },
  'auctions':      { label: 'Auction',       plural: 'Auctions',      saleType: 'AUCTION'     },
  'flea-markets':  { label: 'Flea Market',   plural: 'Flea Markets',  saleType: 'FLEA_MARKET' },
  'resale':        { label: 'Resale',         plural: 'Resale',        saleType: 'RETAIL'      },
};

export const VALID_CATEGORIES = Object.keys(CATEGORY_META);

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
  isOngoing?: boolean; // Permanent-storefront model — always-live directory listing, no real end date
  organizer: { id: string; businessName: string } | null;
}

interface CityCategoryPageProps {
  citySlug: string;
  categorySlug: string;
  cityName: string;
  cityState: string;
  categoryLabel: string;
  categoryPlural: string;
  sales: SaleListing[];
  totalCount: number;
  allCategories: string[];
  activeByType: Record<string, number>;
  stats: CitySaleStats;
}

export default function CityCategoryPage({
  citySlug,
  categorySlug,
  cityName,
  cityState,
  categoryLabel,
  categoryPlural,
  sales,
  totalCount,
  allCategories,
  activeByType,
  stats,
}: CityCategoryPageProps) {
  const title = `${categoryPlural} in ${cityName}, ${cityState} | FindA.Sale`;
  const description = `Browse ${totalCount} ${categoryPlural.toLowerCase()} in ${cityName}, ${cityState}. Find furniture, antiques, collectibles, and more on FindA.Sale.`;
  const canonicalUrl = `https://finda.sale/city/${citySlug}/${categorySlug}`;

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${categoryPlural} in ${cityName}, ${cityState}`,
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
      { '@type': 'ListItem', position: 1, name: 'Home',       item: 'https://finda.sale' },
      { '@type': 'ListItem', position: 2, name: 'Cities',     item: 'https://finda.sale/cities' },
      { '@type': 'ListItem', position: 3, name: `${cityName}, ${cityState}`, item: `https://finda.sale/city/${citySlug}` },
      { '@type': 'ListItem', position: 4, name: categoryPlural, item: canonicalUrl },
    ],
  };

  // Live-data stats and FAQs, computed from real listings at build time.
  // Scoped to this category within the city — currentTypeKey is the
  // sale-type enum for this category, so the breakdown/FAQs cross-link
  // to the OTHER sale types active in this city.
  const currentTypeKey = CATEGORY_META[categorySlug]?.saleType ?? '';
  const liveFaqs = buildLiveDataFaqs({
    cityName,
    stateCode: cityState,
    typeSingular: categoryLabel.toLowerCase(),
    typePlural: categoryPlural.toLowerCase(),
    currentTypeKey,
    stats,
    activeByType,
  });
  const faqJsonLd = buildFaqJsonLd(liveFaqs);

  // S1071 crawl-budget policy: this exact page is only emitted in the sitemap when
  // activeByType[currentTypeKey] >= 3 (see server-sitemap.xml.tsx). Thin/gated
  // city+category combos below that threshold must not tell crawlers to index them --
  // otherwise the sitemap gate is cosmetic (internal links/direct nav still reach them).
  const activeCountForCategory = activeByType[currentTypeKey] ?? 0;
  const isGatedThin = activeCountForCategory < 3;

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="keywords" content={`${categoryPlural.toLowerCase()} ${cityName} ${cityState}, antiques, furniture, vintage, collectibles`} />
        <link rel="canonical" href={canonicalUrl} key="canonical" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="robots" content={isGatedThin ? 'noindex, follow' : 'index, follow'} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdSafe(itemListJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdSafe(breadcrumbJsonLd) }}
        />
        {liveFaqs.length > 0 && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: jsonLdSafe(faqJsonLd) }}
          />
        )}
      </Head>

      <main className="min-h-screen bg-white dark:bg-slate-900">
        {/* Breadcrumb */}
        <nav className="max-w-5xl mx-auto px-4 pt-4 pb-2 text-sm text-warm-500 dark:text-warm-400">
          <ol className="flex flex-wrap items-center gap-1">
            <li><Link href="/" className="hover:text-amber-600">Home</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link href="/cities" className="hover:text-amber-600">Cities</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link href={`/city/${citySlug}`} className="hover:text-amber-600">{cityName}, {cityState}</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-warm-800 dark:text-warm-200 font-medium">{categoryPlural}</li>
          </ol>
        </nav>

        {/* Hero */}
        <div className="max-w-5xl mx-auto px-4 pt-6 pb-4">
          <h1 className="text-3xl md:text-4xl font-bold text-warm-900 dark:text-warm-100">
            {categoryPlural} in {cityName}, {cityState}
          </h1>
          <p className="mt-2 text-warm-600 dark:text-warm-400">
            {totalCount > 0
              ? `${totalCount} ${categoryLabel.toLowerCase()}${totalCount !== 1 ? 's' : ''} listed`
              : `No ${categoryPlural.toLowerCase()} currently listed`}
          </p>
        </div>

        {/* Live inventory stats, real counts from build-time data */}
        <CityLiveStats
          citySlug={citySlug}
          cityName={cityName}
          typePluralLabel={categoryPlural.toLowerCase()}
          currentTypeKey={currentTypeKey}
          stats={stats}
          activeByType={activeByType}
        />

        {/* Category filter tabs */}
        {allCategories.length > 1 && (
          <div className="max-w-5xl mx-auto px-4 pb-4">
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/city/${citySlug}`}
                className="px-3 py-1.5 rounded-full text-sm border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-warm-300 hover:border-amber-500 hover:text-amber-600 transition-colors"
              >
                All sales
              </Link>
              {allCategories.map((cat) => {
                const meta = CATEGORY_META[
                  Object.keys(CATEGORY_META).find(
                    (k) => CATEGORY_META[k].saleType === cat
                  ) ?? ''
                ];
                if (!meta) return null;
                const catSlug = Object.keys(CATEGORY_META).find(
                  (k) => CATEGORY_META[k].saleType === cat
                )!;
                const isActive = catSlug === categorySlug;
                return (
                  <Link
                    key={catSlug}
                    href={`/city/${citySlug}/${catSlug}`}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      isActive
                        ? 'bg-amber-500 border-amber-500 text-white font-medium'
                        : 'border-warm-300 dark:border-gray-600 text-warm-700 dark:text-warm-300 hover:border-amber-500 hover:text-amber-600'
                    }`}
                    aria-current={isActive ? 'page' : undefined}
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
                No {categoryPlural.toLowerCase()} currently listed in {cityName}.
              </p>
              <Link
                href={`/city/${citySlug}`}
                className="text-amber-600 hover:text-amber-700 font-medium"
              >
                View all sales in {cityName} →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
              {sales.map((sale) => {
                const start = new Date(sale.startDate);
                const end = new Date(sale.endDate);
                const now = new Date();
                // Bug fix (566-row TODAY/Live badge bug, S1130 diagnostic): permanent
                // storefronts (isOngoing) are always-live directory listings — never
                // gate their Live/Ended badge off the frozen scrape-time date window.
                const isActive = sale.isOngoing || (start <= now && now <= end);
                const isEnded = !sale.isOngoing && now > end;

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
                        {sale.isOngoing ? 'Always open' : (
                          <>
                            {start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                            {' – '}
                            {end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
                          </>
                        )}
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

          {/* FAQ section — answered from live listing data */}
          {liveFaqs.length > 0 && (
            <div className="mt-6">
              <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-4">
                Frequently Asked Questions About {categoryPlural} in {cityName}
              </h2>
              <div className="space-y-4">
                {liveFaqs.map((faq, i) => (
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
          )}

          {/* Claim CTA */}
          <div className="mt-12 p-6 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-center border border-amber-200 dark:border-amber-800">
            <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-2">
              Are you an organizer in {cityName}?
            </h2>
            <p className="text-warm-600 dark:text-warm-400 text-sm mb-4">
              List your {categoryLabel.toLowerCase()}s on FindA.Sale and reach local shoppers.
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

export const getServerSideProps: GetServerSideProps<CityCategoryPageProps> = async ({ params, res }) => {
  const citySlug = params?.slug as string;
  const categorySlug = params?.category as string;

  // Validate category
  if (!VALID_CATEGORIES.includes(categorySlug)) {
    return { notFound: true };
  }

  const meta = CATEGORY_META[categorySlug];

  let sales: SaleListing[] = [];
  let totalCount = 0;
  let allCategories: string[] = [];
  let activeByType: Record<string, number> = {};

  try {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';
    const apiRes = await fetch(
      `${apiBaseUrl}/sales/by-city/${encodeURIComponent(citySlug)}?category=${categorySlug}`,
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (apiRes.ok) {
      const data = await apiRes.json();
      sales = data.sales ?? [];
      totalCount = data.totalCount ?? 0;
      allCategories = data.categories ?? [];
      activeByType = data.activeByType ?? {};
    }
  } catch (err) {
    console.error(`[internal-ssr/city-category] fetch error for ${citySlug}/${categorySlug}:`, err);
  }

  // Parse display city name + state from slug
  const parts = citySlug.split('-');
  const stateCode = parts[parts.length - 1].toUpperCase();
  const cityName = parts
    .slice(0, -1)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const stats = computeSaleStats(sales);

  // Long-tail city (not in the curated ISR top-N -- see middleware.ts). Served
  // via SSR + CDN Cache-Control instead of ISR (ADR-vercel-isr-overage-2026-07-19
  // Option B). 24h freshness window matches the ISR variant's revalidate: 86400.
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');

  return {
    props: {
      citySlug,
      categorySlug,
      cityName,
      cityState: stateCode,
      categoryLabel: meta.label,
      categoryPlural: meta.plural,
      sales,
      totalCount,
      allCategories,
      activeByType,
      stats,
    },
  };
};
