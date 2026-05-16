import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { GetStaticProps } from 'next';
import { guides, GuideEntry } from '../../data/guides/index';

interface GuidesIndexProps {
  organizer: GuideEntry[];
  shopper: GuideEntry[];
}

// Next.js cannot serialize `undefined` — replace with null before returning props
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitize<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj, (_k, v) => (v === undefined ? null : v)));
}

export const getStaticProps: GetStaticProps<GuidesIndexProps> = async () => {
  const sorted = [...guides].sort((a, b) => a.priority - b.priority);
  const organizer = sorted.filter(
    (g) => g.audience === 'organizer' || g.audience === 'both'
  );
  const shopper = sorted.filter(
    (g) => g.audience === 'shopper' || g.audience === 'both'
  );
  return {
    props: sanitize({ organizer, shopper }),
    revalidate: 86400,
  };
};

function AudienceBadge({ audience }: { audience: GuideEntry['audience'] }) {
  const label =
    audience === 'organizer'
      ? 'Organizer'
      : audience === 'shopper'
      ? 'Shopper'
      : 'Everyone';
  const colors =
    audience === 'organizer'
      ? 'bg-sage-50 text-sage-700 dark:bg-sage-700 dark:text-sage-100'
      : audience === 'shopper'
      ? 'bg-amber-50 text-amber-700 dark:bg-amber-800 dark:text-amber-100'
      : 'bg-warm-200 text-warm-700 dark:bg-warm-700 dark:text-warm-200';
  return (
    <span
      className={`inline-block text-caption font-medium px-2 py-0.5 rounded-full ${colors}`}
    >
      {label}
    </span>
  );
}

function FormatBadge({ format }: { format: GuideEntry['format'] }) {
  const icons: Record<GuideEntry['format'], string> = {
    written: '📄',
    'written+video': '🎬',
    'written+explainer': '💡',
  };
  return (
    <span className="text-caption text-warm-500 dark:text-warm-400">
      {icons[format]}{' '}
      {format === 'written'
        ? 'Written guide'
        : format === 'written+video'
        ? 'Guide + video'
        : 'Guide + explainer'}
    </span>
  );
}

function GuideCard({ guide }: { guide: GuideEntry }) {
  return (
    <Link
      href={`/guides/${guide.slug}`}
      className="block group rounded-card border border-warm-200 dark:border-warm-700 bg-white dark:bg-warm-800 p-4 shadow-card hover:shadow-card-hover transition-shadow"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-body font-semibold text-warm-900 dark:text-warm-100 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors leading-snug">
          {guide.title}
        </h3>
        {guide.priority === 1 && (
          <span className="shrink-0 text-caption font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
            Essential
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <AudienceBadge audience={guide.audience} />
        <FormatBadge format={guide.format} />
      </div>
    </Link>
  );
}

function GuideSection({
  title,
  guides,
}: {
  title: string;
  guides: GuideEntry[];
}) {
  if (guides.length === 0) return null;
  return (
    <section className="mb-10">
      <h2 className="text-h2 font-heading text-warm-900 dark:text-warm-100 mb-4">
        {title}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {guides.map((g) => (
          <GuideCard key={g.slug} guide={g} />
        ))}
      </div>
    </section>
  );
}

export default function GuidesIndexPage({ organizer, shopper }: GuidesIndexProps) {
  return (
    <>
      <Head>
        <title>Help Library | FindA.Sale</title>
        <meta
          name="description"
          content="Step-by-step guides for organizers and shoppers on FindA.Sale. Learn how to photograph a sale, manage your review queue, place holds, and more."
        />
        <meta property="og:title" content="Help Library | FindA.Sale" />
        <meta
          property="og:description"
          content="Step-by-step guides for organizers and shoppers on FindA.Sale."
        />
        <meta property="og:url" content="https://finda.sale/guides" />
        <link rel="canonical" href="https://finda.sale/guides" />
      </Head>

      <div className="min-h-screen bg-warm-100 dark:bg-warm-900">
        {/* Hero */}
        <div className="bg-white dark:bg-warm-800 border-b border-warm-200 dark:border-warm-700">
          <div className="max-w-3xl mx-auto px-4 py-10">
            <h1 className="font-heading text-display-sm sm:text-display font-bold text-warm-900 dark:text-warm-100 mb-2">
              Help Library
            </h1>
            <p className="text-body-lg text-warm-500 dark:text-warm-400">
              Step-by-step guides for organizers and shoppers.
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-3xl mx-auto px-4 py-8">
          <GuideSection title="For Organizers" guides={organizer} />
          <GuideSection title="For Shoppers" guides={shopper} />
        </div>
      </div>
    </>
  );
}
