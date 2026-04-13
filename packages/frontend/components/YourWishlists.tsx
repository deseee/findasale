import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from './AuthContext';

interface WishlistItem {
  id: string;
  itemId: string;
}

interface Wishlist {
  id: string;
  name: string;
  occasion?: string;
  items: WishlistItem[];
  createdAt: string;
}

const YourWishlists: React.FC = () => {
  const { user } = useAuth();

  const { data: wishlists = [] } = useQuery({
    queryKey: ['wishlists-preview'],
    queryFn: async () => {
      const res = await api.get('/wishlists');
      return res.data as Wishlist[];
    },
    enabled: !!user?.id,
  });

  if (wishlists.length === 0) {
    return null;
  }

  const previewWishlists = wishlists.slice(0, 3);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100">Your Wishlists</h3>
        <Link href="/wishlists" className="text-sm text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300">
          View all
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {previewWishlists.map((wishlist) => (
          <Link key={wishlist.id} href="/wishlists">
            <div className="card dark:bg-gray-700 dark:border-gray-600 p-4 cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-amber-600">
              <h4 className="font-semibold text-warm-900 dark:text-warm-100 mb-1">{wishlist.name}</h4>
              {wishlist.occasion && (
                <p className="text-xs bg-warm-100 dark:bg-gray-600 text-warm-700 dark:text-warm-300 inline-block px-2 py-1 rounded mb-2">
                  {wishlist.occasion}
                </p>
              )}
              <p className="text-sm text-warm-600 dark:text-warm-400">
                {wishlist.items.length} item{wishlist.items.length !== 1 ? 's' : ''}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default YourWishlists;
