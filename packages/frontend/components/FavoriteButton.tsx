/**
 * FavoriteButton — Reusable favorite/save toggle
 *
 * Usage:
 *   <FavoriteButton itemId={item.id} />
 *   <FavoriteButton itemId={item.id} label="Save" variant="button" />
 *
 * Behavior:
 * - Heart icon (outline when unfavorited, filled when favorited)
 * - Requires auth: redirects to /login if not logged in
 * - Optimistic UI: toggles immediately, reverts on error
 * - Toast feedback on success/error
 */

import React, { useState, useEffect } from 'react';
import { Heart } from 'lucide-react';
import { useRouter } from 'next/router';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import api from '../lib/api';

interface FavoriteButtonProps {
  itemId: string;
  saleId?: string; // Optional: for recording SAVE ripples
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'icon' | 'button';
}

const FavoriteButton: React.FC<FavoriteButtonProps> = ({
  itemId,
  saleId,
  label = 'Save',
  size = 'md',
  variant = 'icon',
}) => {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [isFavorited, setIsFavorited] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Fetch initial favorite status on mount
  useEffect(() => {
    if (!user || !itemId) {
      setIsInitialized(true);
      return;
    }

    const fetchStatus = async () => {
      try {
        const res = await api.get(`/favorites/item/${itemId}`);
        setIsFavorited(res.data.isFavorited);
      } catch (err) {
        console.error('Failed to fetch favorite status:', err);
      } finally {
        setIsInitialized(true);
      }
    };

    fetchStatus();
  }, [user, itemId]);

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Auth gate: redirect to login if not authenticated
    if (!user) {
      router.push(`/login?redirect=${encodeURIComponent(router.asPath)}`);
      return;
    }

    setIsLoading(true);
    const previousState = isFavorited;
    const wasToastShown = false;

    try {
      // Optimistic UI update
      setIsFavorited(!isFavorited);

      // Toggle favorite
      const res = await api.post(`/favorites/item/${itemId}`, {});

      // Verify status from response
      if (res.data.isFavorited !== undefined) {
        setIsFavorited(res.data.isFavorited);
      }

      // Show success toast
      const message = res.data.isFavorited ? '❤️ Saved!' : '✓ Removed from saves';
      showToast(message, 'success');

      // Record SAVE ripple if item was favorited (only fire on add, not remove)
      if (res.data.isFavorited && saleId) {
        api.post(`/sales/${saleId}/ripples`, { type: 'SAVE' }).catch(() => { /* fire-and-forget */ });
      }
    } catch (err) {
      // Revert optimistic update on error
      setIsFavorited(previousState);
      console.error('Failed to toggle favorite:', err);
      showToast('Failed to update save', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Size classes
  const sizeClasses = {
    sm: { icon: 'w-5 h-5', button: 'text-sm px-2 py-1' },
    md: { icon: 'w-6 h-6', button: 'text-base px-3 py-1.5' },
    lg: { icon: 'w-8 h-8', button: 'text-lg px-4 py-2' },
  };

  // Don't render anything until we know initial state
  if (!isInitialized && user) {
    return null;
  }

  if (variant === 'icon') {
    return (
      <button
        onClick={handleToggle}
        disabled={isLoading}
        className="flex items-center justify-center rounded-full hover:bg-white/20 dark:hover:bg-gray-700/50 transition-colors disabled:opacity-50"
        aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
        title={user ? (isFavorited ? 'Remove from saves' : 'Add to saves') : 'Sign in to save'}
      >
        <Heart
          className={`${sizeClasses[size].icon} transition-all`}
          fill={isFavorited ? 'currentColor' : 'none'}
          stroke={isFavorited ? 'rgb(239, 68, 68)' : 'currentColor'}
          strokeWidth={isFavorited ? 0 : 2}
        />
      </button>
    );
  }

  // Button variant
  return (
    <button
      onClick={handleToggle}
      disabled={isLoading}
      className={`flex items-center gap-2 rounded-lg border border-current px-3 py-1.5 font-medium transition-colors disabled:opacity-50 ${
        isFavorited
          ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
          : 'bg-transparent text-gray-700 border-gray-300 hover:border-red-400 hover:text-red-600 dark:text-gray-300 dark:border-gray-600 dark:hover:border-red-600 dark:hover:text-red-400'
      }`}
      title={user ? undefined : 'Sign in to save'}
    >
      <Heart
        className="w-5 h-5 transition-all"
        fill={isFavorited ? 'currentColor' : 'none'}
        strokeWidth={isFavorited ? 0 : 2}
      />
      <span>{isFavorited ? 'Saved' : label}</span>
    </button>
  );
};

export default FavoriteButton;
