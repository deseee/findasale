/**
 * FindA.Sale Home Page
 *
 * Main entry point for shoppers. Shows:
 * - Hero section with value prop
 * - Search/filter for nearby sales
 * - Featured sales grid
 * - Quick navigation to key pages
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import SaleCard from '../components/SaleCard';
import { SaleCardSkeleton } from '../components/SkeletonCards';
import InstallPrompt from '../components/InstallPrompt';
import Head from 'next/head';
import Link from 'next/link';

const HomePage = () => {
  const [city, setCity] = useState('');

  // Fetch featured sales
  const { data: featuredSales, isLoading: salesLoading } = useQuery({
    queryKey: ['sales', 'featured'],
    queryFn: async () => {
      const response = await api.get('/sales/featured', { params: { limit: 9 } });
      return response.data;
    },
  });

  const handleCitySearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (city.trim()) {
      window.location.href = `/city/${encodeURIComponent(city)}`;
    }
  };

  return (
    <>
      <Head>
        <title>FindA.Sale - Find Estate Sales Near You</title>
        <meta
          name="description"
          content="Find and attend estate sales near you. Buy quality items at great prices or sell your estate items online."
        />
      </Head>

      <div className="min-h-screen bg-white">
        {/* Hero Section */}
        <section className="bg-gradient-to-r from-amber-50 to-orange-50 py-16 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-warm-900 mb-4">
              Find Estate Sales Near You
            </h1>
            <p className="text-xl text-warm-600 mb-8">
              Discover quality items at estate sales or manage your own sale online.
            </p>

            {/* Search Bar */}
            <form onSubmit={handleCitySearch} className="max-w-md mx-auto flex gap-3 mb-8">
              <input
                type="text"
                placeholder="Search by city..."
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="flex-1 px-4 py-3 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
              <button
                type="submit"
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
              >
                Search
              </button>
            </form>

            <div className="flex gap-4 justify-center flex-wrap">
              <Link href="/about" className="text-amber-600 hover:underline font-medium">
                Learn more
              </Link>
              <Link href="/faq" className="text-amber-600 hover:underline font-medium">
                FAQ
              </Link>
            </div>
          </div>
        </section>

        {/* Featured Sales Section */}
        <section className="max-w-6xl mx-auto px-4 py-16">
          <h2 className="text-3xl font-bold text-warm-900 mb-8">Featured Sales</h2>

          {salesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <SaleCardSkeleton key={i} />
              ))}
            </div>
          ) : featuredSales && featuredSales.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredSales.map((sale: any) => (
                <SaleCard key={sale.id} sale={sale} />
              ))}
            </div>
          ) : (
            <p className="text-warm-600 text-center py-8">No sales currently available. Check back soon!</p>
          )}
        </section>
      </div>

      <InstallPrompt />
    </>
  );
};

export default HomePage;
