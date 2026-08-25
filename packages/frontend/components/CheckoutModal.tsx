import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import api from '../lib/api';
import { formatBuyerPremiumPct, AUCTION_BUYER_PREMIUM_LABEL } from '../lib/platformFees';
import AccessibleModal from './AccessibleModal';
import { useAuth } from './AuthContext';

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
  shippingCost?: number;  // ADR-110 Track 1: server-computed real shipping total (dollars), 0 when not requested/applicable
  buyerPremiumRate?: number; // buyer premium rate as decimal (e.g., 0.05 for 5%)
  isAuction?: boolean;    // true if item is an auction
  purchaseId?: string;    // purchase ID for redirect after success
  organizerName?: string; // ADR-025 checkout disclosure: organizer display name, threaded from parent page
  saleId?: string;        // ADR-025 checkout disclosure: used to link to the sale/storefront page
  onClose: () => void;
  onSuccess: () => void;
}

const PaymentForm = ({ itemTitle, itemPrice, originalAmount, platformFee, discountApplied = 0, buyerPremium = 0, buyerPremiumRate = 0, shippingCost = 0, isAuction = false, purchaseId, saleName, saleAddress, saleDates, organizerName, saleId, onClose, onSuccess }: PaymentFormProps) => {
  const router = useRouter();
  const { user } = useAuth();
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tosAgreed, setTosAgreed] = useState(false);
  const [buyerPremiumAgreed, setBuyerPremiumAgreed] = useState(!isAuction); // auto-agree if not auction
  const [paymentSucceeded, setPaymentSucceeded] = useState(false);

  // TOTAL-DISPLAY FIX (2026-08-17). `itemPrice` is the server's total MINUS any buyer premium
  // (see loadIntent below), so re-adding the premium here reproduces the server's charge
  // exactly. It used to read `itemPrice + (isAuction ? buyerPremium : 0)` against an itemPrice
  // that was already the premium-inclusive total, so a $200 auction win displayed $220.00
  // ("Item price $210.00 / Buyer Premium $10.00") while Stripe was correctly charging $210.00.
  // Gated on the premium itself rather than on `isAuction` (a client-side listingType check)
  // so the two can never disagree: the server decides whether a premium applies, and it sends
  // 0 when it doesn't — including on a Sale.coversFee auction, where the organizer absorbs it.
  // itemPrice remains post-discount, so the coupon display path is unchanged.
  const total = itemPrice + buyerPremium + shippingCost;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    // GA4 #470: checkout_initiated conversion event
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'checkout_initiated', { amount: total });
    }

    const { error, paymentIntent } = await stripe.confirmPayment({
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
      // GA4 #470: purchase_completed conversion event
      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('event', 'purchase_completed', {
          value: total,
          currency: 'USD',
          transaction_id: paymentIntent?.id ?? '',
        });
      }
      setPaymentSucceeded(true);
      // Success confirmation now persists until user clicks "Done" button
      // This ensures users see their purchase confirmation and can verify details
    }
  };

  const handleRetry = () => {
    setErrorMessage(null);
    setIsSubmitting(false);
  };

  const handleDone = () => {
    // Guest checkout (2026-07-18): /purchases/[id] requires a logged-in session (it looks up
    // the purchase via an authenticated endpoint): redirecting a guest there would immediately
    // bounce them to /login right after they just paid. Guests already saw the full inline
    // confirmation screen above (item, total, sale info) and get an emailed receipt, so for
    // guests "Done" just closes the modal. Authenticated buyers keep the persistent page.
    if (purchaseId && user) {
      router.push(`/purchases/${purchaseId}`);
    } else {
      // Fallback: close modal and let parent handle redirect
      onClose();
    }
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
            <p className="font-semibold text-warm-900 dark:text-warm-100">{itemTitle}</p>
          </div>

          <div>
            <p className="text-xs text-warm-500">Total Paid</p>
            <p className="text-lg font-bold text-warm-900 dark:text-warm-100">${total.toFixed(2)}</p>
          </div>

          {saleName && (
            <div>
              <p className="text-xs text-warm-500">Sale</p>
              <p className="font-semibold text-warm-900 dark:text-warm-100">{saleName}</p>
            </div>
          )}

          {saleAddress && (
            <div>
              <p className="text-xs text-warm-500">Location & Dates</p>
              <p className="text-sm text-warm-900 dark:text-warm-100">
                📍 {saleAddress}
                {saleDates && <span> | {saleDates}</span>}
              </p>
            </div>
          )}
        </div>

        {/* ADR-025 / legal-direct-charges-migration-2026-08-09.md deliverable #1:
            longer receipt/confirmation disclosure. This inline success screen is the ONLY
            confirmation guests ever see (they can't reach the authenticated /purchases/[id]
            page), so it carries the full disclosure rather than just the micro-disclosure. */}
        {organizerName ? (
          <p className="text-xs text-warm-600 mb-4 leading-relaxed">
            This purchase was made directly with <strong>{organizerName}</strong> and processed
            securely by Stripe. If you have any questions about your order &mdash; pickup,
            condition, timing &mdash; {organizerName} is who to contact first
            {saleId ? (
              <>
                {' '}via the{' '}
                <a
                  href={`/sales/${saleId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-warm-900 dark:text-warm-100"
                >
                  sale page
                </a>
                .
              </>
            ) : '.'}
            {' '}FindA.Sale is here if you need help finding them or navigating the platform.
          </p>
        ) : (
          <p className="text-xs text-warm-600 mb-4">
            Contact the organizer for pickup details.
          </p>
        )}

        <button
          onClick={handleDone}
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
        <p className="font-semibold text-warm-900 dark:text-warm-100">{itemTitle}</p>
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
        {/* The organizer's platform fee is never shown to buyers on any sale type: it comes out of the
            organizer's payout, not the buyer's charge. The buyer premium line below is a separate,
            buyer-paid fee that applies to auction items only. */}
        {discountApplied > 0 && (
          <div className="flex justify-between text-green-600 font-medium">
            <span>🎟️ Coupon discount</span>
            <span>−${discountApplied.toFixed(2)}</span>
          </div>
        )}
        {shippingCost > 0 && (
          <div className="flex justify-between text-warm-600">
            <span>Shipping</span>
            <span>${shippingCost.toFixed(2)}</span>
          </div>
        )}
        {buyerPremium > 0 && (
          <div className="flex justify-between text-warm-600">
            {/* The premium is the platform rate (5%). The label still renders the rate the
                SERVER reported charging, when it reported one, rather than assuming — the
                number beside it is that same charge, and a label that could disagree with the
                money next to it is the whole class of bug this row has had twice. Falls back to
                the platform constant if the server sent an amount but no rate. */}
            <span>
              Buyer Premium (
              {buyerPremiumRate > 0
                ? formatBuyerPremiumPct(buyerPremiumRate * 100)
                : AUCTION_BUYER_PREMIUM_LABEL}
              )
            </span>
            <span>${buyerPremium.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-warm-900 dark:text-warm-100 border-t border-warm-300 pt-2 mt-2">
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
          <p className="text-xs text-red-600 mb-3">You can also try a different card. Just update your payment details above.</p>
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
            I understand a buyer premium of{' '}
            {buyerPremiumRate > 0
              ? formatBuyerPremiumPct(buyerPremiumRate * 100)
              : AUCTION_BUYER_PREMIUM_LABEL}{' '}
            (${buyerPremium.toFixed(2)}) will be added to my total.
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
          I understand all sales are final: no returns or refunds. I agree to the{' '}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-warm-900 dark:text-warm-100">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-warm-900 dark:text-warm-100">
            Privacy Policy
          </a>
          .{' '}
          <a href="/contact" target="_blank" rel="noopener noreferrer" className="underline hover:text-warm-900 dark:text-warm-100">
            Contact support
          </a>{' '}
          for disputes.
        </span>
      </label>

      {/* ADR-025 / legal-direct-charges-migration-2026-08-09.md deliverable #1:
          micro-disclosure near the payment button. Ships universally (not gated to the
          Direct-charges allowlist) -- the organizer is the real seller of record under
          both the DESTINATION and DIRECT charge shapes, so this statement is honest
          regardless of which model actually processed this specific purchase. */}
      {organizerName && (
        <p className="text-xs text-warm-500 mb-3">
          Buying from {organizerName} &middot; Payment processed securely by Stripe.
        </p>
      )}

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
// Pass either itemId (new purchase) OR purchaseId (resume existing, e.g. auction winner).
interface CheckoutModalProps {
  itemId?: string;
  purchaseId?: string;
  itemTitle: string;
  listingType?: string;   // AUCTION, FIXED, etc. (for buyer premium disclosure)
  organizerName?: string; // ADR-025 checkout disclosure: organizer's display name (businessName), passed by parent page
  saleId?: string;        // ADR-025 checkout disclosure: sale id, used for storefront link in the inline success screen
  // ADR-110 Track 1: gates whether the "ship this to me" toggle is offered at all.
  // Mirrors stripeController.createPaymentIntent's own gate exactly (shippingRequested is
  // only ever honored there when !isAuctionItem && item.shippingAvailable && item.shippingPrice != null).
  shippingAvailable?: boolean;
  shippingPrice?: number | null;
  onClose: () => void;
  onSuccess: () => void;
}

const CheckoutModal = ({ itemId, purchaseId: initialPurchaseId, itemTitle, listingType, organizerName, saleId, shippingAvailable = false, shippingPrice = null, onClose, onSuccess }: CheckoutModalProps) => {
  const { user } = useAuth();
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
  const [purchaseId, setPurchaseId] = useState<string | undefined>(initialPurchaseId);

  // ADR-110 Track 1: "ship this to me" intent + ZIP, collected before the PaymentElement
  // mounts. The backend recomputes the real shipping total server-side from this ZIP --
  // shippingCost below is ALWAYS what the server returned, never computed client-side.
  const isAuction = listingType === 'AUCTION'; // matches stripeController's !isAuctionItem gate
  const canOfferShipping = shippingAvailable && shippingPrice != null && !isAuction;
  const [shipToMe, setShipToMe] = useState(false);
  const [shippingZipInput, setShippingZipInput] = useState('');
  const [shippingZipError, setShippingZipError] = useState<string | null>(null);
  const [shippingCost, setShippingCost] = useState(0);

  // Guest checkout idempotency fix (2026-08-04): a stable per-mount token so that any
  // retry of create-payment-intent within this same mounted CheckoutModal reuses the
  // SAME Stripe idempotency key server-side, instead of minting a brand-new PaymentIntent
  // (and a new PENDING Purchase row) on every attempt. Generated once on mount and never
  // regenerated on re-render or retry -- only a fresh mount of this modal gets a new token.
  const clientTokenRef = useRef<string>('');
  useEffect(() => {
    if (!clientTokenRef.current) {
      clientTokenRef.current = crypto.randomUUID();
    }
  }, []);

  // Sprint 3: Coupon entry phase (shown before calling create-payment-intent)
  const [started, setStarted] = useState(!!initialPurchaseId); // auction resumption skips coupon step
  const [couponInput, setCouponInput] = useState('');

  // Guest checkout (2026-07-18): email + name collected up front (before the PaymentIntent
  // exists) since this is a plain PaymentIntent + Elements flow, not a hosted Stripe Checkout
  // Session: there's no Stripe-native guest email step to lean on here. Coupons are
  // per-account XP rewards, so guests never see the coupon field (mutually exclusive with it).
  const [guestEmail, setGuestEmail] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestFieldError, setGuestFieldError] = useState<string | null>(null);
  const isGuest = !user;

  // Platform Safety #118 pattern (mirrors register.tsx's generateDeviceFingerprint): same
  // browser-signal fingerprint used at signup, reused here so a guest checkout can be
  // pre-payment-compared against the sale organizer's stored device fingerprint
  // (checkoutGuard.ts assertGuestCheckoutAllowed, S1072 Finding #4 follow-up).
  const generateDeviceFingerprint = async (): Promise<string> => {
    try {
      const signals = [
        navigator.userAgent,
        screen.width + 'x' + screen.height,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        navigator.language,
      ];
      let canvasSignal = '';
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.textBaseline = 'top';
          ctx.font = '12px Arial';
          ctx.fillText('fingerprint', 2, 2);
          canvasSignal = canvas.toDataURL();
        }
      } catch (e) {
        // Canvas not available or blocked: no-op
      }
      if (canvasSignal) signals.push(canvasSignal);
      return btoa(signals.join('|'));
    } catch (error) {
      return ''; // Don't block checkout if fingerprinting fails
    }
  };

  // Pre-fill coupon from Facebook Commerce Manager redirect (/checkout?coupon=CODE)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const pending = localStorage.getItem('fas_pending_coupon');
    if (pending) {
      setCouponInput(pending);
      localStorage.removeItem('fas_pending_coupon');
    }
  }, []); // runs once on mount

  useEffect(() => {
    if (!started) return; // wait until user clicks "Continue to Pay"

    const loadIntent = async () => {
      try {
        let data: any;
        if (initialPurchaseId) {
          // Resume an existing pending purchase (auction winners)
          const response = await api.get(`/stripe/pending-payment/${initialPurchaseId}`);
          data = response.data;
          if (data.itemTitle) setResolvedTitle(data.itemTitle);
        } else if (itemId) {
          // Create a new payment intent (include affiliate attribution + coupon if present)
          const affiliateLinkId = typeof window !== 'undefined'
            ? sessionStorage.getItem('affiliateRef') ?? undefined
            : undefined;
          const trimmedCoupon = couponInput.trim().toUpperCase();
          const deviceFingerprint = isGuest ? await generateDeviceFingerprint() : undefined;
          const response = await api.post('/stripe/create-payment-intent', {
            itemId,
            ...(affiliateLinkId ? { affiliateLinkId } : {}),
            ...(trimmedCoupon && !isGuest ? { couponCode: trimmedCoupon } : {}),
            ...(isGuest ? { guestEmail: guestEmail.trim(), guestName: guestName.trim(), deviceFingerprint, clientToken: clientTokenRef.current } : {}),
            // ADR-110 Track 1: real destination-ZIP shipping. shippingCost is never sent --
            // the backend recomputes it server-side from shippingZip and returns it below.
            ...(shipToMe ? { shippingRequested: true, shippingZip: shippingZipInput.trim() } : {}),
          });
          data = response.data;
          if (data.discountApplied > 0) {
            setDiscountApplied(data.discountApplied);
            setOriginalAmount(data.originalAmount);
          }
          // Capture purchaseId from response (created by backend)
          if (data.purchaseId) {
            setPurchaseId(data.purchaseId);
          }
        } else {
          setLoadError('Invalid checkout configuration.');
          return;
        }
        setClientSecret(data.clientSecret);
        // Strip the buyer premium AND shipping back out so the "Item price" row shows the
        // hammer/list price alone -- "Buyer Premium" and "Shipping" each add their own line
        // back once, in PaymentForm. data.totalAmount stays authoritative for what Stripe
        // charges; data.shippingCost is the server-computed real total, never estimated here.
        const premiumDue = data.buyerPremium ?? 0;
        const shippingDue = data.shippingCost ?? 0;
        setShippingCost(shippingDue);
        setItemPrice(parseFloat(((data.totalAmount ?? 0) - premiumDue - shippingDue).toFixed(2)));
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
  }, [started, itemId, initialPurchaseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSuccess = () => {
    onSuccess();
  };

  const isOpen = true; // This modal is shown conditionally by parent

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      ariaLabelledBy="checkout-modal-title"
      contentClassName="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6"
    >
      <div className="flex justify-between items-center mb-5">
        <h2 id="checkout-modal-title" className="text-xl font-bold text-warm-900 dark:text-gray-100">Complete Purchase</h2>
        <button
          onClick={onClose}
          className="text-warm-400 hover:text-warm-600 text-2xl leading-none"
          aria-label="Close"
        >
          &times;
        </button>
      </div>

      {/* Guest contact info (guests only) + Sprint 3 coupon entry (accounts only):
          shown before payment form loads. Coupons are per-account XP rewards, so a guest
          never sees that field; a logged-in buyer never sees the guest fields. */}
      {!started && !purchaseId && (
        <div>
          {/* ADR-110 Track 1: "ship this to me" + ZIP, collected before the PaymentElement
              mounts. Shown only when the item actually supports native-checkout shipping
              (mirrors stripeController's own gate) and is never offered on auction items. */}
          {canOfferShipping && (
            <div className="mb-5 p-3 bg-warm-50 rounded-lg">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shipToMe}
                  onChange={(e) => { setShipToMe(e.target.checked); setShippingZipError(null); }}
                  className="h-4 w-4 rounded border-warm-300 accent-amber-600"
                />
                <span className="text-sm font-medium text-warm-700">Ship this to me</span>
              </label>
              {shipToMe && (
                <div className="mt-2">
                  <label className="block text-sm font-medium text-warm-700 mb-1">
                    Shipping ZIP code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={shippingZipInput}
                    onChange={(e) => { setShippingZipInput(e.target.value); setShippingZipError(null); }}
                    placeholder="49503"
                    maxLength={10}
                    className="w-full px-3 py-2 border border-warm-300 rounded-lg text-warm-900 dark:text-warm-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    aria-label="Shipping ZIP code"
                    autoComplete="postal-code"
                  />
                  {shippingZipError && (
                    <p className="text-xs text-red-600 mt-1" role="alert">{shippingZipError}</p>
                  )}
                  <p className="text-xs text-warm-400 mt-1">
                    We'll show your exact shipping cost before you pay.
                  </p>
                </div>
              )}
            </div>
          )}
          {isGuest ? (
            <div className="mb-5 space-y-3">
              <p className="text-xs text-warm-500">
                Checking out as a guest: no account needed. We'll email your receipt.
              </p>
              <div>
                <label className="block text-sm font-medium text-warm-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={guestEmail}
                  onChange={(e) => { setGuestEmail(e.target.value); setGuestFieldError(null); }}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2 border border-warm-300 rounded-lg text-warm-900 dark:text-warm-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  aria-label="Email address"
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-warm-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => { setGuestName(e.target.value); setGuestFieldError(null); }}
                  placeholder="Your name"
                  className="w-full px-3 py-2 border border-warm-300 rounded-lg text-warm-900 dark:text-warm-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  aria-label="Your name"
                  autoComplete="name"
                />
              </div>
              {guestFieldError && (
                <p className="text-xs text-red-600" role="alert">{guestFieldError}</p>
              )}
              <p className="text-xs text-warm-400">
                Want to track orders and earn rewards? <a href="/register" className="underline hover:text-warm-900 dark:text-warm-100">Create an account</a> instead.
              </p>
            </div>
          ) : (
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
                className="w-full px-3 py-2 border border-warm-300 rounded-lg font-mono tracking-widest text-warm-900 dark:text-warm-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent uppercase"
                aria-label="Coupon code (optional)" />
              <p className="text-xs text-warm-400 mt-1">
                Coupons are issued after each completed purchase.
              </p>
            </div>
          )}
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
              onClick={() => {
                if (isGuest) {
                  const trimmedEmail = guestEmail.trim();
                  const trimmedName = guestName.trim();
                  if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
                    setGuestFieldError('Please enter a valid email address.');
                    return;
                  }
                  if (!trimmedName) {
                    setGuestFieldError('Please enter your name.');
                    return;
                  }
                }
                if (shipToMe) {
                  const zipTrimmed = shippingZipInput.trim();
                  if (!/^\d{5}(-\d{4})?$/.test(zipTrimmed)) {
                    setShippingZipError('Enter a valid ZIP code to see your shipping total.');
                    return;
                  }
                }
                setStarted(true);
              }}
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
            <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300 text-sm mb-4" role="alert" id="checkout-load-error">
              {/* S1006: render the actual server message so buyers see WHY (was a bare "Try Again") */}
              <p className="mb-2 font-medium">{loadError}</p>
              {/* Allow user to retry: clears error and reloads payment intent */}
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
                shippingCost={shippingCost}
                isAuction={isAuction}
                purchaseId={purchaseId}
                saleName={saleName}
                saleAddress={saleAddress}
                saleDates={saleDates}
                organizerName={organizerName}
                saleId={saleId}
                onClose={onClose}
                onSuccess={handleSuccess}
              />
            </Elements>
          )}
        </>
      )}
    </AccessibleModal>
  );
};

export default CheckoutModal;
