import React, { useState, useEffect } from 'react';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import api from '../lib/api';

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
  itemTitle: string;
  itemPrice: number;      // post-discount price (what Stripe charges)
  originalAmount?: number; // pre-discount item price (for strikethrough display)
  platformFee: number;
  discountApplied?: number;
  saleName?: string;
  saleAddress?: string;
  saleDates?: string;
  buyerPremium?: number;  // buyer premium amount in dollars
  buyerPremiumRate?: number; // buyer premium rate as decimal (e.g., 0.05 for 5%)
  isAuction?: boolean;    // true if item is an auction
  onClose: () => void;
  onSuccess: () => void;
}

const PaymentForm = ({ itemTitle, itemPrice, originalAmount, platformFee, discountApplied = 0, buyerPremium = 0, buyerPremiumRate = 0, isAuction = false, saleName, saleAddress, saleDates, onClose, onSuccess }: PaymentFormProps) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tosAgreed, setTosAgreed] = useState(false);
  const [buyerPremiumAgreed, setBuyerPremiumAgreed] = useState(!isAuction); // auto-agree if not auction
  const [paymentSucceeded, setPaymentSucceeded] = useState(false);

  // itemPrice is already post-discount (server returns finalPriceCents/100)
  // total = discounted item price + platform fee + buyer premium
  const total = itemPrice + platformFee + buyerPremium;

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
      setPaymentSucceeded(true);
      // Optionally store the purchaseId from stripe intent if available
      // For now, we'll redirect after modal closure with the callback
      setTimeout(() => {
        onSuccess();
      }, 2000);
    }
  };

  const handleRetry = () => {
    setErrorMessage(null);
    setIsSubmitting(false);
  };

  if (paymentSucceeded) {
    return (
      <div className="text-center">
        <div className="mb-4 p-4 bg-green-50 rounded-lg border border-green-200">
          <p className="text-3xl mb-2">✅</p>
          <p className="text-lg font-bold text-green-900 mb-1">Order Confirmed!</p>
          <p className="text-xs text-green-700 mb-3">Your payment has been processed successfully.</p>
        </div>

        <div className="mb-4 p-4 bg-warm-50 rounded-lg text-left space-y-3">
          <div>
            <p className="text-xs text-warm-500">Item</p>
            <p className="font-semibold text-warm-900">{itemTitle}</p>
          </div>

          <div>
            <p className="text-xs text-warm-500">Total Paid</p>
            <p className="text-lg font-bold text-warm-900">${total.toFixed(2)}</p>
          </div>

          {saleName && (
            <div>
              <p className="text-xs text-warm-500">Sale</p>
              <p className="font-semibold text-warm-900">{saleName}</p>
            </div>
          )}

          {saleAddress && (
            <div>
              <p className="text-xs text-warm-500">Location & Dates</p>
              <p className="text-sm text-warm-900">
                📍 {saleAddress}
                {saleDates && <span> | {saleDates}</span>}
              </p>
            </div>
          )}
        </div>

        <p className="text-xs text-warm-600 mb-4">
          Contact the organizer for pickup details.
        </p>

        <button
          onClick={onClose}
          className="w-full py-2 px-4 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-4 p-3 bg-warm-50 rounded-lg">
        <p className="text-sm text-warm-600">Item</p>
        <p className="font-semibold text-warm-900">{itemTitle}</p>
      </div>

      <div className="mb-4 space-y-1 text-sm">
        <div className="flex justify-between text-warm-600">
          <span>Item price</span>
          <span>
            {discountApplied > 0 && originalAmount != null ? (
              <>
                <span className="line-through text-warm-400 mr-1">${originalAmount.toFixed(2)}</span>
                <span className="text-green-600 font-medium">${itemPrice.toFixed(2)}</span>
              </>
            ) : (
              `$${itemPrice.toFixed(2)}`
            )}
          </span>
        </div>
        {/* Platform fee only shown for regular items; for auctions it's hidden in the buyer's premium */}
        {!isAuction && platformFee > 0 && (
          <div className="flex justify-between items-center text-warm-600">
            <div className="flex items-center gap-1">
              <span>Platform fee (10%)</span>
              <button
                type="button"
                className="text-xs text-warm-400 hover:text-warm-600 cursor-help"
                title="FindA.Sale's 10% service fee helps us maintain the platform, provide customer support, and improve features for organizers and shoppers."
              >
                ℹ️
              </button>
            </div>
            <span>${platformFee.toFixed(2)}</span>
          </div>
        )}
        {discountApplied > 0 && (
          <div className="flex justify-between text-green-600 font-medium">
            <span>🎟️ Coupon discount</span>
            <span>−${discountApplied.toFixed(2)}</span>
          </div>
        )}
        {buyerPremium > 0 && (
          <div className="flex justify-between text-warm-600">
            <span>Buyer Premium ({(buyerPremiumRate * 100).toFixed(0)}%)</span>
            <span>${buyerPremium.toFixed(2)}</span>
          </div>
        )}
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
          <p className="mb-2">{errorMessage}</p>
          <p className="text-xs text-red-600 mb-3">You can also try a different card — just update your payment details above.</p>
          <button
            type="button"
            onClick={handleRetry}
            className="text-xs underline text-red-600 hover:text-red-800 font-medium"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Buyer Premium consent (auction items only) */}
      {isAuction && buyerPremium > 0 && (
        <label className="flex items-start gap-2 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={buyerPremiumAgreed}
            onChange={(e) => setBuyerPremiumAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-warm-300 accent-amber-600"
            aria-required="true"
          />
          <span className="text-xs text-warm-600 leading-relaxed">
            I understand a buyer premium of {(buyerPremiumRate * 100).toFixed(0)}% (${buyerPremium.toFixed(2)}) will be added to my total.
          </span>
        </label>
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
          I understand all sales are final — no returns or refunds. I agree to the{' '}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-warm-900">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-warm-900">
            Privacy Policy
          </a>
          .{' '}
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
          disabled={!stripe || !elements || isSubmitting || !tosAgreed || !buyerPremiumAgreed}
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
  listingType?: string;   // AUCTION, FIXED, etc. (for buyer premium disclosure)
  onClose: () => void;
  onSuccess: () => void;
}

const CheckoutModal = ({ itemId, purchaseId, itemTitle, listingType, onClose, onSuccess }: CheckoutModalProps) => {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [itemPrice, setItemPrice] = useState(0);
  const [originalAmount, setOriginalAmount] = useState<number | undefined>(undefined);
  const [platformFee, setPlatformFee] = useState(0);
  const [discountApplied, setDiscountApplied] = useState(0);
  const [buyerPremium, setBuyerPremium] = useState(0);
  const [buyerPremiumRate, setBuyerPremiumRate] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resolvedTitle, setResolvedTitle] = useState(itemTitle);
  const [saleName, setSaleName] = useState<string>('');
  const [saleAddress, setSaleAddress] = useState<string>('');
  const [saleDates, setSaleDates] = useState<string>('');

  // Sprint 3: Coupon entry phase — shown before calling create-payment-intent
  const [started, setStarted] = useState(!!purchaseId); // auction resumption skips coupon step
  const [couponInput, setCouponInput] = useState('');

  useEffect(() => {
    if (!started) return; // wait until user clicks "Continue to Pay"

    const loadIntent = async () => {
      try {
        let data: any;
        if (purchaseId) {
          // Resume an existing pending purchase (auction winners)
          const response = await api.get(`/stripe/pending-payment/${purchaseId}`);
          data = response.data;
          if (data.itemTitle) setResolvedTitle(data.itemTitle);
        } else if (itemId) {
          // Create a new payment intent (include affiliate attribution + coupon if present)
          const affiliateLinkId = typeof window !== 'undefined'
            ? sessionStorage.getItem('affiliateRef') ?? undefined
            : undefined;
          const trimmedCoupon = couponInput.trim().toUpperCase();
          const response = await api.post('/stripe/create-payment-intent', {
            itemId,
            ...(affiliateLinkId ? { affiliateLinkId } : {}),
            ...(trimmedCoupon ? { couponCode: trimmedCoupon } : {}),
          });
          data = response.data;
          if (data.discountApplied > 0) {
            setDiscountApplied(data.discountApplied);
            setOriginalAmount(data.originalAmount);
          }
        } else {
          setLoadError('Invalid checkout configuration.');
          return;
        }
        setClientSecret(data.clientSecret);
        setItemPrice(data.totalAmount);
        setPlatformFee(data.platformFee);
        if (data.buyerPremium) setBuyerPremium(data.buyerPremium);
        if (data.buyerPremiumRate) setBuyerPremiumRate(data.buyerPremiumRate);
        if (data.saleName) setSaleName(data.saleName);
        if (data.saleAddress) setSaleAddress(data.saleAddress);
        if (data.saleDates) setSaleDates(data.saleDates);
      } catch (err: any) {
        const errorMsg = err.response?.data?.error || err.response?.data?.message || 'Could not start checkout. Please try again.';
        setLoadError(errorMsg);
      }
    };

    loadIntent();
  }, [started, itemId, purchaseId]); // eslint-disable-line react-hooks/exhaustive-deps

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

        {/* Sprint 3: Coupon entry step — shown before payment form loads */}
        {!started && !purchaseId && (
          <div>
            <div className="mb-5">
              <label className="block text-sm font-medium text-warm-700 mb-1">
                Have a coupon code? <span className="text-warm-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                placeholder="e.g. A3F2C891"
                maxLength={8}
                className="w-full px-3 py-2 border border-warm-300 rounded-lg font-mono tracking-widest text-warm-900 focus:ring-2 focus:ring-amber-500 focus:border-transparent uppercase"
              />
              <p className="text-xs text-warm-400 mt-1">
                Coupons are issued after each completed purchase.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 px-4 border border-warm-300 rounded text-warm-700 hover:bg-warm-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setStarted(true)}
                className="flex-1 py-2 px-4 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded"
              >
                Continue to Pay
              </button>
            </div>
          </div>
        )}

        {/* Payment intent loading / error / form */}
        {started && (
          <>
            {loadError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm mb-4">
                <p className="mb-2">{loadError}</p>
                {/* Allow user to retry — clears error and reloads payment intent */}
                <button
                  className="block text-xs underline text-red-600 hover:text-red-800 font-medium"
                  onClick={() => { setLoadError(null); }}
                >
                  Try Again
                </button>
                {/* Allow user to retry without coupon if coupon was the issue */}
                {couponInput && loadError.toLowerCase().includes('coupon') && (
                  <button
                    className="block mt-1 text-xs underline text-red-600 hover:text-red-800"
                    onClick={() => { setCouponInput(''); setLoadError(null); setStarted(false); }}
                  >
                    Remove coupon and restart
                  </button>
                )}
              </div>
            )}

            {!loadError && !clientSecret && (
              <div className="py-8 text-center text-warm-500">Loading payment form...</div>
            )}

            {clientSecret && (
              <Elements stripe={getStripePromise()} options={{ clientSecret }}>
                <PaymentForm
                  itemTitle={resolvedTitle}
                  itemPrice={itemPrice}
                  originalAmount={originalAmount}
                  platformFee={platformFee}
                  discountApplied={discountApplied}
                  buyerPremium={buyerPremium}
                  buyerPremiumRate={buyerPremiumRate}
                  isAuction={listingType === 'AUCTION'}
                  saleName={saleName}
                  saleAddress={saleAddress}
                  saleDates={saleDates}
                  onClose={onClose}
                  onSuccess={handleSuccess}
                />
              </Elements>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CheckoutModal;
