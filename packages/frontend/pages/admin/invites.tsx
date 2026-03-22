import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import api from '../../lib/api';
import Layout from '../../components/Layout';

interface BetaInvite {
  id: string;
  code: string;
  email: string | null;
  createdAt: string;
  usedAt: string | null;
  status: 'used' | 'unused';
  usedBy: {
    id: string;
    email: string;
    name: string;
    createdAt: string;
  } | null;
}

const AdminInvitesPage = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [invites, setInvites] = useState<BetaInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [newInviteEmail, setNewInviteEmail] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Guard: redirect if not admin
  useEffect(() => {
    if (!isLoading && (!user || !user.roles?.includes('ADMIN'))) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  // Load invites
  useEffect(() => {
    const fetchInvites = async () => {
      try {
        setLoading(true);
        const res = await api.get('/admin/invites');
        // API returns { invites: [...] }, destructure correctly
        const { invites: invitesData } = res.data;
        if (Array.isArray(invitesData)) {
          setInvites(invitesData);
        } else {
          setError('Invalid invites data format');
        }
      } catch (err) {
        console.error('Error fetching invites:', err);
        setError('Failed to load invites');
      } finally {
        setLoading(false);
      }
    };

    if (user?.role === 'ADMIN') {
      fetchInvites();
    }
  }, [user]);

  // Generate new invite
  const handleGenerateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setError('');

    try {
      const res = await api.post('/admin/invites', {
        email: newInviteEmail || undefined
      });
      setInvites([res.data, ...invites]);
      setNewInviteEmail('');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to generate invite');
    } finally {
      setGenerating(false);
    }
  };

  // Delete invite
  const handleDeleteInvite = async (inviteId: string) => {
    if (!confirm('Are you sure you want to delete this unused invite?')) {
      return;
    }

    try {
      await api.delete(`/admin/invites/${inviteId}`);
      setInvites(invites.filter(i => i.id !== inviteId));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete invite');
    }
  };

  // Copy to clipboard
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Generate invite URL
  const getInviteUrl = (code: string): string => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return `${baseUrl}/register?invite=${code}`;
  };

  if (isLoading || loading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <div className="text-center text-warm-600 dark:text-warm-400">Loading invites...</div>
        </div>
      </Layout>
    );
  }

  if (!user || !user.roles?.includes('ADMIN')) {
    return null;
  }

  return (
    <Layout>
      <Head>
        <title>Beta Invite Management - Admin</title>
        <meta name="description" content="Manage beta invites" />
      </Head>

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100">Beta Invite Codes</h1>
            <Link href="/admin" className="text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:text-warm-100">
              Back to Admin
            </Link>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 dark:text-red-300 rounded">
              {error}
            </div>
          )}

          {/* Generate New Invite Form */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">Generate New Invite</h2>
            <form onSubmit={handleGenerateInvite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-1">
                  Email (optional - restrict invite to this email)
                </label>
                <input
                  type="email"
                  value={newInviteEmail}
                  onChange={(e) => setNewInviteEmail(e.target.value)}
                  placeholder="organizer@example.com"
                  className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md focus:outline-none focus:ring-2 focus:ring-warm-500"
                />
              </div>
              <button
                type="submit"
                disabled={generating}
                className="px-4 py-2 bg-warm-600 text-white rounded-md hover:bg-warm-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generating ? 'Generating...' : 'Generate Invite Code'}
              </button>
            </form>
          </div>

          {/* Invites List */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-warm-200">
                <thead className="bg-warm-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-warm-700 dark:text-warm-300 uppercase tracking-wider">
                      Code
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-warm-700 dark:text-warm-300 uppercase tracking-wider">
                      Email (if restricted)
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-warm-700 dark:text-warm-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-warm-700 dark:text-warm-300 uppercase tracking-wider">
                      Used By
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-warm-700 dark:text-warm-300 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-warm-700 dark:text-warm-300 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm-200">
                  {invites.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-4 text-center text-warm-600 dark:text-warm-400">
                        No invite codes yet
                      </td>
                    </tr>
                  ) : (
                    invites.map((invite) => (
                      <tr key={invite.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <code className="text-sm bg-warm-50 dark:bg-gray-900 px-2 py-1 rounded font-mono font-bold">
                            {invite.code}
                          </code>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-warm-600 dark:text-warm-400">
                          {invite.email || '—'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                              invite.status === 'used'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}
                          >
                            {invite.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {invite.usedBy ? (
                            <div>
                              <div className="font-medium text-warm-900 dark:text-warm-100">{invite.usedBy.name}</div>
                              <div className="text-warm-500 dark:text-warm-400">{invite.usedBy.email}</div>
                            </div>
                          ) : (
                            <span className="text-warm-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-warm-600 dark:text-warm-400">
                          {new Date(invite.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm space-x-3">
                          <button
                            onClick={() => handleCopyCode(getInviteUrl(invite.code))}
                            className="text-amber-600 hover:text-amber-800 font-medium"
                          >
                            {copiedCode === getInviteUrl(invite.code) ? 'Copied!' : 'Copy URL'}
                          </button>
                          <button
                            onClick={() => handleCopyCode(invite.code)}
                            className="text-warm-500 dark:text-warm-400 hover:text-warm-700 dark:text-warm-300 text-xs"
                          >
                            {copiedCode === invite.code ? 'Copied!' : 'Code only'}
                          </button>
                          {invite.status === 'unused' && (
                            <button
                              onClick={() => handleDeleteInvite(invite.id)}
                              className="text-red-600 hover:text-red-900 font-medium"
                            >
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Info Box */}
          <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h3 className="font-bold text-blue-900 mb-2">How to share invite codes:</h3>
            <p className="text-blue-800 text-sm mb-3">
              1. Copy the invite code above
            </p>
            <p className="text-blue-800 text-sm mb-3">
              2. Share the code directly, or use the invite URL: <code className="bg-white dark:bg-gray-800 px-2 py-1 rounded">findasale.com/register?invite=CODE</code>
            </p>
            <p className="text-blue-800 text-sm">
              3. When a user registers with a valid code, they automatically get ORGANIZER role
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default AdminInvitesPage;
