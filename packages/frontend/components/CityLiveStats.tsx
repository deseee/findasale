/**
 * CityLiveStats - live inventory stats block for type-city SEO landing pages.
 *
 * Renders real listing counts (open now, this weekend, total listed) plus a
 * sale-type breakdown for the city that links to each sibling type page and
 * the /city/[slug] hub. All numbers come from build-time API data via
 * lib/seo/cityStats.ts; nothing here is hand-written per city.
 */
import Link from 'next/link';
import { CitySaleStats, SALE_TYPE_PAGES } from '@/lib/seo/cityStats';

interface CityLiveStatsProps {
  citySlug: string;
  cityName: string;
  /** Lowercase plural label for this page's sale type, e.g. "estate sales" */
  typePluralLabel: string;
  /** Sale-type enum key for this page, e.g. "ESTATE" */
  currentTypeKey: string;
  stats: CitySaleStats;
  activeByType: Record<string, number>;
}

export default function CityLiveStats({
  citySlug,
  cityName,
  typePluralLabel,
  currentTypeKey,
  stats,
  activeByType,
}: CityLiveStatsProps) {
  const breakdown = Object.keys(SALE_TYPE_PAGES)
    .map((key) => ({ key, meta: SALE_TYPE_PAGES[key], count: activeByType[key] ?? 0 }))
    .filter((entry) => entry.key !== currentTypeKey && entry.count > 0);

  if (stats.total === 0 && breakdown.length === 0) {
    return null;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 pb-4">
      <h2 className="sr-only">
        Live listing counts for {typePluralLabel} in {cityName}
      </h2>
      {stats.total > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="p-4 rounded-xl bg-warm-50 dark:bg-slate-800 border border-warm-200 dark:border-slate-700 text-center">
            <p className="text-2xl font-bold text-warm-900 dark:text-warm-100">{stats.liveNow}</p>
            <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">Open right now</p>
          </div>
          <div className="p-4 rounded-xl bg-warm-50 dark:bg-slate-800 border border-warm-200 dark:border-slate-700 text-center">
            <p className="text-2xl font-bold text-warm-900 dark:text-warm-100">{stats.thisWeekend}</p>
            <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
              This weekend ({stats.weekendLabel})
            </p>
          </div>
          <div className="p-4 rounded-xl bg-warm-50 dark:bg-slate-800 border border-warm-200 dark:border-slate-700 text-center">
            <p className="text-2xl font-bold text-warm-900 dark:text-warm-100">{stats.total}</p>
            <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">Listed in {cityName}</p>
          </div>
        </div>
      )}
      {breakdown.length > 0 && (
        <p className="mt-3 text-sm text-warm-600 dark:text-warm-400">
          Also in {cityName}:{' '}
          {breakdown.map((entry, i) => (
            <span key={entry.key}>
              {i > 0 && ', '}
              <Link
                href={entry.meta.href(citySlug)}
                className="text-amber-600 hover:text-amber-700 font-medium"
              >
                {entry.count}{' '}
                {entry.count === 1 ? entry.meta.singular : entry.meta.label.toLowerCase()}
              </Link>
            </span>
          ))}
          {', or see '}
          <Link
            href={`/city/${citySlug}`}
            className="text-amber-600 hover:text-amber-700 font-medium"
          >
            all sales in {cityName}
          </Link>
          .
        </p>
      )}
    </div>
  );
}
