import React from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { usePublicTrail } from '../../hooks/useTrails';
import { useAuth } from '../../components/AuthContext';
import EmptyState from '../../components/EmptyState';
import Skeleton from '../../components/Skeleton';

export default function PublicTrailPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { shareToken } = router.query;
  const { data: trail, isLoading, isError } = usePublicTrail(
    typeof shareToken === 'string' ? shareToken : null
  );

  if (isLoading) {
    return (
      <>
        <div className="max-w-2xl mx-auto px-4 py-8">
          <Skeleton className="h-12 mb-6" />
          <Skeleton className="h-32" />
        </div>
      </>

    );
  }

  if (isError || !trail) {
    return (
      <>
        <div className="max-w-2xl mx-auto px-4 py-8">
          <EmptyState heading="Trail Not Found" subtext="This treasure trail no longer exists or has been made private." />
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>{trail.name} | Treasure Trail | FindA.Sale</title>
        <meta name="description" content={trail.description || 'A curated treasure trail of sales'} />
      </Head>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{trail.name}</h1>
            {trail.user && (
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                Created by <strong>{trail.user.name}</strong>
              </p>
            )}
            {trail.description && (
              <p className="text-slate-600 dark:text-slate-400 mt-3">{trail.description}</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6 p-4 bg-slate-50 dark:bg-slate-700 rounded-lg">
            <div>
              <p className="text-xs text-slate-600 dark:text-slate-400">Sales to Visit</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {trail.stops?.length || 0}
              </p>
            </div>
            {trail.totalDistanceKm && (
              <div>
                <p className="text-xs text-slate-600 dark:text-slate-400">Total Distance</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {trail.totalDistanceKm.toFixed(1)} km
                </p>
              </div>
            )}
            {trail.totalDurationMin && (
              <div>
                <p className="text-xs text-slate-600 dark:text-slate-400">Est. Time</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {Math.round(trail.totalDurationMin)} min
                </p>
              </div>
            )}
          </div>

          {trail.stops && trail.stops.length > 0 && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Sales on This Trail</h2>
              <div className="space-y-3">
                {trail.stops.map((stop: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg flex items-start gap-3"
                  >
                    <div className="flex-shrink-0 w-8 h-8 bg-sage-100 dark:bg-sage-900 rounded-full flex items-center justify-center font-bold text-sage-900 dark:text-sage-100">
                      {stop.order}
                    </div>
                    <div className="flex-grow">
                      <p className="font-semibold text-slate-900 dark:text-white">Sale {stop.saleId}</p>
                      {stop.timeEstimateMin && (
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          ≈ {stop.timeEstimateMin} min
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {trail.highlights && trail.highlights.length > 0 && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Don't Miss These Items</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {trail.highlights.map((hl: any) => (
                  <div key={hl.id} className="p-3 border border-sage-200 dark:border-sage-700 rounded-lg bg-sage-50 dark:bg-sage-900">
                    <p className="font-semibold text-sage-900 dark:text-sage-100">{hl.item?.title}</p>
                    {hl.item?.price && (
                      <p className="text-sm text-sage-700 dark:text-sage-300">${(hl.item.price / 100).toFixed(2)}</p>
                    )}
                    {hl.note && (
                      <p className="text-xs text-sage-600 dark:text-sage-400 mt-1">{hl.note}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!user ? (
            <div className="p-4 bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg text-center">
              <p className="text-blue-900 dark:text-blue-100 mb-3">
                Create your own treasure trails to plan your sale adventures!
              </p>
              <a
                href="/login"
                className="inline-block px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 font-semibold transition"
              >
                Sign In to Create Trails
              </a>
            </div>
          ) : (
            <a
              href="/shopper/trails"
              className="block text-center px-4 py-2 bg-sage-600 dark:bg-sage-500 text-white rounded-lg hover:bg-sage-700 dark:hover:bg-sage-600 font-semibold transition"
            >
              Create Your Own Trail
            </a>
          )}
        </div>
      </div>
    </>
  );
}
