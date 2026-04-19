import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import api from '../../lib/api';

interface Organizer {
  id: string;
  businessName: string;
  subscriptionTier: string;
  createdAt: string;
  user: {
    email: string;
    name: string;
  };
}

const AdminVerification = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [approvingId, setApprovingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && (!user || !user.roles?.includes('ADMIN'))) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  const fetchPendingOrganizers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/verification/admin/pending');
      setOrganizers(res.data.organizers);
    } catch (err) {
      console.error('Error fetching pending organizers:', err);
      setError('Failed to load pending organizers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.roles?.includes('ADMIN')) {
      fetchPendingOrganizers();
    }
  }, [user]);

  const handleApprove = async (organizerId: string) => {
    try {
      setApprovingId(organizerId);
      await api.post(`/verification/admin/${organizerId}/approve`);
      setOrganizers(organizers.filter(o => o.id !== organizerId));
    } catch (err) {
      console.error('Error approving organizer:', err);
      setError('Failed to approve organizer');
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async (organizerId: string) => {
    try {
      setRejectingId(organizerId);
      const reason = rejectReason[organizerId] || '';
      await api.post(`/verification/admin/${organizerId}/reject`, { reason });
      setOrganizers(organizers.filter(o => o.id !== organizerId));
      setRejectReason(prev => {
        const updated = { ...prev };
        delete updated[organizerId];
        return updated;
      });
    } catch (err) {
      console.error('Error rejecting organizer:', err);
      setError('Failed to reject organizer');
    } finally {
      setRejectingId(null);
    }
  };

  if (isLoading || loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-warm-600 dark:text-warm-400">Loading pending verifications...</div>
      </div>
    );
  }

  if (!user || !user.roles?.includes('ADMIN')) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Link href="/admin" className="text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-100 underline text-sm mb-6 inline-block">
        ← Back to Dashboard
      </Link>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">Organizer Verification Queue</h1>
        <p className="text-warm-600 dark:text-warm-400">Review and approve pending organizer verification requests</p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {/* Verification Table */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-warm-50 dark:bg-gray-900 border-b border-warm-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Business Name</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Contact Name</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Email</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Tier</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Requested</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
              {organizers.map(org => (
                <tr key={org.id} className="hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900">
                  <td className="px-6 py-4 text-sm text-warm-900 dark:text-warm-100 font-medium">{org.businessName}</td>
                  <td className="px-6 py-4 text-sm text-warm-900 dark:text-warm-100">{org.user.name}</td>
                  <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400">{org.user.email}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className="inline-block px-3 py-1 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                      {org.subscriptionTier}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400">
                    {new Date(org.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprove(org.id)}
                          disabled={approvingId === org.id || rejectingId === org.id}
                          className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:opacity-50 transition"
                        >
                          {approvingId === org.id ? 'Approving...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => setRejectingId(rejectingId === org.id ? null : org.id)}
                          disabled={approvingId === org.id}
                          className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 disabled:opacity-50 transition"
                        >
                          Reject
                        </button>
                      </div>
                      {rejectingId === org.id && (
                        <div className="flex gap-2 col-span-2">
                          <input
                            type="text"
                            placeholder="Reason (optional)"
                            value={rejectReason[org.id] || ''}
                            onChange={(e) => setRejectReason(prev => ({ ...prev, [org.id]: e.target.value }))}
                            className="flex-1 px-2 py-1 border border-warm-300 dark:border-gray-600 dark:bg-gray-700 dark:text-warm-100 rounded text-xs"
                          />
                          <button
                            onClick={() => handleReject(org.id)}
                            disabled={rejectingId === org.id}
                            className="px-2 py-1 bg-red-700 text-white text-xs rounded hover:bg-red-800 transition"
                          >
                            Confirm
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {organizers.length === 0 && (
          <div className="text-center py-8">
            <p className="text-warm-600 dark:text-gray-400">No pending verification requests.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminVerification;
