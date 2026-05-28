/**
 * Monthly Trend Report Page — #442
 *
 * URL: /reports/2026-05  (year-month slug)
 *
 * Public SSR page. No auth required.
 * Fetches platform-wide trend data from GET /api/reports/:year/:month.
 * Includes Article JSON-LD for SEO.
 */

import Head from 'next/head';
import Link from 'next/link';
import { GetServerSideProps, GetServerSidePropsContext } from 'next';

// ---------------------------------------------------------------------------
// Types (local — no @findasale/shared import)
// ---------------------------------------------------------------------------

interface SaleTypeRow {
  saleType: string;
  count: number;
}

interface CityRow {
  city: string;
  state: string;
  count: number;
}

interface CategoryRow {
  category: string;
  count: number;
}

interface CrawlerRow {
  crawlerName: string;
  count: number;
}

interface MonthlyReportData {
  year: number;
  month: number;
  periodLabel: string;
  totalPublishedSales: number;
  totalActiveOrganizers: number;
  topSaleTypes: SaleTypeRow[];
  topCities: CityRow[];
  topCategories: CategoryRow[];
  totalCrawlerVisits: number;
  crawlerBreakdown: CrawlerRow[];
}

interface PageProps {
  report: MonthlyReportData | null;
  slug: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SALE_TYPE_LABELS: Record<string, string> = {
  ESTATE: 'Estate Sales',
  YARD: 'Yard / Garage Sales',
  AUCTION: 'Auctions',
  FLEA_MARKET: 'Flea Markets',
  RETAIL: 'Retail / Consignment',
};

function humanizeSaleType(raw: string): string {
  return SALE_TYPE_LABELS[raw] ?? raw;
}

function toCitySlug(city: string, state: string): string {
  return `${city}-${state}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MonthlyReportPage({ report, slug, error }: PageProps) {
  const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://finda.sale';
  const canonicalUrl = `${frontendUrl}/reports/${slug}`;

  if (!report) {
    const title = 'Report Not Found — FindA.Sale';
    return (
      <>
        <Head>
          <title>{title}</title>
          <meta name="robots" content="noindex" />
        </Head>
        <main
          style={{
            maxWidth: 680,
            margin: '80px auto',
            padding: '0 24px',
            fontFamily: 'system-ui, sans-serif',
            textAlign: 'center',
            color: '#374151',
          }}
        >
          <h1 style={{ fontSize: 24, marginBottom: 12 }}>Report not available</h1>
          <p style={{ color: '#6b7280' }}>
            {error || 'This report either does not exist yet or could not be loaded.'}
          </p>
          <Link href="/" style={{ color: '#1a6b4a', textDecoration: 'none', fontWeight: 600 }}>
            &larr; Back to FindA.Sale
          </Link>
        </main>
      </>
    );
  }

  const title = `${report.periodLabel} Secondary Sale Trends — FindA.Sale`;
  const description = `${report.totalPublishedSales} sales listed across ${report.totalActiveOrganizers} organizers in ${report.periodLabel}. See top sale types, active cities, and item categories on FindA.Sale.`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    url: canonicalUrl,
    datePublished: new Date(report.year, report.month, 1).toISOString(),
    publisher: {
      '@type': 'Organization',
      name: 'FindA.Sale',
      url: 'https://finda.sale',
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': canonicalUrl,
    },
  };

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonicalUrl} />
        {/* Open Graph */}
        <meta property="og:type" content="article" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:site_name" content="FindA.Sale" />
        {/* Twitter */}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        {/* JSON-LD */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </Head>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px 80px', fontFamily: 'system-ui, sans-serif', color: '#111827' }}>

        {/* Breadcrumb */}
        <nav style={{ marginBottom: 28, fontSize: 14, color: '#6b7280' }}>
          <Link href="/" style={{ color: '#1a6b4a', textDecoration: 'none' }}>FindA.Sale</Link>
          {' / '}
          <span>Monthly Reports</span>
          {' / '}
          <span>{report.periodLabel}</span>
        </nav>

        {/* Header */}
        <header style={{ marginBottom: 40 }}>
          <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#1a6b4a' }}>
            Secondary Sale Trends
          </p>
          <h1 style={{ margin: '0 0 16px', fontSize: 32, fontWeight: 800, lineHeight: 1.2 }}>
            {report.periodLabel} Report
          </h1>
          <p style={{ margin: 0, fontSize: 16, color: '#6b7280', lineHeight: 1.6 }}>
            Platform-wide activity across estate sales, yard sales, auctions, flea markets,
            and consignment shops listed on FindA.Sale.
          </p>
        </header>

        {/* Summary stats */}
        <section aria-labelledby="summary-heading" style={{ marginBottom: 48 }}>
          <h2 id="summary-heading" style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, borderBottom: '2px solid #e5e7eb', paddingBottom: 8 }}>
            At a Glance
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <StatCard label="Sales Listed" value={report.totalPublishedSales.toLocaleString()} />
            <StatCard label="Active Organizers" value={report.totalActiveOrganizers.toLocaleString()} />
            <StatCard
              label="Search Engine Views"
              value={report.totalCrawlerVisits > 0 ? report.totalCrawlerVisits.toLocaleString() : '—'}
              note={report.totalCrawlerVisits === 0 ? 'Crawler tracking initializing' : undefined}
            />
          </div>
        </section>

        {/* Top sale types */}
        {report.topSaleTypes.length > 0 && (
          <section aria-labelledby="sale-types-heading" style={{ marginBottom: 48 }}>
            <h2 id="sale-types-heading" style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, borderBottom: '2px solid #e5e7eb', paddingBottom: 8 }}>
              Sales by Type
            </h2>
            <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {report.topSaleTypes.map((row, i) => (
                <RankedRow
                  key={row.saleType}
                  rank={i + 1}
                  label={humanizeSaleType(row.saleType)}
                  value={`${row.count.toLocaleString()} sale${row.count !== 1 ? 's' : ''}`}
                  total={report.totalPublishedSales}
                  count={row.count}
                />
              ))}
            </ol>
          </section>
        )}

        {/* Most active cities */}
        {report.topCities.length > 0 && (
          <section aria-labelledby="cities-heading" style={{ marginBottom: 48 }}>
            <h2 id="cities-heading" style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, borderBottom: '2px solid #e5e7eb', paddingBottom: 8 }}>
              Most Active Cities
            </h2>
            <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {report.topCities.map((row, i) => {
                const citySlug = toCitySlug(row.city, row.state);
                return (
                  <RankedRow
                    key={`${row.city}-${row.state}`}
                    rank={i + 1}
                    label={
                      <Link
                        href={`/city/${citySlug}`}
                        style={{ color: '#1a6b4a', textDecoration: 'none', fontWeight: 500 }}
                      >
                        {row.city}, {row.state}
                      </Link>
                    }
                    value={`${row.count.toLocaleString()} sale${row.count !== 1 ? 's' : ''}`}
                    total={report.totalPublishedSales}
                    count={row.count}
                  />
                );
              })}
            </ol>
          </section>
        )}

        {/* Top item categories */}
        {report.topCategories.length > 0 && (
          <section aria-labelledby="categories-heading" style={{ marginBottom: 48 }}>
            <h2 id="categories-heading" style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, borderBottom: '2px solid #e5e7eb', paddingBottom: 8 }}>
              Top Item Categories
            </h2>
            <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {report.topCategories.map((row, i) => (
                <RankedRow
                  key={row.category}
                  rank={i + 1}
                  label={row.category}
                  value={`${row.count.toLocaleString()} item${row.count !== 1 ? 's' : ''}`}
                  total={undefined}
                  count={undefined}
                />
              ))}
            </ol>
          </section>
        )}

        {/* Crawler breakdown */}
        {report.crawlerBreakdown.length > 0 && (
          <section aria-labelledby="crawlers-heading" style={{ marginBottom: 48 }}>
            <h2 id="crawlers-heading" style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, borderBottom: '2px solid #e5e7eb', paddingBottom: 8 }}>
              Search Engine Activity
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: '#6b7280' }}>
              Search engines and AI crawlers that visited FindA.Sale listings this month.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {report.crawlerBreakdown.map((row) => (
                <div
                  key={row.crawlerName}
                  style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: 8,
                    padding: '10px 16px',
                    fontSize: 14,
                  }}
                >
                  <span style={{ fontWeight: 600, color: '#166534' }}>{row.crawlerName}</span>
                  <span style={{ color: '#6b7280', marginLeft: 8 }}>{row.count.toLocaleString()} visit{row.count !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* CTA */}
        <section style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '28px 32px', textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 20, fontWeight: 700, color: '#166534' }}>
            List Your Sale on FindA.Sale
          </h2>
          <p style={{ margin: '0 0 20px', fontSize: 15, color: '#374151', lineHeight: 1.6 }}>
            Reach local shoppers and get your listings indexed by search engines — free to start.
          </p>
          <Link
            href="/register"
            style={{
              display: 'inline-block',
              background: '#1a6b4a',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: 15,
              textDecoration: 'none',
              padding: '13px 28px',
              borderRadius: 8,
            }}
          >
            Create a Free Account
          </Link>
        </section>

        {/* Footer note */}
        <p style={{ marginTop: 40, fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>
          Data reflects sales and activity recorded on FindA.Sale during {report.periodLabel}.
          Report published on the 1st of the following month.
        </p>

      </main>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 10,
        padding: '20px 24px',
      }}
    >
      <p style={{ margin: '0 0 4px', fontSize: 13, color: '#6b7280', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: 30, fontWeight: 800, color: '#111827', lineHeight: 1.2 }}>
        {value}
      </p>
      {note && (
        <p style={{ margin: '6px 0 0', fontSize: 12, color: '#9ca3af' }}>{note}</p>
      )}
    </div>
  );
}

function RankedRow({
  rank,
  label,
  value,
  total,
  count,
}: {
  rank: number;
  label: React.ReactNode;
  value: string;
  total: number | undefined;
  count: number | undefined;
}) {
  const pct = total && count ? Math.round((count / total) * 100) : null;
  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '12px 0',
        borderBottom: '1px solid #f3f4f6',
      }}
    >
      {/* Rank badge */}
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: rank === 1 ? '#1a6b4a' : '#f3f4f6',
          color: rank === 1 ? '#ffffff' : '#6b7280',
          fontSize: 13,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {rank}
      </span>

      {/* Label + bar */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: '#111827', marginBottom: pct !== null ? 6 : 0 }}>
          {label}
        </div>
        {pct !== null && (
          <div style={{ background: '#e5e7eb', borderRadius: 4, height: 6 }}>
            <div
              style={{
                background: '#1a6b4a',
                borderRadius: 4,
                height: 6,
                width: `${Math.max(pct, 2)}%`,
              }}
            />
          </div>
        )}
      </div>

      {/* Value */}
      <span style={{ fontSize: 14, color: '#6b7280', whiteSpace: 'nowrap', flexShrink: 0 }}>
        {value}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// getServerSideProps
// ---------------------------------------------------------------------------

export const getServerSideProps: GetServerSideProps<PageProps> = async (
  context: GetServerSidePropsContext
) => {
  const { slug } = context.params as { slug: string };

  // Slug format: "2026-05" — split on first hyphen preceded by 4 digits
  const match = slug.match(/^(\d{4})-(\d{1,2})$/);
  if (!match) {
    return {
      props: { report: null, slug, error: 'Invalid report URL format.' },
    };
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);

  // Use INTERNAL_API_URL server-side (Railway internal network) if available
  const apiUrl =
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    null;

  if (!apiUrl) {
    return {
      props: { report: null, slug, error: 'API unavailable.' },
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${apiUrl}/reports/${year}/${month}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    clearTimeout(timeout);

    if (res.status === 404) {
      return {
        props: {
          report: null,
          slug,
          error: 'This report is not yet available. Reports are published on the 1st of each month.',
        },
      };
    }

    if (!res.ok) {
      return {
        props: { report: null, slug, error: 'Report could not be loaded.' },
      };
    }

    const report: MonthlyReportData = await res.json();

    return {
      props: { report, slug },
    };
  } catch (err) {
    console.error('[reports/[slug]] getServerSideProps fetch error:', err);
    return {
      props: { report: null, slug, error: 'Report could not be loaded.' },
    };
  }
};
