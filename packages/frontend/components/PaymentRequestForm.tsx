import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useToast } from './ToastContext';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface PaymentRequestFormProps {
  requestId: string;
  clientSecret: string;
  totalAmountCents: number;
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
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      showToast('Stripe not loaded', 'error');
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
        showToast(error.message || 'Payment failed', 'error');
        onError?.(error.message || 'Payment failed');
        setIsSubmitting(false);
        return;
      }

      if (paymentIntent?.status === 'succeeded') {
        showToast('Payment successful!', 'success');
        onSuccess();
      } else {
        showToast('Payment incomplete', 'error');
        onError?.('Payment incomplete');
        setIsSubmitting(false);
      }
    } catch (err: any) {
      console.error('Payment error:', err);
      showToast(err.message || 'Payment processing failed', 'error');
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
  return (
    <Elements stripe={stripePromise}>
      <PaymentForm {...props} />
    </Elements>
  );
};

export default PaymentRequestForm;
