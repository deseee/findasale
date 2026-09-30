import React, { useState, useEffect, useRef } from 'react';
import api from '../lib/api';
import AccessibleModal from './AccessibleModal';
import { useAuth } from './AuthContext';
import { SquarePaymentRequestForm } from './SquarePaymentRequestForm';
import { getAffiliateLinkIdForCheckout } from '../lib/affiliateAttribution';

// Checkout modal. Stripe removal (2026-09-30): the Stripe Elements/PaymentIntent branch is gone;
// Square (single-item + bounty) is the only live payment path, everything else shows a
// seller-not-ready / cannot-complete message.
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resolvedTitle, setResolvedTitle] = useState(itemTitle);
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

    // Square migration single-item-checkout fix (2026-09-11): a Square-onboarded organizer's
    // item is rendered by the isItemSquareOnly branch below (SquarePaymentRequestForm ->
    // /square-payment/create-payment); nothing to load here.
    if (isItemSquareOnly) {
      return;
    }

    // Stripe removal (2026-09-12/30): there is no processor left for a non-Square organizer,
    // and Stripe-era pending purchases (auction-winner resume via initialPurchaseId, or a bounty
    // clientSecret) can no longer be paid because Stripe's platform account/API is closed.
    // Surface an honest message instead of calling a dead endpoint.
    if (initialPurchaseId || bountyClientSecret) {
      setLoadError("This payment can no longer be completed online. Please contact the organizer to arrange your purchase.");
      return;
    }
    if (itemId) {
      setLoadError("This seller isn't set up to accept online payments yet. Please contact the organizer to arrange your purchase.");
      return;
    }
    setLoadError('Invalid checkout configuration.');
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
      // Creator Program attribution (validated server-side; undefined when there is none).
      const affiliateLinkId = getAffiliateLinkIdForCheckout();
      const response = await api.post('/square-payment/create-payment', {
        itemId,
        sourceId,
        ...(affiliateLinkId ? { affiliateLinkId } : {}),
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
                  securely by Square. If you have any questions about your order (pickup,
                  condition, timing), {organizerName} is who to contact first.
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
              {/* No live processor to retry against (Stripe removal): offer a way out instead */}
              <button
                className="block text-xs underline text-red-600 hover:text-red-800 font-medium"
                onClick={onClose}
              >
                Close
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
