import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from '../components/AuthContext';
import { useOrganizerTier } from '../hooks/useOrganizerTier';
import ReferralWidget from '../components/ReferralWidget';

interface Bid {
  id: string;
  itemId: string;
  amount: number;
  item: {
    title: string;
    photoUrls: string[];
  };
  status: string; // WINNING, LOSING, WON, LOST
}

interface Referral {
  id: string;
  referredUser: {
    name: string;
    email: string;
  };
  createdAt: string;
}

const ProfilePage = () => {
  const { user } = useAuth();
  const { canAccess } = useOrganizerTier();

  // Fetch full user profile (includes verificationStatus not in JWT)
  const { data: profileData } = useQuery({
    queryKey: ['user-profile'],
    queryFn: async () => {
      const response = await api.get('/users/me');
      return response.data as { verificationStatus?: string };
    },
  });

  const verificationStatus = profileData?.verificationStatus || 'NONE';

  // Fetch user's bids
  const { data: bids = [], isError: bidsError, refetch: refetchBids } = useQuery({
    queryKey: ['user-bids'],
    queryFn: async () => {
      const response = await api.get('/users/me/bids');
      return response.data as Bid[];
    },
  });

  // Fetch user's referrals
  const { data: referrals = [], isError: referralsError, refetch: refetchReferrals } = useQuery({
    queryKey: ['user-referrals'],
    queryFn: async () => {
      const response = await api.get('/users/me/referrals');
      return response.data as Referral[];
    },
  });

  // Fetch user's badges (legacy endpoint)
  const { data: badgesData, isError: badgesError, refetch: refetchBadges } = useQuery({
    queryKey: ['user-badges'],
    queryFn: async () => {
      const response = await api.get('/users/me/points');
      return response.data;
    },
  });

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Please log in to view your profile</p>
      </div>
    );
  }

  // Check if user is organizer or admin — hide shopper-only sections (Hunt Pass, Bids, etc.)
  // Use user.role (single field, always reliable) NOT user.roles array (defaults to ["USER"] for legacy accounts)
  const isOrganizerOnly = user.role === 'ORGANIZER' || user.role === 'ADMIN';

  return (
    <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
      <Head>
        <title>Profile - FindA.Sale</title>
        <meta name="description" content="Your FindA.Sale profile" />
      </Head>

      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100">My Profile</h1>
        </div>

        {/* Profile Summary */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-8">
          <div className="flex items-center">
            <div className="bg-warm-200 border-2 border-dashed rounded-xl w-16 h-16" />
            <div className="ml-4">
              <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100">
                {user.name || user.email || 'User'}
              </h2>
              <p className="text-warm-600 dark:text-warm-400">{user.email}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 text-sm font-medium px-2.5 py-0.5 rounded">
                  {isOrganizerOnly ? 'Organizer' : user.role === 'USER' ? 'Shopper' : user.role}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ORGANIZER SECTIONS */}
        {isOrganizerOnly && (
          <>
            {/* Verification Status Card */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-8">
              <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-4">Verification Status</h2>
              <div className="flex items-center justify-between">
                <div>
                  {verificationStatus === 'VERIFIED' && (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 text-sm font-medium">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Verified Organizer
                      </span>
                    </div>
                  )}
                  {verificationStatus === 'PENDING' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 text-sm font-medium">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                      Verification Pending
                    </span>
                  )}
                  {(verificationStatus === 'NONE' || verificationStatus === 'REJECTED') && (
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-warm-600 dark:text-warm-400 text-sm">
                        {verificationStatus === 'REJECTED' ? 'Verification was not approved' : 'Not yet verified'}
                      </p>
                      <Link href="/organizer/settings?verification=true" className="text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 font-medium text-sm whitespace-nowrap">
                        Start Verification
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* My Sales Summary Card */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-8">
              <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-4">Your Sales</h2>
              <p className="text-warm-600 dark:text-warm-400 mb-4">Manage and track all your sales in one place.</p>
              <Link href="/organizer/dashboard" className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors">
                Go to Dashboard
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>

            {/* Quick Links Grid */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-8">
              <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-4">Quick Links</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Link href="/plan" className="block p-4 rounded-lg border border-warm-200 dark:border-gray-700 hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors">
                  <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-1">Plan a Sale</h3>
                  <p className="text-sm text-warm-600 dark:text-warm-400">Create and manage your next sale</p>
                </Link>
                <Link href="/organizer/settings" className="block p-4 rounded-lg border border-warm-200 dark:border-gray-700 hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors">
                  <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-1">Settings</h3>
                  <p className="text-sm text-warm-600 dark:text-warm-400">Manage your account</p>
                </Link>
                <Link href="/organizer/subscription" className="block p-4 rounded-lg border border-warm-200 dark:border-gray-700 hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors">
                  <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-1">Subscription</h3>
                  <p className="text-sm text-warm-600 dark:text-warm-400">Upgrade your tier</p>
                </Link>
                {canAccess('TEAMS') && (
                  <Link href="/organizer/workspace" className="block p-4 rounded-lg border border-warm-200 dark:border-gray-700 hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors">
                    <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-1">Workspace</h3>
                    <p className="text-sm text-warm-600 dark:text-warm-400">Manage your team</p>
                  </Link>
                )}
              </div>
            </div>
          </>
        )}

        {/* Explorer Rank Card — only for shoppers */}
        {!isOrganizerOnly && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-1">🏆 Explorer Rank</h2>
            <p className="text-warm-600 dark:text-warm-400 text-sm mb-4">
              Track your XP, rank up, and earn rewards.
            </p>
            <Link href="/shopper/loyalty" className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors">
              View Your Rank
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        )}

        {/* Badges Section — only for shoppers */}
        {!isOrganizerOnly && badgesData && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-4">Badges</h2>
            {badgesData.badges && badgesData.badges.length > 0 ? (
              <div className="flex flex-wrap gap-4">
                {badgesData.badges.map((badge: any) => (
                  <div key={badge.id} className="flex items-center bg-warm-50 dark:bg-gray-700 rounded-lg p-3">
                    {badge.iconUrl ? (
                      <img src={badge.iconUrl} alt={badge.name} className="w-10 h-10 mr-3" loading="lazy"/>
                    ) : (
                      <div className="bg-warm-200 dark:bg-warm-900/30 border-2 border-dashed rounded-xl w-10 h-10 mr-3" />
                    )}
                    <div>
                      <h3 className="font-semibold text-warm-900 dark:text-warm-100">{badge.name}</h3>
                      <p className="text-sm text-warm-600 dark:text-warm-400">{badge.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-warm-600 dark:text-warm-400 mb-2">No badges yet</p>
                <p className="text-sm text-warm-500 dark:text-warm-500">Start shopping to earn your first badge!</p>
              </div>
            )}
          </div>
        )}

        {!isOrganizerOnly && badgesError && (
          <div className="min-h-48 flex flex-col items-center justify-center bg-warm-50 dark:bg-gray-900 gap-4 rounded-lg p-6 mb-8">
            <p className="text-warm-700 dark:text-warm-300 text-lg">Failed to load badges.</p>
            <button onClick={() => refetchBadges()} className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg">Try again</button>
          </div>
        )}

        {/* My Bids Section — only for shoppers */}
        {!isOrganizerOnly && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-4">My Bids</h2>

            {bidsError ? (
              <div className="min-h-48 flex flex-col items-center justify-center bg-warm-50 dark:bg-gray-900 gap-4 rounded-lg p-6">
                <p className="text-warm-700 dark:text-warm-300 text-lg">Failed to load your bids.</p>
                <button onClick={() => refetchBids()} className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg">Try again</button>
              </div>
            ) : bids.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-warm-600 dark:text-warm-400 mb-4">You haven't placed any bids yet.</p>
                <Link
                  href="/"
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded inline-flex items-center"
                >
                  Browse Auctions
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-warm-200 dark:divide-gray-700">
                  <thead className="bg-warm-50 dark:bg-gray-700">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-warm-500 dark:text-warm-400 uppercase tracking-wider">
                        Item
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-warm-500 dark:text-warm-400 uppercase tracking-wider">
                        Your Bid
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-warm-500 dark:text-warm-400 uppercase tracking-wider">
                        Status
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-warm-500 dark:text-warm-400 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-warm-200 dark:divide-gray-700">
                    {bids.map((bid) => (
                      <tr key={bid.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            {bid.item.photoUrls && bid.item.photoUrls.length > 0 ? (
                              <img
                                src={bid.item.photoUrls[0]}
                                alt={bid.item.title}
                                className="h-10 w-10 rounded-md object-cover"
                                loading="lazy"/>
                            ) : (
                              <div className="bg-warm-200 border-2 border-dashed rounded-xl w-10 h-10" />
                            )}
                            <div className="ml-4">
                              <div className="text-sm font-medium text-warm-900 dark:text-warm-100">{bid.item.title}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-warm-900 dark:text-warm-100">
                          ${bid.amount.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            bid.status === 'WINNING' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' :
                            bid.status === 'WON' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300' :
                            bid.status === 'LOST' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' :
                            'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
                          }`}>
                            {bid.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <Link href={`/items/${bid.itemId}`} className="text-amber-600 hover:text-amber-800">
                            View Item
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Referrals Section — only for shoppers */}
        {!isOrganizerOnly && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-4">My Referrals</h2>
            {referralsError ? (
              <div className="min-h-32 flex flex-col items-center justify-center bg-warm-50 dark:bg-gray-900 gap-4 rounded-lg p-6">
                <p className="text-warm-700 dark:text-warm-300 text-lg">Failed to load referrals.</p>
                <button onClick={() => refetchReferrals()} className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg">Try again</button>
              </div>
            ) : referrals.length === 0 ? (
              <p className="text-warm-600 dark:text-warm-400">No referrals yet.</p>
            ) : (
              <div className="space-y-3">
                {referrals.map((ref) => (
                  <div key={ref.id} className="flex justify-between items-center border border-warm-200 dark:border-gray-700 rounded p-3 bg-warm-50 dark:bg-gray-700">
                    <div>
                      <p className="font-medium text-warm-900 dark:text-warm-100">{ref.referredUser.name || ref.referredUser.email}</p>
                      <p className="text-sm text-warm-500 dark:text-warm-400">{ref.referredUser.email}</p>
                    </div>
                    <span className="text-xs text-warm-500 dark:text-warm-400">
                      {new Date(ref.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Task #7: Referral Rewards Widget — only for shoppers */}
        {!isOrganizerOnly && <ReferralWidget />}

        {/* Push Notifications Settings */}
        {typeof window !== 'undefined' && 'Notification' in window && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-8">
            <h3 className="text-warm-800 dark:text-warm-200 font-semibold mb-4">Push Notifications</h3>
            {Notification.permission === 'granted' ? (
              <div className="flex items-center justify-between">
                <span className="text-warm-700 dark:text-warm-300 text-sm">Push notifications are enabled</span>
                <button type="button" onClick={async () => {
                  const reg = await navigator.serviceWorker.ready;
                  const sub = await reg.pushManager.getSubscription();
                  if (sub) { await sub.unsubscribe(); }
                }} className="text-sm text-red-600 hover:underline">Disable</button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-warm-600 dark:text-warm-400 text-sm">Push notifications are off</span>
                <button type="button" onClick={async () => {
                  await Notification.requestPermission();
                }} className="text-sm bg-amber-600 hover:bg-amber-700 text-white py-1 px-3 rounded-lg">Enable</button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default ProfilePage;
