/**
 * PostSaleEbayPanel — Post-sale eBay push workflow component
 *
 * Displays unsold items from a completed sale with shipping classification.
 * Allows organizers to select items, set shipping overrides, and push to eBay.
 */

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from './ToastContext';
import { useOrganizerTier } from '../hooks/useOrganizerTier';

interface UnsoldItem {
  id: string;
  title: string;
  price?: number;
  photoUrls: string[];
  category?: string;
  tags: string[];
  ebayListingId?: string;
  ebayShippingClassification: string;
  ebayShippingOverride?: string;
  effectiveShipping: string;
}

interface PostSaleEbayPanelProps {
  saleId: string;
}

type ShippingOverride = 'SHIPPABLE' | 'LOCAL_PICKUP_ONLY' | 'DONT_LIST' | null;

const ShippingBadge: React.FC<{ shipping: string; override?: string }> = ({ shipping, override }) => {
  const effectiveShipping = override || shipping;

  const badgeConfig: Record<string, { bg: string; text: string; label: string }> = {
    SHIPPABLE: { bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-700 dark:text-green-200', label: 'Shippable ✓' },
    HEAVY_OVERSIZED: { bg: 'bg-amber-100 dark:bg-amber-900', text: 'text-amber-700 dark:text-amber-200', label: 'Heavy ⚠' },
    FRAGILE: { bg: 'bg-amber-100 dark:bg-amber-900', text: 'text-amber-700 dark:text-amber-200', label: 'Fragile ⚠' },
    UNKNOWN: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-200', label: 'Classify' },
    LOCAL_PICKUP_ONLY: { bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-700 dark:text-blue-200', label: 'Local Pickup' },
    DONT_LIST: { bg: 'bg-gray-200 dark:bg-gray-600', text: 'text-gray-600 dark:text-gray-300', label: 'Don\'t List' },
  };

  const config = badgeConfig[effectiveShipping] || badgeConfig.UNKNOWN;

  return (
    <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
};

export const PostSaleEbayPanel: React.FC<PostSaleEbayPanelProps> = ({ saleId }) => {
  const { showToast } = useToast();
  const { tier } = useOrganizerTier();
  const queryClient = useQueryClient();

  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [itemOverrides, setItemOverrides] = useState<Record<string, ShippingOverride>>({});

  // Fetch unsold items
  const { data: unsoldData, isLoading, isError } = useQuery({
    queryKey: ['unsold-items', saleId],
    queryFn: async () => {
      const response = await api.get(`/organizer/sales/${saleId}/unsold-items`);
      return response.data as { items: UnsoldItem[] };
    },
  });

  // Mutation for setting shipping override
  const setOverrideMutation = useMutation({
    mutationFn: async ({ itemId, override }: { itemId: string; override: ShippingOverride }) => {
      return api.patch(`/organizer/items/${itemId}/ebay-shipping`, { override });
    },
    onSuccess: (response, variables) => {
      setItemOverrides((prev) => ({
        ...prev,
        [variables.itemId]: variables.override,
      }));
      queryClient.invalidateQueries({ queryKey: ['unsold-items', saleId] });
    },
    onError: () => {
      showToast('Failed to update shipping override', 'error');
    },
  });

  // Mutation for pushing items to eBay
  const pushToEbayMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      return api.post(`/organizer/sales/${saleId}/ebay-push`, {
        itemIds,
        localPickupIds: itemIds.filter(
          (id) => itemOverrides[id] === 'LOCAL_PICKUP_ONLY' || getEffectiveShipping(id) === 'LOCAL_PICKUP_ONLY'
        ),
      });
    },
    onSuccess: (response) => {
      const results = response.data.results || [];
      const successCount = results.filter((r: any) => r.success).length;
      const failureCount = results.length - successCount;

      if (successCount > 0) {
        showToast(`${successCount} item(s) pushed to eBay`, 'success');
      }
      if (failureCount > 0) {
        showToast(`Failed to push ${failureCount} item(s)`, 'error');
      }

      setSelectedItems(new Set());
      queryClient.invalidateQueries({ queryKey: ['unsold-items', saleId] });
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || 'Failed to push items to eBay';
      showToast(msg, 'error');
    },
  });

  const getEffectiveShipping = (itemId: string): string => {
    const item = unsoldData?.items.find((i) => i.id === itemId);
    if (!item) return 'UNKNOWN';
    return itemOverrides[itemId] || item.effectiveShipping;
  };

  const handleShippingChange = (itemId: string, override: ShippingOverride) => {
    setOverrideMutation.mutate({ itemId, override });

    // If setting to DONT_LIST, unselect the item
    if (override === 'DONT_LIST') {
      setSelectedItems((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  const handleItemCheck = (itemId: string, checked: boolean) => {
    const effectiveShipping = getEffectiveShipping(itemId);
    if (effectiveShipping === 'DONT_LIST') {
      showToast('Cannot select items marked "Don\'t List"', 'info');
      return;
    }

    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(itemId);
      } else {
        next.delete(itemId);
      }
      return next;
    });
  };

  const handlePush = () => {
    if (selectedItems.size === 0) {
      showToast('Select at least one item', 'info');
      return;
    }

    if (tier === 'SIMPLE') {
      showToast('eBay selling requires PRO or TEAMS tier', 'error');
      return;
    }

    pushToEbayMutation.mutate(Array.from(selectedItems));
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-200 dark:border-gray-700 p-6 mt-8">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-gray-100 dark:bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-200 dark:border-gray-700 p-6 mt-8">
        <p className="text-red-600 dark:text-red-400">Failed to load unsold items</p>
      </div>
    );
  }

  const items = unsoldData?.items || [];
  const unsoldCount = items.length;
  const alreadyListedCount = items.filter((i) => i.ebayListingId).length;
  const pushableItems = items.filter((i) => !i.ebayListingId);

  if (unsoldCount === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-200 dark:border-gray-700 p-6 mt-8">
        <p className="text-warm-700 dark:text-warm-300 text-center font-semibold">All items sold! Great sale.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-200 dark:border-gray-700 p-6 mt-8">
      {/* Header */}
      <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-2">
        {unsoldCount} item{unsoldCount !== 1 ? 's' : ''} didn't sell — list on eBay?
      </h2>
      {alreadyListedCount > 0 && (
        <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">
          ({alreadyListedCount} already on eBay)
        </p>
      )}

      {/* Items Grid/List */}
      {pushableItems.length > 0 ? (
        <>
          <div className="space-y-3 mb-6">
            {pushableItems.map((item) => {
              const isChecked = selectedItems.has(item.id);
              const effectiveShipping = getEffectiveShipping(item.id);
              const isDontList = effectiveShipping === 'DONT_LIST';

              return (
                <div
                  key={item.id}
                  className={`flex gap-4 p-4 rounded-lg border transition-colors ${
                    isDontList
                      ? 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 opacity-60'
                      : 'bg-warm-50 dark:bg-gray-700 border-warm-200 dark:border-gray-600 hover:bg-warm-100 dark:hover:bg-gray-600'
                  }`}
                >
                  {/* Checkbox */}
                  <div className="flex items-start pt-1">
                    <input
                      type="checkbox"
                      checked={isChecked && !isDontList}
                      disabled={isDontList}
                      onChange={(e) => handleItemCheck(item.id, e.target.checked)}
                      className="w-5 h-5 text-amber-600 dark:text-amber-400 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>

                  {/* Thumbnail */}
                  <div className="w-16 h-16 flex-shrink-0 bg-gray-100 dark:bg-gray-600 rounded overflow-hidden">
                    {item.photoUrls?.[0] && (
                      <img
                        src={item.photoUrls[0]}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>

                  {/* Item Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-warm-900 dark:text-warm-100 line-clamp-2">
                      {item.title}
                    </h3>
                    {item.price && (
                      <p className="text-sm text-amber-700 dark:text-amber-400 font-bold mt-1">
                        ${(item.price / 100).toFixed(2)}
                      </p>
                    )}
                  </div>

                  {/* Shipping Classification + Override */}
                  <div className="flex-shrink-0 flex items-start gap-3 pt-1">
                    <ShippingBadge shipping={item.ebayShippingClassification} override={itemOverrides[item.id]} />

                    {['HEAVY_OVERSIZED', 'FRAGILE', 'UNKNOWN'].includes(item.ebayShippingClassification) && !itemOverrides[item.id] && (
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) {
                            handleShippingChange(item.id, e.target.value as ShippingOverride);
                          }
                        }}
                        className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-500 cursor-pointer"
                      >
                        <option value="">Change...</option>
                        <option value="SHIPPABLE">Shippable</option>
                        <option value="LOCAL_PICKUP_ONLY">Local Pickup</option>
                        <option value="DONT_LIST">Don't List</option>
                      </select>
                    )}

                    {itemOverrides[item.id] && (
                      <button
                        onClick={() => handleShippingChange(item.id, null)}
                        className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors"
                      >
                        ✕ Clear
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Push Button */}
          <button
            onClick={handlePush}
            disabled={selectedItems.size === 0 || pushToEbayMutation.isPending}
            className={`w-full py-3 px-4 rounded-lg font-semibold transition-colors ${
              selectedItems.size === 0 || pushToEbayMutation.isPending
                ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                : 'bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600 text-white'
            }`}
          >
            {pushToEbayMutation.isPending
              ? 'Pushing to eBay...'
              : `Push ${selectedItems.size} Selected to eBay`}
          </button>
        </>
      ) : (
        <p className="text-warm-600 dark:text-warm-400 text-center py-6">
          All items are already listed on eBay
        </p>
      )}
    </div>
  );
};
