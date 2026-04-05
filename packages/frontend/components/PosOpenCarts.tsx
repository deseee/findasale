'use client';

import React, { useState } from 'react';

interface LinkedCart {
  id: string;
  shopperName: string;
  cartItems: Array<{ id: string; title: string; price: number; photoUrl?: string; saleId: string }>;
  cartTotal: number;
  createdAt: string;
}

interface PosOpenCartsProps {
  linkedCarts: LinkedCart[];
  onPullCart: (sessionId: string, cartItems: LinkedCart['cartItems']) => void;
}

// Helper: Calculate relative time ("2 min ago", "1 hour ago", etc.)
function getTimeAgo(createdAt: string): string {
  const now = new Date();
  const created = new Date(createdAt);
  const seconds = Math.floor((now.getTime() - created.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

// Cart card component (expandable)
function CartCard({
  cart,
  onPullCart,
}: {
  cart: LinkedCart;
  onPullCart: (sessionId: string, cartItems: LinkedCart['cartItems']) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className="rounded-lg bg-warm-50 dark:bg-gray-700 border border-warm-200 dark:border-gray-600 p-4 mb-3 cursor-pointer transition-all"
      onClick={() => setIsExpanded(!isExpanded)}
    >
      {/* Header: collapsed view */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex-1">
          <p className="text-sm font-semibold text-warm-900 dark:text-warm-100">
            {cart.shopperName}
          </p>
          <p className="text-xs text-warm-700 dark:text-warm-300 mt-1">
            {cart.cartItems.length} item{cart.cartItems.length !== 1 ? 's' : ''} · Added{' '}
            {getTimeAgo(cart.createdAt)}
          </p>
        </div>
        <div className="text-right ml-4">
          <p className="text-sm font-semibold text-sage-700 dark:text-sage-300">
            ${cart.cartTotal.toFixed(2)}
          </p>
          <p className="text-xs text-warm-600 dark:text-warm-400 mt-1">
            {isExpanded ? '▼' : '▶'}
          </p>
        </div>
      </div>

      {/* Expanded: item list */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-warm-200 dark:border-gray-600">
          <ul className="space-y-2 mb-4">
            {cart.cartItems.map(item => (
              <li key={item.id} className="flex items-start gap-2">
                {/* Item photo thumbnail */}
                {item.photoUrl && (
                  <img
                    src={item.photoUrl}
                    alt={item.title}
                    className="w-6 h-6 rounded object-cover flex-shrink-0 mt-0.5"
                  />
                )}
                {/* Item name & price */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-warm-900 dark:text-warm-100 truncate">
                    {item.title}
                  </p>
                </div>
                <p className="text-xs font-semibold text-sage-700 dark:text-sage-300 flex-shrink-0">
                  ${item.price.toFixed(2)}
                </p>
              </li>
            ))}
          </ul>

          {/* Pull Cart button */}
          <button
            onClick={e => {
              e.stopPropagation();
              onPullCart(cart.id, cart.cartItems);
            }}
            className="w-full px-4 py-2 rounded-lg bg-sage-700 dark:bg-sage-600 text-white dark:text-gray-100 text-sm font-semibold hover:bg-sage-800 dark:hover:bg-sage-500 transition-colors"
          >
            Pull Cart to POS
          </button>
        </div>
      )}
    </div>
  );
}

// Main component
export function PosOpenCarts({ linkedCarts, onPullCart }: PosOpenCartsProps) {
  // Empty state
  if (linkedCarts.length === 0) {
    return (
      <div className="mb-4 p-4 rounded-xl bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-warm-900 dark:text-warm-100 mb-2">
          Open Carts
        </h3>
        <p className="text-xs text-warm-600 dark:text-warm-400">
          Waiting for shoppers to share their carts. They can share from the cart drawer in the
          FindA.Sale app.
        </p>
      </div>
    );
  }

  // With carts
  return (
    <div className="mb-4 p-4 rounded-xl bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-warm-900 dark:text-warm-100 mb-1">
          Open Carts
        </h3>
        <p className="text-xs text-warm-600 dark:text-warm-400">
          {linkedCarts.length} shopper{linkedCarts.length !== 1 ? 's' : ''} browsing
        </p>
      </div>

      {/* Cart list */}
      <div>
        {linkedCarts.map(cart => (
          <CartCard key={cart.id} cart={cart} onPullCart={onPullCart} />
        ))}
      </div>
    </div>
  );
}

export default PosOpenCarts;
