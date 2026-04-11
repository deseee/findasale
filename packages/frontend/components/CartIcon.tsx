/**
 * CartIcon — Shopping bag icon with live hold count badge
 * Displayed in the nav bar; clicking opens the cart drawer
 * Polls /api/reservations/my-holds-full every 30s to track live hold count
 */

import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import api from '../lib/api';
import { useCart } from '../context/CartContext';

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
  const { openCart, setHoldCount } = useCart();

  const { data: holds = [] } = useQuery({
    queryKey: ['my-holds-full'],
    queryFn: async () => {
      const response = await api.get('/reservations/my-holds-full');
      return response.data as Hold[];
    },
    refetchInterval: 30000, // Poll every 30s
    staleTime: 25000,
  });

  // Update context with live count
  useEffect(() => {
    setHoldCount(holds.length);
  }, [holds.length, setHoldCount]);

  const handleClick = () => {
    openCart();
  };

  return (
    <button
      onClick={handleClick}
      className="relative p-2 rounded-md text-warm-600 dark:text-warm-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
      aria-label={`Shopping cart with ${holds.length} items`}
      title={`${holds.length} item${holds.length !== 1 ? 's' : ''} on hold`}
    >
      {/* Clock icon — matches mobile holds icon */}
      <Clock size={22} />

      {/* Hold count badge — only show if > 0 */}
      {holds.length > 0 && (
        <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white dark:text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 dark:bg-red-700 rounded-full">
          {holds.length > 99 ? '99+' : holds.length}
        </span>
      )}
    </button>
  );
};

export default CartIcon;
