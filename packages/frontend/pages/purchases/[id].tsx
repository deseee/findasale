/**
 * Persistent Purchase Confirmation Page
 * Feature #174+#80: Auction Win / Purchase Confirmation
 *
 * Displays purchase confirmation details on a persistent page.
 * Accessible via: /purchases/[purchaseId]
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AUCTION_BUYER_PREMIUM_RATE, AUCTION_BUYER_PREMIUM_LABEL } from '../../lib/platformFees';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import Head from 'next/head';
import Skeleton from '../../components/Skeleton';
import { getItemImageUrl } from '../../lib/imageUtils';
import CheckoutModal from '../../components/CheckoutModal';

const PurchaseConfirmationPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { id: purchaseId } = router.query;

  const { data: purchase, isLoading, isError } = useQuery({
    queryKey: ['purchase', purchaseId],
    queryFn: async () => {
      if (purchaseId) {
        const response = await api.get(`/users/purchases/${purchaseId}`);
        return response.data;
      }
      return null;
    },
    enabled: !!user?.id && !!purchaseId,
  });

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/login?redirect=/purchases/${purchaseId || ''}`);
    }
  }, [user, authLoading, purchaseId, router]);

  // Stripe dead-link fix (2026-09-09, findasale-dev BUG MODE): this page is where
  // jobs/auctionJob.ts's "Complete Payment" winner email now points a Stripe-only auction
  // winner (previously pointed at /shopper/purchases, which is not a real route and 404'd --
  // CheckoutModal.tsx's purchaseId-resume branch, GET /stripe/pending-payment/:purchaseId,
  // was fully functional server-side but had no caller). A purchase that loads here still
  // PENDING on Stripe means the winner hasn't paid yet, so the checkout modal auto-opens.
  // Square is excluded: a Square-onboarded organizer's auction winner goes straight to
  // Square's own hosted checkout link and never reaches this page at all.
  const queryClient = useQueryClient();
  const [showCheckout, setShowCheckout] = useState(false);
  // Scoped to AUCTION items specifically (not "any PENDING Stripe purchase"): a normal
  // fixed-price online checkout also reads PENDING here for a few seconds after a buyer
  // pays -- CheckoutModal.tsx's handleDone redirects an authenticated buyer straight to this
  // page the instant stripe.confirmPayment() resolves client-side, but the DB row only flips
  // to PAID once stripeController.ts's payment_intent.succeeded webhook lands, which can lag
  // behind that redirect. Auto-opening a resume-payment modal in that window would ask a buyer
  // who just paid to pay again. Auction items have no such race: the ONLY way a winner reaches
  // this page is via the emailed "Complete Payment" link (jobs/auctionJob.ts), sent before the
  // winner has paid anything at all, so PENDING here always means payment is genuinely owed.
  const isPendingStripePayment =
    !!purchase &&
    purchase.item?.listingType === 'AUCTION' &&
    purchase.status === 'PENDING' &&
    purchase.processor !== 'SQUARE' &&
    !!purchase.stripePaymentIntentId;
  useEffect(() => {
    if (isPendingStripePayment) {
      setShowCheckout(true);
    }
  }, [isPendingStripePayment]);

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <Skeleton className="h-20 w-20 rounded-full mx-auto mb-8" />
          <Skeleton className="h-12 w-64 mx-auto mb-4" />
          <Skeleton className="h-64 w-full rounded-lg mb-8" />
          <Skeleton className="h-24 w-full mb-4" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    );
  }

  if (isError || !purchase) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="mb-4">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-red-100 dark:bg-red-900">
              <svg className="h-8 w-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Purchase Not Found</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            We couldn't load your purchase details.
          </p>
          <Link
            href="/shopper/history"
            className="inline-block px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg transition"
          >
            View My Purchases
          </Link>
        </div>
      </div>
    );
  }

  const item = purchase.item;
  const sale = purchase.sale;
  const pickupDates = sale?.startDate && sale?.endDate
    ? `${new Date(sale.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(sale.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : null;
  const pickupAddress = sale?.address && sale?.city ? `${sale.address}, ${sale.city}, ${sale.state} ${sale.zip}` : null;
  const organizer = sale?.organizer;
  const isAuction = item?.listingType === 'AUCTION';

  // The winning-bid breakdown below used to use `item.auctionStartPrice` as the winning bid —
  // that is the STARTING price, the number the lot opened at, not what this buyer won it for,
  // so a lot opened at $50 and won at $200 showed "$50.00 winning bid, $2.50 premium, $52.50
  // total" against a $210.00 charge. The real figures are derived from `purchase.amount`, which
  // IS what the card was run for, with the platform premium split back out (or none at all when
  // the organizer covered it, #402). subtotal + premium always equals the amount paid, by
  // construction. Prefers the fee SNAPSHOT the backend now records on the Purchase — that is
  // the exact premium this card was charged — and falls back to the arithmetic for rows created
  // before the snapshot existed.
  const purchaseAmount = Number(purchase.amount) || 0;
  const buyerPaidPremium = isAuction && sale?.coversFee !== true;
  const snapshotPremium = purchase.buyerPremiumAmount;
  const buyerPremiumPaid = !buyerPaidPremium
    ? 0
    : snapshotPremium !== null && snapshotPremium !== undefined
      ? Number(snapshotPremium)
      : purchaseAmount - purchaseAmount / (1 + AUCTION_BUYER_PREMIUM_RATE);
  const winningBid = purchaseAmount - buyerPremiumPaid;

  // Determine status badge color
  const getStatusBadge = () => {
    switch (purchase.status) {
      case 'PAID':
        return (
          <div className="inline-block px-3 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-full text-xs font-semibold">
            ✓ Paid
          </div>
        );
      case 'PENDING':
        return (
          <div className="inline-block px-3 py-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 rounded-full text-xs font-semibold">
            ⏳ Pending
          </div>
        );
      case 'FAILED':
      case 'REFUNDED':
        return (
          <div className="inline-block px-3 py-1 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-full text-xs font-semibold">
            ✕ {purchase.status}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <Head>
        <title>Purchase Confirmed - FindA.Sale</title>
        <meta name="description" content="Your purchase has been confirmed!" />
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 py-12 px-4">
        <div className="max-w-2xl mx-auto">
          {/* Checkmark Circle */}
          <div className="flex justify-center mb-8">
            <div className="relative w-24 h-24">
              {/* Sage green circle background */}
              <div className="absolute inset-0 bg-[#a4a99e] dark:bg-[#7a7f74] rounded-full" />
              {/* Checkmark using SVG for better rendering */}
              <svg
                className="absolute inset-0 w-24 h-24 text-white dark:text-gray-900"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>

          {/* Headline */}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-3" style={{ fontFamily: 'Fraunces, serif' }}>
              It's yours! 🎉
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400 mb-3">
              Purchase confirmed
            </p>
            {getStatusBadge()}
            {isPendingStripePayment && (
              <div className="mt-4 max-w-sm mx-auto p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm text-amber-800 dark:text-amber-200 mb-3">
                  Payment still needed to secure this item.
                </p>
                <button
                  onClick={() => setShowCheckout(true)}
                  className="w-full py-2 px-4 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded"
                >
                  Complete Payment
                </button>
              </div>
            )}
          </div>

          {/* Item Photo */}
          {item?.photoUrls && item.photoUrls.length > 0 && (
            <div className="mb-10">
              <img
                key={item.photoUrls[0]}
                src={getItemImageUrl(item.photoUrls[0]) ?? item.photoUrls[0]}
                alt={item.title}
                className="w-full max-h-56 object-cover rounded-lg shadow-md dark:shadow-lg"
              />
            </div>
          )}

          {/* Item Title */}
          <div className="mb-6">
            <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white mb-2">
              {item?.title}
            </h2>
            {organizer && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Sold by <span className="font-medium text-gray-700 dark:text-gray-300">{organizer.businessName}</span>
              </p>
            )}
          </div>

          {/* Pickup Info Section */}
          {(pickupAddress || pickupDates) && (
            <div className="mb-8 p-6 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 uppercase tracking-wide">
                📍 Pickup Information
              </h3>
              <div className="space-y-3">
                {pickupAddress && (
                  <div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 uppercase tracking-wide font-medium">Location</p>
                    <p className="text-gray-900 dark:text-white font-medium">{pickupAddress}</p>
                  </div>
                )}
                {pickupDates && (
                  <div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 uppercase tracking-wide font-medium">Sale Dates</p>
                    <p className="text-gray-900 dark:text-white font-medium">{pickupDates}</p>
                  </div>
                )}
                <p className="text-xs text-gray-600 dark:text-gray-500 pt-2 border-t border-gray-300 dark:border-gray-700">
                  Contact the organizer for specific pickup times and details.
                </p>
              </div>
            </div>
          )}

          {/* Auction Buyer Premium Breakdown (auction items only, and only when a premium was
              actually charged — see the derivation above the return). */}
          {isAuction && buyerPremiumPaid > 0 && (
            <div className="mb-8 p-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-4 uppercase tracking-wide">
                🏆 Winning Bid Breakdown
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-blue-600 dark:text-blue-400">Winning Bid</span>
                  <span className="font-medium text-blue-900 dark:text-blue-100">
                    ${winningBid.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-blue-600 dark:text-blue-400">
                    Buyer Premium ({AUCTION_BUYER_PREMIUM_LABEL})
                  </span>
                  <span className="font-medium text-blue-900 dark:text-blue-100">
                    ${buyerPremiumPaid.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-blue-200 dark:border-blue-700 font-bold">
                  <span className="text-blue-900 dark:text-blue-100">Total</span>
                  <span className="text-blue-900 dark:text-blue-100">
                    ${purchaseAmount.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Order/Transaction Info */}
          <div className="mb-10 p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 uppercase tracking-wide">
              Order Details
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">Amount Paid</span>
                <span className="text-lg font-bold text-gray-900 dark:text-white">
                  {/* Always the real charge. The old expression recomputed a fake total from
                      auctionStartPrice * 1.05, so this row disagreed with the buyer's card
                      statement on every auction purchase. */}
                  ${purchaseAmount.toFixed(2)}
                </span>
              </div>
              {(purchase.stripePaymentIntentId || purchase.squarePaymentId) && (
                <div className="flex justify-between items-center pt-3 border-t border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400 text-xs font-mono">Reference ID</span>
                  <span className="text-gray-700 dark:text-gray-300 text-xs font-mono break-all">
                    {/* Processor-aware (2026-09-10 Stripe-copy sweep): squarePaymentId for
                        Square-processed purchases, stripePaymentIntentId for Stripe ones --
                        was hardcoded to stripePaymentIntentId only, which silently hid this
                        row for every Square purchase. */}
                    {(purchase.stripePaymentIntentId || purchase.squarePaymentId).substring((purchase.stripePaymentIntentId || purchase.squarePaymentId).length - 8)}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center pt-3 border-t border-gray-200 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400 text-xs">Confirmation Date</span>
                <span className="text-gray-700 dark:text-gray-300 text-xs">
                  {new Date(purchase.createdAt).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* CTAs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link
              href="/shopper/history"
              className="inline-flex items-center justify-center px-6 py-4 bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-800 text-white font-semibold rounded-lg transition shadow-md hover:shadow-lg"
            >
              View My Purchases
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center px-6 py-4 border-2 border-amber-600 text-amber-600 hover:bg-amber-50 dark:border-amber-500 dark:text-amber-500 dark:hover:bg-gray-800 font-semibold rounded-lg transition"
            >
              Keep Shopping
            </Link>
          </div>

          {/* Warm closing message — ADR-025 / legal-direct-charges-migration-2026-08-09.md
              deliverable #1: longer receipt/confirmation disclosure copy. Ships universally
              (not gated to the Direct-charges allowlist) since the organizer is the real
              seller of record under both charge models. Falls back to the original generic
              line if organizer data is ever missing (defensive, shouldn't happen in practice). */}
          <div className="mt-10 text-center text-sm text-gray-600 dark:text-gray-400">
            {organizer?.businessName ? (
              <p className="max-w-xl mx-auto leading-relaxed">
                This purchase was made directly with{' '}
                <span className="font-medium text-gray-700 dark:text-gray-300">{organizer.businessName}</span>{' '}
                and processed securely{purchase.processor === 'SQUARE' ? ' by Square' : ' by Stripe'}. If you have any questions about your order (pickup,
                condition, timing), {organizer.businessName} is who to contact first.
                Send them a message via your{' '}
                <Link href="/shopper/messages" className="text-amber-600 hover:text-amber-700 dark:text-amber-500 dark:hover:text-amber-400 font-medium">
                  messages
                </Link>
                . FindA.Sale is here if you need help finding them or navigating the platform.
              </p>
            ) : (
              <p>
                Questions about your purchase? Visit your{' '}
                <Link href="/shopper/messages" className="text-amber-600 hover:text-amber-700 dark:text-amber-500 dark:hover:text-amber-400 font-medium">
                  messages
                </Link>
                {' '}to contact the organizer.
              </p>
            )}
          </div>
        </div>
      </div>

      {isPendingStripePayment && showCheckout && (
        <CheckoutModal
          purchaseId={String(purchaseId)}
          itemTitle={item?.title || 'Item'}
          listingType={item?.listingType}
          organizerName={organizer?.businessName}
          saleId={purchase.saleId ?? undefined}
          onClose={() => setShowCheckout(false)}
          onSuccess={() => {
            setShowCheckout(false);
            // Re-fetch so the status badge / CTA flip from PENDING to PAID immediately --
            // the payment_intent.succeeded webhook (stripeController.ts) marks the Purchase
            // PAID asynchronously, so this may briefly still read PENDING; the user's own
            // in-modal success screen already confirmed the charge went through.
            queryClient.invalidateQueries({ queryKey: ['purchase', purchaseId] });
          }}
        />
      )}
    </>
  );
};

export default PurchaseConfirmationPage;
