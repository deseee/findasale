import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from './ToastContext';

interface WishlistShareButtonProps {
  wishlistId: string;
  isPublic: boolean;
  shareSlug?: string;
}

const WishlistShareButton: React.FC<WishlistShareButtonProps> = ({
  wishlistId,
  isPublic,
  shareSlug,
}) => {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [showShare, setShowShare] = useState(false);

  const shareUrl = shareSlug
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/wishlists/share/${shareSlug}`
    : null;

  // Mutation to generate share link
  const generateShareMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/wishlists/${wishlistId}/share`, {});
      return response.data;
    },
    onSuccess: (data) => {
      showToast('Share link copied to clipboard!', 'success');
      navigator.clipboard.writeText(data.shareUrl);
      queryClient.invalidateQueries({ queryKey: ['wishlists'] });
      setShowShare(false);
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to generate share link', 'error');
    },
  });

  // Mutation to toggle visibility
  const toggleVisibilityMutation = useMutation({
    mutationFn: async (newIsPublic: boolean) => {
      const response = await api.patch(`/wishlists/${wishlistId}/visibility`, {
        isPublic: newIsPublic,
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['wishlists'] });
      if (data.isPublic) {
        showToast('Wishlist is now public', 'success');
        setShowShare(true);
      } else {
        showToast('Wishlist is now private', 'success');
        setShowShare(false);
      }
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to update visibility', 'error');
    },
  });

  const handleCopyLink = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      showToast('Share link copied!', 'success');
    }
  };

  if (!isPublic) {
    return (
      <button
        onClick={() => toggleVisibilityMutation.mutate(true)}
        disabled={toggleVisibilityMutation.isPending}
        className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg text-sm transition-colors disabled:opacity-50"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.684 13.342C9.839 14.55 11.799 15.5 14 15.5c4.418 0 8-3.134 8-7s-3.582-7-8-7c-2.201 0-4.161.894-5.316 2.158M9 19H5a2 2 0 01-2-2v-1m4-4h.01M15 20h4a2 2 0 002-2v-1m-4-4h.01"
          />
        </svg>
        {toggleVisibilityMutation.isPending ? 'Making Public...' : 'Share Wishlist'}
      </button>
    );
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setShowShare(!showShare)}
        className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg text-sm transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.7-2.34-1.45 0-.7.49-1.08 1.38-1.08.9 0 1.94.5 2.4 1.1l1.46-1.06c-.88-1.3-2.37-2.03-3.86-2.03-2.31 0-3.88 1.52-3.88 3.5 0 1.49.7 2.58 2.54 3.09 1.77.45 2.34.7 2.34 1.45 0 .89-.58 1.24-1.63 1.24-1.31 0-2.48-.61-3.06-1.56l-1.44 1.13c.86 1.41 2.26 2.26 4.5 2.26 2.35 0 3.94-1.5 3.94-3.57 0-1.7-.88-2.64-2.89-3.2z" />
        </svg>
        Sharing
      </button>

      {showShare && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg p-4 z-50 border border-warm-200">
          <div className="space-y-3">
            <p className="text-sm text-warm-700 font-medium">Share this wishlist</p>

            {shareUrl && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={shareUrl}
                  readOnly
                  className="flex-1 px-3 py-2 bg-warm-50 border border-warm-200 rounded text-sm text-warm-600"
                />
                <button
                  onClick={handleCopyLink}
                  className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-2 rounded font-medium text-sm transition-colors"
                >
                  Copy
                </button>
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t border-warm-200">
              <button
                onClick={() => toggleVisibilityMutation.mutate(false)}
                disabled={toggleVisibilityMutation.isPending}
                className="flex-1 text-sm px-3 py-2 text-red-600 hover:text-red-700 font-medium transition-colors disabled:opacity-50"
              >
                {toggleVisibilityMutation.isPending ? 'Making Private...' : 'Make Private'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WishlistShareButton;
