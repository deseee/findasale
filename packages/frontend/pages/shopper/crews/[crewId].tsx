/**
 * /shopper/crews/[crewId] - Crew Profile & Leaderboard
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../../../components/AuthContext';

interface Crew {
  id: string;
  name: string;
  slug: string;
  description: string;
  isPublic: boolean;
  memberCount: number;
  createdAt: string;
  founder: {
    id: string;
    name: string;
    profileSlug: string;
    guildXp: number;
    explorerRank: string;
  };
}

interface LeaderboardMember {
  rank: number;
  userId: string;
  role: string;
  joinedAt: string;
  user: {
    id: string;
    name: string;
    profileSlug: string;
    guildXp: number;
    explorerRank: string;
  };
}

const CrewProfilePage = () => {
  const router = useRouter();
  const { user } = useAuth();
  const { crewId } = router.query;

  const [crew, setCrew] = useState<Crew | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isMember, setIsMember] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    if (!crewId) return;

    const fetchCrew = async () => {
      try {
        const response = await fetch(`/api/crews/${crewId}`);
        if (!response.ok) throw new Error('Failed to fetch crew');
        const data = await response.json();
        setCrew(data);

        // Check if user is member
        if (user) {
          setIsMember(data.members.some((m: any) => m.userId === user.id));
        }
      } catch (err) {
        setError('Failed to load crew');
      } finally {
        setLoading(false);
      }
    };

    const fetchLeaderboard = async () => {
      try {
        const response = await fetch(`/api/crews/${crewId}/leaderboard`);
        if (!response.ok) throw new Error('Failed to fetch leaderboard');
        const data = await response.json();
        setLeaderboard(data.members);
      } catch (err) {
        console.error('Failed to load leaderboard');
      }
    };

    fetchCrew();
    fetchLeaderboard();
  }, [crewId, user]);

  const handleJoinCrew = async () => {
    if (!user) {
      router.push('/login');
      return;
    }

    setIsJoining(true);
    try {
      const response = await fetch(`/api/crews/${crewId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.message || 'Failed to join crew');
        setIsJoining(false);
        return;
      }

      setIsMember(true);
      setIsJoining(false);
      // Refresh crew data
      if (crewId) {
        const response = await fetch(`/api/crews/${crewId}`);
        if (response.ok) {
          const data = await response.json();
          setCrew(data);
        }
      }
    } catch (err) {
      setError('An error occurred');
      setIsJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-warm-600 dark:text-warm-400">Loading crew...</p>
      </div>
    );
  }

  if (!crew) {
    return (
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex flex-col items-center justify-center">
        <p className="text-warm-600 dark:text-warm-400 mb-4">Crew not found</p>
        <Link href="/shopper/crews" className="text-purple-600 hover:text-purple-700">
          Back to Crews
        </Link>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{crew.name} - Crews - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 py-12">
          {/* Header */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-8">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-2">
                  {crew.name}
                </h1>
                <p className="text-warm-600 dark:text-warm-400">
                  Founded by {crew.founder.name}
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-purple-600">
                  {crew.memberCount}
                </p>
                <p className="text-warm-600 dark:text-warm-400">Members</p>
              </div>
            </div>

            {crew.description && (
              <p className="text-warm-700 dark:text-warm-300 mb-6 leading-relaxed">
                {crew.description}
              </p>
            )}

            {error && (
              <div className="mb-4 p-3 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100 rounded-md">
                {error}
              </div>
            )}

            {!isMember && (
              <button
                onClick={handleJoinCrew}
                disabled={isJoining}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isJoining ? 'Joining...' : 'Join Crew'}
              </button>
            )}
            {isMember && (
              <p className="text-purple-600 dark:text-purple-300 font-semibold">
                ✓ You're a member
              </p>
            )}
          </div>

          {/* Leaderboard */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
            <div className="px-8 py-6 border-b border-warm-200 dark:border-gray-700">
              <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100">
                Leaderboard
              </h2>
            </div>

            {leaderboard.length > 0 ? (
              <div className="divide-y divide-warm-200 dark:divide-gray-700">
                {leaderboard.map((member) => (
                  <div
                    key={member.userId}
                    className="px-8 py-4 flex items-center justify-between hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center font-bold text-purple-600 dark:text-purple-300">
                        {member.rank}
                      </div>
                      <div>
                        <p className="font-semibold text-warm-900 dark:text-warm-100">
                          {member.user.name}
                        </p>
                        <p className="text-sm text-warm-500 dark:text-warm-400">
                          {member.role === 'FOUNDER' ? '👑 Founder' : 'Member'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-purple-600">
                        {member.user.guildXp.toLocaleString()} XP
                      </p>
                      <p className="text-sm text-warm-500 dark:text-warm-400">
                        {member.user.explorerRank}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-8 py-12 text-center text-warm-600 dark:text-warm-400">
                <p>No members yet</p>
              </div>
            )}
          </div>

          {/* Back Link */}
          <div className="mt-8">
            <Link
              href="/shopper/crews"
              className="text-purple-600 hover:text-purple-700 font-semibold"
            >
              ← Back to Crews
            </Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default CrewProfilePage;
