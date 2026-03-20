/**
 * Feature #40: Sale Hubs Discovery Page
 * Browse and discover nearby hubs
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Head from 'next/head';
import { useNearbyHubs } from '../../hooks/useHubs';

export default function HubsPage() {
  const router = useRouter();
  const [lat, setLat] = useState<number | undefined>();
  const [lng, setLng] = useState<number | undefined>();
  const [radius, setRadius] = useState(10);
  const [page, setPage] = useState(1);
  const [locationError, setLocationError] = useState<string>('');

  // Get user location on mount
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLat(position.coords.latitude);
          setLng(position.coords.longitude);
        },
        (error) => {
          setLocationError('Unable to access your location. Please enable location services.');
          console.error('Geolocation error:', error);
        }
      );
    } else {
      setLocationError('Geolocation is not supported by your browser.');
    }
  }, []);

  const { data, isLoading, error } = useNearbyHubs(lat, lng, radius, page);

  return (
    <>
      <Head>
        <title>Discover Sale Hubs - FindA.Sale</title>
        <meta name="description" content="Discover nearby sale hubs and group estate sales" />
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-sage-50 to-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-sage-900 mb-4">Discover Sale Hubs</h1>
            <p className="text-lg text-sage-600 max-w-2xl mx-auto">
              Find coordinated groups of estate sales happening near you. Perfect for sale-hopping and planning your shopping route.
            </p>
          </div>

          {/* Location & Filters */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-8">
            {locationError && (
              <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
                {locationError}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Search Radius
                </label>
                <input
                  type="range"
                  min="1"
                  max="50"
                  value={radius}
                  onChange={(e) => {
                    setRadius(Number(e.target.value));
                    setPage(1);
                  }}
                  className="w-full h-2 bg-sage-200 rounded-lg appearance-none cursor-pointer"
                />
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">{radius} km</div>
              </div>

              {lat && lng && (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  📍 {lat.toFixed(4)}, {lng.toFixed(4)}
                </div>
              )}
            </div>
          </div>

          {/* Hubs Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-white dark:bg-gray-800 rounded-lg shadow-md h-48 animate-pulse"></div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center text-red-600 py-12">
              <p>Error loading hubs: {error instanceof Error ? error.message : 'Unknown error'}</p>
            </div>
          ) : !data?.hubs.length ? (
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400 text-lg">No hubs found in your area. Try increasing the search radius.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                {data.hubs.map((hub) => (
                  <Link
                    key={hub.id}
                    href={`/hubs/${hub.slug}`}
                    className="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-shadow overflow-hidden group"
                  >
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="text-lg font-semibold text-sage-900 group-hover:text-sage-700 transition-colors">
                            {hub.name}
                          </h3>
                          {hub.organizerName && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">by {hub.organizerName}</p>
                          )}
                        </div>
                      </div>

                      {/* Event Badge */}
                      {hub.saleDate && hub.eventName && (
                        <div className="mb-3 inline-block bg-sage-100 text-sage-800 text-xs font-semibold px-2 py-1 rounded">
                          🎉 {hub.eventName}
                        </div>
                      )}

                      {/* Stats */}
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-3">
                        <span>📍 {hub.saleCount} sales</span>
                        {hub.saleDate && (
                          <span>📅 {new Date(hub.saleDate).toLocaleDateString()}</span>
                        )}
                      </div>

                      {/* Call to Action */}
                      <div className="text-sm text-sage-600 group-hover:text-sage-700 font-medium">
                        View Hub →
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Pagination */}
              {data && (
                <div className="flex justify-center gap-2">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Page {page} of {Math.ceil(data.total / data.limit)}
                    </span>
                  </div>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page * data.limit >= data.total}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
