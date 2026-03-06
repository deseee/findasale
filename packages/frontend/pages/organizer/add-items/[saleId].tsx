/**
 * Add Items Detail Page
 *
 * Actual importer:
 * - CSV upload modal
 * - Manual item entry form
 * - Batch AI upload (CD2 Phase 2)
 * - Item list with edit/delete
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../lib/api';
import CSVImportModal from '../../../components/CSVImportModal';
import SmartInventoryUpload from '../../../components/SmartInventoryUpload';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';
import Head from 'next/head';
import Link from 'next/link';

type ActiveTab = 'manual' | 'upload' | 'batch';

const CATEGORIES = [
  'Furniture',
  'Jewelry',
  'Art & Decor',
  'Clothing',
  'Kitchenware',
  'Tools & Hardware',
  'Collectibles',
  'Electronics',
  'Books & Media',
  'Other',
];

const CONDITIONS = ['Excellent', 'Good', 'Fair', 'Poor'];

const AddItemsDetailPage = () => {
  const router = useRouter();
  const { saleId, method } = router.query;
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [showCSVModal, setShowCSVModal] = useState(method === 'csv');
  const [activeTab, setActiveTab] = useState<ActiveTab>('manual');

  // Manual entry form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: '',
    category: '',
    condition: '',
    quantity: '1',
    isAuction: false,
    startingBid: '',
  });

  const [formError, setFormError] = useState('');

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

  const createItemMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/items', data);
      return response.data;
    },
    onSuccess: () => {
      showToast('Item added! Add another or go back to manage items.', 'success');
      // Clear form
      setFormData({
        title: '',
        description: '',
        price: '',
        category: '',
        condition: '',
        quantity: '1',
        isAuction: false,
        startingBid: '',
      });
      setFormError('');
      queryClient.invalidateQueries({ queryKey: ['sale-items', saleId] });
    },
    onError: (error: any) => {
      const message = error.validationMessage || error.response?.data?.message || 'Failed to add item';
      setFormError(message);
      showToast(message, 'error');
    },
  });

  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target as any;
    if (type === 'checkbox') {
      setFormData((prev) => (
        {
          ...prev,
          [name]: (e.target as HTMLInputElement).checked,
        }
      ));
    } else {
      setFormData((prev) => (
        {
          ...prev,
          [name]: value,
        }
      ));
    }
    setFormError('');
  };

  const handleSubmitManualItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formData.title.trim()) {
      setFormError('Title is required');
      return;
    }

    if (formData.isAuction && !formData.startingBid) {
      setFormError('Starting bid is required for auction items');
      return;
    }

    if (!formData.isAuction && !formData.price) {
      setFormError('Price is required for regular items');
      return;
    }

    const payload: any = {
      saleId,
      title: formData.title,
      description: formData.description || '',
      category: formData.category || null,
      condition: formData.condition || null,
      quantity: parseInt(formData.quantity, 10) || 1,
    };

    if (formData.isAuction) {
      payload.auctionStartPrice = parseFloat(formData.startingBid);
    } else {
      payload.price = parseFloat(formData.price);
    }

    createItemMutation.mutate(payload);
  };

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
                      .catch(() => showToast('Export failed. Please try again.', 'error'));
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

          {/* Tabs */}
          <div className="mb-8 border-b border-warm-200">
            <div className="flex gap-4">
              <button
                onClick={() => setActiveTab('manual')}
                className={`pb-4 px-2 font-medium transition-colors ${
                  activeTab === 'manual'
                    ? 'text-amber-600 border-b-2 border-amber-600'
                    : 'text-warm-600 hover:text-warm-900'
                }`}
              >
                ✏️ Manual Entry
              </button>
              <button
                onClick={() => setActiveTab('batch')}
                className={`pb-4 px-2 font-medium transition-colors ${
                  activeTab === 'batch'
                    ? 'text-amber-600 border-b-2 border-amber-600'
                    : 'text-warm-600 hover:text-warm-900'
                }`}
              >
                📦 Batch Upload (AI)
              </button>
              <button
                onClick={() => setActiveTab('upload')}
                className={`pb-4 px-2 font-medium transition-colors ${
                  activeTab === 'upload'
                    ? 'text-amber-600 border-b-2 border-amber-600'
                    : 'text-warm-600 hover:text-warm-900'
                }`}
              >
                📸 Photo Upload
              </button>
            </div>
          </div>

          {/* Manual Entry Tab */}
          {activeTab === 'manual' && (
            <div className="mb-8">
              <div className="bg-warm-50 border border-warm-200 rounded-lg p-6">
                <h2 className="text-xl font-semibold text-warm-900 mb-6">Add Single Item</h2>

                {formError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded">
                    {formError}
                  </div>
                )}

                <form onSubmit={handleSubmitManualItem} className="space-y-4">
                  {/* Title */}
                  <div>
                    <label className="block text-sm font-medium text-warm-900 mb-1">
                      Title <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      name="title"
                      value={formData.title}
                      onChange={handleFormChange}
                      maxLength={100}
                      placeholder="e.g., Vintage Oak Dining Table"
                      className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                      disabled={createItemMutation.isPending}
                    />
                    <p className="text-xs text-warm-600 mt-1">
                      {formData.title.length}/100 characters
                    </p>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-warm-900 mb-1">
                      Description
                    </label>
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleFormChange}
                      maxLength={500}
                      rows={3}
                      placeholder="Add any details about the item..."
                      className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                      disabled={createItemMutation.isPending}
                    />
                    <p className="text-xs text-warm-600 mt-1">
                      {formData.description.length}/500 characters
                    </p>
                  </div>

                  {/* Row: Price vs Starting Bid */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          name="isAuction"
                          checked={formData.isAuction}
                          onChange={handleFormChange}
                          className="w-4 h-4"
                          disabled={createItemMutation.isPending}
                        />
                        <span className="text-sm font-medium text-warm-900">
                          This is an auction item
                        </span>
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {formData.isAuction ? (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-warm-900 mb-1">
                              Starting Bid <span className="text-red-600">*</span>
                            </label>
                            <div className="relative">
                              <span className="absolute left-4 top-2.5 text-warm-600">$</span>
                              <input
                                type="number"
                                name="startingBid"
                                value={formData.startingBid}
                                onChange={handleFormChange}
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                className="w-full pl-7 pr-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                                disabled={createItemMutation.isPending}
                              />
                            </div>
                          </div>
                          <div className="opacity-50">
                            <label className="block text-sm font-medium text-warm-900 mb-1">
                              Price (N/A)
                            </label>
                            <input
                              type="text"
                              disabled
                              className="w-full px-4 py-2 border border-warm-200 rounded-lg bg-warm-100"
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-warm-900 mb-1">
                              Price <span className="text-red-600">*</span>
                            </label>
                            <div className="relative">
                              <span className="absolute left-4 top-2.5 text-warm-600">$</span>
                              <input
                                type="number"
                                name="price"
                                value={formData.price}
                                onChange={handleFormChange}
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                className="w-full pl-7 pr-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                                disabled={createItemMutation.isPending}
                              />
                            </div>
                          </div>
                          <div className="opacity-50">
                            <label className="block text-sm font-medium text-warm-900 mb-1">
                              Starting Bid (N/A)
                            </label>
                            <input
                              type="text"
                              disabled
                              className="w-full px-4 py-2 border border-warm-200 rounded-lg bg-warm-100"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Category & Condition */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-warm-900 mb-1">
                        Category
                      </label>
                      <select
                        name="category"
                        value={formData.category}
                        onChange={handleFormChange}
                        className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                        disabled={createItemMutation.isPending}
                      >
                        <option value="">Select category...</option>
                        {CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-warm-900 mb-1">
                        Condition
                      </label>
                      <select
                        name="condition"
                        value={formData.condition}
                        onChange={handleFormChange}
                        className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                        disabled={createItemMutation.isPending}
                      >
                        <option value="">Select condition...</option>
                        {CONDITIONS.map((cond) => (
                          <option key={cond} value={cond}>
                            {cond}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Quantity */}
                  <div>
                    <label className="block text-sm font-medium text-warm-900 mb-1">
                      Quantity
                    </label>
                    <input
                      type="number"
                      name="quantity"
                      value={formData.quantity}
                      onChange={handleFormChange}
                      min="1"
                      step="1"
                      className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                      disabled={createItemMutation.isPending}
                    />
                  </div>

                  {/* Submit Button */}
                  <div className="pt-4">
                    <button
                      type="submit"
                      disabled={createItemMutation.isPending}
                      className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors"
                    >
                      {createItemMutation.isPending ? 'Adding...' : 'Add Item'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Batch Upload Tab (CD2 Phase 2) */}
          {activeTab === 'batch' && (
            <div className="mb-8">
              <SmartInventoryUpload
                saleId={String(saleId)}
                onComplete={() => {
                  refetchItems();
                }}
              />
            </div>
          )}

          {/* Items List */}
          <div className="mt-8">
            <h2 className="text-xl font-semibold text-warm-900 mb-4">
              {items?.length || 0} Item{items?.length !== 1 ? 's' : ''}
            </h2>

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
              <p className="text-warm-600 text-center py-8">No items added yet. Use the batch upload, manual entry, or import button above to get started.</p>
            )}
          </div>
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
