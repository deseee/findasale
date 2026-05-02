import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import api from '../../../lib/api';

interface VerificationState {
  status: 'loading' | 'success' | 'already-verified' | 'expired' | 'invalid';
  organizerName?: string;
  error?: string;
}

export default function VerifyClaimPage() {
  const router = useRouter();
  const { token } = router.query;
  const [state, setState] = useState<VerificationState>({ status: 'loading' });

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) return;

      try {
        const response = await api.get(`/organizers/claim/verify/${token}`);

        if (response.status === 200) {
          if (response.data.alreadyVerified) {
            setState({ status: 'already-verified' });
          } else {
            setState({
              status: 'success',
              organizerName: response.data.organizerName,
            });
          }
        }
      } catch (error: any) {
        if (error.response?.status === 410) {
          setState({ status: 'expired' });
        } else if (error.response?.status === 404) {
          setState({ status: 'invalid' });
        } else {
          setState({ status: 'invalid', error: 'An error occurred during verification' });
        }
      }
    };

    verifyToken();
  }, [token]);

  return (
    <>
      <Head>
        <title>Verify Claim Request - FindA.Sale</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-warm-50 to-warm-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {state.status === 'loading' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto mb-4"></div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Verifying your email...
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                This may take a moment.
              </p>
            </div>
          )}

          {state.status === 'success' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
              <div className="text-5xl mb-4">✓</div>
              <h1 className="text-2xl font-bold text-green-600 dark:text-green-400 mb-2">
                Email Verified!
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Thank you for verifying your email. We'll review your claim request for{' '}
                <strong>{state.organizerName}</strong> within 2-3 business days.
              </p>
              <Link
                href="/"
                className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
              >
                Back to FindA.Sale
              </Link>
            </div>
          )}

          {state.status === 'already-verified' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
              <div className="text-5xl mb-4">ℹ️</div>
              <h1 className="text-2xl font-bold text-blue-600 dark:text-blue-400 mb-2">
                Already Verified
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                This verification link has already been used. Your claim request is being reviewed.
              </p>
              <Link
                href="/"
                className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
              >
                Back to FindA.Sale
              </Link>
            </div>
          )}

          {state.status === 'expired' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
              <div className="text-5xl mb-4">⏱️</div>
              <h1 className="text-2xl font-bold text-orange-600 dark:text-orange-400 mb-2">
                Link Expired
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                This verification link has expired. Verification links are only valid for 72 hours.
                Please submit a new claim request.
              </p>
              <Link
                href="/"
                className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
              >
                Submit New Claim
              </Link>
            </div>
          )}

          {state.status === 'invalid' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
              <div className="text-5xl mb-4">❌</div>
              <h1 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-2">
                Invalid Link
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {state.error || 'This verification link is invalid or has already been used.'}
              </p>
              <Link
                href="/"
                className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
              >
                Back to FindA.Sale
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
