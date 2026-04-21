/**
 * Consignor Detail & Payout Page
 *
 * Shows consignor's items and payout history
 * Provides modal to run a new payout
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import api from '../../../lib/api';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';
import ConsignorPayoutModal from '../../../components/ConsignorPayoutModal';
import TierGate from '../../../components/TierGate';
import { ChevronLeft } from 'lucide-react';

interface Consignor {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  commissionRate: string | number;
  items: Array<{
    id: string;
    title: string;
    price: string | number;
    status: string;
    createdAt: string;
  }>;
  payouts: Array<{
    id: string;
    totalSales: string | number;
    commissionAmount: string | number;
    netPayout: string | number;
    method: string | null;
    paidAt: string | null;
    createdAt: string;
  }>;
}

const ConsignorDetailPage: React.FC = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [consignor, setConsignor] = useState<Consignor | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'items' | 'payouts'>('items');

  // Redirect if not authenticated
  if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  useEffect(() => {
    if (id && typeof id === 'string') {
      fetchConsignor();
    }
  }, [id]);

  const fetchConsignor = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/consignors/${id}`);
      setConsignor(response.data);
    } catch (error: any) {
      console.error('Error fetching consignor:', error);
      showToast('Failed to load consignor', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePayoutSuccess = () => {
    setShowPayoutModal(false);
    fetchConsignor(); // Refresh to show new payout
  };

  if (authLoading || loading) {
    return <div>Loading...</div>;
  }

  if (!consignor) {
    return (
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <Link
            href="/organizer/consignors"
            className="flex items-center gap-2 text-amber-600 dark:text-amber-400 hover:underline mb-4"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Consignors
          </Link>
          <p className="text-warm-600 dark:text-warm-400">Consignor not found</p>
        </div>
      </div>
    );
  }

  const itemsSold = consignor.items.filter(i => i.status === 'SOLD').length;
  const totalSalesAmount = consignor.items
    .filter(i => i.status === 'SOLD')
    .reduce((sum, i) => sum + Number(i.price), 0);
  const totalPayouted = consignor.payouts.reduce(
    (sum, p) => sum + Number(p.netPayout),
    0
  );

  return (
    <TierGate
      requiredTier="TEAMS"
      featureName="Consignor Details"
      description="View consignor details, items, and payouts."
    >
      <Head>
        <title>{consignor.name} | FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          {/* Back link */}
          <Link
            href="/organizer/consignors"
            className="flex items-center gap-2 text-amber-600 dark:text-amber-400 hover:underline mb-6"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Consignors
          </Link>

          {/* Header */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-warm-200 dark:border-gray-700 mb-6">
            <h1 className="text-3xl font-bold text-warm-900 dark:text-white mb-2">
              {consignor.name}
            </h1>
            {consignor.email && <p className="text-warm-600 dark:text-warm-400">{consignor.email}</p>}
            {consignor.phone && <p className="text-warm-600 dark:text-warm-400">{consignor.phone}</p>}
            <p className="text-amber-600 dark:text-amber-400 font-bold mt-2">
              Commission: {Number(consignor.commissionRate).toFixed(1)}%
            </p>

            <button
              onClick={() => setShowPayoutModal(true)}
              className="mt-4 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
            >
              Run Payout
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-warm-200 dark:border-gray-700">
              <p className="text-xs font-bold text-warm-500 dark:text-warm-400 uppercase">Items</p>
              <p className="text-2xl font-bold text-warm-900 dark:text-white">
                {consignor.items.length}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-warm-200 dark:border-gray-700">
              <p className="text-xs font-bold text-warm-500 dark:text-warm-400 uppercase">Sold</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{itemsSold}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-warm-200 dark:border-gray-700">
              <p className="text-xs font-bold text-warm-500 dark:text-warm-400 uppercase">Total Sales</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                ${totalSalesAmount.toFixed(2)}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-warm-200 dark:border-gray-700">
              <p className="text-xs font-bold text-warm-500 dark:text-warm-400 uppercase">Payouted</p>
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
              Items ({consignor.items.length})
            </button>
            <button
              onClick={() => setActiveTab('payouts')}
              className={`px-4 py-3 font-bold text-sm border-b-2 transition-colors ${
                activeTab === 'payouts'
                  ? 'border-amber-600 text-amber-600 dark:text-amber-400'
                  : 'border-transparent text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-300'
              }`}
            >
              Payouts ({consignor.payouts.length})
            </button>
          </div>

          {/* Items Tab */}
          {activeTab === 'items' && (
            <div>
              {consignor.items.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-12 text-center border border-warm-200 dark:border-gray-700">
                  <p className="text-warm-600 dark:text-warm-400">No items listed</p>
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
                        {consignor.items.map(item => (
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
              {consignor.payouts.length === 0 ? (
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
                        {consignor.payouts.map(payout => (
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
        </div>
      </div>

      {/* Payout Modal */}
      {showPayoutModal && (
        <ConsignorPayoutModal
          consignorId={consignor.id}
          consignorName={consignor.name}
          commissionRate={Number(consignor.commissionRate)}
          onClose={() => setShowPayoutModal(false)}
          onSuccess={handlePayoutSuccess}
        />
      )}
    </TierGate>
  );
};

export default ConsignorDetailPage;
