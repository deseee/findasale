/**
 * Sale Detail Page
 *
 * Main page for a specific estate sale. Shows:
 * - Sale info (dates, location, organizer)
 * - Item grid/list with search/filter
 * - Organizer contact and subscribe options
 * - Share functionality
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import ItemCard from '../../components/ItemCard';
import { ItemCardSkeleton } from '../../components/SkeletonCards';
import SaleShareButton from '../../components/SaleShareButton';
import SaleSubscription from '../../components/SaleSubscription';
import Head from 'next/head';
import Link from 'next/link';
import { format } from 'date-fns';

const SaleDetailPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  const { data: sale, isLoading: saleLoading } = useQuery({
    queryKey: ['sale', id],
    queryFn: async () => {
      const response = await api.get(`/sales/${id}`);
      return response.data;
    },
    enabled: !!id,
  });

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ['sale-items', id, searchQuery, page],
    queryFn: async () => {
      const response = await api.get(`/sales/${id}/items`, {
        params: { q: searchQuery, page, limit: 12 },
      });
      return response.data;
    },
    enabled: !!id,
  });

  if (!id) return null;

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM d, yyyy');
    } catch {
      return 'TBA';
    }
  };

  return (
    <>
      <Head>
        <title>{sale?.title || 'Sale'} - FindA.Sale</title>
        <meta name="description" content={sale?.description} />
      </Head>

      <div className="min-h-screen bg-white">
        {/* Hero Section */}
        {sale && (
          <>
            <div
              className="h-96 bg-cover bg-center relative"
              style={{
                backgroundImage: sale.photoUrls?.[0]
                  ? `url(${sale.photoUrls[0]})`
                  : 'linear-gradient(135deg, #f5e6d3 0%, #f0dcc4 100%)',
              }}
            >
              <div className="absolute inset-0 bg-black/30"></div>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-6 text-white">
                <h1 className="text-4xl font-bold mb-2">{sale.title}</h1>
                <p className="text-lg opacity-90">
                  {formatDate(sale.startDate)} – {formatDate(sale.endDate)}
                </p>
              </div>
            </div>

            {/* Info Section */}
            <div className="max-w-6xl mx-auto px-4 py-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
                {/* Details */}
                <div className="md:col-span-2">
                  <p className="text-warm-700 mb-6 leading-relaxed">{sale.description}</p>

                  <div className="card p-6 mb-6">
                    <h3 className="font-semibold text-warm-900 mb-4">Location</h3>
                    <p className="text-warm-700">
                      {sale.address}
                      <br />
                      {sale.city}, {sale.state} {sale.zip}
                    </p>
                  </div>

                  {/* Items Grid */}
                  <h2 className="text-2xl font-bold text-warm-900 mb-4">Items</h2>
                  <div className="mb-6">
                    <input
                      type="text"
                      placeholder="Search items..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setPage(1);
                      }}
                      className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  {itemsLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {[...Array(6)].map((_, i) => (
                        <ItemCardSkeleton key={i} />
                      ))}
                    </div>
                  ) : items && items.items && items.items.length > 0 ? (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                        {items.items.map((item: any) => (
                          <ItemCard key={item.id} item={item} />
                        ))}
                      </div>
                      {items.hasMore && (
                        <div className="flex justify-center">
                          <button
                            onClick={() => setPage((p) => p + 1)}
                            className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg"
                          >
                            Load More Items
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-warm-600 text-center py-8">No items found.</p>
                  )}
                </div>

                {/* Sidebar */}
                <div>
                  {/* Organizer Card */}
                  <div className="card p-6 mb-6">
                    <h3 className="font-semibold text-warm-900 mb-3">Organizer</h3>
                    <Link
                      href={`/organizers/${sale.organizer.id}`}
                      className="text-amber-600 hover:underline font-medium"
                    >
                      {sale.organizer.businessName}
                    </Link>
                  </div>

                  {/* Share Button */}
                  <SaleShareButton
                    saleId={sale.id}
                    saleTitle={sale.title}
                    saleDate={formatDate(sale.startDate)}
                    saleLocation={`${sale.city}, ${sale.state}`}
                  />

                  {/* Subscribe */}
                  <SaleSubscription saleId={sale.id} />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default SaleDetailPage;
