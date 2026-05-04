import Link from 'next/link';

interface RecentSale {
  id: string;
  title: string;
  address: string;
  startDate: string;
  endDate: string;
  organizerName?: string;
  status: 'listing' | 'active' | 'ended';
}

interface CityRecentSalesProps {
  citySlug: string;
  sales: RecentSale[];
}

const statusColors: Record<string, string> = {
  listing: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  ended: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CityRecentSales({ citySlug, sales }: CityRecentSalesProps) {
  // Convert "chicago-il" → "Chicago, IL"
  const parts = citySlug.split('-');
  const state = parts[parts.length - 1].toUpperCase();
  const city = parts.slice(0, -1).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const displayName = `${city}, ${state}`;

  if (!sales.length) {
    return (
      <section className="py-12 px-4 md:px-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-8">
            Recent Sales in {displayName}
          </h2>
          <p className="text-slate-600 dark:text-slate-400">
            No active sales listed yet. Check back soon!
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="py-12 px-4 md:px-8 bg-slate-50 dark:bg-slate-900">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
          Active & Upcoming Sales
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mb-8">
          Happening now or coming soon in your area
        </p>

        <div className="space-y-3">
          {sales.map((sale) => (
            <Link
              key={sale.id}
              href={`/sales/${sale.id}`}
              className="block bg-white dark:bg-slate-800 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow border border-slate-200 dark:border-slate-700"
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white truncate hover:text-blue-600 dark:hover:text-blue-400">
                    {sale.title}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 truncate">
                    {sale.address}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {formatDate(sale.startDate)} — {formatDate(sale.endDate)}
                    </span>
                    {sale.organizerName && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        by {sale.organizerName}
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                    statusColors[sale.status]
                  }`}
                >
                  {sale.status === 'listing'
                    ? 'Coming Soon'
                    : sale.status === 'active'
                      ? 'Active Now'
                      : 'Ended'}
                </span>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link
            href={`/search?city=${citySlug}&activeOnly=true`}
            className="inline-flex items-center px-6 py-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-semibold transition-colors"
          >
            See all sales in this area →
          </Link>
        </div>
      </div>
    </section>
  );
}
