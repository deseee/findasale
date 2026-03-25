/**
 * Hunt Pass Feature #29: Loot Legend Portfolio
 * Pages: /shopper/loot-legend
 * - Display LEGENDARY and EPIC items purchased by user
 * - Photo grid with rarity badges
 * - Hunt Pass gate: upgrade CTA if not active
 */

import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useAuth } from '@/components/AuthContext';
import { useToast } from '@/components/ToastContext';
import api from '@/lib/api';

interface LootItem {
  id: string;
  itemId: string;
  purchasedAt: string;
  item: {
    id: string;
    title: string;
    photoUrls: string[];
    rarity: string;
    sale: {
      id: string;
      title: string;
    };
  };
}

function LootLegendPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState<LootItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || authLoading || !user) return;

    const fetchLootLegend = async () => {
      try {
        setLoading(true);
        const response = await api.get('/loyalty/loot-legend');
        const data = response.data;
        setItems(data);
        setError(null);
      } catch (err) {
        console.error('Error fetching loot legend:', err);
        setError('Unable to load your legendary collection');
        showToast('Error loading collection', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchLootLegend();
  }, [mounted, authLoading, user, router, showToast]);

  // Redirect if not authenticated
  if (mounted && !authLoading && !user) {
    router.push('/login');
    return null;
  }

  if (!mounted || authLoading || loading) {
    return (
      <div className="max-w-7xl mx-auto py-8 px-4">
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400">Loading your legendary collection...</p>
        </div>
      </div>
    );
  }

  // Check Hunt Pass status
  const hasHuntPass = user?.huntPassActive && user?.huntPassExpiry && new Date(user.huntPassExpiry) > new Date();

  return (
    <>
      <Head>
        <title>Loot Legend - FindA.Sale</title>
        <meta name="description" content="Your legendary and epic item collection" />
      </Head>

      <div className="max-w-7xl mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">Loot Legend</h1>
          <p className="text-gray-600 dark:text-gray-400">Your collection of legendary and epic finds</p>
        </div>

        {!hasHuntPass && (
          <div className="mb-8 bg-amber-50 border border-amber-200 rounded-lg p-6 dark:bg-amber-900 dark:border-amber-700">
            <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-100 mb-2">Unlock Early Access</h3>
            <p className="text-amber-800 dark:text-amber-200 mb-4">Upgrade to Hunt Pass to get exclusive early access to legendary items and 1.5x XP rewards.</p>
            <Link
              href="/shopper/hunt-pass"
              className="inline-block px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors"
            >
              Upgrade to Hunt Pass
            </Link>
          </div>
        )}

        {error && (
          <div className="mb-8 bg-red-50 border border-red-200 rounded-lg p-6 dark:bg-red-900 dark:border-red-700">
            <p className="text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {items.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-600 dark:text-gray-400 mb-4">You haven't collected any legendary or epic items yet.</p>
            <Link
              href="/sales"
              className="inline-block px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              Start Hunting
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {items.map((purchase) => (
              <div key={purchase.id} className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-md hover:shadow-lg transition-shadow">
                {/* Item Image */}
                <div className="relative w-full aspect-square bg-gray-100 dark:bg-gray-700 overflow-hidden">
                  {purchase.item.photoUrls && purchase.item.photoUrls[0] && (
                    <img
                      src={purchase.item.photoUrls[0]}
                      alt={purchase.item.title}
                      className="w-full h-full object-cover"
                    />
                  )}
                  {/* Rarity Badge */}
                  <div className="absolute top-2 right-2">
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-sm font-bold text-white ${
                        purchase.item.rarity === 'LEGENDARY'
                          ? 'bg-yellow-500'
                          : purchase.item.rarity === 'EPIC'
                            ? 'bg-purple-500'
                            : 'bg-blue-500'
                      }`}
                    >
                      {purchase.item.rarity}
                    </span>
                  </div>
                </div>

                {/* Item Info */}
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2 line-clamp-2">
                    {purchase.item.title}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-1">
                    {purchase.item.sale.title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500">
                    {new Date(purchase.purchasedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Back to Loyalty */}
        <div className="mt-12 text-center">
          <Link
            href="/shopper/loyalty"
            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
          >
            ← Back to Loyalty Passport
          </Link>
        </div>
      </div>
    </>
  );
}

export default LootLegendPage;
