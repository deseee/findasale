import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useAuth } from '@/components/AuthContext';
import { useToast } from '@/components/ToastContext';
import { useFeedbackSurvey } from '@/hooks/useFeedbackSurvey';
import { useCreateHaulPost } from '@/hooks/useHaulPosts';

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

  useEffect(() => {
    setMounted(true);
  }, []);

  // Redirect if not authenticated
  if (mounted && !authLoading && !user) {
    router.push('/login');
    return null;
  }

  const handleAddItem = (itemId: string) => {
    if (itemId && !linkedItemIds.includes(itemId)) {
      setLinkedItemIds([...linkedItemIds, itemId]);
    }
  };

  const handleRemoveItem = (itemId: string) => {
    setLinkedItemIds(linkedItemIds.filter((id) => id !== itemId));
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
          {/* Photo URL */}
          <div>
            <label htmlFor="photoUrl" className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Photo URL *
            </label>
            <input
              id="photoUrl"
              type="url"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              placeholder="https://example.com/photo.jpg"
              required
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 dark:bg-gray-700 dark:text-white"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Paste the URL of your haul photo
            </p>

            {/* Photo preview */}
            {photoUrl && (
              <div className="mt-4">
                <img
                  src={photoUrl}
                  alt="Preview"
                  className="w-full max-h-96 object-cover rounded-lg"
                  onError={() => {
                    showToast('Could not load image preview', 'error');
                  }}
                />
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
            <label htmlFor="itemId" className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Link Items from Your Purchases (Optional)
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Tag items you found to connect your haul to specific listings
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
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Item ID (e.g., item-123)"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const input = e.currentTarget as HTMLInputElement;
                    handleAddItem(input.value.trim());
                    input.value = '';
                  }
                }}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 dark:bg-gray-700 dark:text-white"
              />
              <button
                type="button"
                onClick={(e) => {
                  const input = (e.currentTarget.previousElementSibling as HTMLInputElement);
                  if (input.value.trim()) {
                    handleAddItem(input.value.trim());
                    input.value = '';
                  }
                }}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 font-medium transition-colors"
              >
                Add
              </button>
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
