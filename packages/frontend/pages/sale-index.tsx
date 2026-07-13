import Head from 'next/head';
import { jsonLdSafe } from '@/lib/jsonLdSafe';
import Link from 'next/link';
import type { GetStaticProps } from 'next';
import MetroTable, { MetroRow } from '../components/sale-index/MetroTable';
import EmbedSnippetBox from '../components/sale-index/EmbedSnippetBox';
import { generateSaleOGImage } from '../lib/ogImage';

interface SaleIndexProps {
  generatedAt: string | null;
  metroCount: number;
  totalSales: number;
  metros: MetroRow[];
}

const CANONICAL_URL = 'https://finda.sale/sale-index';

function formatGeneratedAt(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return iso;
  }
}

export default function SaleIndexPage({
  generatedAt,
  metroCount,
  totalSales,
  metros,
}: SaleIndexProps) {
  const title = 'The Weekend Sale Index — U.S. Secondary Sales by Metro | FindA.Sale';
  const description =
    'A ranked, continuously-updated count of upcoming estate sales, yard sales, auctions, and flea markets across U.S. metro areas.';

  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'db8yhzjdq';
  const ogImageUrl = generateSaleOGImage({
    cloudName,
    saleTitle: 'The Weekend Sale Index',
    location: 'United States',
    saleDate: generatedAt ? formatGeneratedAt(generatedAt) : undefined,
    shouldApplyWatermark: true,
  });

  const datasetJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'The Weekend Sale Index — U.S. Secondary Sales by Metro',
    description:
      'Ranked count of upcoming estate sales, yard sales, auctions, and flea markets by U.S. metro area, updated continuously.',
    url: CANONICAL_URL,
    creator: {
      '@type': 'Organization',
      name: 'FindA.Sale',
      url: 'https://finda.sale',
    },
    isAccessibleForFree: true,
    dateModified: generatedAt || undefined,
    license: CANONICAL_URL,
    keywords: [
      'estate sales',
      'yard sales',
      'auctions',
      'flea markets',
      'secondary sales',
      'metro rankings',
    ],
  };

  const hasData = metros.length > 0;

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta
          name="keywords"
          content="weekend sale index, estate sales by city, yard sales by metro, auctions, flea markets, secondary sales rankings, US sale data"
        />
        <link rel="canonical" href={CANONICAL_URL} key="canonical" />
        <meta property="og:title" content="The Weekend Sale Index" />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={CANONICAL_URL} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={ogImageUrl} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="The Weekend Sale Index" />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={ogImageUrl} />
        <meta name="robots" content="index, follow" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdSafe(datasetJsonLd) }}
        />
      </Head>

      <main className="min-h-screen bg-white dark:bg-slate-900">
        <div className="max-w-5xl mx-auto px-4 py-10">
          {/* Header */}
          <header className="mb-8">
            <h1 className="text-3xl md:text-4xl font-extrabold text-warm-900 dark:text-warm-100">
              The Weekend Sale Index
            </h1>
            <p className="mt-3 text-lg text-warm-600 dark:text-warm-300 max-w-3xl">
              A live ranking of U.S. metro areas by the number of upcoming estate
              sales, yard sales, auctions, and flea markets — the secondary-sale
              market, counted in one place and updated continuously.
            </p>

            {hasData && (
              <div className="mt-5 flex flex-wrap gap-6 text-sm">
                <div>
                  <div className="text-2xl font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                    {totalSales.toLocaleString()}
                  </div>
                  <div className="text-warm-500 dark:text-warm-400">
                    upcoming sales tracked
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                    {metroCount.toLocaleString()}
                  </div>
                  <div className="text-warm-500 dark:text-warm-400">metro areas</div>
                </div>
              </div>
            )}

            {generatedAt && (
              <p className="mt-4 text-xs text-warm-400 dark:text-warm-500">
                Last updated {formatGeneratedAt(generatedAt)}
              </p>
            )}
          </header>

          {/* Table or empty state */}
          {hasData ? (
            <MetroTable metros={metros} />
          ) : (
            <div className="rounded-xl border border-dashed border-warm-300 dark:border-gray-700 p-10 text-center">
              <p className="text-lg font-medium text-warm-700 dark:text-warm-200">
                The index is updating — check back shortly.
              </p>
              <p className="mt-2 text-sm text-warm-500 dark:text-warm-400">
                We refresh the Weekend Sale Index throughout the day as new sales
                are published.{' '}
                <Link
                  href="/cities"
                  className="text-amber-700 dark:text-amber-400 hover:underline"
                >
                  Browse sales by city
                </Link>{' '}
                in the meantime.
              </p>
            </div>
          )}

          {/* Methodology */}
          <section className="mt-12 rounded-xl border border-warm-200 dark:border-gray-700 p-6">
            <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-2">
              Methodology
            </h2>
            <p className="text-sm text-warm-600 dark:text-warm-300 leading-relaxed">
              The Weekend Sale Index counts <strong>published, upcoming sales</strong>{' '}
              listed on FindA.Sale — estate sales, yard and garage sales, auctions,
              and flea markets — grouped by the metro area where each sale takes
              place. Each sale is counted once, on its start date. We exclude
              permanent retail storefronts and consignment shops, since those are
              ongoing businesses rather than time-boxed sales. Rankings update
              continuously as organizers publish new sales; the &ldquo;Last
              updated&rdquo; timestamp reflects the most recent refresh.
            </p>
          </section>

          {/* Embed snippet */}
          <EmbedSnippetBox />
        </div>
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps<SaleIndexProps> = async () => {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';
  try {
    const res = await fetch(`${apiBaseUrl}/index/metros`);
    const data = await res.json();
    return {
      props: {
        generatedAt: data.generatedAt ?? null,
        metroCount: data.metroCount ?? 0,
        totalSales: data.totalSales ?? 0,
        metros: Array.isArray(data.metros) ? data.metros : [],
      },
      revalidate: 86400, // ISR: 24h outer bound; backend cache refreshes every 6h
    };
  } catch (err) {
    console.error('[sale-index] getStaticProps fetch error:', err);
    return {
      props: { metros: [], generatedAt: null, metroCount: 0, totalSales: 0 },
      revalidate: 86400,
    };
  }
};
