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

              {/* Benefit 2: Early Access */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-warm-200 dark:border-gray-700">
                <div className="flex items-start gap-4">
                  <div className="text-3xl flex-shrink-0">⚡</div>
                  <div>
                    <h3 className="font-semibold text-warm-900 dark:text-warm-100 mb-2">
                      6-Hour Early Access to Flash Deals
                    </h3>
                    <p className="text-warm-600 dark:text-warm-400">
                      Get notified 6 hours before other shoppers when flash deals go live. See the best treasures first, so you never miss out on amazing finds.
                    </p>
                  </div>
                </div>
              </div>

              {/* Benefit 3: Exclusive Badge */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-warm-200 dark:border-gray-700">
                <div className="flex items-start gap-4">
                  <div className="text-3xl flex-shrink-0">🎖️</div>
                  <div>
                    <h3 className="font-semibold text-warm-900 dark:text-warm-100 mb-2">
                      Exclusive Hunt Pass Badge
                    </h3>
                    <p className="text-warm-600 dark:text-warm-400">
                      Show off your premium status with an exclusive badge on your profile. Let other shoppers know you're a serious collector and treasure hunter.
                    </p>
                  </div>
                </div>
              </div>

              {/* Benefit 4: Insider Newsletter */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-warm-200 dark:border-gray-700">
                <div className="flex items-start gap-4">
                  <div className="text-3xl flex-shrink-0">📧</div>
                  <div>
                    <h3 className="font-semibold text-warm-900 dark:text-warm-100 mb-2">
                      Hunt Pass Insider Newsletter
                    </h3>
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
