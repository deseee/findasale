/**
 * Wishlist Redirect Page
 *
 * Redirects /wishlist to /shopper/wishlist for consistency
 */

import { useEffect } from 'react';
import { useRouter } from 'next/router';

const WishlistPage = () => {
  const router = useRouter();

  useEffect(() => {
    router.push('/shopper/wishlist');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto mb-4"></div>
        <p className="text-gray-600 dark:text-gray-400">Redirecting to your favorites...</p>
      </div>
    </div>
  );
};

export default WishlistPage;
