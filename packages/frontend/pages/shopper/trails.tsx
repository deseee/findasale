import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMyTrails } from '../../hooks/useTrails';
import { useAuth } from '../../components/AuthContext';
import EmptyState from '../../components/EmptyState';
import Skeleton from '../../components/Skeleton';

export default function MyTrailsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const { data, isLoading } = useMyTrails();

  // Redirect if not logged in
  React.useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  if (authLoading || isLoading) {
    return (
      <>
        <Head>
          <title>My Treasure Trails | FindA.Sale</title>
        </Head>
        <div className="max-w-6xl mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold mb-8 text-warm-900 dark:text-warm-100">My Treasure Trails</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </>
    );
  }

  const trails = data?.trails || [];
  const totalCount = data?.total || 0;

  return (
    <>
      <Head>
        <title>My Treasure Trails | FindA.Sale</title>
        <meta name="description" content="Your custom estate sale routes and favorites" />
      </Head>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100">My Treasure Trails</h1>
          <Link
            href="/shopper/trails/create"
            className="px-4 py-2 bg-sage-600 dark:bg-sage-500 text-white rounded-lg hover:bg-sage-700 dark:hover:bg-sage-600 transition font-semibold"
          >
            Create Trail
          </Link>
        </div>

        {trails.length === 0 ? (
          <EmptyState
            heading="No Treasure Trails Yet"
            subtext="Create your first custom route through nearby sales to find your treasures."
            cta={{
              label: 'Create Trail',
              href: '/shopper/trails/create',
            }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {trails.map((trail: any) => (
              <Link
                key={trail.id}
                href={`/shopper/trails/${trail.id}`}
                className="p-6 rounded-lg border border-warm-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-lg dark:hover:shadow-lg dark:shadow-black/20 transition"
              >
                <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-2">
                  {trail.name}
                </h3>
                {trail.description && (
                  <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">
                    {trail.description}
                  </p>
                )}

                <div className="space-y-2 text-sm text-warm-700 dark:text-warm-300">
                  <div className="flex justify-between">
                    <span>Stops:</span>
                    <span className="font-semibold">{trail.stops?.length || 0}</span>
                  </div>

                  {trail.totalDistanceKm && (
                    <div className="flex justify-between">
                      <span>Distance:</span>
                      <span className="font-semibold">{trail.totalDistanceKm.toFixed(1)} km</span>
                    </div>
                  )}

                  {trail.totalDurationMin && (
                    <div className="flex justify-between">
                      <span>Est. Time:</span>
                      <span className="font-semibold">{Math.round(trail.totalDurationMin)} min</span>
                    </div>
                  )}

                  {trail.isCompleted && (
                    <div className="flex items-center gap-2 pt-2 border-t border-warm-200 dark:border-gray-700">
                      <span className="text-green-600 dark:text-green-400">✓</span>
                      <span className="font-semibold text-green-600 dark:text-green-400">Completed</span>
                    </div>
                  )}

                  {trail.isPublic && (
                    <div className="pt-2 text-sage-600 dark:text-sage-400 text-xs">
                      🔗 Publicly shareable
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}

        <p className="text-center text-sm text-warm-600 dark:text-warm-400 mt-8">
          {totalCount} trail{totalCount !== 1 ? 's' : ''} total
        </p>
      </div>
    </>
  );
}
