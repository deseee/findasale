import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from '../components/AuthContext';
import { useToast } from '../components/ToastContext';

interface Referral {
  id: string;
  referredUser: {
    name: string;
    email: string;
  };
  createdAt: string;
}

const ReferralDashboard = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [referralUrl, setReferralUrl] = useState('');

  // Fetch user's referrals
  const { data: referrals = [] } = useQuery({
    queryKey: ['user-referrals'],
    queryFn: async () => {
      const response = await api.get('/users/me/referrals');
      return response.data as Referral[];
    },
  });

  // Fetch user's points
  const { data: pointsData } = useQuery({
    queryKey: ['user-points'],
    queryFn: async () => {
      const response = await api.get('/users/me/points');
      return response.data;
    },
  });

  // Build referral URL on client side only (SSR-safe)
  useEffect(() => {
    if (user?.referralCode) {
      setReferralUrl(`${window.location.origin}/register?ref=${user.referralCode}`);
    }
  }, [user?.referralCode]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Please log in to view your referral dashboard</p>
      </div>
    );
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(referralUrl);
    showToast('Referral link copied to clipboard!', 'success');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Referral Dashboard - FindA.Sale</title>
        <meta name="description" content="Track your referrals and earnings" />
      </Head>

      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Referral Dashboard</h1>
        </div>

        {/* Referral Summary */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold mb-4">Your Referral Link</h2>
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <input
              type="text"
              readOnly
              value={referralUrl}
              className="flex-grow px-4 py-2 border border-gray-300 rounded-md text-gray-900 bg-gray-50"
            />
            <button
              onClick={copyToClipboard}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md whitespace-nowrap"
            >
              Copy Link
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="border rounded-lg p-4 text-center">
              <h3 className="text-lg font-bold text-gray-900">Total Referrals</h3>
              <p className="text-3xl font-bold text-blue-600 mt-2">{referrals.length}</p>
            </div>
            
            <div className="border rounded-lg p-4 text-center">
              <h3 className="text-lg font-bold text-gray-900">Points Earned</h3>
              <p className="text-3xl font-bold text-green-600 mt-2">{pointsData?.points || 0}</p>
            </div>
            
            <div className="border rounded-lg p-4 text-center">
              <h3 className="text-lg font-bold text-gray-900">Reward Status</h3>
              <p className="text-xl font-bold text-purple-600 mt-2">
                {pointsData?.points && pointsData.points >= 100 ? 'Ready to Claim!' : 'Collecting...'}
              </p>
            </div>
          </div>
        </div>

        {/* How It Works */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold mb-4">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="bg-blue-100 text-blue-800 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                1
              </div>
              <h3 className="text-lg font-semibold mb-2">Share Your Link</h3>
              <p className="text-gray-600">Send your referral link to friends and family</p>
            </div>
            
            <div className="text-center">
              <div className="bg-green-100 text-green-800 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                2
              </div>
              <h3 className="text-lg font-semibold mb-2">They Join</h3>
              <p className="text-gray-600">Friends sign up using your referral link</p>
            </div>
            
            <div className="text-center">
              <div className="bg-purple-100 text-purple-800 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                3
              </div>
              <h3 className="text-lg font-semibold mb-2">You Earn Points</h3>
              <p className="text-gray-600">Get points for each successful referral</p>
            </div>
          </div>
        </div>

        {/* Recent Referrals */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold mb-4">Recent Referrals</h2>
          
          {referrals.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600 mb-4">You haven't referred anyone yet.</p>
              <p className="text-gray-500">Share your link above to start earning points!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Referral
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date Joined
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Points Earned
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {referrals.map((referral) => (
                    <tr key={referral.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {referral.referredUser.name || 'Anonymous User'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {referral.referredUser.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(referral.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          +10 points
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default ReferralDashboard;
