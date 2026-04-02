/**
 * ShopperCartFAB — Floating Action Button for browsing cart (Phase 1 Smart Cart)
 * Positioned bottom-right, shows item count badge.
 * Only visible when cart has items.
 */

import React from 'react';
import { useShopperCart } from '../hooks/useShopperCart';

interface ShopperCartFABProps {
  onClick: () => void;
}

const ShopperCartFAB: React.FC<ShopperCartFABProps> = ({ onClick }) => {
  const cart = useShopperCart();

  // Don't show if cart is empty
  if (!cart.isHydrated || cart.cartCount === 0) {
    return null;
  }

  return (
    <button
      onClick={onClick}
      className="fixed bottom-20 right-4 inline-flex items-center justify-center p-4 bg-amber-600 hover:bg-amber-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all z-40"
      aria-label={`Shopping cart with ${cart.cartCount} items`}
      title={`${cart.cartCount} item${cart.cartCount !== 1 ? 's' : ''} in cart`}
    >
      {/* Shopping bag SVG */}
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
        />
      </svg>

      {/* Item count badge */}
      <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full">
        {cart.cartCount > 99 ? '99+' : cart.cartCount}
      </span>
    </button>
  );
};

export default ShopperCartFAB;
