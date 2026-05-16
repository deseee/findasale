import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { GetStaticProps, GetStaticPaths } from 'next';
import { guides, getGuideBySlug, GuideEntry } from '../../data/guides/index';

interface GuidePageProps {
  guide: GuideEntry;
  relatedGuides: GuideEntry[];
}

export const getStaticPaths: GetStaticPaths = async () => {
  const paths = guides.map((g) => ({ params: { slug: g.slug } }));
  return { paths, fallback: 'blocking' };
};

export const getStaticProps: GetStaticProps<GuidePageProps> = async ({ params }) => {
  const slug = typeof params?.slug === 'string' ? params.slug : '';
  const guide = getGuideBySlug(slug);

  if (!guide) {
    return { notFound: true };
  }

  const relatedGuides = guide.relatedGuides
    .map((s) => getGuideBySlug(s))
    .filter((g): g is GuideEntry => g !== undefined);

  return {
    props: { guide, relatedGuides },
    revalidate: 86400,
  };
};

// ── Minimal markdown renderer ──────────────────────────────────────────────
// Handles: ## h2, ### h3, - list items, 1. ordered list items, paragraphs.
// No external deps needed for the current guide content.

interface RenderedBlock {
  type: 'h2' | 'h3' | 'ul' | 'ol' | 'p';
  items?: string[];  // for ul / ol
  text?: string;     // for h2, h3, p
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
      // Collect consecutive bullet lines
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(lines[i].slice(2));
        i++;
      }
      blocks.push({ type: 'ul', items });
    } else if (/^\d+\.\s/.test(line)) {
      // Collect consecutive ordered lines
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''));
        i++;
      }
      blocks.push({ type: 'ol', items });
    } else if (line.trim() === '') {
      i++;
    } else {
      // Paragraph — collect until blank line or block marker
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

function FormatLabel({ format }: { format: GuideEntry['format'] }) {
  const map: Record<GuideEntry['format'], string> = {
    written: 'Written guide',
    'written+video': 'Guide + video',
    'written+explainer': 'Guide + explainer',
  };
  return (
    <span className="text-body-sm text-warm-500 dark:text-warm-400">
      {map[format]}
    </span>
  );
}

function AudienceBadge({ audience }: { audience: GuideEntry['audience'] }) {
  const label =
    audience === 'organizer'
      ? 'For Organizers'
      : audience === 'shopper'
      ? 'For Shoppers'
      : 'For Everyone';
  const colors =
    audience === 'organizer'
      ? 'bg-sage-50 text-sage-700 dark:bg-sage-700 dark:text-sage-100'
      : audience === 'shopper'
      ? 'bg-amber-50 text-amber-700 dark:bg-amber-800 dark:text-amber-100'
      : 'bg-warm-200 text-warm-700 dark:bg-warm-700 dark:text-warm-200';
  return (
    <span
      className={`inline-block text-body-sm font-medium px-2.5 py-1 rounded-full ${colors}`}
    >
      {label}
    </span>
  );
}

export default function GuidePage({ guide, relatedGuides }: GuidePageProps) {
  const canonical = `https://finda.sale/guides/${guide.slug}`;

  return (
    <>
      <Head>
        <title>{guide.title} | FindA.Sale Help</title>
        <meta
          name="description"
          content={`${guide.title} — a step-by-step guide from FindA.Sale.`}
        />
        <meta property="og:title" content={`${guide.title} | FindA.Sale Help`} />
        <meta
          property="og:description"
          content={`${guide.title} — a step-by-step guide from FindA.Sale.`}
        />
        <meta property="og:url" content={canonical} />
        <link rel="canonical" href={canonical} />
      </Head>

      <div className="min-h-screen bg-warm-100 dark:bg-warm-900">
        {/* Breadcrumb */}
        <div className="bg-white dark:bg-warm-800 border-b border-warm-200 dark:border-warm-700">
          <div className="max-w-3xl mx-auto px-4 py-3 text-body-sm text-warm-500 dark:text-warm-400">
            <Link
              href="/guides"
              className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
            >
              Help Library
            </Link>
            <span className="mx-2">›</span>
            <span className="text-warm-700 dark:text-warm-300">{guide.title}</span>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-8">
          {/* Hero */}
          <div className="mb-6">
            <h1 className="font-heading text-display-sm sm:text-display font-bold text-warm-900 dark:text-warm-100 mb-3">
              {guide.title}
            </h1>
            <div className="flex items-center gap-3 flex-wrap">
              <AudienceBadge audience={guide.audience} />
              <FormatLabel format={guide.format} />
            </div>
          </div>

          {/* Optional video */}
          {guide.videoUrl && (
            <div className="mb-8 rounded-card overflow-hidden bg-warm-900">
              <video
                src={guide.videoUrl}
                controls
                className="w-full max-h-96 object-contain"
                preload="metadata"
              />
            </div>
          )}

          {/* Body */}
          <div className="bg-white dark:bg-warm-800 rounded-card shadow-card p-6 mb-8">
            <MarkdownBody body={guide.body} />
          </div>

          {/* Related guides */}
          {relatedGuides.length > 0 && (
            <section>
              <h2 className="text-h3 font-heading font-semibold text-warm-900 dark:text-warm-100 mb-4">
                Related guides
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {relatedGuides.map((related) => (
                  <Link
                    key={related.slug}
                    href={`/guides/${related.slug}`}
                    className="block group rounded-card border border-warm-200 dark:border-warm-700 bg-white dark:bg-warm-800 px-4 py-3 shadow-card hover:shadow-card-hover transition-shadow"
                  >
                    <span className="text-body-sm font-medium text-warm-900 dark:text-warm-100 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                      {related.title}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Back link */}
          <div className="mt-10">
            <Link
              href="/guides"
              className="text-body-sm text-warm-500 dark:text-warm-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
            >
              ← Back to Help Library
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
