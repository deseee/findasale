/**
 * CartDrawer — Unified drawer showing holds + browsing cart
 * Two sections: "On Hold" (items on hold with timers) and "Saved in Cart" (browsing cart items)
 * Footer shows combined subtotals and primary CTA "Go to Checkout"
 * Animated slide-in from right with backdrop overlay. Full dark mode support.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from './ToastContext';
import { useAuth } from './AuthContext';
import { useShopperCart } from '../hooks/useShopperCart';
import HoldTimer from './HoldTimer';
import { getThumbnailUrl } from '../lib/imageUtils';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Hold {
  id: string;
  expiresAt: string;
  createdAt: string;
  status: string;
  item: {
    id: string;
    title: string;
    price: number | null;
    photoUrls: string[];
    status: string;
    sale: {
      id: string;
      title: string;
    };
  };
}

const CartDrawer: React.FC<CartDrawerProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const cart = useShopperCart(user?.id);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [shareStatus, setShareStatus] = useState<'idle' | 'sharing' | 'shared' | 'error'>('idle');

  const { data: holds = [], isLoading, refetch } = useQuery({
    queryKey: ['my-holds-full'],
    queryFn: async () => {
      const response = await api.get('/reservations/my-holds-full');
      return response.data as Hold[];
    },
    enabled: isOpen,
    refetchInterval: 30000,
  });

  const cancelMutation = useMutation({
    mutationFn: (reservationId: string) => api.delete(`/reservations/${reservationId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-holds-full'] });
      refetch();
      showToast('Hold released', 'success');
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to release hold', 'error');
    },
  });

  const placeHoldMutation = useMutation({
    mutationFn: (cartItem: typeof cart.items[0]) =>
      api.post('/reservations', { itemId: cartItem.id, saleId: cartItem.saleId }),
    onSuccess: (_, cartItem) => {
      cart.removeItem(cartItem.id);
      queryClient.invalidateQueries({ queryKey: ['my-holds-full'] });
      refetch();
      showToast('Item placed on hold', 'success');
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to place hold', 'error');
    },
  });

  const handleRemoveHold = (reservationId: string) => {
    cancelMutation.mutate(reservationId);
  };

  const handleHoldExpiry = (reservationId: string) => {
    refetch();
    showToast('Hold expired', 'info');
  };

  const handlePlaceHold = (cartItem: typeof cart.items[0]) => {
    placeHoldMutation.mutate(cartItem);
  };

  const handleClearCart = () => {
    cart.clearCart();
    showToast('Cart cleared', 'info');
    setConfirmingClear(false);
  };

  const handleShareWithCashier = async () => {
    if (!cart.saleId || cart.cartCount === 0) return;
    setShareStatus('sharing');
    try {
      await api.post('/pos/sessions', {
        saleId: cart.saleId,
        cartItems: cart.items.map(item => ({
          id: item.id,
          title: item.title,
          price: item.price ?? 0,
          photoUrl: item.photoUrl,
          saleId: item.saleId,
        })),
      });
      setShareStatus('shared');
      showToast('Cart shared with cashier', 'success');
    } catch (err) {
      setShareStatus('error');
      showToast('Failed to share cart', 'error');
      console.error('[drawer] Share cart error:', err);
    }
  };

  // Hold prices are stored as dollars in DB; cart items are stored as cents via useShopperCart
  const holdsTotal = holds.reduce((sum, hold) => sum + (hold.item.price || 0), 0); // dollars
  const cartTotalCents = cart.getTotal(); // cents
  const grandTotal = holdsTotal + (cartTotalCents / 100); // unified dollars
  const hasContent = holds.length > 0 || cart.cartCount > 0;

  const handleBackdropClick = () => {
    onClose();
  };

  const handleDrawerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

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
          <h2 className="text-xl font-bold text-warm-900 dark:text-gray-50">My Cart</h2>
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
          {isLoading && cart.cartCount === 0 ? (
            <div className="p-4 text-center text-warm-600 dark:text-gray-400">
              <p>Loading your cart…</p>
            </div>
          ) : holds.length === 0 && cart.cartCount === 0 ? (
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
                className="inline-block text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 font-medium"
              >
                Continue Shopping
              </button>
            </div>
          ) : (
            <div>
              {/* On Hold Section */}
              {holds.length > 0 && (
                <div>
                  <div className="px-4 py-3 bg-warm-50 dark:bg-gray-700 border-b border-warm-200 dark:border-gray-600">
                    <h3 className="text-sm font-semibold text-warm-900 dark:text-gray-50">On Hold ({holds.length})</h3>
                  </div>
                  <div className="divide-y divide-warm-200 dark:divide-gray-700">
                    {holds.map((hold) => (
                      <div key={hold.id} className="p-4 hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors">
                        {/* Item Thumbnail & Details */}
                        <div className="flex gap-3 mb-3">
                          <div className="flex-shrink-0 w-20">
                            <Link href={`/items/${hold.item.id}`}>
                              <img
                                src={
                                  hold.item.photoUrls?.[0]
                                    ? getThumbnailUrl(hold.item.photoUrls[0])
                                    : '/images/placeholder.svg'
                                }
                                alt={hold.item.title}
                                className="w-20 h-20 object-cover rounded-lg hover:opacity-90 transition-opacity"
                              />
                            </Link>
                          </div>

                          <div className="flex-1 min-w-0">
                            <Link
                              href={`/items/${hold.item.id}`}
                              className="font-semibold text-warm-900 dark:text-gray-50 hover:text-amber-600 dark:hover:text-amber-400 line-clamp-2 text-sm"
                            >
                              {hold.item.title}
                            </Link>
                            <p className="text-xs text-warm-500 dark:text-gray-400 mt-1">
                              <Link
                                href={`/sales/${hold.item.sale.id}`}
                                className="hover:text-amber-600 dark:hover:text-amber-400"
                              >
                                {hold.item.sale.title}
                              </Link>
                            </p>

                            {hold.item.price && (
                              <p className="text-sm font-bold text-amber-700 dark:text-amber-400 mt-1">
                                ${hold.item.price.toFixed(2)}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Hold Timer */}
                        <div className="mb-3 text-xs">
                          <HoldTimer
                            expiresAt={hold.expiresAt}
                            onExpiry={() => handleHoldExpiry(hold.id)}
                          />
                        </div>

                        {/* Remove Button */}
                        <button
                          onClick={() => handleRemoveHold(hold.id)}
                          disabled={cancelMutation.isPending}
                          className="w-full text-xs font-medium py-2 px-3 rounded border border-red-400 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                        >
                          {cancelMutation.isPending ? 'Releasing…' : 'Remove Hold'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Saved in Cart Section */}
              {cart.cartCount > 0 && (
                <div>
                  {holds.length > 0 && (
                    <div className="border-t border-warm-200 dark:border-gray-700" />
                  )}
                  <div className="px-4 py-3 bg-warm-50 dark:bg-gray-700 border-b border-warm-200 dark:border-gray-600">
                    <h3 className="text-sm font-semibold text-warm-900 dark:text-gray-50">Saved in Cart ({cart.cartCount})</h3>
                  </div>
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

                        {/* Place Hold + Remove Buttons */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handlePlaceHold(item)}
                            disabled={placeHoldMutation.isPending}
                            className="flex-1 text-xs font-semibold py-2 px-3 rounded bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-800 text-white transition-colors disabled:opacity-50"
                          >
                            {placeHoldMutation.isPending ? 'Placing…' : 'Place Hold'}
                          </button>
                          <button
                            onClick={() => { cart.removeItem(item.id); showToast('Item removed from cart', 'info'); }}
                            className="text-xs font-medium py-2 px-3 rounded border border-red-400 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer — totals & action buttons */}
        {hasContent && (
          <div className="border-t border-warm-200 dark:border-gray-700 p-4 space-y-3">
            {/* Subtotals */}
            {holds.length > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-warm-700 dark:text-gray-300">On Hold</span>
                <span className="font-semibold text-warm-900 dark:text-gray-50">
                  ${holdsTotal.toFixed(2)}
                </span>
              </div>
            )}
            {cart.cartCount > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-warm-700 dark:text-gray-300">Cart Subtotal</span>
                <span className="font-semibold text-warm-900 dark:text-gray-50">
                  ${(cartTotalCents / 100).toFixed(2)}
                </span>
              </div>
            )}

            {/* Grand Total */}
            <div className="flex justify-between items-center border-t border-warm-200 dark:border-gray-700 pt-3">
              <span className="text-warm-700 dark:text-gray-300 font-medium">Total</span>
              <span className="text-xl font-bold text-amber-700 dark:text-amber-400">
                ${grandTotal.toFixed(2)}
              </span>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-2">
              {/* Go to Checkout */}
              <button
                onClick={() => {
                  showToast('Checkout feature coming soon', 'info');
                }}
                className="w-full bg-amber-600 dark:bg-amber-700 hover:bg-amber-700 dark:hover:bg-amber-800 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                Go to Checkout
              </button>

              {/* Share with cashier */}
              {cart.saleId && (
                <button
                  onClick={handleShareWithCashier}
                  disabled={shareStatus === 'sharing'}
                  className="w-full py-3 rounded-xl bg-sage-700 dark:bg-sage-800 text-white font-semibold text-sm hover:bg-sage-800 dark:hover:bg-sage-900 transition disabled:opacity-50"
                >
                  {shareStatus === 'sharing' ? 'Sharing...' : shareStatus === 'shared' ? '✓ Cart shared with cashier' : '🛒 Share cart with cashier'}
                </button>
              )}
              {shareStatus === 'shared' && (
                <p className="text-xs text-center text-warm-500 dark:text-gray-400 mt-1">The organizer can now see your items at checkout</p>
              )}

              {/* Clear Cart */}
              {!confirmingClear ? (
                <button
                  onClick={() => setConfirmingClear(true)}
                  className="w-full text-xs font-medium py-2 px-3 rounded border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-gray-300 hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Clear Cart
                </button>
              ) : (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-medium text-red-800 dark:text-red-300">Clear all saved items from cart?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleClearCart}
                      className="flex-1 text-xs font-semibold py-2 px-3 rounded bg-red-600 dark:bg-red-700 text-white hover:bg-red-700 dark:hover:bg-red-800 transition-colors"
                    >
                      Yes, clear all
                    </button>
                    <button
                      onClick={() => setConfirmingClear(false)}
                      className="flex-1 text-xs font-semibold py-2 px-3 rounded border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-gray-300 hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default CartDrawer;
