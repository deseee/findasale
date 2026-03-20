/**
 * Feature #40+#44: Hub Landing Page
 * Public hub page showing all member sales and event info
 */

import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useHub } from '../../hooks/useHubs';
import { useAuth } from '../../components/AuthContext';

export default function HubDetailPage() {
  const router = useRouter();
  const { slug } = router.query;
  const { user } = useAuth();

  const { data, isLoading, error } = useHub(slug as string);

  if (!slug || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sage-50 to-white flex items-center justify-center">
        <div className="animate-pulse">Loading hub...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sage-50 to-white">
        <div className="max-w-6xl mx-auto px-4 py-12 text-center">
          <h1 className="text-2xl font-bold text-sage-900 mb-4">Hub Not Found</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            The hub you're looking for doesn't exist or has been removed.
          </p>
          <Link href="/hubs" className="text-sage-600 hover:text-sage-700 font-medium">
            ← Back to Hubs
          </Link>
        </div>
      </div>
    );
  }

  const hub = data?.hub;
  if (!hub) return null;

  const eventDate = hub.saleDate ? new Date(hub.saleDate) : null;
  const daysUntilEvent = eventDate ? Math.ceil((eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

  return (
    <>
      <Head>
        <title>{hub.name} - FindA.Sale</title>
        <meta name="description" content={hub.description || `Browse ${hub.name} with ${hub.sales.length} estate sales`} />
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-sage-50 to-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Header with Event Banner */}
          {eventDate && hub.eventName && (
            <div className="mb-8 bg-gradient-to-r from-sage-600 to-sage-700 text-white rounded-lg p-6 border-l-4 border-sage-300">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-3xl">🎉</span>
                <h2 className="text-2xl font-bold">{hub.eventName}</h2>
              </div>
              <p className="text-sage-100 mb-2">
                {daysUntilEvent && daysUntilEvent > 0
                  ? `Happening in ${daysUntilEvent} days`
                  : daysUntilEvent === 0
                  ? 'Happening today!'
                  : 'Event in progress'}
              </p>
              <p className="text-lg font-semibold">
                {eventDate.toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          )}

          {/* Hub Info */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-8">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-4xl font-bold text-sage-900 mb-2">{hub.name}</h1>
                {hub.organizerName && (
                  <p className="text-gray-600 dark:text-gray-400">Hosted by <span className="font-semibold">{hub.organizerName}</span></p>
                )}
              </div>
            </div>

            {hub.description && (
              <p className="text-gray-700 dark:text-gray-300 mb-6 leading-relaxed">{hub.description}</p>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6 border-t border-gray-200 dark:border-gray-700">
              <div>
                <div className="text-2xl font-bold text-sage-600">{hub.stats.totalSales}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Sales</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-sage-600">{hub.stats.totalItems}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Items</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-sage-600">
                  ${hub.stats.priceRangeUSD[0].toFixed(0)}-${hub.stats.priceRangeUSD[1].toFixed(0)}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Price Range</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-sage-600">{hub.radiusKm} km</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Radius</div>
              </div>
            </div>
          </div>

          {/* Sales List */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-sage-900 mb-4">Member Sales</h2>
            <div className="grid grid-cols-1 gap-4">
              {hub.sales.map((sale) => {
                const startDate = new Date(sale.startDate);
                const endDate = new Date(sale.endDate);
                return (
                  <Link
                    key={sale.id}
                    href={`/sales/${sale.id}`}
                    className="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-shadow p-6 group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-sage-900 group-hover:text-sage-700 transition-colors">
                          {sale.title}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          📍 {sale.address}, {sale.city}, {sale.state}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">by {sale.organizerName}</p>
                      </div>
                      <div className="text-right ml-4">
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {startDate.toLocaleDateString()} - {endDate.toLocaleDateString()}
                        </div>
                        <div className="text-sm font-medium text-sage-600 mt-2">View →</div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* CTA */}
          {user?.role === 'ORGANIZER' && (
            <div className="bg-sage-50 rounded-lg p-6 border border-sage-200 text-center">
              <p className="text-gray-700 dark:text-gray-300 mb-4">Interested in joining this hub?</p>
              <Link
                href="/organizer/hubs"
                className="inline-block bg-sage-600 hover:bg-sage-700 text-white font-medium py-2 px-6 rounded-lg transition-colors"
              >
                Manage Your Hubs
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
