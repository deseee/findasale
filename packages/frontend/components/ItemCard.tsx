import React from 'react';
import Link from 'next/link';

interface Item {
  id: string;
  title: string;
  description: string;
  price: number;
  auctionStartPrice: number;
  currentBid: number;
  bidIncrement: number;
  auctionEndTime: string;
  status: string;
  photoUrls: string[];
}

interface ItemCardProps {
  item: Item;
  isAuctionSale: boolean;
}

// Helper function to safely format prices
const formatPrice = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined) return 'N/A';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(num) ? 'N/A' : `$${num.toFixed(2)}`;
};

// Helper function to get minimum next bid
export const getMinimumNextBid = (item: Item): number => {
  if (item.currentBid) {
    return item.currentBid + (item.bidIncrement || 1);
  }
  return item.auctionStartPrice || item.price || 0;
};

const ItemCard: React.FC<ItemCardProps> = ({ item, isAuctionSale }) => {
  // Format time remaining for auction items
  const formatTimeRemaining = (endTime: string | null | undefined): string => {
    if (!endTime) return '';
    
    try {
      const end = new Date(endTime);
      const now = new Date();
      const diff = end.getTime() - now.getTime();
      
      if (diff <= 0) {
        return 'Ended';
      }
      
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      
      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      } else {
        return `${minutes}m`;
      }
    } catch (error) {
      return '';
    }
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      <Link href={`/items/${item.id}`} className="block">
        {item.photoUrls && item.photoUrls.length > 0 ? (
          <img 
            src={item.photoUrls[0]} 
            alt={item.title} 
            className="w-full h-48 object-cover"
          />
        ) : (
          <div className="bg-gray-200 h-48 flex items-center justify-center">
            <img 
              src="/images/placeholder.svg" 
              alt="Placeholder" 
              className="w-16 h-16 text-gray-400"
            />
          </div>
        )}
      </Link>
      <div className="p-4">
        <h3 className="font-bold text-lg mb-2 text-gray-900">{item.title}</h3>
        <p className="text-gray-600 text-sm mb-3 line-clamp-2">{item.description}</p>
        
        {/* Auction-specific UI */}
        {isAuctionSale && item.auctionStartPrice ? (
          <div>
            <div className="flex justify-between items-center mb-2">
              <div>
                <span className="text-sm text-gray-600">Current Bid:</span>
                <span className="font-bold text-blue-600 ml-1">
                  {formatPrice(item.currentBid || item.auctionStartPrice)}
                </span>
              </div>
              {item.auctionEndTime && (
                <div className="text-sm bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                  {formatTimeRemaining(item.auctionEndTime)} left
                </div>
              )}
            </div>
            
            <div className="mb-2">
              <span className="text-sm text-gray-600">
                Min. bid: {formatPrice(getMinimumNextBid(item))}
              </span>
            </div>
            
            {item.status === 'AUCTION_ENDED' && (
              <div className="text-sm text-center py-2 bg-gray-100 rounded text-gray-600">
                Auction ended
              </div>
            )}
            
            {item.status === 'SOLD' && (
              <div className="text-sm text-center py-2 bg-green-100 text-green-800 rounded">
                Item sold
              </div>
            )}
          </div>
        ) : (
          /* Regular sale item */
          <div className="flex justify-between items-center">
            <span className="font-bold text-blue-600">
              {formatPrice(item.price)}
            </span>
            {item.currentBid && (
              <span className="text-sm bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                Current bid: {formatPrice(item.currentBid)}
              </span>
            )}
          </div>
        )}
        
        <div className="mt-2 flex justify-between items-center">
          <span className={`px-2 py-1 rounded text-xs ${
            item.status === 'AVAILABLE' ? 'bg-green-100 text-green-800' :
            item.status === 'SOLD' ? 'bg-red-100 text-red-800' :
            item.status === 'AUCTION_ENDED' ? 'bg-gray-100 text-gray-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {item.status.replace(/_/g, ' ')}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ItemCard;
