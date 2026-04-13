/**
 * CartDrawer — Slide-out cart showing all current holds
 * Displays held items with photo, title, price, sale name, hold expiry countdown
 * Features: remove hold button per item, total price, "Proceed to Pickup" button
 * Animated slide-in from right with backdrop overlay
 */

import React from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from './ToastContext';
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
  const { showToast } = useToast();
  const queryClient = useQueryClient();

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

  const handleRemoveHold = (reservationId: string) => {
    cancelMutation.mutate(reservationId);
  };

  const handleHoldExpiry = (reservationId: string) => {
    refetch();
    showToast('Hold expired', 'info');
  };

  const totalPrice = holds.reduce((sum, hold) => {
    return sum + (hold.item.price || 0);
  }, 0);

  // Backdrop click to close
  const handleBackdropClick = () => {
    onClose();
  };

  // Stop propagation on drawer content click
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
        className={`fixed right-0 top-0 h-full w-full max-w-sm bg-white shadow-lg z-50 flex flex-col transition-transform duration-300 transform ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        onClick={handleDrawerClick}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-warm-200">
          <h2 className="text-xl font-bold text-warm-900">My Holds</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-md text-warm-600 hover:text-warm-900 hover:bg-warm-100 transition-colors"
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
          {isLoading ? (
            <div className="p-4 text-center text-warm-600">
              <p>Loading your holds…</p>
            </div>
          ) : holds.length === 0 ? (
            <div className="p-6 text-center">
              <svg
                className="h-12 w-12 mx-auto text-warm-300 mb-3"
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
              <p className="text-warm-700 font-medium mb-3">No items on hold</p>
              <Link
                href="/sales"
                className="inline-block text-amber-600 hover:text-amber-700 font-medium"
                onClick={onClose}
              >
                Browse Sales
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-warm-200">
              {holds.map((hold) => (
                <div key={hold.id} className="p-4 hover:bg-warm-50 transition-colors">
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
                        className="font-semibold text-warm-900 hover:text-amber-600 line-clamp-2 text-sm"
                      >
                        {hold.item.title}
                      </Link>
                      <p className="text-xs text-warm-500 mt-1">
                        <Link
                          href={`/sales/${hold.item.sale.id}`}
                          className="hover:text-amber-600"
                        >
                          {hold.item.sale.title}
                        </Link>
                      </p>

                      {hold.item.price && (
                        <p className="text-sm font-bold text-amber-700 mt-1">
                          ${(hold.item.price / 100).toFixed(2)}
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
                    className="w-full text-xs font-medium py-2 px-3 rounded border border-red-400 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    {cancelMutation.isPending ? 'Releasing…' : 'Remove Hold'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer — total price & action button */}
        {holds.length > 0 && (
          <div className="border-t border-warm-200 p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-warm-700 font-medium">Total Price</span>
              <span className="text-xl font-bold text-amber-700">
                ${(totalPrice / 100).toFixed(2)}
              </span>
            </div>
            <Link
              href="/shopper/holds"
              onClick={onClose}
              className="block w-full text-center bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              Proceed to Pickup
            </Link>
          </div>
        )}
      </div>
    </>
  );
};

export default CartDrawer;
