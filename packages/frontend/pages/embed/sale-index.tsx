import Head from 'next/head';
import type { GetStaticProps } from 'next';
import type { ReactElement } from 'react';
import MetroTable, { MetroRow } from '../../components/sale-index/MetroTable';

interface EmbedSaleIndexProps {
  generatedAt: string | null;
  metros: MetroRow[];
}

const EMBED_TOP_N = 25;

function formatGeneratedAt(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

/**
 * Chrome-free embeddable Weekend Sale Index (top 25 metros).
 * Rendered WITHOUT the global Layout (see getLayout below) so it sits cleanly
 * inside a third-party iframe. noindex — the canonical asset is /sale-index.
 */
export default function EmbedSaleIndex({ generatedAt, metros }: EmbedSaleIndexProps) {
  const hasData = metros.length > 0;

  return (
    <>
      <Head>
        <title>The Weekend Sale Index — FindA.Sale</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div
        style={{
          fontFamily:
            'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        }}
        className="bg-white dark:bg-gray-900 text-warm-900 dark:text-warm-100 p-4"
      >
        <div className="mb-3">
          <h1 className="text-lg font-bold">The Weekend Sale Index</h1>
          <p className="text-xs text-warm-500">
            Top {EMBED_TOP_N} U.S. metros by upcoming estate sales, yard sales,
            auctions &amp; flea markets
            {generatedAt ? ` · Updated ${formatGeneratedAt(generatedAt)}` : ''}
          </p>
        </div>

        {hasData ? (
          <MetroTable metros={metros} embed limit={EMBED_TOP_N} />
        ) : (
          <p className="text-sm text-warm-500 py-6 text-center">
            The index is updating — check back shortly.
          </p>
        )}

        <div className="mt-3 pt-3 border-t border-warm-100 text-right">
          <a
            href="https://finda.sale/sale-index"
            target="_blank"
            rel="noopener"
            className="text-xs font-semibold text-amber-700 hover:underline"
          >
            Powered by FindA.Sale →
          </a>
        </div>
      </div>
    </>
  );
}

// Render chrome-free — opt out of the global Layout wrapper for this embed page.
EmbedSaleIndex.getLayout = (page: ReactElement) => page;

export const getStaticProps: GetStaticProps<EmbedSaleIndexProps> = async () => {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';
  try {
    const res = await fetch(`${apiBaseUrl}/index/metros`);
    const data = await res.json();
    return {
      props: {
        generatedAt: data.generatedAt ?? null,
        metros: Array.isArray(data.metros) ? data.metros : [],
      },
      revalidate: 86400,
    };
  } catch (err) {
    console.error('[embed/sale-index] getStaticProps fetch error:', err);
    return {
      props: { generatedAt: null, metros: [] },
      revalidate: 86400,
    };
  }
};
