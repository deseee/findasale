/**
 * Stripe Connect Redirect (Creator)
 *
 * Legacy route for creator Stripe setup. Redirects to organizer settings
 * where Stripe onboarding is actually handled.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

const ConnectStripeRedirect = () => {
  const router = useRouter();

  useEffect(() => {
    // Auto-redirect after 1 second to allow the message to briefly appear
    const timer = setTimeout(() => {
      router.push('/organizer/settings?tab=payments');
    }, 1000);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <>
      <Head>
        <title>Connecting to Stripe - FindA.Sale</title>
      </Head>
      <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-3">
            Setting up Stripe
          </h2>
          <p className="text-warm-600 dark:text-warm-400 mb-6">
            Stripe setup has moved to your settings page. Redirecting...
          </p>
          <div className="flex justify-center gap-1">
            <div className="w-2 h-2 bg-amber-600 rounded-full animate-bounce" />
            <div className="w-2 h-2 bg-amber-600 rounded-full animate-bounce delay-100" />
            <div className="w-2 h-2 bg-amber-600 rounded-full animate-bounce delay-200" />
          </div>
          <p className="text-xs text-warm-500 dark:text-warm-400 mt-6">
            If you are not redirected, <a href="/organizer/settings?tab=payments" className="underline hover:text-warm-600">click here</a>.
          </p>
        </div>
      </div>
    </>
  );
};

export default ConnectStripeRedirect;
