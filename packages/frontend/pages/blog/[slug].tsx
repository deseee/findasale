import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { GetStaticProps, GetStaticPaths } from 'next';
import { posts, getPostBySlug, BlogPost } from '../../data/blog/index';

interface BlogPostPageProps {
  post: BlogPost;
}

export const getStaticPaths: GetStaticPaths = async () => {
  const paths = posts.map((p) => ({ params: { slug: p.slug } }));
  return { paths, fallback: 'blocking' };
};

// Next.js cannot serialize `undefined` — replace with null before returning props
function sanitize<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj, (_k, v) => (v === undefined ? null : v)));
}

export const getStaticProps: GetStaticProps<BlogPostPageProps> = async ({ params }) => {
  const slug = typeof params?.slug === 'string' ? params.slug : '';
  const post = getPostBySlug(slug);

  if (!post) {
    return { notFound: true };
  }

  return {
    props: sanitize({ post }),
    revalidate: 86400,
  };
};

// ── Minimal markdown renderer ──────────────────────────────────────────────
// Handles: ## h2, ### h3, - list items, 1. ordered list items, paragraphs.

interface RenderedBlock {
  type: 'h2' | 'h3' | 'ul' | 'ol' | 'p';
  items?: string[];
  text?: string;
}

function parseMarkdown(body: string): RenderedBlock[] {
  const lines = body.split('\n');
  const blocks: RenderedBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('### ')) {
      blocks.push({ type: 'h3', text: line.slice(4) });
      i++;
    } else if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', text: line.slice(3) });
      i++;
    } else if (line.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(lines[i].slice(2));
        i++;
      }
      blocks.push({ type: 'ul', items });
    } else if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''));
        i++;
      }
      blocks.push({ type: 'ol', items });
    } else if (line.trim() === '') {
      i++;
    } else {
      const textLines: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !lines[i].startsWith('## ') &&
        !lines[i].startsWith('### ') &&
        !lines[i].startsWith('- ') &&
        !/^\d+\.\s/.test(lines[i])
      ) {
        textLines.push(lines[i]);
        i++;
      }
      if (textLines.length > 0) {
        blocks.push({ type: 'p', text: textLines.join(' ') });
      }
    }
  }
  return blocks;
}

function MarkdownBody({ body }: { body: string }) {
  const blocks = parseMarkdown(body);

  return (
    <div className="prose-guide">
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'h2':
            return (
              <h2
                key={idx}
                className="text-h2 font-heading font-semibold text-warm-900 dark:text-warm-100 mt-8 mb-3"
              >
                {block.text}
              </h2>
            );
          case 'h3':
            return (
              <h3
                key={idx}
                className="text-h3 font-heading font-semibold text-warm-800 dark:text-warm-200 mt-6 mb-2"
              >
                {block.text}
              </h3>
            );
          case 'ul':
            return (
              <ul
                key={idx}
                className="list-disc list-inside space-y-1 text-warm-700 dark:text-warm-300 mb-4"
              >
                {block.items?.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol
                key={idx}
                className="list-decimal list-inside space-y-1 text-warm-700 dark:text-warm-300 mb-4"
              >
                {block.items?.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ol>
            );
          case 'p':
          default:
            return (
              <p
                key={idx}
                className="text-body text-warm-700 dark:text-warm-300 leading-relaxed mb-4"
              >
                {block.text}
              </p>
            );
        }
      })}
    </div>
  );
}

function CategoryBadge({ category }: { category: BlogPost['category'] }) {
  const labels: Record<BlogPost['category'], string> = {
    tips: 'Tips',
    guides: 'Guide',
    news: 'News',
    'how-to': 'How-To',
  };
  return (
    <span className="inline-block text-body-sm font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
      {labels[category]}
    </span>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function BlogPostPage({ post }: BlogPostPageProps) {
  const canonical = `https://finda.sale/blog/${post.slug}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    datePublished: post.publishDate,
    dateModified: post.updatedDate ?? post.publishDate,
    publisher: { '@type': 'Organization', name: 'FindA.Sale', url: 'https://finda.sale' },
    description: post.metaDescription,
    url: canonical,
  };

  return (
    <>
      <Head>
        <title>{post.title} | FindA.Sale Blog</title>
        <meta name="description" content={post.metaDescription} />
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={post.metaDescription} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="article" />
        <meta property="og:image" content="https://finda.sale/og-default.png" />
        <meta property="article:published_time" content={post.publishDate} />
        <link rel="canonical" href={canonical} key="canonical" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </Head>

      <div className="min-h-screen bg-warm-100 dark:bg-warm-900">
        {/* Breadcrumb */}
        <div className="bg-white dark:bg-warm-800 border-b border-warm-200 dark:border-warm-700">
          <div className="max-w-3xl mx-auto px-4 py-3 text-body-sm text-warm-500 dark:text-warm-400">
            <Link
              href="/blog"
              className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
            >
              Blog
            </Link>
            <span className="mx-2">›</span>
            <span className="text-warm-700 dark:text-warm-300">{post.title}</span>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 flex-wrap mb-3">
              <CategoryBadge category={post.category} />
              <span className="text-body-sm text-warm-500 dark:text-warm-400">
                {post.readingTimeMinutes} min read
              </span>
            </div>
            <h1 className="font-heading text-display-sm sm:text-display font-bold text-warm-900 dark:text-warm-100 mb-3">
              {post.title}
            </h1>
            <p className="text-body-sm text-warm-500 dark:text-warm-400">
              Published {formatDate(post.publishDate)}
              {post.updatedDate && post.updatedDate !== post.publishDate && (
                <> · Updated {formatDate(post.updatedDate)}</>
              )}
            </p>
          </div>

          <hr className="border-warm-200 dark:border-warm-700 mb-8" />

          {/* Body */}
          <div className="bg-white dark:bg-warm-800 rounded-card shadow-card p-6 mb-8">
            <MarkdownBody body={post.body} />
          </div>

          {/* Back link */}
          <div className="mt-4">
            <Link
              href="/blog"
              className="text-body-sm text-warm-500 dark:text-warm-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
            >
              ← Back to Blog
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
