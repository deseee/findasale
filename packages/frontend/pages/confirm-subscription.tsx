/**
 * Confirm-subscription page (2026-09-30): the landing page for the link in the guest sale-reminder confirmation email
 * (double opt-in). The link carries a single-use token that is valid for 48 hours. Nothing is confirmed until the
 * visitor presses the button, so a mail scanner that merely opens the link cannot confirm an address. Same look as
 * the other email-link pages (unsubscribe, verify-email).
 */
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import api from '../lib/api';

type Status = 'ready' | 'working' | 'success' | 'error' | 'invalid';

const ConfirmSubscriptionPage = () => {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('working');
  const [message, setMessage] = useState('');
  const [saleId, setSaleId] = useState<string | null>(null);
  const [saleTitle, setSaleTitle] = useState<string | null>(null);

  const token = typeof router.query.token === 'string' ? router.query.token : '';

  useEffect(() => {
    if (!router.isReady) return;
    if (token) {
      setStatus('ready');
    } else {
      setStatus('invalid');
      setMessage('This confirmation link is incomplete. Please use the link from your email, or subscribe again from the sale page.');
    }
  }, [router.isReady, token]);

  const confirm = async () => {
    setStatus('working');
    try {
      const res = await api.post('/notifications/confirm-email-subscription', { token });
      setSaleId(res.data?.saleId ?? null);
      setSaleTitle(res.data?.saleTitle ?? null);
      setStatus('success');
    } catch (error: any) {
      setStatus('error');
      setMessage(
        error?.response?.data?.message ||
          'We could not confirm this right now. Please try the link again in a moment.'
      );
    }
  };

  return (
    <>
      <Head>
        <title>Confirm Sale Reminders - FindA.Sale</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-warm-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-6">Sale Reminders</h1>

          {status === 'working' && (
            <p className="text-warm-600 dark:text-warm-400">Processing your request...</p>
          )}

          {status === 'ready' && (
            <div className="p-4 bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg">
              <p className="text-sm text-warm-700 dark:text-warm-300 mb-4">
                Press the button to confirm that you want email reminders before this sale opens. Every reminder has a link to stop them.
              </p>
              <button
                type="button"
                onClick={confirm}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition-colors"
              >
                Yes, send me reminders
              </button>
            </div>
          )}

          {status === 'success' && (
            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-800 dark:text-green-200">
              <p className="font-medium mb-2">You are confirmed</p>
              <p className="text-sm">
                We will email you a reminder before {saleTitle ? `"${saleTitle}"` : 'the sale'} opens. Every email has a link to stop them.
              </p>
              {saleId && (
                <p className="text-sm mt-3">
                  <Link href={`/sales/${saleId}`} className="underline">View the sale</Link>
                </p>
              )}
            </div>
          )}

          {(status === 'error' || status === 'invalid') && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-800 dark:text-red-200">
              <p className="font-medium mb-2">We could not confirm this</p>
              <p className="text-sm">{message}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ConfirmSubscriptionPage;
