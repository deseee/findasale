import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface RecentlyViewedItem {
  id: string;
  title: string;
  photoUrl?: string;
  price?: number;
  viewedAt: number;
}

const RecentlyViewed: React.FC = () => {
  const [items, setItems] = useState<RecentlyViewedItem[]>([]);

  useEffect(() => {
    try {
      const recent = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
      setItems(recent);
    } catch (error) {
      console.error('Failed to load recently viewed items:', error);
    }
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-warm-900">Recently Viewed</h3>
        <Link href="/shopper/wishlist" className="text-sm text-amber-600 hover:text-amber-700">
          View wishlist
        </Link>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {items.map((item) => (
          <Link key={item.id} href={`/items/${item.id}`}>
            <div className="flex-shrink-0 w-24 group">
              <div className="relative w-24 h-24 bg-warm-100 rounded-lg overflow-hidden mb-2">
                {item.photoUrl ? (
                  <img
                    src={item.photoUrl}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-warm-400 text-xs">
                    No photo
                  </div>
                )}
              </div>
              <p className="text-xs text-warm-900 font-medium truncate hover:text-amber-600">
                {item.title}
              </p>
              {item.price != null && (
                <p className="text-xs text-amber-600 font-semibold">
                  ${item.price.toFixed(2)}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default RecentlyViewed;
