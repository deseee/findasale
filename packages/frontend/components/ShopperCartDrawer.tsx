/**
 * ShopperCartDrawer — Browsing cart drawer (Phase 1 Smart Cart)
 * Shows localStorage cart items separate from holds/reservations.
 * Slide-in from right, shows summary and allows removal.
 */

import React from 'react';
import Link from 'next/link';
import { useShopperCart } from '../hooks/useShopperCart';
import { useToast } from './ToastContext';
import { getThumbnailUrl } from '../lib/imageUtils';

interface ShopperCartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  saleName?: string;
}

const ShopperCartDrawer: React.FC<ShopperCartDrawerProps> = ({ isOpen, onClose, saleName = 'Sale' }) => {
  const cart = useShopperCart();
  const { showToast } = useToast();

  const handleRemoveItem = (itemId: string) => {
    cart.removeItem(itemId);
    showToast('Item removed from cart', 'info');
  };

  const handleClearCart = () => {
    if (typeof window !== 'undefined' && window.confirm('Clear your entire cart?')) {
      cart.clearCart();
      showToast('Cart cleared', 'info');
    }
  };

  const handleBackdropClick = () => {
    onClose();
  };

  const handleDrawerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const total = cart.getTotal();

  return (
    <>
      {/* Backdrop overlay — click to close */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity"
          onClick={handleBackdropClick}
          aria-hidden="true"
        />
      )}

      {/* Slide-out drawer from right */}
      <div
        className={`fixed right-0 top-0 h-full w-full max-w-sm bg-white dark:bg-gray-800 shadow-lg z-50 flex flex-col transition-transform duration-300 transform ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        onClick={handleDrawerClick}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-warm-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-warm-900 dark:text-gray-50">Shopping Cart</h2>
            {saleName && <p className="text-xs text-warm-500 dark:text-gray-400 mt-1">{saleName}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md text-warm-600 dark:text-gray-400 hover:text-warm-900 dark:hover:text-gray-200 hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Close cart drawer"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content — scrollable */}
        <div className="flex-1 overflow-y-auto">
          {!cart.isHydrated ? (
            <div className="p-4 text-center text-warm-600 dark:text-gray-400">
              <p>Loading cart…</p>
            </div>
          ) : cart.items.length === 0 ? (
            <div className="p-6 text-center">
              <svg
                className="h-12 w-12 mx-auto text-warm-300 dark:text-gray-600 mb-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                />
              </svg>
              <p className="text-warm-700 dark:text-gray-300 font-medium mb-3">Your cart is empty</p>
              <button
                onClick={onClose}
                className="inline-block text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 font-medium"
              >
                Continue Shopping
              </button>
            </div>
          ) : (
            <div className="divide-y divide-warm-200 dark:divide-gray-700">
              {cart.items.map((item) => (
                <div key={item.id} className="p-4 hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors">
                  {/* Item Thumbnail & Details */}
                  <div className="flex gap-3 mb-3">
                    <div className="flex-shrink-0 w-20">
                      <div className="w-20 h-20 bg-warm-100 dark:bg-gray-700 rounded-lg overflow-hidden flex items-center justify-center">
                        {item.photoUrl ? (
                          <img
                            src={getThumbnailUrl(item.photoUrl)}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-warm-400 dark:text-gray-600 text-xs text-center px-1">No image</span>
                        )}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <h4 className="font-semibold text-warm-900 dark:text-gray-50 line-clamp-2 text-sm">
                          {item.title}
                        </h4>
                        {item.price !== null && (
                          <p className="text-sm font-bold text-amber-700 dark:text-amber-400 mt-1">
                            ${(item.price / 100).toFixed(2)}
                          </p>
                        )}
                        {item.price === null && (
                          <p className="text-sm text-warm-500 dark:text-gray-400 mt-1">Price: N/A</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Remove Button */}
                  <button
                    onClick={() => handleRemoveItem(item.id)}
                    className="w-full text-xs font-medium py-2 px-3 rounded border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer — total price & action buttons */}
        {cart.items.length > 0 && (
          <div className="border-t border-warm-200 dark:border-gray-700 p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-warm-700 dark:text-gray-300 font-medium">Subtotal</span>
              <span className="text-xl font-bold text-amber-700 dark:text-amber-400">
                ${(total / 100).toFixed(2)}
              </span>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              {/* Continue Shopping */}
              <button
                onClick={onClose}
                className="w-full bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 dark:hover:bg-gray-600 text-warm-900 dark:text-gray-50 font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                Continue Shopping
              </button>

              {/* Go to Checkout (TBD) */}
              <button
                onClick={() => {
                  // TODO: Navigate to hold-to-pay flow with pre-selected items
                  showToast('Checkout feature coming soon', 'info');
                }}
                className="w-full bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-800 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                Go to Checkout
              </button>

              {/* Clear Cart */}
              <button
                onClick={handleClearCart}
                className="w-full text-xs font-medium py-2 px-3 rounded border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-gray-300 hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors"
              >
                Clear Cart
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default ShopperCartDrawer;
