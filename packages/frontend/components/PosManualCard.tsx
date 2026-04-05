/**
 * PosManualCard — Manual Card Entry for Card-Not-Present Payments
 *
 * Allows organizer to enter shopper's card details directly (no Stripe Terminal reader needed).
 * Uses Stripe Elements (CardElement) for PCI-compliant card tokenization.
 * Features: CNP fee notice, card input, payment processing, success/error states
 *
 * States: idle (form), processing (charging), success (receipt), error (decline message)
 */

import { useState } from 'react';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { StripeCardElementOptions } from '@stripe/stripe-js';
import api from '../lib/api';

interface PosManualCardProps {
  cartTotal: number;
  cart: Array<{ itemId?: string; title: string; amount: number }>;
  selectedSaleId: string;
  buyerEmail: string;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

type ManualCardState = 'idle' | 'processing' | 'success' | 'error';

interface PaymentIntentResponse {
  clientSecret: string;
  amount: number;
  cnpFeeAmount: number;
}

export default function PosManualCard({
  cartTotal,
  cart,
  selectedSaleId,
  buyerEmail,
  onSuccess,
  onError,
}: PosManualCardProps) {
  const stripe = useStripe();
  const elements = useElements();

  const [state, setState] = useState<ManualCardState>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [lastFourDigits, setLastFourDigits] = useState<string>('');
  const [totalWithFee, setTotalWithFee] = useState<number>(cartTotal);
  const [cnpFeeAmount, setCnpFeeAmount] = useState<number>(0);
  const [successTimestamp, setSuccessTimestamp] = useState<string>('');

  // Stripe Elements styling (dark mode aware)
  const isDark = typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;

  const cardElementOptions: StripeCardElementOptions = {
    style: {
      base: {
        fontSize: '16px',
        color: isDark ? '#f5f5f5' : '#1a1a1a',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        '::placeholder': {
          color: isDark ? '#9ca3af' : '#6b7280',
        },
      },
      invalid: {
        color: '#ef4444',
      },
    },
    hidePostalCode: false,
  };

  const handleProcessPayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      setErrorMessage('Stripe not loaded. Please reload the page.');
      setState('error');
      onError('Stripe not loaded.');
      return;
    }

    setState('processing');
    setErrorMessage('');

    try {
      // Step 1: Request PaymentIntent from backend
      // Backend will calculate CNP fee (~3.7% vs 3.2% for card-present)
      const piResponse = await api.post<PaymentIntentResponse>(
        '/stripe/terminal/manual-card-payment-intent',
        {
          amount: Math.round(cartTotal * 100), // in cents
          items: cart.map(item => ({
            itemId: item.itemId,
            title: item.title,
            amount: item.amount,
          })),
          saleId: selectedSaleId,
          buyerEmail,
        }
      );

      const { clientSecret, cnpFeeAmount: feeAmount } = piResponse.data;
      const newTotal = cartTotal + feeAmount / 100;

      // Update fee display
      setCnpFeeAmount(feeAmount / 100);
      setTotalWithFee(newTotal);

      // Step 2: Confirm payment with Stripe using CardElement
      // This tokenizes the card on client side (PCI compliant)
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        throw new Error('CardElement not found');
      }

      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            email: buyerEmail,
          },
        },
      });

      if (error) {
        // Card was declined or other error occurred
        setErrorMessage(error.message || 'Card was declined. Please try another card.');
        setState('error');
        onError(error.message || 'Payment declined');
        return;
      }

      if (!paymentIntent) {
        throw new Error('No payment intent returned');
      }

      if (paymentIntent.status === 'succeeded') {
        // Step 3: Extract last 4 digits from CardElement for display
        const cardElementElement = cardElement as any;
        const cardBrand = cardElementElement._element?.dataset?.brand || 'card';

        // Get card details from payment method
        const cardLast4 = paymentIntent.charges?.data[0]?.payment_method_details?.card?.last4 || '';
        setLastFourDigits(cardLast4);

        // Format current time
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          meridiem: 'short',
        });
        setSuccessTimestamp(timeStr);

        setState('success');
        onSuccess(
          `Payment of $${newTotal.toFixed(2)} processed successfully. Card ending in ${cardLast4}.`
        );
      } else {
        // Unexpected status
        setErrorMessage(`Payment status: ${paymentIntent.status}. Please contact support.`);
        setState('error');
        onError(`Unexpected payment status: ${paymentIntent.status}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'An error occurred processing the payment.';
      setErrorMessage(errorMsg);
      setState('error');
      onError(errorMsg);
    }
  };

  const handleRetry = () => {
    setState('idle');
    setErrorMessage('');
  };

  // ─── Render States ────────────────────────────────────────────────────────────

  return (
    <div className="mb-4 p-4 rounded-xl bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700">
      {/* Header */}
      <h4 className="text-sm font-semibold text-warm-900 dark:text-warm-100 mb-1">
        💳 Manual Card Entry
      </h4>
      <p className="text-xs text-warm-600 dark:text-warm-400 mb-4">
        Card-not-present payment
      </p>

      {/* ═══ IDLE STATE: Form ═══ */}
      {state === 'idle' && (
        <div className="space-y-4">
          {/* CNP Fee Notice */}
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
            <div className="flex gap-2">
              <span className="text-lg">⚠️</span>
              <div>
                <p className="text-xs font-semibold text-amber-900 dark:text-amber-100">CNP Fee Notice</p>
                <p className="text-xs text-amber-800 dark:text-amber-200 mt-1">
                  Card-not-present fee: ${cnpFeeAmount > 0 ? cnpFeeAmount.toFixed(2) : '~$1.40'}
                  <br />
                  (3.7% vs 3.2% for card reader)
                </p>
              </div>
            </div>
          </div>

          {/* Total */}
          <div className="p-3 rounded-lg bg-warm-50 dark:bg-gray-700 border border-warm-200 dark:border-gray-600">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-warm-600 dark:text-warm-400">Subtotal</p>
                <p className="font-semibold text-warm-900 dark:text-warm-100">
                  ${cartTotal.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-warm-600 dark:text-warm-400">Est. Total</p>
                <p className="font-semibold text-warm-900 dark:text-warm-100">
                  ${totalWithFee.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {/* Separator */}
          <div className="border-t border-warm-200 dark:border-gray-700"></div>

          {/* Card Input Form */}
          <form onSubmit={handleProcessPayment} className="space-y-4">
            {/* CardElement */}
            <div>
              <label className="block text-xs font-semibold text-warm-700 dark:text-warm-300 mb-2">
                Card Details
              </label>
              <div className="p-3 rounded-lg border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-700">
                <CardElement options={cardElementOptions} />
              </div>
              <p className="text-xs text-warm-500 dark:text-warm-400 mt-2">
                Stripe handles card data securely. Your card info is never stored.
              </p>
            </div>

            {/* Process Button */}
            <button
              type="submit"
              disabled={!stripe || !elements}
              className="w-full py-3 rounded-lg bg-sage-700 text-white font-semibold hover:bg-sage-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Process Payment ${totalWithFee.toFixed(2)}
            </button>
          </form>
        </div>
      )}

      {/* ═══ PROCESSING STATE ═══ */}
      {state === 'processing' && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 animate-spin text-blue-600 dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">Charging card…</p>
                <p className="text-xs text-blue-700 dark:text-blue-300">Do not close this screen</p>
              </div>
            </div>
          </div>
          <p className="text-center text-xs text-warm-600 dark:text-warm-400">
            Amount: ${totalWithFee.toFixed(2)}
          </p>
        </div>
      )}

      {/* ═══ SUCCESS STATE ═══ */}
      {state === 'success' && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700">
            <p className="text-3xl mb-2">✓</p>
            <p className="text-sm font-bold text-green-900 dark:text-green-100 mb-1">Payment Confirmed</p>
            <p className="text-xs text-green-700 dark:text-green-300">Card charged successfully</p>
          </div>

          <div className="p-3 rounded-lg bg-warm-50 dark:bg-gray-700 border border-warm-200 dark:border-gray-600 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-warm-600 dark:text-warm-400">Amount:</span>
              <span className="font-semibold text-warm-900 dark:text-warm-100">${totalWithFee.toFixed(2)}</span>
            </div>
            {lastFourDigits && (
              <div className="flex justify-between">
                <span className="text-warm-600 dark:text-warm-400">Card:</span>
                <span className="font-semibold text-warm-900 dark:text-warm-100">••••{lastFourDigits}</span>
              </div>
            )}
            {successTimestamp && (
              <div className="flex justify-between">
                <span className="text-warm-600 dark:text-warm-400">Time:</span>
                <span className="font-semibold text-warm-900 dark:text-warm-100">{successTimestamp}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ ERROR STATE ═══ */}
      {state === 'error' && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700">
            <p className="text-3xl mb-2">✗</p>
            <p className="text-sm font-bold text-red-900 dark:text-red-100 mb-1">Card Was Declined</p>
            <p className="text-xs text-red-700 dark:text-red-300 mt-2">
              {errorMessage || 'The card was declined. Please check the details and try again.'}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleRetry}
              className="flex-1 py-2 rounded-lg bg-sage-700 text-white text-sm font-semibold hover:bg-sage-800 transition"
            >
              Try Again
            </button>
            <button
              onClick={() => {
                setState('idle');
                onError('User switched to cash payment');
              }}
              className="flex-1 py-2 rounded-lg bg-warm-200 dark:bg-gray-700 text-warm-700 dark:text-warm-300 text-sm font-semibold hover:bg-warm-300 dark:hover:bg-gray-600 transition"
            >
              Use Cash
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
