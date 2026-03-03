import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import Skeleton from '../../components/Skeleton';

interface Purchase {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
  item: {
    title: string;
    photoUrls: string[];
  } | null;
  sale: {
    title: string;
  } | null;
}

interface Favorite {
  id: string;
  sale: {
    id: string;
    title: string;
    startDate: string;
    endDate: string;
    city: string;
    state: string;
    photoUrls: string[];
  } | null;
}

interface Bid {
  id: string;
  itemId: string;
  amount: number;
  item: {
    title: string;
    photoUrls: string[];
  };
  status: string; // WINNING, LOSING, WON, LOST
  createdAt: string;
}

interface Referral {
  id: string;
  referredUser: {
    name: string;
    email: string;
  };
  createdAt: string;
}

interface Badge {
  id: string;
  name: string;
  description: string;
  iconUrl: string | null;
}

const ShopperDashboard = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'purchases' | 'favorites' | 'bids' | 'referrals'>('purchases');
  // origin is only available client-side; initialise safely to avoid SSR crash
  const [origin, setOrigin] = useState('');
  useEffect(() => { setOrigin(window.location.origin); }, []);

  // Fetch user's purchase history
  const { data: purchases = [] } = useQuery({
    queryKey: ['purchases'],
    queryFn: async () => {
      const response = await api.get('/users/purchases');
      return response.data as Purchase[];
    },
  });

  // Fetch user's favorite sales
  const { data: favorites = [] } = useQuery({
    queryKey: ['favorites'],
    queryFn: async () => {
      const response = await api.get('/users/favorites');
      return response.data as Favorite[];
    },
  });

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
      <div className="min-h-screen bg-gray-50">
        <main className="container mx-auto px-4 py-8">
          <div className="flex justify-between items-center mb-8">
            <Skeleton className="h-9 w-64" />
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex items-center gap-4">
              <Skeleton className="w-16 h-16 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-5 w-24 mt-2" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex gap-4 border-b pb-4 mb-6">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-6 w-24" />)}
            </div>
            {[1,2,3].map(i => (
              <div key={i} className="flex items-center py-4 border-b border-gray-100 space-x-4">
                <Skeleton className="w-10 h-10 rounded-md" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-16" />
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  // Helper function to format currency
  const formatCurrency = (amount: number | string): string => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return isNaN(num) ? '$0.00' : `$${num.toFixed(2)}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Shopper Dashboard - FindA.Sale</title>
        <meta name="description" content="Your FindA.Sale profile" />
      </Head>

      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Shopper Dashboard</h1>
        </div>

        {/* Profile Summary */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex flex-col md:flex-row items-center">
            <div className="bg-gray-200 border-2 border-dashed rounded-xl w-16 h-16" />
            <div className="ml-0 md:ml-4 mt-4 md:mt-0 text-center md:text-left">
              <h2 className="text-2xl font-bold text-gray-900">{user.name || user.email || 'User'}</h2>
              <p className="text-gray-600">{user.email}</p>
              <div className="mt-2 flex flex-wrap items-center justify-center md:justify-start gap-2">
                <span className="bg-blue-100 text-blue-800 text-sm font-medium px-2.5 py-0.5 rounded">
                  {pointsData?.points || 0} Points
                </span>
                <span className="bg-green-100 text-green-800 text-sm font-medium px-2.5 py-0.5 rounded">
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
              {pointsData.badges.map((badge: Badge) => (
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

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-md mb-8">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex">
              <button
                onClick={() => setActiveTab('purchases')}
                className={`py-4 px-6 text-center border-b-2 font-medium text-sm ${
                  activeTab === 'purchases'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Purchases
              </button>
              <button
                onClick={() => setActiveTab('favorites')}
                className={`py-4 px-6 text-center border-b-2 font-medium text-sm ${
                  activeTab === 'favorites'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Favorites
              </button>
              <button
                onClick={() => setActiveTab('bids')}
                className={`py-4 px-6 text-center border-b-2 font-medium text-sm ${
                  activeTab === 'bids'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                My Bids
              </button>
              <button
                onClick={() => setActiveTab('referrals')}
                className={`py-4 px-6 text-center border-b-2 font-medium text-sm ${
                  activeTab === 'referrals'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Referrals
              </button>
            </nav>
          </div>

          <div className="p-6">
            {/* Purchases Tab */}
            {activeTab === 'purchases' && (
              <div>
                <h2 className="text-2xl font-bold mb-6">Purchase History</h2>
                
                {purchases.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-600 mb-4">You haven't made any purchases yet.</p>
                    <Link 
                      href="/" 
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded inline-flex items-center"
                    >
                      Browse Sales
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
                            Sale
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Amount
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Date
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {purchases.map((purchase) => (
                          <tr key={purchase.id}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                {purchase.item?.photoUrls && purchase.item.photoUrls.length > 0 ? (
                                  <img 
                                    src={purchase.item.photoUrls[0]} 
                                    alt={purchase.item.title} 
                                    className="h-10 w-10 rounded-md object-cover"
                                  />
                                ) : (
                                  <div className="bg-gray-200 border-2 border-dashed rounded-xl w-10 h-10" />
                                )}
                                <div className="ml-4">
                                  <div className="text-sm font-medium text-gray-900">
                                    {purchase.item?.title || 'Unknown Item'}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {purchase.sale?.title || 'Unknown Sale'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {formatCurrency(purchase.amount)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                purchase.status === 'PAID' ? 'bg-green-100 text-green-800' :
                                purchase.status === 'REFUNDED' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {purchase.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {new Date(purchase.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Favorites Tab */}
            {activeTab === 'favorites' && (
              <div>
                <h2 className="text-2xl font-bold mb-6">Favorite Sales</h2>
                
                {favorites.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-600 mb-4">You haven't favorited any sales yet.</p>
                    <Link 
                      href="/" 
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded inline-flex items-center"
                    >
                      Discover Sales
                    </Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {favorites
                      .filter(favorite => favorite.sale) // Filter out favorites with null sale
                      .map((favorite) => (
                        <Link 
                          href={`/sales/${favorite.sale!.id}`} 
                          key={favorite.sale!.id}
                          className="border rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
                        >
                          <div className="relative">
                            {favorite.sale!.photoUrls.length > 0 ? (
                              <img 
                                src={favorite.sale!.photoUrls[0]} 
                                alt={favorite.sale!.title} 
                                className="w-full h-48 object-cover"
                              />
                            ) : (
                              <div className="bg-gray-200 h-48 flex items-center justify-center">
                                <span className="text-gray-500">No image</span>
                              </div>
                            )}
                          </div>
                          <div className="p-4">
                            <h3 className="text-lg font-bold mb-2">{favorite.sale!.title}</h3>
                            <div className="flex justify-between text-sm text-gray-500 mb-2">
                              <span>{new Date(favorite.sale!.startDate).toLocaleDateString()}</span>
                              <span>{favorite.sale!.city}, {favorite.sale!.state}</span>
                            </div>
                            <div className="text-sm text-gray-600">
                              {new Date(favorite.sale!.endDate) > new Date() ? 'Ongoing' : 'Ended'}
                            </div>
                          </div>
                        </Link>
                      ))
                    }
                  </div>
                )}
              </div>
            )}

            {/* Bids Tab */}
            {activeTab === 'bids' && (
              <div>
                <h2 className="text-2xl font-bold mb-6">My Bids</h2>
                
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
                            Date
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
                              {formatCurrency(bid.amount)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                bid.status === 'WINNING' ? 'bg-green-100 text-green-800' :
                                bid.status === 'LOSING' ? 'bg-yellow-100 text-yellow-800' :
                                bid.status === 'WON' ? 'bg-blue-100 text-blue-800' :
                                bid.status === 'LOST' ? 'bg-gray-100 text-gray-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {bid.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {new Date(bid.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <Link 
                                href={`/items/${bid.itemId}`} 
                                className="text-blue-600 hover:text-blue-900"
                              >
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

            {/* Referrals Tab */}
            {activeTab === 'referrals' && (
              <div>
                <h2 className="text-2xl font-bold mb-6">Referral Program</h2>
                
                <div className="mb-8 p-6 bg-blue-50 rounded-lg">
                  <h3 className="font-bold text-lg text-blue-800 mb-3">Your Referral Link</h3>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      readOnly
                      value={origin ? `${origin}/register?ref=${user.referralCode || 'YOUR_CODE'}` : 'Loading...'}
                      className="flex-grow px-4 py-2 border border-gray-300 rounded-md text-gray-900 bg-white"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${origin}/register?ref=${user.referralCode || 'YOUR_CODE'}`);
                        showToast('Referral link copied to clipboard!', 'success');
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md whitespace-nowrap"
                    >
                      Copy Link
                    </button>
                  </div>
                  <p className="mt-3 text-sm text-gray-600">
                    Share this link with friends and earn points when they sign up!
                  </p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div className="border rounded-lg p-5">
                    <h3 className="font-bold text-lg mb-3">Referral Stats</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total Referrals:</span>
                        <span className="font-bold">{referrals.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Points Earned:</span>
                        <span className="font-bold">{pointsData?.pointsFromReferrals || 0}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="border rounded-lg p-5">
                    <h3 className="font-bold text-lg mb-3">Recent Referrals</h3>
                    {referrals.length === 0 ? (
                      <p className="text-gray-600">No recent referrals</p>
                    ) : (
                      <ul className="divide-y">
                        {referrals.slice(0, 5).map((referral) => (
                          <li key={referral.id} className="py-2">
                            <div className="font-medium">
                              {referral.referredUser.name || referral.referredUser.email}
                            </div>
                            <div className="text-sm text-gray-600">
                              Joined {new Date(referral.createdAt).toLocaleDateString()}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default ShopperDashboard;
