/**
 * Organizer Pricing Discovery Page
 *
 * Consolidated pricing page for organizers.
 * Shows all tiers (SIMPLE/PRO/TEAMS/ENTERPRISE) with upgrade CTAs.
 * Logged-in organizers see their current tier highlighted.
 *
 * Previously split across:
 * - /pages/pricing.tsx (public page)
 * - /pages/organizer/premium.tsx (legacy organizer page)
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../../components/AuthContext';
import BecomeOrganizerModal from '../../components/BecomeOrganizerModal';
import PremiumCTA from '../../components/PremiumCTA';
import TierComparisonTable from '../../components/TierComparisonTable';
import TooltipHelper from '../../components/TooltipHelper';
import api from '../../lib/api';

interface PricingTier {
  id: 'SIMPLE' | 'PRO' | 'TEAMS';
  name: string;
  price: number | null;
  period: string;
  description: string;
  featured: boolean;
  features: string[];
  stripePrice: string | null;
}

const TIERS: PricingTier[] = [
  {
    id: 'SIMPLE',
    name: 'SIMPLE',
    price: null,
    period: 'Free — 10% when items sell',
    description: 'Perfect for trying FindA.Sale',
    featured: false,
    stripePrice: null,
    features: [
      'Photo to listing — snap, confirm, publish',
      'Up to 200 items per sale, 5 photos each',
      '100 auto tags per month',
      '1 active sale at a time',
      'QR codes for every item and sale',
      'Built-in point-of-sale',
      'Social post generator',
      'Ripples — track who clicks your sale links',
      'Self-serve help center + organizer guides',
    ],
  },
  {
    id: 'PRO',
    name: 'PRO',
    price: 29,
    period: 'per month',
    description: 'For organizers running multiple sales who want to save hours of manual work.',
    featured: true,
    stripePrice: 'price_1TDUQsLTUdEUnHOTzG6cVDwu',
    features: [
      'Everything in Simple, plus:',
      '3 concurrent sales, 500 items each',
      '10 photos per item, 2,000 auto tags/month',
      'Smart Pricing — market value estimates',
      'Flip Report — post-sale earnings breakdown',
      'Insights - Advanced sale analytics',
      'Brand Kit — custom logo, colors, storefront',
      'Batch operations + Tools',
      'Multi-platform exports (CSV, JSON, Text)',
      'Seller verification badge',
      '24/7 support assistant + help center',
    ],
  },
  {
    id: 'TEAMS',
    name: 'TEAMS',
    price: 79,
    period: 'per month',
    description: 'For teams running sales across multiple locations, and users who need unlimited items.',
    featured: false,
    stripePrice: 'price_1TDUQtLTUdEUnHOTCEoNL6oz',
    features: [
      'Everything in Pro, plus:',
      'Unlimited concurrent sales',
      '2,000+ items per sale, unlimited photos*',
      'Unlimited auto tags*',
      'Command Center — manage all sales at once',
      'Multi-user workspace — Includes 5 team members',
      'Extra members: $20/mo',
      'Team roles & permissions',
      'Webhooks',
      '24/7 support assistant + help center',
    ],
  },
];

const PricingPage = () => {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelledMessage, setCancelledMessage] = useState<string | null>(null);
  const [showBecomeOrganizerModal, setShowBecomeOrganizerModal] = useState(false);

  // Handle cancelled checkout redirect
  useEffect(() => {
    if (router.query.upgrade === 'cancelled') {
      setCancelledMessage('Checkout cancelled. You\'re still on SIMPLE.');
      // Clear the query param from URL
      router.replace(router.pathname, undefined, { shallow: true });
    }
  }, [router.query.upgrade, router]);

  const handleUpgrade = async (tier: PricingTier) => {
    // Logged-out users go to register
    if (!user) {
      router.push('/register');
      return;
    }

    // Shopper (not organizer yet): open conversion modal
    if (user.role === 'USER' && !user.roles?.includes('ORGANIZER')) {
      setShowBecomeOrganizerModal(true);
      return;
    }

    // User already on this tier
    if (user.organizerTier === tier.id) {
      return;
    }

    // Free tier: no checkout needed
    if (tier.id === 'SIMPLE') {
      // In a real scenario, you'd downgrade here
      return;
    }

    // Start checkout flow
    setLoading(tier.id);
    setError(null);

    try {
      const response = await api.post('/stripe/checkout-session', {
        priceId: tier.stripePrice,
        successUrl: `${window.location.origin}/organizer/dashboard?upgrade=success`,
        cancelUrl: `${window.location.origin}/organizer/pricing?upgrade=cancelled`,
      });

      if (response.data?.url) {
        window.location.href = response.data.url;
      } else {
        setError('Failed to create checkout session. Please try again.');
      }
    } catch (err: any) {
      console.error('Checkout error:', err);
      setError(err.response?.data?.message || 'Failed to start checkout. Please try again.');
      setLoading(null);
    }
  };

  const getCurrentTierLabel = (tier: PricingTier): string => {
    if (!user?.organizerTier) return '';
    if (user.organizerTier === tier.id) {
      return 'Current Plan';
    }
    return '';
  };

  const getButtonLabel = (tier: PricingTier): string => {
    // Loading state
    if (loading === tier.id) return 'Processing...';

    // User logged out
    if (!user) {
      if (tier.id === 'SIMPLE') return 'Get Started Free';
      return `Sign up for ${tier.name}`;
    }

    // Shopper user (not organizer yet)
    if (user.role === 'USER' && !user.roles?.includes('ORGANIZER')) {
      if (tier.id === 'SIMPLE') return 'Start Free as Organizer';
      return `Upgrade to ${tier.name}`;
    }

    // User logged in as organizer
    const isCurrentTier = user.organizerTier === tier.id;
    if (isCurrentTier) return 'Current Plan';

    if (tier.id === 'SIMPLE') {
      return 'Downgrade to Free';
    }

    return `Upgrade to ${tier.name}`;
  };

  return (
    <>
      <Head>
        <title>Pricing - FindA.Sale</title>
        <meta name="description" content="Choose the perfect plan for managing your sales." />
        <meta property="og:title" content="Pricing - FindA.Sale" />
        <meta property="og:description" content="Choose the perfect plan for managing your sales." />
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-4">
              Sell smarter.
            </h1>
            <p className="text-xl text-warm-600 dark:text-warm-300">
              Whether you're running one sale or managing a team, FindA.Sale handles listings, paperwork, and payments so you can focus on customers.
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-8 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {/* Cancelled message */}
          {cancelledMessage && (
            <div className="mb-8 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-blue-800 dark:text-blue-200">{cancelledMessage}</p>
            </div>
          )}

          {/* Banner for shopper-only users */}
          {user?.role === 'USER' && !user?.roles?.includes('ORGANIZER') && (
            <div className="mb-12 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-6 text-center">
              <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-2">
                Ready to host your first sale?
              </h2>
              <p className="text-warm-700 dark:text-warm-300 mb-4">
                Become an Organizer and start selling today.
              </p>
              <button
                onClick={() => setShowBecomeOrganizerModal(true)}
                className="inline-block bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600 text-white font-semibold py-2 px-6 rounded-lg transition-all duration-200"
              >
                Become an Organizer
              </button>
            </div>
          )}

          {/* Value Props Callout Section */}
          <div className="mb-16">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Photo to listing */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow">
                <div className="text-3xl mb-3">📸</div>
                <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">
                  Photo to listing in seconds
                </h3>
                <p className="text-sm text-warm-700 dark:text-warm-300">
                  Snap a photo. The app fills in title, description, tags, and estimated value. Confirm and publish.
                </p>
              </div>

              {/* List everywhere */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow">
                <div className="text-3xl mb-3">🌐</div>
                <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">
                  List everywhere at once
                </h3>
                <p className="text-sm text-warm-700 dark:text-warm-300">
                  One-click exports for Facebook Marketplace, Craigslist, eBay, and EstateSales.net
                </p>
              </div>

              {/* Social posts */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow">
                <div className="text-3xl mb-3">📱</div>
                <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">
                  Social posts, ready to share
                </h3>
                <p className="text-sm text-warm-700 dark:text-warm-300">
                  Auto-generated posts with sale photos. Track engagement with Ripples.
                </p>
              </div>

              {/* Buyers arrive ready */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow">
                <div className="text-3xl mb-3">🛍️</div>
                <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">
                  Buyers arrive ready
                </h3>
                <p className="text-sm text-warm-700 dark:text-warm-300">
                  Shoppers browse, reserve and buy items before sale day through the Explorer's Guild.
                </p>
              </div>

              {/* Take payments */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow">
                <div className="text-3xl mb-3">💳</div>
                <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">
                  Take payments on the spot
                </h3>
                <p className="text-sm text-warm-700 dark:text-warm-300">
                  Built-in point-of-sale. No extra hardware needed.
                </p>
              </div>

              {/* QR codes */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow">
                <div className="text-3xl mb-3">🔲</div>
                <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">
                  QR codes on every item
                </h3>
                <p className="text-sm text-warm-700 dark:text-warm-300">
                  Print, stick, scan. Shoppers see listings and prices from their phone.
                </p>
              </div>
            </div>
          </div>

          {/* Pricing Tiers */}
          <div className="grid md:grid-cols-3 gap-4 md:gap-8 mb-12">
            {TIERS.map((tier) => {
              const currentLabel = getCurrentTierLabel(tier);
              const isCurrentTier = !!currentLabel;

              return (
                <div
                  key={tier.id}
                  className={`relative rounded-lg overflow-hidden transition-all duration-300 ${
                    tier.featured
                      ? 'md:scale-105 shadow-2xl bg-white dark:bg-gray-800'
                      : 'bg-white dark:bg-gray-800 shadow-lg hover:shadow-xl'
                  }`}
                >
                  {/* Featured badge */}
                  {tier.featured && (
                    <div className="absolute top-0 right-0 bg-amber-500 text-white px-4 py-1 text-sm font-semibold rounded-bl-lg">
                      Most Popular
                    </div>
                  )}

                  {/* Tier content */}
                  <div className="p-8">
                    {/* Tier name & description */}
                    <div className="flex items-start gap-2 mb-2">
                      <h3 className="text-2xl font-bold text-warm-900 dark:text-warm-100">
                        {tier.name}
                      </h3>
                      <TooltipHelper
                        text={
                          tier.id === 'SIMPLE'
                            ? 'Free plan with a 10% fee per item sold. Perfect for trying out FindA.Sale.'
                            : tier.id === 'PRO'
                              ? 'Pro plan for active organizers. Monthly subscription with 8% fees and advanced tooling and analytics.'
                              : 'Teams plan for large operators and high-volume sellers. Dedicated workspace supports multiple team members.'
                        }
                        position="right"
                      />
                    </div>
                    <p className="text-warm-600 dark:text-warm-300 text-sm mb-1">
                      {tier.description}
                    </p>
                    {/* Inline explainer */}
                    <p className="text-warm-500 dark:text-warm-500 text-xs mb-6">
                      {tier.id === 'SIMPLE' &&
                        'No monthly cost — just 10% when items sell.'}
                      {tier.id === 'PRO' &&
                        'Lower fees (8%) plus tools that speed your workflow and attract more buyers.'}
                      {tier.id === 'TEAMS' &&
                        'For organizers running multiple sales at once and power users who need unlimited photos and webhooks.'}
                    </p>

                    {/* Price */}
                    <div className="mb-6">
                      {tier.price !== null ? (
                        <div className="flex items-baseline">
                          <span className="text-5xl font-bold text-warm-900 dark:text-warm-100">
                            ${tier.price}
                          </span>
                          <span className="ml-2 text-warm-600 dark:text-warm-300">
                            {tier.period}
                          </span>
                        </div>
                      ) : (
                        <div className="text-5xl font-bold text-warm-900 dark:text-warm-100">
                          Free
                        </div>
                      )}
                    </div>

                    {/* Current plan badge */}
                    {isCurrentTier && (
                      <div className="mb-6 inline-block bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 px-3 py-1 rounded-full text-sm font-medium">
                        ✓ {currentLabel}
                      </div>
                    )}

                    {/* CTA Button */}
                    <button
                      onClick={() => handleUpgrade(tier)}
                      disabled={loading === tier.id || isCurrentTier}
                      className={`w-full py-3 px-4 rounded-lg font-semibold transition-all duration-200 mb-8 ${
                        isCurrentTier
                          ? 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 cursor-not-allowed'
                          : tier.featured
                            ? 'bg-amber-500 hover:bg-amber-600 text-white'
                            : 'bg-warm-200 dark:bg-gray-700 text-warm-900 dark:text-warm-100 hover:bg-warm-300 dark:hover:bg-gray-600'
                      }`}
                    >
                      {getButtonLabel(tier)}
                    </button>

                    {/* Features list */}
                    <div className="space-y-4">
                      {tier.features.map((feature, idx) => (
                        <div key={idx} className="flex items-start">
                          <svg
                            className="w-5 h-5 text-green-500 mr-3 mt-0.5 flex-shrink-0"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          <span className="text-warm-700 dark:text-warm-300 text-sm">
                            {feature}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* À la Carte Section — Pay-as-you-go option */}
          <div className="mb-12 bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-8 text-center">
            <div className="max-w-2xl mx-auto">
              <h2 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-3">
                Just one big sale? Upgrade for $9.99.
              </h2>
              <p className="text-lg text-warm-700 dark:text-warm-300 mb-6">
                Unlock PRO-level capacity for a single sale. No subscription needed.
              </p>

              {/* Features for à la carte */}
              <div className="grid md:grid-cols-2 gap-4 mb-8">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                  <p className="text-sm font-semibold text-warm-900 dark:text-warm-100 mb-1">
                    500 items, 10 photos each
                  </p>
                  <p className="text-xs text-warm-600 dark:text-warm-300">
                    5x the items, 2x the photos vs. the free plan.
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                  <p className="text-sm font-semibold text-warm-900 dark:text-warm-100 mb-1">
                    500 auto tags
                  </p>
                  <p className="text-xs text-warm-600 dark:text-warm-300">
                    Every item gets tagged. Descriptions fill themselves.
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                  <p className="text-sm font-semibold text-warm-900 dark:text-warm-100 mb-1">
                    Flip Report included
                  </p>
                  <p className="text-xs text-warm-600 dark:text-warm-300">
                    See exactly what sold, what didn't, and your earnings.
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                  <p className="text-sm font-semibold text-warm-900 dark:text-warm-100 mb-1">
                    Virtual Queue
                  </p>
                  <p className="text-xs text-warm-600 dark:text-warm-300">
                    We handle the early birds, you handle the sale
                  </p>
                </div>
              </div>

              <p className="text-sm text-warm-600 dark:text-warm-300 mb-6">
                Same 10% platform fee as Simple. One-time $9.99 payment.
              </p>

              <Link
                href="/organizer/create-sale"
                className="inline-block bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-600 text-white font-semibold py-3 px-8 rounded-lg transition-all duration-200"
              >
                Create a single sale
              </Link>
            </div>
          </div>

          {/* Premium CTA for SIMPLE tier users */}
          {user?.organizerTier === 'SIMPLE' && (
            <div className="mb-12">
              <PremiumCTA
                tier="SIMPLE"
                title="Ready to Scale Your Sales?"
                description="Upgrade to PRO to unlock powerful tools, lower fees, and expert support."
                benefits={[
                  'More Photos, More Tags',
                  'Drop fees from 10% to 8%',
                  'Run up to 3 sales at once',
                  'Smart Pricing and Flip Reports',
                  '24/7 support assistant',
                ]}
                ctaText="Upgrade to PRO"
                ctaHref="/organizer/pricing"
                compact={false}
              />
            </div>
          )}

          {/* Feature Comparison Table */}
          <div className="mt-12 mb-12">
            <h2 className="text-3xl font-bold text-warm-900 dark:text-warm-100 text-center mb-8">
              Detailed Feature Comparison
            </h2>
            <TierComparisonTable currentTier={user?.organizerTier as 'SIMPLE' | 'PRO' | 'TEAMS' | undefined} />
          </div>

          {/* D-007: Enterprise CTA Section */}
          <div className="mt-12 mb-12 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-8 text-center">
            <div className="max-w-2xl mx-auto">
              <h2 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-3">
                Running a larger operation?
              </h2>
              <p className="text-lg text-warm-700 dark:text-warm-300 mb-6">
                For auction houses, franchises, or high-volume teams that need unlimited everything, our enterprise solutions include custom integrations, white labeling and API access.
              </p>
              <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg inline-block">
                <p className="text-warm-600 dark:text-warm-300 text-sm">Pricing starts at <span className="text-2xl font-bold text-warm-900 dark:text-warm-100">$500/mo</span> (annual contracts)</p>
              </div>
              <Link
                href="/contact"
                className="inline-block bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600 text-white font-semibold py-3 px-8 rounded-lg transition-all duration-200"
              >
                Contact Us
              </Link>
            </div>
          </div>

          {/* FAQ / Additional info */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-6">
              Frequently Asked Questions
            </h2>

            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-warm-900 dark:text-warm-100 mb-2">
                  Can I change plans later?
                </h3>
                <p className="text-warm-700 dark:text-warm-300">
                  Yes, you can upgrade or downgrade your plan at any time. Changes take effect at your next billing cycle.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-warm-900 dark:text-warm-100 mb-2">
                  Is there a free trial?
                </h3>
                <p className="text-warm-700 dark:text-warm-300">
                  SIMPLE is always free, so you can try FindA.Sale without any commitment.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-warm-900 dark:text-warm-100 mb-2">
                  What payment methods do you accept?
                </h3>
                <p className="text-warm-700 dark:text-warm-300">
                  We accept all major credit cards (Visa, MasterCard, American Express, Discover) via Stripe.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-warm-900 dark:text-warm-100 mb-2">
                  Can I cancel anytime?
                </h3>
                <p className="text-warm-700 dark:text-warm-300">
                  Yes, you can cancel your subscription at any time. You'll retain access until the end of your billing period.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-warm-900 dark:text-warm-100 mb-2">
                  How do fees work?
                </h3>
                <p className="text-warm-700 dark:text-warm-300">
                  When you sell an item for $100, we receive $10 as a platform fee. PRO and TEAMS drop that to 8%.  If the shopper pays with credit card, Stripe fees average 3%.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-warm-900 dark:text-warm-100 mb-2">
                  What happens if I run out of auto tags mid-sale?
                </h3>
                <p className="text-warm-700 dark:text-warm-300">
                  On Simple, you get 100 per month — resets on the 1st. If you hit the limit, you can still add items manually, or upgrade that sale for $9.99 to get 500 auto tags. On PRO and TEAMS, you won't hit the limit in normal use.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-warm-900 dark:text-warm-100 mb-2">
                  *What do you mean Unlimited? 
                </h3>
                <p className="text-warm-700 dark:text-warm-300">
                   While we truly mean unlimited we do employ platform abuse prevention mechanisms, time based rate limits and queues, soft data storage caps, post-sale data archival, etc..  You and your team members won't hit these limits with normal use.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-warm-900 dark:text-warm-100 mb-2">
                  Can I export my data if I leave?
                </h3>
                <p className="text-warm-700 dark:text-warm-300">
                  Yes. You can download all your listings, photos, and sales data anytime, no questions asked. Your data is yours.
                </p>
              </div>
            </div>

            <div className="mt-8 pt-8 border-t border-warm-200 dark:border-gray-700">
              <p className="text-warm-600 dark:text-warm-300 text-sm">
                Need help choosing a plan? <Link href="/contact" className="text-amber-600 dark:text-amber-400 font-semibold hover:underline">Contact our team</Link>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Become Organizer Modal */}
      <BecomeOrganizerModal
        isOpen={showBecomeOrganizerModal}
        onClose={() => setShowBecomeOrganizerModal(false)}
      />
    </>
  );
};

export default PricingPage;
