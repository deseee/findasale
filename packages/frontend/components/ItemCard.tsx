import React from 'react';
import Link from 'next/link';
import { getOptimizedUrl } from '../lib/imageUtils';

interface Item {
  id: string;
  title: string;
  description: string;
  estimatedValue: number;
  currentBid: number;
  status: string;
  auctionEndTime?: string;
  photoUrl?: string;
}

interface ItemCardProps {
  item: Item;
}

const ItemCard: React.FC<ItemCardProps> = ({ item }) => {
  // Auction countdown timer
  const getCountdownText = (): string => {
    if (!item.auctionEndTime) return 'Not active';
    const endTime = new Date(item.auctionEndTime).getTime();
    const now = Date.now();
    const diff = endTime - now;

    if (diff <= 0) return 'Ended';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}d ${hours}h left`;
    if (hours > 0) return `${hours}h ${minutes}m left`;
    return `${minutes}m left`;
  };

  // Price formatting
  const formatPrice = (price: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
  };

  // Status badge
  const getStatusColor = (): string => {
    switch (item.status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-800';
      case 'SOLD':
        return 'bg-warm-100 text-warm-800';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-amber-100 text-amber-800';
    }
  };

  return (
    <Link href={`/items/${item.id}`}>
      <div className="card overflow-hidden hover:shadow-card-hover transition-shadow">
        {item.photoUrl ? (
          <img src={getOptimizedUrl(item.photoUrl)} alt={item.title} className="w-full h-48 object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-48 bg-warm-200 flex items-center justify-center">
            <span className="text-warm-400">No image</span>
          </div>
        )}
        <div className="p-4">
          <h3 className="text-lg font-semibold text-warm-900 mb-1">{item.title}</h3>
          <p className="text-sm text-warm-600 mb-3 line-clamp-2">{item.description}</p>

          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-warm-500">Current Bid</p>
              <p className="text-lg font-bold text-warm-900">{formatPrice(item.currentBid)}</p>
            </div>
            <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor()}`}>
              {item.status}
            </span>
          </div>

          <div className="pt-2 border-t border-warm-200">
            <p className="text-xs text-orange-600 font-semibold">{getCountdownText()}</p>
          </div>
        </div>
      </div>
    </Link>
  );
};

export default ItemCard;
