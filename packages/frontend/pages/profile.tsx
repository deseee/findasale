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

  // Fetch user's points and badges
  const { data: pointsData } = useQuery({
    queryKey: ['user-points'],
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

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Profile - FindA.Sale</title>
        <meta name="description" content="Your FindA.Sale profile" />
      </Head>

      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">My Profile</h1>
        </div>

        {/* Profile Summary */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex items-center">
            <div className="bg-gray-200 border-2 border-dashed rounded-xl w-16 h-16" />
            <div className="ml-4">
              <h2 className="text-2xl font-bold text-gray-900">
                {user.name || user.email || 'User'}
              </h2>
              <p className="text-gray-600">{user.email}</p>
              <div className="mt-2 flex items-center">
                <span className="bg-blue-100 text-blue-800 text-sm font-medium px-2.5 py-0.5 rounded">
                  {pointsData?.points || 0} Points
                </span>
                <span className="ml-2 bg-green-100 text-green-800 text-sm font-medium px-2.5 py-0.5 rounded">
                  {user.role === 'USER' ? 'Shopper' : user.role}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Badges Section */}
        {pointsData?.badges && pointsData.badges.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-2xl font-bold mb-4">Badges</h2>
            <div className="flex flex-wrap gap-4">
              {pointsData.badges.map((badge: any) => (
                <div key={badge.id} className="flex items-center bg-gray-50 rounded-lg p-3">
                  {badge.iconUrl ? (
                    <img src={badge.iconUrl} alt={badge.name} className="w-10 h-10 mr-3" />
                  ) : (
                    <div className="bg-gray-200 border-2 border-dashed rounded-xl w-10 h-10 mr-3" />
                  )}
                  <div>
                    <h3 className="font-semibold">{badge.name}</h3>
                    <p className="text-sm text-gray-600">{badge.description}</p>
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
              <p className="text-gray-600 mb-4">You haven't placed any bids yet.</p>
              <Link 
                href="/" 
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded inline-flex items-center"
              >
                Browse Auctions
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Item
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Your Bid
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {bids.map((bid) => (
                    <tr key={bid.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {bid.item.photoUrls && bid.item.photoUrls.length > 0 ? (
                            <img 
                              src={bid.item.photoUrls[0]} 
                              alt={bid.item.title} 
                              className="h-10 w-10 rounded-md object-cover"
                            />
                          ) : (
                            <div className="bg-gray-200 border-2 border-dashed rounded-xl w-10 h-10" />
                          )}
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">{bid.item.title}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${bid.amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          bid.status === 'WINNING' ? 'bg-green-100 text-green-800' :
                          bid.status === 'WON' ? 'bg-blue-100 text-blue-800' :
                          bid.status === 'LOST' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {bid.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <Link href={`/items/${bid.itemId}`} className="text-blue-600 hover:text-blue-800">
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
            <p className="text-gray-600">No referrals yet.</p>
          ) : (
            <div className="space-y-3">
              {referrals.map((ref) => (
                <div key={ref.id} className="flex justify-between items-center border rounded p-3">
                  <div>
                    <p className="font-medium text-gray-900">{ref.referredUser.name || ref.referredUser.email}</p>
                    <p className="text-sm text-gray-500">{ref.referredUser.email}</p>
                  </div>
                  <span className="text-xs text-gray-400">
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