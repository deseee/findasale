import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import BadgeDisplay from '../../components/BadgeDisplay';

interface Badge {
  id: string;
  name: string;
  description: string;
  iconUrl?: string;
}

interface ShopperProfile {
  id: string;
  name: string;
  createdAt: string;
  role: string;
  streakPoints: number;
  reputationScore: number;
  totalPurchases: number;
  totalFavorites: number;
  totalWishlists: number;
  totalReviews: number;
  streakDays: number;
  badges: Badge[];
}

const ShopperProfilePage = () => {
  const router = useRouter();
  const { id } = router.query;

  const { data: profile, isLoading, isError } = useQuery({
    queryKey: ['shopper', id],
    queryFn: async () => {
      const response = await api.get(`/users/${id}/public`);
      return response.data as ShopperProfile;
    },
    enabled: !!id,
  });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (isError || !profile) return <div className="min-h-screen flex items-center justify-center">Shopper not found</div>;

  const memberSince = new Date(profile.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-warm-50">
      <Head>
        <title>{profile.name} – Shopper Profile – FindA.Sale</title>
        <meta name="description" content={`${profile.name}'s estate sale shopper profile on FindA.Sale`} />
      </Head>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Link href="/" className="inline-flex items-center text-amber-600 hover:text-amber-800 mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          Back to Home
        </Link>

        {/* Profile header */}
        <div className="bg-white rounded-lg shadow-md p-8 mb-8">
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              <h1 className="text-4xl font-bold text-warm-900 mb-2">{profile.name}</h1>
              <p className="text-warm-600 text-sm">Member since {memberSince}</p>
            </div>
            <div className="text-right">
              <Link
                href={`/messages/new?userId=${profile.id}`}
                className="inline-block bg-amber-600 text-white px-6 py-2 rounded-lg hover:bg-amber-700 transition-colors font-medium"
              >
                Message
              </Link>
            </div>
          </div>

          {/* Badges section */}
          {profile.badges && profile.badges.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-warm-900 mb-3">Badges & Recognition</h2>
              <BadgeDisplay badges={profile.badges} size="lg" />
            </div>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Purchases Made" value={profile.totalPurchases} />
            <StatCard label="Favorites" value={profile.totalFavorites} />
            <StatCard label="Wishlists Created" value={profile.totalWishlists} />
            <StatCard label="Visit Streak" value={`${profile.streakDays} days`} />
          </div>

          {/* Reputation score */}
          <div className="mt-8 pt-6 border-t border-warm-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-warm-600">Reputation Score</p>
                <p className="text-3xl font-bold text-warm-900">{profile.reputationScore}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-warm-600">Total Reviews Left</p>
                <p className="text-3xl font-bold text-amber-600">{profile.totalReviews}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Info section */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-warm-900 mb-4">About This Shopper</h2>
          <p className="text-warm-600">
            {profile.name} has been an active member of the FindA.Sale community since {memberSince}.
            With {profile.totalPurchases} purchase{profile.totalPurchases !== 1 ? 's' : ''} and {profile.totalReviews} review{profile.totalReviews !== 1 ? 's' : ''} left,
            they're a valued member of our community.
          </p>
          {profile.streakDays > 0 && (
            <p className="text-warm-600 mt-4">
              Currently on a {profile.streakDays}-day visit streak! 🔥
            </p>
          )}
        </div>
      </main>
    </div>
  );
};

const StatCard = ({ label, value }: { label: string; value: string | number }) => (
  <div className="bg-warm-50 rounded-lg p-4 text-center">
    <p className="text-sm text-warm-600 mb-2">{label}</p>
    <p className="text-2xl font-bold text-warm-900">{value}</p>
  </div>
);

export default ShopperProfilePage;
