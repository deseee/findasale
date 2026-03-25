/**
 * Shopper Haul Gallery — Feature #88: Haul Posts
 * Public haul gallery with trending haul posts from shoppers.
 * Authenticated users can create and like haul posts.
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useAuth } from '../../components/AuthContext';
import HaulPostCard from '../../components/HaulPostCard';
import { useHaulPosts, HaulPost } from '../../hooks/useHaulPosts';
import Skeleton from '../../components/Skeleton';
import EmptyState from '../../components/EmptyState';

const HaulsPage: React.FC = () => {
  const router = useRouter();
  const { user } = useAuth();
  const { hauls, isLoading, error, createHaulPost, toggleLike } = useHaulPosts();

  const [photoUrl, setPhotoUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [likedPostIds, setLikedPostIds] = useState<Set<number>>(new Set());
  const [loadingLikeId, setLoadingLikeId] = useState<number | null>(null);

  const handlePost = async () => {
    if (!photoUrl.trim()) return;

    setIsPosting(true);
    setPostError(null);
    try {
      await createHaulPost({
        photoUrl: photoUrl.trim(),
        caption: caption.trim() || undefined,
      });
      setPhotoUrl('');
      setCaption('');
    } catch (err: any) {
      setPostError(err.message || 'Failed to post');
    } finally {
      setIsPosting(false);
    }
  };

  const handleToggleLike = async (haulId: number) => {
    if (!user) {
      router.push('/login?redirect=/shopper/hauls');
      return;
    }

    setLoadingLikeId(haulId);
    try {
      const isLiked = likedPostIds.has(haulId);
      await toggleLike(haulId, isLiked);

      // Update local liked state
      const newLiked = new Set(likedPostIds);
      if (isLiked) {
        newLiked.delete(haulId);
      } else {
        newLiked.add(haulId);
      }
      setLikedPostIds(newLiked);
    } catch (err: any) {
      console.error('Error toggling like:', err);
    } finally {
      setLoadingLikeId(null);
    }
  };

  return (
    <>
      <Head>
        <title>Haul Gallery - FindA.Sale</title>
        <meta name="description" content="Browse and share haul posts from FindA.Sale shoppers" />
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-2">Haul Gallery</h1>
            <p className="text-warm-600 dark:text-warm-400">Share your estate sale finds and see what others are hunting</p>
          </div>

          {/* Post form (only for authenticated users) */}
          {user && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 mb-8 border border-warm-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-4">Share Your Haul</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-1">
                    Photo URL
                  </label>
                  <input
                    type="url"
                    value={photoUrl}
                    onChange={(e) => setPhotoUrl(e.target.value)}
                    placeholder="https://example.com/photo.jpg"
                    className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 placeholder-warm-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-1">
                    Caption (optional)
                  </label>
                  <textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Tell us about your finds..."
                    rows={3}
                    className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 placeholder-warm-400 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                  />
                </div>

                {postError && (
                  <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded">
                    {postError}
                  </p>
                )}

                <button
                  onClick={handlePost}
                  disabled={isPosting || !photoUrl.trim()}
                  className="w-full px-6 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                >
                  {isPosting ? 'Posting...' : 'Post Haul'}
                </button>
              </div>
            </div>
          )}

          {/* Error state */}
          {error && !isLoading && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-8 text-red-700 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Feed */}
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-64 rounded-xl" />
              ))}
            </div>
          ) : hauls.length === 0 ? (
            <EmptyState
              icon="📸"
              heading="No hauls shared yet"
              subtext={user ? "Be the first to share your finds! Post a photo and tell the story of your amazing sale discoveries." : "Create an account to share your hauls and show off what you found."}
              cta={!user ? { label: 'Sign In to Share', href: '/login?redirect=/shopper/hauls' } : undefined}
            />
          ) : (
            <div className="space-y-4">
              {hauls.map((haul) => (
                <HaulPostCard
                  key={haul.id}
                  haul={haul}
                  onLike={() => handleToggleLike(haul.id)}
                  isLiked={likedPostIds.has(haul.id)}
                  isLoadingLike={loadingLikeId === haul.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default HaulsPage;
