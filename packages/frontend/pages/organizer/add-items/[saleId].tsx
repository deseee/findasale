/**
 * Add Items Detail Page
 *
 * Tabs:
 * - Manual Entry: standard form + photo upload
 * - Camera (AI — one item): capture → AI pre-fill → review or auto-create
 * - Batch (AI — multiple): SmartInventoryUpload for bulk photo processing
 * - CSV: modal trigger
 *
 * Session 132 fixes:
 * - Removed Qty column from item list (quantity not in Prisma schema)
 * - Removed Quantity input from manual entry form
 * - Fixed bulk update URL: /items/bulk (was /items/bulk-update — silent 404)
 * - Restored Camera tab: wired RapidCapture with AI analysis flow
 * - Camera: capture → upload → AI analyze → pre-fill manual form → review
 * - maxPhotos=5 per camera session (one-item-at-a-time flow)
 */

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../lib/api';
import CSVImportModal from '../../../components/CSVImportModal';
import SmartInventoryUpload from '../../../components/SmartInventoryUpload';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';
import Head from 'next/head';
import Link from 'next/link';
import Skeleton from '../../../components/Skeleton';
import RapidCapture from '../../../components/RapidCapture';

type ActiveTab = 'camera' | 'batch' | 'manual';

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

const normalizeToArray = (value: string | undefined, arr: string[]): string => {
  if (!value) return '';
  const lowerValue = value.toLowerCase();
  const match = arr.find(item => item.toLowerCase() === lowerValue);
  return match || '';
};

const emptyForm = {
  title: '',
  description: '',
  category: '',
  condition: '',
  price: '',
  quantity: 1,
  listingType: 'FIXED',
  startingBid: '',
  reservePrice: '',
  reverseDailyDrop: '',
  reverseFloorPrice: '',
  shippingAvailable: false,
  shippingPrice: '',
  photoUrls: [] as string[],
};

const AddItemsDetailPage = () => {
  const router = useRouter();
  const { saleId } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<ActiveTab>('camera');
  const [formData, setFormData] = useState(emptyForm);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [bulkPrice, setBulkPrice] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraAnalyzing, setCameraAnalyzing] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  if (!authLoading && (!user || user.role !== 'ORGANIZER')) {
    router.push('/login');
    return null;
  }

  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['items', saleId],
    queryFn: async () => {
      if (!saleId) return [];
      const response = await api.get(`/items?saleId=${saleId}`);
      return response.data || [];
    },
    enabled: !!saleId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const photoUrls = formData.photoUrls;
      return await api.post(
        `/items`,
        { ...formData, saleId, photoUrls },
        { headers: { 'Content-Type': 'application/json' } }
      );
    },
    onSuccess: () => {
      showToast('Item created successfully', 'success');
      queryClient.invalidateQueries({ queryKey: ['items', saleId] });
      setFormData(emptyForm);
      setBulkPrice('');
    },
    onError: (error: any) => {
      const message =
        error.response?.data?.message || 'Failed to create item';
      showToast(message, 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return await api.delete(`/items/${itemId}`);
    },
    onSuccess: () => {
      showToast('Item deleted', 'success');
      queryClient.invalidateQueries({ queryKey: ['items', saleId] });
      setDeleteConfirmId(null);
    },
    onError: (error: any) => {
      const message =
        error.response?.data?.message || 'Failed to delete item';
      showToast(message, 'error');
    },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async (payload: { itemIds: string[]; operation: string; value?: any }) => {
      return await api.post(`/items/bulk`, payload);
    },
    onSuccess: () => {
      showToast('Items updated', 'success');
      queryClient.invalidateQueries({ queryKey: ['items', saleId] });
      setSelectedItems(new Set());
      setBulkPrice('');
    },
    onError: (error: any) => {
      const message =
        error.response?.data?.message || 'Failed to update items';
      showToast(message, 'error');
    },
  });

  const handlePhotoUpload = (urls: string[]) => {
    setFormData((prev) => ({
      ...prev,
      photoUrls: [...prev.photoUrls, ...urls],
    }));
  };

  const handleRemovePhoto = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      photoUrls: prev.photoUrls.filter((_, i) => i !== index),
    }));
  };

  const handleCameraComplete = async (photos: { blob: Blob; previewUrl: string }[]) => {
    setCameraOpen(false);
    if (photos.length === 0) return;

    setCameraAnalyzing(true);
    try {
      // Upload first photo and get AI analysis
      const formData = new FormData();
      formData.append('photo', photos[0].blob, 'camera-capture.jpg');

      const response = await api.post('/upload/analyze-photo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const ai = response.data;

      // Upload all photos to get Cloudinary URLs
      const photoFormData = new FormData();
      photos.forEach((p, i) => {
        photoFormData.append('photos', p.blob, `capture-${i}.jpg`);
      });

      const uploadRes = await api.post('/upload/sale-photos', photoFormData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const uploadedUrls: string[] = (uploadRes.data?.urls || uploadRes.data || []);

      // Pre-fill manual form with AI results
      setFormData({
        ...emptyForm,
        title: ai.title || '',
        description: ai.description || '',
        category: normalizeToArray(ai.category, CATEGORIES),
        condition: normalizeToArray(ai.condition, CONDITIONS),
        price: ai.suggestedPrice ? String(ai.suggestedPrice) : '',
        photoUrls: uploadedUrls,
      });

      // Switch to manual tab so organizer can review & submit
      setActiveTab('manual');
      showToast(`AI identified: "${ai.title || 'item'}". Review and save below.`, 'success');
    } catch (err: any) {
      console.error('Camera AI analysis error:', err);
      showToast('Photo captured but AI analysis failed. You can add details manually.', 'error');

      // Still upload photos even if AI fails
      try {
        const photoFormData = new FormData();
        photos.forEach((p, i) => {
          photoFormData.append('photos', p.blob, `capture-${i}.jpg`);
        });
        const uploadRes = await api.post('/upload/sale-photos', photoFormData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const uploadedUrls: string[] = (uploadRes.data?.urls || uploadRes.data || []);
        setFormData((prev) => ({ ...prev, photoUrls: uploadedUrls }));
      } catch {
        // Photo upload also failed — user can still add manually
      }

      setActiveTab('manual');
    } finally {
      setCameraAnalyzing(false);
      // Clean up blob URLs
      photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    }
  };

  const handleCategoryChange = (newCategory: string) => {
    setFormData((prev) => ({
      ...prev,
      category: normalizeToArray(newCategory, CATEGORIES),
    }));
  };

  const handleConditionChange = (newCondition: string) => {
    setFormData((prev) => ({
      ...prev,
      condition: normalizeToArray(newCondition, CONDITIONS),
    }));
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-white py-8">
        <div className="max-w-6xl mx-auto px-4">
          <Skeleton className="h-10 w-48 mb-8" />
          <div className="space-y-4">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Add Items - FindA.Sale</title>
      </Head>

      <main className="min-h-screen bg-warm-50 py-8">
        <div className="max-w-6xl mx-auto px-4">
          <div className="mb-8">
            <Link
              href={`/organizer/dashboard`}
              className="text-amber-700 hover:text-amber-800 text-sm font-medium inline-flex items-center gap-1"
            >
              &larr; Back to dashboard
            </Link>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-warm-200 p-6 mb-8">
            <h1 className="text-3xl font-bold text-warm-900 mb-2">Add Items</h1>
            <p className="text-warm-600">
              Add items to your sale using manual entry, camera capture, batch upload, or CSV import.
            </p>
          </div>

          {/* Tab Navigation — ordered by primary workflow */}
          <div className="flex gap-2 mb-6 flex-wrap">
            {(['camera', 'batch', 'manual'] as ActiveTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  setFormData(emptyForm);
                }}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  activeTab === tab
                    ? 'bg-amber-600 text-white'
                    : 'bg-white text-warm-700 border border-warm-300 hover:border-amber-400'
                }`}
              >
                {tab === 'camera' ? 'Camera (AI)' : tab === 'batch' ? 'Batch Upload' : 'Manual Entry'}
              </button>
            ))}
            <button
              onClick={() => setCsvModalOpen(true)}
              className="px-4 py-2 rounded-lg font-medium bg-white text-warm-700 border border-warm-300 hover:border-amber-400 transition-all"
            >
              CSV Import
            </button>
          </div>

          {/* Manual Entry Tab */}
          {activeTab === 'manual' && (
            <div className="bg-white rounded-lg shadow-sm border border-warm-200 p-6 mb-8">
              <h2 className="text-xl font-bold text-warm-900 mb-6">Add Item Manually</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!formData.title.trim()) {
                    showToast('Title is required', 'error');
                    return;
                  }
                  createMutation.mutate();
                }}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-warm-700 mb-2">Title *</label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                      placeholder="Item title"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-warm-700 mb-2">Category</label>
                    <select
                      value={formData.category}
                      onChange={(e) => handleCategoryChange(e.target.value)}
                      className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="">Select a category</option>
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-warm-700 mb-2">Condition</label>
                    <select
                      value={formData.condition}
                      onChange={(e) => handleConditionChange(e.target.value)}
                      className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="">Select condition</option>
                      {CONDITIONS.map((cond) => (
                        <option key={cond} value={cond}>
                          {cond}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-warm-700 mb-2">Price</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-warm-700 mb-2">Listing Type</label>
                    <select
                      value={formData.listingType}
                      onChange={(e) => setFormData({ ...formData, listingType: e.target.value })}
                      className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="FIXED">Fixed Price</option>
                      <option value="AUCTION">Auction</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-warm-700 mb-2">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                    placeholder="Item description"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-warm-700 mb-2">Photos</label>
                  {formData.photoUrls.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {formData.photoUrls.map((url, i) => (
                        <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-warm-300">
                          <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => handleRemovePhoto(i)}
                            className="absolute top-0.5 right-0.5 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                            aria-label={`Remove photo ${i + 1}`}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={async (e) => {
                      const files = e.target.files;
                      if (!files || files.length === 0) return;
                      setPhotoUploading(true);
                      try {
                        const uploadData = new FormData();
                        Array.from(files).forEach((f) => uploadData.append('photos', f));
                        const res = await api.post('/upload/sale-photos', uploadData, {
                          headers: { 'Content-Type': 'multipart/form-data' },
                        });
                        const urls: string[] = res.data?.urls || res.data || [];
                        handlePhotoUpload(urls);
                        showToast(`${urls.length} photo${urls.length !== 1 ? 's' : ''} uploaded`, 'success');
                      } catch {
                        showToast('Photo upload failed', 'error');
                      } finally {
                        setPhotoUploading(false);
                        if (photoInputRef.current) photoInputRef.current.value = '';
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={photoUploading}
                    className="w-full bg-warm-50 border-2 border-dashed border-warm-300 rounded-lg p-6 text-center hover:border-amber-400 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {photoUploading ? (
                      <span className="text-warm-600 text-sm">Uploading...</span>
                    ) : (
                      <>
                        <svg className="w-8 h-8 mx-auto text-warm-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 16v-8m0 0l-3 3m3-3l3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 3.75 3.75 0 013.572 5.095H19.5a4.5 4.5 0 01-4.5 4.5H9a4.5 4.5 0 01-2.25-.615z" />
                        </svg>
                        <span className="text-warm-600 text-sm">Click to upload photos</span>
                      </>
                    )}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Item'}
                </button>
              </form>
            </div>
          )}

          {/* Batch Upload Tab */}
          {activeTab === 'batch' && (
            <div className="bg-white rounded-lg shadow-sm border border-warm-200 p-6 mb-8">
              <h2 className="text-xl font-bold text-warm-900 mb-6">Batch Upload Photos</h2>
              <SmartInventoryUpload
                saleId={saleId as string}
                onComplete={() => {
                  queryClient.invalidateQueries({ queryKey: ['items', saleId] });
                }}
              />
            </div>
          )}

          {/* Camera Tab */}
          {activeTab === 'camera' && (
            <div className="bg-white rounded-lg shadow-sm border border-warm-200 p-6 mb-8">
              <h2 className="text-xl font-bold text-warm-900 mb-6">Capture with Camera</h2>
              {cameraAnalyzing ? (
                <div className="text-center py-12">
                  <div className="inline-block w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-warm-700 font-medium">Analyzing photo with AI...</p>
                  <p className="text-warm-500 text-sm mt-1">This may take a few seconds</p>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-warm-600 mb-4">
                    Take a photo of an item. AI will identify it and pre-fill the details for you to review.
                  </p>
                  <button
                    onClick={() => setCameraOpen(true)}
                    className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Open Camera
                  </button>
                </div>
              )}
            </div>
          )}

          {/* RapidCapture fullscreen overlay */}
          {cameraOpen && (
            <RapidCapture
              onComplete={handleCameraComplete}
              onCancel={() => setCameraOpen(false)}
              maxPhotos={5}
            />
          )}

          {/* Items List */}
          {itemsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : items && items.length > 0 ? (
            <div className="bg-white rounded-lg overflow-hidden border border-warm-200">
              <div className="p-4 border-b border-warm-200 flex items-center justify-between">
                <h2 className="font-semibold text-warm-900">
                  {items.length} Item{items.length !== 1 ? 's' : ''}
                  {selectedItems.size > 0 && (
                    <span className="ml-2 text-sm font-normal text-amber-600">
                      ({selectedItems.size} selected)
                    </span>
                  )}
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-warm-50 border-b border-warm-200">
                    <tr>
                      <th className="px-4 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={selectedItems.size === items.length && items.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedItems(new Set(items.map((i: any) => i.id)));
                            } else {
                              setSelectedItems(new Set());
                            }
                          }}
                          className="rounded"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-warm-900">Title</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-warm-900">Category</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-warm-900">Price</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-warm-900">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-warm-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-200">
                    {items.map((item: any) => (
                      <tr key={item.id} className="hover:bg-warm-50 transition-colors">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedItems.has(item.id)}
                            onChange={(e) => {
                              const newSet = new Set(selectedItems);
                              if (e.target.checked) newSet.add(item.id);
                              else newSet.delete(item.id);
                              setSelectedItems(newSet);
                            }}
                            className="rounded"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm font-medium">
                          <Link
                            href={`/organizer/edit-item/${item.id}`}
                            className="text-amber-700 hover:text-amber-900 hover:underline"
                          >
                            {item.title}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-warm-600">{item.category || '\u2014'}</td>
                        <td className="px-4 py-3 text-sm text-warm-900 font-semibold">
                          ${item.price ?? item.auctionStartPrice ?? '\u2014'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <button
                            onClick={() =>
                              bulkUpdateMutation.mutate({
                                itemIds: [item.id],
                                operation: 'isActive',
                                value: !item.isActive,
                              })
                            }
                            disabled={bulkUpdateMutation.isPending}
                            title={item.isActive ? 'Click to hide' : 'Click to show'}
                            className={`px-2 py-1 rounded-full text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity disabled:opacity-50 ${
                              item.isActive
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {item.isActive ? 'Active' : 'Hidden'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {deleteConfirmId === item.id ? (
                            <span className="flex items-center gap-2">
                              <span className="text-xs text-warm-700">Delete?</span>
                              <button
                                onClick={() => deleteMutation.mutate(item.id)}
                                disabled={deleteMutation.isPending}
                                className="text-red-600 hover:text-red-700 font-medium text-xs disabled:opacity-50"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="text-warm-600 hover:text-warm-700 font-medium text-xs"
                              >
                                No
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirmId(item.id)}
                              className="text-red-600 hover:text-red-700 font-medium"
                            >
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Bulk Actions */}
              {selectedItems.size > 0 && (
                <div className="bg-amber-50 border-t border-amber-200 p-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-sm font-semibold text-warm-900">
                      {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected
                    </span>
                    <button
                      onClick={() =>
                        bulkUpdateMutation.mutate({
                          itemIds: Array.from(selectedItems),
                          operation: 'isActive',
                          value: false,
                        })
                      }
                      disabled={bulkUpdateMutation.isPending}
                      className="text-sm font-semibold text-amber-700 hover:text-amber-800 disabled:opacity-50"
                    >
                      Hide
                    </button>
                    <button
                      onClick={() =>
                        bulkUpdateMutation.mutate({
                          itemIds: Array.from(selectedItems),
                          operation: 'isActive',
                          value: true,
                        })
                      }
                      disabled={bulkUpdateMutation.isPending}
                      className="text-sm font-semibold text-amber-700 hover:text-amber-800 disabled:opacity-50"
                    >
                      Show
                    </button>
                    <div className="flex gap-2 items-center">
                      <input
                        type="number"
                        value={bulkPrice}
                        onChange={(e) => setBulkPrice(e.target.value)}
                        placeholder="New price"
                        step="0.01"
                        className="w-28 px-3 py-1 border border-amber-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <button
                        onClick={() => {
                          if (bulkPrice) {
                            bulkUpdateMutation.mutate({
                              itemIds: Array.from(selectedItems),
                              operation: 'price',
                              value: parseFloat(bulkPrice),
                            });
                          }
                        }}
                        disabled={bulkUpdateMutation.isPending || !bulkPrice}
                        className="text-sm font-semibold text-amber-700 hover:text-amber-800 disabled:opacity-50"
                      >
                        Update Price
                      </button>
                    </div>

                    <div className="ml-auto">
                      {bulkDeleteConfirm ? (
                        <span className="flex items-center gap-2">
                          <span className="text-xs text-red-700">Delete {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''}?</span>
                          <button
                            onClick={() => {
                              bulkUpdateMutation.mutate({
                                itemIds: Array.from(selectedItems),
                                operation: 'delete',
                              });
                              setBulkDeleteConfirm(false);
                            }}
                            disabled={bulkUpdateMutation.isPending}
                            className="text-sm font-bold text-red-600 hover:text-red-700 disabled:opacity-50"
                          >
                            Yes, delete
                          </button>
                          <button
                            onClick={() => setBulkDeleteConfirm(false)}
                            className="text-sm font-medium text-warm-600 hover:text-warm-700"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setBulkDeleteConfirm(true)}
                          disabled={bulkUpdateMutation.isPending}
                          className="text-sm font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                        >
                          Delete Selected
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 bg-white rounded-lg border border-warm-200">
              <p className="text-warm-600 text-lg">No items yet. Use the tabs above to get started.</p>
            </div>
          )}
        </div>
      </main>

      {/* CSV Import Modal */}
      <CSVImportModal
        isOpen={csvModalOpen}
        saleId={saleId as string}
        onClose={() => setCsvModalOpen(false)}
        onImportComplete={() => {
          queryClient.invalidateQueries({ queryKey: ['items', saleId] });
          setCsvModalOpen(false);
        }}
      />
    </>
  );
};

export default AddItemsDetailPage;
