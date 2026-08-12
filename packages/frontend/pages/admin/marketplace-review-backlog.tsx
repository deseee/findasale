/**
 * Marketplace Extension Removal Review Backlog: platform-wide admin view (2026-08-06)
 *
 * The Facebook Marketplace extension marks a SOLD item's live FB listing for removal, and
 * when it can't confidently match the item to a Facebook card (title match fails, Sold flip
 * can't be confirmed in time), it gives up rather than guessing -- after
 * MAX_REMOVAL_SKIP_ATTEMPTS skips the item is dead-lettered into "needs manual review".
 *
 * That state was previously only visible to the individual organizer inside their own
 * extension popup (getPendingRemovals) or the "Marketplace Sync Health" card on their own
 * install page (getSyncHealth) -- both organizer-scoped, requiring that organizer's own
 * login. Patrick's admin dashboard had zero cross-organizer visibility. Confirmed live: 6
 * SOLD items stuck past the skip threshold for one organizer, invisible platform-wide.
 *
 * Read-only by design -- this closes a monitoring gap, not a broken workflow. No bulk
 * actions; an organizer still resolves each item from their own extension.
 *
 * Route: /admin/marketplace-review-backlog
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import api from '../../lib/api';

interface BacklogItem {
  itemId: string;
  itemTitle: string;
  saleTitle: string;
  organizerName: string;
  skipCount: number;
  lastErrorMessage: string | null;
  lastAttemptAt: string | null;
}

const AdminMarketplaceReviewBacklog = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [items, setItems] = useState<BacklogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login?redirect=/admin/marketplace-review-backlog');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!isLoading && user && !user.roles?.includes('ADMIN')) {
      router.push('/access-denied');
    }
  }, [user, isLoading, router]);

  const fetchBacklog = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/admin/marketplace-review-backlog');
      setItems(res.data.items || []);
    } catch (err) {
      console.error('Error fetching marketplace review backlog:', err);
      setError('Failed to load marketplace review backlog');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.roles?.includes('ADMIN')) {
      fetchBacklog();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (isLoading || (loading && items.length === 0 && !error)) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-warm-600 dark:text-warm-400">Loading marketplace review backlog...</div>
      </div>
    );
  }

  if (!user || !user.roles?.includes('ADMIN')) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">Marketplace Review Backlog</h1>
          <p className="text-warm-600 dark:text-warm-400">
            Sold items the Facebook Marketplace extension could not confidently match to a live listing to remove,
            across every organizer.
          </p>
        </div>
        <Link href="/admin" className="text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-100 underline">
          Back to Dashboard
        </Link>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {!error && items.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-12 text-center">
          <p className="text-warm-600 dark:text-warm-400 text-lg mb-2">No items stuck in manual review</p>
          <p className="text-warm-500 dark:text-warm-400">All clear ✅</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-warm-200 dark:border-gray-700 text-sm text-warm-500 dark:text-warm-400">
            {items.length} item{items.length !== 1 ? 's' : ''} stuck past the auto-retry threshold
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-warm-200 dark:border-gray-700 bg-warm-50 dark:bg-gray-700">
                  <th className="text-left px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Organizer</th>
                  <th className="text-left px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Sale</th>
                  <th className="text-left px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Item</th>
                  <th className="text-right px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Skips</th>
                  <th className="text-left px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Last Error</th>
                  <th className="text-right px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Last Attempt</th>
                </tr>
              </thead>
              <tbody>
                {items.map(record => (
                  <tr key={record.itemId} className="border-b border-warm-100 dark:border-gray-700 hover:bg-warm-50 dark:hover:bg-gray-700 align-top">
                    <td className="px-4 py-3 text-warm-900 dark:text-warm-100">{record.organizerName}</td>
                    <td className="px-4 py-3 text-warm-900 dark:text-warm-100">{record.saleTitle}</td>
                    <td className="px-4 py-3 text-warm-900 dark:text-warm-100">
                      <a href={`/item/${record.itemId}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                        {record.itemTitle}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-right text-amber-700 dark:text-amber-400 font-medium">{record.skipCount}</td>
                    <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs max-w-xs">
                      {record.lastErrorMessage || 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-right text-warm-500 dark:text-warm-400 text-xs whitespace-nowrap">
                      {record.lastAttemptAt
                        ? `${new Date(record.lastAttemptAt).toLocaleDateString()} ${new Date(record.lastAttemptAt).toLocaleTimeString()}`
                        : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminMarketplaceReviewBacklog;
