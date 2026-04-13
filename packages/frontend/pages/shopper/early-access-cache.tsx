/**
 * /shopper/early-access-cache - Early Access Cache
 *
 * Shoppers spend 100 XP to unlock 48-hour early access windows for items
 * in chosen categories. No randomness, guaranteed access to new items.
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useAuth } from '../../components/AuthContext';
import api from '../../lib/api';

interface ActiveWindow {
  category: string;
  expiresAt: string;
  itemsCount: number;
}

interface StatusResponse {
  activeWindows: ActiveWindow[];
  weeklyCooldowns: Record<string, string>;
}

interface CategoryTile {
  id: string;
  name: string;
  icon: string;
}

const CATEGORIES: CategoryTile[] = [
  { id: 'FURNITURE', name: 'Furniture', icon: '🛋️' },
  { id: 'VINTAGE_COLLECTIBLES', name: 'Vintage & Collectibles', icon: '🏛️' },
  { id: 'ART_FRAMES', name: 'Art & Frames', icon: '🖼️' },
  { id: 'JEWELRY_WATCHES', name: 'Jewelry & Watches', icon: '✨' },
  { id: 'BOOKS_MEDIA', name: 'Books & Media', icon: '📚' },
  { id: 'KITCHENWARE', name: 'Kitchenware', icon: '🍳' },
  { id: 'FASHION', name: 'Fashion', icon: '👗' },
  { id: 'SPORTS_OUTDOOR', name: 'Sports & Outdoor', icon: '⛺' },
];

interface XpStatus {
  guildXp: number;
  explorerRank: string;
}

const EarlyAccessCachePage = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [xpStatus, setXpStatus] = useState<XpStatus | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [isLoading2, setIsLoading2] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isActivating, setIsActivating] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ category: string; show: boolean }>({
    category: '',
    show: false,
  });

  // Fetch XP status and early access status
  useEffect(() => {
    if (!user) return;

    const fetchStatus = async () => {
      try {
        const [xpRes, earlyAccessRes] = await Promise.all([
          api.get('/users/xp-status'),
          api.get('/early-access-cache/status'),
        ]);

        setXpStatus(xpRes.data);
        setStatus(earlyAccessRes.data);
        setIsLoading2(false);
      } catch (err) {
        console.error('Failed to fetch status:', err);
        setError('Failed to load early access data. Please refresh the page.');
        setIsLoading2(false);
      }
    };

    fetchStatus();
  }, [user]);

  const getCategoryStatus = (categoryId: string) => {
    const active = status?.activeWindows.find((w) => w.category === categoryId);
    if (active) {
      return { status: 'active', expiresAt: new Date(active.expiresAt) };
    }

    const cooldownDate = status?.weeklyCooldowns[categoryId];
    if (cooldownDate) {
      return { status: 'cooldown', nextAvailable: new Date(cooldownDate) };
    }

    return { status: 'available' };
  };

  const handleActivate = async (category: string) => {
    if (!user || !xpStatus) {
      setError('Session error. Please refresh and try again.');
      return;
    }

    if (xpStatus.guildXp < 100) {
      setError('You do not have enough XP to activate early access.');
      return;
    }

    setIsActivating(true);
    setError(null);

    try {
      const { data } = await api.post('/early-access-cache/activate', {
        category,
      });

      // Refresh status
      const refreshed = await api.get('/early-access-cache/status');
      setStatus(refreshed.data);

      // Update XP status
      setXpStatus((prev) =>
        prev
          ? {
              ...prev,
              guildXp: data.newXpBalance,
            }
          : null
      );

      setConfirmDialog({ category: '', show: false });
    } catch (err: any) {
      setError(err.message || 'Failed to activate early access');
    } finally {
      setIsActivating(false);
    }
  };

  const formatTimeRemaining = (expiresAt: Date) => {
    const now = new Date();
    const diff = expiresAt.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m remaining`;
    }
    return `${minutes}m remaining`;
  };

  const formatNextAvailable = (nextDate: Date) => {
    const days = Math.ceil((nextDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    return `Available in ${days} day${days !== 1 ? 's' : ''}`;
  };

  if (isLoading || isLoading2) {
    return (
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-warm-600 dark:text-warm-400">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex items-center justify-center">
        <button
          onClick={() => router.push('/login?redirect=/shopper/early-access-cache')}
          className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
        >
          Sign in to explore
        </button>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Early Access Cache - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 py-12">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="text-6xl mb-4 inline-block">🔑</div>
            <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-2">
              Early Access Cache
            </h1>
            <p className="text-lg text-warm-600 dark:text-warm-400">
              Get exclusive first look at new items in your favorite categories
            </p>
          </div>

          {/* XP Status Card */}
          {xpStatus && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-8 border-2 border-purple-200 dark:border-purple-700">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-warm-600 dark:text-warm-400">Your XP Balance</p>
                  <p className="text-3xl font-bold text-purple-600 dark:text-purple-300">
                    {xpStatus.guildXp}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-warm-600 dark:text-warm-400">Cost per Activation</p>
                  <p className="text-3xl font-bold text-purple-600 dark:text-purple-300">100 XP</p>
                </div>
              </div>

              {xpStatus.guildXp < 100 && (
                <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
                  <p className="text-sm font-semibold text-red-900 dark:text-red-200">
                    Not enough XP
                  </p>
                  <p className="text-xs text-red-700 dark:text-red-300">
                    You need 100 XP. You have {xpStatus.guildXp}.
                  </p>
                </div>
              )}

              {error && (
                <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Active Windows Section */}
          {status && status.activeWindows.length > 0 && (
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-4">
                Active Windows
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {status.activeWindows.map((window) => {
                  const category = CATEGORIES.find((c) => c.id === window.category);
                  return (
                    <div
                      key={window.category}
                      className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 border-2 border-green-200 dark:border-green-700"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-lg font-bold text-warm-900 dark:text-warm-100">
                            {category?.name}
                          </p>
                          <p className="text-sm text-warm-600 dark:text-warm-400">
                            {formatTimeRemaining(new Date(window.expiresAt))}
                          </p>
                        </div>
                        <div className="text-2xl">{category?.icon}</div>
                      </div>
                      <button
                        onClick={() => router.push('/shopper/early-access-cache/items')}
                        className="w-full mt-3 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold text-sm"
                      >
                        EXPLORE
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Category Grid */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-4">
              Categories
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {CATEGORIES.map((category) => {
                const categoryStatus = getCategoryStatus(category.id);
                let bgColor = 'bg-white dark:bg-gray-800 hover:bg-warm-50 dark:hover:bg-gray-700 cursor-pointer';
                let borderColor = 'border-warm-200 dark:border-gray-700';
                let textColor = 'text-warm-900 dark:text-warm-100';
                let buttonText = 'Available';

                if (categoryStatus.status === 'active') {
                  bgColor = 'bg-green-50 dark:bg-green-900/20';
                  borderColor = 'border-green-200 dark:border-green-700';
                  buttonText = '✓ Active';
                } else if (categoryStatus.status === 'cooldown') {
                  bgColor = 'bg-gray-50 dark:bg-gray-700 opacity-60 cursor-not-allowed';
                  borderColor = 'border-gray-200 dark:border-gray-600';
                  textColor = 'text-gray-600 dark:text-gray-400';
                  buttonText = formatNextAvailable(categoryStatus.nextAvailable!);
                }

                return (
                  <button
                    key={category.id}
                    onClick={() => {
                      if (categoryStatus.status === 'available') {
                        setConfirmDialog({ category: category.id, show: true });
                      }
                    }}
                    disabled={categoryStatus.status !== 'available'}
                    className={`${bgColor} border-2 ${borderColor} rounded-lg p-4 text-center transition-all ${
                      categoryStatus.status === 'available' ? 'hover:shadow-md' : ''
                    }`}
                  >
                    <div className="text-3xl mb-2">{category.icon}</div>
                    <p className={`font-semibold text-sm ${textColor} mb-2`}>{category.name}</p>
                    <p className={`text-xs font-bold ${categoryStatus.status === 'active' ? 'text-green-600 dark:text-green-300' : categoryStatus.status === 'cooldown' ? 'text-gray-500 dark:text-gray-400' : 'text-purple-600 dark:text-purple-300'}`}>
                      {buttonText}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* How It Works */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-warm-200 dark:border-gray-700">
            <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">
              How It Works
            </h2>
            <div className="space-y-3 text-sm text-warm-600 dark:text-warm-400">
              <div className="flex gap-3">
                <span className="text-lg font-bold text-purple-600 dark:text-purple-300 flex-shrink-0">
                  1
                </span>
                <div>
                  <p className="font-semibold text-warm-900 dark:text-warm-100">Choose a Category</p>
                  <p>Pick any category from the grid above.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="text-lg font-bold text-purple-600 dark:text-purple-300 flex-shrink-0">
                  2
                </span>
                <div>
                  <p className="font-semibold text-warm-900 dark:text-warm-100">Spend 100 XP</p>
                  <p>Confirm your activation. No randomness, no gambling.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="text-lg font-bold text-purple-600 dark:text-purple-300 flex-shrink-0">
                  3
                </span>
                <div>
                  <p className="font-semibold text-warm-900 dark:text-warm-100">Get 48h Early Access</p>
                  <p>See all new items in that category first, before other shoppers.</p>
                </div>
              </div>
              <div className="flex gap-3 pt-3 border-t border-warm-200 dark:border-gray-700">
                <span className="text-lg">⏰</span>
                <div>
                  <p className="font-semibold text-warm-900 dark:text-warm-100">Weekly Limit</p>
                  <p>You can activate early access for each category once per week (Sunday–Saturday UTC).</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Confirmation Dialog */}
        {confirmDialog.show && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-sm w-full">
              <h3 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-2">
                Activate Early Access?
              </h3>
              <p className="text-warm-600 dark:text-warm-400 mb-4">
                Spend 100 XP to unlock 48-hour early access to{' '}
                <strong>{CATEGORIES.find((c) => c.id === confirmDialog.category)?.name}</strong>.
              </p>
              <p className="text-sm text-warm-500 dark:text-warm-400 mb-6">
                You have {xpStatus?.guildXp} XP.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDialog({ category: '', show: false })}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-warm-900 dark:text-warm-100 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 font-semibold"
                >
                  CANCEL
                </button>
                <button
                  onClick={() => handleActivate(confirmDialog.category)}
                  disabled={isActivating || !xpStatus || xpStatus.guildXp < 100}
                  className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg font-semibold"
                >
                  {isActivating ? 'Activating...' : 'SPEND 100 XP'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default EarlyAccessCachePage;
