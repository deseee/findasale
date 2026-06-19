import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useAuth } from '../../../components/AuthContext';
import api from '../../../lib/api';

interface Purchase {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
}

interface OrganizerSale {
  id: string;
  title: string;
  status: string;
  startDate: string;
  city: string;
}

interface OrganizerInfo {
  id: string;
  businessName: string;
  customStorefrontSlug: string | null;
  subscriptionTier: string;
  totalSales: number;
  avgRating: number | null;
  verificationStatus: string;
  sales: OrganizerSale[];
}

interface UserDetail {
  id: string;
  email: string;
  name: string;
  role: string;
  roles: string[];
  createdAt: string;
  oauthProvider: string | null;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  suspendedAt: string | null;
  suspendReason: string | null;
  fraudSuspect: boolean;
  purchases: Purchase[];
  organizer: OrganizerInfo | null;
}

const AdminUserDetail = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user, isLoading } = useAuth();
  const [userData, setUserData] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [msgSubject, setMsgSubject] = useState('');
  const [msgBody, setMsgBody] = useState('');
  const [msgSending, setMsgSending] = useState(false);
  const [msgResult, setMsgResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!isLoading && (!user || !user.roles?.includes('ADMIN'))) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!id || !user?.roles?.includes('ADMIN')) return;
    const fetchUser = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/admin/users/${id}`);
        setUserData(res.data.user);
      } catch (err) {
        console.error('Error fetching user:', err);
        setError('Failed to load user');
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [id, user]);

  if (isLoading || loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-warm-600 dark:text-warm-400">Loading...</div>
      </div>
    );
  }

  if (!user || !user.roles?.includes('ADMIN')) return null;

  if (error || !userData) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Link href="/admin/users" className="text-amber-600 hover:underline text-sm mb-4 inline-block">
          ← Back to users
        </Link>
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error || 'User not found'}
        </div>
      </div>
    );
  }

  const isSuspended = !!userData.suspendedAt;
  const isZeroActivity = userData.purchases.length === 0 && !userData.organizer;

  return (
    <>
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Back link */}
      <Link href="/admin/users" className="text-amber-600 hover:underline text-sm mb-6 inline-block">
        ← Back to users
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-warm-900 dark:text-warm-100">{userData.name}</h1>
          <p className="text-warm-500 dark:text-warm-400 text-sm mt-1">{userData.email}</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <button
            onClick={() => { setShowMessageModal(true); setMsgResult(null); setMsgSubject(''); setMsgBody(''); }}
            className="px-3 py-1.5 text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white rounded transition-colors"
          >
            Send Message
          </button>
          {userData.roles.map(r => (
            <span
              key={r}
              className={`px-3 py-1 rounded text-xs font-medium ${
                r === 'ADMIN' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                r === 'ORGANIZER' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' :
                'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              {r}
            </span>
          ))}
          {isSuspended && (
            <span className="px-3 py-1 rounded text-xs font-medium bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200">
              SUSPENDED
            </span>
          )}
          {userData.fraudSuspect && (
            <span className="px-3 py-1 rounded text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
              FRAUD SUSPECT
            </span>
          )}
          {isZeroActivity && (
            <span className="px-3 py-1 rounded text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300">
              ZERO ACTIVITY
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Account Info */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h2 className="text-base font-semibold text-warm-900 dark:text-warm-100 mb-4">Account</h2>
          <dl className="space-y-3">
            <div className="flex justify-between text-sm">
              <dt className="text-warm-500 dark:text-warm-400">ID</dt>
              <dd className="text-warm-800 dark:text-warm-200 font-mono text-xs">{userData.id}</dd>
            </div>
            <div className="flex justify-between text-sm">
              <dt className="text-warm-500 dark:text-warm-400">Joined</dt>
              <dd className="text-warm-800 dark:text-warm-200">{new Date(userData.createdAt).toLocaleDateString()}</dd>
            </div>
            <div className="flex justify-between text-sm">
              <dt className="text-warm-500 dark:text-warm-400">Auth method</dt>
              <dd className="text-warm-800 dark:text-warm-200 capitalize">
                {userData.oauthProvider || 'Email / password'}
              </dd>
            </div>
            <div className="flex justify-between text-sm">
              <dt className="text-warm-500 dark:text-warm-400">Email verified</dt>
              <dd className={userData.emailVerified ? 'text-green-600 dark:text-green-400' : 'text-orange-500 dark:text-orange-400'}>
                {userData.emailVerified
                  ? `Yes${userData.emailVerifiedAt ? ' · ' + new Date(userData.emailVerifiedAt).toLocaleDateString() : ''}`
                  : 'No'}
              </dd>
            </div>
            {isSuspended && (
              <>
                <div className="flex justify-between text-sm">
                  <dt className="text-warm-500 dark:text-warm-400">Suspended at</dt>
                  <dd className="text-red-600 dark:text-red-400">{new Date(userData.suspendedAt!).toLocaleDateString()}</dd>
                </div>
                {userData.suspendReason && (
                  <div className="flex justify-between text-sm">
                    <dt className="text-warm-500 dark:text-warm-400">Reason</dt>
                    <dd className="text-red-600 dark:text-red-400">{userData.suspendReason}</dd>
                  </div>
                )}
              </>
            )}
          </dl>
        </div>

        {/* Organizer Info (if applicable) */}
        {userData.organizer ? (
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-warm-900 dark:text-warm-100">Organizer</h2>
              {userData.organizer.customStorefrontSlug && (
                <a
                  href={`/organizer/storefront/${userData.organizer.customStorefrontSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-amber-600 hover:underline"
                >
                  View storefront →
                </a>
              )}
            </div>
            <dl className="space-y-3">
              <div className="flex justify-between text-sm">
                <dt className="text-warm-500 dark:text-warm-400">Business name</dt>
                <dd className="text-warm-800 dark:text-warm-200">{userData.organizer.businessName}</dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-warm-500 dark:text-warm-400">Tier</dt>
                <dd className="text-warm-800 dark:text-warm-200">{userData.organizer.subscriptionTier}</dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-warm-500 dark:text-warm-400">Total sales</dt>
                <dd className="text-warm-800 dark:text-warm-200">{userData.organizer.totalSales}</dd>
              </div>
              {userData.organizer.avgRating != null && (
                <div className="flex justify-between text-sm">
                  <dt className="text-warm-500 dark:text-warm-400">Avg rating</dt>
                  <dd className="text-warm-800 dark:text-warm-200">{userData.organizer.avgRating.toFixed(1)}</dd>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <dt className="text-warm-500 dark:text-warm-400">Verification</dt>
                <dd className={`${
                  userData.organizer.verificationStatus === 'VERIFIED' ? 'text-green-600 dark:text-green-400' :
                  userData.organizer.verificationStatus === 'PENDING' ? 'text-yellow-600 dark:text-yellow-400' :
                  'text-warm-600 dark:text-warm-400'
                }`}>{userData.organizer.verificationStatus}</dd>
              </div>
            </dl>

            {/* Recent sales */}
            {userData.organizer.sales.length > 0 && (
              <div className="mt-4 pt-4 border-t border-warm-200 dark:border-gray-700">
                <h3 className="text-xs font-semibold text-warm-500 dark:text-warm-400 uppercase tracking-wide mb-2">Recent Sales</h3>
                <ul className="space-y-1">
                  {userData.organizer.sales.map(s => (
                    <li key={s.id} className="flex items-center justify-between text-xs">
                      <span className="text-warm-700 dark:text-warm-300 truncate max-w-[200px]">{s.title}</span>
                      <span className={`ml-2 shrink-0 ${
                        s.status === 'PUBLISHED' ? 'text-green-600 dark:text-green-400' :
                        s.status === 'ENDED' ? 'text-warm-400 dark:text-warm-500' :
                        'text-warm-500 dark:text-warm-400'
                      }`}>{s.status}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 flex items-center justify-center">
            <p className="text-warm-400 dark:text-warm-500 text-sm">No organizer profile</p>
          </div>
        )}
      </div>

      {/* Purchases */}
      <div className="mt-6 bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-base font-semibold text-warm-900 dark:text-warm-100 mb-4">
          Purchases ({userData.purchases.length}{userData.purchases.length === 10 ? '+' : ''})
        </h2>
        {userData.purchases.length === 0 ? (
          <p className="text-warm-400 dark:text-warm-500 text-sm">No purchases</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-warm-500 dark:text-warm-400 uppercase tracking-wide">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Amount</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-100 dark:divide-gray-700">
                {userData.purchases.map(p => (
                  <tr key={p.id}>
                    <td className="py-2 pr-4 text-warm-700 dark:text-warm-300">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-2 pr-4 text-warm-700 dark:text-warm-300">
                      ${p.amount.toFixed(2)}
                    </td>
                    <td className={`py-2 ${
                      p.status === 'PAID' ? 'text-green-600 dark:text-green-400' :
                      p.status === 'REFUNDED' ? 'text-orange-500 dark:text-orange-400' :
                      p.status === 'DISPUTED' ? 'text-red-600 dark:text-red-400' :
                      'text-warm-500 dark:text-warm-400'
                    }`}>
                      {p.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>

      {/* Send Direct Message Modal */}
      {showMessageModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-warm-200 dark:border-gray-700">
              <h2 className="text-base font-semibold text-warm-900 dark:text-warm-100">
                Send Message to {userData.name}
              </h2>
              <button
                onClick={() => setShowMessageModal(false)}
                className="text-warm-400 hover:text-warm-600 dark:text-warm-500 dark:hover:text-warm-300 text-xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-warm-600 dark:text-warm-400 mb-1">Subject</label>
                <input
                  type="text"
                  value={msgSubject}
                  onChange={e => setMsgSubject(e.target.value)}
                  placeholder="e.g. Welcome to FindA.Sale!"
                  className="w-full border border-warm-300 dark:border-gray-600 rounded px-3 py-2 text-sm bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-warm-600 dark:text-warm-400 mb-1">Message</label>
                <textarea
                  value={msgBody}
                  onChange={e => setMsgBody(e.target.value)}
                  rows={6}
                  placeholder="Write your message here..."
                  className="w-full border border-warm-300 dark:border-gray-600 rounded px-3 py-2 text-sm bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                />
              </div>
              {msgResult && (
                <p className={`text-sm ${msgResult.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {msgResult.text}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-3 px-5 pb-5">
              <button
                onClick={() => setShowMessageModal(false)}
                className="px-4 py-2 text-sm text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-100 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={msgSending || !msgSubject.trim() || !msgBody.trim()}
                onClick={async () => {
                  setMsgSending(true);
                  setMsgResult(null);
                  try {
                    await api.post(`/admin/users/${userData.id}/message`, { subject: msgSubject, body: msgBody });
                    setMsgResult({ ok: true, text: `Message sent to ${userData.email}` });
                    setTimeout(() => setShowMessageModal(false), 1500);
                  } catch (err: any) {
                    setMsgResult({ ok: false, text: err?.response?.data?.message || 'Failed to send message' });
                  } finally {
                    setMsgSending(false);
                  }
                }}
                className="px-4 py-2 text-sm font-medium bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
              >
                {msgSending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AdminUserDetail;
