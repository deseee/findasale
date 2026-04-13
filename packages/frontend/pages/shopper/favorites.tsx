/**
 * Shopper Favorites Page — REDIRECT
 * Deprecated: functionality moved to /shopper/wishlist
 * This page redirects all traffic to the new unified wishlist page.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/router';

function FavoritesPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/shopper/wishlist');
  }, [router]);

  // Show loading state while redirecting
  return (
    <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900">
      <div className="text-center">
        <p className="text-gray-600 dark:text-gray-400">Redirecting...</p>
      </div>
    </div>
  );
}

export default FavoritesPage;
