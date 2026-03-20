import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from '../components/AuthContext';
import { useToast } from '../components/ToastContext';
import { getThumbnailUrl } from '../lib/imageUtils';

interface WishlistItem {
  id: string;
  itemId: string;
  note?: string;
  addedAt: string;
  item: {
    id: string;
    title: string;
    price?: number;
    auctionStartPrice?: number;
    photoUrls: string[];
    sale: {
      id: string;
      title: string;
    };
  };
}

interface Wishlist {
  id: string;
  name: string;
  occasion?: string;
  isPublic: boolean;
  shareSlug?: string;
  items: WishlistItem[];
  createdAt: string;
  updatedAt: string;
}

const occasionLabels: Record<string, string> = {
  moving: 'Moving',
  downsizing: 'Downsizing',
  decorating: 'Decorating',
  gifting: 'Gifting',
  other: 'Other',
};

const WishlistsPage = () => {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [selectedWishlistId, setSelectedWishlistId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newOccasion, setNewOccasion] = useState('');
  const [newIsPublic, setNewIsPublic] = useState(false);

  // Redirect if not logged in
  useEffect(() => {
    if (user === null) {
      router.push('/auth/login');
    }
  }, [user, router]);

  // Fetch wishlists
  const { data: wishlists = [], isLoading, refetch } = useQuery({
    queryKey: ['wishlists'],
    queryFn: async () => {
      const response = await api.get('/wishlists');
      return response.data as Wishlist[];
    },
    enabled: !!user,
  });

  // Create wishlist mutation
  const createMutation = useMutation({
    mutationFn: (data: { name: string; occasion: string; isPublic: boolean }) =>
      api.post('/wishlists', data),
    onSuccess: () => {
      showToast('Wishlist created!', 'success');
      setShowNewForm(false);
      setNewName('');
      setNewOccasion('');
      setNewIsPublic(false);
      queryClient.invalidateQueries({ queryKey: ['wishlists'] });
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to create wishlist', 'error');
    },
  });

  // Remove item mutation
  const removeItemMutation = useMutation({
    mutationFn: (wishlistItemId: string) =>
      api.delete(`/wishlists/items/${wishlistItemId}`),
    onSuccess: () => {
      showToast('Item removed', 'success');
      queryClient.invalidateQueries({ queryKey: ['wishlists'] });
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to remove item', 'error');
    },
  });

  // Share link mutation
  const shareMutation = useMutation({
    mutationFn: (wishlistId: string) =>
      api.post(`/wishlists/${wishlistId}/share`, {}),
    onSuccess: (response: any) => {
      showToast('Share link copied!', 'success');
      navigator.clipboard.writeText(response.data.shareUrl);
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to generate share link', 'error');
    },
  });

  const handleCreateWishlist = () => {
    if (!newName.trim()) {
      showToast('Please enter a wishlist name', 'error');
      return;
    }
    createMutation.mutate({
      name: newName,
      occasion: newOccasion || '',
      isPublic: newIsPublic,
    });
  };

  if (!user) {
    return null; // Redirect in progress
  }

  const selectedWishlist = wishlists.find((w) => w.id === selectedWishlistId);

  return (
    <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
      <Head>
        <title>My Wishlists - FindA.Sale</title>
      </Head>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-2">My Wishlists</h1>
          <p className="text-warm-600 dark:text-warm-400">Save items to named wishlists for moving, decorating, gifting, and more.</p>
        </div>

        {/* New Wishlist Form */}
        {showNewForm && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-4">Create New Wishlist</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                  Wishlist Name
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Moving to New Place"
                  className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                  Occasion (optional)
                </label>
                <select
                  value={newOccasion}
                  onChange={(e) => setNewOccasion(e.target.value)}
                  className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">Select an occasion</option>
                  <option value="moving">Moving</option>
                  <option value="downsizing">Downsizing</option>
                  <option value="decorating">Decorating</option>
                  <option value="gifting">Gifting</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="public-toggle"
                  checked={newIsPublic}
                  onChange={(e) => setNewIsPublic(e.target.checked)}
                  className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded"
                />
                <label htmlFor="public-toggle" className="ml-2 text-sm text-warm-700 dark:text-warm-300">
                  Make this wishlist public (can be shared)
                </label>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleCreateWishlist}
                  disabled={createMutation.isPending}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Wishlist'}
                </button>
                <button
                  onClick={() => {
                    setShowNewForm(false);
                    setNewName('');
                    setNewOccasion('');
                    setNewIsPublic(false);
                  }}
                  className="bg-warm-200 hover:bg-warm-300 text-warm-900 dark:text-warm-100 font-semibold py-2 px-6 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {!showNewForm && (
          <button
            onClick={() => setShowNewForm(true)}
            className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors mb-8"
          >
            + New Wishlist
          </button>
        )}

        {isLoading ? (
          <div className="text-center py-12 text-warm-600 dark:text-warm-400">Loading wishlists...</div>
        ) : wishlists.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-warm-600 dark:text-warm-400 text-lg mb-4">No wishlists yet. Create one to get started!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Wishlist Cards */}
            <div className="lg:col-span-1 space-y-3">
              {wishlists.map((wishlist) => (
                <button
                  key={wishlist.id}
                  onClick={() => setSelectedWishlistId(wishlist.id)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                    selectedWishlistId === wishlist.id
                      ? 'border-amber-600 bg-amber-50'
                      : 'border-warm-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-warm-300'
                  }`}
                >
                  <div className="font-semibold text-warm-900 dark:text-warm-100">{wishlist.name}</div>
                  <div className="text-sm text-warm-600 dark:text-warm-400 mt-1">
                    {wishlist.occasion && (
                      <>
                        <span className="inline-block bg-warm-100 dark:bg-gray-700 px-2 py-1 rounded text-xs mr-2">
                          {occasionLabels[wishlist.occasion] || wishlist.occasion}
                        </span>
                      </>
                    )}
                    <span className="text-xs">{wishlist.items.length} items</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Wishlist Items Detail */}
            {selectedWishlist && (
              <div className="lg:col-span-2">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100">{selectedWishlist.name}</h2>
                      {selectedWishlist.occasion && (
                        <p className="text-sm text-warm-600 dark:text-warm-400 mt-1">
                          Occasion: {occasionLabels[selectedWishlist.occasion] || selectedWishlist.occasion}
                        </p>
                      )}
                    </div>
                    {selectedWishlist.isPublic && (
                      <button
                        onClick={() => shareMutation.mutate(selectedWishlist.id)}
                        disabled={shareMutation.isPending}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg text-sm transition-colors disabled:opacity-50"
                      >
                        {shareMutation.isPending ? 'Generating...' : 'Share'}
                      </button>
                    )}
                  </div>

                  {selectedWishlist.items.length === 0 ? (
                    <div className="text-center py-12 text-warm-600 dark:text-warm-400">
                      <p>No items in this wishlist yet.</p>
                      <p className="text-sm mt-2">Browse sales and click the bookmark icon to add items.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      {selectedWishlist.items.map((wishlistItem) => (
                        <div key={wishlistItem.id} className="group relative bg-warm-50 dark:bg-gray-900 rounded-lg overflow-hidden border border-warm-200 dark:border-gray-700">
                          {/* Item Photo */}
                          <Link href={`/items/${wishlistItem.item.id}`}>
                            <div className="relative w-full h-32 bg-warm-200 overflow-hidden">
                              {wishlistItem.item.photoUrls.length > 0 ? (
                                <img
                                  src={getThumbnailUrl(wishlistItem.item.photoUrls[0]) || wishlistItem.item.photoUrls[0]}
                                  alt={wishlistItem.item.title}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-warm-400">
                                  No photo
                                </div>
                              )}
                            </div>
                          </Link>

                          {/* Item Info */}
                          <div className="p-3">
                            <Link href={`/items/${wishlistItem.item.id}`}>
                              <h3 className="font-semibold text-sm text-warm-900 dark:text-warm-100 truncate hover:text-amber-600">
                                {wishlistItem.item.title}
                              </h3>
                            </Link>
                            <p className="text-xs text-warm-600 dark:text-warm-400 mt-1">
                              {wishlistItem.item.sale.title}
                            </p>
                            {(wishlistItem.item.price || wishlistItem.item.auctionStartPrice) && (
                              <p className="text-sm font-semibold text-amber-600 mt-2">
                                ${(wishlistItem.item.price || wishlistItem.item.auctionStartPrice)?.toFixed(2)}
                              </p>
                            )}
                          </div>

                          {/* Remove Button */}
                          <button
                            onClick={() => removeItemMutation.mutate(wishlistItem.id)}
                            disabled={removeItemMutation.isPending}
                            className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                            title="Remove from wishlist"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default WishlistsPage;
