import React, { useState, useEffect } from 'react';

interface ACHPayoutButtonProps {
  consignorId: string;
  consignorName: string;
  settlementId: string;
  amountCents: number;
  subscriptionTier?: string;
  disabled?: boolean;
}

interface ConsignorStatus {
  stripeOnboarded: boolean;
  stripeAccountId: string | null;
  accountStatus?: {
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    status: string;
  };
}

const ACHPayoutButton: React.FC<ACHPayoutButtonProps> = ({
  consignorId,
  consignorName,
  settlementId,
  amountCents,
  subscriptionTier = 'SIMPLE',
  disabled = false,
}) => {
  const [status, setStatus] = useState<ConsignorStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchConsignorStatus();
  }, [consignorId]);

  const fetchConsignorStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/stripe-connect/status/${consignorId}`);
      if (!response.ok) throw new Error('Failed to fetch status');
      const data = await response.json();
      setStatus(data);
    } catch (err) {
      console.error('Error fetching consignor status:', err);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  const handleInviteToACH = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/stripe-connect/onboard/${consignorId}`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to generate onboarding link');
      const data = await response.json();

      // Open onboarding in new tab
      window.open(data.onboardingUrl, '_blank');

      // Refresh status after user returns
      setTimeout(() => {
        fetchConsignorStatus();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initiate onboarding');
    } finally {
      setLoading(false);
    }
  };

  const handlePayConsignor = async () => {
    try {
      setProcessing(true);
      setError(null);

      const response = await fetch(`/api/stripe-connect/pay/${consignorId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settlementId,
          amountCents,
          description: `Consignor payout for ${consignorName}`,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to process payout');
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);

      // Refresh status
      fetchConsignorStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process payout');
    } finally {
      setProcessing(false);
    }
  };

  // TEAMS tier check
  if (subscriptionTier !== 'TEAMS') {
    return (
      <div className="text-xs text-gray-500 italic">
        ACH payouts available on TEAMS tier
      </div>
    );
  }

  // Not onboarded yet
  if (!status?.stripeOnboarded) {
    return (
      <button
        onClick={handleInviteToACH}
        disabled={loading || disabled}
        className="px-3 py-2 bg-yellow-100 text-yellow-700 rounded text-sm hover:bg-yellow-200 disabled:opacity-50 transition"
      >
        {loading ? 'Loading...' : 'Invite to ACH'}
      </button>
    );
  }

  // Ready to pay
  return (
    <div className="space-y-2">
      {error && (
        <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
          {error}
        </div>
      )}
      {success && (
        <div className="text-xs text-green-600 bg-green-50 p-2 rounded">
          ✓ Payout processed successfully
        </div>
      )}
      <button
        onClick={handlePayConsignor}
        disabled={processing || disabled}
        className="px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50 transition"
      >
        {processing ? 'Processing...' : `Pay $${(amountCents / 100).toFixed(2)} via ACH`}
      </button>
    </div>
  );
};

export default ACHPayoutButton;
