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

const EditItemPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: '',
    category: '',
    condition: '',
    status: 'AVAILABLE',
  });

  if (!authLoading && (!user || user.role !== 'ORGANIZER')) {
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
      setFormData({
        title: item.title,
        description: item.description,
        price: item.price || '',
        category: item.category || '',
        condition: item.condition || '',
        status: item.status,
      });
    }
  }, [item]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      return await api.patch(`/items/${id}`, formData);
    },
    onSuccess: () => {
      showToast('Item updated', 'success');
      router.push(`/organizer/dashboard`);
    },
    onError: (error: any) => {
      showToast(error.response?.data?.message || 'Failed to update item', 'error');
    },
  });

  if (authLoading || isLoading) return <div>Loading...</div>;

  return (
    <>
      <Head>
        <title>Edit Item - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-white">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <Link href="/organizer/dashboard" className="text-amber-600 hover:underline text-sm font-medium mb-4 inline-block">
            Back to dashboard
          </Link>

          <h1 className="text-3xl font-bold text-warm-900 mb-8">Edit Item</h1>

          <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(); }} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-warm-700 mb-2">Title</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-700 mb-2">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
                className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-700 mb-2">
                Category
              </label>
              <select
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
                className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
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
              <label className="block text-sm font-medium text-warm-700 mb-2">
                Condition
              </label>
              <select
                value={formData.condition}
                onChange={(e) =>
                  setFormData({ ...formData, condition: e.target.value })
                }
                className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
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
              <label className="block text-sm font-medium text-warm-700 mb-2">
                Price
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.price}
                onChange={(e) =>
                  setFormData({ ...formData, price: e.target.value })
                }
                className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
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
              <label className="block text-sm font-medium text-warm-700 mb-2">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value })
                }
                className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
              >
                <option value="AVAILABLE">Available</option>
                <option value="SOLD">Sold</option>
                <option value="UNAVAILABLE">Unavailable</option>
              </select>
            </div>

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
