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
                      1.5x XP Multiplier
                    </h3>
                    <p className="text-warm-600 dark:text-warm-400">
                      Earn 1.5x XP on every action — visits, purchases, treasure hunts, and more. Build your streak faster and unlock badges sooner.
                    </p>
                  </div>
                </div>
              </div>

              {/* Benefit 1.5: Treasure Hunt Pro */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-warm-200 dark:border-gray-700">
                <div className="flex items-start gap-4">
                  <div className="text-3xl flex-shrink-0">🎯</div>
                  <div>
                    <h3 className="font-semibold text-warm-900 dark:text-warm-100 mb-2">
                      Treasure Hunt Pro
                    </h3>
                    <p className="text-warm-600 dark:text-warm-400">
                      Get +10% XP bonus per QR code scan and enjoy a raised daily treasure hunt XP cap of 150 (vs 100). Collect more treasure, earn more rewards.
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

              {/* Benefit 2.5: Rare Finds Pass */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-warm-200 dark:border-gray-700">
                <div className="flex items-start gap-4">
                  <div className="text-3xl flex-shrink-0">💎</div>
                  <div>
                    <h3 className="font-semibold text-warm-900 dark:text-warm-100 mb-2">
                      Rare Finds Pass — Early Rarity Access
                    </h3>
                    <p className="text-warm-600 dark:text-warm-400">
                      See Rare items 6 hours early and Legendary items 12 hours early. Plus, get exclusive access to the dedicated Rare Finds feed packed with the finest treasures.
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

              {/* Benefit 4: Golden Trophy Avatar Frame */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-warm-200 dark:border-gray-700">
                <div className="flex items-start gap-4">
                  <div className="text-3xl flex-shrink-0">🏆</div>
                  <div>
                    <h3 className="font-semibold text-warm-900 dark:text-warm-100 mb-2">
                      Golden Trophy Avatar Frame
                    </h3>
                    <p className="text-warm-600 dark:text-warm-400">
                      Display an exclusive golden avatar frame on your profile and leaderboard. Stand out as a premium Hunt Pass member in the community.
                    </p>
                  </div>
                </div>
              </div>

              {/* Benefit 5: Hunt Pass Insider Newsletter */}
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

          {/* How to Earn XP - Complete Table */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-6">
              How to Earn XP
            </h2>
            <p className="text-warm-600 dark:text-warm-400 mb-6">
              Every action in FindA.Sale earns XP. Hunt Pass members earn 1.5x on all actions. Here's the complete breakdown:
            </p>

            <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-warm-100 dark:bg-gray-700">
                    <th className="px-6 py-3 text-left font-semibold text-warm-900 dark:text-warm-100">Action</th>
                    <th className="px-6 py-3 text-left font-semibold text-warm-900 dark:text-warm-100">Standard XP</th>
                    <th className="px-6 py-3 text-left font-semibold text-warm-900 dark:text-warm-100">Cap</th>
                    <th className="px-6 py-3 text-left font-semibold text-purple-600 dark:text-purple-300">Hunt Pass XP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
                  {/* Shopping */}
                  <tr className="bg-blue-50/30 dark:bg-blue-900/10">
                    <td colSpan={4} className="px-6 py-2 font-bold text-warm-900 dark:text-warm-100 text-sm">
                      Shopping
                    </td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Purchase ($1 spent)</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">1 XP</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">None</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">1.5 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Visit a sale</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">5 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">2/day, 150/mo</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">7.5 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Hold completed (pickup/purchase)</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">+7 XP</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">None</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">+10.5 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">First purchase ever</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">50 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">One-time</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">75 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Auction win</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">10 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">100/mo</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">15 XP</td>
                  </tr>

                  {/* Community */}
                  <tr className="bg-green-50/30 dark:bg-green-900/10">
                    <td colSpan={4} className="px-6 py-2 font-bold text-warm-900 dark:text-warm-100 text-sm">
                      Community
                    </td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Haul post published</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">10 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">Requires 2+ items + photo</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">15 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Haul post 10+ likes</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">+5 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">50/mo</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">+7.5 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Haul engagement (likes/comments on others' posts)</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">+0.5/like, +3/comment</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">20/mo</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">+0.75/like, +4.5/comment</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Seller review (text)</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">8 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">30/mo</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">12 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Seller review (text + photo bonus)</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">+3 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">Stacks</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">+4.5 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Social share</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">10 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">200/mo</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">15 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Referral (friend purchases)</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">30 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">One-time per friend</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">45 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Referral (new organizer signup)</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">20 XP</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">None</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">30 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Referral (organizer's first sale bonus)</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">+50 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">One-time</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">+75 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Public collection guide</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">50 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">One-time per guide</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">75 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Bounty fulfillment (organizer-posted)</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">25 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">Supply-limited</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">37.5 XP</td>
                  </tr>
                  {/* Treasure Trails */}
                  <tr className="bg-orange-50/30 dark:bg-orange-900/10">
                    <td colSpan={4} className="px-6 py-2 font-bold text-warm-900 dark:text-warm-100 text-sm">
                      Treasure Trails
                    </td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Trail stop – FindA.Sale event</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">5 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">Purchase XP stacks</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">7.5 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Trail stop – resale/antique shop</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">3 XP + 2 with photo</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">—</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">4.5 XP + 3 with photo</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Trail stop – local POI (café, landmark)</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">2 XP + 2 with photo</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">—</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">3 XP + 3 with photo</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Trail stop – platform-listed business</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">4 XP + 2 with photo</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">—</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">6 XP + 3 with photo</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Trail completion (3 stops)</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">+40 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">1x per trail per user</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">+60 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Trail completion (4 stops)</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">+50 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">1x per trail per user</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">+75 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Trail completion (5 stops)</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">+60 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">1x per trail per user</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">+90 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Trail completion (6 stops)</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">+70 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">1x per trail per user</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">+105 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Trail completion (7 stops)</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">+80 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">1x per trail per user</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">+120 XP</td>
                  </tr>

                  {/* Treasure Hunt (QR Scan Game) */}
                  <tr className="bg-yellow-50/30 dark:bg-yellow-900/10">
                    <td colSpan={4} className="px-6 py-2 font-bold text-warm-900 dark:text-warm-100 text-sm">
                      Treasure Hunt (QR Scans)
                    </td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">QR clue scan</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">12 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">100/day (150/day w/ HP)</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">13 XP (+10%)</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">All clues found (completion bonus)</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">+30 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">Per hunt</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">+33 XP (+10%)</td>
                  </tr>

                  {/* Streaks & Bonuses */}
                  <tr className="bg-indigo-50/30 dark:bg-indigo-900/10">
                    <td colSpan={4} className="px-6 py-2 font-bold text-warm-900 dark:text-warm-100 text-sm">
                      Streaks & Special Bonuses
                    </td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">7-day streak bonus</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">100 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">Once/month</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">150 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Streak multiplier (active week)</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">1.2x all earned</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">Weekly during streak</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">1.8x all earned</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">30-day active anniversary</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">250 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">Once/month</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">375 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Virtual queue on-time</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">10 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">100/mo</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">15 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Virtual queue early (+15m)</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">+5 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">Stacks</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">+7.5 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Virtual queue 3-streak bonus</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">+20 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">Once/mo</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">+30 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Loot Legend specialty</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">25 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">200/yr (8 max)</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">37.5 XP</td>
                  </tr>

                  {/* Seasonal */}
                  <tr className="bg-rose-50/30 dark:bg-rose-900/10">
                    <td colSpan={4} className="px-6 py-2 font-bold text-warm-900 dark:text-warm-100 text-sm">
                      Seasonal Challenges
                    </td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Seasonal challenge (easy)</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">100 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">1x/season</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">150 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Seasonal challenge (medium)</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">200 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">1x/season</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">300 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Seasonal challenge (hard)</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">300 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">1x/season</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">450 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Seasonal leaderboard top 10</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">500 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">1x/season</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">750 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">Seasonal bounty fulfillment</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">50–200 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">Per-bounty</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">75–300 XP</td>
                  </tr>

                  {/* Organizer */}
                  <tr className="bg-teal-50/30 dark:bg-teal-900/10">
                    <td colSpan={4} className="px-6 py-2 font-bold text-warm-900 dark:text-warm-100 text-sm">
                      Organizer Activities
                    </td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">[Org] First sale posted</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">100 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">One-time</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">150 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">[Org] Sale published</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">10 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">None</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">15 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">[Org] Shopper on-site signup</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">10 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">No cap (fraud-gated)</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">15 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">[Org] Haul from your sale</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">3 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">None</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">4.5 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-warm-900 dark:text-warm-100">[Org] 5-star review received</td>
                    <td className="px-6 py-3 text-warm-600 dark:text-warm-400">10 XP</td>
                    <td className="px-6 py-3 text-xs text-warm-500 dark:text-warm-400">100/mo</td>
                    <td className="px-6 py-3 font-semibold text-purple-600 dark:text-purple-300">15 XP</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-6 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
              <p className="text-sm text-purple-900 dark:text-purple-300">
                <strong>Hunt Pass Multiplier:</strong> All XP earned is multiplied by 1.5x when you have an active Hunt Pass. The Hunt Pass XP column shows the result of this multiplier.
              </p>
            </div>
          </div>

          {/* XP Sinks - Spend Your XP */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-6">
              Spend Your XP — XP Sinks
            </h2>
            <p className="text-warm-600 dark:text-warm-400 mb-6">
              Earn XP to unlock rewards, cosmetics, and premium features. Here's what you can spend your XP on:
            </p>

            <div className="space-y-4">
              {/* Cosmetics */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 overflow-hidden">
                <div className="bg-pink-50 dark:bg-pink-900/20 px-6 py-3 border-b border-warm-200 dark:border-gray-700">
                  <h3 className="font-bold text-warm-900 dark:text-warm-100">Cosmetics & Profile</h3>
                </div>
                <div className="divide-y divide-warm-200 dark:divide-gray-700">
                  <div className="px-6 py-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold text-warm-900 dark:text-warm-100">Custom Username Color</p>
                        <p className="text-sm text-warm-600 dark:text-warm-400">Make your username stand out with a personalized color.</p>
                      </div>
                      <span className="font-bold text-purple-600 dark:text-purple-300 whitespace-nowrap ml-4">50 XP</span>
                    </div>
                    <p className="text-xs text-warm-500 dark:text-warm-400">Account requirement: Ranger+ | Permanent</p>
                  </div>
                  <div className="px-6 py-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold text-warm-900 dark:text-warm-100">Custom Frame Badge</p>
                        <p className="text-sm text-warm-600 dark:text-warm-400">Unlock an exclusive rare avatar frame for your profile.</p>
                      </div>
                      <span className="font-bold text-purple-600 dark:text-purple-300 whitespace-nowrap ml-4">75 XP</span>
                    </div>
                    <p className="text-xs text-warm-500 dark:text-warm-400">Account requirement: Sage+ | Permanent | One choice</p>
                  </div>
                </div>
              </div>

              {/* Gameplay Boosts */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 overflow-hidden">
                <div className="bg-blue-50 dark:bg-blue-900/20 px-6 py-3 border-b border-warm-200 dark:border-gray-700">
                  <h3 className="font-bold text-warm-900 dark:text-warm-100">Gameplay Boosts</h3>
                </div>
                <div className="divide-y divide-warm-200 dark:divide-gray-700">
                  <div className="px-6 py-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold text-warm-900 dark:text-warm-100">Rarity Boost (1 Sale)</p>
                        <p className="text-sm text-warm-600 dark:text-warm-400">Increase Legendary rarity odds by +2% for a single sale.</p>
                      </div>
                      <span className="font-bold text-purple-600 dark:text-purple-300 whitespace-nowrap ml-4">15 XP</span>
                    </div>
                    <p className="text-xs text-warm-500 dark:text-warm-400">Account requirement: Scout+ | Until sale ends | Stackable</p>
                  </div>
                  <div className="px-6 py-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold text-warm-900 dark:text-warm-100">Haul Visibility Boost</p>
                        <p className="text-sm text-warm-600 dark:text-warm-400">Feature your haul as "Trending" to reach more collectors.</p>
                      </div>
                      <span className="font-bold text-purple-600 dark:text-purple-300 whitespace-nowrap ml-4">10 XP</span>
                    </div>
                    <p className="text-xs text-warm-500 dark:text-warm-400">Account requirement: Scout+ | 7 days</p>
                  </div>
                  <div className="px-6 py-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold text-warm-900 dark:text-warm-100">Bounty Visibility Boost</p>
                        <p className="text-sm text-warm-600 dark:text-warm-400">Feature your bounty in "Hot Bounties" for higher fulfillment odds.</p>
                      </div>
                      <span className="font-bold text-purple-600 dark:text-purple-300 whitespace-nowrap ml-4">15 XP</span>
                    </div>
                    <p className="text-xs text-warm-500 dark:text-warm-400">Account requirement: Organizer Scout+ | 7 days</p>
                  </div>
                </div>
              </div>

              {/* Content Creation & Gating */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 overflow-hidden">
                <div className="bg-green-50 dark:bg-green-900/20 px-6 py-3 border-b border-warm-200 dark:border-gray-700">
                  <h3 className="font-bold text-warm-900 dark:text-warm-100">Content Creation & Unlocks</h3>
                </div>
                <div className="divide-y divide-warm-200 dark:divide-gray-700">
                  <div className="px-6 py-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold text-warm-900 dark:text-warm-100">Seasonal Challenge Access</p>
                        <p className="text-sm text-warm-600 dark:text-warm-400">Unlock this season's challenges, cosmetics, and leaderboard access (non-Hunt Pass only).</p>
                      </div>
                      <span className="font-bold text-purple-600 dark:text-purple-300 whitespace-nowrap ml-4">250 XP</span>
                    </div>
                    <p className="text-xs text-warm-500 dark:text-warm-400">Account requirement: Scout+ (non-Hunt Pass) | 1 season | Hunt Pass subscribers get free access</p>
                  </div>
                  <div className="px-6 py-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold text-warm-900 dark:text-warm-100">Guide Publication</p>
                        <p className="text-sm text-warm-600 dark:text-warm-400">Publish a hunting guide to share your expertise with the community.</p>
                      </div>
                      <span className="font-bold text-purple-600 dark:text-purple-300 whitespace-nowrap ml-4">50 XP</span>
                    </div>
                    <p className="text-xs text-warm-500 dark:text-warm-400">Account requirement: Ranger+ | Permanent | Free for Sage+; Grandmaster unlimited</p>
                  </div>
                </div>
              </div>

              {/* Hunt Pass */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 overflow-hidden">
                <div className="bg-purple-50 dark:bg-purple-900/20 px-6 py-3 border-b border-warm-200 dark:border-gray-700">
                  <h3 className="font-bold text-warm-900 dark:text-warm-100">Hunt Pass & Discounts</h3>
                </div>
                <div className="divide-y divide-warm-200 dark:divide-gray-700">
                  <div className="px-6 py-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold text-warm-900 dark:text-warm-100">$1 Off Any Purchase</p>
                        <p className="text-sm text-warm-600 dark:text-warm-400">Redeem your XP for $1 off any purchase on FindA.Sale.</p>
                      </div>
                      <span className="font-bold text-purple-600 dark:text-purple-300 whitespace-nowrap ml-4">50 XP</span>
                    </div>
                    <p className="text-xs text-warm-500 dark:text-warm-400">Account requirement: Scout+ | One per calendar month | Applied at checkout</p>
                  </div>
                  <div className="px-6 py-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold text-warm-900 dark:text-warm-100">Hunt Pass Discount</p>
                        <p className="text-sm text-warm-600 dark:text-warm-400">Get $1 off one month of Hunt Pass ($4.99 → $3.99).</p>
                      </div>
                      <span className="font-bold text-purple-600 dark:text-purple-300 whitespace-nowrap ml-4">50 XP</span>
                    </div>
                    <p className="text-xs text-warm-500 dark:text-warm-400">Account requirement: Scout+ | One-time bridge to paid</p>
                  </div>
                </div>
              </div>

              {/* Organizer Sinks */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 overflow-hidden">
                <div className="bg-amber-50 dark:bg-amber-900/20 px-6 py-3 border-b border-warm-200 dark:border-gray-700">
                  <h3 className="font-bold text-warm-900 dark:text-warm-100">Organizer Features</h3>
                </div>
                <div className="divide-y divide-warm-200 dark:divide-gray-700">
                  <div className="px-6 py-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold text-warm-900 dark:text-warm-100">Early Access Boost</p>
                        <p className="text-sm text-warm-600 dark:text-warm-400">Feature your presale 1 week early with extra visibility to shoppers.</p>
                      </div>
                      <span className="font-bold text-purple-600 dark:text-purple-300 whitespace-nowrap ml-4">75 XP</span>
                    </div>
                    <p className="text-xs text-warm-500 dark:text-warm-400">Account requirement: Organizer Elite+ | 1 week</p>
                  </div>
                  <div className="px-6 py-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold text-warm-900 dark:text-warm-100">Listings Extension</p>
                        <p className="text-sm text-warm-600 dark:text-warm-400">Add 10 more item listings beyond your plan limit.</p>
                      </div>
                      <span className="font-bold text-purple-600 dark:text-purple-300 whitespace-nowrap ml-4">100 XP</span>
                    </div>
                    <p className="text-xs text-warm-500 dark:text-warm-400">Account requirement: Organizer Trusted+ | 1 month</p>
                  </div>
                  <div className="px-6 py-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold text-warm-900 dark:text-warm-100">Event Sponsorship</p>
                        <p className="text-sm text-warm-600 dark:text-warm-400">Create a flash sale or themed collection for maximum visibility.</p>
                      </div>
                      <span className="font-bold text-purple-600 dark:text-purple-300 whitespace-nowrap ml-4">150 XP</span>
                    </div>
                    <p className="text-xs text-warm-500 dark:text-warm-400">Account requirement: Organizer Elite+ | 3 days | Exclusive bounties included</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
              <p className="text-sm text-amber-900 dark:text-amber-300">
                <strong>Rank Floors:</strong> You can't spend XP below your rank's minimum threshold. Scout (500), Ranger (2,000), Sage (5,000), Grandmaster (12,000). This means you always retain enough XP to stay at your current rank.
              </p>
            </div>
          </div>

          {/* XP Earning Matrix */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-6">
              Quick Reference Matrix
            </h2>
            <p className="text-warm-600 dark:text-warm-400 mb-4">
              See how much XP you earn for each action with and without Hunt Pass.
            </p>

            <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-warm-100 dark:bg-gray-700">
                    <th className="px-6 py-4 text-left text-sm font-semibold text-warm-900 dark:text-warm-100">Action</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-warm-900 dark:text-warm-100">Standard XP</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-purple-600 dark:text-purple-300">Hunt Pass XP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-sm text-warm-900 dark:text-warm-100">Visit a sale</td>
                    <td className="px-6 py-3 text-sm text-warm-600 dark:text-warm-400">5 XP</td>
                    <td className="px-6 py-3 text-sm font-semibold text-purple-600 dark:text-purple-300">7.5 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-sm text-warm-900 dark:text-warm-100">Make a purchase ($)</td>
                    <td className="px-6 py-3 text-sm text-warm-600 dark:text-warm-400">1 XP per $1</td>
                    <td className="px-6 py-3 text-sm font-semibold text-purple-600 dark:text-purple-300">1.5 XP per $1</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-sm text-warm-900 dark:text-warm-100">Treasure Hunt scan</td>
                    <td className="px-6 py-3 text-sm text-warm-600 dark:text-warm-400">12 XP<br/><span className="text-xs text-warm-500">(max 100/day)</span></td>
                    <td className="px-6 py-3 text-sm font-semibold text-purple-600 dark:text-purple-300">13 XP*<br/><span className="text-xs text-purple-500">(max 150/day)</span></td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-sm text-warm-900 dark:text-warm-100">Write a seller review</td>
                    <td className="px-6 py-3 text-sm text-warm-600 dark:text-warm-400">8 XP</td>
                    <td className="px-6 py-3 text-sm font-semibold text-purple-600 dark:text-purple-300">12 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-sm text-warm-900 dark:text-warm-100">Social share</td>
                    <td className="px-6 py-3 text-sm text-warm-600 dark:text-warm-400">10 XP</td>
                    <td className="px-6 py-3 text-sm font-semibold text-purple-600 dark:text-purple-300">15 XP</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-3 text-sm text-warm-900 dark:text-warm-100">Win an auction</td>
                    <td className="px-6 py-3 text-sm text-warm-600 dark:text-warm-400">10 XP</td>
                    <td className="px-6 py-3 text-sm font-semibold text-purple-600 dark:text-purple-300">15 XP</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-6 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg p-4 space-y-2">
              <p className="text-sm text-purple-900 dark:text-purple-300">
                <strong>Quick math:</strong> If you earn 50 XP/month without Hunt Pass, you'll earn 75 XP/month with it — saving ~3 months of progression per rank!
              </p>
              <p className="text-xs text-purple-800 dark:text-purple-400">
                * Treasure Hunt scans with Hunt Pass receive +10% bonus on top of your rank multiplier. Example: base 12 XP × 1.1 Hunt Pass bonus = 13 XP (rounded).
              </p>
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
                  How is 1.5x XP calculated?
                </summary>
                <p className="text-warm-600 dark:text-warm-400 mt-3">
                  Every action that normally earns XP — visiting a sale, making a purchase, scanning items, writing reviews — is multiplied by 1.5x. This applies to all action XP rewards.
                </p>
              </details>

              <details className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-warm-200 dark:border-gray-700">
                <summary className="font-semibold text-warm-900 dark:text-warm-100 cursor-pointer">
                  How does the weekly activity streak work?
                </summary>
                <p className="text-warm-600 dark:text-warm-400 mt-3">
                  Stay active any 7 days in a calendar month and earn a 100 XP streak bonus (150 XP with Hunt Pass). During an active streak week, all your XP is also multiplied by 1.2x — so the more you engage, the faster your rank grows. Miss a week entirely? Your streak resets, but your rank and all previously earned XP stay put.
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
