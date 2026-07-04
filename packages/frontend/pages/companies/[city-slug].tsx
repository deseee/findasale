/**
 * Estate Sale and Liquidation Company Directory (hire intent)
 * URL: /companies/denver-co
 *      /companies/atlanta-ga
 *
 * #567: GSC shows "estate sale companies [city]" and "estate liquidation
 * companies [city]" queries landing on the wrong shopper pages at position
 * 35-50. This directory targets that hire-intent cluster directly.
 *
 * Data: GET /companies/by-city/[slug] (backend companyDirectoryController).
 * Companies are organizers with PUBLISHED estate sales or auctions in the
 * city. Pages render only when 3 or more companies qualify; thinner cities
 * return notFound (with revalidate, so they appear once data exists).
 * Public data only: name, sale activity, website. No emails or phones.
 */

import { GetStaticProps, GetStaticPaths } from 'next';
import Head from 'next/head';
import Link from 'next/link';

const MIN_COMPANIES_FOR_PAGE = 3;

// Prerender list: strongest hire-intent markets from the production data
// (top cities by qualifying ESTATE/AUCTION organizer count, checked 2026-07-03).
// All other qualifying slugs render on demand via blocking ISR.
const TOP_COMPANY_CITIES = [
  'atlanta-ga',
  'san-antonio-tx',
  'chicago-il',
  'dallas-tx',
  'houston-tx',
  'fort-worth-tx',
  'saint-louis-mo',
  'nashville-tn',
  'denver-co',
  'wichita-ks',
  'seattle-wa',
  'austin-tx',
  'san-diego-ca',
  'minneapolis-mn',
  'baton-rouge-la',
  'miami-fl',
  'rochester-ny',
  'new-york-ny',
  'knoxville-tn',
  'kansas-city-mo',
];

const SALE_TYPE_LABELS: Record<string, string> = {
  ESTATE: 'Estate Sales',
  AUCTION: 'Auctions',
  YARD: 'Yard Sales',
  FLEA_MARKET: 'Flea Markets',
};

const CANADIAN_PROVINCES = new Set([
  'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT',
]);

interface CompanyListing {
  id: string;
  businessName: string;
  website: string | null;
  avgRating: number | null;
  totalReviews: number;
  saleTypes: string[];
  totalSaleCount: number;
  activeSaleCount: number;
}

interface CompaniesCityPageProps {
  citySlug: string;
  cityName: string;
  cityState: string;
  companies: CompanyListing[];
  totalCount: number;
}

export default function CompaniesCityPage({
  citySlug,
  cityName,
  cityState,
  companies,
  totalCount,
}: CompaniesCityPageProps) {
  const title = `${totalCount} Estate Sale & Liquidation Companies in ${cityName}, ${cityState} | FindA.Sale`;
  const description = `Compare ${totalCount} estate sale and liquidation companies serving ${cityName}, ${cityState}. See each company's listed sales, auctions, and recent activity before you hire.`;
  const canonicalUrl = `https://finda.sale/companies/${citySlug}`;
  const addressCountry = CANADIAN_PROVINCES.has(cityState) ? 'CA' : 'US';

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://finda.sale' },
      { '@type': 'ListItem', position: 2, name: 'Cities', item: 'https://finda.sale/cities' },
      {
        '@type': 'ListItem',
        position: 3,
        name: `Estate Sale Companies in ${cityName}, ${cityState}`,
        item: canonicalUrl,
      },
    ],
  };

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Estate Sale & Liquidation Companies in ${cityName}, ${cityState}`,
    description,
    numberOfItems: companies.length,
    itemListElement: companies.slice(0, 25).map((company, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      item: {
        '@type': 'LocalBusiness',
        name: company.businessName,
        url: `https://finda.sale/organizers/${company.id}`,
        address: {
          '@type': 'PostalAddress',
          addressLocality: cityName,
          addressRegion: cityState,
          addressCountry,
        },
        ...(company.website ? { sameAs: company.website } : {}),
        ...(company.avgRating && company.totalReviews > 0
          ? {
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: company.avgRating.toFixed(1),
                reviewCount: company.totalReviews,
              },
            }
          : {}),
      },
    })),
  };

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta
          name="keywords"
          content={`estate sale companies ${cityName}, estate liquidation companies ${cityName} ${cityState}, estate liquidators ${cityName}, auction companies ${cityName}, estate sale services ${cityName}`}
        />
        <link rel="canonical" href={canonicalUrl} key="canonical" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
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
            <li>
              <Link href="/" className="hover:text-amber-600">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href="/cities" className="hover:text-amber-600">
                Cities
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="text-warm-800 dark:text-warm-200 font-medium">
              Companies in {cityName}, {cityState}
            </li>
          </ol>
        </nav>

        {/* Hero */}
        <div className="max-w-5xl mx-auto px-4 pt-6 pb-4">
          <h1 className="text-3xl md:text-4xl font-bold text-warm-900 dark:text-warm-100">
            Estate Sale & Liquidation Companies in {cityName}, {cityState}
          </h1>
          <p className="mt-3 text-warm-600 dark:text-warm-400 leading-relaxed max-w-3xl">
            Hiring help to run an estate sale, downsizing, or liquidation in {cityName}? These{' '}
            {totalCount} companies run estate sales and auctions in the {cityName} area and list
            their sales on FindA.Sale. Review each company's recent activity, visit their sale
            listings, and reach out through their website or profile before you hire.
          </p>
        </div>

        {/* Related city links */}
        <div className="max-w-5xl mx-auto px-4 pb-4">
          <div className="flex flex-wrap gap-2">
            <span className="px-3 py-1.5 rounded-full text-sm border bg-amber-500 border-amber-500 text-white font-medium">
              Companies
            </span>
            <Link
              href={`/estate-sales/${citySlug}`}
              className="px-3 py-1.5 rounded-full text-sm border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-warm-300 hover:border-amber-500 hover:text-amber-600 transition-colors"
            >
              Estate Sales in {cityName}
            </Link>
            <Link
              href={`/city/${citySlug}`}
              className="px-3 py-1.5 rounded-full text-sm border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-warm-300 hover:border-amber-500 hover:text-amber-600 transition-colors"
            >
              All Sales in {cityName}
            </Link>
            <Link
              href={`/city/${citySlug}/auctions`}
              className="px-3 py-1.5 rounded-full text-sm border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-warm-300 hover:border-amber-500 hover:text-amber-600 transition-colors"
            >
              Auctions in {cityName}
            </Link>
          </div>
        </div>

        {/* Company cards */}
        <div className="max-w-5xl mx-auto px-4 pb-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            {companies.map((company) => (
              <div
                key={company.id}
                className="card p-5 flex flex-col gap-3 hover:shadow-lg transition-shadow"
              >
                <div>
                  <h2 className="font-semibold text-warm-900 dark:text-warm-100 text-base leading-tight">
                    <Link
                      href={`/organizers/${company.id}`}
                      className="hover:text-amber-600 transition-colors"
                    >
                      {company.businessName}
                    </Link>
                  </h2>
                  {company.avgRating && company.totalReviews > 0 && (
                    <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                      {company.avgRating.toFixed(1)} / 5 ({company.totalReviews} review
                      {company.totalReviews !== 1 ? 's' : ''})
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {company.saleTypes.map((type) => (
                    <span
                      key={type}
                      className="text-xs px-2 py-0.5 rounded-full bg-warm-100 dark:bg-slate-800 text-warm-600 dark:text-warm-300 border border-warm-200 dark:border-slate-700"
                    >
                      {SALE_TYPE_LABELS[type] ?? type}
                    </span>
                  ))}
                </div>

                <p className="text-sm text-warm-600 dark:text-warm-400">
                  {company.totalSaleCount} sale{company.totalSaleCount !== 1 ? 's' : ''} listed in{' '}
                  {cityName}
                  {company.activeSaleCount > 0 && (
                    <span className="text-green-700 dark:text-green-400 font-medium">
                      {' '}
                      ({company.activeSaleCount} active now)
                    </span>
                  )}
                </p>

                <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
                  <Link
                    href={`/organizers/${company.id}`}
                    className="text-sm font-medium text-amber-600 hover:text-amber-700"
                  >
                    View profile & sales
                  </Link>
                  {company.website && (
                    <a
                      href={company.website}
                      rel="nofollow noopener noreferrer"
                      target="_blank"
                      className="text-sm text-warm-500 dark:text-warm-400 hover:text-amber-600"
                    >
                      Website
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* How to choose block */}
          <div className="mt-12 p-6 bg-warm-50 dark:bg-slate-800 rounded-xl border border-warm-200 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-3">
              How to Choose an Estate Sale Company in {cityName}
            </h2>
            <p className="text-warm-600 dark:text-warm-400 text-sm leading-relaxed mb-3">
              Start with each company's recent sales. A company that runs regular, well-attended
              sales in {cityName} usually has the local shopper following that determines how much
              your items actually bring. Compare commission rates (most companies charge 30 to 50
              percent), ask how they price and photograph items, and confirm what happens to
              unsold items after the sale.
            </p>
            <p className="text-warm-600 dark:text-warm-400 text-sm leading-relaxed">
              Every company listed here has published sales on FindA.Sale, so you can browse the
              actual sales they have run in the {cityName} area before making a call.
            </p>
          </div>

          {/* Organizer CTA */}
          <div className="mt-8 p-6 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-center border border-amber-200 dark:border-amber-800">
            <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-2">
              Run sales in {cityName}? List with FindA.Sale
            </h2>
            <p className="text-warm-600 dark:text-warm-400 text-sm mb-4">
              Get your company in front of families searching for estate sale help in {cityName}.
              Publish your sales, build your profile, and reach local shoppers.
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
  let slugs: string[] = TOP_COMPANY_CITIES;

  try {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';
    const res = await fetch(`${apiBaseUrl}/companies/city-slugs`);
    if (res.ok) {
      const data = await res.json();
      const raw: any[] = data.slugs ?? [];
      const fetched: string[] = raw.map((item) => item?.slug).filter(Boolean);
      if (fetched.length > 0) {
        const merged = Array.from(new Set([...TOP_COMPANY_CITIES, ...fetched]));
        slugs = merged.slice(0, 25);
      }
    }
  } catch (err) {
    console.error('[companies/[city-slug]] getStaticPaths fetch error, using fallback:', err);
  }

  return {
    paths: slugs.map((slug) => ({ params: { 'city-slug': slug } })),
    fallback: 'blocking',
  };
};

export const getStaticProps: GetStaticProps<CompaniesCityPageProps> = async ({ params }) => {
  const citySlug = params?.['city-slug'] as string;

  try {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';
    const res = await fetch(`${apiBaseUrl}/companies/by-city/${encodeURIComponent(citySlug)}`, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      return { notFound: true, revalidate: 86400 };
    }

    const data = await res.json();
    const companies: CompanyListing[] = data.companies ?? [];

    // Thin-page gate: only render cities with 3 or more qualifying companies.
    // notFound WITH revalidate, so a city that gains companies appears within a day.
    if (companies.length < MIN_COMPANIES_FOR_PAGE) {
      return { notFound: true, revalidate: 86400 };
    }

    return {
      props: {
        citySlug,
        cityName: data.city,
        cityState: data.state,
        companies,
        totalCount: companies.length,
      },
      revalidate: 86400, // ISR: 24 hours
    };
  } catch (err) {
    console.error(`[companies/[city-slug]] getStaticProps fetch error for ${citySlug}:`, err);
    return { notFound: true, revalidate: 3600 };
  }
};
