/**
 * High-Value Item Tracker Widget — Feature #232
 * Compact item list with photo thumbnails, inline status buttons, threshold display
 */
import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from './ToastContext';
import Tooltip from './Tooltip';

interface HighValueTrackerWidgetProps {
  saleId: string;
}

interface HighValueItem {
  id: string;
  title: string;
  photoUrls: string[];
  price: number | null;
  status: string;
  isHighValue: boolean;
  highValueThreshold: number | null;
  highValueSource?: string;
  isHighValueLocked?: boolean;
}

export default function HighValueTrackerWidget({ saleId }: HighValueTrackerWidgetProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: items, isLoading, isError } = useQuery<HighValueItem[]>({
    queryKey: ['high-value-items', saleId],
    queryFn: async () => {
      const res = await api.get(`/items?saleId=${saleId}`);
      // Filter to high-value items only
      return (res.data.items || res.data || []).filter((item: any) => item.isHighValue);
    },
    enabled: !!saleId,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ itemId, isHighValue }: { itemId: string; isHighValue: boolean }) =>
      api.patch(`/items/${itemId}/high-value`, { isHighValue }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['high-value-items', saleId] });
      showToast('Item updated', 'success');
    },
  });

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 animate-pulse">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-36 mb-3" />
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-12 bg-gray-200 dark:bg-gray-700 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !items || items.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">High-Value Items</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No high-value items flagged yet. Mark valuable pieces from your inventory to track them here.
        </p>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SOLD':
        return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">Sold</span>;
      case 'RESERVED':
        return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">Reserved</span>;
      default:
        return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">Available</span>;
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          High-Value Items ({items.length})
        </h3>
        <Tooltip content="Items flagged as high-value based on category or estimated price. These attract serious buyers and deserve priority photos." position="top" />
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto">
        {items.slice(0, 5).map((item) => (
          <div key={item.id} className="flex items-center gap-3 py-1">
            {/* Thumbnail */}
            <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 overflow-hidden flex-shrink-0">
              {item.photoUrls?.[0] ? (
                <img src={item.photoUrls[0]} alt={item.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">No img</div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 mb-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.title}</p>
                {/* Feature #371: Auto-flag source indicator */}
                {item.highValueSource === 'AUTO' && (
                  <span title="Auto-flagged by AI" className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 whitespace-nowrap">
                    Auto
                  </span>
                )}
                {item.isHighValueLocked && !item.isHighValue && (
                  <span title="Auto-flag locked off by organizer" className="text-xs text-gray-400">
                    🔒
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {item.price != null ? `$${item.price.toFixed(2)}` : 'No price'}
                {item.highValueThreshold != null && (
                  <span className="ml-1">(threshold: ${Number(item.highValueThreshold).toFixed(0)})</span>
                )}
              </p>
            </div>

            {/* Status badge */}
            {getStatusBadge(item.status)}

            {/* Unflag button */}
            <button
              onClick={() => toggleMutation.mutate({ itemId: item.id, isHighValue: false })}
              className="text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-1"
              title="Remove from high-value tracking"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {items.length > 5 && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
          +{items.length - 5} more items
        </p>
      )}
    </div>
  );
}
