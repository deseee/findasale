/**
 * Organizer Profile Page
 *
 * Public-facing profile showing:
 * - Organizer info and badges
 * - All their active sales
 * - Ratings/reviews
 * - Contact info
 */

import React from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import SaleCard from '../../components/SaleCard';
import BadgeDisplay from '../../components/BadgeDisplay';
import Head from 'next/head';
import Link from 'next/link';

const OrganizerProfilePage = () => {
  const router = useRouter();
  const { id } = router.query;

  const { data: organizer, isLoading: organizerLoading } = useQuery({
    queryKey: ['organizer', id],
    queryFn: async () => {
      const response = await api.get(`/organizers/${id}`);
      return response.data;
    },
    enabled: !!id,
  });

  const { data: sales, isLoading: salesLoading } = useQuery({
    queryKey: ['organizer-sales', id],
    queryFn: async () => {
      const response = await api.get(`/organizers/${id}/sales`);
      return response.data;
    },
    enabled: !!id,
  });

  if (organizerLoading) return <div>Loading...</div>;
  if (!organizer) return <div>Organizer not found</div>;

  return (
    <>
      <Head>
        <title>{organizer.businessName} - FindA.Sale</title>
        <meta name="description" content={`View sales from ${organizer.businessName}`} />
      </Head>
      <div className="min-h-screen bg-white">
        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* Profile Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-warm-900 mb-2">{organizer.businessName}</h1>
            <p className="text-warm-600 mb-4">{organizer.bio || 'Professional estate sale organizer'}</p>
            <BadgeDisplay badges={organizer.badges || []} />
          </div>

          {/* Contact */}
          <div className="card p-6 mb-8">
            <h2 className="text-xl font-semibold text-warm-900 mb-4">Contact</h2>
            <p className="text-warm-600">
              {organizer.email && (
                <>
                  Email:{' '}
                  <a href={`mailto:${organizer.email}`} className="text-amber-600 hover:underline">
                    {organizer.email}
                  </a>
                </>
              )}
            </p>
          </div>

          {/* Sales */}
          <h2 className="text-2xl font-bold text-warm-900 mb-6">Active Sales</h2>
          {salesLoading ? (
            <p>Loading sales...</p>
          ) : sales && sales.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sales.map((sale: any) => (
                <SaleCard key={sale.id} sale={sale} />
              ))}
            </div>
          ) : (
            <p className="text-warm-600">No active sales at the moment.</p>
          )}
        </div>
      </div>
    </>
  );
};

export default OrganizerProfilePage;
