/**
 * Edit Item Page
 *
 * Allows organizers to:
 * - Update item title, description, photos
 * - Change pricing or auction settings
 * - Update status (active, sold, etc.)
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../lib/api';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';
import ItemPhotoManager from '../../../components/ItemPhotoManager'; // Phase 16
import PriceSuggestion from '../../../components/PriceSuggestion'; // CD2 Phase 3
import Head from 'next/head';
import Link from 'next/link';
import Skeleton from '../../../components/Skeleton';
import { CURATED_TAGS } from '../../../../shared/src'; // Sprint 1: Listing Factory tag vocabulary

const EditItemPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: '',
    quantity: 1,
    category: '',
    condition: '',
    conditionGrade: '',
    tags: [] as string[],
    status: 'AVAILABLE',
    auctionEndTime: '',
    qrEmbedEnabled: true,
  });

  if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  const { data: item, isLoading } = useQuery({
    queryKey: ['item', id],
    queryFn: async () => {
      const response = await api.get(`/items/${id}`);
      return response.data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (item) {
      // Normalize category to Title Case (e.g. "tools" → "Tools") so the
      // select value matches the option values defined in the form.
      // If category is missing, use empty string (will show placeholder)
      let normalizedCategory = '';
      if (item.category && typeof item.category === 'string') {
        const rawCat = item.category.trim();
        if (rawCat) {
          // Handle various formats: "tools", "Tools", "TOOLS", "vintage" → "Tools", "Vintage"
          // Split on space, title-case each word, then join
          normalizedCategory = rawCat
            .split(' ')
            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
        }
      }

      // Normalize condition to UPPERCASE (e.g. "good" → "GOOD", "Excellent" → "EXCELLENT")
      // Map common values to form options
      let normalizedCondition = '';
      if (item.condition) {
        const condUpper = item.condition.toUpperCase().trim();
        // Map to available options or use as-is if it matches
        if (['NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'POOR', 'EXCELLENT'].includes(condUpper)) {
          // Handle "EXCELLENT" as "LIKE_NEW" if not available
          normalizedCondition = condUpper === 'EXCELLENT' ? 'LIKE_NEW' : condUpper;
        } else {
          normalizedCondition = condUpper;
        }
      }

      setFormData({
        title: item.title || '',
        description: item.description || '',
        price: item.price ? item.price.toString() : '',
        quantity: item.quantity ?? 1,
        category: normalizedCategory,
        condition: normalizedCondition,
        conditionGrade: item.conditionGrade || '',
        tags: item.tags || [],
        status: item.status || 'AVAILABLE',
        auctionEndTime: item.auctionEndTime ? new Date(item.auctionEndTime).toISOString().slice(0, 16) : '',
        qrEmbedEnabled: item.qrEmbedEnabled !== false,
      });
    }
  }, [item]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      return await api.put(`/items/${id}`, formData);
    },
    onSuccess: () => {
      showToast('Item updated', 'success');
      router.push(`/organizer/dashboard`);
    },
    onError: (error: any) => {
      const status = error.response?.status;
      let message = 'Failed to update item';
      if (status === 400) {
        message = error.response?.data?.message || 'Validation error: please check your input';
      } else if (status === 401) {
        message = 'You are not authorized to update this item';
      } else if (status === 404) {
        message = 'Item not found';
      } else if (status === 500) {
        message = 'Server error: please try again later';
      } else {
        message = error.response?.data?.message || message;
      }
      showToast(message, 'error');
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      return await api.post(`/items/${id}/publish`);
    },
    onSuccess: () => {
      showToast('Item published!', 'success');
      // Refetch the item to update UI with new draftStatus
      queryClient.invalidateQueries({ queryKey: ['item', id] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to publish item';
      showToast(message, 'error');
    },
  });

  const unpublishMutation = useMutation({
    mutationFn: async () => {
      return await api.put(`/items/${id}`, { draftStatus: 'DRAFT' });
    },
    onSuccess: () => {
      showToast('Item unpublished', 'success');
      // Refetch the item to update UI with new draftStatus
      queryClient.invalidateQueries({ queryKey: ['item', id] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to unpublish item';
      showToast(message, 'error');
    },
  });

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-800 py-8">
        <div className="max-w-2xl mx-auto px-4">
          <Skeleton className="h-10 w-48 mb-8" />
          <div className="space-y-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-24" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-800 py-8">
        <div className="max-w-2xl mx-auto px-4">
          <Link href="/organizer/dashboard" className="text-amber-600 hover:underline text-sm font-medium mb-4 inline-block">
            Back to dashboard
          </Link>
          <div className="text-center py-16">
            <p className="text-warm-600 dark:text-warm-400 text-lg">Item not found or you don&apos;t have permission to edit it.</p>
          </div>
        </div>
      </div>
    );
  }

  const handlePublishItem = async () => {
    try {
      if (item.draftStatus === 'PUBLISHED') {
        // Unpublish
        await unpublishMutation.mutateAsync();
      } else {
        // Publish
        await publishMutation.mutateAsync();
      }
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to update item status';
      showToast(message, 'error');
    }
  };

  return (
    <>
      <Head>
        <title>Edit Item - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-white dark:bg-gray-800">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <Link href="/organizer/dashboard" className="text-amber-600 hover:underline text-sm font-medium mb-4 inline-block">
            Back to dashboard
          </Link>

          <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-8">Edit Item</h1>

          <form onSubmit={(e) => {
            e.preventDefault();
            if (!formData.title.trim()) {
              showToast('Title is required', 'error');
              return;
            }
            updateMutation.mutate();
          }} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">Title</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                Category
              </label>
              <select
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
              >
                <option value="">Select a category</option>
                <option value="Furniture">Furniture</option>
                <option value="Electronics">Electronics</option>
                <option value="Clothing">Clothing</option>
                <option value="Books">Books</option>
                <option value="Kitchenware">Kitchenware</option>
                <option value="Tools">Tools</option>
                <option value="Art">Art</option>
                <option value="Decor">Decor</option>
                <option value="Jewelry">Jewelry</option>
                <option value="Toys">Toys</option>
                <option value="Sports">Sports</option>
                <option value="Collectibles">Collectibles</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                Condition
              </label>
              <select
                value={formData.condition}
                onChange={(e) =>
                  setFormData({ ...formData, condition: e.target.value })
                }
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
              >
                <option value="">Select condition</option>
                <option value="NEW">New</option>
                <option value="LIKE_NEW">Like New</option>
                <option value="GOOD">Good</option>
                <option value="FAIR">Fair</option>
                <option value="POOR">Poor</option>
              </select>
            </div>

            {/* #64: Condition Grade Picker */}
            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                Condition Grade
              </label>
              <div className="flex gap-2">
                {(['S','A','B','C','D'] as const).map(grade => {
                  const labels: Record<string, string> = { S:'Like New', A:'Excellent', B:'Good', C:'Fair', D:'Poor' };
                  return (
                    <button
                      key={grade}
                      type="button"
                      onClick={() => setFormData({ ...formData, conditionGrade: grade })}
                      className={`flex-1 py-1.5 text-xs font-bold rounded border transition-colors ${formData.conditionGrade === grade ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-indigo-400'}`}
                      title={labels[grade]}
                    >
                      {grade}
                    </button>
                  );
                })}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {(['S','A','B','C','D'] as const).map(g => {
                  const labels: Record<string, string> = { S:'Like new', A:'Excellent', B:'Good', C:'Fair', D:'Poor' };
                  return `${g}=${labels[g]}`;
                }).join(' · ')}
              </div>
            </div>

            {/* Sprint 1: Tag Picker */}
            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">Tags</label>

              {/* Curated tag grid — show top 20 visible, scrollable */}
              <div className="grid grid-cols-3 gap-1 mb-2 max-h-32 overflow-y-auto pb-1">
                {(CURATED_TAGS as readonly string[]).slice(0, 20).map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      if (formData.tags.includes(tag)) {
                        setFormData({ ...formData, tags: formData.tags.filter(t => t !== tag) });
                      } else {
                        setFormData({ ...formData, tags: [...formData.tags, tag] });
                      }
                    }}
                    className={`text-xs px-2 py-1 rounded border truncate transition-colors
                      ${formData.tags.includes(tag)
                        ? 'bg-indigo-100 dark:bg-indigo-900 border-indigo-400 text-indigo-700 dark:text-indigo-200 font-medium'
                        : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 hover:border-indigo-300'
                      }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              {/* Custom tag input */}
              <input
                type="text"
                placeholder="Add a custom tag..."
                className="w-full border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded px-2 py-1 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const value = (e.target as HTMLInputElement).value.trim();
                    if (value && !formData.tags.includes(value)) {
                      setFormData({ ...formData, tags: [...formData.tags, value] });
                      (e.target as HTMLInputElement).value = '';
                    }
                  }
                }}
              />

              {/* Current tags display */}
              <div className="flex flex-wrap gap-1">
                {formData.tags.map(tag => (
                  <span key={tag} className="inline-flex items-center bg-indigo-50 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-200 text-xs px-2 py-0.5 rounded-full">
                    {tag}
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, tags: formData.tags.filter(t => t !== tag) })}
                      className="ml-1 text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-bold"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                Price
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.price}
                onChange={(e) =>
                  setFormData({ ...formData, price: e.target.value })
                }
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
              />

              {/* CD2 Phase 3: AI Price Suggestion */}
              <div className="mt-3">
                <PriceSuggestion
                  title={formData.title}
                  category={formData.category}
                  condition={formData.condition}
                  onApplyPrice={(price) =>
                    setFormData({
                      ...formData,
                      price: price.toString(),
                    })
                  }
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                Quantity
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={formData.quantity}
                onChange={(e) =>
                  setFormData({ ...formData, quantity: Math.max(1, parseInt(e.target.value) || 1) })
                }
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value })
                }
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
              >
                <option value="AVAILABLE">Available</option>
                <option value="SOLD">Sold</option>
                <option value="UNAVAILABLE">Unavailable</option>
              </select>
            </div>

            {/* Auction End Time - show only for auction items */}
            {item?.listingType === 'AUCTION' && (
              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                  Auction End Time
                </label>
                <input
                  type="datetime-local"
                  value={formData.auctionEndTime}
                  onChange={(e) => setFormData({ ...formData, auctionEndTime: e.target.value })}
                  className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                  Default: night before sale starts at 8:00 PM
                </p>
              </div>
            )}

                        {/* Phase 16: Photo management */}
            {item && (
              <div>
                <ItemPhotoManager
                  itemId={String(id)}
                  initialPhotos={item.photoUrls || []}
                />
              </div>
            )}

            {/* Feature #136: QR Code Auto-Embedding toggle */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="qrEmbedEnabled"
                checked={formData.qrEmbedEnabled}
                onChange={(e) => setFormData({ ...formData, qrEmbedEnabled: e.target.checked })}
                className="w-4 h-4 text-amber-600 bg-white border-warm-300 rounded focus:ring-2 focus:ring-amber-500 cursor-pointer"
              />
              <label htmlFor="qrEmbedEnabled" className="text-sm font-medium text-warm-700 dark:text-warm-300 cursor-pointer">
                Embed QR code in exported photos
              </label>
              <p className="text-xs text-warm-500 dark:text-warm-400">
                QR codes link to this item&apos;s page on FindA.Sale
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50"
              >
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>

              <button
                type="button"
                disabled={publishMutation.isPending || unpublishMutation.isPending}
                onClick={handlePublishItem}
                className={`flex-1 font-bold py-2 px-4 rounded-lg disabled:opacity-50 ${
                  item.draftStatus === 'PUBLISHED'
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                {publishMutation.isPending || unpublishMutation.isPending
                  ? 'Updating...'
                  : item.draftStatus === 'PUBLISHED'
                    ? 'Unpublish'
                    : 'Publish'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default EditItemPage;