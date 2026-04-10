import React from 'react';

interface BidEntry {
  id: string;
  bidAmount: number;
  bidderLabel: string;
  status: string;
  timestamp: string;
}

interface BidHistoryProps {
  bids: BidEntry[];
}

export default function BidHistory({ bids }: BidHistoryProps) {
  if (!bids || bids.length === 0) {
    return (
      <div className="text-sm text-warm-400 dark:text-warm-500 italic">
        No bids yet. Be the first!
      </div>
    );
  }

  return (
    <div className="mt-6 border-t border-warm-200 dark:border-warm-700 pt-4">
      <h3 className="text-sm font-semibold text-warm-800 dark:text-warm-200 mb-3">
        Bid History ({bids.length})
      </h3>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {bids.map((bid) => (
          <div key={bid.id} className="flex justify-between items-center text-sm">
            <span className="text-warm-600 dark:text-warm-400">
              {bid.bidderLabel}
              {bid.status === 'WINNING' && (
                <span className="ml-2 text-xs font-bold text-green-600 dark:text-green-400">
                  ✓ Winning
                </span>
              )}
            </span>
            <span className="font-medium text-warm-900 dark:text-warm-100">
              ${bid.bidAmount.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
