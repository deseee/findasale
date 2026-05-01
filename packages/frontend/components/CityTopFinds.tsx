import Link from 'next/link';
import Image from 'next/image';

interface TopFindItem {
  id: string;
  title: string;
  actualPrice: number;
  estimatedValue: number;
  markdownPercentage: number;
  condition?: string;
  photoUrl?: string;
}

interface CityTopFindsProps {
  citySlug: string;
  items: TopFindItem[];
}

export function CityTopFinds({ citySlug, items }: CityTopFindsProps) {
  if (!items.length) {
    return (
      <section className="py-12 px-4 md:px-8">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-8">
            Top Finds This Week
          </h2>
          <p className="text-slate-600 dark:text-slate-400">
            No recent sales in your area yet—check back soon!
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="py-12 px-4 md:px-8 bg-white dark:bg-slate-800">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
          Top Finds This Week
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mb-8">
          Best-valued items from recent estate sales, sorted by savings percentage
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/items/${item.id}`}
              className="group bg-white dark:bg-slate-700 rounded-lg overflow-hidden shadow-sm hover:shadow-lg transition-shadow"
            >
              <div className="relative aspect-video bg-slate-100 dark:bg-slate-600 overflow-hidden">
                {item.photoUrl ? (
                  <Image
                    src={item.photoUrl}
                    alt={item.title}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-600 dark:to-slate-700 text-slate-400 dark:text-slate-500">
                    No image
                  </div>
                )}
              </div>

              <div className="p-4">
                <h3 className="font-semibold text-slate-900 dark:text-white line-clamp-2 mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                  {item.title}
                </h3>

                {item.condition && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                    {item.condition}
                  </p>
                )}

                <div className="space-y-2 mb-4">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      Estimated
                    </span>
                    <span className="text-lg line-through text-slate-400 dark:text-slate-500">
                      ${item.estimatedValue.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      Sold for
                    </span>
                    <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                      ${item.actualPrice.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900 px-3 py-2 rounded text-center">
                  <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                    {item.markdownPercentage.toFixed(0)}% Savings
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link
            href={`/search?city=${citySlug}`}
            className="inline-flex items-center px-6 py-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-semibold transition-colors"
          >
            View all deals →
          </Link>
        </div>
      </div>
    </section>
  );
}
