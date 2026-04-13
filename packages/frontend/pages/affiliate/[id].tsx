import React from 'react';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

const AffiliateRedirect = () => {
  const router = useRouter();
  const { id } = router.query;

  useEffect(() => {
    if (id) {
      // Store the affiliate ID in sessionStorage for attribution
      sessionStorage.setItem('affiliateRef', String(id));
      // Redirect to home
      router.push('/');
    }
  }, [id, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-warm-600 dark:text-warm-400">Redirecting...</p>
    </div>
  );
};

export default AffiliateRedirect;
