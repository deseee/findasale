import React, { useState, useEffect } from 'react';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import api from '../lib/api';
import { useToast } from './ToastContext';

// Lazy-initialize Stripe on client-side only to avoid SSR errors
let stripePromise: Promise<Stripe | null> | null = null;
const getStripePromise = () => {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
  }
  return stripePromise;
};

// Inner form rendered inside the Elements provider
interface PaymentFormProps {
  price: number;
  onClose: () => void;
  onSuccess: () => void;
  showToast?: (message: string, type?: 'success' | 'error') => void;
}

const PaymentForm = ({ price, onClose, onSuccess, showToast }: PaymentFormProps) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tosAgreed, setTosAgreed] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/shopper`,
      },
      redirect: 'if_required',
    });

    if (error) {
      setErrorMessage(error.message ?? 'Payment failed. Please try again.');
      setIsSubmitting(false);
    } else if (paymentIntent?.id) {
      // Confirm the payment on backend
      try {
        await api.post('/streaks/confirm-huntpass', {
          paymentIntentId: paymentIntent.id,
        });
        showToast?.('Hunt Pass activated! You\'re now earning 2x points.', 'success');
        onSuccess();
      } catch (err: any) {
        setErrorMessage(
          err.response?.data?.message ?? 'Failed to confirm payment. Please contact support.'
        );
        setIsSubmitting(false);
      }
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Benefits section */}
      <div className="mb-5 p-4 bg-purple-50 rounded-lg border border-purple-200">
        <h3 className="font-semibold text-warm-900 mb-3">Hunt Pass Benefits</h3>
        <ul className="space-y-2 text-sm text-warm-700">
          <li className="flex items-start gap-2">
            <span className="text-purple-600 font-bold">✓</span>
            <span>2x points on every action</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-purple-600 font-bold">✓</span>
            <span>Early access to flash deals</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-purple-600 font-bold">✓</span>
            <span>Exclusive Hunt Pass badge</span>
          </li>
        </ul>
      </div>

      {/* Price summary */}
      <div className="mb-4 space-y-1 text-sm">
        <div className="flex justify-between text-warm-600">
          <span>Monthly price</span>
          <span>${price.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-bold text-warm-900 border-t pt-1 mt-1">
          <span>Recurring charge</span>
          <span>${price.toFixed(2)}/month</span>
        </div>
      </div>

      {/* Payment element */}
      <div className="mb-5">
        <PaymentElement />
      </div>

      {errorMessage && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {errorMessage}
        </div>
      )}

      {/* ToS consent */}
      <label className="flex items-start gap-2 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={tosAgreed}
          onChange={(e) => setTosAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-warm-300 accent-purple-600"
          aria-required="true"
        />
        <span className="text-xs text-warm-600 leading-relaxed">
          I agree to the{' '}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-warm-900">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-warm-900">
            Privacy Policy
          </a>
          . This is a recurring monthly subscription that can be cancelled anytime.
        </span>
      </label>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="flex-1 py-2 px-4 border border-warm-300 rounded text-warm-700 hover:bg-warm-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || !elements || isSubmitting || !tosAgreed}
          className="flex-1 py-2 px-4 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Processing...' : `Activate Hunt Pass`}
        </button>
      </div>
    </form>
  );
};

// Outer modal that fetches the payment intent and sets up Elements.
interface HuntPassModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const HuntPassModal = ({ isOpen, onClose, onSuccess }: HuntPassModalProps) => {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const price = 4.99;
  const { showToast } = useToast();

  useEffect(() => {
    if (!isOpen) {
      setClientSecret(null);
      setLoadError(null);
      return;
    }

    const loadIntent = async () => {
      try {
        const response = await api.post('/streaks/activate-huntpass');
        setClientSecret(response.data.clientSecret);
      } catch (err: any) {
        setLoadError(
          err.response?.data?.message ?? 'Could not start Hunt Pass activation. Please try again.'
        );
      }
    };

    loadIntent();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSuccess = () => {
    onSuccess();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-xl font-bold text-warm-900">Upgrade to Hunt Pass</h2>
          <button
            onClick={onClose}
            className="text-warm-400 hover:text-warm-600 text-2xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {loadError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {loadError}
          </div>
        )}

        {!loadError && !clientSecret && (
          <div className="py-8 text-center text-warm-500">Loading payment form...</div>
        )}

        {clientSecret && (
          <Elements stripe={getStripePromise()} options={{ clientSecret }}>
            <PaymentForm
              price={price}
              onClose={onClose}
              onSuccess={handleSuccess}
              showToast={showToast}
            />
          </Elements>
        )}
      </div>
    </div>
  );
};

export default HuntPassModal;
