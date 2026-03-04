import { useEffect, useState } from 'react';
import Head from 'next/head';
import api from '../lib/api';

interface UserProfile {
  id: string;
  email: string;
  role: string;
  bids: Array<{ id: string; itemTitle: string; amount: number }>;
  referrals: Array<{ id: string; email: string; status: string }>;
  badges: Array<{ id: string; name: string; icon: string }>;
  points: number;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'bids' | 'referrals' | 'badges' | 'points'>('bids');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data } = await api.get('/users/profile');
        setProfile(data);
      } catch (error) {
        console.error('Error fetching profile:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (!profile) return <div>Profile not found.</div>;

  return (
    <>
      <Head>
        <title>My Profile — FindA.Sale</title>
      </Head>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900">{profile.email}</h1>
          <p className="text-gray-600 mt-2">Role: {profile.role}</p>
          <p className="text-gray-600">Points: {profile.points}</p>
        </div>

        <div className="flex border-b border-gray-200 mb-6">
          {['bids', 'referrals', 'badges', 'points'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-2 font-medium ${
                activeTab === tab
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {activeTab === 'bids' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">My Bids</h2>
            {profile.bids.length === 0 ? (
              <p className="text-gray-500">You haven't placed any bids yet.</p>
            ) : (
              <ul className="space-y-2">
                {profile.bids.map((bid) => (
                  <li key={bid.id} className="flex justify-between border-b pb-2">
                    <span>{bid.itemTitle}</span>
                    <span className="font-bold">${bid.amount}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {activeTab === 'referrals' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Referrals</h2>
            {profile.referrals.length === 0 ? (
              <p className="text-gray-500">You haven't referred anyone yet.</p>
            ) : (
              <ul className="space-y-2">
                {profile.referrals.map((ref) => (
                  <li key={ref.id} className="flex justify-between border-b pb-2">
                    <span>{ref.email}</span>
                    <span className="text-sm bg-green-100 text-green-800 px-2 py-1 rounded">
                      {ref.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {activeTab === 'badges' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Badges</h2>
            <div className="grid grid-cols-3 gap-4">
              {profile.badges.map((badge) => (
                <div key={badge.id} className="text-center">
                  <div className="text-4xl mb-2">{badge.icon}</div>
                  <p className="text-sm font-medium">{badge.name}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'points' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Points Summary</h2>
            <p className="text-2xl font-bold text-blue-600 mb-4">{profile.points} Points</p>
            <p className="text-gray-600">Earn points by participating in auctions and bidding.</p>
          </div>
        )}
      </div>
    </>
  );
}
