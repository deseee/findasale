import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import FavoriteButton from '../components/FavoriteButton';
import { SkeletonCard, SkeletonSaleCard } from '../components/SkeletonCards';

interface TrendingItem {
  id: string;
  title: string;
  price: number;
  category: string;
  condition: string;
  photos: { url: string }[];
  sale: { id: string; title: string; city: string; state: string };
  _count: { favorites: number };
}

interface TrendingSale {
  id: string;
  title: string;
  city: string;
  state: string;
  startDate: string;
  endDate: string;
  photoUrls: string[];
  organizer: { name: string };
  _count: { items: number; followers: number; rsvps: number };
}

export default function TrendingPage() {
  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ['trending-items'],
    queryFn: () => api.get('/trending/items').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ['trending-sales'],
    queryFn: () => api.get('/trending/sales').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const formatPrice = (p: number) => `$${p.toFixed(2)}`;
  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <>
      <Head>
        <title>Trending Now — FindA.Sale</title>
        <meta name="description" content="The hottest items across all upcoming sales this week" />
        <meta property="og:title" content="Trending Items — FindA.Sale" />
        <meta property="og:description" content="See what's trending at sales near you. Most-viewed and most-saved items across all active sales." />
        <meta property="og:url" content="https://finda.sale/trending" />
        <meta property="og:image" content="https://finda.sale/og-default.png" />
        <meta name="twitter:card" content="summary" />
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        {/* Hero */}
        <div className="bg-gradient-to-r from-amber-600 to-amber-500 text-white py-12 px-4">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-3xl md:text-4xl font-bold mb-2">🔥 Trending This Week</h1>
            <p className="text-amber-100 text-lg">The most-loved items and hottest sales right now</p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-10 space-y-12">

          {/* Trending Sales */}
          <section>
            <h2 className="text-2xl font-bold text-warm-900 dark:text-gray-100 mb-6">🏷️ Hot Sales</h2>
            {salesLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <SkeletonSaleCard key={i} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {(salesData?.sales || []).map((sale: TrendingSale, index: number) => (
                  <Link key={sale.id} href={`/sales/${sale.id}`}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden hover:shadow-md transition group cursor-pointer">
                      <div className="relative h-36 bg-warm-100">
                        {sale.photoUrls?.[0] ? (
                          <Image
                            src={sale.photoUrls[0]}
                            alt={sale.title}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="h-full flex items-center justify-center text-4xl">🏠</div>
                        )}
                        {index < 3 && (
                          <div className="absolute top-2 left-2 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                            #{index + 1} HOT
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <p className="font-semibold text-warm-900 dark:text-gray-100 text-sm line-clamp-1">{sale.title}</p>
                        <p className="text-xs text-warm-500 dark:text-gray-400 mt-0.5">{sale.city}, {sale.state}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-warm-500 dark:text-gray-400">
                          <span>❤️ {sale._count.followers}</span>
                          <span>📦 {sale._count.items} items</span>
                          <span>📅 {formatDate(sale.startDate)}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Trending Items */}
          <section>
            <h2 className="text-2xl font-bold text-warm-900 dark:text-gray-100 mb-6">⭐ Most Wanted Items</h2>
            {itemsLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {[...Array(8)].map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {(itemsData?.items || []).map((item: TrendingItem, index: number) => (
                  <Link key={item.id} href={`/items/${item.id}`}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden hover:shadow-md transition group cursor-pointer">
                      <div className="relative aspect-square bg-warm-100">
                        {item.photos?.[0] ? (
                          <Image
                            src={item.photos[0].url}
                            alt={item.title}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="h-full flex items-center justify-center text-4xl">📦</div>
                        )}
                        <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm text-xs font-semibold px-2 py-0.5 rounded-full text-warm-700">
                          ❤️ {item._count.favorites}
                        </div>
                        {index < 3 && (
                          <div className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                            🔥 Hot
                          </div>
                        )}
                        <div className="absolute top-2 right-2">
                          <FavoriteButton itemId={item.id} variant="icon" size="md" />
                        </div>
                      </div>
                      <div className="p-3">
                        <p className="font-semibold text-warm-900 dark:text-gray-100 text-sm line-clamp-2">{item.title}</p>
                        <p className="text-amber-600 dark:text-amber-400 font-bold mt-1">{formatPrice(item.price)}</p>
                        <p className="text-xs text-warm-400 dark:text-gray-400 mt-0.5 truncate">{item.sale.title}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* CTA */}
          <div className="text-center py-8">
            <p className="text-warm-600 dark:text-gray-400 mb-4">Looking for something specific?</p>
            <Link href="/search" className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-8 rounded-xl transition">
              Browse All Sales →
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
