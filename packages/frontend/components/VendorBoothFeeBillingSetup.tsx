/**
 * VendorBoothFeeBillingSetup -- ADR-090 Phase 4 (S-hubs-followup).
 * Lets a vendor save a card on file so their booth's flat, recurring boothFee
 * (rent) can actually be billed by vendorBoothFeeBillingCron.ts. Until this
 * exists, every real booth resolves to PENDING_PAYMENT_METHOD forever -- this
 * was the single biggest concrete blocker to Maple Lake Mall collecting
 * artifactmi's rent (claude_docs/feature-notes/maple-lake-mall-hub-finish-
 * analysis-2026-07-23.md).
 *
 * Card entry follows the same CardElement + confirmCardSetup pattern already
 * established by PosManualCard.tsx (manual card charge) -- this is a SetupIntent
 * (save-for-later) instead of a PaymentIntent (charge-now), otherwise the same
 * shape: fetch a clientSecret from the backend, confirm client-side with Stripe
 * Elements (card data never touches our backend), then tell the backend the
 * setup succeeded so it can persist the resulting PaymentMethod id.
 */

import { useState } from 'react';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { StripeCardElementOptions } from '@stripe/stripe-js';
import api from '../lib/api';

interface VendorBoothFeeBillingSetupProps {
  vendorBoothId: string;
  boothFee: string;
  onConfigured: () => void;
}

type SetupState = 'idle' | 'processing' | 'error';

export default function VendorBoothFeeBillingSetup({
  vendorBoothId,
  boothFee,
  onConfigured,
}: VendorBoothFeeBillingSetupProps) {
  const stripe = useStripe();
  const elements = useElements();

  const [state, setState] = useState<SetupState>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const isDark =
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

  const cardElementOptions: StripeCardElementOptions = {
    style: {
      base: {
        fontSize: '16px',
        color: isDark ? '#f5f5f5' : '#1a1a1a',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        '::placeholder': { color: isDark ? '#9ca3af' : '#6b7280' },
      },
      invalid: { color: '#ef4444' },
    },
    hidePostalCode: false,
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) {
      setErrorMessage('Stripe not loaded. Please reload the page.');
      setState('error');
      return;
    }

    setState('processing');
    setErrorMessage('');

    try {
      const setupResponse = await api.post(`/vendor-booth/${vendorBoothId}/fee-billing/setup-intent`);
      const { clientSecret } = setupResponse.data;

      const cardElement = elements.getElement(CardElement);
      if (!cardElement) throw new Error('Card entry not ready');

      const result = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card: cardElement },
      });

      if (result.error) {
        throw new Error(result.error.message || 'Card setup failed');
      }
      if (!result.setupIntent || result.setupIntent.status !== 'succeeded') {
        throw new Error('Card setup did not complete');
      }

      await api.post(`/vendor-booth/${vendorBoothId}/fee-billing/confirm`, {
        setupIntentId: result.setupIntent.id,
      });

      onConfigured();
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.error || err?.message || 'Failed to save card');
      setState('error');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm text-warm-600 dark:text-warm-400">
        Save a card to auto-pay your ${Number(boothFee).toFixed(2)}/month booth rent. Billed
        automatically each month -- no manual payment needed.
      </p>
      <div className="p-3 border border-warm-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900">
        <CardElement options={cardElementOptions} />
      </div>
      {state === 'error' && errorMessage && (
        <p className="text-xs text-red-600 dark:text-red-400">{errorMessage}</p>
      )}
      <button
        type="submit"
        disabled={!stripe || state === 'processing'}
        className="w-full bg-sage-600 hover:bg-sage-700 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-lg transition-colors"
      >
        {state === 'processing' ? 'Saving card...' : 'Save Card for Auto-Pay'}
      </button>
    </form>
  );
}
