import { useState } from 'react';
import Head from 'next/head';
import api from '../../lib/api';

interface ShopperDashboardProps {
  user: {
    id: string;
    email: string;
    referralCode: string;
  };
}

export default function ShopperDashboard({ user }: ShopperDashboardProps) {
  const [activeTab, setActiveTab] = useState<'purchases' | 'favorites' | 'bids' | 'referrals'>('purchases');
  const [referralLink, setReferralLink] = useState('');

  const generateReferralLink = () => {
    setReferralLink(`https://finda.sale?ref=${user.referralCode}`);
  };

  return (
    <>
      <Head>
        <title>Shopper Dashboard — FindA.Sale</title>
      </Head>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome, {user.email}</h1>
          <p className="text-gray-600">Manage your bids, favorites, and purchases.</p>
        </div>

        <div className="flex border-b border-gray-200 mb-6 bg-white rounded-t-lg">
          {['purchases', 'favorites', 'bids', 'referrals'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-3 font-medium ${
                activeTab === tab
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-b-lg shadow p-6">
          {activeTab === 'purchases' && (
            <div>
              <h2 className="text-xl font-bold mb-4">My Purchases</h2>
              <p className="text-gray-500">You haven't made any purchases yet.</p>
            </div>
          )}

          {activeTab === 'favorites' && (
            <div>
              <h2 className="text-xl font-bold mb-4">My Favorites</h2>
              <p className="text-gray-500">You don't have any favorited items yet.</p>
            </div>
          )}

          {activeTab === 'bids' && (
            <div>
              <h2 className="text-xl font-bold mb-4">My Bids</h2>
              <p className="text-gray-500">You haven't placed any bids yet.</p>
            </div>
          )}

          {activeTab === 'referrals' && (
            <div>
              <h2 className="text-xl font-bold mb-4">Referral Program</h2>
              <p className="text-gray-600 mb-4">Share this link to earn points:</p>
              {!referralLink ? (
                <button
                  onClick={generateReferralLink}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                >
                  Generate Referral Link
                </button>
              ) : (
                <div className="bg-gray-100 p-4 rounded-lg">
                  <p className="text-gray-700 break-all">{referralLink}</p>
                  <button
                    onClick={() => navigator.clipboard.writeText(referralLink)}
                    className="mt-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                  >
                    Copy Link
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
