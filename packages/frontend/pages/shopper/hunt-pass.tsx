/**
 * /shopper/hunt-pass - Hunt Pass Information & Upgrade Page
 *
 * Hunt Pass is a $4.99/month premium shopper subscription that grants:
 * - 1.5x XP on every action
 * - Early access to flash deals
 * - Exclusive Hunt Pass badge
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Head from 'next/head';
import { useAuth } from '../../components/AuthContext';
import HuntPassModal from '../../components/HuntPassModal';

const HuntPassPage = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [showModal, setShowModal] = useState(false);

  const huntPassPrice = 4.99;

  // Check if user has active Hunt Pass
  const hasActiveHuntPass = user?.huntPassActive && user?.huntPassExpiry && new Date(user.huntPassExpiry) > new Date();

  const handleSubscribeClick = () => {
    if (!user) {
      router.push('/login?redirect=/shopper/hunt-pass');
      return;
    }
    setShowModal(true);
  };

  return (
    <>
      <Head>
        <title>Hunt Pass - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-2xl mx-auto px-4 py-12">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="text-6xl mb-4">👑</div>
            <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-2">
              Hunt Pass
            </h1>
            <p className="text-lg text-warm-600 dark:text-warm-400">
              Unlock premium shopper features and earn rewards faster
            </p>
          </div>

          {/* Price Card */}
          {hasActiveHuntPass ? (
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg shadow-md p-8 mb-12 border-2 border-green-200 dark:border-green-700">
              <div className="text-center mb-8">
                <div className="text-5xl mb-4">✓</div>
                <h2 className="text-3xl font-bold text-green-700 dark:text-green-300 mb-2">Hunt Pass Active</h2>
                <p className="text-green-600 dark:text-green-400">You're earning 1.5x XP on every action</p>
              </div>
              <Link
                href="/shopper/dashboard"
                className="w-full block text-center py-3 px-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-colors"
              >
                Back to Dashboard
              </Link>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-12 border-2 border-purple-200 dark:border-purple-700">
              <div className="text-center mb-8">
                <div className="text-5xl font-bold text-purple-600 dark:text-purple-300 mb-2">
                  ${huntPassPrice.toFixed(2)}
                </div>
                <p className="text-warm-600 dark:text-warm-400">per month</p>
                <p className="text-sm text-warm-500 dark:text-warm-400 mt-2">
                  Cancel anytime. Charged monthly to your payment method.
                </p>
              </div>

              <button
                onClick={handleSubscribeClick}
                className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition-colors"
              >
                Upgrade to Hunt Pass
              </button>
            </div>
          )}

          {/* Benefits Section */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-6">
              What's Included
            </h2>

            <div className="space-y-4">
              {/* Benefit 1: 1.5x XP */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-warm-200 dark:border-gray-700">
                <div className="flex items-start gap-4">
                  <div className="text-3xl flex-shrink-0">⭐</div>
                  <div>
                    <h3 className="font-semibold text-warm-900 dark:text-warm-100 mb-2">
                      1.5x XP on Everything
                    </h3>
                    <p className="text-warm-600 dark:text-warm-400">
                      Earn 1.5x XP on every action — visits, purchases, treasure hunts, and more. Build your ranks faster and unlock rewards sooner.
                    </p>
                  </div>
                </div>
              </div>

              {/* Benefit 2: Early Access to Rare Items */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-warm-200 dark:border-gray-700">
                <div className="flex items-start gap-4">
                  <div className="text-3xl flex-shrink-0">💎</div>
                  <div>
                    <h3 className="font-semibold text-warm-900 dark:text-warm-100 mb-2">
                      Rare Finds Pass
                    </h3>
                    <p className="text-warm-600 dark:text-warm-400">
                      Get exclusive early access to Rarity items (Rare, Ultra-Rare, and Legendary) with a dedicated feed for Hunt Pass subscribers. See the best treasures first, so you never miss out on amazing finds.
                    </p>
                  </div>
                </div>
              </div>

              {/* Benefit 2b: Treasure Hunt Pro */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-warm-200 dark:border-gray-700">
                <div className="flex items-start gap-4">
                  <div className="text-3xl flex-shrink-0">🎯</div>
                  <div>
                    <h3 className="font-semibold text-warm-900 dark:text-warm-100 mb-2">
                      Treasure Hunt Pro
                    </h3>
                    <p className="text-warm-600 dark:text-warm-400">
                      Increase your daily item scan limit from 100 to 150 scans per day. More scans, more finds — unlock premium hunting capacity.
                    </p>
                    <p className="text-warm-600 dark:text-warm-400 mt-2">
                      +10% XP bonus on every QR scan, stacked on top of your rank multiplier.
                    </p>
                  </div>
                </div>
              </div>

              {/* Benefit 3a: Golden Trophy Avatar Frame */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-warm-200 dark:border-gray-700">
                <div className="flex items-start gap-4">
                  <div className="text-3xl flex-shrink-0">🏆</div>
                  <div>
                    <h3 className="font-semibold text-warm-900 dark:text-warm-100 mb-2">
                      Golden Trophy Avatar Frame
                    </h3>
                    <p className="text-warm-600 dark:text-warm-400">
                      Amber trophy ring on your profile photo — visible on your nav avatar and dropdown. A subtle status marker that shows at a glance you're a Hunt Pass subscriber.
                    </p>
                  </div>
                </div>
              </div>

              {/* Benefit 3b: Hunt Pass Leaderboard Badge */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-warm-200 dark:border-gray-700">
                <div className="flex items-start gap-4">
                  <div className="text-3xl flex-shrink-0">🏅</div>
                  <div>
                    <h3 className="font-semibold text-warm-900 dark:text-warm-100 mb-2">
                      Hunt Pass Leaderboard Badge
                    </h3>
                    <p className="text-warm-600 dark:text-warm-400">
                      A 🏆 badge next to your name on the Explorer's Guild leaderboard. Stand out among top collectors.
                    </p>
                  </div>
                </div>
              </div>

              {/* Benefit 4: Coupon Slots */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-warm-200 dark:border-gray-700">
                <div className="flex items-start gap-4">
                  <div className="text-3xl flex-shrink-0">🎟️</div>
                  <div>
                    <h3 className="font-semibold text-warm-900 dark:text-warm-100 mb-2">
                      More Monthly Coupon Slots
                    </h3>
                    <p className="text-warm-600 dark:text-warm-400">
                      More monthly coupon redemptions — 3 Standard, 3 Deluxe, and 2 Premium per month (vs 2/2/1 for free accounts).
                    </p>
                    <p className="text-xs text-warm-500 dark:text-warm-400 mt-2">
                      Standard: 2→3/mo | Deluxe: 2→3/mo | Premium: 1→2/mo
                    </p>
                  </div>
                </div>
              </div>

              {/* Benefit 5: Insider Newsletter */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-warm-200 dark:border-gray-700">
                <div className="flex items-start gap-4">
                  <div className="text-3xl flex-shrink-0">📧</div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-warm-900 dark:text-warm-100">
                        Hunt Pass Insider Newsletter
                      </h3>
                      <span className="inline-block px-2 py-1 text-xs font-medium rounded text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900">
                        Coming Soon
                      </span>
                    </div>
                    <p className="text-warm-600 dark:text-warm-400">
                      Get exclusive tips, early sale previews, and featured finds delivered to your inbox. Stay ahead of the hunt with insider knowledge.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Explorer's Guild Cross-Link */}
          <div className="mb-12 bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-6">
            <p className="text-warm-900 dark:text-warm-100">
              Want to understand ranks, earning paths, and seasonal adventures?{' '}
              <Link href="/shopper/guild-primer" className="font-semibold text-sage-700 dark:text-sage-300 hover:text-sage-800 dark:hover:text-sage-200 underline">
                Learn how the Explorer's Guild works →
              </Link>
            </p>
          </div>

          {/* Bottom CTA */}
          {!hasActiveHuntPass && (
            <div className="text-center">
              <p className="text-warm-600 dark:text-warm-400 mb-4">
                Ready to hunt smarter?
              </p>
              <button
                onClick={handleSubscribeClick}
                className="py-3 px-8 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition-colors text-lg"
              >
                Upgrade to Hunt Pass
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Hunt Pass Payment Modal */}
      <HuntPassModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => {
          setShowModal(false);
          router.push('/shopper/dashboard#overview');
        }}
      />
    </>
  );
};

export default HuntPassPage;
