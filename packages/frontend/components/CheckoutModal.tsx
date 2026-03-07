import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import api from '../lib/api';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

// Inner form rendered inside the Elements provider
interface PaymentFormProps {
  itemTitle: string;
  itemPrice: number;
  platformFee: number;
  onClose: () => void;
  onSuccess: () => void;
}

const PaymentForm = ({ itemTitle, itemPrice, platformFee, onClose, onSuccess }: PaymentFormProps) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tosAgreed, setTosAgreed] = useState(false);

  const total = itemPrice + platformFee;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        // Return URL is required but we handle success inline via webhook
        return_url: `${window.location.origin}/shopper/purchases`,
      },
      redirect: 'if_required',
    });

    if (error) {
      setErrorMessage(error.message ?? 'Payment failed. Please try again.');
      setIsSubmitting(false);
    } else {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-4 p-3 bg-warm-50 rounded-lg">
        <p className="text-sm text-warm-600">Item</p>
        <p className="font-semibold text-warm-900">{itemTitle}</p>
      </div>

      <div className="mb-4 space-y-1 text-sm">
        <div className="flex justify-between text-warm-600">
          <span>Item price</span>
          <span>${itemPrice.toFixed(2)}</span>
        </div>
        <div className="flex justify-between items-center text-warm-600">
          <div className="flex items-center gap-1">
            <span>Platform fee (5%)</span>
            <button
              type="button"
              className="text-xs text-warm-400 hover:text-warm-600 cursor-help"
              title="FindA.Sale's 5% service fee helps us maintain the platform, provide customer support, and improve features for organizers and shoppers."
            >
              ℹ️
            </button>
          </div>
          <span>${platformFee.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-bold text-warm-900 border-t border-warm-300 pt-2 mt-2">
          <span>Total Due</span>
          <span>${total.toFixed(2)}</span>
        </div>
        <p className="text-xs text-warm-500 mt-2">
          No hidden fees. What you see is what you pay.
        </p>
      </div>

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
          className="mt-0.5 h-4 w-4 rounded border-warm-300 accent-amber-600"
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
          . All sales are final.{' '}
          <a href="/contact" target="_blank" rel="noopener noreferrer" className="underline hover:text-warm-900">
            Contact support
          </a>{' '}
          for disputes.
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
          className="flex-1 py-2 px-4 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Processing...' : `Pay $${total.toFixed(2)}`}
        </button>
      </div>
    </form>
  );
};

// Outer modal that fetches the payment intent and sets up Elements.
// Pass either itemId (new purchase) OR purchaseId (resume existing — e.g. auction winner).
interface CheckoutModalProps {
  itemId?: string;
  purchaseId?: string;
  itemTitle: string;
  onClose: () => void;
  onSuccess: () => void;
}

const CheckoutModal = ({ itemId, purchaseId, itemTitle, onClose, onSuccess }: CheckoutModalProps) => {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [itemPrice, setItemPrice] = useState(0);
  const [platformFee, setPlatformFee] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resolvedTitle, setResolvedTitle] = useState(itemTitle);

  useEffect(() => {
    const loadIntent = async () => {
      try {
        let data: any;
        if (purchaseId) {
          // Resume an existing pending purchase (auction winners)
          const response = await api.get(`/stripe/pending-payment/${purchaseId}`);
          data = response.data;
          if (data.itemTitle) setResolvedTitle(data.itemTitle);
        } else if (itemId) {
          // Create a new payment intent (include affiliate attribution if present)
          const affiliateLinkId = typeof window !== 'undefined'
            ? sessionStorage.getItem('affiliateRef') ?? undefined
            : undefined;
          const response = await api.post('/stripe/create-payment-intent', {
            itemId,
            ...(affiliateLinkId ? { affiliateLinkId } : {})
          });
          data = response.data;
        } else {
          setLoadError('Invalid checkout configuration.');
          return;
        }
        setClientSecret(data.clientSecret);
        setItemPrice(data.totalAmount);
        setPlatformFee(data.platformFee);
      } catch (err: any) {
        setLoadError(
          err.response?.data?.message ?? 'Could not start checkout. Please try again.'
        );
      }
    };

    loadIntent();
  }, [itemId, purchaseId]);

  const handleSuccess = () => {
    onSuccess();
  };

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-xl font-bold text-warm-900">Complete Purchase</h2>
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
          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <PaymentForm
              itemTitle={resolvedTitle}
              itemPrice={itemPrice}
              platformFee={platformFee}
              onClose={onClose}
              onSuccess={handleSuccess}
            />
          </Elements>
        )}
      </div>
    </div>
  );
};

export default CheckoutModal;
