import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { Camera, Search, X } from 'lucide-react';
import { useAuth } from '@/components/AuthContext';
import { useToast } from '@/components/ToastContext';
import { useFeedbackSurvey } from '@/hooks/useFeedbackSurvey';
import { useCreateHaulPost } from '@/hooks/useHaulPosts';
import api from '@/lib/api';

interface PurchasedItem {
  id: string;
  title: string;
  thumbnailUrl?: string;
}

function CreateHaulPostPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { showSurvey } = useFeedbackSurvey();
  const createHaul = useCreateHaulPost();

  const [mounted, setMounted] = useState(false);
  const [photoUrl, setPhotoUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [linkedItemIds, setLinkedItemIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PurchasedItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Search for items from shopper's purchases
  const searchPurchasedItems = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    try {
      // Fetch the shopper's receipts/purchases which include items
      const response = await api.get('/receipts/my-receipts');
      const purchases = response.data || [];

      // Filter items by title matching the query
      const matchingItems: PurchasedItem[] = [];
      const seen = new Set<string>();

      purchases.forEach((purchase: any) => {
        if (purchase.item && !seen.has(purchase.item.id)) {
          if (purchase.item.title.toLowerCase().includes(query.toLowerCase())) {
            matchingItems.push({
              id: purchase.item.id,
              title: purchase.item.title,
            });
            seen.add(purchase.item.id);
          }
        }
      });

      setSearchResults(matchingItems.slice(0, 8)); // Limit to 8 results
    } catch (err) {
      console.error('Error searching purchases:', err);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  // Handle file upload for photo
  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    const MAX_FILE_SIZE_MB = 5;
    const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      showToast(`Photo must be under ${MAX_FILE_SIZE_MB}MB`, 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    try {
      // Upload to /api/upload/item-photo endpoint
      const formData = new FormData();
      formData.append('photo', file);
      const uploadRes = await api.post('/upload/item-photo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const url: string = uploadRes.data.url;
      setPhotoUrl(url);
      showToast('Photo uploaded successfully', 'success');
    } catch (err: any) {
      const serverMsg = err?.response?.data?.error || err?.response?.data?.message;
      const msg = serverMsg ? `Upload failed: ${serverMsg}` : 'Upload failed. Please try again.';
      showToast(msg, 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Redirect if not authenticated
  if (mounted && !authLoading && !user) {
    router.push('/login');
    return null;
  }

  const handleAddItem = (item: PurchasedItem) => {
    if (item.id && !linkedItemIds.includes(item.id)) {
      setLinkedItemIds([...linkedItemIds, item.id]);
      setSearchQuery('');
      setSearchResults([]);
      setShowSearchDropdown(false);
    }
  };

  const handleRemoveItem = (itemId: string) => {
    setLinkedItemIds(linkedItemIds.filter((id) => id !== itemId));
  };

  // Handle search input changes with debounce
  const handleSearchChange = async (value: string) => {
    setSearchQuery(value);
    setShowSearchDropdown(true);
    await searchPurchasedItems(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!photoUrl.trim()) {
      showToast('Please provide a photo URL', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await createHaul.mutateAsync({
        photoUrl: photoUrl.trim(),
        caption: caption.trim() || undefined,
        linkedItemIds: linkedItemIds.length > 0 ? linkedItemIds : undefined,
      });

      showToast('Haul posted successfully!', 'success');
      showSurvey('SH-4');
      router.push('/shopper/haul-posts');
    } catch (err) {
      console.error('Error creating haul post:', err);
      showToast('Failed to create haul post', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!mounted || authLoading) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Share Your Haul - FindA.Sale</title>
        <meta name="description" content="Share photos of your latest finds with the community" />
      </Head>

      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="mb-8">
          <Link
            href="/shopper/haul-posts"
            className="text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 text-sm font-medium mb-4 inline-flex items-center gap-2"
          >
            ← Back to Haul Posts
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">Share Your Haul</h1>
          <p className="text-gray-600 dark:text-gray-400">Show off your latest finds to the community</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 space-y-6">
          {/* Photo Upload */}
          <div>
            <label htmlFor="photoUpload" className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Photo *
            </label>

            {!photoUrl ? (
              <div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-amber-500 dark:hover:border-amber-400 flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Camera size={20} className="text-gray-600 dark:text-gray-400" />
                  <span className="text-gray-700 dark:text-gray-300 font-medium">
                    {uploading ? 'Uploading...' : 'Upload Photo'}
                  </span>
                </button>
                <input
                  ref={fileInputRef}
                  id="photoUpload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handlePhotoUpload(e.target.files)}
                  disabled={uploading}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Click to select a photo from your device (max 5MB)
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative rounded-lg overflow-hidden">
                  <img
                    src={photoUrl}
                    alt="Preview"
                    className="w-full max-h-96 object-cover rounded-lg"
                    onError={() => {
                      showToast('Could not load image preview', 'error');
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPhotoUrl('');
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium"
                >
                  Change Photo
                </button>
              </div>
            )}
          </div>

          {/* Caption */}
          <div>
            <label htmlFor="caption" className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Caption (Optional)
            </label>
            <textarea
              id="caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Tell us about your haul! What did you find? Any good deals?"
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 dark:bg-gray-700 dark:text-white resize-none"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {caption.length}/500
            </p>
          </div>

          {/* Linked items */}
          <div>
            <label htmlFor="itemSearch" className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Link Items from Your Purchases (Optional)
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Search and tag items you found to connect your haul to specific purchases
            </p>

            {linkedItemIds.length > 0 && (
              <div className="mb-4 space-y-2">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Linked items:</p>
                {linkedItemIds.map((itemId) => (
                  <div
                    key={itemId}
                    className="flex items-center justify-between bg-amber-50 dark:bg-gray-700 px-3 py-2 rounded-lg"
                  >
                    <span className="text-sm text-gray-900 dark:text-white">{itemId}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(itemId)}
                      className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 text-gray-400 dark:text-gray-500" size={18} />
                <input
                  ref={searchInputRef}
                  id="itemSearch"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => setShowSearchDropdown(true)}
                  placeholder="Search your purchases..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 dark:bg-gray-700 dark:text-white"
                />
              </div>

              {/* Search dropdown */}
              {showSearchDropdown && searchQuery && (
                <div
                  ref={searchDropdownRef}
                  className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto"
                >
                  {searchLoading ? (
                    <div className="px-4 py-3 text-center text-sm text-gray-500 dark:text-gray-400">
                      Searching...
                    </div>
                  ) : searchResults.length > 0 ? (
                    <ul>
                      {searchResults.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => handleAddItem(item)}
                            disabled={linkedItemIds.includes(item.id)}
                            className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                          >
                            {linkedItemIds.includes(item.id) ? (
                              <span className="text-xs text-green-600 dark:text-green-400 font-medium">✓ Added</span>
                            ) : null}
                            <span className="text-sm text-gray-900 dark:text-white truncate">{item.title}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="px-4 py-3 text-center text-sm text-gray-500 dark:text-gray-400">
                      No items found in your purchases
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Submit */}
          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={isSubmitting || !photoUrl}
              className="flex-1 px-6 py-3 bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Posting...' : 'Post Haul'}
            </button>
            <Link
              href="/shopper/haul-posts"
              className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white font-medium rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-center"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </>
  );
}

export default CreateHaulPostPage;
