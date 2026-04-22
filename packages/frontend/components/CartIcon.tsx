/**
 * CartIcon — Shopping bag icon with combined badge (holds + browsing cart count)
 * Displayed in the nav bar; clicking opens the cart drawer
 * Polls /api/reservations/my-holds-full every 30s to track live hold count
 * Also pulls browsing cart count from useShopperCart hook
 */

import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import api from '../lib/api';
import { useCart } from '../context/CartContext';
import { useAuth } from './AuthContext';
import { useShopperCart } from '../hooks/useShopperCart';

interface Hold {
  id: string;
  expiresAt: string;
  item: {
    id: string;
    title: string;
    price: number | null;
    photoUrls: string[];
    sale: {
      id: string;
      title: string;
    };
  };
}

const CartIcon: React.FC = () => {
  const { user } = useAuth();
  const { openCart, setHoldCount } = useCart();
  const cart = useShopperCart(user?.id);

  const { data: holds = [] } = useQuery({
    queryKey: ['my-holds-full'],
    queryFn: async () => {
      const response = await api.get('/reservations/my-holds-full');
      return response.data as Hold[];
    },
    refetchInterval: 30000, // Poll every 30s
    staleTime: 25000,
  });

  // Update context with live hold count
  useEffect(() => {
    setHoldCount(holds.length);
  }, [holds.length, setHoldCount]);

  const handleClick = () => {
    openCart();
  };

  // Combined count: holds + browsing cart items
  const combinedCount = holds.length + cart.cartCount;
  const badgeLabel = `${holds.length} on hold${holds.length !== 1 ? 's' : ''}, ${cart.cartCount} saved`;

  return (
    <button
      onClick={handleClick}
      className="relative p-2 rounded-md text-warm-600 dark:text-warm-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
      aria-label={`Shopping cart with ${combinedCount} items`}
      title={badgeLabel}
    >
      {/* Clock icon — matches mobile holds icon */}
      <Clock size={22} />

      {/* Combined count badge — only show if > 0 */}
      {combinedCount > 0 && (
        <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white dark:text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 dark:bg-red-700 rounded-full">
          {combinedCount > 99 ? '99+' : combinedCount}
        </span>
      )}
    </button>
  );
};

export default CartIcon;
