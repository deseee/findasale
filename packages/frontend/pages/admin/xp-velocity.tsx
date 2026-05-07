import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import api from '../../lib/api';
import { useToast } from '../../components/ToastContext';

interface FlaggedUser {
  userId: string;
  userName: string;
  email: string;
  maxHourlyXp: number;
  totalXpLast7Days: number;
  recentEvents: Array<{ id: string; points: number; description: string; createdAt: string }>;
}

export default function XpVelocityPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [users, setUsers] = useState<FlaggedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/admin/xp-velocity')
      .then(res => setUsers(res.data.flagged))
      .catch(err => {
        if (err.response?.status === 401 || err.response?.status === 403) {
          router.push('/login');
        } else {
          setError('Failed to load XP velocity data');
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <>
      <Head>
        <title>XP Velocity Flags — Admin | FindA.Sale</title>
      </Head>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          XP Velocity Flags
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">
          Users earning more than 500 points in any 1-hour window in the last 7 days.
        </p>

        {loading && <p className="text-gray-500">Loading...</p>}
        {error && <p className="text-red-500">{error}</p>}

        {!loading && !error && users.length === 0 && (
          <p className="text-green-600 dark:text-green-400">No XP velocity anomalies detected.</p>
        )}

        {!loading && users.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-800 text-left">
                  <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">Name</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">Email</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">Peak Hourly XP</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">7-Day Total</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">Last Activity</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.userId} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{user.userName}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{user.email}</td>
                    <td className="px-4 py-3 font-mono text-orange-600 dark:text-orange-400">{user.maxHourlyXp.toLocaleString()}</td>
                    <td className="px-4 py-3 font-mono text-gray-700 dark:text-gray-300">{user.totalXpLast7Days.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                      {user.recentEvents[0] ? new Date(user.recentEvents[0].createdAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => showToast('User review feature coming soon', 'info')}
                        className="text-xs bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-3 py-1 rounded transition-colors"
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
