/**
 * Consignor Public Portal — Feature #309
 *
 * PUBLIC page (NO AUTH REQUIRED)
 * Accessible via token-gated URL: /consignor/portal/:token
 *
 * Displays:
 * - Consignor's items and their statuses
 * - Payout history
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import axios from 'axios';

interface Item {
  id: string;
  title: string;
  price: string | number;
  status: string;
  createdAt: string;
}

interface Payout {
  id: string;
  totalSales: string | number;
  commissionAmount: string | number;
  netPayout: string | number;
  method: string | null;
  paidAt: string | null;
  createdAt: string;
}

interface PortalData {
  consignor: {
    name: string;
    email: string | null;
    phone: string | null;
  };
  items: Item[];
  payouts: Payout[];
}

const ConsignorPortalPage: React.FC = () => {
  const router = useRouter();
  const { token } = router.query;

  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'items' | 'payouts'>('items');

  useEffect(() => {
    if (!token) return;

    const fetchPortal = async () => {
      try {
        setLoading(true);
        setError(null);

        // No auth required — public endpoint
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL || '/api'}/consignors/portal/${token}`
        );

        setData(response.data);
      } catch (err: any) {
        console.error('Error fetching consignor portal:', err);
        setError(err.response?.data?.error || 'Portal not found');
      } finally {
        setLoading(false);
      }
    };

    fetchPortal();
  }, [token]);

  if (loading) {
    return (
      <>
        <Head>
          <title>Loading... | FindA.Sale Consignor Portal</title>
        </Head>
        <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex items-center justify-center">
          <p className="text-warm-600 dark:text-warm-400">Loading portal...</p>
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <Head>
          <title>Portal Not Found | FindA.Sale</title>
        </Head>
        <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 max-w-md text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 dark:bg-red-900/30 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-red-600 dark:text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-warm-900 dark:text-white mb-2">
              Portal Not Found
            </h1>
            <p className="text-warm-600 dark:text-warm-400 text-sm">
              {error || 'This consignor portal link is invalid or has expired.'}
            </p>
            <p className="text-warm-500 dark:text-warm-400 text-xs mt-4">
              Please contact your organizer for a valid portal link.
            </p>
          </div>
        </div>
      </>
    );
  }

  const itemsSold = data.items.filter(i => i.status === 'SOLD').length;
  const itemsAvailable = data.items.filter(i => i.status === 'AVAILABLE').length;
  const itemsHeld = data.items.filter(i => i.status === 'HELD').length;

  const totalPayouted = data.payouts.reduce(
    (sum, p) => sum + Number(p.netPayout),
    0
  );

  return (
    <>
      <Head>
        <title>Your Consignment Portal | FindA.Sale</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-warm-900 dark:text-white mb-2">
              Your Consignment Portal
            </h1>
            <p className="text-lg font-semibold text-amber-600 dark:text-amber-400">
              {data.consignor.name}
            </p>
            {data.consignor.email && (
              <p className="text-sm text-warm-600 dark:text-warm-400">{data.consignor.email}</p>
            )}
            {data.consignor.phone && (
              <p className="text-sm text-warm-600 dark:text-warm-400">{data.consignor.phone}</p>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-warm-200 dark:border-gray-700">
              <p className="text-xs font-bold text-warm-500 dark:text-warm-400 uppercase">
                Total Items
              </p>
              <p className="text-2xl font-bold text-warm-900 dark:text-white">{data.items.length}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-warm-200 dark:border-gray-700">
              <p className="text-xs font-bold text-warm-500 dark:text-warm-400 uppercase">
                Sold
              </p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{itemsSold}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-warm-200 dark:border-gray-700">
              <p className="text-xs font-bold text-warm-500 dark:text-warm-400 uppercase">
                Available
              </p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{itemsAvailable}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-warm-200 dark:border-gray-700">
              <p className="text-xs font-bold text-warm-500 dark:text-warm-400 uppercase">
                Received
              </p>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                ${totalPayouted.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 border-b border-warm-200 dark:border-gray-700 mb-6">
            <button
              onClick={() => setActiveTab('items')}
              className={`px-4 py-3 font-bold text-sm border-b-2 transition-colors ${
                activeTab === 'items'
                  ? 'border-amber-600 text-amber-600 dark:text-amber-400'
                  : 'border-transparent text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-300'
              }`}
            >
              Items ({data.items.length})
            </button>
            <button
              onClick={() => setActiveTab('payouts')}
              className={`px-4 py-3 font-bold text-sm border-b-2 transition-colors ${
                activeTab === 'payouts'
                  ? 'border-amber-600 text-amber-600 dark:text-amber-400'
                  : 'border-transparent text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-300'
              }`}
            >
              Payouts ({data.payouts.length})
            </button>
          </div>

          {/* Items Tab */}
          {activeTab === 'items' && (
            <div>
              {data.items.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-12 text-center border border-warm-200 dark:border-gray-700">
                  <p className="text-warm-600 dark:text-warm-400">No items listed yet</p>
                </div>
              ) : (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-200 dark:border-gray-700 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-warm-50 dark:bg-gray-700 border-b border-warm-200 dark:border-gray-600">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-bold text-warm-700 dark:text-warm-300 uppercase">
                            Title
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-warm-700 dark:text-warm-300 uppercase">
                            Price
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-warm-700 dark:text-warm-300 uppercase">
                            Status
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-warm-700 dark:text-warm-300 uppercase">
                            Date
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
                        {data.items.map(item => (
                          <tr
                            key={item.id}
                            className="hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors"
                          >
                            <td className="px-4 py-3 text-sm text-warm-900 dark:text-white font-medium">
                              {item.title}
                            </td>
                            <td className="px-4 py-3 text-sm font-bold text-amber-600 dark:text-amber-400">
                              ${Number(item.price).toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <span
                                className={`inline-block px-2 py-1 rounded text-xs font-bold ${
                                  item.status === 'SOLD'
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                    : item.status === 'AVAILABLE'
                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                                    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                                }`}
                              >
                                {item.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-warm-600 dark:text-warm-400">
                              {new Date(item.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Payouts Tab */}
          {activeTab === 'payouts' && (
            <div>
              {data.payouts.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-12 text-center border border-warm-200 dark:border-gray-700">
                  <p className="text-warm-600 dark:text-warm-400">No payouts recorded yet</p>
                </div>
              ) : (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-200 dark:border-gray-700 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-warm-50 dark:bg-gray-700 border-b border-warm-200 dark:border-gray-600">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-bold text-warm-700 dark:text-warm-300 uppercase">
                            Date
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-warm-700 dark:text-warm-300 uppercase">
                            Total Sales
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-warm-700 dark:text-warm-300 uppercase">
                            Commission
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-warm-700 dark:text-warm-300 uppercase">
                            Payout
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-warm-700 dark:text-warm-300 uppercase">
                            Method
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
                        {data.payouts.map(payout => (
                          <tr
                            key={payout.id}
                            className="hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors"
                          >
                            <td className="px-4 py-3 text-sm text-warm-900 dark:text-white font-medium">
                              {new Date(payout.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 text-sm text-warm-700 dark:text-warm-300">
                              ${Number(payout.totalSales).toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-sm text-warm-700 dark:text-warm-300">
                              ${Number(payout.commissionAmount).toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-sm font-bold text-green-600 dark:text-green-400">
                              ${Number(payout.netPayout).toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-sm text-warm-600 dark:text-warm-400">
                              {payout.method || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="mt-12 text-center text-xs text-warm-500 dark:text-warm-400">
            <p>FindA.Sale Consignor Portal</p>
            <p className="mt-1">This is a secure, token-gated page. Do not share this link.</p>
          </div>
        </div>
      </div>
    </>
  );
};

export default ConsignorPortalPage;
