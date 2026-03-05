/**
 * Creator Dashboard
 *
 * Main hub for organizers to manage their sales, inventory, and analytics.
 * Accessible only to authenticated organizers.
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import Head from 'next/head';

const CreatorDashboard = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'sales' | 'analytics' | 'settings'>('sales');

  // Redirect if not authenticated or not an organizer
  if (!isLoading && (!user || user.role !== 'ORGANIZER')) {
    router.push('/login');
    return null;
  }

  // Fetch organizer's sales
  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ['organizer-sales', user?.id],
    queryFn: async () => {
      const response = await api.get('/organizer/sales');
      return response.data;
    },
    enabled: !!user?.id,
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <>
      <Head>
        <title>Creator Dashboard - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-warm-50">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-warm-900 mb-6">Creator Dashboard</h1>

          {/* Tab Navigation */}
          <div className="flex gap-4 mb-8 border-b border-warm-200">
            <button
              onClick={() => setActiveTab('sales')}
              className={`pb-2 font-medium ${
                activeTab === 'sales'
                  ? 'border-b-2 border-amber-600 text-amber-600'
                  : 'text-warm-600 hover:text-warm-900'
              }`}
            >
              My Sales
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`pb-2 font-medium ${
                activeTab === 'analytics'
                  ? 'border-b-2 border-amber-600 text-amber-600'
                  : 'text-warm-600 hover:text-warm-900'
              }`}
            >
              Analytics
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`pb-2 font-medium ${
                activeTab === 'settings'
                  ? 'border-b-2 border-amber-600 text-amber-600'
                  : 'text-warm-600 hover:text-warm-900'
              }`}
            >
              Settings
            </button>
          </div>

          {/* Content */}
          {activeTab === 'sales' && (
            <div>
              {salesLoading ? (
                <p>Loading sales...</p>
              ) : salesData && salesData.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {salesData.map((sale: any) => (
                    <div key={sale.id} className="card p-4">
                      <h3 className="text-lg font-semibold text-warm-900">{sale.title}</h3>
                      <p className="text-warm-600 text-sm mt-2">{sale.city}, {sale.state}</p>
                      <button
                        onClick={() => router.push(`/organizer/edit-sale/${sale.id}`)}
                        className="mt-4 bg-amber-600 hover:bg-amber-700 text-white font-bold py-1 px-3 rounded text-sm"
                      >
                        Edit
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-warm-600">No sales yet. Create your first sale to get started!</p>
              )}
            </div>
          )}

          {activeTab === 'analytics' && <div>Analytics coming soon...</div>}
          {activeTab === 'settings' && <div>Settings coming soon...</div>}
        </div>
      </div>
    </>
  );
};

export default CreatorDashboard;
