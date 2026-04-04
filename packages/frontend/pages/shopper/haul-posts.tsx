import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { useAuth } from '@/components/AuthContext';
import { useToast } from '@/components/ToastContext';
import { useHaulPosts, useAddHaulReaction, useRemoveHaulReaction } from '@/hooks/useHaulPosts';

interface HaulPostWithReaction {
  id: number;
  userId: string;
  user: { id: string; name: string };
  photoUrl: string;
  caption?: string;
  linkedItemIds: string[];
  likesCount: number;
  isHaulPost: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  userHasReacted?: boolean;
}

function HaulPostsFeedPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [allPosts, setAllPosts] = useState<HaulPostWithReaction[]>([]);
  const [mounted, setMounted] = useState(false);
  const [userReactions, setUserReactions] = useState<Set<number>>(new Set());

  const { data: posts = [], isLoading, error } = useHaulPosts(page, 20);
  const addReaction = useAddHaulReaction();
  const removeReaction = useRemoveHaulReaction();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Update posts when new data comes in
  useEffect(() => {
    if (posts && posts.length > 0) {
      const postsWithReactions: HaulPostWithReaction[] = posts.map((post) => ({
        ...post,
        userHasReacted: userReactions.has(post.id),
      }));
      setAllPosts(postsWithReactions);
    }
  }, [posts, userReactions]);

  const handleLike = async (photoId: number, hasReacted: boolean) => {
    if (!user) {
      router.push('/login');
      return;
    }

    try {
      if (hasReacted) {
        await removeReaction.mutateAsync(photoId);
        setUserReactions((prev) => {
          const newSet = new Set(prev);
          newSet.delete(photoId);
          return newSet;
        });
      } else {
        await addReaction.mutateAsync(photoId);
        setUserReactions((prev) => new Set(prev).add(photoId));
      }
    } catch (err) {
      console.error('Error updating reaction:', err);
      showToast('Failed to update reaction', 'error');
    }
  };

  // Redirect if not authenticated
  if (mounted && !authLoading && !user) {
    router.push('/login');
    return null;
  }

  if (!mounted || authLoading || isLoading) {
    return (
      <div className="max-w-6xl mx-auto py-8 px-4">
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400">Loading hauls...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto py-8 px-4">
        <div className="text-center py-12">
          <p className="text-red-600 dark:text-red-400">Failed to load haul posts</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Haul Posts - Community Finds | FindA.Sale</title>
        <meta name="description" content="Share and discover haul posts from the FindA.Sale community" />
      </Head>

      <div className="max-w-6xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">Community Hauls</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">Share your finds and discover what other collectors are hunting</p>
          <Link
            href="/shopper/haul-posts/create"
            className="inline-block px-6 py-3 bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700 text-white font-medium rounded-lg transition-colors"
          >
            Share Your Haul
          </Link>
        </div>

        {/* Empty state */}
        {allPosts.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">📸</div>
            <p className="text-gray-600 dark:text-gray-400 text-lg">No hauls yet — be the first to share!</p>
            <Link
              href="/shopper/haul-posts/create"
              className="inline-block mt-4 px-6 py-2 bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700 text-white font-medium rounded-lg transition-colors"
            >
              Create Your First Haul
            </Link>
          </div>
        )}

        {/* Grid of haul posts */}
        {allPosts.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {allPosts.map((post) => {
              const hasReacted = userReactions.has(post.id);
              return (
                <div
                  key={post.id}
                  className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-md hover:shadow-lg dark:shadow-gray-900/50 transition-shadow"
                >
                  {/* Photo */}
                  <div className="relative aspect-square bg-gray-200 dark:bg-gray-700 overflow-hidden">
                    <img
                      src={post.photoUrl}
                      alt={post.caption || 'Haul post'}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Card content */}
                  <div className="p-4">
                    {/* Poster info */}
                    <div className="mb-3">
                      <p className="font-semibold text-gray-900 dark:text-white text-sm">{post.user.name}</p>
                    </div>

                    {/* Linked items */}
                    {post.linkedItemIds.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Items tagged:</p>
                        <p className="text-xs text-gray-700 dark:text-gray-300">
                          {post.linkedItemIds.length} item{post.linkedItemIds.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    )}

                    {/* Caption */}
                    {post.caption && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
                        {post.caption}
                      </p>
                    )}

                    {/* Like button */}
                    <button
                      onClick={() => handleLike(post.id, hasReacted)}
                      disabled={addReaction.isPending || removeReaction.isPending}
                      className={`flex items-center gap-2 transition-colors ${
                        hasReacted
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400'
                      }`}
                    >
                      <Heart
                        size={18}
                        fill={hasReacted ? 'currentColor' : 'none'}
                        className="transition-colors"
                      />
                      <span className="text-sm font-medium">{post.likesCount}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination hint */}
        {allPosts.length > 0 && (
          <div className="mt-12 text-center text-gray-600 dark:text-gray-400 text-sm">
            <p>Showing {allPosts.length} hauls</p>
          </div>
        )}
      </div>
    </>
  );
}

export default HaulPostsFeedPage;
