/**
 * /shopper/hunt-pass - Hunt Pass Information & Upgrade Page
 *
 * Hunt Pass is a $4.99/month premium shopper subscription that grants:
 * - 2x points on every action
 * - Early access to flash deals
 * - Exclusive Hunt Pass badge
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useAuth } from '../../components/AuthContext';
import HuntPassModal from '../../components/HuntPassModal';

const HuntPassPage = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [showModal, setShowModal] = useState(false);

  if (!isLoading && !user) {
    router.push('/login?redirect=/shopper/hunt-pass');
    return null;
  }

  const huntPassPrice = 4.99;

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
              onClick={() => setShowModal(true)}
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
              {/* Benefit 1: 2x Points */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-warm-200 dark:border-gray-700">
                <div className="flex items-start gap-4">
                  <div className="text-3xl flex-shrink-0">⭐</div>
                  <div>
                    <h3 className="font-semibold text-warm-900 dark:text-warm-100 mb-2">
                      2x Streak XP
                    </h3>
                    <p className="text-warm-600 dark:text-warm-400">
                      Earn double XP on every action — favorites, visits, purchases, and more. Build your streak twice as fast and unlock badges sooner.
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
                      Early Access to Flash Deals
                    </h3>
                    <p className="text-warm-600 dark:text-warm-400">
                      Get notified first when flash deals go live. See the best treasures before other shoppers, so you never miss out on amazing finds.
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
            </div>
          </div>

          {/* FAQ Section */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-6">
              Frequently Asked Questions
            </h2>

            <div className="space-y-4">
              <details className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-warm-200 dark:border-gray-700">
                <summary className="font-semibold text-warm-900 dark:text-warm-100 cursor-pointer">
                  Can I cancel anytime?
                </summary>
                <p className="text-warm-600 dark:text-warm-400 mt-3">
                  Yes, you can cancel your Hunt Pass subscription at any time. Your access will continue until the end of your current billing period. No questions asked.
                </p>
              </details>

              <details className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-warm-200 dark:border-gray-700">
                <summary className="font-semibold text-warm-900 dark:text-warm-100 cursor-pointer">
                  How is 2x XP calculated?
                </summary>
                <p className="text-warm-600 dark:text-warm-400 mt-3">
                  Every action that normally earns XP — visiting a sale, favoriting an item, making a purchase — is doubled. This includes all individual action XP, streak multipliers, and bonus promotions.
                </p>
              </details>

              <details className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-warm-200 dark:border-gray-700">
                <summary className="font-semibold text-warm-900 dark:text-warm-100 cursor-pointer">
                  What is Streak XP?
                </summary>
                <p className="text-warm-600 dark:text-warm-400 mt-3">
                  Streak XP is the reward you earn for engaging with FindA.Sale. Visit sales, favorite items, make purchases, and interact with the community to build your streak. Hunt Pass holders earn XP twice as fast, unlocking badges and exclusive rewards sooner.
                </p>
              </details>

              <details className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-warm-200 dark:border-gray-700">
                <summary className="font-semibold text-warm-900 dark:text-warm-100 cursor-pointer">
                  Do I have to have Hunt Pass to use FindA.Sale?
                </summary>
                <p className="text-warm-600 dark:text-warm-400 mt-3">
                  No! Hunt Pass is completely optional. You can browse sales, favorite items, and make purchases with a free account. Hunt Pass is just a way to get extra rewards and benefits if you want to supercharge your treasure hunting experience.
                </p>
              </details>
            </div>
          </div>

          {/* CTA Section */}
          <div className="text-center">
            <p className="text-warm-600 dark:text-warm-400 mb-4">
              Ready to hunt smarter?
            </p>
            <button
              onClick={() => setShowModal(true)}
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
