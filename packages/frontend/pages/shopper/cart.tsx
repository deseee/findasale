/**
 * Shopper Cart Redirect
 * Route: /shopper/cart
 * 
 * The cart is implemented as a sidebar/drawer triggered from the navbar.
 * This page redirects users to /shopper/dashboard where the cart is available.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/router';

const ShopperCartRedirect = () => {
  const router = useRouter();

  useEffect(() => {
    router.push('/shopper/dashboard');
  }, [router]);

  return null;
};

export default ShopperCartRedirect;
