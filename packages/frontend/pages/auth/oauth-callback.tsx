/**
 * /auth/oauth-callback
 *
 * Intermediate page that fires after OAuth login to redeem any pending invite code.
 * This page:
 * 1. Checks for a pending invite code in sessionStorage
 * 2. If found, calls /api/auth/redeem-invite to redeem it
 * 3. Redirects to the dashboard or home page
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';

const OAuthCallbackPage = () => {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const redeemInvite = async () => {
      // Wait for session to be loaded
      if (status !== 'authenticated') {
        return;
      }

      // P0-L1: Check if user needs to verify age (new OAuth user)
      try {
        const meResponse = await fetch('/api/auth/me', {
          method: 'GET',
          credentials: 'include',
        });

        if (meResponse.ok) {
          const meData = await meResponse.json();
          const user = meData.user;

          // If user has no ageVerifiedAt, redirect to age-verify page
          if (!user.ageVerifiedAt) {
            const returnTo = router.query.returnTo || '/organizer/dashboard';
            router.push(`/age-verify?returnTo=${encodeURIComponent(returnTo as string)}`);
            return;
          }
        }
      } catch (err) {
        console.error('Error checking user age verification status:', err);
        // Continue — don't block on age check error
      }

      // Check for pending invite code in sessionStorage
      const inviteCode = typeof window !== 'undefined' ? sessionStorage.getItem('pendingInviteCode') : null;

      if (inviteCode) {
        try {
          // Call the redeem-invite endpoint
          const response = await fetch('/api/auth/redeem-invite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ inviteCode }),
            credentials: 'include',
          });

          if (!response.ok) {
            const errorData = await response.json();
            console.error('Failed to redeem invite code:', errorData);
            setError(errorData.message || 'Failed to redeem invite code');
          } else {
            // Clear the stored invite code
            sessionStorage.removeItem('pendingInviteCode');
          }
        } catch (err: any) {
          console.error('Error redeeming invite code:', err);
          setError('An error occurred while redeeming the invite code');
        }
      }

      // NOTE (2026-07-20): claimOrganizerId (Feature #443 claim flow) is intentionally
      // NOT handled here. It's handled once, authoritatively, in _app.tsx's OAuthBridge —
      // which is mounted globally and fires on every page after any OAuth login with a
      // pending oauthProfile, already sequenced correctly (JWT exchange completes first,
      // then the claim call fires with a real Authorization header). An earlier version of
      // this fix added a second, independent claim-oauth call here too, keyed off raw
      // NextAuth session status rather than the app's own auth state — that call could fire
      // (and consume the sessionStorage key) before OAuthBridge's exchange had actually
      // finished, i.e. before valid auth existed for it, racing against the correct handler.
      // Removed rather than synchronized: one authoritative caller is simpler than two
      // coordinated ones.

      // Redirect to dashboard or home
      const redirectTo = router.query.returnTo || '/organizer/dashboard';
      router.push(redirectTo as string);
    };

    redeemInvite();
  }, [status, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900">
      <div className="text-center">
        {error ? (
          <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4 max-w-md">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            <button
              onClick={() => router.push('/')}
              className="mt-4 inline-flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-amber-600 hover:bg-amber-700"
            >
              Go to Home
            </button>
          </div>
        ) : (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto mb-4"></div>
            <p className="text-warm-700 dark:text-warm-300">Finalizing your account setup...</p>
          </>
        )}
      </div>
    </div>
  );
};

export default OAuthCallbackPage;
