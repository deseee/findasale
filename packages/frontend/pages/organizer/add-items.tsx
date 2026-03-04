/**
 * Add Items to Sale (Post-Creation Workflow)
 *
 * Step 1 of organizer's inventory setup:
 * - Select which sale to add items to (if multiple exist)
 * - Choose import method: CSV or manual entry
 * - Redirect to appropriate handler
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import Head from 'next/head';
import Link from 'next/link';

const AddItemsPage = () => {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [selectedSaleId, setSelectedSaleId] = useState('');

  if (!loading && (!user || user.role !== 'ORGANIZER')) {
    router.push('/login');
    return null;
  }

  const { data: sales, isLoading: salesLoading } = useQuery({
    queryKey: ['organizer-sales'],
    queryFn: async () => {
      const response = await api.get('/organizer/sales');
      return response.data;
    },
    enabled: !!user?.id && user.role === 'ORGANIZER',
  });

  const handleCSVImport = () => {
    if (selectedSaleId) {
      router.push(`/organizer/add-items/${selectedSaleId}?method=csv`);
    }
  };

  const handleManualEntry = () => {
    if (selectedSaleId) {
      router.push(`/organizer/add-items/${selectedSaleId}?method=manual`);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <>
      <Head>
        <title>Add Items - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-white">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <Link href="/organizer/dashboard" className="text-amber-600 hover:underline text-sm font-medium mb-4 inline-block">
            Back to dashboard
          </Link>

          <h1 className="text-3xl font-bold text-warm-900 mb-2">Add Items to Sale</h1>
          <p className="text-warm-600 mb-8">Choose a sale and import your inventory.</p>

          {salesLoading ? (
            <p>Loading your sales...</p>
          ) : sales && sales.length > 0 ? (
            <div className="space-y-6">
              <div>
                <label htmlFor="sale-select" className="block text-sm font-medium text-warm-700 mb-2">
                  Select a Sale
                </label>
                <select
                  id="sale-select"
                  value={selectedSaleId}
                  onChange={(e) => setSelectedSaleId(e.target.value)}
                  className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">Choose a sale...</option>
                  {sales.map((sale: any) => (
                    <option key={sale.id} value={sale.id}>
                      {sale.title}
                    </option>
                  ))}
                </select>
              </div>

              {selectedSaleId && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={handleCSVImport}
                    className="p-6 border-2 border-amber-600 rounded-lg hover:bg-amber-50 transition-colors text-left"
                  >
                    <h3 className="font-semibold text-warm-900 mb-2">Import from CSV</h3>
                    <p className="text-sm text-warm-600">Upload a spreadsheet with all your items at once</p>
                  </button>
                  <button
                    onClick={handleManualEntry}
                    className="p-6 border-2 border-amber-600 rounded-lg hover:bg-amber-50 transition-colors text-left"
                  >
                    <h3 className="font-semibold text-warm-900 mb-2">Add Items Manually</h3>
                    <p className="text-sm text-warm-600">Add items one by one with photos and details</p>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-warm-600 mb-4">You haven't created a sale yet.</p>
              <Link
                href="/organizer/create-sale"
                className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg"
              >
                Create a Sale
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default AddItemsPage;
