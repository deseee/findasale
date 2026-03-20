/**
 * Cities Index Page — SEO Landing Pages
 * Displays all cities with active estate sales.
 * Each city card shows: city name, state, active sales count, last sale date.
 * Route: /cities
 */

import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import Layout from '../../components/Layout';

interface CityStats {
  city: string;
  state: string;
  activeSales: number;
  totalSales: number;
  lastSaleDate?: string;
}

const CitiesPage = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['cities'],
    queryFn: async () => {
      const response = await api.get('/sales/cities');
      return response.data;
    },
  });

  const cities: CityStats[] = data?.cities || [];
  const sortedCities = cities.sort((a, b) => b.activeSales - a.activeSales);

  return (
    <Layout>
      <Head>
        <title>Estate Sales by City | FindA.Sale</title>
        <meta
          name="description"
          content="Browse upcoming estate sales by city near you. Find furniture, antiques, and collectibles in your area on FindA.Sale."
        />
        <link rel="canonical" href="https://finda.sale/cities" />
        <meta property="og:title" content="Estate Sales by City | FindA.Sale" />
        <meta
          property="og:description"
          content="Find local estate sales near you. Browse by city and discover furniture, antiques, and more."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://finda.sale/cities" />
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 pt-8 pb-24">

          {/* Header */}
          <div className="mb-8 text-center">
            <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-3">
              Estate Sales by City
            </h1>
            <p className="text-warm-600 dark:text-warm-400 text-lg">
              Browse sales in your area
            </p>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-32 bg-warm-100 dark:bg-gray-700 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : sortedCities.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-warm-500 dark:text-warm-400 text-lg">No cities with sales yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sortedCities.map((cityData) => {
                const lastSaleDate = cityData.lastSaleDate
                  ? new Date(cityData.lastSaleDate).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })
                  : null;

                return (
                  <Link
                    key={`${cityData.city}-${cityData.state}`}
                    href={`/city/${encodeURIComponent(cityData.city)}`}
                    className="card p-6 hover:shadow-lg transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100">
                          {cityData.city}
                        </h2>
                        <p className="text-sm text-warm-500 dark:text-warm-400 mt-1">
                          {cityData.state}
                        </p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <div className="text-3xl font-bold text-amber-600">
                          {cityData.activeSales}
                        </div>
                        <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                          active sale{cityData.activeSales !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-warm-200 dark:border-gray-700 flex items-center justify-between text-xs text-warm-500 dark:text-warm-400">
                      <span>{cityData.totalSales} total sale{cityData.totalSales !== 1 ? 's' : ''}</span>
                      {lastSaleDate && (
                        <span>Last: {lastSaleDate}</span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Back to Home */}
          <div className="mt-10 text-center">
            <Link
              href="/"
              className="text-amber-600 hover:text-amber-700 font-medium text-sm"
            >
              ← Back to home
            </Link>
          </div>

        </div>
      </div>
    </Layout>
  );
};

export default CitiesPage;
