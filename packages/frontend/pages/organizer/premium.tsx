/**
 * Organizer Premium Tier Page
 *
 * Landing/overview page for premium tier offerings.
 * Shows current tier, benefits, tier comparison table,
 * and upgrade call-to-action.
 */

import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import { useOrganizerTier } from '../../hooks/useOrganizerTier';
import { useSubscription } from '../../hooks/useSubscription';
import TierComparisonTable from '../../components/TierComparisonTable';
import PremiumCTA from '../../components/PremiumCTA';
import Skeleton from '../../components/Skeleton';

const OrganizerPremiumPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { tier } = useOrganizerTier();
  const { data: subscription, isLoading: subLoading } = useSubscription();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Redirect if not authenticated or not an organizer
  if (!authLoading && (!user || user.role !== 'ORGANIZER')) {
    router.push('/login');
    return null;
  }

  const isLoading = !isClient || authLoading || subLoading;

  if (isLoading) {
    return (
      <>
        <Head>
          <title>Premium Plans | FindA.Sale</title>
        </Head>
        <div className="min-h-screen bg-white py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="space-y-8">
              <Skeleton className="h-12 w-64" />
              <Skeleton className="h-6 w-96" />
              <div className="grid grid-cols-3 gap-4 mt-8">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-48 w-full" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  const tierInfo: Record<string, { label: string; description: string; price: string }> = {
    SIMPLE: {
      label: 'Free',
      description: 'Essential tools for getting started with estate sales',
      price: '$0/month',
    },
    PRO: {
      label: 'Professional',
      description: 'Advanced tools for serious organizers',
      price: '$29/month',
    },
    TEAMS: {
      label: 'Teams',
      description: 'Collaboration and enterprise features',
      price: '$79/month',
    },
  };

  const currentTierInfo = tierInfo[tier] || tierInfo.SIMPLE;

  return (
    <>
      <Head>
        <title>Premium Plans | FindA.Sale</title>
        <meta name="description" content="Upgrade your FindA.Sale organizer account with premium features and tools" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-white via-sage-50 to-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-16">
            <h1 className="font-fraunces text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
              Premium Plans for Organizers
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Choose the perfect plan to manage your estate sales efficiently.
              Unlock powerful tools, analytics, and support as you scale.
            </p>
          </div>

          {/* Current Tier Badge */}
          <div className="text-center mb-12">
            <div className="inline-block bg-white border-2 border-sage-200 rounded-lg px-6 py-4 shadow-sm">
              <p className="text-sm text-gray-600 mb-1">Current Plan</p>
              <p className="text-2xl font-bold text-gray-900">{currentTierInfo.label}</p>
              {subscription?.status && (
                <p className="text-xs text-gray-500 mt-2">
                  Status: <span className="capitalize font-medium">{subscription.status}</span>
                </p>
              )}
            </div>
          </div>

          {/* Premium CTA (if on SIMPLE) */}
          {tier === 'SIMPLE' && (
            <div className="mb-16">
              <PremiumCTA />
            </div>
          )}

          {/* Tier Comparison Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mb-16">
            <h2 className="font-fraunces text-3xl font-bold text-gray-900 mb-8 text-center">
              Compare All Plans
            </h2>
            <TierComparisonTable currentTier={tier} />
          </div>

          {/* Tier Benefits Detail Sections */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
            {/* SIMPLE */}
            <div className={`rounded-lg border-2 p-8 transition ${
              tier === 'SIMPLE'
                ? 'border-sage-600 bg-sage-50 shadow-lg'
                : 'border-gray-200 bg-white'
            }`}>
              <h3 className="font-fraunces text-2xl font-bold text-gray-900 mb-2">SIMPLE</h3>
              <p className="text-3xl font-bold text-gray-900 mb-1">Free</p>
              <p className="text-sm text-gray-600 mb-6">Perfect for getting started</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-sage-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-gray-700">Unlimited sales & inventory</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-sage-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-gray-700">100 items per sale</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-sage-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-gray-700">Basic analytics</span>
                </li>
              </ul>
              {tier !== 'SIMPLE' && (
                <p className="text-sm text-gray-600">You have a higher plan active</p>
              )}
            </div>

            {/* PRO */}
            <div className={`rounded-lg border-2 p-8 transition ${
              tier === 'PRO'
                ? 'border-sage-600 bg-sage-50 shadow-lg'
                : 'border-gray-200 bg-white'
            }`}>
              <h3 className="font-fraunces text-2xl font-bold text-gray-900 mb-2">PRO</h3>
              <p className="text-3xl font-bold text-gray-900 mb-1">$29</p>
              <p className="text-sm text-gray-600 mb-6">per month</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-sage-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-gray-700">Everything in SIMPLE</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-sage-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-gray-700">500 items per sale</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-sage-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-gray-700">Advanced analytics & reports</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-sage-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-gray-700">Data export & integration</span>
                </li>
              </ul>
              {tier === 'PRO' ? (
                <Link
                  href="/organizer/subscription"
                  className="block w-full text-center bg-sage-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-sage-700 transition"
                >
                  Manage Plan
                </Link>
              ) : (
                <Link
                  href="/organizer/upgrade"
                  className="block w-full text-center bg-sage-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-sage-700 transition"
                >
                  Upgrade to PRO
                </Link>
              )}
            </div>

            {/* TEAMS */}
            <div className={`rounded-lg border-2 p-8 transition ${
              tier === 'TEAMS'
                ? 'border-sage-600 bg-sage-50 shadow-lg'
                : 'border-gray-200 bg-white'
            }`}>
              <h3 className="font-fraunces text-2xl font-bold text-gray-900 mb-2">TEAMS</h3>
              <p className="text-3xl font-bold text-gray-900 mb-1">$79</p>
              <p className="text-sm text-gray-600 mb-6">per month</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-sage-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-gray-700">Everything in PRO</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-sage-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-gray-700">Unlimited items & photos</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-sage-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-gray-700">Multi-user team workspace</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-sage-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-gray-700">Dedicated support</span>
                </li>
              </ul>
              {tier === 'TEAMS' ? (
                <Link
                  href="/organizer/subscription"
                  className="block w-full text-center bg-sage-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-sage-700 transition"
                >
                  Manage Plan
                </Link>
              ) : (
                <a
                  href="mailto:support@finda.sale?subject=TEAMS%20Plan%20Interest"
                  className="block w-full text-center bg-sage-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-sage-700 transition"
                >
                  Contact Sales
                </a>
              )}
            </div>
          </div>

          {/* FAQ Section */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
            <h2 className="font-fraunces text-3xl font-bold text-gray-900 mb-8">
              Frequently Asked Questions
            </h2>

            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Can I upgrade or downgrade anytime?
                </h3>
                <p className="text-gray-600">
                  Yes! You can upgrade or downgrade your plan at any time. Changes take effect at your next billing cycle. If you downgrade, you'll receive a prorated credit.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  What payment methods do you accept?
                </h3>
                <p className="text-gray-600">
                  We accept all major credit cards (Visa, Mastercard, American Express) via Stripe. Annual plans receive a 2-month discount compared to monthly billing.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Do you offer refunds?
                </h3>
                <p className="text-gray-600">
                  We offer a 14-day refund guarantee if you're not satisfied. After that, you can cancel anytime without penalty.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  What's included in TEAMS plan?
                </h3>
                <p className="text-gray-600">
                  TEAMS includes everything in PRO, plus multi-user collaboration, unlimited photos per item, and dedicated account manager support.
                </p>
              </div>
            </div>
          </div>

          {/* Bottom CTA */}
          <div className="mt-16 text-center">
            <p className="text-gray-600 mb-4">Ready to get started?</p>
            <div className="flex flex-wrap justify-center gap-4">
              {tier === 'SIMPLE' && (
                <Link
                  href="/organizer/upgrade"
                  className="inline-block bg-sage-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-sage-700 transition"
                >
                  Upgrade Now
                </Link>
              )}
              <Link
                href="/organizer/dashboard"
                className="inline-block bg-white text-sage-600 border-2 border-sage-600 px-8 py-3 rounded-lg font-semibold hover:bg-sage-50 transition"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default OrganizerPremiumPage;
