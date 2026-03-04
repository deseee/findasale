/**
 * Add Items Detail Page
 *
 * Actual importer:
 * - CSV upload modal
 * - Manual item entry form
 * - Item list with edit/delete
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../../lib/api';
import CSVImportModal from '../../../components/CSVImportModal';
import { useAuth } from '../../../components/AuthContext';
import Head from 'next/head';
import Link from 'next/link';

const AddItemsDetailPage = () => {
  const router = useRouter();
  const { saleId, method } = router.query;
  const { user, loading } = useAuth();
  const [showCSVModal, setShowCSVModal] = useState(method === 'csv');

  if (!loading && (!user || user.role !== 'ORGANIZER')) {
    router.push('/login');
    return null;
  }

  const { data: items, isLoading: itemsLoading, refetch: refetchItems } = useQuery({
    queryKey: ['sale-items', saleId],
    queryFn: async () => {
      const response = await api.get(`/items/${saleId}`);
      return response.data;
    },
    enabled: !!saleId,
  });

  if (loading || !saleId) return <div>Loading...</div>;

  return (
    <>
      <Head>
        <title>Add Items - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-white">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Link href="/organizer/add-items" className="text-amber-600 hover:underline text-sm font-medium mb-4 inline-block">
            Back to import
          </Link>

          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-warm-900">Add Items</h1>
            <button
              onClick={() => setShowCSVModal(true)}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg"
            >
              Import CSV
            </button>
          </div>

          {itemsLoading ? (
            <p>Loading items...</p>
          ) : items && items.length > 0 ? (
            <div className="space-y-4">
              {items.map((item: any) => (
                <div key={item.id} className="card p-4 flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold text-warm-900">{item.title}</h3>
                    <p className="text-sm text-warm-600">{item.description}</p>
                  </div>
                  <div className="flex gap-2">
                    <button className="text-amber-600 hover:underline text-sm">Edit</button>
                    <button className="text-red-600 hover:underline text-sm">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-warm-600 text-center py-8">No items added yet. Use the import button above to get started.</p>
          )}
        </div>
      </div>

      <CSVImportModal
        isOpen={showCSVModal}
        onClose={() => setShowCSVModal(false)}
        saleId={String(saleId)}
        onImportComplete={() => {
          setShowCSVModal(false);
          refetchItems();
        }}
      />
    </>
  );
};

export default AddItemsDetailPage;
