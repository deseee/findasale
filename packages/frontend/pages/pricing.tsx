/**
 * Public Pricing Page (#23)
 *
 * Shows all 3 organizer subscription tiers side-by-side with Stripe checkout integration.
 * - SIMPLE (Free): 10% platform fee, 200 items/sale, 5 photos/item, 100 AI tags/month
 * - PRO ($29/month): 8% fee, 500 items/sale, 10 photos/item, 2,000 AI tags/month, unlimited sales, batch ops, analytics, brand kit, exports
 * - TEAMS ($79/month): 8% fee, 2,000 items/sale, 15 photos/item, unlimited AI tags, multi-user, API/webhooks, white-label, priority support
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../components/AuthContext';
import api from '../lib/api';

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
    period: 'Free',
    description: 'Perfect for getting started',
    featured: false,
    stripePrice: null,
    features: [
      '10% platform fee',
      '200 items per sale',
      '5 photos per item',
      '100 AI tags per month',
      'Basic sale dashboard',
      'Email support',
    ],
  },
  {
    id: 'PRO',
    name: 'PRO',
    price: 29,
    period: 'per month',
    description: 'For growing organizers',
    featured: true,
    stripePrice: 'price_1TDUQsLTUdEUnHOTzG6cVDwu',
    features: [
      '8% platform fee',
      '500 items per sale',
      '10 photos per item',
      '2,000 AI tags per month',
      'Unlimited concurrent sales',
      'Batch operations',
      'Advanced analytics dashboard',
      'Brand kit customization',
      'CSV exports',
      'Priority email support',
    ],
  },
  {
    id: 'TEAMS',
    name: 'TEAMS',
    price: 79,
    period: 'per month',
    description: 'For enterprise operations',
    featured: false,
    stripePrice: 'price_1TDUQtLTUdEUnHOTCEoNL6oz',
    features: [
      '8% platform fee',
      '2,000 items per sale',
      '15 photos per item',
      'Unlimited AI tags',
      'Unlimited concurrent sales',
      'Multi-user team access',
      'API & webhooks',
      'White-label options',
      'Advanced fraud detection',
      'Dedicated account manager',
      'Priority phone support',
    ],
  },
];

const PricingPage = () => {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelledMessage, setCancelledMessage] = useState<string | null>(null);

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
        cancelUrl: `${window.location.origin}/pricing?upgrade=cancelled`,
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

    // User logged in
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
        <meta name="description" content="Choose the perfect plan for your estate sale business." />
        <meta property="og:title" content="Pricing - FindA.Sale" />
        <meta property="og:description" content="Choose the perfect plan for your estate sale business." />
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-4">
              Simple, Transparent Pricing
            </h1>
            <p className="text-xl text-warm-600 dark:text-warm-300">
              Choose the plan that fits your estate sale business
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

          {/* Pricing Tiers */}
          {/* BUG-14: Hide "Your Plan" section for shoppers (users with role USER) */}
          {user?.role === 'USER' ? (
            <div className="mb-12 p-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-center">
              <p className="text-blue-900 dark:text-blue-200 text-lg">
                💙 You have free access to browse all sales! Create an account as an organizer to start managing your estate sales.
              </p>
            </div>
          ) : null}

          <div className="grid md:grid-cols-3 gap-8 mb-12">
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
                    <h3 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-2">
                      {tier.name}
                    </h3>
                    <p className="text-warm-600 dark:text-warm-300 text-sm mb-6">
                      {tier.description}
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
                  SIMPLE is always free, so you can try FindA.Sale without any commitment. PRO and TEAMS are available for a trial on your first month.
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
            </div>

            <div className="mt-8 pt-8 border-t border-warm-200 dark:border-gray-700">
              <p className="text-warm-600 dark:text-warm-300 text-sm">
                Need help choosing a plan? <Link href="/contact" className="text-amber-600 dark:text-amber-400 font-semibold hover:underline">Contact our team</Link>
              </p>
            </div>
          </div>

          {/* Bottom CTA */}
          <div className="mt-12 text-center">
            <p className="text-warm-600 dark:text-warm-300 mb-4">
              Not ready to commit? Start with SIMPLE today.
            </p>
            <Link
              href="/register"
              className="inline-block bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 px-8 rounded-lg transition-all duration-200"
            >
              Create Free Account
            </Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default PricingPage;
