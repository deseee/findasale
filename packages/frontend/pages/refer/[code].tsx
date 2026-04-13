// Phase 23: Referral link landing page
// /refer/[code] → stores code in localStorage, redirects to /register?ref=CODE

import React, { useEffect } from 'react';
import { useRouter } from 'next/router';

const ReferPage = () => {
  const router = useRouter();
  const { code } = router.query;

  useEffect(() => {
    if (!code) return;
    // Persist so the registration form stays pre-filled even if the user
    // navigates away before completing signup
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('pendingReferralCode', String(code));
      } catch {
        // localStorage may be blocked (private browsing)
      }
    }
    router.replace(`/register?ref=${code}`);
  }, [code, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900">
      <p className="text-warm-600 dark:text-warm-400">Just a moment…</p>
    </div>
  );
};

export default ReferPage;
