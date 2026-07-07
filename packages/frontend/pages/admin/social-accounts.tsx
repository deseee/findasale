import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import api from '../../lib/api';

// Local types (never import from @findasale/shared — breaks Vercel build).
type SocialPlatform = 'X' | 'YOUTUBE' | 'INSTAGRAM' | 'FACEBOOK_PAGE' | 'PINTEREST';

interface SocialAccount {
  id: string;
  platform: SocialPlatform;
  platformUsername: string | null;
  platformUserId: string | null;
  pageId: string | null;
  isActive: boolean;
  connectedAt: string | null;
  lastRefreshedAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SocialPost {
  id: string;
  platform: SocialPlatform;
  accountId: string;
  sourceFile: string | null;
  body: string;
  mediaUrls: string[];
  linkUrl: string | null;
  status: string;
  scheduledFor: string | null;
  publishedAt: string | null;
  remotePostId: string | null;
  permalink: string | null;
  attemptCount: number;
  lastAttemptAt: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

// Platforms with a live publisher module (X = Phase 1a, YOUTUBE = Phase 1b).
const CONNECTABLE_PLATFORMS: { value: SocialPlatform; label: string }[] = [
  { value: 'X', label: 'X (Twitter)' },
  { value: 'YOUTUBE', label: 'YouTube' },
];

const PLATFORM_LABEL: Record<string, string> = {
  X: 'X (Twitter)',
  YOUTUBE: 'YouTube',
  INSTAGRAM: 'Instagram',
  FACEBOOK_PAGE: 'Facebook Page',
  PINTEREST: 'Pinterest',
};

const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-warm-200 dark:bg-gray-700 text-warm-800 dark:text-gray-300',
  SCHEDULED: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
  PUBLISHING: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  PUBLISHED: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  FAILED: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
  SKIPPED: 'bg-warm-200 dark:bg-gray-700 text-warm-600 dark:text-gray-400',
};

// Format a Date as a value for <input type="datetime-local"> in local time.
function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const AdminSocialAccounts = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Connect / disconnect busy state (per platform).
  const [busyPlatform, setBusyPlatform] = useState<SocialPlatform | null>(null);

  // Create-test-post form.
  const [formPlatform, setFormPlatform] = useState<SocialPlatform>('X');
  const [formBody, setFormBody] = useState('');
  const [formMediaUrl, setFormMediaUrl] = useState('');
  const [formScheduledFor, setFormScheduledFor] = useState<string>(() => toDatetimeLocal(new Date()));
  const [submitting, setSubmitting] = useState(false);

  // Admin guard — identical pattern to other admin pages (e.g. demand-signals.tsx).
  useEffect(() => {
    if (!isLoading && (!user || !user.roles?.includes('ADMIN'))) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  // Surface ?connected= / ?error= status from the OAuth callback redirect.
  useEffect(() => {
    if (!router.isReady) return;
    const { connected, error: qErr } = router.query;
    if (typeof connected === 'string' && connected) {
      setNotice(`Connected ${PLATFORM_LABEL[connected.toUpperCase()] || connected} successfully.`);
    } else if (typeof qErr === 'string' && qErr) {
      setError(`Connect failed: ${qErr}`);
    }
  }, [router.isReady, router.query]);

  const loadAccounts = useCallback(async () => {
    const res = await api.get('/social-publisher/accounts');
    setAccounts(res.data.accounts || []);
  }, []);

  const loadPosts = useCallback(async () => {
    const res = await api.get('/social-publisher/posts');
    setPosts(res.data.posts || []);
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      setLoading(true);
      await Promise.all([loadAccounts(), loadPosts()]);
    } catch (err) {
      console.error('Error loading social publisher data:', err);
      setError('Failed to load social publisher data');
    } finally {
      setLoading(false);
    }
  }, [loadAccounts, loadPosts]);

  useEffect(() => {
    if (user?.roles?.includes('ADMIN')) {
      refreshAll();
    }
  }, [user, refreshAll]);

  const handleConnect = async (platform: SocialPlatform) => {
    setError('');
    setNotice('');
    setBusyPlatform(platform);
    try {
      const res = await api.post('/social-publisher/connect', { platform });
      const authorizeUrl = res.data?.authorizeUrl;
      if (typeof authorizeUrl === 'string' && authorizeUrl) {
        window.location.href = authorizeUrl;
        return; // navigating away
      }
      setError('Connect flow did not return an authorize URL.');
    } catch (err: any) {
      console.error('Connect error:', err);
      setError(err?.response?.data?.message || `Failed to start ${PLATFORM_LABEL[platform]} connect`);
    } finally {
      setBusyPlatform(null);
    }
  };

  const handleDisconnect = async (platform: SocialPlatform) => {
    setError('');
    setNotice('');
    setBusyPlatform(platform);
    try {
      await api.post('/social-publisher/disconnect', { platform });
      setNotice(`Disconnected ${PLATFORM_LABEL[platform]}.`);
      await loadAccounts();
    } catch (err: any) {
      console.error('Disconnect error:', err);
      setError(err?.response?.data?.message || `Failed to disconnect ${PLATFORM_LABEL[platform]}`);
    } finally {
      setBusyPlatform(null);
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!formBody.trim()) {
      setError('Post body is required.');
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        platform: formPlatform,
        body: formBody.trim(),
        scheduledFor: new Date(formScheduledFor).toISOString(),
      };
      if (formMediaUrl.trim()) {
        payload.mediaUrls = [formMediaUrl.trim()];
      }
      const res = await api.post('/social-publisher/posts', payload);
      const created = res.data?.post;
      setNotice(
        created
          ? `Test post created (${PLATFORM_LABEL[created.platform] || created.platform}) — status ${created.status}.`
          : 'Test post created.'
      );
      setFormBody('');
      setFormMediaUrl('');
      await loadPosts();
    } catch (err: any) {
      console.error('Create post error:', err);
      setError(err?.response?.data?.message || 'Failed to create test post');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelPost = async (id: string) => {
    setError('');
    setNotice('');
    try {
      await api.post(`/social-publisher/posts/${id}/cancel`);
      setNotice('Post cancelled.');
      await loadPosts();
    } catch (err: any) {
      console.error('Cancel post error:', err);
      setError(err?.response?.data?.message || 'Failed to cancel post');
    }
  };

  const connectedPlatforms = new Set(accounts.map((a) => a.platform));

  if (isLoading || (loading && accounts.length === 0 && posts.length === 0)) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-warm-600 dark:text-warm-400">Loading social publisher...</div>
      </div>
    );
  }

  if (!user || !user.roles?.includes('ADMIN')) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">Social Publisher</h1>
        <p className="text-warm-600 dark:text-warm-400">
          Connect FindA.Sale-owned social accounts and queue posts to the in-house publisher.
        </p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}
      {notice && (
        <div className="bg-green-100 border border-green-400 text-green-700 dark:text-green-300 px-4 py-3 rounded mb-6">
          {notice}
        </div>
      )}

      {/* ── Connect platforms ─────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold text-warm-900 dark:text-warm-100 mb-4">Platforms</h2>
        <div className="flex flex-col gap-3">
          {CONNECTABLE_PLATFORMS.map(({ value, label }) => {
            const isConnected = connectedPlatforms.has(value);
            return (
              <div
                key={value}
                className="flex items-center justify-between border border-warm-200 dark:border-gray-700 rounded-md px-4 py-3"
              >
                <div>
                  <span className="font-medium text-warm-900 dark:text-warm-100">{label}</span>
                  <span
                    className={`ml-3 inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                      isConnected
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                        : 'bg-warm-200 dark:bg-gray-700 text-warm-600 dark:text-gray-400'
                    }`}
                  >
                    {isConnected ? 'Connected' : 'Not connected'}
                  </span>
                </div>
                {isConnected ? (
                  <button
                    onClick={() => handleDisconnect(value)}
                    disabled={busyPlatform === value}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition disabled:opacity-50"
                  >
                    {busyPlatform === value ? 'Working…' : 'Disconnect'}
                  </button>
                ) : (
                  <button
                    onClick={() => handleConnect(value)}
                    disabled={busyPlatform === value}
                    className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 transition disabled:opacity-50"
                  >
                    {busyPlatform === value ? 'Redirecting…' : `Connect ${label}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Connected accounts detail ─────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-warm-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-warm-900 dark:text-warm-100">Connected Accounts</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-warm-50 dark:bg-gray-900 border-b border-warm-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Platform</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Username</th>
                <th className="px-6 py-3 text-center text-sm font-medium text-warm-900 dark:text-warm-100">Active</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Connected</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Last Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
              {accounts.map((a) => (
                <tr key={a.id} className="hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900">
                  <td className="px-6 py-4 text-sm text-warm-900 dark:text-warm-100 font-medium">
                    {PLATFORM_LABEL[a.platform] || a.platform}
                  </td>
                  <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400">{a.platformUsername || '—'}</td>
                  <td className="px-6 py-4 text-sm text-center">{a.isActive ? '✓' : '—'}</td>
                  <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400">
                    {a.connectedAt ? new Date(a.connectedAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-red-600 dark:text-red-400">{a.lastErrorMessage || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {accounts.length === 0 && (
          <div className="text-center py-8">
            <p className="text-warm-600 dark:text-gray-400">No accounts connected yet.</p>
          </div>
        )}
      </div>

      {/* ── Create test post ──────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold text-warm-900 dark:text-warm-100 mb-4">Create Test Post</h2>
        <form onSubmit={handleCreatePost} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-warm-700 dark:text-warm-300">Platform</label>
            <select
              value={formPlatform}
              onChange={(e) => setFormPlatform(e.target.value as SocialPlatform)}
              className="px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600"
            >
              {CONNECTABLE_PLATFORMS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-warm-700 dark:text-warm-300">Body</label>
            <textarea
              value={formBody}
              onChange={(e) => setFormBody(e.target.value)}
              rows={4}
              placeholder="Post text…"
              className="px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-warm-700 dark:text-warm-300">
              Media URL <span className="text-warm-500 dark:text-warm-500">(optional — for YouTube, the video URL)</span>
            </label>
            <input
              type="url"
              value={formMediaUrl}
              onChange={(e) => setFormMediaUrl(e.target.value)}
              placeholder="https://…"
              className="px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-warm-700 dark:text-warm-300">Scheduled for</label>
            <input
              type="datetime-local"
              value={formScheduledFor}
              onChange={(e) => setFormScheduledFor(e.target.value)}
              className="px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600"
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 transition disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create Test Post'}
            </button>
          </div>
        </form>
      </div>

      {/* ── Recent posts ──────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-warm-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-warm-900 dark:text-warm-100">Recent Posts</h2>
          <button
            onClick={() => loadPosts()}
            className="px-3 py-1 text-sm bg-warm-200 dark:bg-gray-700 text-warm-900 dark:text-gray-300 rounded hover:bg-warm-300 dark:hover:bg-gray-600 transition"
          >
            Refresh
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-warm-50 dark:bg-gray-900 border-b border-warm-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Platform</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Body</th>
                <th className="px-6 py-3 text-center text-sm font-medium text-warm-900 dark:text-warm-100">Status</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Scheduled</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Error</th>
                <th className="px-6 py-3 text-right text-sm font-medium text-warm-900 dark:text-warm-100">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
              {posts.map((p) => {
                const cancellable = ['DRAFT', 'SCHEDULED', 'SKIPPED', 'FAILED'].includes(p.status);
                return (
                  <tr key={p.id} className="hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900 align-top">
                    <td className="px-6 py-4 text-sm text-warm-900 dark:text-warm-100 font-medium whitespace-nowrap">
                      {PLATFORM_LABEL[p.platform] || p.platform}
                    </td>
                    <td className="px-6 py-4 text-sm text-warm-700 dark:text-warm-300 max-w-md">
                      <div className="line-clamp-3">{p.body}</div>
                      {p.permalink && (
                        <a
                          href={p.permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-amber-600 dark:text-amber-400 hover:underline text-xs"
                        >
                          View published post ↗
                        </a>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-center">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                          STATUS_STYLE[p.status] || 'bg-warm-200 dark:bg-gray-700 text-warm-800 dark:text-gray-300'
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400 whitespace-nowrap">
                      {p.scheduledFor ? new Date(p.scheduledFor).toLocaleString() : '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-red-600 dark:text-red-400 max-w-xs">
                      {p.lastErrorMessage || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-right whitespace-nowrap">
                      {cancellable ? (
                        <button
                          onClick={() => handleCancelPost(p.id)}
                          className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition"
                        >
                          Cancel
                        </button>
                      ) : (
                        <span className="text-warm-400 dark:text-gray-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {posts.length === 0 && (
          <div className="text-center py-8">
            <p className="text-warm-600 dark:text-gray-400">No posts queued yet.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminSocialAccounts;
