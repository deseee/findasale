/**
 * Suspended-account screen (2026-09-30). lib/api.ts sends a suspended user here after an action is refused with
 * 403 ACCOUNT_SUSPENDED. The page makes no authenticated requests of its own and is never redirected away from, so it
 * cannot loop. The stored reason is shown only when it is readable text (internal codes are not shown).
 */
import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../components/AuthContext';
import { AUTH_COPY, readableSuspensionReason } from '../lib/authRefresh';

const AccountSuspendedPage = () => {
  const { logout } = useAuth();
  const [reason, setReason] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('fas_account_suspended');
      if (raw) setReason(readableSuspensionReason(JSON.parse(raw)?.reason));
    } catch {
      /* storage blocked or unreadable: show the generic message */
    }
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      try { sessionStorage.removeItem('fas_account_suspended'); } catch { /* storage blocked */ }
      window.location.href = '/login';
    }
  };

  return (
    <>
      <Head>
        <title>Account suspended - FindA.Sale</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-warm-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-6">{AUTH_COPY.suspendedTitle}</h1>
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-900 dark:text-amber-200 text-left">
            <p className="text-sm mb-2">{AUTH_COPY.suspendedBody}</p>
            {reason && <p className="text-sm font-medium">Reason given: {reason}</p>}
          </div>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="mailto:support@finda.sale?subject=Account%20suspension%20review"
              className="px-4 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition-colors"
            >
              Contact support
            </a>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg text-warm-700 font-medium hover:bg-warm-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {loggingOut ? 'Logging out...' : 'Log out'}
            </button>
          </div>
          <p className="mt-6 text-sm text-warm-600 dark:text-warm-400">
            <Link href="/" className="underline">Back to FindA.Sale</Link>
          </p>
        </div>
      </div>
    </>
  );
};

export default AccountSuspendedPage;
