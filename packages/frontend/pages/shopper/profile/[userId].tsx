/**
 * Feature #86: Public Shopper Profile Page
 *
 * Page: /shopper/profile/[userId]
 * - Display public explorer rank, badge, specialties, and recent finds
 * - Show collector passport data for the shopper
 * - "Follow" button disabled pending schema changes (BLOCKED)
 */

import React, { useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { usePublicPassport } from '@/hooks/useCollectorPassport';
import { RankBadge, ExplorerRank } from '@/components/RankBadge';

/**
 * Calculate Explorer rank based on totalFinds (proxy for XP)
 * Threshold mapping from xpService.ts adapted to totalFinds:
 * - INITIATE: 0-9 finds
 * - SCOUT: 10-29 finds
 * - RANGER: 30-79 finds
 * - SAGE: 80-199 finds
 * - GRANDMASTER: 200+ finds
 */
function getRankFromFinds(totalFinds: number): ExplorerRank {
  if (totalFinds >= 200) return 'GRANDMASTER';
  if (totalFinds >= 80) return 'SAGE';
  if (totalFinds >= 30) return 'RANGER';
  if (totalFinds >= 10) return 'SCOUT';
  return 'INITIATE';
}

interface PublicProfile {
  id: string;
  bio: string | null;
  specialties: string[];
  categories: string[];
  totalFinds: number;
  isPublic: boolean;
  createdAt: string;
  user: {
    id: string;
    name: string;
  };
}

export default function ShopperProfilePage() {
  const router = useRouter();
  const { userId } = router.query;

  const { profile, isLoading, error } = usePublicPassport(
    typeof userId === 'string' ? userId : null
  );

  const explorerRank = useMemo(() => {
    if (!profile) return 'INITIATE' as ExplorerRank;
    return getRankFromFinds(profile.totalFinds);
  }, [profile]);

  if (isLoading) {
    return (
      <>
        <Head>
          <title>Explorer Profile - FindA.Sale</title>
        </Head>
        <div className="max-w-3xl mx-auto py-8 px-4">
          <div className="animate-pulse space-y-4">
            <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded w-64" />
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-32" />
            <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </div>
      </>
    );
  }

  if (error || !profile) {
    return (
      <>
        <Head>
          <title>Profile Not Found - FindA.Sale</title>
        </Head>
        <div className="max-w-3xl mx-auto py-8 px-4 text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Profile Not Found
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            This explorer's profile doesn't exist or is private.
          </p>
          <Link
            href="/shopper/leaderboard"
            className="inline-block px-6 py-2 bg-[#8fb897] text-white rounded-lg hover:bg-[#7ba680] font-medium"
          >
            Back to Leaderboard
          </Link>
        </div>
      </>
    );
  }

  const joinDate = new Date(profile.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
  });

  return (
    <>
      <Head>
        <title>{profile.user.name}'s Profile - FindA.Sale</title>
        <meta name="description" content={`Explore ${profile.user.name}'s collection interests and recent finds on FindA.Sale`} />
      </Head>

      <div className="max-w-3xl mx-auto py-8 px-4 dark:bg-gray-900 dark:text-warm-100">
        {/* Header Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-8">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-8">
            {/* Rank Badge */}
            <div className="flex flex-col items-center">
              <RankBadge rank={explorerRank} size="lg" />
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                {profile.totalFinds} {profile.totalFinds === 1 ? 'find' : 'finds'}
              </p>
            </div>

            {/* Profile Info */}
            <div className="flex-1">
              <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                {profile.user.name}
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Joined {joinDate}
              </p>

              {/* Bio */}
              {profile.bio && (
                <p className="text-gray-700 dark:text-gray-300 italic mb-4 leading-relaxed">
                  "{profile.bio}"
                </p>
              )}

              {/* Follow Button (Blocked) */}
              <div className="flex items-center gap-3">
                <button
                  disabled
                  className="px-6 py-2 bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400 rounded-lg font-medium cursor-not-allowed opacity-50"
                  title="Follow feature coming soon"
                >
                  Follow
                </button>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Coming soon
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Collection Interests Section */}
        {(profile.specialties.length > 0 || profile.categories.length > 0) && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
              Collection Interests
            </h2>

            {/* Specialties */}
            {profile.specialties.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
                  Specialties
                </h3>
                <div className="flex flex-wrap gap-2">
                  {profile.specialties.map((specialty) => (
                    <span
                      key={specialty}
                      className="inline-block bg-[#f0f7f3] text-[#5a6f65] px-3 py-1 rounded-full text-sm font-medium"
                    >
                      {specialty}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Categories */}
            {profile.categories.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
                  Categories
                </h3>
                <div className="flex flex-wrap gap-2">
                  {profile.categories.map((category) => (
                    <span
                      key={category}
                      className="inline-block bg-blue-50 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full text-sm font-medium"
                    >
                      {category}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {profile.specialties.length === 0 && profile.categories.length === 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 text-center">
            <p className="text-gray-600 dark:text-gray-400">
              This explorer hasn't shared their collection interests yet.
            </p>
          </div>
        )}

        {/* Navigation */}
        <div className="mt-8">
          <Link
            href="/shopper/leaderboard"
            className="text-[#8fb897] hover:text-[#7ba680] font-medium flex items-center gap-2"
          >
            ← Back to Leaderboard
          </Link>
        </div>
      </div>
    </>
  );
}
