import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import api from '../../lib/api';

// ADR-139: double-opt-in confirmation. The email links here; consent is recorded only when the
// person presses the button (a POST), so automated link scanners that open the link cannot confirm.

type Phase = 'idle' | 'submitting' | 'done' | 'error';

export default function RecruitConfirmPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');

  const leadId = typeof router.query.lead === 'string' ? router.query.lead : '';
  const sig = typeof router.query.sig === 'string' ? router.query.sig : '';
  const linkOk = leadId.length > 0 && leadId.length <= 64 && sig.length > 0 && sig.length <= 128;

  const onConfirm = async () => {
    setPhase('submitting');
    setError('');
    try {
      await api.post('/recruit/confirm', { leadId, sig });
      setPhase('done');
    } catch (err: any) {
      const status = err?.response?.status;
      setError(
        status === 400
          ? 'This confirmation link is not valid. Please use the link from your most recent email.'
          : status === 429
          ? 'Too many tries from this connection. Please try again in an hour.'
          : 'Something went wrong on our side. Please try again later.'
      );
      setPhase('error');
    }
  };

  return (
    <>
      <Head>
        <title>Confirm Your Request - FindA.Sale</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="min-h-screen bg-gradient-to-br from-warm-50 to-warm-100 dark:from-gray-900 dark:to-gray-800 flex items-start sm:items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 sm:p-8 text-center">
          {!router.isReady ? (
            <div className="py-10 text-gray-500 dark:text-gray-400" role="status">Loading...</div>
          ) : !linkOk ? (
            <>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">This link is incomplete</h1>
              <p className="text-gray-600 dark:text-gray-400">Please open the confirmation link from your email again.</p>
            </>
          ) : phase === 'done' ? (
            <>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">You are confirmed</h1>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Thanks. Your getting-started guide is on its way. You can unsubscribe from any email we send.
              </p>
              <Link
                href="/register?role=organizer&utm_source=recruit&utm_campaign=confirm"
                className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
              >
                Create your first sale and add items
              </Link>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">Confirm your request</h1>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Please confirm you asked for information about listing your sales on FindA.Sale.
              </p>
              {error && (
                <p className="mb-4 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 rounded-lg px-3 py-2" role="alert">
                  {error}
                </p>
              )}
              <button
                type="button"
                onClick={onConfirm}
                disabled={phase === 'submitting'}
                className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
              >
                {phase === 'submitting' ? 'Confirming...' : 'Confirm my request'}
              </button>
              <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                If you did not ask for this, close this page and you will not hear from us. The FindA.Sale Team.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
