import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from '../components/AuthContext';

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

  // Fetch user's bids
  const { data: bids = [] } = useQuery({
    queryKey: ['user-bids'],
    queryFn: async () => {
      const response = await api.get('/users/me/bids');
      return response.data as Bid[];
    },
  });

  // Fetch user's referrals
  const { data: referrals = [] } = useQuery({
    queryKey: ['user-referrals'],
    queryFn: async () => {
      const response = await api.get('/users/me/referrals');
      return response.data as Referral[];
    },
  });

  // Fetch user's badges (legacy endpoint)
  const { data: badgesData } = useQuery({
    queryKey: ['user-badges'],
    queryFn: async () => {
      const response = await api.get('/users/me/points');
      return response.data;
    },
  });

  // Phase 19: Fetch points, tier, and recent transactions
  const { data: pointsData } = useQuery({
    queryKey: ['points'],
    queryFn: async () => {
      const response = await api.get('/points');
      return response.data as { points: number; tier: string; transactions: Array<{ id: string; type: string; points: number; description: string | null; createdAt: string }> };
    },
  });

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Please log in to view your profile</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-50">
      <Head>
        <title>Profile - FindA.Sale</title>
        <meta name="description" content="Your FindA.Sale profile" />
      </Head>

      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-warm-900">My Profile</h1>
        </div>

        {/* Profile Summary */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex items-center">
            <div className="bg-warm-200 border-2 border-dashed rounded-xl w-16 h-16" />
            <div className="ml-4">
              <h2 className="text-2xl font-bold text-warm-900">
                {user.name || user.email || 'User'}
              </h2>
              <p className="text-warm-600">{user.email}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="bg-amber-100 text-amber-800 text-sm font-medium px-2.5 py-0.5 rounded">
                  🏆 {pointsData?.points ?? 0} pts
                </span>
                {pointsData?.tier && (
                  <span className="bg-warm-100 text-warm-700 text-sm font-medium px-2.5 py-0.5 rounded">
                    {pointsData.tier}
                  </span>
                )}
                <span className="bg-green-100 text-green-800 text-sm font-medium px-2.5 py-0.5 rounded">
                  {user.role === 'USER' ? 'Shopper' : user.role}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Phase 19: Points & Tier Card */}
        {pointsData && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-2xl font-bold mb-1">Hunt Pass</h2>
            <p className="text-warm-500 text-sm mb-4">
              {pointsData.tier === 'Scout' && 'Earn 100 pts to reach Hunter tier.'}
              {pointsData.tier === 'Hunter' && `${500 - pointsData.points} pts to reach Estate Pro.`}
              {pointsData.tier === 'Estate Pro' && 'You\'ve reached the top tier!'}
            </p>
            {pointsData.transactions.length > 0 ? (
              <ul className="divide-y divide-warm-100">
                {pointsData.transactions.map((tx) => (
                  <li key={tx.id} className="flex justify-between items-center py-2 text-sm">
                    <span className="text-warm-700">{tx.description ?? tx.type}</span>
                    <span className="font-semibold text-amber-700">+{tx.points} pts</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-warm-500 text-sm">No points earned yet — start browsing sales!</p>
            )}
          </div>
        )}

        {/* Badges Section */}
        {badgesData?.badges && badgesData.badges.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-2xl font-bold mb-4">Badges</h2>
            <div className="flex flex-wrap gap-4">
              {badgesData.badges.map((badge: any) => (
                <div key={badge.id} className="flex items-center bg-warm-50 rounded-lg p-3">
                  {badge.iconUrl ? (
                    <img src={badge.iconUrl} alt={badge.name} className="w-10 h-10 mr-3"  loading="lazy"/>
                  ) : (
                    <div className="bg-warm-200 border-2 border-dashed rounded-xl w-10 h-10 mr-3" />
                  )}
                  <div>
                    <h3 className="font-semibold">{badge.name}</h3>
                    <p className="text-sm text-warm-600">{badge.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* My Bids Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold mb-4">My Bids</h2>
          
          {bids.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-warm-600 mb-4">You haven't placed any bids yet.</p>
              <Link 
                href="/" 
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded inline-flex items-center"
              >
                Browse Auctions
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-warm-200">
                <thead className="bg-warm-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-warm-500 uppercase tracking-wider">
                      Item
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-warm-500 uppercase tracking-wider">
                      Your Bid
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-warm-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-warm-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-warm-200">
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
                            <div className="text-sm font-medium text-warm-900">{bid.item.title}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-warm-900">
                        ${bid.amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          bid.status === 'WINNING' ? 'bg-green-100 text-green-800' :
                          bid.status === 'WON' ? 'bg-amber-100 text-amber-800' :
                          bid.status === 'LOST' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
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

        {/* Referrals Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold mb-4">My Referrals</h2>
          {referrals.length === 0 ? (
            <p className="text-warm-600">No referrals yet.</p>
          ) : (
            <div className="space-y-3">
              {referrals.map((ref) => (
                <div key={ref.id} className="flex justify-between items-center border rounded p-3">
                  <div>
                    <p className="font-medium text-warm-900">{ref.referredUser.name || ref.referredUser.email}</p>
                    <p className="text-sm text-warm-500">{ref.referredUser.email}</p>
                  </div>
                  <span className="text-xs text-warm-400">
                    {new Date(ref.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default ProfilePage;
