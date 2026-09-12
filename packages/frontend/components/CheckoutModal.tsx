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
import { SquarePaymentRequestForm } from './SquarePaymentRequestForm';

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
        // Stripe dead-link fix (2026-09-09, findasale-dev BUG MODE): /shopper/purchases
        // is not a real route (404s). purchaseId is already a prop on this component
        // (threaded through from the parent page) -- use it to land on the real
        // persistent purchase page. Falls back to /shopper/checkout-success (a real
        // page that itself handles a missing purchaseId by looking up the buyer's most
        // recent purchase) for the rare case this modal is invoked without one.
        return_url: purchaseId
          ? `${window.location.origin}/purchases/${purchaseId}`
          : `${window.location.origin}/shopper/checkout-success`,
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
        <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
          <p className="text-3xl mb-2">✅</p>
          <p className="text-lg font-bold text-green-900 dark:text-green-200 mb-1">Order Confirmed!</p>
          <p className="text-xs text-green-700 dark:text-green-400 mb-3">Your payment has been processed successfully.</p>
        </div>

        <div className="mb-4 p-4 bg-warm-50 dark:bg-gray-700 rounded-lg text-left space-y-3">
          <div>
            <p className="text-xs text-warm-500 dark:text-warm-300">Item</p>
            <p className="font-semibold text-warm-900 dark:text-warm-100">{itemTitle}</p>
          </div>

          <div>
            <p className="text-xs text-warm-500 dark:text-warm-300">Total Paid</p>
            <p className="text-lg font-bold text-warm-900 dark:text-warm-100">${total.toFixed(2)}</p>
          </div>

          {saleName && (
            <div>
              <p className="text-xs text-warm-500 dark:text-warm-300">Sale</p>
              <p className="font-semibold text-warm-900 dark:text-warm-100">{saleName}</p>
            </div>
          )}

          {saleAddress && (
            <div>
              <p className="text-xs text-warm-500 dark:text-warm-300">Location & Dates</p>
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
      <div className="mb-4 p-3 bg-warm-50 dark:bg-gray-700 rounded-lg">
        <p className="text-sm text-warm-600 dark:text-warm-300">Item</p>
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
        <div className="flex justify-between font-bold text-warm-900 dark:text-warm-100 border-t border-warm-300 dark:border-gray-600 pt-2 mt-2">
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
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300 text-sm">
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
          className="flex-1 py-2 px-4 border border-warm-300 dark:border-gray-600 rounded text-warm-700 dark:text-warm-300 hover:bg-warm-50 dark:hover:bg-gray-700 disabled:opacity-50"
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
  // Square migration Wave S2 #1 follow-up (2026-09-09): bounty-purchase routing. Presence of
  // bountySubmissionId signals "this checkout is a bounty purchase" -- when the organizer is
  // ALSO Square-onboarded, CheckoutModal skips the generic itemId/loadIntent/Stripe-Elements
  // path entirely (that path calls /stripe/create-payment-intent, which has no Square
  // equivalent) and instead tokenizes via the same Web Payments SDK component POS payment
  // requests already use (SquarePaymentRequestForm), then POSTs sourceId directly to
  // bountyController.ts's completeBountyPurchase. Every other CheckoutModal caller
  // (sales/[id].tsx, items/[id].tsx, vendor-booth, organizer/plan, auction resumption) never
  // passes these props, so the existing itemId/purchaseId Stripe flow below is untouched for
  // them -- this is an additive branch, not a rewrite.
  bountySubmissionId?: string;
  bountyItemPrice?: number; // item.price in dollars -- bounty purchases are never auctions/have no buyer premium or shipping, so this is the whole charge
  // Orphaned-PaymentIntent fix (2026-09-09, findasale-dev BUG MODE): the Stripe (non-Square)
  // sibling of the Square branch above. bountyController.ts's completeBountyPurchase Stripe
  // branch already creates the real PaymentIntent/Purchase for this submission before this
  // modal ever opens; the caller (submissions.tsx) passes that PaymentIntent's clientSecret
  // straight through here so this modal renders THAT PaymentIntent instead of falling into the
  // generic itemId/loadIntent path below (which used to mint a SECOND, unrelated PaymentIntent
  // via /stripe/create-payment-intent, orphaning the first). Deliberately NOT resolved via the
  // existing `purchaseId` resume branch (GET /stripe/pending-payment/:id) below -- that branch
  // has never been wired to any live page (confirmed via auctionJob.ts's 2026-09-09 knock-on
  // note: its Stripe fallback payment-link email points at a page that has never invoked it) --
  // so this fix supplies the already-known secret directly rather than becoming that branch's
  // first, unverified caller on a real-money path.
  bountyClientSecret?: string;
  organizerSquareOnboarded?: boolean;
  organizerSquareMerchantId?: string | null;
  organizerSquareLocationId?: string | null;
  // Square migration single-item-checkout fix (2026-09-11, findasale-dev BUG MODE): the raw,
  // pre-fee/pre-discount item price, passed by the parent page (already loaded there). Used
  // ONLY as the display amount for SquarePaymentRequestForm's Web Payments SDK card form when
  // isItemSquareOnly -- the ACTUAL charge is always computed server-side in
  // squarePaymentController.ts's createSquarePayment from itemId, same as every other
  // processor path in this app. Named distinctly from the existing `itemPrice` state (which
  // holds the server-confirmed Stripe total) to avoid shadowing it.
  rawItemPrice?: number;
  onClose: () => void;
  onSuccess: () => void;
}

const CheckoutModal = ({ itemId, purchaseId: initialPurchaseId, itemTitle, listingType, organizerName, saleId, shippingAvailable = false, shippingPrice = null, bountySubmissionId, bountyItemPrice, bountyClientSecret, organizerSquareOnboarded, organizerSquareMerchantId, organizerSquareLocationId, rawItemPrice, onClose, onSuccess }: CheckoutModalProps) => {
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
  // Square migration single-item-checkout fix (2026-09-11, findasale-dev BUG MODE): mirrors
  // isBountySquare's own organizerHasSquare gate exactly (squareOnboarded === true &&
  // !!squareMerchantId), scoped to the non-bounty generic itemId flow. Before this, EVERY
  // single-item "Buy Now" purchase from a Square-only organizer unconditionally hit
  // /stripe/create-payment-intent and was blocked with SELLER_PAYMENTS_UNAVAILABLE, since
  // Stripe's platform account is permanently closed and these organizers have no live
  // Stripe Connect account at all. v1 scope: item price only, no shipping/coupon support yet
  // (same precedent as the existing isBountySquare branch) -- adding those needs a small
  // architecture decision (a pre-charge quote step) this BUG MODE fix doesn't take on.
  const isItemSquareOnly = !bountySubmissionId && organizerSquareOnboarded === true && !!organizerSquareMerchantId;
  const [itemSquareSubmitting, setItemSquareSubmitting] = useState(false);
  const [itemSquareError, setItemSquareError] = useState<string | null>(null);
  const [itemSquareSuccess, setItemSquareSuccess] = useState(false);
  const [shipToMe, setShipToMe] = useState(false);
  const [shippingZipInput, setShippingZipInput] = useState('');
  const [shippingZipError, setShippingZipError] = useState<string | null>(null);
  // ADR-115 Phase 1: full street address, collected alongside the ZIP so an organizer can
  // actually ship to a real address -- the ZIP alone (ADR-110) is enough to PRICE shipping
  // but not enough to address a label. Same conditional-spread-into-POST-body pattern as
  // shippingZip; line1/city/state required when shipToMe is checked, line2 optional.
  const [shippingAddressLine1Input, setShippingAddressLine1Input] = useState('');
  const [shippingAddressLine2Input, setShippingAddressLine2Input] = useState('');
  const [shippingCityInput, setShippingCityInput] = useState('');
  const [shippingStateInput, setShippingStateInput] = useState('');
  const [shippingAddressError, setShippingAddressError] = useState<string | null>(null);
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
  const [started, setStarted] = useState(!!initialPurchaseId || !!bountyClientSecret); // auction resumption / bounty-Stripe purchase both skip the coupon step
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

    // Orphaned-PaymentIntent fix (2026-09-09): bounty purchase, Stripe (non-Square) organizer.
    // The real PaymentIntent + its clientSecret already exist (created by
    // completeBountyPurchase before this modal opened) -- render it directly, skip loadIntent's
    // network paths entirely. See the bountyClientSecret prop comment above for why this does
    // NOT go through the initialPurchaseId/getPendingPayment resume branch below instead.
    if (bountyClientSecret) {
      setClientSecret(bountyClientSecret);
      setItemPrice(bountyItemPrice ?? 0);
      return;
    }

    // Square migration single-item-checkout fix (2026-09-11, findasale-dev BUG MODE): this
    // organizer has no live Stripe Connect account -- skip the Stripe create-payment-intent
    // path entirely. The isItemSquareOnly render branch below (mirrors isBountySquare) handles
    // tokenization and charging via /square-payment/create-payment instead.
    if (isItemSquareOnly) {
      return;
    }

    const loadIntent = async () => {
      try {
        let data: any;
        if (initialPurchaseId) {
          // Resume an existing pending purchase (auction winners)
          const response = await api.get(`/stripe/pending-payment/${initialPurchaseId}`);
          data = response.data;
          if (data.itemTitle) setResolvedTitle(data.itemTitle);
        } else if (itemId) {
          // Stripe removal (2026-09-12): this branch only runs for a non-Square-onboarded
          // organizer -- isItemSquareOnly already returned early above for anyone with a
          // live Square account (see that guard a few lines up). There is no payment
          // processor left to route this through, so surface the standard seller-not-ready
          // message instead of calling the now-deleted /stripe/create-payment-intent
          // endpoint (removed this pass along with stripeController.ts's createPaymentIntent).
          setLoadError("This seller isn't set up to accept online payments yet. Please contact the organizer to arrange your purchase.");
          return;
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
  }, [started, itemId, initialPurchaseId, bountyClientSecret, bountyItemPrice]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSuccess = () => {
    onSuccess();
  };

  // Square migration Wave S2 #1 follow-up (2026-09-09): mirrors bountyController.ts's own
  // organizerHasSquare gate exactly (squareOnboarded === true && !!squareMerchantId) --
  // frontend and backend must never disagree about which processor is in play.
  const isBountySquare = !!bountySubmissionId && organizerSquareOnboarded === true && !!organizerSquareMerchantId;
  const [squareSubmitting, setSquareSubmitting] = useState(false);
  const [squareError, setSquareError] = useState<string | null>(null);
  const [squareSuccess, setSquareSuccess] = useState(false);

  // Called once SquarePaymentRequestForm's card.tokenize() succeeds (sourceId in hand).
  // Square's CreatePayment on the backend is synchronous -- completeBountyPurchase's Square
  // branch charges the card, deducts/awards XP, and marks the submission PURCHASED all in
  // this one call, returning { squarePaymentId, status, ... } with NO clientSecret and no
  // further client-side confirmation step (unlike the Stripe branch's PaymentIntent flow).
  // Success is keyed off squarePaymentId being present, not off a specific `status` string
  // value -- read directly from bountyController.ts: the response's `status` field is the
  // BountySubmission's own status ('PURCHASED'), not a separate 'PAID' payment-status enum.
  const handleSquareTokenized = async (sourceId: string) => {
    setSquareSubmitting(true);
    setSquareError(null);
    try {
      const response = await api.post(`/bounties/submissions/${bountySubmissionId}/purchase`, { sourceId });
      if (response.data?.squarePaymentId) {
        setSquareSuccess(true);
      } else {
        setSquareError('Payment did not complete. Please try again.');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Payment failed. Please try again.';
      setSquareError(msg);
    } finally {
      setSquareSubmitting(false);
    }
  };

  // Square migration single-item-checkout fix (2026-09-11, findasale-dev BUG MODE): sibling of
  // handleSquareTokenized above, for the generic (non-bounty) single-item flow. Square's
  // CreatePayment is synchronous on the backend (squarePaymentController.ts's createSquarePayment
  // header comment) -- charge, Purchase-row creation, and (for guests) the velocity guard all
  // happen in this one request/response, no webhook/confirm step needed.
  const handleItemSquareTokenized = async (sourceId: string) => {
    if (!itemId) return;
    setItemSquareSubmitting(true);
    setItemSquareError(null);
    try {
      // Parity with the Stripe guest path in loadIntent below: send a device fingerprint for
      // the same guestCheckoutVelocityGuard.ts carding-hardening check createSquarePayment
      // already runs (see squarePaymentController.ts's assertGuestCheckoutAllowed call).
      const deviceFingerprint = isGuest ? await generateDeviceFingerprint() : undefined;
      const response = await api.post('/square-payment/create-payment', {
        itemId,
        sourceId,
        ...(isGuest ? { guestEmail: guestEmail.trim(), guestName: guestName.trim(), deviceFingerprint } : {}),
      });
      if (response.data?.purchase || response.data?.squarePaymentId || response.data?.purchaseId) {
        if (response.data?.purchaseId) setPurchaseId(response.data.purchaseId);
        setItemSquareSuccess(true);
      } else {
        setItemSquareError('Payment did not complete. Please try again.');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Payment failed. Please try again.';
      setItemSquareError(msg);
    } finally {
      setItemSquareSubmitting(false);
    }
  };

  const isOpen = true; // This modal is shown conditionally by parent
  // Dark-mode-aware Stripe Elements appearance (S-dark-mode-audit): reads the actual
  // applied theme (the 'dark' class Tailwind's darkMode:'class' toggles on <html>), not
  // window.matchMedia('(prefers-color-scheme: dark)') -- that only reflects OS preference
  // and misses a user who explicitly picked dark mode in-app while their OS is light
  // (see hooks/useTheme.ts). Without this, Stripe's PaymentElement always renders its
  // default light UI regardless of the app's theme.
  const isDarkMode = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      ariaLabelledBy="checkout-modal-title"
      contentClassName="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6 max-h-[85vh] overflow-y-auto"
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

      {isBountySquare ? (
        // Square migration Wave S2 #1 follow-up (2026-09-09): bounty purchase, Square-onboarded
        // organizer. Skips the generic itemId/loadIntent/Stripe-Elements path entirely --
        // there is no clientSecret to fetch here, and no coupon/guest pre-step applies (this
        // endpoint requires an authenticated bounty owner and has no coupon support).
        <div>
          {squareSuccess ? (
            <div className="text-center">
              <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <p className="text-3xl mb-2">✅</p>
                <p className="text-lg font-bold text-green-900 dark:text-green-200 mb-1">Order Confirmed!</p>
                <p className="text-xs text-green-700 dark:text-green-400 mb-3">Your payment has been processed successfully.</p>
              </div>

              <div className="mb-4 p-4 bg-warm-50 dark:bg-gray-700 rounded-lg text-left space-y-3">
                <div>
                  <p className="text-xs text-warm-500 dark:text-warm-300">Item</p>
                  <p className="font-semibold text-warm-900 dark:text-warm-100">{itemTitle}</p>
                </div>
                <div>
                  <p className="text-xs text-warm-500 dark:text-warm-300">Total Paid</p>
                  <p className="text-lg font-bold text-warm-900 dark:text-warm-100">${(bountyItemPrice ?? 0).toFixed(2)}</p>
                </div>
              </div>

              {organizerName && (
                <p className="text-xs text-warm-600 mb-4 leading-relaxed">
                  This purchase was made directly with <strong>{organizerName}</strong> and processed
                  securely by Square. If you have any questions about your order &mdash; pickup,
                  condition, timing &mdash; {organizerName} is who to contact first.
                  {' '}FindA.Sale is here if you need help finding them or navigating the platform.
                </p>
              )}

              <button
                onClick={handleSuccess}
                className="w-full py-2 px-4 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <div className="mb-4 p-3 bg-warm-50 dark:bg-gray-700 rounded-lg">
                <p className="text-sm text-warm-600 dark:text-warm-300">Item</p>
                <p className="font-semibold text-warm-900 dark:text-warm-100">{itemTitle}</p>
                <div className="flex justify-between font-bold text-warm-900 dark:text-warm-100 border-t border-warm-300 dark:border-gray-600 pt-2 mt-2 text-sm">
                  <span>Total Due</span>
                  <span>${(bountyItemPrice ?? 0).toFixed(2)}</span>
                </div>
              </div>

              {squareError && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300 text-sm">
                  <p className="mb-2">{squareError}</p>
                  <button
                    type="button"
                    onClick={() => setSquareError(null)}
                    className="text-xs underline text-red-600 hover:text-red-800 font-medium"
                  >
                    Try Again
                  </button>
                </div>
              )}

              <SquarePaymentRequestForm
                requestId={bountySubmissionId!}
                totalAmountCents={Math.round((bountyItemPrice ?? 0) * 100)}
                squareLocationId={organizerSquareLocationId ?? null}
                onSuccess={handleSquareTokenized}
                onError={setSquareError}
                isProcessing={squareSubmitting}
              />

              <button
                type="button"
                onClick={onClose}
                disabled={squareSubmitting}
                className="w-full mt-3 py-2 px-4 border border-warm-300 dark:border-gray-600 rounded text-warm-700 dark:text-warm-300 hover:bg-warm-50 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      ) : (
        <>
      {/* Guest contact info (guests only) + Sprint 3 coupon entry (accounts only):
          shown before payment form loads. Coupons are per-account XP rewards, so a guest
          never sees that field; a logged-in buyer never sees the guest fields. */}
      {!started && !purchaseId && (
        <div>
          {/* ADR-110 Track 1: "ship this to me" + ZIP, collected before the PaymentElement
              mounts. Shown only when the item actually supports native-checkout shipping
              (mirrors stripeController's own gate) and is never offered on auction items. */}
          {canOfferShipping && !isItemSquareOnly && (
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
                <div className="mt-2 space-y-2">
                  {/* ADR-115 Phase 1: full street address, collected alongside the ZIP so the
                      organizer actually receives an address to ship the package to. */}
                  <div>
                    <label className="block text-sm font-medium text-warm-700 mb-1">
                      Street address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={shippingAddressLine1Input}
                      onChange={(e) => { setShippingAddressLine1Input(e.target.value); setShippingAddressError(null); }}
                      placeholder="123 Main St"
                      maxLength={200}
                      className="w-full px-3 py-2 border border-warm-300 rounded-lg bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      aria-label="Street address"
                      autoComplete="address-line1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-warm-700 mb-1">
                      Apt, suite, etc. (optional)
                    </label>
                    <input
                      type="text"
                      value={shippingAddressLine2Input}
                      onChange={(e) => setShippingAddressLine2Input(e.target.value)}
                      placeholder="Apt 4B"
                      maxLength={200}
                      className="w-full px-3 py-2 border border-warm-300 rounded-lg bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      aria-label="Apartment, suite, or unit"
                      autoComplete="address-line2"
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-warm-700 mb-1">
                        City <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={shippingCityInput}
                        onChange={(e) => { setShippingCityInput(e.target.value); setShippingAddressError(null); }}
                        placeholder="Grand Rapids"
                        maxLength={100}
                        className="w-full px-3 py-2 border border-warm-300 rounded-lg bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        aria-label="City"
                        autoComplete="address-level2"
                      />
                    </div>
                    <div className="w-20">
                      <label className="block text-sm font-medium text-warm-700 mb-1">
                        State <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={shippingStateInput}
                        onChange={(e) => { setShippingStateInput(e.target.value.toUpperCase()); setShippingAddressError(null); }}
                        placeholder="MI"
                        maxLength={2}
                        className="w-full px-3 py-2 border border-warm-300 rounded-lg bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent uppercase"
                        aria-label="State"
                        autoComplete="address-level1"
                      />
                    </div>
                  </div>
                  {shippingAddressError && (
                    <p className="text-xs text-red-600 mt-1" role="alert">{shippingAddressError}</p>
                  )}
                  <div>
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
                      className="w-full px-3 py-2 border border-warm-300 rounded-lg bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
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
                  className="w-full px-3 py-2 border border-warm-300 rounded-lg bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
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
                  className="w-full px-3 py-2 border border-warm-300 rounded-lg bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
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
          ) : !isItemSquareOnly ? (
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
                className="w-full px-3 py-2 border border-warm-300 rounded-lg bg-white dark:bg-gray-700 font-mono tracking-widest text-warm-900 dark:text-warm-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent uppercase"
                aria-label="Coupon code (optional)" />
              <p className="text-xs text-warm-400 mt-1">
                Coupons are issued after each completed purchase.
              </p>
            </div>
          ) : null}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-4 border border-warm-300 dark:border-gray-600 rounded text-warm-700 dark:text-warm-300 hover:bg-warm-50 dark:hover:bg-gray-700"
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
                  // ADR-115 Phase 1: full address required before advancing, same "block on
                  // Continue, not on submit" posture as the existing ZIP check below.
                  if (!shippingAddressLine1Input.trim()) {
                    setShippingAddressError('Enter your street address.');
                    return;
                  }
                  if (!shippingCityInput.trim()) {
                    setShippingAddressError('Enter your city.');
                    return;
                  }
                  if (!shippingStateInput.trim()) {
                    setShippingAddressError('Enter your state.');
                    return;
                  }
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
          {isItemSquareOnly ? (
            // Square migration single-item-checkout fix (2026-09-11, findasale-dev BUG MODE):
            // mirrors isBountySquare's own rendering branch above -- tokenize via
            // SquarePaymentRequestForm (Web Payments SDK), then POST sourceId to
            // /square-payment/create-payment, which is synchronous (charge + Purchase row
            // creation happen in that one request/response, no webhook/confirm step).
            <div>
              {itemSquareSuccess ? (
                <div className="text-center">
                  <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                    <p className="text-3xl mb-2">✅</p>
                    <p className="text-lg font-bold text-green-900 dark:text-green-200 mb-1">Order Confirmed!</p>
                    <p className="text-xs text-green-700 dark:text-green-400 mb-3">Your payment has been processed successfully.</p>
                  </div>
                  <button
                    onClick={handleSuccess}
                    className="w-full py-2 px-4 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-4 p-3 bg-warm-50 dark:bg-gray-700 rounded-lg">
                    <p className="text-sm text-warm-600 dark:text-warm-300">Item</p>
                    <p className="font-semibold text-warm-900 dark:text-warm-100">{resolvedTitle}</p>
                    <div className="flex justify-between font-bold text-warm-900 dark:text-warm-100 border-t border-warm-300 dark:border-gray-600 pt-2 mt-2 text-sm">
                      <span>Total Due</span>
                      <span>${(rawItemPrice ?? 0).toFixed(2)}</span>
                    </div>
                  </div>

                  {itemSquareError && (
                    <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300 text-sm">
                      <p className="mb-2">{itemSquareError}</p>
                      <button
                        type="button"
                        onClick={() => setItemSquareError(null)}
                        className="text-xs underline text-red-600 hover:text-red-800 font-medium"
                      >
                        Try Again
                      </button>
                    </div>
                  )}

                  <SquarePaymentRequestForm
                    requestId={itemId || purchaseId || 'item'}
                    totalAmountCents={Math.round((rawItemPrice ?? 0) * 100)}
                    squareLocationId={organizerSquareLocationId ?? null}
                    onSuccess={handleItemSquareTokenized}
                    onError={setItemSquareError}
                    isProcessing={itemSquareSubmitting}
                  />

                  <button
                    type="button"
                    onClick={onClose}
                    disabled={itemSquareSubmitting}
                    className="w-full mt-3 py-2 px-4 border border-warm-300 dark:border-gray-600 rounded text-warm-700 dark:text-warm-300 hover:bg-warm-50 dark:hover:bg-gray-700 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          ) : (
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
            <Elements stripe={getStripePromise()} options={{ clientSecret, appearance: { theme: isDarkMode ? 'night' : 'stripe' } }}>
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
        </>
      )}
        </>
      )}
    </AccessibleModal>
  );
};

export default CheckoutModal;
