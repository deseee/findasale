import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import api from '../lib/api';

export default function UnsubscribePage() {
  const router = useRouter();
  const { email } = router.query;
  const [status, setStatus] = useState<'pending' | 'loading' | 'success' | 'error'>('pending');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!router.isReady) return;
    if (!email || typeof email !== 'string') {
      setStatus('error');
      setMessage('No email address provided. Please use the unsubscribe link from your reminder email.');
      return;
    }
    // Auto-trigger on page load (one-click unsubscribe as required by CAN-SPAM)
    setStatus('loading');
    api.get(`/notifications/unsubscribe-email?email=${encodeURIComponent(email)}`)
      .then((res) => {
        setStatus('success');
        setMessage(res.data.count > 0
          ? `You've been unsubscribed from all FindA.Sale reminder emails.`
          : `No active subscriptions found for ${email}.`);
      })
      .catch(() => {
        setStatus('error');
        setMessage('Something went wrong. Please try again or contact us at hello@finda.sale.');
      });
  }, [router.isReady, email]);

  return (
    <>
      <Head>
        <title>Unsubscribe — FindA.Sale</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-xl shadow-md p-8 max-w-md w-full text-center">
          {status === 'loading' && (
            <>
              <div className="text-4xl mb-4">⏳</div>
              <h1 className="text-xl font-bold text-gray-800 mb-2">Unsubscribing…</h1>
              <p className="text-gray-500 text-sm">Just a moment.</p>
            </>
          )}
          {status === 'success' && (
            <>
              <div className="text-4xl mb-4">✅</div>
              <h1 className="text-xl font-bold text-gray-800 mb-2">Unsubscribed</h1>
              <p className="text-gray-600 text-sm mb-6">{message}</p>
              <Link href="/" className="text-blue-600 hover:underline text-sm">Browse estate sales →</Link>
            </>
          )}
          {status === 'error' && (
            <>
              <div className="text-4xl mb-4">⚠️</div>
              <h1 className="text-xl font-bold text-gray-800 mb-2">Something went wrong</h1>
              <p className="text-gray-600 text-sm mb-6">{message}</p>
              <Link href="/" className="text-blue-600 hover:underline text-sm">Go to homepage →</Link>
            </>
          )}
          {status === 'pending' && (
            <>
              <div className="text-4xl mb-4">📧</div>
              <h1 className="text-xl font-bold text-gray-800 mb-2">Unsubscribe from reminders</h1>
              <p className="text-gray-500 text-sm">Loading…</p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
