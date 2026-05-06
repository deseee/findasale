import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import api from '../lib/api';

export default function DoNotSell() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleOptOut = async () => {
    setStatus('loading');
    try {
      await api.post('/users/me/do-not-sell');
      setStatus('success');
      setMessage('Your preference has been recorded. We will not sell your personal information.');
    } catch (err: any) {
      setStatus('error');
      setMessage(err.response?.data?.message || 'An error occurred. Please try again.');
    }
  };

  return (
    <>
      <Head>
        <title>Do Not Sell My Personal Information — FindA.Sale</title>
        <meta name="description" content="Exercise your CCPA rights and opt out of data sale." />
      </Head>
      <div className="max-w-2xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6">
          Do Not Sell My Personal Information
        </h1>
        <p className="text-gray-700 dark:text-gray-300 mb-4">
          Under the California Consumer Privacy Act (CCPA), California residents have the right to opt out of the sale of their personal information.
        </p>
        <p className="text-gray-700 dark:text-gray-300 mb-8">
          FindA.Sale does not sell personal information in exchange for monetary consideration. However, we respect your rights under CCPA. If you would like to exercise your opt-out right, click the button below.
        </p>

        {status === 'success' ? (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-6">
            <p className="text-green-800 dark:text-green-300 font-medium">{message}</p>
          </div>
        ) : (
          <button
            onClick={handleOptOut}
            disabled={status === 'loading'}
            className="bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white font-semibold px-8 py-3 rounded-lg transition-colors"
          >
            {status === 'loading' ? 'Processing...' : 'Opt Out of Data Sale'}
          </button>
        )}

        {status === 'error' && (
          <p className="mt-4 text-red-600 dark:text-red-400">{message}</p>
        )}

        <p className="mt-8 text-sm text-gray-500 dark:text-gray-400">
          For questions about this policy, contact us at{' '}
          <a href="mailto:privacy@finda.sale" className="text-amber-600 hover:text-amber-700">
            privacy@finda.sale
          </a>.{' '}
          <Link href="/terms" className="text-amber-600 hover:text-amber-700">
            Terms of Service
          </Link>
          {' · '}
          <Link href="/privacy" className="text-amber-600 hover:text-amber-700">
            Privacy Policy
          </Link>
        </p>
      </div>
    </>
  );
}
