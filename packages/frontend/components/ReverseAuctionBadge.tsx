import React from 'react';

interface ReverseAuctionBadgeProps {
  item: {
    title: string;
    price: number;
    reverseAuction: boolean;
    reverseDailyDrop?: number; // in cents
    reverseFloorPrice?: number; // in cents
    reverseStartDate?: string; // ISO date
  };
}

const ReverseAuctionBadge: React.FC<ReverseAuctionBadgeProps> = ({ item }) => {
  if (!item.reverseAuction) {
    return null;
  }

  const dailyDropDollars = (item.reverseDailyDrop || 0) / 100;
  const floorPriceDollars = (item.reverseFloorPrice || 0) / 100;
  const currentPrice = item.price;
  const isAtFloor = currentPrice === floorPriceDollars;

  return (
    <div className="bg-amber-50 border-l-4 border-amber-600 p-4 rounded-lg my-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl">⬇️</span>
        <div className="flex-1">
          {isAtFloor ? (
            <>
              <p className="font-semibold text-amber-900 mb-1">
                📌 Final Price — Won't Drop Further!
              </p>
              <p className="text-sm text-amber-700">
                This item has reached its minimum price: {' '}
                <span className="font-bold">${floorPriceDollars.toFixed(2)}</span>
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold text-amber-900 mb-2">
                Price Drops Daily
              </p>
              <div className="space-y-1 text-sm text-amber-700">
                <p>
                  <span className="font-medium">Current price:</span> {' '}
                  <span className="font-bold text-lg text-amber-600">${currentPrice.toFixed(2)}</span>
                </p>
                <p>
                  <span className="font-medium">Drops:</span> {' '}
                  <span className="font-bold">${dailyDropDollars.toFixed(2)}</span> every day
                </p>
                <p>
                  <span className="font-medium">Floor price:</span> {' '}
                  <span className="font-bold">${floorPriceDollars.toFixed(2)}</span>
                </p>
              </div>
              <p className="text-xs text-amber-600 mt-2 italic">
                ⏰ Price updates daily at 6:00 AM UTC
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReverseAuctionBadge;
