/**
 * SEO Content Guide Pages — ADR-075 Phase 1
 * /guide/[slug] — ISR page for "How to run a sale" and "Pricing guide" content
 *
 * Features:
 * - getStaticPaths: Fetch all 500 slugs from data/seo-pages/index.json at build time
 * - fallback: 'blocking' for dynamic slugs
 * - revalidate: 86400 (24-hour ISR cache)
 * - SEO: title, description, canonical URL, schema.org HowTo/Article
 * - Dark mode compatible
 * - Mobile responsive
 * - CTA to list a sale on FindA.Sale
 */

import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { GetStaticPropsContext, GetStaticPropsResult, GetStaticPathsResult } from 'next';

interface GuideSection {
  heading: string;
  body: string;
}

interface GuideContent {
  intro: string;
  sections: GuideSection[];
  cta: string;
}

interface RelatedGuide {
  slug: string;
  title: string;
  type: 'how-to' | 'pricing-guide';
}

interface GuidePageProps {
  slug: string;
  title: string;
  h1: string;
  description: string;
  metaTitle: string;
  metaDescription: string;
  type: 'how-to' | 'pricing-guide';
  saleType: string;
  city: string;
  state: string;
  metro: string;
  content: GuideContent;
  updatedAt: string;
  relatedGuides: RelatedGuide[];
}

export default function GuidePage({
  slug,
  title,
  h1,
  metaTitle,
  metaDescription,
  type,
  city,
  state,
  content,
  updatedAt,
  relatedGuides,
}: GuidePageProps) {
  const canonicalUrl = `https://finda.sale/guide/${slug}`;

  // Determine schema type based on guide type
  const schemaType = type === 'how-to' ? 'HowTo' : 'Article';

  return (
    <>
      <Head>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDescription} />
        <link rel="canonical" href={canonicalUrl} key="canonical" />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content="https://finda.sale/og-default.png" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={metaTitle} />
        <meta name="twitter:description" content={metaDescription} />

        {/* Structured Data — HowTo or Article schema */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': schemaType,
              headline: h1,
              description: metaDescription,
              url: canonicalUrl,
              image: 'https://finda.sale/og-default.png',
              dateModified: updatedAt,
              ...(schemaType === 'HowTo'
                ? {
                    step: content.sections.map((section, idx) => ({
                      '@type': 'HowToStep',
                      position: idx + 1,
                      name: section.heading,
                      text: section.body,
                    })),
                  }
                : {
                    articleBody: [content.intro, ...content.sections.map((s) => s.body)].join('\n\n'),
                  }),
            }),
          }}
        />
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-warm-200 dark:border-gray-700 py-8">
          <div className="max-w-3xl mx-auto px-4">
            {/* Breadcrumb */}
            <nav className="text-sm text-warm-500 dark:text-warm-400 mb-4 flex items-center gap-2">
              <Link href="/" className="hover:text-amber-600 dark:hover:text-amber-400">
                Home
              </Link>
              <span>›</span>
              <span className="text-warm-700 dark:text-warm-300 font-medium">Guide</span>
            </nav>

            <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-4">{h1}</h1>

            <div className="flex items-center gap-4 text-sm text-warm-600 dark:text-warm-400">
              <span>FindA.Sale Guide</span>
              <span>•</span>
              <span>Updated {new Date(updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <main className="max-w-3xl mx-auto px-4 py-12">
          {/* Intro */}
          <section className="prose prose-sm dark:prose-invert max-w-none mb-12">
            <p className="text-lg text-warm-700 dark:text-warm-300 leading-relaxed mb-6">
              {content.intro}
            </p>
          </section>

          {/* Sections */}
          <div className="space-y-8 mb-12">
            {content.sections.map((section, idx) => (
              <section key={idx} className="prose prose-sm dark:prose-invert max-w-none">
                <h2 className="text-2xl font-semibold text-warm-900 dark:text-warm-100 mb-3">
                  {section.heading}
                </h2>
                <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
                  {section.body}
                </p>
              </section>
            ))}
          </div>

          {/* CTA Section */}
          <section className="bg-amber-50 dark:bg-gray-800 border border-amber-200 dark:border-gray-700 rounded-lg p-8 text-center mb-12">
            <p className="text-warm-700 dark:text-warm-300 mb-6 text-lg">{content.cta}</p>
            <div className="flex gap-4 justify-center">
              <Link
                href="/organizer/new"
                className="inline-block bg-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600 text-white font-medium py-3 px-6 rounded-lg transition-colors"
              >
                List Your Sale
              </Link>
              <Link
                href="/"
                className="inline-block bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-600 border border-amber-200 dark:border-gray-600 font-medium py-3 px-6 rounded-lg transition-colors"
              >
                Browse Sales
              </Link>
            </div>
          </section>

          {/* Related Links */}
          <section className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-8">
            <h3 className="text-xl font-semibold text-warm-900 dark:text-warm-100 mb-4">
              Learn More
            </h3>
            <ul className="space-y-2 text-warm-700 dark:text-warm-300">
              {(relatedGuides || []).map((guide) => (
                <li key={guide.slug}>
                  <Link
                    href={`/guide/${guide.slug}`}
                    className="text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    {guide.title}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/blog" className="text-amber-600 dark:text-amber-400 hover:underline">
                  Read the FindA.Sale Blog
                </Link>
              </li>
            </ul>
          </section>
        </main>
      </div>
    </>
  );
}

/**
 * Generate static paths for all 500 guide slugs at build time
 */
export async function getStaticPaths(): Promise<GetStaticPathsResult> {
  try {
    // Import the index data
    const indexData = require('../../data/seo-pages/index.json') as Array<{ slug: string }>;

    const paths = indexData.map((entry) => ({
      params: { slug: entry.slug },
    }));

    return {
      paths,
      fallback: 'blocking',
    };
  } catch (error) {
    console.error('Error generating static paths for guide pages:', error);
    // Return empty paths with blocking fallback — will SSG-generate on first request
    return { paths: [], fallback: 'blocking' };
  }
}

type GuideIndexEntry = Omit<GuidePageProps, 'relatedGuides'>;

// Related guide selection.
// Relevance by shared title/slug keywords with a same-type bonus. Ties are
// broken by a deterministic hash of the slug pair so links spread across the
// whole library instead of concentrating on the same few pages.
const GUIDE_STOPWORDS = new Set([
  'the', 'and', 'for', 'how', 'much', 'what', 'your', 'you', 'with', 'that',
  'guide', 'pricing', 'prices', 'price', 'worth', 'values', 'value', '2026',
  'estate', 'sale', 'sales',
]);

function guideTokens(entry: { slug: string; title: string }): Set<string> {
  const raw = `${entry.title} ${entry.slug}`.toLowerCase();
  const words = raw
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !GUIDE_STOPWORDS.has(w));
  return new Set(words);
}

function hashPair(a: string, b: string): number {
  const s = `${a}|${b}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function pickRelatedGuides(
  all: GuideIndexEntry[],
  current: GuideIndexEntry,
  count = 3
): RelatedGuide[] {
  const currentTokens = guideTokens(current);

  return all
    .filter((entry) => entry.slug !== current.slug)
    .map((entry) => {
      const tokens = guideTokens(entry);
      let overlap = 0;
      tokens.forEach((t) => {
        if (currentTokens.has(t)) overlap += 1;
      });
      const typeBonus = entry.type === current.type ? 1 : 0;
      return {
        entry,
        score: overlap * 2 + typeBonus,
        tiebreak: hashPair(current.slug, entry.slug),
      };
    })
    .sort((a, b) => b.score - a.score || a.tiebreak - b.tiebreak)
    .slice(0, count)
    .map(({ entry }) => ({ slug: entry.slug, title: entry.title, type: entry.type }));
}

/**
 * Generate static props with guide content and SEO metadata
 */
export async function getStaticProps(
  context: GetStaticPropsContext<{ slug: string }>
): Promise<GetStaticPropsResult<GuidePageProps>> {
  const { slug } = context.params || {};

  if (!slug) {
    return { notFound: true };
  }

  try {
    // Import the index data
    const indexData = require('../../data/seo-pages/index.json') as GuideIndexEntry[];

    // Find entry by slug
    const entry = indexData.find((e) => e.slug === slug);

    if (!entry) {
      return { notFound: true, revalidate: 3600 };
    }

    return {
      props: { ...entry, relatedGuides: pickRelatedGuides(indexData, entry) },
      revalidate: 86400, // 24-hour ISR cache
    };
  } catch (error) {
    console.error('Error generating static props for guide slug:', slug, error);
    return {
      notFound: true,
      revalidate: 300, // Retry after 5 minutes on error
    };
  }
}
