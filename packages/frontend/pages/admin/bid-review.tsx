import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import api from '../../lib/api';

interface BidRecord {
  id: string;
  bidId: string;
  itemId: string;
  itemTitle: string;
  bidAmount: number;
  bidderId: string;
  bidderName: string;
  bidderEmail: string;
  ipAddress: string;
  createdAt: string;
}

const BidReviewQueue = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [records, setRecords] = useState<BidRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login?redirect=/admin/bid-review');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!isLoading && user && !user.roles?.includes('ADMIN')) {
      router.push('/access-denied');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await api.get('/admin/bid-review');
        setRecords(res.data);
      } catch (err) {
        console.error('Error fetching bid review queue:', err);
        setError('Failed to load bid review queue');
      } finally {
        setLoading(false);
      }
    };

    if (user?.roles?.includes('ADMIN')) {
      fetchData();
    }
  }, [user]);

  const handleBidAction = async (bidId: string, action: 'flag' | 'approve' | 'dismiss') => {
    try {
      setActionLoading(bidId);
      await api.patch(`/admin/bids/${bidId}/action`, { action });
      // Optionally remove the record from the list after action
      setRecords(records.filter(r => r.bidId !== bidId));
    } catch (err) {
      console.error('Error performing bid action:', err);
      setError(`Failed to ${action} bid`);
    } finally {
      setActionLoading(null);
    }
  };

  if (isLoading || loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-warm-600 dark:text-warm-400">Loading bid review queue...</div>
      </div>
    );
  }

  if (!user || !user.roles?.includes('ADMIN')) {
    return null;
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-100 border border-red-400 text-red-700 dark:text-red-300 px-4 py-3 rounded">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">Bid Review Queue</h1>
          <p className="text-warm-600 dark:text-warm-400">Monitor bid IP records for fraud detection</p>
        </div>
        <Link href="/admin" className="text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-100 underline">
          Back to Dashboard
        </Link>
      </div>

      {records.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-12 text-center">
          <p className="text-warm-600 dark:text-warm-400 text-lg mb-2">No bid IP records</p>
          <p className="text-warm-500 dark:text-warm-400">All clear ✅</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-warm-200 dark:border-gray-700 bg-warm-50 dark:bg-gray-700">
                  <th className="text-left px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Item</th>
                  <th className="text-right px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Bid Amount</th>
                  <th className="text-left px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Bidder</th>
                  <th className="text-left px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-warm-900 dark:text-warm-100">IP Address</th>
                  <th className="text-right px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Created</th>
                  <th className="text-center px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map(record => (
                  <tr key={record.id} className="border-b border-warm-100 dark:border-gray-700 hover:bg-warm-50 dark:hover:bg-gray-700">
                    <td className="px-4 py-3 text-warm-900 dark:text-warm-100">
                      <a href={`/item/${record.itemId}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                        {record.itemTitle}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-right text-warm-900 dark:text-warm-100 font-medium">${(record.bidAmount / 100).toFixed(2)}</td>
                    <td className="px-4 py-3 text-warm-900 dark:text-warm-100">{record.bidderName}</td>
                    <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">{record.bidderEmail}</td>
                    <td className="px-4 py-3 font-mono text-xs text-warm-500 dark:text-warm-400">{record.ipAddress}</td>
                    <td className="px-4 py-3 text-right text-warm-500 dark:text-warm-400 text-xs">
                      {new Date(record.createdAt).toLocaleDateString()} {new Date(record.createdAt).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-3 text-center space-x-2 flex justify-center">
                      <button
                        onClick={() => handleBidAction(record.bidId, 'flag')}
                        disabled={actionLoading === record.bidId}
                        className="bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white text-xs px-2 py-1 rounded"
                      >
                        {actionLoading === record.bidId ? '...' : 'Flag'}
                      </button>
                      <button
                        onClick={() => handleBidAction(record.bidId, 'approve')}
                        disabled={actionLoading === record.bidId}
                        className="bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white text-xs px-2 py-1 rounded"
                      >
                        {actionLoading === record.bidId ? '...' : 'Approve'}
                      </button>
                      <button
                        onClick={() => handleBidAction(record.bidId, 'dismiss')}
                        disabled={actionLoading === record.bidId}
                        className="bg-gray-500 hover:bg-gray-600 disabled:bg-gray-300 text-white text-xs px-2 py-1 rounded"
                      >
                        {actionLoading === record.bidId ? '...' : 'Dismiss'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 bg-warm-50 dark:bg-gray-700 border-t border-warm-200 dark:border-gray-700 text-sm text-warm-600 dark:text-warm-400">
            Showing {records.length} bid{records.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  );
};

export default BidReviewQueue;
