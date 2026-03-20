import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';

interface Tier {
  name: string;
  tier: 'SIMPLE' | 'PRO' | 'TEAMS';
  monthlyPrice: number;
  annualPrice: number;
  features: string[];
  ctaText: string;
  disabled?: boolean;
}

const TIERS: Tier[] = [
  {
    name: 'SIMPLE',
    tier: 'SIMPLE',
    monthlyPrice: 0,
    annualPrice: 0,
    features: [
      'Create unlimited sales',
      'Manage item inventory',
      'Item uploads (100/sale)',
      'Email & SMS reminders to buyers',
      'POS integration',
      'AI-powered item tags',
      'Holds/reservations (24-48 hours)',
      'Basic sales analytics',
    ],
    ctaText: 'Current Plan',
    disabled: true,
  },
  {
    name: 'PRO',
    tier: 'PRO',
    monthlyPrice: 29,
    annualPrice: 290,
    features: [
      'Everything in SIMPLE, plus:',
      'Brand Kit (custom colors, fonts, logo)',
      'Flip Report (post-sale analytics PDF)',
      'Command Center (multi-sale dashboard)',
      'Batch operations (edit 100s of items)',
      'Advanced sales analytics & insights',
      'Data export (CSV/ZIP for accounting)',
      'Social media templates (Instagram/Facebook)',
      'Priority support (24h email response)',
      'Custom storefront slug',
    ],
    ctaText: 'Upgrade to PRO',
  },
  {
    name: 'TEAMS',
    tier: 'TEAMS',
    monthlyPrice: 79,
    annualPrice: 790,
    features: [
      'Everything in PRO, plus:',
      'Multi-user team workspace (unlimited seats)',
      'Invite team members by email',
      'Role-based permissions (Admin/Member)',
      'Shared inventory & sales management',
      'Shared brand kit & customization',
      'Team activity audit logs',
      'API access & webhooks',
      'White-label customization options',
      'Dedicated account manager',
    ],
    ctaText: 'Contact Sales',
  },
];

export default function UpgradePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'annual'>('monthly');
  const [loadingPriceId, setLoadingPriceId] = useState<string | null>(null);
  const [currentTier, setCurrentTier] = useState<string>('SIMPLE');

  // Read from JWT
  useEffect(() => {
    if (user?.organizerTier) {
      setCurrentTier(user.organizerTier);
    }
  }, [user]);

  // Handle query params for toast
  useEffect(() => {
    if (router.query.success === 'true') {
      showToast('Welcome to PRO! Your subscription is active.', 'success');
    } else if (router.query.canceled === 'true') {
      showToast('Checkout canceled. Feel free to upgrade anytime.');
    }
  }, [router.query]);

  const handleUpgrade = async (tier: Tier) => {
    if (!user?.id) {
      showToast('Please log in first');
      return;
    }

    if (tier.tier === 'SIMPLE') {
      showToast('You\'re already on the free plan');
      return;
    }

    if (tier.tier === 'TEAMS') {
      // Contact sales
      window.location.href = 'mailto:patrick@finda.sale?subject=FindA.Sale TEAMS Tier Inquiry';
      return;
    }

    // For PRO: determine price ID
    let priceId: string | null = null;
    if (billingInterval === 'monthly') {
      priceId = process.env.NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID || '';
    } else {
      priceId = process.env.NEXT_PUBLIC_STRIPE_PRO_ANNUAL_PRICE_ID || '';
    }

    if (!priceId) {
      showToast('Price configuration missing. Please contact support.', 'error');
      return;
    }

    setLoadingPriceId(priceId);

    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, billingInterval }),
      });

      if (!response.ok) {
        const data = await response.json();
        showToast(data.message || 'Failed to create checkout session', 'error');
        setLoadingPriceId(null);
        return;
      }

      const { url } = await response.json();
      if (url) {
        window.location.href = url;
      }
    } catch (error) {
      console.error('Checkout error:', error);
      showToast('Failed to start checkout', 'error');
      setLoadingPriceId(null);
    }
  };

  const annualSavingsPercent = 20; // ($290 vs $348 = 20% savings)

  return (
    <>
      <Head>
        <title>Choose Your Plan | FindA.Sale</title>
        <meta name="description" content="Upgrade to PRO and unlock advanced organizer tools" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-sage-50 to-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="font-fraunces text-4xl md:text-5xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              Choose Your Plan
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Every plan includes everything you need to run your estate sales successfully.
            </p>
            <Link
              href="/organizer/pro-features"
              className="inline-block mt-4 text-sage-600 hover:text-sage-700 font-semibold underline"
            >
              Explore PRO Features →
            </Link>
          </div>

          {/* Billing Toggle */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-1">
              <button
                onClick={() => setBillingInterval('monthly')}
                className={`px-6 py-2 rounded-md font-medium transition ${
                  billingInterval === 'monthly'
                    ? 'bg-sage-600 text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:text-gray-900'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingInterval('annual')}
                className={`px-6 py-2 rounded-md font-medium transition relative ${
                  billingInterval === 'annual'
                    ? 'bg-sage-600 text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:text-gray-900'
                }`}
              >
                Annual
                {billingInterval === 'annual' && (
                  <span className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-2 py-1 rounded text-xs font-semibold whitespace-nowrap">
                    Save 20%
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Trial Callout */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-8 max-w-2xl mx-auto">
            <p className="text-center text-blue-900 font-medium">
              🎉 7-day free trial on PRO — no credit card charged until day 8
            </p>
          </div>

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {TIERS.map((tier) => (
              <div
                key={tier.tier}
                className={`rounded-xl border-2 overflow-hidden transition ${
                  currentTier === tier.tier
                    ? 'border-sage-600 bg-sage-50'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-sage-400'
                }`}
              >
                {/* Badge for current plan */}
                {currentTier === tier.tier && (
                  <div className="bg-sage-600 text-white py-2 px-4 text-center font-semibold">
                    ✓ Current Plan
                  </div>
                )}

                {/* Card Content */}
                <div className="p-8">
                  <h2 className="font-fraunces text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                    {tier.name}
                  </h2>

                  {/* Price */}
                  <div className="mb-6">
                    {tier.tier === 'SIMPLE' ? (
                      <p className="text-4xl font-bold text-sage-600">Free</p>
                    ) : tier.tier === 'TEAMS' ? (
                      <div>
                        <p className="text-4xl font-bold text-gray-900 dark:text-gray-100">
                          ${billingInterval === 'monthly' ? tier.monthlyPrice : (tier.annualPrice / 12).toFixed(0)}/mo
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Billed {billingInterval === 'annual' ? 'annually' : 'monthly'}</p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-4xl font-bold text-gray-900 dark:text-gray-100">
                          ${billingInterval === 'monthly' ? tier.monthlyPrice : (tier.annualPrice / 12).toFixed(0)}/mo
                        </p>
                        {billingInterval === 'annual' && (
                          <p className="text-sm text-green-600 font-semibold">
                            Save ${(tier.monthlyPrice * 12 - tier.annualPrice).toFixed(0)}/year
                          </p>
                        )}
                        <p className="text-sm text-gray-600 dark:text-gray-400">Billed {billingInterval === 'annual' ? 'annually' : 'monthly'}</p>
                      </div>
                    )}
                  </div>

                  {/* CTA Button */}
                  {tier.tier === 'TEAMS' ? (
                    currentTier === tier.tier ? (
                      <Link href="/organizer/workspace">
                        <a className="block w-full bg-sage-600 text-white py-3 px-4 rounded-lg font-semibold text-center hover:bg-sage-700 transition mb-8">
                          Manage Team Workspace
                        </a>
                      </Link>
                    ) : (
                      <a
                        href="mailto:patrick@finda.sale?subject=FindA.Sale TEAMS Tier Inquiry"
                        className="block w-full bg-gray-900 text-white py-3 px-4 rounded-lg font-semibold text-center hover:bg-black transition mb-8"
                      >
                        Contact Sales
                      </a>
                    )
                  ) : (
                    <button
                      onClick={() => handleUpgrade(tier)}
                      disabled={tier.disabled || loadingPriceId !== null}
                      className={`w-full py-3 px-4 rounded-lg font-semibold text-center transition mb-8 ${
                        currentTier === tier.tier
                          ? 'bg-gray-100 text-gray-700 dark:text-gray-300 cursor-default'
                          : 'bg-sage-600 text-white hover:bg-sage-700 disabled:opacity-50 disabled:cursor-not-allowed'
                      }`}
                    >
                      {loadingPriceId === (billingInterval === 'monthly' ? process.env.NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID : process.env.NEXT_PUBLIC_STRIPE_PRO_ANNUAL_PRICE_ID)
                        ? 'Loading...'
                        : currentTier === tier.tier
                        ? 'Current Plan'
                        : 'Start Free Trial'}
                    </button>
                  )}

                  {/* Features */}
                  <div className="space-y-4">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">Includes:</h3>
                    <ul className="space-y-3">
                      {tier.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start">
                          <span className="text-sage-600 mr-3 font-bold">✓</span>
                          <span className="text-gray-700 dark:text-gray-300">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* FAQ Section */}
          <div className="mt-16 max-w-2xl mx-auto">
            <h2 className="font-fraunces text-3xl font-bold text-gray-900 dark:text-gray-100 mb-8 text-center">
              Questions?
            </h2>
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Can I switch plans anytime?</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Yes! You can upgrade or downgrade anytime. If you downgrade, your plan will remain active until the end of your current billing period.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">What happens after my free trial?</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  After your 7-day free trial ends, we'll charge your card for your subscription. You can cancel anytime before the trial ends.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Do you offer refunds?</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  If you're not satisfied with your purchase, contact us within 7 days for a full refund.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
