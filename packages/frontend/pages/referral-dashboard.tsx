/**
 * Referral Dashboard
 *
 * For shoppers and organizers to track their referral earnings.
 * Shows:
 * - Referral link and share tools
 * - Referral activity log
 * - Earnings summary
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from '../components/AuthContext';
import Head from 'next/head';
import { useRouter } from 'next/router';

const ReferralDashboard = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  if (!isLoading && !user) {
    router.push('/login');
    return null;
  }

  const { data: referralData } = useQuery({
    queryKey: ['referral-data'],
    queryFn: async () => {
      const response = await api.get('/referrals/dashboard');
      return response.data;
    },
    enabled: !!user?.id,
  });

  const referralLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/affiliate/${user?.id}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(referralLink);
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <>
      <Head>
        <title>Referral Dashboard - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-warm-50">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-warm-900 mb-8">Referral Dashboard</h1>

          {/* Referral Link */}
          <div className="card p-6 mb-8">
            <h2 className="text-xl font-semibold text-warm-900 mb-4">Your Referral Link</h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={referralLink}
                readOnly
                className="flex-1 px-4 py-2 border border-warm-300 rounded-lg bg-warm-50"
              />
              <button
                onClick={copyToClipboard}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg"
              >
                Copy
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="card p-6">
              <p className="text-warm-600 text-sm">Total Referrals</p>
              <p className="text-3xl font-bold text-warm-900">{referralData?.totalReferrals || 0}</p>
            </div>
            <div className="card p-6">
              <p className="text-warm-600 text-sm">Conversions</p>
              <p className="text-3xl font-bold text-warm-900">{referralData?.conversions || 0}</p>
            </div>
            <div className="card p-6">
              <p className="text-warm-600 text-sm">Earnings</p>
              <p className="text-3xl font-bold text-warm-900">${referralData?.earnings || '0.00'}</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ReferralDashboard;
