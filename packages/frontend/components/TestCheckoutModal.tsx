import React, { useState, useEffect } from 'react';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import api from '../lib/api';

// Must use the TEST publishable key — clientSecret comes from a test-mode PaymentIntent.
// Live key + test clientSecret = mismatch error. Set NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY on Vercel.
let stripePromise: Promise<Stripe | null> | null = null;
const getStripePromise = () => {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY!);
  }
  return stripePromise;
};

interface TestPaymentFormProps {
  saleId: string;
  onClose: () => void;
  onDone: () => void;
}

const TestPaymentForm = ({ saleId, onClose, onDone }: TestPaymentFormProps) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/organizer/pos`,
      },
      redirect: 'if_required',
    });

    if (error) {
      setErrorMessage(error.message ?? 'Payment failed. Please try again.');
      setIsSubmitting(false);
      return;
    }

    // Auto-check the checklist item
    try {
      await api.patch(`/checklist/${saleId}`, {
        itemId: 'pre_in_app_payment',
        completed: true,
      });
    } catch {
      // Non-fatal — checklist update failure shouldn't block success state
    }

    setSucceeded(true);
    setTimeout(() => {
      onDone();
    }, 1800);
  };

  if (succeeded) {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <span className="text-4xl">✓</span>
        <p className="text-green-700 dark:text-green-300 font-semibold text-base">In-app payment flow verified</p>
        <p className="text-xs text-warm-500 dark:text-warm-400 text-center">
          Your Stripe integration handled the full checkout — card entry, confirmation, and processing — exactly as a shopper would experience it.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Test card hint */}
      <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2.5">
        <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-0.5">Test card</p>
        <p className="font-mono text-sm text-amber-900 dark:text-amber-200 tracking-wider">4242 4242 4242 4242</p>
        <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">Any future expiry &middot; Any 3-digit CVC &middot; Any ZIP</p>
      </div>

      <PaymentElement />

      {errorMessage && (
        <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-2 px-4 border border-warm-300 dark:border-gray-600 rounded text-warm-700 dark:text-warm-300 hover:bg-warm-50 dark:hover:bg-gray-700 text-sm transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || isSubmitting}
          className="flex-1 py-2 px-4 rounded bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-sm font-semibold transition"
        >
          {isSubmitting ? 'Processing…' : 'Pay $1.00 Test'}
        </button>
      </div>
    </form>
  );
};

interface TestCheckoutModalProps {
  saleId: string;
  onClose: () => void;
  onDone: () => void;
}

const TestCheckoutModal = ({ saleId, onClose, onDone }: TestCheckoutModalProps) => {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const fetchIntent = async () => {
      try {
        const res = await api.post('/stripe/test-in-app-intent', { saleId });
        setClientSecret(res.data.clientSecret);
      } catch (err: any) {
        setLoadError(err?.response?.data?.message || 'Could not start test session. Check your Stripe connection.');
      }
    };
    fetchIntent();
  }, [saleId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-base font-semibold text-warm-900 dark:text-warm-100">Test In-App Checkout</h2>
            <p className="text-xs text-warm-500 dark:text-warm-400 mt-0.5">This is the exact form your shoppers see — $1.00, no real charge</p>
          </div>
          <button
            onClick={onClose}
            className="text-warm-400 hover:text-warm-600 dark:text-warm-500 dark:hover:text-warm-300 text-2xl leading-none ml-4"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {loadError && (
          <div className="text-sm text-red-600 dark:text-red-400 py-4 text-center">{loadError}</div>
        )}

        {!clientSecret && !loadError && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {clientSecret && (
          <Elements
            stripe={getStripePromise()}
            options={{ clientSecret, appearance: { theme: 'stripe' } }}
          >
            <TestPaymentForm saleId={saleId} onClose={onClose} onDone={onDone} />
          </Elements>
        )}
      </div>
    </div>
  );
};

export default TestCheckoutModal;
