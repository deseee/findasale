import Link from 'next/link';
import { CityInfo } from '@/lib/city-slugs';

interface CityHeroProps {
  city: CityInfo;
  activeSalesCount: number;
  totalItemsCount: number;
  lastUpdated: Date;
}

export function CityHero({
  city,
  activeSalesCount,
  totalItemsCount,
  lastUpdated,
}: CityHeroProps) {
  const formattedPop = city.population.toLocaleString();
  const lastUpdatedStr = new Date(lastUpdated).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <section className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-900 dark:to-slate-800 py-12 px-4 md:px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-3">
          Top Deals &amp; Finds in {city.name}, {city.state}
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-300 mb-6">
          Estate sales, yard sales, auctions, flea markets, and more — discover
          this week&apos;s best deals.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm">
            <p className="text-3xl font-bold text-slate-900 dark:text-white">
              {activeSalesCount}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Active sales
            </p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm">
            <p className="text-3xl font-bold text-slate-900 dark:text-white">
              {totalItemsCount}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Items listed
            </p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Updated
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
              {lastUpdatedStr}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href={`/search?city=${city.slug}`}
            className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
          >
            Search All Deals
          </Link>
          <Link
            href={`/bounties/new?city=${city.slug}`}
            className="inline-flex items-center justify-center px-6 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white font-semibold rounded-lg transition-colors"
          >
            Post a Bounty
          </Link>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 mt-6">
          {city.name} population: {formattedPop}
        </p>
      </div>
    </section>
  );
}
