/**
 * Persistent Purchase Confirmation Page
 * Feature #174+#80: Auction Win / Purchase Confirmation
 *
 * Displays purchase confirmation details on a persistent page.
 * Accessible via: /purchases/[purchaseId]
 */

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import Head from 'next/head';
import Skeleton from '../../components/Skeleton';

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
            href="/shopper/purchases"
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
          </div>

          {/* Item Photo */}
          {item?.photoUrls && item.photoUrls.length > 0 && (
            <div className="mb-10">
              <img
                key={item.photoUrls[0]}
                src={item.photoUrls[0]}
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
                Sold by <span className="font-medium text-gray-700 dark:text-gray-300">{organizer.name}</span>
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

          {/* Auction Buyer Premium Breakdown (auction items only) */}
          {isAuction && item?.auctionStartPrice && (
            <div className="mb-8 p-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-4 uppercase tracking-wide">
                🏆 Winning Bid Breakdown
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-blue-600 dark:text-blue-400">Winning Bid</span>
                  <span className="font-medium text-blue-900 dark:text-blue-100">
                    ${item.auctionStartPrice.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-blue-600 dark:text-blue-400">Buyer Premium (5%)</span>
                  <span className="font-medium text-blue-900 dark:text-blue-100">
                    ${(item.auctionStartPrice * 0.05).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-blue-200 dark:border-blue-700 font-bold">
                  <span className="text-blue-900 dark:text-blue-100">Total</span>
                  <span className="text-blue-900 dark:text-blue-100">
                    ${(item.auctionStartPrice * 1.05).toFixed(2)}
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
                  ${purchase.amount.toFixed(2)}
                </span>
              </div>
              {purchase.stripePaymentIntentId && (
                <div className="flex justify-between items-center pt-3 border-t border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400 text-xs font-mono">Reference ID</span>
                  <span className="text-gray-700 dark:text-gray-300 text-xs font-mono break-all">
                    {purchase.stripePaymentIntentId.substring(purchase.stripePaymentIntentId.length - 8)}
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
              href="/shopper/purchases"
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

          {/* Warm closing message */}
          <div className="mt-10 text-center text-sm text-gray-600 dark:text-gray-400">
            <p>
              Questions about your purchase? Visit your{' '}
              <Link href="/shopper/messages" className="text-amber-600 hover:text-amber-700 dark:text-amber-500 dark:hover:text-amber-400 font-medium">
                messages
              </Link>
              {' '}to contact the organizer.
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default PurchaseConfirmationPage;
