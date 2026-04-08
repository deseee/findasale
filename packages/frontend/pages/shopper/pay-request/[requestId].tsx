import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';
import { usePOSPaymentRequest } from '../../../hooks/usePOSPaymentRequest';
import { PaymentRequestForm } from '../../../components/PaymentRequestForm';
import api from '../../../lib/api';

interface CountdownState {
  hours: number;
  minutes: number;
  seconds: number;
}

export default function PaymentRequestPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { requestId } = router.query;

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [countdown, setCountdown] = useState<CountdownState | null>(null);

  const { data: request, isLoading, isError, status } = usePOSPaymentRequest(
    requestId as string | undefined
  );

  // Update countdown timer
  useEffect(() => {
    if (!request) return;

    const updateCountdown = () => {
      const now = new Date();
      const expiresAt = new Date(request.expiresAt);
      const diff = Math.max(0, expiresAt.getTime() - now.getTime());

      const totalSeconds = Math.floor(diff / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      setCountdown({ hours, minutes, seconds });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [request]);

  // Handle payment status updates
  useEffect(() => {
    if (status === 'PAID') {
      showToast('Payment successful! Redirecting...', 'success');
      setTimeout(() => {
        router.push('/shopper/purchases');
      }, 2000);
    }
  }, [status, router, showToast]);

  // Auto-show payment form when status is ACCEPTED (handles page reload or direct link navigation)
  useEffect(() => {
    if (isAccepted && request?.clientSecret) {
      setShowPaymentForm(true);
    }
  }, [isAccepted, request?.clientSecret]);

  const handleAccept = async () => {
    if (!requestId) return;
    setIsAccepting(true);
    try {
      const response = await api.post(
        `/pos/payment-request/${requestId}/accept`,
        {}
      );
      setShowPaymentForm(true);
      showToast('Request accepted. Please complete payment.', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to accept request', 'error');
    } finally {
      setIsAccepting(false);
    }
  };

  const handleDecline = async () => {
    if (!requestId) return;
    setIsDeclining(true);
    try {
      await api.post(`/pos/payment-request/${requestId}/decline`, {
        reason: 'USER_CANCEL',
      });
      showToast('Request declined', 'info');
      router.push('/shopper/dashboard');
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to decline request', 'error');
    } finally {
      setIsDeclining(false);
    }
  };

  const handlePaymentSuccess = () => {
    // Redirect immediately after Stripe confirms — don't wait for webhook
    showToast('Payment successful! Redirecting...', 'success');
    setTimeout(() => {
      router.push('/shopper/purchases');
    }, 1500);
  };

  const handlePaymentError = (error: string) => {
    showToast(error, 'error');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-sage-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading payment request...</p>
        </div>
      </div>
    );
  }

  if (isError || !request) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Payment Request Not Found</h1>
          <p className="text-gray-600 mb-6">This payment request could not be loaded.</p>
          <button
            onClick={() => router.push('/shopper/dashboard')}
            className="bg-sage-600 hover:bg-sage-700 text-white font-semibold py-2 px-6 rounded-lg"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const isExpired = request.isExpired || status === 'EXPIRED';
  const isPaid = status === 'PAID';
  const isDeclined = status === 'DECLINED';
  const isPending = status === 'PENDING' || !status;
  const isAccepted = status === 'ACCEPTED';

  return (
    <>
      <Head>
        <title>Payment Request - FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-sage-50 to-gray-50 py-8 px-4 sm:px-6">
        <div className="max-w-md mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Payment Request</h1>
            <p className="text-gray-600">{request.organizerName}</p>
          </div>

          {/* Status Banner */}
          {isExpired && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 font-semibold">This payment request has expired</p>
            </div>
          )}

          {isPaid && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-700 font-semibold">Payment completed successfully!</p>
            </div>
          )}

          {isDeclined && (
            <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <p className="text-orange-700 font-semibold">You declined this payment request</p>
            </div>
          )}

          {/* Payment Details Card */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            {/* Sale Info */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">{request.saleName}</h2>
              {request.saleLocation && (
                <p className="text-sm text-gray-600">{request.saleLocation}</p>
              )}
            </div>

            {/* Items List */}
            {request.itemNames && request.itemNames.length > 0 && (
              <div className="mb-6 pb-6 border-b border-gray-200">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Items</h3>
                <ul className="space-y-1">
                  {request.itemNames.map((name, i) => (
                    <li key={i} className="text-sm text-gray-600">• {name}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Total */}
            <div className="mb-6 pb-6 border-b border-gray-200">
              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span className="text-sage-600">{request.displayAmount}</span>
              </div>
            </div>

            {/* Countdown Timer */}
            {countdown && !isExpired && !isPaid && !isDeclined && (
              <div className="mb-6">
                <p className="text-sm text-gray-600 mb-2">Expires in</p>
                <div className="text-3xl font-bold text-sage-600">
                  {countdown.hours > 0 && `${countdown.hours}h `}
                  {countdown.minutes}m {countdown.seconds}s
                </div>
              </div>
            )}
          </div>

          {/* Payment Form or Action Buttons */}
          {showPaymentForm && request.clientSecret && (
            <div className="mb-6">
              <PaymentRequestForm
                requestId={request.id}
                clientSecret={request.clientSecret}
                totalAmountCents={request.totalAmountCents}
                stripeAccountId={request.organizerStripeAccountId}
                onSuccess={handlePaymentSuccess}
                onError={handlePaymentError}
                isProcessing={isPaid}
              />
            </div>
          )}

          {/* Action Buttons */}
          {!showPaymentForm && !isExpired && !isPaid && !isDeclined && (
            <div className="space-y-3 mb-6">
              <button
                onClick={handleAccept}
                disabled={isAccepting || isAccepted}
                className="w-full bg-sage-600 hover:bg-sage-700 disabled:bg-gray-300 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
              >
                {isAccepting ? 'Processing...' : isAccepted ? 'Accepted' : 'Accept & Pay'}
              </button>
              <button
                onClick={handleDecline}
                disabled={isDeclining}
                className="w-full bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 text-gray-900 font-semibold py-3 px-4 rounded-lg transition-colors"
              >
                {isDeclining ? 'Processing...' : 'Decline'}
              </button>
            </div>
          )}

          {/* Return to Dashboard */}
          {(isExpired || isPaid || isDeclined) && (
            <button
              onClick={() => router.push('/shopper/dashboard')}
              className="w-full bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              Return to Dashboard
            </button>
          )}
        </div>
      </div>
    </>
  );
}
