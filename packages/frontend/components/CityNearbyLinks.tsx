import Link from 'next/link';
import { CityInfo } from '@/lib/city-slugs';

interface CityNearbyLinksProps {
  currentCity: CityInfo;
  nearbyCities: CityInfo[];
  topCategories: string[];
}

export function CityNearbyLinks({
  currentCity,
  nearbyCities,
  topCategories,
}: CityNearbyLinksProps) {
  return (
    <section className="py-12 px-4 md:px-8 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {/* Nearby Cities */}
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
              Nearby Cities
            </h3>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              Expand your hunt to neighboring areas:
            </p>
            <div className="flex flex-wrap gap-2">
              {nearbyCities.slice(0, 5).map((city) => (
                <Link
                  key={city.slug}
                  href={`/city/${city.slug}`}
                  className="px-4 py-2 bg-white dark:bg-slate-800 rounded-lg text-slate-900 dark:text-white hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-600 text-sm font-medium"
                >
                  {city.name}, {city.state}
                </Link>
              ))}
            </div>
          </div>

          {/* Popular Categories */}
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
              Popular in {currentCity.name}
            </h3>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              Browse by category:
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              {topCategories.map((category) => (
                <Link
                  key={category}
                  href={`/search?city=${currentCity.slug}&category=${encodeURIComponent(category)}`}
                  className="px-4 py-2 bg-white dark:bg-slate-800 rounded-lg text-slate-900 dark:text-white hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-600 text-sm font-medium"
                >
                  {category}
                </Link>
              ))}
            </div>
            <Link
              href={`/search?city=${currentCity.slug}`}
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
            >
              Browse all →
            </Link>
          </div>
        </div>

        {/* Footer Meta */}
        <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-700">
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
            Powered by real estate sale data | Last updated daily
          </p>
          <div className="text-center mt-4">
            <Link
              href="/organizer/signup"
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
            >
              Run your own sale in {currentCity.name} →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
