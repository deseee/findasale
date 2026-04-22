/**
 * Public Treasure Trails Discovery Page
 *
 * Shows all public, active trails organized by featured status.
 * No authentication required — accessible to all users.
 */

import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import TrailCard from '../../components/TrailCard';
import Skeleton from '../../components/Skeleton';
import Layout from '../../components/Layout';

interface Trail {
  id: string;
  name: string;
  description?: string;
  stops: Array<{ id: string }>;
  estimatedXp?: number;
  isFeatured?: boolean;
  heroImageUrl?: string;
  completionCount?: number;
  type?: string;
  minStopsRequired?: number;
}

export default function TrailsDiscoveryPage() {
  const { user } = useAuth();
  const [isClient, setIsClient] = useState(false);

  // Hydration guard
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Fetch public trails
  const { data, isLoading } = useQuery<{ trails: Trail[] }>({
    queryKey: ['trails'],
    queryFn: async () => {
      const res = await api.get('/trails');
      return res.data;
    },
  });

  const trails = data?.trails || [];

  // Separate featured from regular trails
  const featuredTrails = trails.filter((t) => t.isFeatured);
  const regularTrails = trails.filter((t) => !t.isFeatured);

  // Get user's completed trail IDs (requires login)
  const userCompletedIds = new Set<string>(); // Would populate from user data if available

  const trailsToShow = [...featuredTrails, ...regularTrails];

  if (!isClient) {
    return null; // Avoid hydration mismatch
  }

  return (
    <Layout>
      <Head>
        <title>Treasure Trails | FindA.Sale</title>
        <meta
          name="description"
          content="Discover curated local shopping routes anchored by FindA.Sale events. Earn XP, explore your community, and complete trails for exclusive rewards."
        />
      </Head>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Page header */}
        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-warm-900 dark:text-warm-100 mb-3">
            Treasure Trails
          </h1>
          <p className="text-lg text-warm-600 dark:text-warm-400">
            Curated local experiences anchored by a FindA.Sale event
          </p>
          <Link href="/shopper/trails" className="inline-block mt-3 text-sm text-sage-600 dark:text-sage-400 hover:underline">
            → View My Trails
          </Link>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-xl" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && trailsToShow.length === 0 && (
          <div className="text-center py-12">
            <div className="text-5xl mb-4">🗺️</div>
            <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-2">
              No trails nearby yet
            </h2>
            <p className="text-warm-600 dark:text-warm-400">
              Check back soon! Organizers are creating curated treasure trails in your area.
            </p>
          </div>
        )}

        {/* Featured trails section */}
        {!isLoading && featuredTrails.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-6 flex items-center gap-2">
              ⭐ Featured Trails
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredTrails.map((trail) => (
                <TrailCard
                  key={trail.id}
                  trail={trail}
                  userCompleted={userCompletedIds.has(trail.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Regular trails section */}
        {!isLoading && regularTrails.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-6">
              All Trails
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {regularTrails.map((trail) => (
                <TrailCard
                  key={trail.id}
                  trail={trail}
                  userCompleted={userCompletedIds.has(trail.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
