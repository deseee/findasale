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
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../lib/api';
import CSVImportModal from '../../../components/CSVImportModal';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';
import Head from 'next/head';
import Link from 'next/link';

const AddItemsDetailPage = () => {
  const router = useRouter();
  const { saleId, method } = router.query;
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [showCSVModal, setShowCSVModal] = useState(method === 'csv');

  if (!isLoading && (!user || user.role !== 'ORGANIZER')) {
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

  const deleteMutation = useMutation({
    mutationFn: (itemId: string) => api.delete(`/items/${itemId}`),
    onSuccess: () => {
      showToast('Item deleted', 'success');
      queryClient.invalidateQueries({ queryKey: ['sale-items', saleId] });
    },
    onError: () => showToast('Failed to delete item', 'error'),
  });

  if (isLoading || !saleId) return <div>Loading...</div>;

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
            <div className="flex gap-2">
              {/* Phase 32: Export inventory as CSV */}
              {items && items.length > 0 && (
                <a
                  href={`${process.env.NEXT_PUBLIC_API_URL || ''}/api/organizers/me/export/items/${saleId}`}
                  download
                  className="bg-warm-200 hover:bg-warm-300 text-warm-900 font-bold py-2 px-4 rounded-lg text-sm"
                  onClick={(e) => {
                    // Attach auth token to download request via hidden fetch + blob URL
                    e.preventDefault();
                    const token = localStorage.getItem('token');
                    const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
                    fetch(`${apiBase}/api/organizers/me/export/items/${saleId}`, {
                      headers: token ? { Authorization: `Bearer ${token}` } : {},
                    })
                      .then((res) => res.blob())
                      .then((blob) => {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `items_${saleId}.csv`;
                        a.click();
                        URL.revokeObjectURL(url);
                      })
                      .catch(() => alert('Export failed. Please try again.'));
                  }}
                >
                  Export CSV
                </a>
              )}
              <button
                onClick={() => setShowCSVModal(true)}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg"
              >
                Import CSV
              </button>
            </div>
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
                    <Link
                      href={`/organizer/edit-item/${item.id}`}
                      className="text-amber-600 hover:underline text-sm"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${item.title}"?`)) {
                          deleteMutation.mutate(item.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                      className="text-red-600 hover:underline text-sm disabled:opacity-50"
                    >
                      Delete
                    </button>
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
