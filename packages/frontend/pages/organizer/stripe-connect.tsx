import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useOrganizerTier } from '../../hooks/useOrganizerTier';

interface ConsignorStatus {
  consignorId: string;
  name: string;
  email?: string;
  stripeOnboarded: boolean;
  accountStatus?: {
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    status: string;
  };
}

const ACHPayoutsPage: React.FC = () => {
  const router = useRouter();
  const { canAccess, tierLoading } = useOrganizerTier();
  const [consignors, setConsignors] = useState<ConsignorStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { consignorId, success, refresh } = router.query;

  useEffect(() => {
    // If returning from Stripe, update that consignor's status
    if (consignorId && (success || refresh)) {
      handleReturnFromStripe(consignorId as string);
    }

    // Load all consignors for workspace
    loadConsignors();
  }, []);

  const handleReturnFromStripe = async (cId: string) => {
    try {
      const response = await fetch(`/api/stripe-connect/return/${cId}`, {
        method: 'GET',
      });
      if (!response.ok) throw new Error('Failed to verify onboarding');
      const data = await response.json();
      console.log('Onboarding status updated:', data);
    } catch (err) {
      console.error('Error verifying onboarding:', err);
    }
  };

  const loadConsignors = async () => {
    try {
      setLoading(true);
      // This endpoint should be created in a consignor controller
      // For now, we'll fetch from settlement hub context
      const response = await fetch('/api/consignors', {
        method: 'GET',
      });
      if (!response.ok) throw new Error('Failed to load consignors');
      const data = await response.json();
      setConsignors(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load consignors');
    } finally {
      setLoading(false);
    }
  };

  const handleInviteToACH = async (cId: string) => {
    try {
      const response = await fetch(`/api/stripe-connect/onboard/${cId}`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to generate onboarding link');
      const data = await response.json();

      // Open onboarding in new tab
      window.open(data.onboardingUrl, '_blank');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite consignor');
    }
  };

  // Show loading state while tier is being determined
  if (tierLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  // Gate: TEAMS tier only
  if (!canAccess('TEAMS')) {
    return (
      <>
        <Head>
          <title>Upgrade to TEAMS - FindA.Sale</title>
        </Head>
        <div className="min-h-screen bg-gray-50 py-12 px-4">
          <div className="max-w-2xl mx-auto">
            <div className="mb-8">
              <Link href="/organizer/settlement">
                <a className="text-blue-600 hover:text-blue-700 text-sm mb-4 inline-block">
                  ← Back to Settlement Hub
                </a>
              </Link>
            </div>

            <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-8 text-center">
              <h2 className="text-2xl font-bold text-amber-900 mb-3">TEAMS Subscription Required</h2>
              <p className="text-amber-800 mb-6">
                ACH consignor payouts are available only for TEAMS tier subscribers.
                Upgrade to unlock this feature and manage consignor payments at scale.
              </p>
              <Link href="/organizer/subscription">
                <a className="inline-block px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition font-medium">
                  Upgrade to TEAMS
                </a>
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Loading consignors...</div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>ACH Consignor Payouts - FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <Link href="/organizer/settlement">
              <a className="text-blue-600 hover:text-blue-700 text-sm mb-4 inline-block">
                ← Back to Settlement Hub
              </a>
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">ACH Consignor Payouts</h1>
            <p className="text-gray-600">
              Manage ACH bank transfers for your consignors. Bank transfers are processed within 1-2 business days.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}

          {/* Success message */}
          {success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
              ✓ Consignor onboarding completed! They can now receive ACH payouts.
            </div>
          )}

          {/* Consignors list */}
          {consignors.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <p className="text-gray-600 mb-4">No consignors yet.</p>
              <Link href="/organizer/settlement">
                <a className="text-blue-600 hover:text-blue-700">Go to Settlement Hub</a>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {consignors.map((consignor) => (
                <div
                  key={consignor.consignorId}
                  className="bg-white rounded-lg border border-gray-200 p-6 flex items-center justify-between"
                >
                  <div>
                    <h3 className="font-semibold text-gray-900">{consignor.name}</h3>
                    {consignor.email && (
                      <p className="text-sm text-gray-600">{consignor.email}</p>
                    )}
                    <div className="mt-2">
                      {consignor.stripeOnboarded ? (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                          ✓ Ready for ACH Payouts
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                          ⚠ Pending Onboarding
                        </span>
                      )}
                    </div>
                  </div>

                  {!consignor.stripeOnboarded && (
                    <button
                      onClick={() => handleInviteToACH(consignor.consignorId)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                    >
                      Invite to ACH
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Info box */}
          <div className="mt-12 bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="font-semibold text-blue-900 mb-2">How ACH Payouts Work</h3>
            <ul className="text-sm text-blue-800 space-y-2">
              <li>• Consignors must complete their Stripe account onboarding first</li>
              <li>• Payments are processed as ACH bank transfers (1-2 business days)</li>
              <li>• Consignors receive direct deposits to their linked bank account</li>
              <li>• Requires TEAMS tier subscription</li>
            </ul>
          </div>

          {/* Compliance notes */}
          <div className="mt-6 bg-gray-100 rounded-lg p-4 text-xs text-gray-600">
            <p className="mb-2">
              <strong>Compliance:</strong> Stripe will require identity verification for consignors at $500 lifetime threshold.
              1099-NEC tax reporting required for consignors earning $600+/year.
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default ACHPayoutsPage;
