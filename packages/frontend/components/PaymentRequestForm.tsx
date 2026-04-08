import React, { useState, useMemo } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useToast } from './ToastContext';

interface PaymentRequestFormProps {
  requestId: string;
  clientSecret: string;
  totalAmountCents: number;
  stripeAccountId?: string | null; // connected account — PI lives here
  onSuccess: () => void;
  onError?: (error: string) => void;
  isProcessing?: boolean;
}

const PaymentForm: React.FC<PaymentRequestFormProps> = ({
  requestId,
  clientSecret,
  totalAmountCents,
  onSuccess,
  onError,
  isProcessing = false,
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      onError?.('Stripe not loaded');
      return;
    }

    setIsSubmitting(true);

    try {
      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: elements.getElement(CardElement)!,
          billing_details: {},
        },
      });

      if (error) {
        onError?.(error.message || 'Payment failed');
        setIsSubmitting(false);
        return;
      }

      if (paymentIntent?.status === 'succeeded') {
        onSuccess();
      } else {
        onError?.('Payment incomplete');
        setIsSubmitting(false);
      }
    } catch (err: any) {
      console.error('Payment error:', err);
      onError?.(err.message || 'Payment processing failed');
      setIsSubmitting(false);
    }
  };

  const isDisabled = isSubmitting || isProcessing || !stripe || !elements;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-4 border border-gray-200 rounded-lg">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Card Details
        </label>
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#424770',
                '::placeholder': {
                  color: '#aab7c4',
                },
              },
              invalid: {
                color: '#9e2146',
              },
            },
          }}
        />
      </div>

      <button
        type="submit"
        disabled={isDisabled}
        className="w-full bg-sage-600 hover:bg-sage-700 disabled:bg-gray-300 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
      >
        {isSubmitting || isProcessing ? 'Processing...' : `Pay $${(totalAmountCents / 100).toFixed(2)}`}
      </button>
    </form>
  );
};

export const PaymentRequestForm: React.FC<PaymentRequestFormProps> = (props) => {
  // Create a Stripe instance scoped to the connected account that owns the PaymentIntent.
  // loadStripe is memoized so it only re-runs when the account ID changes.
  const stripePromise = useMemo(
    () =>
      loadStripe(
        process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
        props.stripeAccountId ? { stripeAccount: props.stripeAccountId } : undefined
      ),
    [props.stripeAccountId]
  );

  return (
    <Elements stripe={stripePromise}>
      <PaymentForm {...props} />
    </Elements>
  );
};

export default PaymentRequestForm;
