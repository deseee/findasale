import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from '../components/AuthContext';
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

const SALE_CATEGORIES = [
  'furniture', 'decor', 'vintage', 'textiles', 'collectibles', 'art',
  'antiques', 'jewelry', 'books', 'tools', 'electronics', 'clothing', 'home', 'other'
];

const ProfilePage = () => {
  const { user } = useAuth();
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState<string>('');

  useEffect(() => {
    if (user?.categoryInterests) {
      setSelectedInterests(user.categoryInterests);
    }
  }, [user?.categoryInterests]);

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

  // Phase 19: Fetch points, tier, and recent transactions
  const { data: pointsData, isError: pointsError, refetch: refetchPoints } = useQuery({
    queryKey: ['points'],
    queryFn: async () => {
      const response = await api.get('/points');
      return response.data as { points: number; tier: string; transactions: Array<{ id: string; type: string; points: number; description: string | null; createdAt: string }> };
    },
  });

  // Mutation for updating sale interests
  const updateInterestsMutation = useMutation({
    mutationFn: async (interests: string[]) => {
      const response = await api.patch('/users/me/interests', { categoryInterests: interests });
      return response.data;
    },
    onSuccess: () => {
      setSuccessMessage('Interests saved!');
      setTimeout(() => setSuccessMessage(''), 3000);
    },
    onError: () => {
      setSuccessMessage('Failed to save interests');
      setTimeout(() => setSuccessMessage(''), 3000);
    }
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
                {!isOrganizerOnly && (
                  <>
                    <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-sm font-medium px-2.5 py-0.5 rounded">
                      🏆 {pointsData?.points ?? 0} pts
                    </span>
                    {pointsData?.tier && (
                      <span className="bg-warm-100 dark:bg-gray-700 text-warm-700 dark:text-warm-300 text-sm font-medium px-2.5 py-0.5 rounded">
                        {pointsData.tier}
                      </span>
                    )}
                  </>
                )}
                <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 text-sm font-medium px-2.5 py-0.5 rounded">
                  {isOrganizerOnly ? 'Organizer' : user.role === 'USER' ? 'Shopper' : user.role}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Phase 19: Points & Tier Card — only for shoppers */}
        {!isOrganizerOnly && pointsData && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-1">Hunt Pass</h2>
            <p className="text-warm-500 dark:text-warm-400 text-sm mb-4">
              {pointsData.tier === 'Scout' && 'Earn 100 pts to reach Hunter tier.'}
              {pointsData.tier === 'Hunter' && `${500 - pointsData.points} pts to reach Estate Pro.`}
              {pointsData.tier === 'Estate Pro' && 'You\'ve reached the top tier!'}
            </p>
            {pointsData.points > 0 ? (
              <ul className="divide-y divide-warm-100 dark:divide-gray-700">
                {pointsData.transactions.map((tx) => (
                  <li key={tx.id} className="flex justify-between items-center py-2 text-sm">
                    <span className="text-warm-700 dark:text-warm-300">{tx.description ?? tx.type}</span>
                    <span className="font-semibold text-amber-700 dark:text-amber-400">+{tx.points} pts</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-warm-500 dark:text-warm-400 text-sm">No points earned yet — start browsing sales!</p>
            )}
          </div>
        )}

        {!isOrganizerOnly && pointsError && (
          <div className="min-h-48 flex flex-col items-center justify-center bg-warm-50 dark:bg-gray-900 gap-4 rounded-lg p-6 mb-8">
            <p className="text-warm-700 dark:text-warm-300 text-lg">Failed to load Hunt Pass.</p>
            <button onClick={() => refetchPoints()} className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg">Try again</button>
          </div>
        )}

        {/* Badges Section — only for shoppers */}
        {!isOrganizerOnly && badgesData?.badges && badgesData.badges.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-4">Badges</h2>
            <div className="flex flex-wrap gap-4">
              {badgesData.badges.map((badge: any) => (
                <div key={badge.id} className="flex items-center bg-warm-50 dark:bg-gray-700 rounded-lg p-3">
                  {badge.iconUrl ? (
                    <img src={badge.iconUrl} alt={badge.name} className="w-10 h-10 mr-3"  loading="lazy"/>
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
>
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

        {/* Sale Interests Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-2">Sale Interests</h2>
          <p className="text-warm-600 dark:text-warm-400 text-sm mb-4">Select the item categories you're interested in. We'll notify you when new sales matching your interests go live.</p>

          {successMessage && (
            <div className={`mb-4 p-3 rounded-lg text-sm font-medium ${
              successMessage.includes('saved')
                ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
            }`}>
              {successMessage}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            {SALE_CATEGORIES.map((category) => (
              <label key={category} className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedInterests.includes(category)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedInterests([...selectedInterests, category]);
                    } else {
                      setSelectedInterests(selectedInterests.filter((c) => c !== category));
                    }
                  }}
                  className="w-4 h-4 text-amber-600 rounded border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 focus:ring-amber-500"
                />
                <span className="ml-2 text-sm text-warm-700 dark:text-warm-300 capitalize">{category}</span>
              </label>
            ))}
          </div>

          <button
            onClick={() => updateInterestsMutation.mutate(selectedInterests)}
            disabled={updateInterestsMutation.isPending}
            className="bg-amber-600 hover:bg-amber-700 disabled:bg-warm-300 text-white font-semibold py-2 px-6 rounded-lg"
          >
            {updateInterestsMutation.isPending ? 'Saving...' : 'Save Interests'}
          </button>
        </div>

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
