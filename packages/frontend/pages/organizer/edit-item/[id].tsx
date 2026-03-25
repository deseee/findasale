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
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../../lib/api';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';
import ItemPhotoManager from '../../../components/ItemPhotoManager'; // Phase 16
import PriceSuggestion from '../../../components/PriceSuggestion'; // CD2 Phase 3
import Head from 'next/head';
import Link from 'next/link';
import Skeleton from '../../../components/Skeleton';

const EditItemPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: '',
    quantity: 1,
    category: '',
    condition: '',
    status: 'AVAILABLE',
    auctionEndTime: '',
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
      let rawCat = (item.category || '').trim();
      let normalizedCategory = '';
      if (rawCat) {
        // Handle various formats: "tools", "Tools", "TOOLS" → "Tools"
        normalizedCategory = rawCat.charAt(0).toUpperCase() + rawCat.slice(1).toLowerCase();
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
        status: item.status || 'AVAILABLE',
        auctionEndTime: item.auctionEndTime ? new Date(item.auctionEndTime).toISOString().slice(0, 16) : '',
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

            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
};

export default EditItemPage;