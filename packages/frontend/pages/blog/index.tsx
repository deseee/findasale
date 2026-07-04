import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { GetStaticProps } from 'next';
import { posts, BlogPost } from '../../data/blog/index';

interface BlogIndexProps {
  posts: BlogPost[];
}

// Next.js cannot serialize `undefined` — replace with null before returning props
function sanitize<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj, (_k, v) => (v === undefined ? null : v)));
}

export const getStaticProps: GetStaticProps<BlogIndexProps> = async () => {
  const sorted = [...posts].sort(
    (a, b) => new Date(a.publishDate).getTime() - new Date(b.publishDate).getTime()
  );
  return {
    props: sanitize({ posts: sorted }),
    revalidate: 86400,
  };
};

function CategoryBadge({ category }: { category: BlogPost['category'] }) {
  const labels: Record<BlogPost['category'], string> = {
    tips: 'Tips',
    guides: 'Guide',
    news: 'News',
    'how-to': 'How-To',
  };
  return (
    <span className="inline-block text-caption font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
      {labels[category]}
    </span>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function BlogCard({ post }: { post: BlogPost }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="block group rounded-card border border-warm-200 dark:border-warm-700 bg-white dark:bg-warm-800 p-5 shadow-card hover:shadow-card-hover transition-shadow"
    >
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <CategoryBadge category={post.category} />
        <span className="text-caption text-warm-500 dark:text-warm-400">
          {formatDate(post.publishDate)}
        </span>
        <span className="text-caption text-warm-500 dark:text-warm-400">
          {post.readingTimeMinutes} min read
        </span>
      </div>
      <h2 className="text-body font-semibold text-warm-900 dark:text-warm-100 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors leading-snug mb-2">
        {post.title}
      </h2>
      <p className="text-body-sm text-warm-600 dark:text-warm-400 leading-relaxed">
        {post.excerpt}
      </p>
    </Link>
  );
}

export default function BlogIndexPage({ posts }: BlogIndexProps) {
  return (
    <>
      <Head>
        <title>Blog | FindA.Sale</title>
        <meta
          name="description"
          content="Tips, guides, and news for estate sale, yard sale, auction, flea market, and consignment organizers, and the shoppers who love them."
        />
        <meta property="og:title" content="Blog | FindA.Sale" />
        <meta
          property="og:description"
          content="Tips, guides, and news for organizers of estate sales, yard sales, auctions, flea markets, and consignment events."
        />
        <meta property="og:url" content="https://finda.sale/blog" />
        <meta property="og:image" content="https://finda.sale/og-default.png" />
        <link rel="canonical" href="https://finda.sale/blog" key="canonical" />
      </Head>

      <div className="min-h-screen bg-warm-100 dark:bg-warm-900">
        {/* Hero */}
        <div className="bg-white dark:bg-warm-800 border-b border-warm-200 dark:border-warm-700">
          <div className="max-w-3xl mx-auto px-4 py-10">
            <h1 className="font-heading text-display-sm sm:text-display font-bold text-warm-900 dark:text-warm-100 mb-2">
              Blog
            </h1>
            <p className="text-body-lg text-warm-500 dark:text-warm-400">
              Tips, guides, and perspective for sale organizers: estate sales, yard sales, auctions, flea markets, and more.
            </p>
          </div>
        </div>

        {/* Post list */}
        <div className="max-w-3xl mx-auto px-4 py-8">
          <div className="flex flex-col gap-4">
            {posts.map((post) => (
              <BlogCard key={post.slug} post={post} />
            ))}
          </div>

          {/* Guides library cross-links */}
          <div className="mt-8 rounded-card border border-warm-200 dark:border-warm-700 bg-white dark:bg-warm-800 p-5 shadow-card">
            <h2 className="text-body font-semibold text-warm-900 dark:text-warm-100 mb-1">
              From the guides library
            </h2>
            <p className="text-body-sm text-warm-600 dark:text-warm-400 mb-3">
              Step-by-step guides for planning, pricing, and running your sale.
            </p>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/guide/how-to-run-an-estate-sale"
                  className="text-body-sm text-amber-600 dark:text-amber-400 hover:underline"
                >
                  How to Run an Estate Sale Yourself: 7 Steps
                </Link>
              </li>
              <li>
                <Link
                  href="/guide/estate-sale-pricing-guide"
                  className="text-body-sm text-amber-600 dark:text-amber-400 hover:underline"
                >
                  How to Price Estate Sale Items: Real Ranges
                </Link>
              </li>
              <li>
                <Link
                  href="/guide/estate-sale-company-costs"
                  className="text-body-sm text-amber-600 dark:text-amber-400 hover:underline"
                >
                  How Much Do Estate Sale Companies Charge?
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
