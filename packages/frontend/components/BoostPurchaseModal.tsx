/**
 * BoostPurchaseModal — Dual-rail boost purchase UI
 * Phase 2b: XP rail (instant) or Stripe rail (PaymentElement flow)
 *
 * Usage:
 *   <BoostPurchaseModal
 *     boostType="SALE_BUMP"
 *     targetType="SALE"
 *     targetId={saleId}
 *     onClose={() => setShowBoostModal(false)}
 *     onSuccess={() => refetch()}
 *   />
 */

import React, { useState, useEffect, useCallback } from 'react';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import api from '../lib/api';
import { useToast } from './ToastContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type PaymentRail = 'XP' | 'STRIPE';

interface BoostQuote {
  boostType: string;
  xpCost: number;
  stripeAmountCents: number;
  stripeAmountDollars: string;
  durationDays: number;
  cashRailAvailable: boolean;
  label: string;
  description: string;
  userXpBalance: number;
  canAffordXp: boolean;
}

interface BoostPurchaseModalProps {
  boostType: string;
  targetType?: string;
  targetId?: string;
  durationDays?: number;
  onClose: () => void;
  onSuccess?: () => void;
}

// ─── Stripe lazy init ─────────────────────────────────────────────────────────

let stripePromise: Promise<Stripe | null> | null = null;
const getStripePromise = () => {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
  }
  return stripePromise;
};

// ─── Stripe inner form ────────────────────────────────────────────────────────

interface StripePayFormProps {
  quote: BoostQuote;
  boostType: string;
  targetType?: string;
  targetId?: string;
  durationDays?: number;
  onSuccess: () => void;
  onCancel: () => void;
}

const StripePayForm = ({
  quote,
  boostType,
  targetType,
  targetId,
  durationDays,
  onSuccess,
  onCancel,
}: StripePayFormProps) => {
  const stripe = useStripe();
  const elements = useElements();
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/shopper` },
      redirect: 'if_required',
    });

    if (error) {
      setErrorMessage(error.message ?? 'Payment failed. Please try again.');
      setIsSubmitting(false);
      return;
    }

    if (paymentIntent?.status === 'succeeded') {
      showToast(`${quote.label} activated!`, 'success');
      onSuccess();
    } else {
      setErrorMessage('Payment is processing. Your boost will activate shortly.');
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-blue-800 dark:text-blue-200">
        <p>
          You will be charged <strong>${quote.stripeAmountDollars}</strong> for {quote.label}.
        </p>
        {quote.durationDays > 0 && quote.durationDays < 999 && (
          <p className="mt-1 text-xs text-blue-600 dark:text-blue-300">
            Active for {quote.durationDays} day{quote.durationDays !== 1 ? 's' : ''} after payment confirms.
          </p>
        )}
      </div>

      <PaymentElement />

      {errorMessage && (
        <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !stripe}
          className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {isSubmitting ? 'Processing…' : `Pay $${quote.stripeAmountDollars}`}
        </button>
      </div>
    </form>
  );
};

// ─── Main modal ────────────────────────────────────────────────────────────────

export default function BoostPurchaseModal({
  boostType,
  targetType,
  targetId,
  durationDays,
  onClose,
  onSuccess,
}: BoostPurchaseModalProps) {
  const { showToast } = useToast();
  const [quote, setQuote] = useState<BoostQuote | null>(null);
  const [rail, setRail] = useState<PaymentRail>('XP');
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [undoSeconds, setUndoSeconds] = useState(300); // 5-min undo window
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch quote on mount
  useEffect(() => {
    const fetchQuote = async () => {
      setLoading(true);
      try {
        const res = await api.post('/boosts/quote', { boostType, durationDays });
        const q: BoostQuote = res.data;
        setQuote(q);
        // Default to XP if affordable, otherwise Stripe
        setRail(q.canAffordXp ? 'XP' : q.cashRailAvailable ? 'STRIPE' : 'XP');
      } catch (err: unknown) {
        setError('Unable to load boost pricing. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchQuote();
  }, [boostType, durationDays]);

  // 5-min undo countdown after success
  useEffect(() => {
    if (!success) return;
    if (undoSeconds <= 0) return;
    const t = setInterval(() => setUndoSeconds((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [success, undoSeconds]);

  const handleXpPurchase = async () => {
    if (!quote) return;
    setPurchasing(true);
    setError(null);
    try {
      await api.post('/boosts/purchase', {
        boostType,
        targetType,
        targetId,
        paymentMethod: 'XP',
        durationDays,
      });
      setSuccess(true);
      showToast(`${quote.label} activated! −${quote.xpCost} XP`, 'success');
      onSuccess?.();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Purchase failed. Please try again.';
      setError(msg);
    } finally {
      setPurchasing(false);
    }
  };

  const handleStripePurchase = async () => {
    if (!quote) return;
    setPurchasing(true);
    setError(null);
    try {
      const res = await api.post('/boosts/purchase', {
        boostType,
        targetType,
        targetId,
        paymentMethod: 'STRIPE',
        durationDays,
      });
      setClientSecret(res.data.clientSecret ?? null);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to start payment. Please try again.';
      setError(msg);
    } finally {
      setPurchasing(false);
    }
  };

  const formatSeconds = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-warm-100">
            {loading ? 'Loading…' : quote?.label ?? 'Boost'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading pricing…</div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm mb-4">
            {error}
          </div>
        )}

        {/* Success state */}
        {success && (
          <div className="text-center py-4">
            <div className="text-4xl mb-2">🚀</div>
            <p className="font-semibold text-gray-900 dark:text-warm-100 mb-1">Boost activated!</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{quote?.description}</p>
            {undoSeconds > 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                Undo available for {formatSeconds(undoSeconds)}
              </p>
            )}
            <button
              onClick={onClose}
              className="px-6 py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Done
            </button>
          </div>
        )}

        {/* Pricing + purchase UI */}
        {!loading && !success && quote && !clientSecret && (
          <div className="space-y-4">
            {/* Description */}
            <p className="text-sm text-gray-600 dark:text-gray-400">{quote.description}</p>

            {/* Rail selector */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setRail('XP')}
                disabled={!quote.canAffordXp}
                className={`p-3 rounded-lg border text-sm font-medium transition-colors ${
                  rail === 'XP'
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                    : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500'
                } ${!quote.canAffordXp ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="text-lg font-bold">{quote.xpCost} XP</div>
                {!quote.canAffordXp && (
                  <div className="text-xs mt-0.5">Need {quote.xpCost - quote.userXpBalance} more</div>
                )}
                {quote.canAffordXp && (
                  <div className="text-xs mt-0.5 text-gray-400 dark:text-gray-500">
                    Balance: {quote.userXpBalance} XP
                  </div>
                )}
              </button>

              <button
                onClick={() => setRail('STRIPE')}
                disabled={!quote.cashRailAvailable}
                className={`p-3 rounded-lg border text-sm font-medium transition-colors ${
                  rail === 'STRIPE'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500'
                } ${!quote.cashRailAvailable ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="text-lg font-bold">${quote.stripeAmountDollars}</div>
                <div className="text-xs mt-0.5 text-gray-400 dark:text-gray-500">Credit card</div>
              </button>
            </div>

            {/* XP confirm */}
            {rail === 'XP' && (
              <button
                onClick={handleXpPurchase}
                disabled={purchasing || !quote.canAffordXp}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                {purchasing ? 'Activating…' : `Spend ${quote.xpCost} XP`}
              </button>
            )}

            {/* Stripe — click to load PaymentElement */}
            {rail === 'STRIPE' && (
              <button
                onClick={handleStripePurchase}
                disabled={purchasing || !quote.cashRailAvailable}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                {purchasing ? 'Loading…' : `Pay $${quote.stripeAmountDollars}`}
              </button>
            )}

            {/* Transparency */}
            <p className="text-xs text-center text-gray-400 dark:text-gray-500">
              XP cannot be exchanged for cash. No real-money purchase required to earn XP.
            </p>
          </div>
        )}

        {/* Stripe PaymentElement flow */}
        {!loading && !success && clientSecret && quote && (
          <Elements
            stripe={getStripePromise()}
            options={{
              clientSecret,
              appearance: { theme: 'stripe' },
            }}
          >
            <StripePayForm
              quote={quote}
              boostType={boostType}
              targetType={targetType}
              targetId={targetId}
              durationDays={durationDays}
              onSuccess={() => {
                setSuccess(true);
                onSuccess?.();
              }}
              onCancel={() => setClientSecret(null)}
            />
          </Elements>
        )}
      </div>
    </div>
  );
}
